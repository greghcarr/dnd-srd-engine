// Slice 786: `creaturesInSpellArea` — the state-aware AoE rasterizer query.
// Given an area spell, the caster, and an aim point (in feet), it returns the
// combatant ids the template covers AND that have line of effect from the
// point of origin. Closes the seam half of the `aoe-shape-coverage` blocker:
// one canonical answer for "who's in the cone/sphere?" so consumers stop
// hand-rolling geometry.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newLocationId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
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
import type { ULID } from '../../../src/engine/ids-utils.js';
import type { Event } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 27, max: 27, temp: 0 },
    knownSpells: ['fireball', 'burning-hands', 'fire-bolt'],
    preparedSpells: ['fireball', 'burning-hands', 'fire-bolt'],
  });

const buildFoe = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 24, max: 24, temp: 0 },
  });

const mapEvent = (locationId: string, impassable: ReadonlyArray<[number, number]>): LocationCreatedEvent => {
  const terrain = Array.from({ length: 20 }, () => new Array<'normal' | 'impassable'>(30).fill('normal'));
  for (const [x, y] of impassable) terrain[y]![x] = 'impassable';
  return {
    id: eventId(),
    at: isoTimestamp(),
    type: 'LocationCreated',
    locationId: locationId as ULID,
    name: 'Arena',
    map: { widthCells: 30, heightCells: 20, cellSizeFeet: 5, terrain },
  };
};

interface Combatant {
  readonly name: string;
  readonly feet: { x: number; y: number };
}

interface Setup {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
  casterId: string;
  ids: Record<string, string>; // name → combatantId
}

// Caster at (0,0); each foe at its given feet position. `impassable` walls
// are cell coordinates.
const setup = (foes: Combatant[], impassable: ReadonlyArray<[number, number]> = []): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const caster = buildWizard();
  const foeChars = foes.map((f) => ({ def: buildFoe(f.name), spec: f }));
  let campaign: Campaign = engine.createCampaign({ name: 'aoe' });
  const locationId = newLocationId();
  const pre: Event[] = [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    ...foeChars.map(
      (f) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: f.def }) satisfies CharacterCreatedEvent,
    ),
    mapEvent(locationId, impassable),
    { id: eventId(), at: isoTimestamp(), type: 'CharacterLocationChanged', characterId: caster.id as ULID, toLocationId: locationId as ULID } satisfies CharacterLocationChangedEvent,
    ...foeChars.map(
      (f) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterLocationChanged', characterId: f.def.id as ULID, toLocationId: locationId as ULID }) satisfies CharacterLocationChangedEvent,
    ),
  ];
  campaign = commit(campaign, pre);
  const created = engine.plan.createEncounter(campaign.state, {
    combatants: [
      { characterId: caster.id, position: { x: 0, y: 0 } },
      ...foeChars.map((f) => ({ characterId: f.def.id, position: f.spec.feet })),
    ],
  });
  campaign = commit(campaign, [
    ...created.events,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId: created.encounterId as ULID,
      rolls: [
        { combatantId: caster.id as ULID, d20: 15, modifier: 2, total: 17 },
        ...foeChars.map((f) => ({ combatantId: f.def.id as ULID, d20: 10, modifier: 1, total: 11 })),
      ],
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: created.encounterId as ULID } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: created.encounterId as ULID, combatantId: caster.id as ULID, round: 1 } satisfies TurnStartedEvent,
  ]);
  const ids: Record<string, string> = { Caster: caster.id };
  for (const f of foeChars) ids[f.spec.name] = f.def.id;
  return { engine, campaign, encounterId: created.encounterId, casterId: caster.id, ids };
};

