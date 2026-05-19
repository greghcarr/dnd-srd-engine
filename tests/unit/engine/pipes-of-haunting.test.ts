// Slice 286 — Pipes of Haunting + new Save UseAction variant.
//
// RAW (SRD 5.2.1): "These pipes have 3 charges and regain 1d3
// expended charges daily at dawn. You can take a Magic action to
// play them and expend 1 charge to create an eerie, spellbinding
// tune. Each creature of your choice within 30 feet of you must
// succeed on a DC 15 Wisdom saving throw or have the Frightened
// condition for 1 minute. A creature that fails the save repeats
// it at the end of each of its turns, ending the effect on itself
// on a success. A creature that succeeds on its save is immune to
// the effect of these pipes for 24 hours."
//
// Pre-286 Pipes of Haunting shipped `effects: []` / `onUse: []`
// (charges were declared, but there was no UseAction that rolled
// the bespoke item-fixed-DC save). This slice adds the `Save`
// UseAction variant and wires the canonical user. The 30-foot
// scope, 1-minute duration, end-of-turn recurring save, and
// 24-hour immunity-on-success are all consumer-managed deferrals.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ItemChargeConsumedEvent, ItemUsedEvent } from '../../../src/schemas/events/inventory.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildPiper = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Piper',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

// Listener with WIS=4 so the save total can't reach DC 15 on any
// d20 roll (WIS mod = -3, total range = -2 to 17... still 17 max,
// so a nat 20 succeeds; close enough for a deterministic seed).
// Actually WIS=4 → mod=-3, so total = d20-3, range [-2, 17].
// To guarantee fail we need WIS very low + low d20. Use WIS=1
// for the most-fail test → mod = -5, total range [-4, 15].
// Still d20=20 → 15 ties DC 15 (>=). Use WIS=1 and pick low seeds.
const buildLowWisTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 1, CHA: 10 },
    hp: { current: 11, max: 11, temp: 0 },
  });

const buildHighWisTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 20, CHA: 10 },
    hp: { current: 11, max: 11, temp: 0 },
  });

const seedAll = (piper: Character, listeners: ReadonlyArray<Character>) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(286) });
  const pipes = makeItemInstance('pipes-of-haunting', { chargesRemaining: 3, maxCharges: 3 });
  let campaign: Campaign = engine.createCampaign({ name: 'pipes-of-haunting' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: pipes },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: { ...piper, inventory: [pipes.id] },
    } satisfies CharacterCreatedEvent,
    ...listeners.map(
      (l) =>
        ({
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated' as const,
          snapshot: l,
        }) satisfies CharacterCreatedEvent,
    ),
  ]);
  return { engine, campaign, pipesId: pipes.id };
};

const findSaves = (events: ReadonlyArray<unknown>): SaveRolledEvent[] =>
  events.filter((e): e is SaveRolledEvent => (e as { type?: string }).type === 'SaveRolled');

const findConditionApplied = (events: ReadonlyArray<unknown>): ConditionAppliedEvent[] =>
  events.filter((e): e is ConditionAppliedEvent => (e as { type?: string }).type === 'ConditionApplied');

