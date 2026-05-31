// Slice 539: Halfling Luck — save + ability-check d20 site wiring.
//
// Completes the slice-538 partial primitive by wiring the reroll-on-
// natural-1 mechanic at the two remaining major D20 Test sites:
//   - Saving throws via _save-roll.ts's rollSaveAgainstDC (used by
//     spell saves, monster on-hit save riders, breath weapons,
//     recurring saves, etc.).
//   - planSave + planAbilityCheck in checks.ts (the direct save +
//     check planners).
//
// Both SaveResult and AbilityCheckResult gain a `hasHalflingLuck`
// flag surfaced from the bearer's effect stack; each d20 site reads
// the flag and rerolls when the chosen d20 is a natural 1.
//
// RAW deferrals (cohort-sweep follow-up):
//   - ~25 other d20 sites (initiative, death-save, concentration
//     CON saves, nimble-escape DEX, cunning-action Hide, etc.)
//     still need the same one-block insertion. Each is a small
//     mechanical addition; a future sweep slice handles them.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent, AbilityCheckRolledEvent } from '../../../src/schemas/events/checks.js';
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

describe('Halfling Luck save + check wire (slice 539)', () => {
  it('SaveResult.hasHalflingLuck = true for a halfling', () => {
    const halfling = buildHalfling();
    const sr = computeSavingThrow({
      character: halfling,
      itemInstances: {},
      content: CONTENT,
      ability: 'DEX',
    });
    expect(sr.hasHalflingLuck).toBe(true);
  });

  it('SaveResult.hasHalflingLuck = false for a human (control)', () => {
    const human = buildHuman();
    const sr = computeSavingThrow({
      character: human,
      itemInstances: {},
      content: CONTENT,
      ability: 'DEX',
    });
    expect(sr.hasHalflingLuck).toBe(false);
  });

  it('AbilityCheckResult.hasHalflingLuck = true for a halfling', () => {
    const halfling = buildHalfling();
    const ar = computeAbilityCheck({
      character: halfling,
      itemInstances: {},
      content: CONTENT,
      ability: 'DEX',
    });
    expect(ar.hasHalflingLuck).toBe(true);
  });

  it('AbilityCheckResult.hasHalflingLuck = false for a human (control)', () => {
    const human = buildHuman();
    const ar = computeAbilityCheck({
      character: human,
      itemInstances: {},
      content: CONTENT,
      ability: 'DEX',
    });
    expect(ar.hasHalflingLuck).toBe(false);
  });

  it("end-to-end: a halfling's saving throw with an initial natural 1 rerolls the d20", () => {
    const halfling = buildHalfling();
    for (let seed = 1; seed < 300; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let camp: Campaign = engine.createCampaign({ name: `save-halfling-${seed}` });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: halfling } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.save(camp.state, {
        characterId: halfling.id,
        ability: 'DEX',
        dc: 15,
      }).events;
      const sr = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (!sr) continue;
      if (sr.d20[0] === 1) {
        expect(sr.d20.length).toBeGreaterThanOrEqual(2);
        // Total reflects the reroll, not the natural 1.
        expect(sr.total).toBe((sr.d20[1] ?? 0) + sr.bonus);
        return;
      }
    }
    throw new Error('no seed in 1..300 produced an initial d20 = 1 for halfling save');
  });

  it("end-to-end control: a human's saving throw with a natural 1 does NOT reroll", () => {
    const human = buildHuman();
    for (let seed = 1; seed < 300; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let camp: Campaign = engine.createCampaign({ name: `save-human-${seed}` });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.save(camp.state, {
        characterId: human.id,
        ability: 'DEX',
        dc: 15,
      }).events;
      const sr = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (!sr) continue;
      if (sr.d20[0] === 1) {
        // No reroll: d20 array length 1, total = 1 + bonus.
        expect(sr.d20).toHaveLength(1);
        return;
      }
    }
    throw new Error('no seed in 1..300 produced an initial d20 = 1 for human save');
  });

  it("end-to-end: a halfling's ability check with an initial natural 1 rerolls the d20", () => {
    const halfling = buildHalfling();
    for (let seed = 1; seed < 300; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let camp: Campaign = engine.createCampaign({ name: `check-halfling-${seed}` });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: halfling } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.abilityCheck(camp.state, {
        characterId: halfling.id,
        ability: 'DEX',
        dc: 15,
      }).events;
      const ar = events.find((e) => e.type === 'AbilityCheckRolled') as AbilityCheckRolledEvent | undefined;
      if (!ar) continue;
      if (ar.d20[0] === 1) {
        expect(ar.d20.length).toBeGreaterThanOrEqual(2);
        expect(ar.total).toBe((ar.d20[1] ?? 0) + ar.bonus);
        return;
      }
    }
    throw new Error('no seed in 1..300 produced an initial d20 = 1 for halfling check');
  });
});
