// Slice 787: opt-in `aim` enforcement in cast-spell. When the caller supplies
// an `aim` on an area spell, the engine runs the canonical rasterizer (slice
// 786) and applies saves/damage to exactly the creatures the template covers
// (with line of effect) — the engine owns membership instead of trusting
// consumer `targetIds`. Closes the `aoe-shape-coverage` L7 blocker.

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
    knownSpells: ['fireball', 'burning-hands'],
    preparedSpells: ['fireball', 'burning-hands'],
  });

const buildFoe = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 8, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const mapEvent = (locationId: string, impassable: ReadonlyArray<[number, number]>): LocationCreatedEvent => {
  const terrain = Array.from({ length: 12 }, () => new Array<'normal' | 'impassable'>(40).fill('normal'));
  for (const [x, y] of impassable) terrain[y]![x] = 'impassable';
  return {
    id: eventId(),
    at: isoTimestamp(),
    type: 'LocationCreated',
    locationId: locationId as ULID,
    name: 'Arena',
    map: { widthCells: 40, heightCells: 12, cellSizeFeet: 5, terrain },
  };
};

interface Foe {
  readonly name: string;
  readonly feet: { x: number; y: number };
}

interface Setup {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
  casterId: string;
  ids: Record<string, string>;
  hpOf: (campaign: Campaign, id: string) => number;
}

const setup = (foes: Foe[], impassable: ReadonlyArray<[number, number]> = []): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  const caster = buildWizard();
  const foeChars = foes.map((f) => ({ def: buildFoe(f.name), spec: f }));
  let campaign: Campaign = engine.createCampaign({ name: 'aim' });
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
        { combatantId: caster.id as ULID, d20: 18, modifier: 2, total: 20 },
        ...foeChars.map((f) => ({ combatantId: f.def.id as ULID, d20: 10, modifier: 1, total: 11 })),
      ],
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: created.encounterId as ULID } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: created.encounterId as ULID, combatantId: caster.id as ULID, round: 1 } satisfies TurnStartedEvent,
  ]);
  const ids: Record<string, string> = { Caster: caster.id };
  for (const f of foeChars) ids[f.spec.name] = f.def.id;
  const hpOf = (c: Campaign, id: string): number => c.state.characters[id]!.hp.current;
  return { engine, campaign, encounterId: created.encounterId, casterId: caster.id, ids, hpOf };
};

describe('cast-spell aim enforcement (slice 787)', () => {
  it('damages every creature the Fireball template covers — including a far-edge foe past the caster range', () => {
    // Burst at feet (140,0) = cell (28,0). Caster at (0,0).
    const s = setup([
      { name: 'AtCenter', feet: { x: 140, y: 0 } }, // cell (28,0)
      { name: 'FarEdge', feet: { x: 160, y: 0 } }, // cell (32,0): in blast (20 ft) but 160 ft from caster (> 150 range)
      { name: 'Outside', feet: { x: 175, y: 0 } }, // cell (35,0): 35 ft from burst, out
    ]);
    const events = s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.casterId,
      spellId: 'fireball',
      slotLevel: 3,
      targetIds: [], // ignored: aim drives membership
      aim: { x: 140, y: 0 },
    }).events;
    const declared = events.find((e) => e.type === 'SpellCastDeclared') as { targetIds: string[] };
    expect(declared.targetIds).toContain(s.ids.AtCenter);
    expect(declared.targetIds).toContain(s.ids.FarEdge);
    expect(declared.targetIds).not.toContain(s.ids.Outside);

    const after = commit(s.campaign, events);
    expect(s.hpOf(after, s.ids.AtCenter!)).toBeLessThan(30);
    expect(s.hpOf(after, s.ids.FarEdge!)).toBeLessThan(30); // the correctness win
    expect(s.hpOf(after, s.ids.Outside!)).toBe(30);
  });

  it('spares a creature inside the blast but behind Total Cover (impassable wall)', () => {
    // Burst at cell (28,0); foe at cell (32,0); wall at (30,0) breaks LoE.
    const s = setup(
      [
        { name: 'Exposed', feet: { x: 145, y: 0 } }, // cell (29,0): no wall between
        { name: 'Shadowed', feet: { x: 160, y: 0 } }, // cell (32,0): wall at (30,0) between burst and foe
      ],
      [[30, 0]],
    );
    const events = s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.casterId,
      spellId: 'fireball',
      slotLevel: 3,
      targetIds: [],
      aim: { x: 140, y: 0 },
    }).events;
    const after = commit(s.campaign, events);
    expect(s.hpOf(after, s.ids.Exposed!)).toBeLessThan(30);
    expect(s.hpOf(after, s.ids.Shadowed!)).toBe(30);
  });

  it('enforces the Self cone direction (Burning Hands) from the aim', () => {
    const s = setup([
      { name: 'InCone', feet: { x: 10, y: 5 } }, // cell (2,1): inside the +x wedge
      { name: 'BehindCaster', feet: { x: 10, y: 25 } }, // cell (2,5): far off-axis, not in the wedge
    ]);
    const events = s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.casterId,
      spellId: 'burning-hands',
      slotLevel: 1,
      targetIds: [],
      aim: { x: 15, y: 0 }, // aim +x
    }).events;
    const declared = events.find((e) => e.type === 'SpellCastDeclared') as { targetIds: string[] };
    expect(declared.targetIds).toContain(s.ids.InCone);
    expect(declared.targetIds).not.toContain(s.ids.BehindCaster);
  });

  it('without an aim, the cast still trusts the supplied targetIds verbatim (backward compatible)', () => {
    const s = setup([
      { name: 'Picked', feet: { x: 30, y: 0 } },
      { name: 'NotPicked', feet: { x: 35, y: 0 } }, // adjacent, but not in targetIds
    ]);
    const events = s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.casterId,
      spellId: 'fireball',
      slotLevel: 3,
      targetIds: [s.ids.Picked!], // no aim → honored as-is
    }).events;
    const declared = events.find((e) => e.type === 'SpellCastDeclared') as { targetIds: string[] };
    expect(declared.targetIds).toEqual([s.ids.Picked]);
    const after = commit(s.campaign, events);
    expect(s.hpOf(after, s.ids.Picked!)).toBeLessThan(30);
    expect(s.hpOf(after, s.ids.NotPicked!)).toBe(30);
  });
});
