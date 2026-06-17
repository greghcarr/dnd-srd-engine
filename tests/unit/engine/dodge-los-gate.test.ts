// Slice 278 — Dodge condition LoS gate on the attack-disadvantage arm.
//
// RAW (SRD 5.2.1 Dodge action): "Until the start of your next turn,
// any attack roll made against you has Disadvantage if you can see
// the attacker, and you make Dexterity saving throws with Advantage."
//
// Slice 272 added the Incap/Speed-0 self-disable on both arms. This
// slice adds the per-attacker LoS gate on the attack-disadvantage
// arm only (RAW: the LoS clause applies to the attack-disadvantage
// benefit; the DEX-save advantage has no LoS clause). The bearer is
// the TARGET; the fact `bearer.canSeeAttacker` is per-attacker and
// consumer-supplied via `targetCanSeeAttacker` on AttackIntent.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../../src/schemas/runtime/item-instance.js';
import {
  newCharacterId,
  newItemInstanceId,
  newAppliedConditionId,
  newEncounterId,
} from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type {
  EncounterCreatedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildFighter = (name: string, swordId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    featsTaken: [],
    inventory: [swordId],
    equipped: { mainHand: swordId, attuned: [] },
  });

const applyDodged = (targetId: string): ConditionAppliedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'ConditionApplied',
  targetId: targetId as never,
  conditionId: 'dodged',
  appliedConditionId: newAppliedConditionId(),
});

const setupEncounter = (
  dodger: Character,
  attacker: Character,
  swordId: string,
) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(278) });
  let campaign: Campaign = engine.createCampaign({ name: 'dodge-los-gate' });
  const weapon: ItemInstance = ItemInstanceSchema.parse({ id: swordId, definitionId: 'longsword' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dodger } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    applyDodged(dodger.id),
  ]);
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [dodger.id, attacker.id] } satisfies EncounterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId,
      rolls: [
        { combatantId: dodger.id, d20: 20, modifier: 0, total: 20 },
        { combatantId: attacker.id, d20: 5, modifier: 0, total: 5 },
      ],
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: dodger.id, round: 1 } satisfies TurnStartedEvent,
  ]);
  return { engine, campaign };
};

const findAttack = (events: ReadonlyArray<unknown>): AttackRolledEvent =>
  events.find((e): e is AttackRolledEvent => (e as { type?: string }).type === 'AttackRolled')!;

describe('slice 278: Dodge ImposeDisadvantageOnAttackers gates on per-attacker LoS', () => {
  it('attacker attacking dodging target with undefined LoS fact rolls with disadvantage (default-apply)', () => {
    const swordId = newItemInstanceId();
    const dodger = buildFighter('Dodger', swordId);
    const attacker = buildFighter('Attacker', swordId);
    const { engine, campaign } = setupEncounter(dodger, attacker, swordId);
    const attack = findAttack(
      engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: dodger.id,
        weaponInstanceId: swordId,
      }).events,
    );
    expect(attack.used).toBe('disadvantage');
    expect(attack.d20).toHaveLength(2);
  });

  it('attacker attacking dodging target with targetCanSeeAttacker=true rolls with disadvantage', () => {
    const swordId = newItemInstanceId();
    const dodger = buildFighter('Dodger', swordId);
    const attacker = buildFighter('Attacker', swordId);
    const { engine, campaign } = setupEncounter(dodger, attacker, swordId);
    const attack = findAttack(
      engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: dodger.id,
        weaponInstanceId: swordId,
        targetCanSeeAttacker: true,
      }).events,
    );
    expect(attack.used).toBe('disadvantage');
    expect(attack.d20).toHaveLength(2);
  });

  it('attacker attacking dodging target with targetCanSeeAttacker=false bypasses Dodge AND gains Unseen-Attacker advantage (slice 886)', () => {
    const swordId = newItemInstanceId();
    const dodger = buildFighter('Dodger', swordId);
    const attacker = buildFighter('Attacker', swordId);
    const { engine, campaign } = setupEncounter(dodger, attacker, swordId);
    const attack = findAttack(
      engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: dodger.id,
        weaponInstanceId: swordId,
        targetCanSeeAttacker: false,
      }).events,
    );
    // Dodge's disadvantage doesn't apply (the dodger can't see the attacker),
    // AND the general Unseen-Attacker rule grants Advantage ("when a creature
    // can't see you, you have Advantage"). Pre-886 this read 'none'.
    expect(attack.used).toBe('advantage');
    expect(attack.d20).toHaveLength(2);
  });

  it('attacker attacking non-dodging target has no disadvantage regardless of LoS fact', () => {
    const swordId = newItemInstanceId();
    const target = buildFighter('Target', swordId);
    const attacker = buildFighter('Attacker', swordId);
    // No dodged condition on target.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(278) });
    let campaign: Campaign = engine.createCampaign({ name: 'dodge-los-baseline' });
    const weapon: ItemInstance = ItemInstanceSchema.parse({ id: swordId, definitionId: 'longsword' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    ]);
    const encounterId = newEncounterId();
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [target.id, attacker.id] } satisfies EncounterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'InitiativeRolled',
        encounterId,
        rolls: [
          { combatantId: target.id, d20: 20, modifier: 0, total: 20 },
          { combatantId: attacker.id, d20: 5, modifier: 0, total: 5 },
        ],
      } satisfies InitiativeRolledEvent,
      { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: target.id, round: 1 } satisfies TurnStartedEvent,
    ]);
    const attack = findAttack(
      engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: swordId,
        targetCanSeeAttacker: true,
      }).events,
    );
    expect(attack.used).toBe('none');
    expect(attack.d20).toHaveLength(1);
  });
});
