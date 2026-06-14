// Slice 860 — `offhand-not-different-weapon`.
//
// RAW (SRD 5.2.1 Light property): "When you take the Attack action ... and
// attack with a Light weapon, you can make one extra attack as a Bonus
// Action ... That extra attack must be made with a DIFFERENT Light weapon."
// `planOffHandAttack` checked the weapon was Light but never that it differed
// from the main hand, so a creature could make its off-hand (extra) attack
// with the very weapon it just struck with.
//
// The fix is instance-level: the off-hand weapon can't be the main-hand
// instance. Two of the same weapon TYPE (e.g. two Shortswords) stay RAW-legal
// — they are two distinct weapons — which is exactly the case this guard also
// pins (the off-hand dagger and main-hand dagger are different instances).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildDualWielder = (mainHandId: string, offHandId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dualist',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    inventory: [mainHandId, offHandId],
    equipped: { mainHand: mainHandId, offHand: offHandId, attuned: [] },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
  });

// Two distinct dagger (Light) instances, one per hand; attacker's turn active.
const seed = () => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  const mainDagger = makeItemInstance('dagger');
  const offDagger = makeItemInstance('dagger');
  const attacker = buildDualWielder(mainDagger.id, offDagger.id);
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: 'offhand-diff' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: mainDagger },
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: offDagger },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [attacker.id, target.id] });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  const e = campaign.state.encounters[enc.encounterId]!;
  if (e.combatants[e.activeIndex]?.combatantId !== attacker.id) {
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
  }
  return { engine, campaign, attackerId: attacker.id, targetId: target.id, mainHandId: mainDagger.id, offHandId: offDagger.id };
};

describe('slice 860: off-hand attack must use a different weapon than the main hand', () => {
  it('rejects an off-hand attack made with the main-hand weapon instance', () => {
    const { engine, campaign, attackerId, targetId, mainHandId } = seed();
    expect(() =>
      engine.plan.offHandAttack(campaign.state, {
        attackerId,
        targetId,
        weaponInstanceId: mainHandId, // the SAME weapon the Attack action would use
      }),
    ).toThrow(/different Light weapon/i);
  });

  it('allows an off-hand attack with a different Light weapon instance (incl. same weapon type)', () => {
    const { engine, campaign, attackerId, targetId, offHandId } = seed();
    // offHandId is a second dagger — same TYPE as the main hand, different
    // INSTANCE — which RAW permits ("two Shortswords" is legal dual-wielding).
    const events = engine.plan.offHandAttack(campaign.state, {
      attackerId,
      targetId,
      weaponInstanceId: offHandId,
    }).events;
    expect(events.some((e) => e.type === 'AttackRolled')).toBe(true);
  });
});