describe('slice 286: Pipes of Haunting + Save UseAction variant', () => {
  it('a low-WIS listener fails the DC 15 WIS save and gains the frightened condition', () => {
    const piper = buildPiper();
    const listener = buildLowWisTarget('Coward');
    const { engine, campaign, pipesId } = seedAll(piper, [listener]);
    const { events } = engine.plan.useItem(campaign.state, {
      characterId: piper.id,
      instanceId: pipesId,
      saveTargetIds: [listener.id],
    });
    const saves = findSaves(events);
    const conds = findConditionApplied(events);
    expect(saves).toHaveLength(1);
    expect(saves[0]!.targetId).toBe(listener.id);
    expect(saves[0]!.ability).toBe('WIS');
    expect(saves[0]!.dc).toBe(15);
    expect(saves[0]!.success).toBe(false);
    expect(conds).toHaveLength(1);
    expect(conds[0]!.conditionId).toBe('frightened');
    expect(conds[0]!.targetId).toBe(listener.id);
    expect(conds[0]!.sourceCharacterId).toBe(piper.id);
  });

  it('a save success does NOT apply the frightened condition (relationship between save and condition holds across seeds)', () => {
    // Across many seeds, search for one where the high-WIS target
    // succeeds. The save vs condition relationship is the invariant
    // worth pinning; the per-seed d20 outcome is incidental.
    let foundSuccess = false;
    for (let seed = 1; seed < 100 && !foundSuccess; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const piper = buildPiper();
      const listener = buildHighWisTarget('Stalwart');
      const pipes = makeItemInstance('pipes-of-haunting', { chargesRemaining: 3, maxCharges: 3 });
      let campaign: Campaign = engine.createCampaign({ name: `pipes-success-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: pipes },
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: { ...piper, inventory: [pipes.id] },
        } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: listener } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.useItem(campaign.state, {
        characterId: piper.id,
        instanceId: pipes.id,
        saveTargetIds: [listener.id],
      });
      const saves = findSaves(events);
      const conds = findConditionApplied(events);
      if (saves[0]!.success) {
        foundSuccess = true;
        expect(conds).toHaveLength(0);
      } else {
        expect(conds).toHaveLength(1);
        expect(conds[0]!.targetId).toBe(listener.id);
      }
    }
    expect(foundSuccess).toBe(true);
  });

  it('multiple targets: one save event per target; per-target relationship between save success and frightened condition holds', () => {
    const piper = buildPiper();
    const a = buildLowWisTarget('A');
    const b = buildLowWisTarget('B');
    const c = buildHighWisTarget('C');
    const { engine, campaign, pipesId } = seedAll(piper, [a, b, c]);
    const { events } = engine.plan.useItem(campaign.state, {
      characterId: piper.id,
      instanceId: pipesId,
      saveTargetIds: [a.id, b.id, c.id],
    });
    const saves = findSaves(events);
    expect(saves).toHaveLength(3);
    expect(saves.map((s) => s.targetId).sort()).toEqual([a.id, b.id, c.id].sort());
    // Per-target invariant: ConditionApplied exists iff that target's save failed.
    const conds = findConditionApplied(events);
    const failedIds = saves.filter((s) => !s.success).map((s) => s.targetId).sort();
    const condTargetIds = conds.map((c) => c.targetId).sort();
    expect(condTargetIds).toEqual(failedIds);
  });

  it('expends 1 charge per use and emits ItemUsed', () => {
    const piper = buildPiper();
    const listener = buildLowWisTarget('Coward');
    const { engine, campaign, pipesId } = seedAll(piper, [listener]);
    const { events } = engine.plan.useItem(campaign.state, {
      characterId: piper.id,
      instanceId: pipesId,
      saveTargetIds: [listener.id],
    });
    const charge = events.find((e) => e.type === 'ItemChargeConsumed') as ItemChargeConsumedEvent | undefined;
    const used = events.find((e) => e.type === 'ItemUsed') as ItemUsedEvent | undefined;
    expect(charge).toBeDefined();
    expect(charge!.amount).toBe(1);
    expect(used).toBeDefined();
  });

  it('throws when saveTargetIds is omitted', () => {
    const piper = buildPiper();
    const listener = buildLowWisTarget('Coward');
    const { engine, campaign, pipesId } = seedAll(piper, [listener]);
    expect(() =>
      engine.plan.useItem(campaign.state, {
        characterId: piper.id,
        instanceId: pipesId,
      }),
    ).toThrow(/saveTargetIds/);
  });

  it('throws when saveTargetIds is empty', () => {
    const piper = buildPiper();
    const listener = buildLowWisTarget('Coward');
    const { engine, campaign, pipesId } = seedAll(piper, [listener]);
    expect(() =>
      engine.plan.useItem(campaign.state, {
        characterId: piper.id,
        instanceId: pipesId,
        saveTargetIds: [],
      }),
    ).toThrow(/saveTargetIds/);
  });
});
