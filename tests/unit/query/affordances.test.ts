// Slice 705 (A1): intent-shaped affordance queries.
//
// Exercises the engine.query.* namespace (the wired surface) against a
// real positioned encounter: legal move destinations, action economy,
// available actions (with machine-readable disabled reasons), legal
// attack targets (range + LoS), and castable spells. The underlying
// derive helpers are already covered elsewhere; this pins the
// intent-shaped composition + deterministic ordering.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newLocationId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  InitiativeRolledEvent,
  EncounterStartedEvent,
  TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type {
  LocationCreatedEvent,
  CharacterLocationChangedEvent,
} from '../../../src/schemas/events/locations.js';
import type { ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import type { ULID } from '../../../src/engine/ids-utils.js';
import type { Event } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();

const buildFighter = (
  name: string,
  equipped: string[] = [],
  overrides: Partial<Character> = {},
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    inventory: equipped,
    equipped: equipped.length > 0 ? { mainHand: equipped[0], attuned: [] } : { attuned: [] },
    ...overrides,
  });

const buildWizard = (name: string, overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 18, max: 18, temp: 0 },
    ...overrides,
  });

// 8x8 grid, 5 ft cells. All-normal terrain.
const buildOpenMap = (locationId: string): LocationCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'LocationCreated',
  locationId: locationId as ULID,
  name: 'Open Arena',
  map: {
    widthCells: 8,
    heightCells: 8,
    cellSizeFeet: 5,
    terrain: Array.from({ length: 8 }, () => new Array<'normal'>(8).fill('normal')),
  },
});

// 8x8 grid with a vertical impassable wall at cell-x=2.
const buildWalledMap = (locationId: string): LocationCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'LocationCreated',
  locationId: locationId as ULID,
  name: 'Walled Arena',
  map: {
    widthCells: 8,
    heightCells: 8,
    cellSizeFeet: 5,
    terrain: Array.from({ length: 8 }, (_row, y) =>
      Array.from({ length: 8 }, (_cell, x) => (x === 2 && y < 7 ? 'impassable' : 'normal')),
    ),
  },
});

interface Setup {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
}