describe('creaturesInSpellArea — placed sphere (Fireball) (slice 786)', () => {
  // Burst centred at feet (50,0) = cell (10,0). Radius 20 ft = 4 cells.
  const s = setup([
    { name: 'AtCenter', feet: { x: 50, y: 0 } }, // cell (10,0): the burst point
    { name: 'AtEdge', feet: { x: 70, y: 0 } }, // cell (14,0): exactly 20 ft
    { name: 'JustOut', feet: { x: 75, y: 0 } }, // cell (15,0): 25 ft
  ]);
  const inArea = s.engine.query.creaturesInSpellArea(s.campaign.state, s.encounterId, s.casterId, 'fireball', { x: 50, y: 0 });

  it('covers creatures within the radius of the aimed burst point', () => {
    expect(inArea).toContain(s.ids.AtCenter);
    expect(inArea).toContain(s.ids.AtEdge);
  });
  it('excludes a creature just beyond the radius, and the distant caster', () => {
    expect(inArea).not.toContain(s.ids.JustOut);
    expect(inArea).not.toContain(s.ids.Caster);
  });
});

describe('creaturesInSpellArea — Self cone (Burning Hands) (slice 786)', () => {
  // Caster at (0,0), aim +x at feet (15,0). 15-ft cone, width = distance.
  const s = setup([
    { name: 'OnAxis', feet: { x: 10, y: 0 } }, // cell (2,0)
    { name: 'InWedge', feet: { x: 10, y: 5 } }, // cell (2,1): perp 5 ≤ half-width 5
    { name: 'TooWide', feet: { x: 10, y: 10 } }, // cell (2,2): perp 10 > 5
    { name: 'WrongWay', feet: { x: 25, y: 0 } }, // cell (5,0): beyond the 15-ft length
  ]);
  const inArea = s.engine.query.creaturesInSpellArea(s.campaign.state, s.encounterId, s.casterId, 'burning-hands', { x: 15, y: 0 });

  it('covers the cone wedge in the aimed direction', () => {
    expect(inArea).toContain(s.ids.OnAxis);
    expect(inArea).toContain(s.ids.InWedge);
  });
  it('excludes creatures outside the wedge or past the length, and the caster (origin)', () => {
    expect(inArea).not.toContain(s.ids.TooWide);
    expect(inArea).not.toContain(s.ids.WrongWay);
    expect(inArea).not.toContain(s.ids.Caster);
  });
});

describe('creaturesInSpellArea — line of effect + allegiance (slice 786)', () => {
  it('excludes a creature inside the radius but behind Total Cover (impassable wall)', () => {
    // Burst at cell (10,0); foe at cell (14,0) inside radius; wall at (12,0).
    const s = setup(
      [{ name: 'Shadowed', feet: { x: 70, y: 0 } }],
      [[12, 0]],
    );
    const inArea = s.engine.query.creaturesInSpellArea(s.campaign.state, s.encounterId, s.casterId, 'fireball', { x: 50, y: 0 });
    expect(inArea).not.toContain(s.ids.Shadowed);
  });

  it('catches the caster too when the burst is centred on them (AoEs hit friend and foe)', () => {
    const s = setup([{ name: 'Bystander', feet: { x: 5, y: 0 } }]);
    const inArea = s.engine.query.creaturesInSpellArea(s.campaign.state, s.encounterId, s.casterId, 'fireball', { x: 0, y: 0 });
    expect(inArea).toContain(s.ids.Caster);
    expect(inArea).toContain(s.ids.Bystander);
  });
});

describe('creaturesInSpellArea — graceful degradation (slice 786)', () => {
  it('returns [] for a spell with no area (single-target)', () => {
    const s = setup([{ name: 'Foe', feet: { x: 10, y: 0 } }]);
    expect(s.engine.query.creaturesInSpellArea(s.campaign.state, s.encounterId, s.casterId, 'fire-bolt', { x: 10, y: 0 })).toEqual([]);
  });
  it('returns [] for an unknown spell id', () => {
    const s = setup([{ name: 'Foe', feet: { x: 10, y: 0 } }]);
    expect(s.engine.query.creaturesInSpellArea(s.campaign.state, s.encounterId, s.casterId, 'no-such-spell', { x: 10, y: 0 })).toEqual([]);
  });
});
