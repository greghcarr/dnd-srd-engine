// Slice 713: spell affordances — enriched castableSpells metadata +
// legalSpellTargets. The dnd-web Spells menu buckets by castingTime and
// drives targeting from `target` / `rangeFeet` / `resolves`, parsing no
// spell text. legalSpellTargets returns the legal targets at a slot,
// honoring range + line of effect + target kind.

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

const SPELLS = ['fire-bolt', 'cure-wounds', 'hold-person', 'shield', 'fireball', 'healing-word', 'mage-armor', 'magic-missile', 'eldritch-blast'];

const buildWizard = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 27, max: 27, temp: 0 },
    knownSpells: SPELLS,
    preparedSpells: SPELLS,
    ...overrides,
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

const openMap = (locationId: string): LocationCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'LocationCreated',
  locationId: locationId as ULID,
  name: 'Arena',
  // 30 wide (150 ft) so a foe can sit out of Fire Bolt's 120 ft range
  // while still on the map; 12 tall keeps AOE-point enumeration small.
  map: {
    widthCells: 30,
    heightCells: 12,
    cellSizeFeet: 5,
    terrain: Array.from({ length: 12 }, () => new Array<'normal'>(30).fill('normal')),
  },
});

interface Setup {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
  casterId: string;
  foeId: string;
}

// Caster at (0,0); foe at the given cell-distance (feet) along +x.
const setup = (foeFeet: { x: number; y: number }): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const caster = buildWizard();
  const foe = buildFoe('Foe');
  let campaign: Campaign = engine.createCampaign({ name: 'spell-aff' });
  const locationId = newLocationId();
  const pre: Event[] = [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: foe } satisfies CharacterCreatedEvent,
    openMap(locationId),
    { id: eventId(), at: isoTimestamp(), type: 'CharacterLocationChanged', characterId: caster.id as ULID, toLocationId: locationId as ULID } satisfies CharacterLocationChangedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterLocationChanged', characterId: foe.id as ULID, toLocationId: locationId as ULID } satisfies CharacterLocationChangedEvent,
  ];
  campaign = commit(campaign, pre);
  const created = engine.plan.createEncounter(campaign.state, {
    combatants: [
      { characterId: caster.id, position: { x: 0, y: 0 } },
      { characterId: foe.id, position: foeFeet },
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
        { combatantId: foe.id as ULID, d20: 10, modifier: 1, total: 11 },
      ],
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: created.encounterId as ULID } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: created.encounterId as ULID, combatantId: caster.id as ULID, round: 1 } satisfies TurnStartedEvent,
  ]);
  return { engine, campaign, encounterId: created.encounterId, casterId: caster.id, foeId: foe.id };
};

describe('slice 713: enriched castableSpells', () => {
  const spellsOf = () => {
    const s = setup({ x: 10, y: 0 });
    const list = s.engine.query.castableSpells(s.campaign.state, s.casterId);
    return Object.fromEntries(list.map((c) => [c.spellId, c]));
  };

  it('Fire Bolt: action / 120 ft / single enemy / attack', () => {
    const f = spellsOf()['fire-bolt']!;
    expect(f.castingTime).toBe('action');
    expect(f.rangeFeet).toBe(120);
    expect(f.resolves).toBe('attack');
    expect(f.concentration).toBe(false);
    expect(f.target).toEqual({ kind: 'creatures', maxTargets: 1, allow: 'enemies' });
  });

  it('Cure Wounds: heal / touch / allies', () => {
    const c = spellsOf()['cure-wounds']!;
    expect(c.resolves).toBe('heal');
    expect(c.rangeFeet).toBe('touch');
    expect(c.target).toEqual({ kind: 'creatures', maxTargets: 1, allow: 'allies' });
  });

  it('Hold Person: save (WIS) / concentration / enemies', () => {
    const h = spellsOf()['hold-person']!;
    expect(h.resolves).toBe('save');
    expect(h.saveAbility).toBe('WIS');
    expect(h.concentration).toBe(true);
    expect(h.target).toEqual({ kind: 'creatures', maxTargets: 1, allow: 'enemies' });
  });

  it('Shield: reaction / self', () => {
    const sh = spellsOf()['shield']!;
    expect(sh.castingTime).toBe('reaction');
    expect(sh.rangeFeet).toBe('self');
    expect(sh.target).toEqual({ kind: 'self' });
  });

  it('Healing Word: bonus-action', () => {
    expect(spellsOf()['healing-word']!.castingTime).toBe('bonus-action');
  });

  it('Fireball: point (sphere 20 ft) / save (DEX) / 150 ft', () => {
    const fb = spellsOf()['fireball']!;
    expect(fb.resolves).toBe('save');
    expect(fb.saveAbility).toBe('DEX');
    expect(fb.rangeFeet).toBe(150);
    expect(fb.target).toEqual({ kind: 'point', shape: 'sphere', sizeFeet: 20 });
  });

  it('deterministic order (by spellId) + cantrip levelOptions [0]', () => {
    const s = setup({ x: 10, y: 0 });
    const list = s.engine.query.castableSpells(s.campaign.state, s.casterId);
    const ids = list.map((c) => c.spellId);
    expect(ids).toEqual([...ids].sort());
    expect(list.find((c) => c.spellId === 'fire-bolt')!.levelOptions).toEqual([0]);
  });
});

