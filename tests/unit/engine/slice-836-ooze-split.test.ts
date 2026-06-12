// Slice 836: ooze Split (Black Pudding / Ochre Jelly). RAW (SRD 5.2.1): while
// Large or Medium with 10+ HP, on Bloodied or Lightning/Slashing damage the
// ooze "splits into two new [oozes], each one size smaller, the original's Hit
// Points divided evenly (round down)." Consumer-driven `engine.plan.oozeSplit`
// resolves the mechanical split (two one-smaller copies at half HP, the
// original removed); the trigger detection + placement + initiative are
// consumer-managed. Closes the L7 `ooze-split-on-damage` divergence.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { CreatureDestroyedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { Size } from '../../../src/schemas/primitives.js';

const PACK = loadStarterPack();

const mkOoze = (statblockId: string, hp: number, sizeOverride?: Size): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: statblockId, kind: 'creature', statblockId,
    speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === statblockId)!.abilityScores,
    hp: { current: hp, max: hp, temp: 0 },
    ...(sizeOverride !== undefined ? { sizeOverride } : {}),
  });

const stage = (ooze: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'ooze' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ooze } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const spawns = (events: ReadonlyArray<Event>): CharacterCreatedEvent[] =>
  events.filter((e): e is CharacterCreatedEvent => e.type === 'CharacterCreated');

describe('ooze Split (slice 836)', () => {
  it('both oozes carry the Split trait (slashing/lightning, 10+ HP)', () => {
    for (const id of ['black-pudding', 'ochre-jelly']) {
      const spec = PACK.monsters.find((m) => m.id === id)!.split;
      expect(spec, id).toBeDefined();
      expect(spec!.damageTypes).toEqual(['slashing', 'lightning']);
      expect(spec!.minHp).toBe(10);
    }
  });

  it('a Large Black Pudding splits into two Medium copies at half HP, removing the original', () => {
    const ooze = mkOoze('black-pudding', 40);
    const { engine, campaign } = stage(ooze);
    const events = engine.plan.oozeSplit(campaign.state, { oozeId: ooze.id }).events as ReadonlyArray<Event>;
    const created = spawns(events);
    expect(created).toHaveLength(2);
    for (const c of created) {
      expect(c.snapshot.statblockId).toBe('black-pudding'); // same statblock
      expect(c.snapshot.sizeOverride).toBe('Medium'); // one size smaller
      expect(c.snapshot.hp.current).toBe(20); // floor(40 / 2)
      expect(c.snapshot.hp.max).toBe(20);
    }
    // The original is replaced (CreatureDestroyed).
    const destroyed = events.find((e): e is CreatureDestroyedEvent => e.type === 'CreatureDestroyed');
    expect(destroyed!.targetId).toBe(ooze.id);
    // Committing seats the two new oozes and kills the original.
    const after = commit(campaign, events);
    for (const c of created) {
      expect(after.state.characters[c.snapshot.id]?.statblockId).toBe('black-pudding');
    }
    expect(after.state.characters[ooze.id]!.hp.current).toBe(0);
  });

  it('odd HP rounds down (an 11-HP ooze → two 5-HP copies)', () => {
    const ooze = mkOoze('ochre-jelly', 11);
    const { engine, campaign } = stage(ooze);
    const events = engine.plan.oozeSplit(campaign.state, { oozeId: ooze.id }).events as ReadonlyArray<Event>;
    for (const c of spawns(events)) expect(c.snapshot.hp.current).toBe(5);
  });

  it('a Medium ooze splits into Small copies (one size smaller)', () => {
    const ooze = mkOoze('black-pudding', 30, 'Medium');
    const { engine, campaign } = stage(ooze);
    const events = engine.plan.oozeSplit(campaign.state, { oozeId: ooze.id }).events as ReadonlyArray<Event>;
    for (const c of spawns(events)) expect(c.snapshot.sizeOverride).toBe('Small');
  });

  it('refuses to split a Small ooze, an ooze below 10 HP, or a non-ooze', () => {
    const small = mkOoze('black-pudding', 30, 'Small');
    const s = stage(small);
    expect(() => s.engine.plan.oozeSplit(s.campaign.state, { oozeId: small.id })).toThrow(/Large or Medium/);

    const lowHp = mkOoze('ochre-jelly', 8);
    const l = stage(lowHp);
    expect(() => l.engine.plan.oozeSplit(l.campaign.state, { oozeId: lowHp.id })).toThrow(/needs 10\+/);

    const wolf = mkOoze('wolf', 40); // a real statblock with no Split trait
    const w = stage(wolf);
    expect(() => w.engine.plan.oozeSplit(w.campaign.state, { oozeId: wolf.id })).toThrow(/no Split trait/);
  });
});
