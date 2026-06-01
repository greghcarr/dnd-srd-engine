// Slice 552: Reach property extends opportunity-attack threat to 10 ft.
//
// RAW (SRD 5.2.1 Weapon Properties — Reach): "This weapon adds 5
// feet to your reach when you attack with it, as well as when
// determining your reach for Opportunity Attacks with it."
//
// Pre-slice the movement planner hardcoded `MELEE_REACH = 5` for
// every reactor regardless of equipped weapon, so a Halberd / Glaive
// / Pike / Whip wielder could never threaten OAs at their RAW 10 ft
// range. This slice reads each reactor's main-hand weapon definition
// and bumps their effective melee reach to 10 ft if the weapon
// carries the `reach` property and is a melee weapon.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { CombatantMovedEvent, OpportunityAvailableEvent } from '../../../src/schemas/events/movement.js';

const PACK = loadStarterPack();

const buildReactor = (weaponInstanceId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Reactor',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 14, max: 14, temp: 0 },
    ...(weaponInstanceId !== undefined
      ? { equipped: { mainHand: weaponInstanceId }, inventory: [weaponInstanceId] }
      : {}),
  });

const buildMover = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mover',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 18, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const setupAt = (
  engine: ReturnType<typeof createEngine>,
  mover: Character,
  reactor: Character,
  items: ItemInstance[],
  moverPos: { x: number; y: number },
  reactorPos: { x: number; y: number },
) => {
  let campaign = engine.createCampaign({ name: 'reach-oa' });
  campaign = commit(campaign, [
    ...[mover, reactor].map<CharacterCreatedEvent>((c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c })),
    ...items.map<ItemAcquiredEvent>((i) => ({ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: i })),
  ]);
  const enc = engine.plan.createEncounter(campaign.state, {
    combatantIds: [mover.id, reactor.id],
  });
  campaign = commit(campaign, enc.events);
  // Place combatants at their starting positions via CombatantMoved events.
  const place = (combatantId: string, pos: { x: number; y: number }): CombatantMovedEvent => ({
    id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: enc.encounterId,
    combatantId, fromPosition: { x: 0, y: 0 }, toPosition: pos, feetTraveled: 0,
  });
  campaign = commit(campaign, [place(mover.id, moverPos), place(reactor.id, reactorPos)]);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  // If reactor is the active combatant, advance to mover's turn.
  let activeId = campaign.state.encounters[enc.encounterId]!.combatants[
    campaign.state.encounters[enc.encounterId]!.activeIndex
  ]!.combatantId;
  while (activeId !== mover.id) {
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
    activeId = campaign.state.encounters[enc.encounterId]!.combatants[
      campaign.state.encounters[enc.encounterId]!.activeIndex
    ]!.combatantId;
  }
  return campaign;
};

describe('Reach property extends OA threat range (slice 552)', () => {
  it('REACH WEAPON (Halberd) — mover at 10 ft → moving to 15 ft PROVOKES OA', () => {
    // Positions in feet. With Halberd's reach property, reactor
    // threatens out to 10 ft. Mover starts at 10 ft (in reach), moves
    // to 15 ft (out of reach) → provokes.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const halberd = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'halberd' });
    const reactor = buildReactor(halberd.id);
    const mover = buildMover();
    const campaign = setupAt(engine, mover, reactor, [halberd], { x: 10, y: 0 }, { x: 0, y: 0 });
    const { events } = engine.plan.move(campaign.state, { combatantId: mover.id, to: { x: 15, y: 0 } });
    const oa = events.find((e) => e.type === 'OpportunityAvailable') as OpportunityAvailableEvent | undefined;
    expect(oa).toBeDefined();
    expect(oa!.reactorId).toBe(reactor.id);
  });

  it('REACH WEAPON (Halberd) — mover at 5 ft → moving to 10 ft (still in reach) DOES NOT PROVOKE', () => {
    // Within Halberd's 10-ft reach throughout the move, so no OA.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const halberd = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'halberd' });
    const reactor = buildReactor(halberd.id);
    const mover = buildMover();
    const campaign = setupAt(engine, mover, reactor, [halberd], { x: 5, y: 0 }, { x: 0, y: 0 });
    const { events } = engine.plan.move(campaign.state, { combatantId: mover.id, to: { x: 10, y: 0 } });
    const oa = events.find((e) => e.type === 'OpportunityAvailable');
    expect(oa).toBeUndefined();
  });

  it('NON-REACH WEAPON (Longsword) — mover at 10 ft → moving to 15 ft DOES NOT PROVOKE (was not in reach)', () => {
    // Longsword reach = 5 ft (default). Mover was already out of reach
    // at 10 ft, so moving further out does not trigger an OA.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const longsword = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });
    const reactor = buildReactor(longsword.id);
    const mover = buildMover();
    const campaign = setupAt(engine, mover, reactor, [longsword], { x: 10, y: 0 }, { x: 0, y: 0 });
    const { events } = engine.plan.move(campaign.state, { combatantId: mover.id, to: { x: 15, y: 0 } });
    const oa = events.find((e) => e.type === 'OpportunityAvailable');
    expect(oa).toBeUndefined();
  });

  it('NON-REACH WEAPON (Longsword) — mover at 5 ft → moving to 10 ft PROVOKES (left 5-ft reach)', () => {
    // Default 5-ft reach. Standard OA behavior — left the threat zone.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const longsword = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });
    const reactor = buildReactor(longsword.id);
    const mover = buildMover();
    const campaign = setupAt(engine, mover, reactor, [longsword], { x: 5, y: 0 }, { x: 0, y: 0 });
    const { events } = engine.plan.move(campaign.state, { combatantId: mover.id, to: { x: 10, y: 0 } });
    const oa = events.find((e) => e.type === 'OpportunityAvailable') as OpportunityAvailableEvent | undefined;
    expect(oa).toBeDefined();
    expect(oa!.reactorId).toBe(reactor.id);
  });

  it('UNARMED reactor (no main-hand weapon) — defaults to 5 ft reach', () => {
    // Sanity: a reactor with no equipped weapon falls back to default
    // 5-ft reach (RAW: unarmed strike is 5 ft).
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const reactor = buildReactor(); // no weapon
    const mover = buildMover();
    const campaign = setupAt(engine, mover, reactor, [], { x: 10, y: 0 }, { x: 0, y: 0 });
    const { events } = engine.plan.move(campaign.state, { combatantId: mover.id, to: { x: 15, y: 0 } });
    const oa = events.find((e) => e.type === 'OpportunityAvailable');
    expect(oa).toBeUndefined(); // was outside 5-ft reach already
  });
});