const setupCombat = (
  characters: Character[],
  mapBuilder: ((locationId: string) => LocationCreatedEvent) | null,
  positions: ReadonlyArray<{ x: number; y: number } | undefined>,
  items: ItemInstance[] = [],
): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'affordances' });
  const locationId = newLocationId();
  const pre: Event[] = [
    ...items.map((inst) => ({ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired' as const, instance: inst })),
    ...characters.map((c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated' as const, snapshot: c } satisfies CharacterCreatedEvent)),
  ];
  if (mapBuilder !== null) {
    pre.push(mapBuilder(locationId));
    for (const c of characters) {
      pre.push({
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterLocationChanged' as const,
        characterId: c.id as ULID,
        toLocationId: locationId as ULID,
      } satisfies CharacterLocationChangedEvent);
    }
  }
  campaign = commit(campaign, pre);
  const allPositioned = positions.every((p) => p !== undefined);
  const created = allPositioned
    ? engine.plan.createEncounter(campaign.state, {
        combatants: characters.map((c, i) => ({ characterId: c.id, position: positions[i]! })),
      })
    : engine.plan.createEncounter(campaign.state, { combatantIds: characters.map((c) => c.id) });
  campaign = commit(campaign, [
    ...created.events,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId: created.encounterId as ULID,
      rolls: characters.map((c, i) => ({ combatantId: c.id as ULID, d20: 15 - i, modifier: 2, total: 17 - i })),
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: created.encounterId as ULID } satisfies EncounterStartedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'TurnStarted',
      encounterId: created.encounterId as ULID,
      combatantId: characters[0]!.id as ULID,
      round: 1,
    } satisfies TurnStartedEvent,
  ]);
  return { engine, campaign, encounterId: created.encounterId };
};

describe('slice 705: affordance queries (engine.query.*)', () => {
  describe('legalMoveDestinations', () => {
    it('returns reachable cells within speed, in deterministic (x,y) order, origin excluded', () => {
      const mover = buildFighter('Mover'); // walk speed 30 = 6 cells
      const foe = buildFighter('Foe');
      const s = setupCombat([mover, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 35, y: 35 }]);
      const dests = s.engine.query.legalMoveDestinations(s.campaign.state, s.encounterId, mover.id);
      expect(dests.length).toBeGreaterThan(0);
      // Every cost within the 30 ft budget; origin not included.
      for (const d of dests) {
        expect(d.costFeet).toBeLessThanOrEqual(30);
        expect(d.costFeet).toBeGreaterThan(0);
        expect(d.path.length).toBeGreaterThanOrEqual(1);
      }
      expect(dests.some((d) => d.position.x === 0 && d.position.y === 0)).toBe(false);
      // A cell 30 ft away is reachable; one 35 ft away is not.
      expect(dests.some((d) => d.position.x === 30 && d.position.y === 0)).toBe(true);
      expect(dests.some((d) => d.position.x === 35 && d.position.y === 0)).toBe(false);
      // Deterministic order.
      const order = dests.map((d) => `${d.position.x},${d.position.y}`);
      expect(order).toEqual([...order].sort((a, b) => {
        const [ax, ay] = a.split(',').map(Number);
        const [bx, by] = b.split(',').map(Number);
        return ax! - bx! || ay! - by!;
      }));
    });

    it('excludes a cell occupied by another combatant', () => {
      const mover = buildFighter('Mover');
      const blocker = buildFighter('Blocker');
      const s = setupCombat([mover, blocker], buildOpenMap, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
      const dests = s.engine.query.legalMoveDestinations(s.campaign.state, s.encounterId, mover.id);
      expect(dests.some((d) => d.position.x === 10 && d.position.y === 0)).toBe(false);
    });

    it('slice 760: a prone combatant\'s reachable set accounts for the stand-up surcharge', () => {
      // Speed 30, stand-up surcharge floor(30/2)=15 → effective travel 15 ft.
      const prone = buildFighter('Prone', [], {
        appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'prone' }],
      });
      const foe = buildFighter('Foe');
      const s = setupCombat([prone, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 35, y: 35 }]);
      const dests = s.engine.query.legalMoveDestinations(s.campaign.state, s.encounterId, prone.id);
      for (const d of dests) expect(d.costFeet).toBeLessThanOrEqual(15);
      expect(dests.some((d) => d.position.x === 15 && d.position.y === 0)).toBe(true);
      expect(dests.some((d) => d.position.x === 20 && d.position.y === 0)).toBe(false);
      // Cross-check the planner: it accepts the 15 ft move (15+15=30) and
      // rejects 20 ft (20+15=35 > 30).
      expect(() =>
        s.engine.plan.move(s.campaign.state, { combatantId: prone.id, to: { x: 15, y: 0 } }),
      ).not.toThrow();
      expect(() =>
        s.engine.plan.move(s.campaign.state, { combatantId: prone.id, to: { x: 20, y: 0 } }),
      ).toThrow();
    });

    it('honors Frightened: no destination moves closer to the fear source', () => {
      const foe = buildFighter('Scary');
      const moverId = newCharacterId();
      const frightened = buildFighter('Mover', [], {
        id: moverId,
        appliedConditions: [
          { id: newAppliedConditionId(), conditionId: 'frightened', sourceCharacterId: foe.id as ULID },
        ],
      });
      // Mover at (35,0), fear source at (0,0): current distance 35 ft.
      const s = setupCombat([frightened, foe], buildOpenMap, [{ x: 35, y: 0 }, { x: 0, y: 0 }]);
      const dests = s.engine.query.legalMoveDestinations(s.campaign.state, s.encounterId, frightened.id);
      for (const d of dests) {
        // Chebyshev distance (5 ft cells) to the source must not shrink.
        const distFeet = Math.max(Math.abs(d.position.x - 0), Math.abs(d.position.y - 0));
        expect(distFeet).toBeGreaterThanOrEqual(35);
      }
    });
  });

  describe('actionEconomy', () => {
    it('reports a fresh turn: action/bonus/reaction available, full movement, one attack', () => {
      const pc = buildFighter('Fresh');
      const foe = buildFighter('Foe');
      const s = setupCombat([pc, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 35, y: 35 }]);
      const ae = s.engine.query.actionEconomy(s.campaign.state, s.encounterId, pc.id);
      expect(ae).toBeDefined();
      expect(ae!.actionAvailable).toBe(true);
      expect(ae!.bonusActionAvailable).toBe(true);
      expect(ae!.reactionAvailable).toBe(true);
      expect(ae!.movement).toEqual({ totalFeet: 30, usedFeet: 0, remainingFeet: 30 });
      expect(ae!.attacks).toEqual({ perAction: 1, madeThisTurn: 0, remaining: 1 });
    });
  });

  describe('availableActions', () => {
    it('a fresh fighter with an adjacent foe can attack/dash/disengage/dodge/move', () => {
      const sword = makeItemInstance('longsword');
      const pc = buildFighter('Striker', [sword.id]);
      const foe = buildFighter('Foe');
      const s = setupCombat([pc, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 5, y: 0 }], [sword]);
      const actions = s.engine.query.availableActions(s.campaign.state, s.encounterId, pc.id);
      const byId = Object.fromEntries(actions.map((a) => [a.action, a]));
      expect(byId['attack']!.enabled).toBe(true);
      expect(byId['dash']!.enabled).toBe(true);
      expect(byId['disengage']!.enabled).toBe(true);
      expect(byId['dodge']!.enabled).toBe(true);
      expect(byId['move']!.enabled).toBe(true);
    });

    it('reports no-target-in-range when the only foe is beyond melee reach', () => {
      const sword = makeItemInstance('longsword');
      const pc = buildFighter('Striker', [sword.id]);
      const foe = buildFighter('Far');
      const s = setupCombat([pc, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 25, y: 0 }], [sword]);
      const attack = s.engine.query.availableActions(s.campaign.state, s.encounterId, pc.id)
        .find((a) => a.action === 'attack')!;
      expect(attack.enabled).toBe(false);
      expect(attack.reason).toBe('no-target-in-range');
    });

    it('reports the blocking-condition id when stunned', () => {
      const pc = buildFighter('Stunned', [], {
        appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'stunned' }],
      });
      const foe = buildFighter('Foe');
      const s = setupCombat([pc, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
      const attack = s.engine.query.availableActions(s.campaign.state, s.encounterId, pc.id)
        .find((a) => a.action === 'attack')!;
      expect(attack.enabled).toBe(false);
      expect(attack.reason).toBe('stunned');
    });
  });

  describe('legalTargets', () => {
    it('attack: returns an in-reach foe and excludes one beyond melee reach', () => {
      const sword = makeItemInstance('longsword'); // 5 ft reach
      const pc = buildFighter('Striker', [sword.id]);
      const near = buildFighter('Near');
      const far = buildFighter('Far');
      const s = setupCombat(
        [pc, near, far],
        buildOpenMap,
        [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 25, y: 0 }],
        [sword],
      );
      const targets = s.engine.query.legalTargets(s.campaign.state, s.encounterId, pc.id, 'attack');
      const ids = targets.map((t) => t.combatantId);
      expect(ids).toContain(near.id);
      expect(ids).not.toContain(far.id);
    });

    it('attack: excludes a foe behind an impassable wall (no line of sight)', () => {
      const bow = makeItemInstance('longbow');
      const archer = buildFighter('Archer', [bow.id]);
      const hidden = buildFighter('Hidden');
      // Archer at (0,0), foe at (15,0) — wall column at cell-x=2 blocks LoS.
      const s = setupCombat([archer, hidden], buildWalledMap, [{ x: 0, y: 0 }, { x: 15, y: 0 }], [bow]);
      const targets = s.engine.query.legalTargets(s.campaign.state, s.encounterId, archer.id, 'attack');
      expect(targets.map((t) => t.combatantId)).not.toContain(hidden.id);
    });

    it('non-attack actions have no targets', () => {
      const pc = buildFighter('PC');
      const foe = buildFighter('Foe');
      const s = setupCombat([pc, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
      expect(s.engine.query.legalTargets(s.campaign.state, s.encounterId, pc.id, 'dodge')).toEqual([]);
    });
  });

  // Slice 758: affordance fidelity to the attack planner.
  describe('slice 758: attack affordance fidelity', () => {
    it('legalTargets includes a foe beyond normal range but within long range (ranged weapon)', () => {
      // Sling: normal 30 ft, long 120 ft. A foe at 35 ft is a legal attack
      // (with Disadvantage) the planner accepts; the query must not omit it.
      const sling = makeItemInstance('sling');
      const slinger = buildFighter('Slinger', [sling.id]);
      const foe = buildFighter('Far', [], { hp: { current: 12, max: 12, temp: 0, maxBonus: 0 } });
      const s = setupCombat([slinger, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 35, y: 0 }], [sling]);
      const ids = s.engine.query
        .legalTargets(s.campaign.state, s.encounterId, slinger.id, 'attack')
        .map((t) => t.combatantId);
      expect(ids).toContain(foe.id);
      // And the action surfaces as available (not no-target-in-range).
      const attack = s.engine.query.availableActions(s.campaign.state, s.encounterId, slinger.id)
        .find((a) => a.action === 'attack')!;
      expect(attack.enabled).toBe(true);
    });

    it('attack stays enabled mid-Extra-Attack (action used, attacks remaining)', () => {
      const sword = makeItemInstance('longsword');
      const fighter = buildFighter('Striker', [sword.id], {
        classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
      });
      const foe = buildFighter('Foe', [], { hp: { current: 40, max: 40, temp: 0, maxBonus: 0 } });
      const s = setupCombat([fighter, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 5, y: 0 }], [sword]);
      // Spend the Attack action on the first of two attacks (Extra Attack, L5).
      s.campaign = commit(
        s.campaign,
        s.engine.plan.attack(s.campaign.state, { attackerId: fighter.id, targetId: foe.id, weaponInstanceId: sword.id }).events,
      );
      const ae = s.engine.query.actionEconomy(s.campaign.state, s.encounterId, fighter.id)!;
      expect(ae.attacks).toMatchObject({ perAction: 2, madeThisTurn: 1, remaining: 1 });
      const attack = s.engine.query.availableActions(s.campaign.state, s.encounterId, fighter.id)
        .find((a) => a.action === 'attack')!;
      expect(attack.enabled, 'attack should remain enabled with an Extra Attack left').toBe(true);
      // The once-per-action intents are now spent (the action was used).
      const dash = s.engine.query.availableActions(s.campaign.state, s.encounterId, fighter.id)
        .find((a) => a.action === 'dash')!;
      expect(dash).toMatchObject({ enabled: false, reason: 'action-used' });
    });

    it('attack disabled (action-used) once the full attack budget is spent', () => {
      const sword = makeItemInstance('longsword');
      const fighter = buildFighter('Striker', [sword.id]); // L1 → 1 attack
      const foe = buildFighter('Foe', [], { hp: { current: 40, max: 40, temp: 0, maxBonus: 0 } });
      const s = setupCombat([fighter, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 5, y: 0 }], [sword]);
      s.campaign = commit(
        s.campaign,
        s.engine.plan.attack(s.campaign.state, { attackerId: fighter.id, targetId: foe.id, weaponInstanceId: sword.id }).events,
      );
      const attack = s.engine.query.availableActions(s.campaign.state, s.encounterId, fighter.id)
        .find((a) => a.action === 'attack')!;
      expect(attack).toMatchObject({ enabled: false, reason: 'action-used' });
    });
  });

  describe('castableSpells', () => {
    it('lists prepared spells with a usable slot, plus their level options; cantrips are [0]', () => {
      const wiz = buildWizard('Caster', {
        knownSpells: ['fire-bolt', 'magic-missile'],
        preparedSpells: ['magic-missile'],
      });
      const foe = buildFighter('Foe');
      const s = setupCombat([wiz, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
      const castable = s.engine.query.castableSpells(s.campaign.state, wiz.id);
      const byId = Object.fromEntries(castable.map((c) => [c.spellId, c]));
      // Fire Bolt is a cantrip → level option [0].
      expect(byId['fire-bolt']).toBeDefined();
      expect(byId['fire-bolt']!.minLevel).toBe(0);
      expect(byId['fire-bolt']!.levelOptions).toEqual([0]);
      // Magic Missile is L1; an L3 wizard has L1 + L2 slots → options include 1 and 2.
      expect(byId['magic-missile']).toBeDefined();
      expect(byId['magic-missile']!.minLevel).toBe(1);
      expect(byId['magic-missile']!.levelOptions).toContain(1);
      expect(byId['magic-missile']!.levelOptions).toContain(2);
      // Deterministic order by spellId.
      const ids = castable.map((c) => c.spellId);
      expect(ids).toEqual([...ids].sort());
    });
  });
});