describe('slice 713: legalSpellTargets', () => {
  it('self spell → { kind: self }', () => {
    const s = setup({ x: 10, y: 0 });
    expect(s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'shield', 0)).toEqual({ kind: 'self' });
  });

  it('single-creature attack: foe in range + LoS is a candidate', () => {
    const s = setup({ x: 10, y: 0 }); // 10 ft, within Fire Bolt 120
    const r = s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'fire-bolt', 0);
    expect(r.kind).toBe('creatures');
    if (r.kind !== 'creatures') return;
    expect(r.maxTargets).toBe(1);
    expect(r.candidates.map((c) => c.combatantId)).toContain(s.foeId);
    expect(r.candidates.map((c) => c.combatantId)).not.toContain(s.casterId); // attack excludes self
  });

  it('out-of-range foe is excluded (Fire Bolt 120 ft; foe at 145 ft)', () => {
    const s = setup({ x: 145, y: 0 });
    const r = s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'fire-bolt', 0);
    if (r.kind !== 'creatures') throw new Error('expected creatures');
    expect(r.candidates.map((c) => c.combatantId)).not.toContain(s.foeId);
  });

  it('beneficial spell includes the caster (Cure Wounds, allies)', () => {
    const s = setup({ x: 10, y: 0 });
    const r = s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'cure-wounds', 1);
    if (r.kind !== 'creatures') throw new Error('expected creatures');
    expect(r.candidates.map((c) => c.combatantId)).toContain(s.casterId);
  });

  it('AOE spell → points within range + LoE, deterministically ordered', () => {
    const s = setup({ x: 10, y: 0 });
    const r = s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'fireball', 3);
    expect(r.kind).toBe('points');
    if (r.kind !== 'points') return;
    expect(r.cells.length).toBeGreaterThan(0);
    const keys = r.cells.map((c) => `${c.x},${c.y}`);
    expect(keys).toEqual([...keys].sort((a, b) => {
      const [ax, ay] = a.split(',').map(Number);
      const [bx, by] = b.split(',').map(Number);
      return ax! - bx! || ay! - by!;
    }));
  });
});

describe('slice 716: multi-target maxTargets', () => {
  const spellsOf = () => {
    const s = setup({ x: 10, y: 0 });
    const list = s.engine.query.castableSpells(s.campaign.state, s.casterId);
    return Object.fromEntries(list.map((c) => [c.spellId, c]));
  };

  it('Magic Missile: 3 darts at base slot → creatures maxTargets 3', () => {
    const mm = spellsOf()['magic-missile']!;
    expect(mm.resolves).toBe('auto');
    expect(mm.target).toEqual({ kind: 'creatures', maxTargets: 3, allow: 'enemies' });
  });

  it('Eldritch Blast: beam count scales with character level (L5 → 2)', () => {
    const eb = spellsOf()['eldritch-blast']!;
    expect(eb.resolves).toBe('attack');
    expect(eb.target).toEqual({ kind: 'creatures', maxTargets: 2, allow: 'enemies' });
  });

  it('single-target spells stay maxTargets 1', () => {
    expect((spellsOf()['fire-bolt']!.target as { maxTargets: number }).maxTargets).toBe(1);
    expect((spellsOf()['hold-person']!.target as { maxTargets: number }).maxTargets).toBe(1);
  });

  it('legalSpellTargets scales Magic Missile darts by slot (1→3, 3→5)', () => {
    const s = setup({ x: 10, y: 0 });
    const atBase = s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'magic-missile', 1);
    const atThree = s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'magic-missile', 3);
    if (atBase.kind !== 'creatures' || atThree.kind !== 'creatures') throw new Error('expected creatures');
    expect(atBase.maxTargets).toBe(3);
    expect(atThree.maxTargets).toBe(5);
  });
});

// Slice 757 (pattern-fix): a healing spell can target a DYING (0-HP) creature
// — reviving a downed ally is its primary combat use. legalSpellTargets used
// to filter every 0-HP creature out (the same heal-targets-the-dying bug
// slice 756 fixed for the bonus-action target query). A non-heal spell still
// excludes the dying.
describe('slice 757: healing spells can target a downed (0-HP) creature', () => {
  // Bring a combatant to exactly 0 HP (dying, not massively-dead).
  const downToZero = (s: Setup, id: string): Campaign =>
    commit(s.campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'DamageApplied',
        targetId: id as ULID,
        components: [{ amount: 24, type: 'force' }], // buildFoe has 24 max HP
      },
    ] as Event[]);

  it('Healing Word (heal) includes a 0-HP creature in range', () => {
    const s = setup({ x: 10, y: 0 }); // foe within Healing Word's 60 ft
    s.campaign = downToZero(s, s.foeId);
    expect(s.campaign.state.characters[s.foeId]!.hp.current).toBe(0);
    const r = s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'healing-word', 1);
    if (r.kind !== 'creatures') throw new Error('expected creatures');
    expect(r.candidates.map((c) => c.combatantId)).toContain(s.foeId);
  });

  it('an offensive spell (Fire Bolt) still excludes the 0-HP creature', () => {
    const s = setup({ x: 10, y: 0 });
    s.campaign = downToZero(s, s.foeId);
    const r = s.engine.query.legalSpellTargets(s.campaign.state, s.encounterId, s.casterId, 'fire-bolt', 0);
    if (r.kind !== 'creatures') throw new Error('expected creatures');
    expect(r.candidates.map((c) => c.combatantId)).not.toContain(s.foeId);
  });
});
