// Slice 685: range + line-of-sight enforcement on plan.attack and
// plan.castSpell, gated on positions + map being present (Work item 3
// of the spatial combat plan).
//
// What this audit pins:
//   1. Attack: positioned attacker + target in range + clear LoS →
//      AttackRolled emitted (no throw).
//   2. Attack: positioned attacker + target out of melee reach →
//      throws "can't reach: target is Nft away (reach 5ft)".
//   3. Attack: positioned attacker + target with wall between →
//      throws "line of sight blocked".
//   4. Cast spell: positioned caster + target in range + clear LoE
//      → SpellCastDeclared emitted (no throw).
//   5. Cast spell: positioned caster + target outside spell range
//      (Fire Bolt = 120 ft) → throws "spell range 120 ft".
//   6. Cast spell: positioned caster + target with wall between →
//      throws "line of effect blocked".
//   7. Back-compat: positionless encounter (no position on combatant)
//      → no range / LoS enforcement (gate is a no-op).
//   8. parseSpellRange handles the RAW shape vocabulary correctly
//      (self / touch / Nft / unenforced).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newLocationId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  EncounterCreatedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type {
  LocationCreatedEvent,
  CharacterLocationChangedEvent,
} from '../../../src/schemas/events/locations.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SpellCastDeclaredEvent } from '../../../src/schemas/events/spellcasting.js';
import type { ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import type { ULID } from '../../../src/engine/ids-utils.js';
import type { Event } from '../../../src/schemas/events/index.js';
import {
  parseSpellRange,
  enforceableSpellRangeFeet,
} from '../../../src/engine/plan/_spatial-gates.js';

const PACK = loadStarterPack();

const buildFighter = (name: string, equipped: string[] = []): Character =>
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
  });

const buildWizard = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 18, max: 18, temp: 0 },
  });

// 6x6 grid, 5 ft cells (30 ft x 30 ft). All-normal terrain.
const buildOpenMap = (locationId: string): LocationCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'LocationCreated',
  locationId: locationId as ULID,
  name: 'Open Arena',
  map: {
    widthCells: 6,
    heightCells: 6,
    cellSizeFeet: 5,
    terrain: [
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ],
  },
});

// 6x6 grid with a vertical impassable wall at cell-x=2 spanning y=0..5
// EXCEPT one open column at the bottom (y=5) so combatants in y=0 can
// be on opposite sides of the wall at cell-x=0 and cell-x=4 with no
// LoS (Bresenham ray through y=0 hits the wall at x=2).
const buildWalledMap = (locationId: string): LocationCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'LocationCreated',
  locationId: locationId as ULID,
  name: 'Walled Arena',
  map: {
    widthCells: 6,
    heightCells: 6,
    cellSizeFeet: 5,
    terrain: [
      ['normal', 'normal', 'impassable', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'impassable', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'impassable', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'impassable', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'impassable', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ],
  },
});

interface SetupResult {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
}

const setupCombat = (
  characters: Character[],
  mapBuilder: ((locationId: string) => LocationCreatedEvent) | null,
  positions: ReadonlyArray<{ x: number; y: number } | undefined>,
  items: ItemInstance[] = [],
): SetupResult => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'spatial-685' });
  const locationId = newLocationId();
  const preEvents: Event[] = [
    ...items.map((inst) => ({
      id: eventId(),
      at: isoTimestamp(),
      type: 'ItemAcquired' as const,
      instance: inst,
    })),
    ...characters.map((c) => ({
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated' as const,
      snapshot: c,
    } satisfies CharacterCreatedEvent)),
  ];
  if (mapBuilder !== null) {
    preEvents.push(mapBuilder(locationId));
    for (const c of characters) {
      preEvents.push({
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterLocationChanged' as const,
        characterId: c.id as ULID,
        toLocationId: locationId as ULID,
      } satisfies CharacterLocationChangedEvent);
    }
  }
  campaign = commit(campaign, preEvents);
  // Build combatants payload. Positionless combatants are omitted from
  // the `combatants` array per the slice-683 either-or; if ANY position
  // is undefined we fall back to combatantIds.
  const allPositioned = positions.every((p) => p !== undefined);
  const created = allPositioned
    ? engine.plan.createEncounter(campaign.state, {
        combatants: characters.map((c, i) => ({
          characterId: c.id,
          position: positions[i]!,
        })),
      })
    : engine.plan.createEncounter(campaign.state, {
        combatantIds: characters.map((c) => c.id),
      });
  campaign = commit(campaign, [
    ...created.events,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId: created.encounterId as ULID,
      rolls: characters.map((c, i) => ({
        combatantId: c.id as ULID,
        d20: 15 - i,
        modifier: 2,
        total: 17 - i,
      })),
    } satisfies InitiativeRolledEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'EncounterStarted',
      encounterId: created.encounterId as ULID,
    } satisfies EncounterStartedEvent,
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

