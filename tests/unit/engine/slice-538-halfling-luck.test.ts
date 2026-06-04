// Slice 538: Halfling Luck (marker + accessor + attack-roll site wiring).
//
// RAW (SRD 5.2.1 Halfling): "Luck. When you roll a 1 on the d20 of
// a D20 Test, you can reroll the die, and you must use the new roll."
//
// This slice ships the marker effect kind + the EffectAccumulator
// accessor + the canonical-user wire at the main attack-roll site
// (src/engine/plan/attack.ts ~line 884). The reroll fires when the
// chosen d20 (post-advantage/disadvantage selection) is a natural 1
// AND the attacker carries the GrantHalflingLuck marker. The reroll
// is appended to the `d20` array on the event so consumers can see
// it happened.
//
// Documented RAW deferrals (follow-up slices):
//   - Save d20 sites (rollSaveAgainstDC + computeSavingThrow): not
//     yet wired. A Halfling making a saving throw with a natural-1
//     d20 does not yet reroll. Same pattern as this slice; just
//     needs the helper at each save site.
//   - Ability check d20 sites (computeAbilityCheck + planAbilityCheck):
//     same shape, not yet wired.
//   - Initiative + death-save + concentration + nimble-escape +
//     cunning-action + reactive-spell + offhand + weapon-mastery + trap
//     + transformations + reactive-spells + encounter d20 sites:
//     ~25 additional sites across the codebase. Each is the same
//     one-block insertion; a future cohort slice can sweep them.
//
// Mirror-image deflection rolls (attack.ts ~line 115) are NOT
// wired — RAW doesn't grant Halfling Luck on the mirror-image
// deflection sub-roll; that's a defender-side roll the attacker's
// Luck wouldn't affect anyway.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import type { ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHalfling = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pip',
    speciesId: 'halfling',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const buildHuman = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aria',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
    armorClass: 10,
  });

describe('Halfling Luck (slice 538)', () => {
  it('the halfling species ships the GrantHalflingLuck marker', () => {
    const sp = PACK.species.find((s) => s.id === 'halfling')!;
    const trait = sp.traits.find((t) => t.kind === 'GrantHalflingLuck');
    expect(trait).toBeDefined();
  });

  it("a halfling's effect stack projects hasHalflingLuck = true", () => {
    const halfling = buildHalfling();
    const acc = buildEffectStack({
      character: halfling,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: undefined,
    });
    expect(acc.hasHalflingLuck()).toBe(true);
  });

  it("a human's effect stack projects hasHalflingLuck = false (control)", () => {
    const human = buildHuman();
    const acc = buildEffectStack({
      character: human,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: undefined,
    });
    expect(acc.hasHalflingLuck()).toBe(false);
  });

  it("end-to-end: when a halfling's attack rolls a natural 1, the d20 is rerolled and the new value used", () => {
    // Iterate seeds until we find one where the initial d20 is a 1.
    const halfling = buildHalfling();
    const target = buildTarget();
    const club: ItemInstance = {
      id: newItemInstanceId(),
      definitionId: 'club',
      quantity: 1,
      attuned: false,
      identifiedByCharacterIds: [],
    };
    for (let seed = 1; seed < 200; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let camp: Campaign = engine.createCampaign({ name: `halfling-${seed}` });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: halfling } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club, characterId: halfling.id },
      ]);
      const events = engine.plan.attack(camp.state, {
        attackerId: halfling.id,
        targetId: target.id,
        weaponInstanceId: club.id,
      }).events;
      const ar = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (!ar) continue;
      if (ar.d20[0] === 1) {
        expect(ar.d20.length).toBeGreaterThanOrEqual(2);
        // RAW: "you must use the new roll." The used d20 is the reroll
        // (d20[1]). Total reflects the reroll, not the natural 1.
        const usedRoll = ar.d20[1]!;
        expect(ar.total).toBe(usedRoll + ar.attackBonus);
        return;
      }
    }
    throw new Error('no seed in 1..200 produced an initial d20 = 1 for halfling');
  });

  it("end-to-end control: a non-halfling attacker shows no reroll on natural 1", () => {
    const human = buildHuman();
    const target = buildTarget();
    const club: ItemInstance = {
      id: newItemInstanceId(),
      definitionId: 'club',
      quantity: 1,
      attuned: false,
      identifiedByCharacterIds: [],
    };
    for (let seed = 1; seed < 200; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let camp: Campaign = engine.createCampaign({ name: `human-${seed}` });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club, characterId: human.id },
      ]);
      const events = engine.plan.attack(camp.state, {
        attackerId: human.id,
        targetId: target.id,
        weaponInstanceId: club.id,
      }).events;
      const ar = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (!ar) continue;
      if (ar.d20[0] === 1) {
        // No reroll: d20 array length is 1, total = 1 + attackBonus.
        expect(ar.d20).toHaveLength(1);
        return;
      }
    }
    throw new Error('no seed in 1..200 produced an initial d20 = 1 for human control');
  });
});
