// Slice 451: Sunlight Sensitivity on Kobold Warrior.
//
// RAW (SRD 5.2.1 Kobold Warrior): "While in sunlight, the kobold has
// Disadvantage on ability checks and attack rolls."
//
// Reuses slice 279's `bearer.lightLevel` consumer-coordinated fact
// (originally on ComputeAbilityCheckInput only). Slice 451 added the
// same fact to AttackIntent + ResolveAttackInput so the attack-roll
// arm has a fact source. Opt-in: undefined lightLevel produces no
// disadvantage (matches "not in sunlight" / "consumer doesn't model
// light").

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { resolveContent } from '../../../src/content/pack.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildKobold = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Kobold',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'kobold-warrior',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 7, DEX: 15, CON: 9, INT: 8, WIS: 7, CHA: 8 },
    hp: { current: 7, max: 7, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const runAttack = (lightLevel?: 'bright' | 'dim' | 'darkness'): AttackRolledEvent => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(42) });
  const dagger = makeItemInstance('dagger');
  const kobold = buildKobold();
  const target = buildTarget();
  let campaign = engine.createCampaign({ name: `sun-${lightLevel ?? 'undef'}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: kobold } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.attack(campaign.state, {
    attackerId: kobold.id,
    targetId: target.id,
    weaponInstanceId: dagger.id,
    ...(lightLevel !== undefined ? { lightLevel } : {}),
  }).events;
  return events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent;
};

describe('Sunlight Sensitivity on Kobold Warrior (slice 451)', () => {
  it("kobold attack in 'bright' light rolls with disadvantage", () => {
    const r = runAttack('bright');
    expect(r.used).toBe('disadvantage');
    expect(r.d20.length).toBe(2);
  });

  it("kobold attack in 'dim' light rolls normally", () => {
    const r = runAttack('dim');
    expect(r.used).toBe('none');
    expect(r.d20.length).toBe(1);
  });

  it("kobold attack in 'darkness' rolls normally", () => {
    const r = runAttack('darkness');
    expect(r.used).toBe('none');
    expect(r.d20.length).toBe(1);
  });

  it('kobold attack with no lightLevel passed rolls normally (opt-in default)', () => {
    const r = runAttack(undefined);
    expect(r.used).toBe('none');
    expect(r.d20.length).toBe(1);
  });

  it("kobold ability check in 'bright' light has disadvantage (slice-279 path, unchanged)", () => {
    // Re-confirms the check-side arm (originally slice 279's
    // Cloak-of-the-Bat path) still works for Kobold's
    // check-disadvantage arm using the same `bearer.lightLevel` fact.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const kobold = buildKobold();
    let campaign = engine.createCampaign({ name: 'check' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: kobold } satisfies CharacterCreatedEvent,
    ]);
    const character = campaign.state.characters[kobold.id]!;
    const check = computeAbilityCheck({
      character,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'STR',
      lightLevel: 'bright',
    });
    expect(check.hasDisadvantage).toBe(true);
    expect(check.hasAdvantage).toBe(false);
    const checkDim = computeAbilityCheck({
      character,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'STR',
      lightLevel: 'dim',
    });
    expect(checkDim.hasDisadvantage).toBe(false);
  });
});
