// Slice 352 - Life Domain L3 Channel Divinity: Preserve Life.
//
// RAW 2024: expend a Channel Divinity use to restore a pool of 5 x Cleric
// level Hit Points, divided among chosen Bloodied creatures within 30 ft,
// restoring each to no more than half its Hit Point maximum.
// planPreserveLife spends the `channel-divinity` resource and emits a
// Healed event per allocation (capped at half max; the half-max cap also
// enforces the Bloodied-only target rule, since a creature at/above half
// max receives 0).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { HealedEvent } from '../../../src/schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CLERIC_LEVEL = 5;
const POOL = 25; // 5 x level

const buildCleric = (level: number, subclass: string | null, cdUses = 2): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sister Vael',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    hp: { current: 33, max: 33, temp: 0 },
    resources: [{ resourceId: 'channel-divinity', current: cdUses, max: cdUses, recharge: 'shortRest' }],
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
  clericId: string;
}

const seed = (cleric = buildCleric(CLERIC_LEVEL, 'life-domain'), targets: Character[] = []): Scene & { targetIds: string[] } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'preserve-life' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
    ...targets.map((t) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated' as const, snapshot: t }) satisfies CharacterCreatedEvent),
  ]);
  return { engine, campaign, clericId: cleric.id, targetIds: targets.map((t) => t.id) };
};

const healed = (events: ReadonlyArray<Event>) =>
  events.filter((e): e is HealedEvent => e.type === 'Healed');

describe('slice 352: Preserve Life', () => {
  it('divides the pool among Bloodied targets and spends a Channel Divinity use', () => {
    const a = buildTarget('Bloodied A', 30, 5); // half max 15, cap remaining 10
    const b = buildTarget('Bloodied B', 40, 8); // half max 20, cap remaining 12
    const s = seed(buildCleric(CLERIC_LEVEL, 'life-domain'), [a, b]);
    const { events } = s.engine.plan.preserveLife(s.campaign.state, {
      clericId: s.clericId,
      allocations: [{ targetId: a.id, amount: 8 }, { targetId: b.id, amount: 12 }],
    });
    expect(events.some((e): e is ResourceSpentEvent => e.type === 'ResourceSpent' && e.resourceId === 'channel-divinity' && e.amount === 1)).toBe(true);
    const heals = healed(events);
    expect(heals.find((h) => h.targetId === a.id)?.amount).toBe(8);
    expect(heals.find((h) => h.targetId === b.id)?.amount).toBe(12);
  });

  it('caps each heal so the target rises to no more than half its HP max', () => {
    const a = buildTarget('Bloodied A', 30, 5); // half max 15, cap remaining 10
    const s = seed(buildCleric(CLERIC_LEVEL, 'life-domain'), [a]);
    const { events } = s.engine.plan.preserveLife(s.campaign.state, {
      clericId: s.clericId,
      allocations: [{ targetId: a.id, amount: 20 }], // over-allocated; capped at 10
    });
    expect(healed(events).find((h) => h.targetId === a.id)?.amount).toBe(10);
  });

  it('a non-Bloodied target (already at/above half max) receives no healing', () => {
    const full = buildTarget('Healthy', 30, 25); // half max 15, current 25
    const s = seed(buildCleric(CLERIC_LEVEL, 'life-domain'), [full]);
    const { events } = s.engine.plan.preserveLife(s.campaign.state, {
      clericId: s.clericId,
      allocations: [{ targetId: full.id, amount: 10 }],
    });
    expect(healed(events)).toHaveLength(0);
  });

  it('rejects allocations exceeding the pool (5 x Cleric level)', () => {
    const a = buildTarget('Bloodied A', 60, 1);
    const s = seed(buildCleric(CLERIC_LEVEL, 'life-domain'), [a]);
    expect(() =>
      s.engine.plan.preserveLife(s.campaign.state, { clericId: s.clericId, allocations: [{ targetId: a.id, amount: POOL + 1 }] }),
    ).toThrow(/pool/);
  });

  it('rejects a cleric without Life Domain, and one with no Channel Divinity', () => {
    const noSub = seed(buildCleric(CLERIC_LEVEL, null), []);
    expect(() => noSub.engine.plan.preserveLife(noSub.campaign.state, { clericId: noSub.clericId, allocations: [] })).toThrow(/Preserve Life/);
    const noCd = seed(buildCleric(CLERIC_LEVEL, 'life-domain', 0), []);
    expect(() => noCd.engine.plan.preserveLife(noCd.campaign.state, { clericId: noCd.clericId, allocations: [] })).toThrow(/Channel Divinity/);
  });
});
