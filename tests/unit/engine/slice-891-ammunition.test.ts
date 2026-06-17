// Slice 891 — Ammunition consumption + recovery. Closes the L7 audit Area-6
// DIVERGENCE `ammunition-not-consumed`.
//
// RAW (equipment "Ammunition"): "You can use a weapon that has the Ammunition
// property to make a ranged attack only if you have ammunition to fire from it.
// ... Each attack expends one piece of ammunition. ... After a fight, you can
// spend 1 minute to recover half the ammunition (round down) you used."
//
// Opt-in consumer-coordinated seam: when the attack names an `ammunitionInstanceId`,
// the shot decrements that stack (an AmmunitionQuantityChanged tail event), the
// stack retires at 0, and a shot with a depleted/absent stack throws.
// `engine.plan.recoverAmmunition` tops a stack back up by floor(spent/2). When
// no `ammunitionInstanceId` is supplied, the engine doesn't track/require ammo.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId, newEncounterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type {
  EncounterCreatedEvent, EncounterStartedEvent, InitiativeRolledEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildArcher = (bowId: string): Character => {
  const base = CharacterSchema.parse({
    id: newCharacterId(), name: 'Archer', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 }, featsTaken: [],
  });
  return { ...base, inventory: [bowId], equipped: { ...base.equipped, mainHand: bowId } };
};

const setup = (ammoQty: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
  const bowId = newItemInstanceId();
  const ammoId = newItemInstanceId();
  const archer = buildArcher(bowId);
  const target = CharacterSchema.parse({
    id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 }, featsTaken: [],
  });
  const bow = ItemInstanceSchema.parse({ id: bowId, definitionId: 'shortbow' });
  const ammo = ItemInstanceSchema.parse({ id: ammoId, definitionId: 'dart', quantity: ammoQty });
  let campaign: Campaign = engine.createCampaign({ name: 'ammo' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow } satisfies ItemAcquiredEvent,
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: ammo } satisfies ItemAcquiredEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: archer } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [archer.id, target.id] } satisfies EncounterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [
      { combatantId: archer.id, d20: 20, modifier: 0, total: 20 },
      { combatantId: target.id, d20: 5, modifier: 0, total: 5 },
    ] } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: archer.id, round: 1 } satisfies TurnStartedEvent,
  ]);
  const place = (combatantId: string, x: number, y: number): CombatantMovedEvent => ({
    id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId, combatantId,
    fromPosition: { x: 0, y: 0 }, toPosition: { x, y }, feetTraveled: 0,
  });
  campaign = commit(campaign, [place(archer.id, 10, 10), place(target.id, 25, 10)]);
  return { engine, campaign, archerId: archer.id, targetId: target.id, bowId, ammoId };
};

const qtyOf = (campaign: Campaign, id: string): number | undefined => campaign.state.itemInstances[id]?.quantity;

describe('Ammunition (slice 891)', () => {
  it('a shot expends one piece of the named ammunition stack', () => {
    const { engine, campaign, archerId, targetId, bowId, ammoId } = setup(3);
    const after = commit(campaign, engine.plan.attack(campaign.state, {
      attackerId: archerId, targetId, weaponInstanceId: bowId, ammunitionInstanceId: ammoId,
    }).events);
    expect(qtyOf(after, ammoId)).toBe(2);
  });

  it('the stack retires at 0 and a further shot throws (RAW: only if you have ammunition)', () => {
    let { engine, campaign, archerId, targetId, bowId, ammoId } = setup(1);
    campaign = commit(campaign, engine.plan.attack(campaign.state, {
      attackerId: archerId, targetId, weaponInstanceId: bowId, ammunitionInstanceId: ammoId,
    }).events);
    expect(qtyOf(campaign, ammoId)).toBeUndefined(); // retired
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: archerId, targetId, weaponInstanceId: bowId, ammunitionInstanceId: ammoId,
    })).toThrow(/no ammunition/);
  });

  it('without an ammunitionInstanceId the engine tracks/requires no ammo (byte-unchanged)', () => {
    const { engine, campaign, archerId, targetId, bowId, ammoId } = setup(3);
    const events = engine.plan.attack(campaign.state, {
      attackerId: archerId, targetId, weaponInstanceId: bowId,
    }).events;
    expect(events.some((e) => e.type === 'AmmunitionQuantityChanged')).toBe(false);
    // The stack is untouched after committing.
    const after = commit(campaign, events);
    expect(qtyOf(after, ammoId)).toBe(3);
  });

  it('recoverAmmunition restores floor(spent / 2) to the stack', () => {
    const { engine, campaign, archerId, ammoId } = setup(4);
    const after = commit(campaign, engine.plan.recoverAmmunition(campaign.state, {
      characterId: archerId, ammunitionInstanceId: ammoId, spent: 5,
    }).events);
    expect(qtyOf(after, ammoId)).toBe(4 + 2); // floor(5/2) = 2
  });

  it('recovering from 0 spent (or 1) is a no-op', () => {
    const { engine, campaign, archerId, ammoId } = setup(4);
    expect(engine.plan.recoverAmmunition(campaign.state, { characterId: archerId, ammunitionInstanceId: ammoId, spent: 1 }).events).toEqual([]);
  });
});
