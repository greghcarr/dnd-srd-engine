// Slice 446: Wolf + Dire Wolf knock-prone-on-hit (size-gated).
//
// RAW (SRD 5.2.1):
//   Wolf Bite — "If the target is a Medium or smaller creature, it has
//     the Prone condition."
//   Dire Wolf Bite — "If the target is a Large or smaller creature, it
//     has the Prone condition."
//
// Exercises the new `target.creatureSize` predicate fact on the onHit
// rider (slice 446) paired with the slice-321 unconditional
// `applyConditionId` rider. The Prone application is unconditional
// (no save) but gated on the predicate against the target's size.
//
// Three cases per weapon: Medium target (always proned), Large target
// (proned by Dire Wolf but not by Wolf), Huge target (not proned by
// either). Each case uses a seed-search to find a hit so the prone
// arm exercises.

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
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildBeast = (statblockId: 'wolf' | 'dire-wolf', name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name,
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId,
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6 },
    hp: { current: 22, max: 22, temp: 0 },
  });

// Builds a target with a chosen species so the size-derive returns the
// expected size. SRD species sizes: halfling=Small, human=Medium,
// goliath=Medium (in SRD species set), no Large PC species, so for
// Large/Huge we attach a statblockId pointing at an in-pack monster
// of that size (treants are Huge, etc.).
const buildSmallTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Halfling',
    speciesId: 'halfling',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const buildMediumTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Human',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const buildLargeTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Dire Wolf (target)',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'dire-wolf',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 17, DEX: 15, CON: 15, INT: 3, WIS: 12, CHA: 7 },
    hp: { current: 80, max: 80, temp: 0 },
  });

const buildHugeTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Treant',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'treant',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 23, DEX: 8, CON: 21, INT: 12, WIS: 16, CHA: 12 },
    hp: { current: 138, max: 138, temp: 0 },
  });

interface RunResult {
  attempts: number;
  hitFound: boolean;
  proneApplied: boolean;
}

const runAttackSeedSearch = (
  beastStatblock: 'wolf' | 'dire-wolf',
  weaponId: 'wolf-bite' | 'dire-wolf-bite',
  target: Character,
  seedOffset: number,
): RunResult => {
  let attempt = 0;
  while (attempt < 80) {
    attempt += 1;
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt + seedOffset) });
    const bite = makeItemInstance(weaponId);
    const beast = buildBeast(beastStatblock, beastStatblock === 'wolf' ? 'Wolf' : 'Dire Wolf');
    let campaign = engine.createCampaign({ name: `${weaponId}-vs-${target.name}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: beast,
      } satisfies CharacterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: target,
      } satisfies CharacterCreatedEvent,
    ]);

    const events = engine.plan.attack(campaign.state, {
      attackerId: beast.id,
      targetId: target.id,
      weaponInstanceId: bite.id,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
    if (attack?.hit !== true) continue;

    const proneApplied = events.some(
      (e) =>
        e.type === 'ConditionApplied' &&
        (e as ConditionAppliedEvent).conditionId === 'prone' &&
        (e as ConditionAppliedEvent).targetId === target.id,
    );
    return { attempts: attempt, hitFound: true, proneApplied };
  }
  return { attempts: attempt, hitFound: false, proneApplied: false };
};

describe('Wolf + Dire Wolf knock-prone (slice 446)', () => {
  it('Wolf Bite hit on a Small target applies Prone (Small <= Medium)', () => {
    const r = runAttackSeedSearch('wolf', 'wolf-bite', buildSmallTarget(), 0);
    expect(r.hitFound, `no hit in ${r.attempts} seeds`).toBe(true);
    expect(r.proneApplied).toBe(true);
  });

  it('Wolf Bite hit on a Medium target applies Prone', () => {
    const r = runAttackSeedSearch('wolf', 'wolf-bite', buildMediumTarget(), 100);
    expect(r.hitFound, `no hit in ${r.attempts} seeds`).toBe(true);
    expect(r.proneApplied).toBe(true);
  });

  it('Wolf Bite hit on a Large target does NOT apply Prone (RAW gate: Medium or smaller)', () => {
    const r = runAttackSeedSearch('wolf', 'wolf-bite', buildLargeTarget(), 200);
    expect(r.hitFound, `no hit in ${r.attempts} seeds`).toBe(true);
    expect(r.proneApplied).toBe(false);
  });

  it('Dire Wolf Bite hit on a Large target DOES apply Prone (RAW gate: Large or smaller)', () => {
    const r = runAttackSeedSearch('dire-wolf', 'dire-wolf-bite', buildLargeTarget(), 300);
    expect(r.hitFound, `no hit in ${r.attempts} seeds`).toBe(true);
    expect(r.proneApplied).toBe(true);
  });

  it('Dire Wolf Bite hit on a Huge target does NOT apply Prone', () => {
    const r = runAttackSeedSearch('dire-wolf', 'dire-wolf-bite', buildHugeTarget(), 400);
    expect(r.hitFound, `no hit in ${r.attempts} seeds`).toBe(true);
    expect(r.proneApplied).toBe(false);
  });
});
