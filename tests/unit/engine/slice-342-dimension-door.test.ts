// Slice 342 - dedicated planDimensionDoor planner.
//
// RAW 2024: 4th-level conjuration, Action, range 500 ft. Teleport to a
// location within range; optionally bring one willing creature that
// starts within 5 ft, arriving within 5 ft of the destination. No save
// / no damage in the wired path (occupied destinations are rejected
// rather than dealing the RAW 4d6 Force failure damage, the same
// positioning stance as Misty Step / Thunder Step).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { replay } from '../../../src/engine/replay.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type { SpellSlotConsumedEvent } from '../../../src/schemas/events/spellcasting.js';
import type { Event } from '../../../src/schemas/events/index.js';

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 38, max: 38, temp: 0 },
    preparedSpells: ['dimension-door'],
  });

const buildOther = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

interface Scene {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
  casterId: string;
  allyId: string;
  bystanderId: string;
}

// Layout (feet): caster (50,50), ally (55,50) = 5 ft away, bystander
// (100,50) = 50 ft away (used as an occupancy blocker / out-of-range ally).
const seedScene = (): Scene => {
  const PACK = loadStarterPack();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const caster = buildWizard();
  const ally = buildOther('Ally');
  const bystander = buildOther('Bystander');
  let campaign = engine.createCampaign({ name: 'dimension-door' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bystander } satisfies CharacterCreatedEvent,
  ]);
  const created = engine.plan.createEncounter(campaign.state, {
    combatantIds: [caster.id, ally.id, bystander.id],
  });
  campaign = commit(campaign, created.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events);
  for (let i = 0; i < 4; i++) {
    const enc = campaign.state.encounters[created.encounterId]!;
    if (enc.combatants[enc.activeIndex]?.combatantId === caster.id) break;
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: created.encounterId }).events);
  }
  const place = (combatantId: string, x: number, y: number): CombatantMovedEvent => ({
    id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: created.encounterId,
    combatantId, fromPosition: { x: 0, y: 0 }, toPosition: { x, y }, feetTraveled: 0,
  });
  campaign = commit(campaign, [
    place(caster.id, 50, 50),
    place(ally.id, 55, 50),
    place(bystander.id, 100, 50),
  ]);
  return { engine, campaign, encounterId: created.encounterId, casterId: caster.id, allyId: ally.id, bystanderId: bystander.id };
};

const moves = (events: ReadonlyArray<Event>): CombatantMovedEvent[] =>
  events.filter((e): e is CombatantMovedEvent => e.type === 'CombatantMoved');

describe('planDimensionDoor', () => {
  it('self-only: cast + slot(4) + action + one caster move, no save/damage', () => {
    const s = seedScene();
    const { events } = s.engine.plan.dimensionDoor(s.campaign.state, {
      casterId: s.casterId,
      to: { x: 300, y: 50 }, // 250 ft from origin (within 500)
    });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('SpellCastDeclared');
    expect(types[1]).toBe('SpellSlotConsumed');
    expect(types[2]).toBe('ActionEconomyConsumed');
    expect(types).not.toContain('SaveRolled');
    expect(types).not.toContain('DamageApplied');
    const ms = moves(events);
    expect(ms).toHaveLength(1);
    expect(ms[0]!.combatantId).toBe(s.casterId);
    expect(ms[0]!.feetTraveled).toBe(0);
    const slot = events.find((e): e is SpellSlotConsumedEvent => e.type === 'SpellSlotConsumed');
    expect(slot?.slotLevel).toBe(4);
  });

  it('with a willing ally: two CombatantMoved (caster then ally)', () => {
    const s = seedScene();
    const { events } = s.engine.plan.dimensionDoor(s.campaign.state, {
      casterId: s.casterId,
      to: { x: 300, y: 50 },
      ally: { combatantId: s.allyId, to: { x: 300, y: 55 } }, // 5 ft from caster dest
    });
    const ms = moves(events);
    expect(ms).toHaveLength(2);
    expect(ms[0]!.combatantId).toBe(s.casterId);
    expect(ms[1]!.combatantId).toBe(s.allyId);
  });

  it('rejects a destination beyond 500 ft', () => {
    const s = seedScene();
    expect(() =>
      s.engine.plan.dimensionDoor(s.campaign.state, { casterId: s.casterId, to: { x: 600, y: 50 } }),
    ).toThrow(/500ft/);
  });

  it('rejects an ally that does not start within 5 ft of the caster', () => {
    const s = seedScene();
    expect(() =>
      s.engine.plan.dimensionDoor(s.campaign.state, {
        casterId: s.casterId,
        to: { x: 300, y: 50 },
        ally: { combatantId: s.bystanderId, to: { x: 300, y: 55 } }, // bystander is 50 ft away
      }),
    ).toThrow(/within 5ft/);
  });

  it('rejects an ally arrival more than 5 ft from the caster destination', () => {
    const s = seedScene();
    expect(() =>
      s.engine.plan.dimensionDoor(s.campaign.state, {
        casterId: s.casterId,
        to: { x: 300, y: 50 },
        ally: { combatantId: s.allyId, to: { x: 300, y: 90 } }, // 40 ft from caster dest
      }),
    ).toThrow(/caster's destination/);
  });

  it('rejects an occupied destination', () => {
    const s = seedScene();
    expect(() =>
      s.engine.plan.dimensionDoor(s.campaign.state, { casterId: s.casterId, to: { x: 100, y: 50 } }), // bystander is there
    ).toThrow(/occupied/);
  });

  it('rejects when slotLevel < 4', () => {
    const s = seedScene();
    expect(() =>
      s.engine.plan.dimensionDoor(s.campaign.state, { casterId: s.casterId, to: { x: 300, y: 50 }, slotLevel: 3 }),
    ).toThrow(/4th-level/);
  });

  it('replay-equivalence holds (planner is RNG-free)', () => {
    const s = seedScene();
    const { events } = s.engine.plan.dimensionDoor(s.campaign.state, {
      casterId: s.casterId,
      to: { x: 300, y: 50 },
      ally: { combatantId: s.allyId, to: { x: 300, y: 55 } },
    });
    const after = commit(s.campaign, events);
    expect(JSON.stringify(replay(after.events))).toBe(JSON.stringify(after.state));
  });
});
