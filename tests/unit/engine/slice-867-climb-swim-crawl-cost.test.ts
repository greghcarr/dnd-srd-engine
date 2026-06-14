// Slice 867 — L7 audit closure for `climb-swim-crawl-cost` (QUIRK, Area 8).
//
// RAW (rules-glossary "Climbing" / "Swimming" / "Crawling"): "each foot of
// movement costs 1 extra foot (2 extra feet in Difficult Terrain)." Climbing
// and Swimming waive the cost when the mover has the matching Climb / Swim
// Speed ("you ignore this extra cost if you have a Climb Speed and use it to
// climb"); Crawling has no such waiver. The engine keys the surcharge off the
// per-move `movementMode` ('climb' | 'swim' | 'crawl'); 'crawl' also keeps the
// mover Prone (the RAW alternative to standing up). The Difficult-Terrain
// doubling is already folded into the path cost, so the surcharge is a flat
// +1 per geometric foot — verified here on positionless (Chebyshev) moves.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { newEncounterId, newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  EncounterCreatedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

// Active mover at (5,5); a dummy parked far away so it never blocks. Returns
// the engine + committed campaign so a test can plan a move for the mover.
const setupActiveMover = (mover: Character, opts: { prone?: boolean } = {}) => {
  const engine = createEngine({ contentPacks: [loadStarterPack()], rng: seededRNG(1) });
  const dummy = buildFighter({ name: 'Dummy' });
  let campaign = engine.createCampaign({ name: 'movement-cost' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: mover } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
  ]);
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    {
      id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId,
      name: 'Open Field', combatantIds: [mover.id, dummy.id],
    } satisfies EncounterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId,
      rolls: [
        { combatantId: mover.id, d20: 20, modifier: 3, total: 23 },
        { combatantId: dummy.id, d20: 2, modifier: 0, total: 2 },
      ],
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: mover.id, round: 1 } satisfies TurnStartedEvent,
  ]);
  const place = (combatantId: string, x: number): CombatantMovedEvent => ({
    id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId, combatantId,
    fromPosition: { x: 0, y: 0 }, toPosition: { x, y: 5 }, feetTraveled: 0,
  });
  campaign = commit(campaign, [place(mover.id, 5), place(dummy.id, 100)]);
  if (opts.prone === true) {
    campaign = commit(campaign, [
      {
        id: eventId(), at: isoTimestamp(), type: 'ConditionApplied',
        targetId: mover.id, conditionId: 'prone', appliedConditionId: newAppliedConditionId(),
      } satisfies ConditionAppliedEvent,
    ]);
  }
  return { engine, campaign, moverId: mover.id };
};

// A creature with a native Climb Speed (Giant Rat: walk 30 / climb 30).
const buildClimber = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Giant Rat',
    statblockId: 'giant-rat',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 7, DEX: 15, CON: 11, INT: 2, WIS: 10, CHA: 4 },
    hp: { current: 7, max: 7, temp: 0 },
    equipped: { attuned: [] },
  });

const moveCost = (events: ReadonlyArray<{ type: string }>): number => {
  const moved = events.find((e) => e.type === 'CombatantMoved') as CombatantMovedEvent | undefined;
  if (moved === undefined) throw new Error('no CombatantMoved event');
  return moved.feetTraveled;
};

describe('slice 867 — climb / swim / crawl movement-cost surcharge', () => {
  it('a plain walk move costs its base distance (no surcharge)', () => {
    const { engine, campaign, moverId } = setupActiveMover(buildFighter({ name: 'Walker' }));
    const { events } = engine.plan.move(campaign.state, { combatantId: moverId, to: { x: 5, y: 20 } });
    expect(moveCost(events)).toBe(15); // Chebyshev 15 ft, walk
  });

  it('climbing without a Climb Speed costs +1 ft per foot (doubles the distance)', () => {
    const { engine, campaign, moverId } = setupActiveMover(buildFighter({ name: 'Climber' }));
    const { events } = engine.plan.move(campaign.state, {
      combatantId: moverId, to: { x: 5, y: 20 }, movementMode: 'climb',
    });
    expect(moveCost(events)).toBe(30); // 15 base + 15 climb surcharge
  });

  it('swimming without a Swim Speed costs +1 ft per foot', () => {
    const { engine, campaign, moverId } = setupActiveMover(buildFighter({ name: 'Swimmer' }));
    const { events } = engine.plan.move(campaign.state, {
      combatantId: moverId, to: { x: 5, y: 20 }, movementMode: 'swim',
    });
    expect(moveCost(events)).toBe(30);
  });

  it('a creature with a Climb Speed pays no climb surcharge', () => {
    const { engine, campaign, moverId } = setupActiveMover(buildClimber());
    const { events } = engine.plan.move(campaign.state, {
      combatantId: moverId, to: { x: 5, y: 20 }, movementMode: 'climb',
    });
    expect(moveCost(events)).toBe(15); // exempt: Giant Rat climb 30
  });

  it('a Prone creature that walks stands up (half-speed cost) and sheds Prone', () => {
    const { engine, campaign, moverId } = setupActiveMover(buildFighter({ name: 'Stander' }), { prone: true });
    const { events } = engine.plan.move(campaign.state, { combatantId: moverId, to: { x: 5, y: 15 } });
    expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(true);
    expect(moveCost(events)).toBe(25); // 10 base + 15 stand-up (half of 30)
  });

  it('a Prone creature that Crawls stays Prone and pays the crawl surcharge instead', () => {
    const { engine, campaign, moverId } = setupActiveMover(buildFighter({ name: 'Crawler' }), { prone: true });
    const { events } = engine.plan.move(campaign.state, {
      combatantId: moverId, to: { x: 5, y: 15 }, movementMode: 'crawl',
    });
    expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(false); // still Prone
    expect(moveCost(events)).toBe(20); // 10 base + 10 crawl surcharge, no stand-up
  });

  it('the surcharge counts against remaining movement (over-budget climb throws)', () => {
    const { engine, campaign, moverId } = setupActiveMover(buildFighter({ name: 'Overreach' }));
    // Chebyshev 30 ft × 2 (climb) = 60 ft > speed 30.
    expect(() =>
      engine.plan.move(campaign.state, {
        combatantId: moverId, to: { x: 5, y: 35 }, movementMode: 'climb',
      }),
    ).toThrow(/climb surcharge/);
  });
});