// Slice 899: `legaltargets-surfaces-total-cover`. The attack planner rejects a
// target the consumer marks with Total Cover ("has total cover and cannot be
// targeted"), but `legalTargets` didn't mirror that — so the UI surfaced a
// dead-end "valid" target. legalTargets now accepts the same consumer cover map
// and drops 'total'-cover candidates (cover is consumer-supplied — the engine
// doesn't derive it, `cover-not-derived`).
describe('slice 899: legalTargets honors consumer-supplied Total Cover', () => {
  it('drops a target the consumer marks as Total Cover (positioned), but keeps it when cover omitted', () => {
    const sword = makeItemInstance('longsword');
    const pc = buildFighter('Striker', [sword.id]);
    const foe = buildFighter('Covered');
    const s = setupCombat([pc, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 5, y: 0 }], [sword]);
    // Omitted cover → the in-reach foe is a legal target (prior behavior).
    expect(
      s.engine.query.legalTargets(s.campaign.state, s.encounterId, pc.id, 'attack').map((t) => t.combatantId),
    ).toContain(foe.id);
    // Marked Total Cover → dropped, mirroring the planner's rejection.
    expect(
      s.engine.query
        .legalTargets(s.campaign.state, s.encounterId, pc.id, 'attack', { [foe.id]: 'total' })
        .map((t) => t.combatantId),
    ).not.toContain(foe.id);
    // Cross-check: the planner does reject that exact attack.
    expect(() =>
      s.engine.plan.attack(s.campaign.state, {
        attackerId: pc.id, targetId: foe.id, weaponInstanceId: sword.id, cover: 'total',
      }),
    ).toThrow(/total cover/i);
  });

  it('keeps a target with partial (half / three-quarters) cover — only Total Cover blocks targeting', () => {
    const sword = makeItemInstance('longsword');
    const pc = buildFighter('Striker', [sword.id]);
    const foe = buildFighter('Behind');
    const s = setupCombat([pc, foe], buildOpenMap, [{ x: 0, y: 0 }, { x: 5, y: 0 }], [sword]);
    for (const cover of ['half', 'three-quarters'] as const) {
      expect(
        s.engine.query
          .legalTargets(s.campaign.state, s.encounterId, pc.id, 'attack', { [foe.id]: cover })
          .map((t) => t.combatantId),
      ).toContain(foe.id);
    }
  });

  it('drops a Total-Cover target in positionless mode too (cover is map-independent)', () => {
    const pc = buildFighter('Striker');
    const foe = buildFighter('Covered');
    // No map builder / no positions → positionless mode.
    const s = setupCombat([pc, foe], null, [undefined, undefined]);
    expect(
      s.engine.query.legalTargets(s.campaign.state, s.encounterId, pc.id, 'attack').map((t) => t.combatantId),
    ).toContain(foe.id);
    expect(
      s.engine.query
        .legalTargets(s.campaign.state, s.encounterId, pc.id, 'attack', { [foe.id]: 'total' })
        .map((t) => t.combatantId),
    ).not.toContain(foe.id);
  });
});
