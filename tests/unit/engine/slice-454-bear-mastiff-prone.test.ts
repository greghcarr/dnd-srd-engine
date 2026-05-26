// Slice 454: Brown Bear Claw + Mastiff Bite knock-prone-on-hit.
//
// RAW (SRD 5.2.1):
//   Brown Bear Claw — "Hit: 5 (1d4 + 3) Slashing damage. If the
//     target is a Large or smaller creature, it has the Prone
//     condition."
//   Mastiff Bite — "Hit: 4 (1d6 + 1) Piercing damage. If the target
//     is a Medium or smaller creature, it has the Prone condition."
//
// Same slice-446 size-gated onHit Prone shape used by Wolf Bite /
// Dire Wolf Bite. Pure content slice; no engine work.

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

const buildBeast = (statblockId: 'brown-bear' | 'mastiff', STR: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: statblockId,
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId,
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR, DEX: 12, CON: 14, INT: 2, WIS: 12, CHA: 6 },
    hp: { current: 22, max: 22, temp: 0 },
  });

const buildSizedTarget = (size: 'human' | 'dire-wolf' | 'treant', statblockId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: size,
    speciesId: size === 'human' ? 'human' : 'companion',
    backgroundId: size === 'human' ? 'soldier' : 'companion',
    ...(statblockId ? { statblockId } : {}),
    classes: [{ classId: size === 'human' ? 'fighter' : 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const runAttack = (
  statblockId: 'brown-bear' | 'mastiff',
  STR: number,
  weaponId: 'brown-bear-claw' | 'mastiff-bite',
  target: Character,
  seedOffset: number,
): { hit: boolean; prone: boolean } => {
  let attempt = 0;
  while (attempt < 80) {
    attempt += 1;
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt + seedOffset) });
    const weapon = makeItemInstance(weaponId);
    const beast = buildBeast(statblockId, STR);
    let campaign = engine.createCampaign({ name: `${weaponId}-${target.name}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: beast } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: beast.id,
      targetId: target.id,
      weaponInstanceId: weapon.id,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
    if (attack?.hit !== true) continue;
    const prone = events.some(
      (e) =>
        e.type === 'ConditionApplied' &&
        (e as ConditionAppliedEvent).conditionId === 'prone' &&
        (e as ConditionAppliedEvent).targetId === target.id,
    );
    return { hit: true, prone };
  }
  return { hit: false, prone: false };
};

describe('Brown Bear Claw + Mastiff Bite knock-prone (slice 454)', () => {
  it('Brown Bear Claw on a Medium target applies Prone', () => {
    const r = runAttack('brown-bear', 17, 'brown-bear-claw', buildSizedTarget('human'), 0);
    expect(r.hit, 'no hit in 80 seeds').toBe(true);
    expect(r.prone).toBe(true);
  });

  it('Brown Bear Claw on a Large target applies Prone (gate is Large or smaller)', () => {
    const r = runAttack('brown-bear', 17, 'brown-bear-claw', buildSizedTarget('dire-wolf', 'dire-wolf'), 100);
    expect(r.hit, 'no hit in 80 seeds').toBe(true);
    expect(r.prone).toBe(true);
  });

  it('Brown Bear Claw on a Huge target does NOT apply Prone', () => {
    const r = runAttack('brown-bear', 17, 'brown-bear-claw', buildSizedTarget('treant', 'treant'), 200);
    expect(r.hit, 'no hit in 80 seeds').toBe(true);
    expect(r.prone).toBe(false);
  });

  it('Mastiff Bite on a Medium target applies Prone', () => {
    const r = runAttack('mastiff', 13, 'mastiff-bite', buildSizedTarget('human'), 300);
    expect(r.hit, 'no hit in 80 seeds').toBe(true);
    expect(r.prone).toBe(true);
  });

  it('Mastiff Bite on a Large target does NOT apply Prone (gate is Medium or smaller)', () => {
    const r = runAttack('mastiff', 13, 'mastiff-bite', buildSizedTarget('dire-wolf', 'dire-wolf'), 400);
    expect(r.hit, 'no hit in 80 seeds').toBe(true);
    expect(r.prone).toBe(false);
  });
});
