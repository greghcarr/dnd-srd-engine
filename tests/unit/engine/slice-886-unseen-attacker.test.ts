// Slice 886 — the general Unseen Attackers and Targets rule. Closes the L7
// audit Area-3 DIVERGENCE `unseen-attacker-general-rule`.
//
// RAW (Unseen Attackers and Targets):
//  - "When you make an attack roll against a target you can't see, you have
//    Disadvantage on the roll."
//  - "When a creature can't see you, you have Advantage on attack rolls
//    against it."
//
// The engine modeled this only for the Invisible *condition*. Slice 886 adds
// the consumer LoS facts `attackerCanSeeTarget` (false → Disadvantage) and
// reuses `targetCanSeeAttacker` (false → Advantage), both folding into the
// 2024 advantage/disadvantage cancellation. The engine doesn't model sight, so
// both are opt-in (undefined → no change; existing attacks byte-unchanged).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId, newEncounterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  EncounterCreatedEvent, EncounterStartedEvent, InitiativeRolledEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildFighter = (name: string, swordId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 }, featsTaken: [],
    inventory: [swordId], equipped: { mainHand: swordId, attuned: [] },
  });

interface LoS {
  readonly attackerCanSeeTarget?: boolean;
  readonly targetCanSeeAttacker?: boolean;
}

const attackUsed = (los: LoS): AttackRolledEvent => {
  const swordId = newItemInstanceId();
  const attacker = buildFighter('Attacker', swordId);
  const target = buildFighter('Target', swordId);
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(886) });
  let campaign: Campaign = engine.createCampaign({ name: 'unseen' });
  const weapon: ItemInstance = ItemInstanceSchema.parse({ id: swordId, definitionId: 'longsword' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [attacker.id, target.id] } satisfies EncounterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [
      { combatantId: attacker.id, d20: 20, modifier: 0, total: 20 },
      { combatantId: target.id, d20: 5, modifier: 0, total: 5 },
    ] } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: attacker.id, round: 1 } satisfies TurnStartedEvent,
  ]);
  const events = engine.plan.attack(campaign.state, {
    attackerId: attacker.id,
    targetId: target.id,
    weaponInstanceId: swordId,
    ...(los.attackerCanSeeTarget !== undefined ? { attackerCanSeeTarget: los.attackerCanSeeTarget } : {}),
    ...(los.targetCanSeeAttacker !== undefined ? { targetCanSeeAttacker: los.targetCanSeeAttacker } : {}),
  }).events;
  return events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled')!;
};

describe('Unseen Attackers and Targets (slice 886)', () => {
  it("attacker who can't see the target rolls with Disadvantage", () => {
    const a = attackUsed({ attackerCanSeeTarget: false });
    expect(a.used).toBe('disadvantage');
    expect(a.d20).toHaveLength(2);
  });

  it("attacker the target can't see rolls with Advantage", () => {
    const a = attackUsed({ targetCanSeeAttacker: false });
    expect(a.used).toBe('advantage');
    expect(a.d20).toHaveLength(2);
  });

  it('mutual blindness cancels to a straight roll (2024 advantage cancellation)', () => {
    const a = attackUsed({ attackerCanSeeTarget: false, targetCanSeeAttacker: false });
    expect(a.used).toBe('none');
    expect(a.d20).toHaveLength(1);
  });

  it('no LoS facts → a straight roll (opt-in; existing attacks byte-unchanged)', () => {
    const a = attackUsed({});
    expect(a.used).toBe('none');
    expect(a.d20).toHaveLength(1);
  });

  it('explicit can-see (true) imposes nothing', () => {
    const a = attackUsed({ attackerCanSeeTarget: true, targetCanSeeAttacker: true });
    expect(a.used).toBe('none');
    expect(a.d20).toHaveLength(1);
  });
});