describe('slice 685: range + line-of-sight enforcement', () => {
  describe('plan.attack', () => {
    it('positioned attacker + adjacent target + clear LoS → AttackRolled', () => {
      const longsword = makeItemInstance('longsword');
      const attacker = buildFighter('Striker', [longsword.id]);
      const target = buildFighter('Dummy');
      const s = setupCombat(
        [attacker, target],
        buildOpenMap,
        [{ x: 0, y: 0 }, { x: 5, y: 0 }], // 1 cell apart (5 ft)
        [longsword],
      );
      const out = s.engine.plan.attack(s.campaign.state, {
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      });
      const rolled = out.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      expect(rolled, 'attack should resolve normally').toBeDefined();
    });

    it('positioned attacker + melee target out of reach → throws', () => {
      const longsword = makeItemInstance('longsword');
      const attacker = buildFighter('Striker', [longsword.id]);
      const target = buildFighter('Faraway');
      const s = setupCombat(
        [attacker, target],
        buildOpenMap,
        [{ x: 0, y: 0 }, { x: 15, y: 0 }], // 3 cells apart (15 ft), longsword reach is 5 ft
        [longsword],
      );
      expect(() =>
        s.engine.plan.attack(s.campaign.state, {
          attackerId: attacker.id,
          targetId: target.id,
          weaponInstanceId: longsword.id,
        }),
      ).toThrow(/can't reach|reach 5ft|target is 15ft away/i);
    });

    it('positioned attacker + target with wall between → throws (LoS blocked)', () => {
      // Both at y=0; attacker at x=0, target at x=15 (cell-x=3).
      // Wall column at cell-x=2 → Bresenham ray crosses (2,0) which
      // is impassable → LoS blocked.
      const longbow = makeItemInstance('longbow');
      const attacker = buildFighter('Archer', [longbow.id]);
      const target = buildFighter('BehindWall');
      const s = setupCombat(
        [attacker, target],
        buildWalledMap,
        [{ x: 0, y: 0 }, { x: 15, y: 0 }],
        [longbow],
      );
      expect(() =>
        s.engine.plan.attack(s.campaign.state, {
          attackerId: attacker.id,
          targetId: target.id,
          weaponInstanceId: longbow.id,
        }),
      ).toThrow(/line of sight blocked/i);
    });

    it('positionless encounter: range/LoS gate is a no-op (back-compat)', () => {
      const longsword = makeItemInstance('longsword');
      const attacker = buildFighter('Unpositioned', [longsword.id]);
      const target = buildFighter('AlsoUnpositioned');
      const s = setupCombat(
        [attacker, target],
        null,
        [undefined, undefined], // no positions; no map
        [longsword],
      );
      // No throw — pre-685 behavior preserved.
      const out = s.engine.plan.attack(s.campaign.state, {
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      });
      const rolled = out.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      expect(rolled, 'positionless attack should still resolve').toBeDefined();
    });
  });

  describe('plan.castSpell', () => {
    it('positioned caster + target in range + clear LoE → SpellCastDeclared', () => {
      const caster = buildWizard('Caster');
      const target = buildFighter('Target');
      const s = setupCombat(
        [caster, target],
        buildOpenMap,
        [{ x: 0, y: 0 }, { x: 25, y: 0 }], // 25 ft apart, well within Fire Bolt's 120 ft
      );
      const out = s.engine.plan.castSpell(s.campaign.state, {
        characterId: caster.id,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [target.id],
        ignorePreparation: true,
      });
      const declared = out.events.find(
        (e): e is SpellCastDeclaredEvent => e.type === 'SpellCastDeclared',
      );
      expect(declared, 'cast should resolve normally').toBeDefined();
    });

    it('positioned caster + out-of-range target → throws (spell range)', () => {
      // Fire Bolt is 120 ft. We need a map that allows > 120 ft
      // separation, so build a wider open map for this case.
      const caster = buildWizard('Caster');
      const target = buildFighter('Distant');
      const farMap = (locationId: string): LocationCreatedEvent => ({
        id: eventId(),
        at: isoTimestamp(),
        type: 'LocationCreated',
        locationId: locationId as ULID,
        name: 'Long Hall',
        map: {
          widthCells: 30,
          heightCells: 2,
          cellSizeFeet: 5,
          terrain: [
            new Array<'normal'>(30).fill('normal'),
            new Array<'normal'>(30).fill('normal'),
          ],
        },
      });
      const s = setupCombat(
        [caster, target],
        farMap,
        [{ x: 0, y: 0 }, { x: 145, y: 0 }], // 145 ft apart > 120 ft Fire Bolt range
      );
      expect(() =>
        s.engine.plan.castSpell(s.campaign.state, {
          characterId: caster.id,
          spellId: 'fire-bolt',
          slotLevel: 0,
          targetIds: [target.id],
          ignorePreparation: true,
        }),
      ).toThrow(/spell range 120 ft|145 ft away/i);
    });

    it('positioned caster + target with wall between → throws (LoE blocked)', () => {
      const caster = buildWizard('Caster');
      const target = buildFighter('Hidden');
      const s = setupCombat(
        [caster, target],
        buildWalledMap,
        [{ x: 0, y: 0 }, { x: 15, y: 0 }],
      );
      expect(() =>
        s.engine.plan.castSpell(s.campaign.state, {
          characterId: caster.id,
          spellId: 'fire-bolt',
          slotLevel: 0,
          targetIds: [target.id],
          ignorePreparation: true,
        }),
      ).toThrow(/line of effect blocked/i);
    });

    it('positionless encounter: spell range/LoE gate is a no-op (back-compat)', () => {
      const caster = buildWizard('Caster');
      const target = buildFighter('Target');
      const s = setupCombat(
        [caster, target],
        null,
        [undefined, undefined],
      );
      // No throw — pre-685 behavior preserved.
      const out = s.engine.plan.castSpell(s.campaign.state, {
        characterId: caster.id,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [target.id],
        ignorePreparation: true,
      });
      const declared = out.events.find(
        (e): e is SpellCastDeclaredEvent => e.type === 'SpellCastDeclared',
      );
      expect(declared).toBeDefined();
    });

    it('self-targeted spell range skips enforcement even with positions', () => {
      // Caster is the only target → kind 'self'-equivalent loop branch
      // skips the assertion. Use a wide-open map but cast Fire Bolt at
      // self via targetIds = [caster.id]; the per-target loop has an
      // explicit `if (targetId === intent.characterId) continue;` so no
      // self-range error fires.
      const caster = buildWizard('Caster');
      const s = setupCombat([caster], buildOpenMap, [{ x: 0, y: 0 }]);
      // Casting Fire Bolt at self is mechanically silly but exercises
      // the self-target skip; the gate should not error.
      const out = s.engine.plan.castSpell(s.campaign.state, {
        characterId: caster.id,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [caster.id],
        ignorePreparation: true,
      });
      const declared = out.events.find(
        (e): e is SpellCastDeclaredEvent => e.type === 'SpellCastDeclared',
      );
      expect(declared).toBeDefined();
    });
  });

  describe('parseSpellRange', () => {
    it('parses "Self" as { kind: "self" }', () => {
      expect(parseSpellRange('Self')).toEqual({ kind: 'self' });
      expect(parseSpellRange('self')).toEqual({ kind: 'self' });
      expect(parseSpellRange('Self (10-foot radius)')).toEqual({ kind: 'self' });
    });

    it('parses "Touch" as { kind: "touch" }', () => {
      expect(parseSpellRange('Touch')).toEqual({ kind: 'touch' });
      expect(parseSpellRange('touch')).toEqual({ kind: 'touch' });
    });

    it('parses "N feet" / "N ft" as { kind: "feet", feet: N }', () => {
      expect(parseSpellRange('60 feet')).toEqual({ kind: 'feet', feet: 60 });
      expect(parseSpellRange('120 feet')).toEqual({ kind: 'feet', feet: 120 });
      expect(parseSpellRange('30 ft')).toEqual({ kind: 'feet', feet: 30 });
      // Compound shape: "30 feet (10-foot-radius sphere)" → still parses
      // the leading feet number.
      expect(parseSpellRange('30 feet (10-foot-radius sphere)')).toEqual({
        kind: 'feet',
        feet: 30,
      });
    });

    it('parses non-finite RAW shapes as { kind: "unenforced" }', () => {
      expect(parseSpellRange('Special')).toEqual({ kind: 'unenforced' });
      expect(parseSpellRange('Sight')).toEqual({ kind: 'unenforced' });
      expect(parseSpellRange('1 mile')).toEqual({ kind: 'unenforced' });
      expect(parseSpellRange('Unlimited')).toEqual({ kind: 'unenforced' });
    });

    it('enforceableSpellRangeFeet returns the right gate-feet for each kind', () => {
      expect(enforceableSpellRangeFeet({ kind: 'self' })).toBeUndefined();
      expect(enforceableSpellRangeFeet({ kind: 'unenforced' })).toBeUndefined();
      expect(enforceableSpellRangeFeet({ kind: 'touch' })).toBe(5);
      expect(enforceableSpellRangeFeet({ kind: 'feet', feet: 120 })).toBe(120);
    });
  });
});
