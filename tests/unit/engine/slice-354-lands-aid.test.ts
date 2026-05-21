// Slice 354 - Circle of the Land L3 Land's Aid.
//
// RAW 2024: as a Magic action, expend a use of Wild Shape and choose a
// point within 60 ft. Each creature of your choice in a 10-ft Sphere
// makes a Constitution save against your spell save DC, taking 2d6
// Necrotic on a failure or half on a success. One creature of your choice
// in that area regains 2d6 Hit Points. Damage and healing increase by 1d6
// at Druid levels 10 (3d6) and 14 (4d6).
//
// planLandsAid spends the `wild-shape` resource, rolls the Necrotic pool
// once (full on a failed save, half on a success), and emits a Healed for
// the chosen creature.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { landsAidDiceCount } from '../../../src/engine/plan/lands-aid.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent, HealedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildDruid = (level: number, subclass: string | null, wildShapeUses = 2): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Thornroot',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    resources: [{ resourceId: 'wild-shape', current: wildShapeUses, max: wildShapeUses, recharge: 'shortRest' }],
  });

const buildTarget = (name: string, hpMax: number, hpCurrent: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: hpCurrent, max: hpMax, temp: 0 },
  });

interface Scene {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  druidId: string;
  targetIds: string[];
}

const seed = (druid: Character, targets: Character[] = []): Scene => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'lands-aid' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
    ...targets.map((t) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated' as const, snapshot: t }) satisfies CharacterCreatedEvent),
  ]);
  return { engine, campaign, druidId: druid.id, targetIds: targets.map((t) => t.id) };
};

const ofType = <T extends Event>(events: ReadonlyArray<Event>, type: T['type']) =>
  events.filter((e): e is T => e.type === type);

describe('slice 354: Land\'s Aid', () => {
  it('scales the dice pool: 2d6 at level 3, 3d6 at 10, 4d6 at 14', () => {
    expect(landsAidDiceCount(3)).toBe(2);
    expect(landsAidDiceCount(9)).toBe(2);
    expect(landsAidDiceCount(10)).toBe(3);
    expect(landsAidDiceCount(13)).toBe(3);
    expect(landsAidDiceCount(14)).toBe(4);
    expect(landsAidDiceCount(20)).toBe(4);
  });

  it('spends a Wild Shape use, damages each chosen creature, and heals one', () => {
    const a = buildTarget('Goblin A', 20, 20);
    const b = buildTarget('Goblin B', 20, 20);
    const ally = buildTarget('Wounded Ally', 30, 5);
    const s = seed(buildDruid(5, 'circle-of-the-land'), [a, b, ally]);
    const { events } = s.engine.plan.landsAid(s.campaign.state, {
      druidId: s.druidId,
      damageTargetIds: [a.id, b.id],
      healTargetId: ally.id,
    });

    expect(ofType<ResourceSpentEvent>(events, 'ResourceSpent').some(
      (e) => e.resourceId === 'wild-shape' && e.amount === 1,
    )).toBe(true);

    const saves = ofType<SaveRolledEvent>(events, 'SaveRolled');
    expect(saves).toHaveLength(2);
    expect(saves.every((sv) => sv.ability === 'CON' && sv.dc === 15)).toBe(true);

    const heals = ofType<HealedEvent>(events, 'Healed');
    expect(heals).toHaveLength(1);
    expect(heals[0]!.targetId).toBe(ally.id);
    expect(heals[0]!.amount).toBeGreaterThanOrEqual(2);
    expect(heals[0]!.amount).toBeLessThanOrEqual(12);
  });

  it('deals full damage on a failed save and half on a success (shared roll)', () => {
    const a = buildTarget('Goblin A', 20, 20);
    const b = buildTarget('Goblin B', 20, 20);
    const s = seed(buildDruid(5, 'circle-of-the-land'), [a, b]);
    const { events } = s.engine.plan.landsAid(s.campaign.state, {
      druidId: s.druidId,
      damageTargetIds: [a.id, b.id],
    });
    const saves = ofType<SaveRolledEvent>(events, 'SaveRolled');
    const damage = ofType<DamageAppliedEvent>(events, 'DamageApplied');
    for (const dmg of damage) {
      const save = saves.find((sv) => sv.targetId === dmg.targetId)!;
      const dealt = dmg.components.reduce((sum, c) => sum + c.amount, 0);
      const failHalf = damage.find((d) => {
        const sv = saves.find((x) => x.targetId === d.targetId)!;
        return sv.success !== save.success;
      });
      // Necrotic, single component, fighter has no resistance.
      expect(dmg.components.every((c) => c.type === 'necrotic')).toBe(true);
      if (failHalf !== undefined) {
        const otherDealt = failHalf.components.reduce((sum, c) => sum + c.amount, 0);
        const full = save.success ? otherDealt : dealt;
        const half = save.success ? dealt : otherDealt;
        expect(half).toBe(Math.floor(full / 2));
      }
    }
  });

  it('rejects a druid without Circle of the Land, and one with no Wild Shape uses', () => {
    const noSub = seed(buildDruid(5, null), []);
    expect(() => noSub.engine.plan.landsAid(noSub.campaign.state, { druidId: noSub.druidId, damageTargetIds: [] })).toThrow(/Land's Aid/);
    const noWildShape = seed(buildDruid(5, 'circle-of-the-land', 0), []);
    expect(() => noWildShape.engine.plan.landsAid(noWildShape.campaign.state, { druidId: noWildShape.druidId, damageTargetIds: [] })).toThrow(/Wild Shape/);
  });
});
