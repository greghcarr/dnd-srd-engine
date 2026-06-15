// Slice 880 — the `attackerHasHostileAdjacent` consumer override for "Ranged
// Attacks in Close Combat". Closes the L7 audit Area-4 quirk
// `no-hostility-model` (the un-overridable arm).
//
// RAW (PHB ch.1 "Ranged Attacks in Close Combat"): "You have Disadvantage on
// the attack roll if you are within 5 feet of a HOSTILE creature who can see
// you and who isn't Incapacitated." The engine has no hostility model, so its
// position-derived fallback treats ANY adjacent non-incapacitated combatant as
// a threat — an archer next to a friendly cleric would wrongly take
// disadvantage. Slice 880 adds a per-intent `attackerHasHostileAdjacent`
// override (the mirror of the Pack-Tactics `attackerHasAllyAdjacentToTarget`
// seam): a hostility-aware consumer answers the RAW predicate directly, and
// `undefined` falls back to the conservative geometry (prior behavior).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { newEncounterId } from '../../../src/ids.js';
import { buildFighter, eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type {
  EncounterCreatedEvent, EncounterStartedEvent, InitiativeRolledEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';

const PACK = loadStarterPack();

// Attacker A (shortbow, active turn) at (10,10); a friendly F at `friendPos`;
// a distant target T at (10,40) (chebyshev 30 — well within the shortbow's
// 80 ft normal range, no long-range disadvantage). All plain fighters, no
// conditions, so the ONLY advantage/disadvantage source is ranged-in-melee.
const setup = (friendPos: { x: number; y: number }) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  const bow = makeItemInstance('shortbow');
  const a0 = buildFighter({ name: 'Archer', DEX: 16, hpMax: 30, hpCurrent: 30 });
  const a = { ...a0, equipped: { ...a0.equipped, mainHand: bow.id }, inventory: [bow.id] };
  const f = buildFighter({ name: 'Friend', hpMax: 30, hpCurrent: 30 });
  const t = buildFighter({ name: 'Target', hpMax: 30, hpCurrent: 30 });
  let campaign: Campaign = engine.createCampaign({ name: 'ranged-in-melee' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow } satisfies ItemAcquiredEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: f } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
  ]);
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [a.id, f.id, t.id] } satisfies EncounterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [
      { combatantId: a.id, d20: 20, modifier: 3, total: 23 },
      { combatantId: f.id, d20: 10, modifier: 0, total: 10 },
      { combatantId: t.id, d20: 5, modifier: 0, total: 5 },
    ] } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: a.id, round: 1 } satisfies TurnStartedEvent,
  ]);
  const place = (combatantId: string, x: number, y: number): CombatantMovedEvent => ({
    id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId, combatantId,
    fromPosition: { x: 0, y: 0 }, toPosition: { x, y }, feetTraveled: 0,
  });
  campaign = commit(campaign, [
    place(a.id, 10, 10), place(f.id, friendPos.x, friendPos.y), place(t.id, 10, 40),
  ]);
  return { engine, campaign, aId: a.id, tId: t.id, bowId: bow.id };
};

const usedOf = (events: ReturnType<ReturnType<typeof createEngine>['plan']['attack']>['events']): string | undefined => {
  const ar = events.find((e) => e.type === 'AttackRolled');
  if (ar === undefined || ar.type !== 'AttackRolled') throw new Error('no AttackRolled event');
  return (ar as unknown as { used?: string }).used;
};

const ADJACENT = { x: 15, y: 10 }; // chebyshev 5 from A → within melee reach
const FAR = { x: 10, y: 90 };      // chebyshev 80 from A → not adjacent

describe('Ranged-in-melee hostility override (slice 880)', () => {
  it('a friendly adjacent + override false -> NO disadvantage (the hostility-model fix)', () => {
    const { engine, campaign, aId, tId, bowId } = setup(ADJACENT);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: aId, targetId: tId, weaponInstanceId: bowId, attackerHasHostileAdjacent: false,
    });
    expect(usedOf(events)).toBe('none');
  });

  it('an adjacent creature + no override -> geometry fallback still imposes disadvantage (prior behavior preserved)', () => {
    const { engine, campaign, aId, tId, bowId } = setup(ADJACENT);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: aId, targetId: tId, weaponInstanceId: bowId,
    });
    expect(usedOf(events)).toBe('disadvantage');
  });

  it('a friendly adjacent + override true -> disadvantage (consumer affirms a hostile is in reach)', () => {
    const { engine, campaign, aId, tId, bowId } = setup(ADJACENT);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: aId, targetId: tId, weaponInstanceId: bowId, attackerHasHostileAdjacent: true,
    });
    expect(usedOf(events)).toBe('disadvantage');
  });

  it('nobody adjacent + override true -> disadvantage (a hidden foe the engine cannot see)', () => {
    const { engine, campaign, aId, tId, bowId } = setup(FAR);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: aId, targetId: tId, weaponInstanceId: bowId, attackerHasHostileAdjacent: true,
    });
    expect(usedOf(events)).toBe('disadvantage');
  });

  it('nobody adjacent + no override -> normal (geometry sees no threat)', () => {
    const { engine, campaign, aId, tId, bowId } = setup(FAR);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: aId, targetId: tId, weaponInstanceId: bowId,
    });
    expect(usedOf(events)).toBe('none');
  });
});
