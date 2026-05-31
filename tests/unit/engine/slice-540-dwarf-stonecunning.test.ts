// Slice 540: Dwarf Stonecunning.
//
// RAW (SRD 5.2.1 Dwarf): "Stonecunning. As a Bonus Action, you gain
// Tremorsense with a range of 60 feet for 10 minutes. You must be on
// a stone surface or touching a stone surface to use this Tremorsense.
// The stone can be natural or worked. You can use this Bonus Action a
// number of times equal to your Proficiency Bonus, and you regain all
// expended uses when you finish a Long Rest."
//
// Engine surface:
//   - Dwarf species gains `GrantResource { resourceId: 'stonecunning',
//     max: profBonus, recharge: 'longRest' }` so the pool refunds on
//     Long Rest.
//   - New `stonecunning-active` condition with `effects: [GrantSense
//     tremorsense 60]` -- while active, the bearer's effect stack
//     projects tremorsense 60.
//   - New `planStonecunning` planner: validates dwarf species + has
//     resource + active combatant + BA available + on-stone-surface
//     flag from intent; emits ActionEconomyConsumed(bonusAction) +
//     ResourceSpent(stonecunning, 1) + ConditionApplied
//     (stonecunning-active).
//
// Documented RAW deviation: the 10-minute duration is consumer-managed
// (the engine doesn't tick wall-clock outside encounters; consumer
// ends the condition after 10 in-fiction minutes). The on-stone-surface
// gate is also consumer-managed via the `onStoneSurface` intent flag.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildDwarf = (level: number = 1): Character => {
  // Consumer populates the resources array at character creation;
  // the species GrantResource trait is a declaration, not an
  // auto-populator. PB at L1 = 2.
  const pb = level < 5 ? 2 : level < 9 ? 3 : level < 13 ? 4 : level < 17 ? 5 : 6;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Brunhild',
    speciesId: 'dwarf',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 12, CON: 16, INT: 10, WIS: 12, CHA: 8 },
    hp: { current: 12, max: 12, temp: 0 },
    resources: [{ resourceId: 'stonecunning', current: pb, max: pb }],
  });
};

const startSoloEncounter = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  combatantIds: string[],
): { campaign: Campaign; encounterId: string } => {
  const created = engine.plan.createEncounter(campaign.state, {
    combatantIds,
    name: 'stonecunning-test',
  });
  campaign = commit(campaign, created.events);
  campaign = commit(
    campaign,
    engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events,
  );
  campaign = commit(
    campaign,
    engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events,
  );
  campaign = commit(
    campaign,
    engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events,
  );
  return { campaign, encounterId: created.encounterId };
};

describe('Dwarf Stonecunning (slice 540)', () => {
  it('the dwarf species ships the stonecunning GrantResource trait', () => {
    const sp = PACK.species.find((s) => s.id === 'dwarf')!;
    const res = sp.traits.find(
      (t) =>
        t.kind === 'GrantResource' &&
        (t as { resourceId?: string }).resourceId === 'stonecunning',
    );
    expect(res).toBeDefined();
    expect((res as { recharge: string }).recharge).toBe('longRest');
  });

  it('the stonecunning-active condition ships with GrantSense tremorsense 60', () => {
    const cond = PACK.conditions.find((c) => c.id === 'stonecunning-active');
    expect(cond).toBeDefined();
    expect(cond!.effects).toEqual([{ kind: 'GrantSense', sense: 'tremorsense', range: 60 }]);
  });

  it('a fresh L1 dwarf carries 2 Stonecunning uses (PB +2)', () => {
    const dwarf = buildDwarf(1);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(540) });
    let camp: Campaign = engine.createCampaign({ name: 'l1-dwarf' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dwarf } satisfies CharacterCreatedEvent,
    ]);
    const post = camp.state.characters[dwarf.id]!;
    const stoneRes = post.resources.find((r) => r.resourceId === 'stonecunning');
    expect(stoneRes).toBeDefined();
    expect(stoneRes!.max).toBe(2);
    expect(stoneRes!.current).toBe(2);
  });

  it('planStonecunning emits BA + ResourceSpent + ConditionApplied(stonecunning-active)', () => {
    const dwarf = buildDwarf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(541) });
    let camp: Campaign = engine.createCampaign({ name: 'cast' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dwarf } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dwarf.id]);
    camp = enc.campaign;
    const events = engine.plan.stonecunning(camp.state, {
      dwarfId: dwarf.id,
      onStoneSurface: true,
    }).events;
    const kinds = events.map((e) => e.type);
    expect(kinds).toContain('ActionEconomyConsumed');
    expect(kinds).toContain('ResourceSpent');
    expect(kinds).toContain('ConditionApplied');
    const rs = events.find((e) => e.type === 'ResourceSpent') as ResourceSpentEvent;
    expect(rs.resourceId).toBe('stonecunning');
    const ca = events.find((e) => e.type === 'ConditionApplied') as ConditionAppliedEvent;
    expect(ca.conditionId).toBe('stonecunning-active');
    expect(ca.targetId).toBe(dwarf.id);
  });

  it("after commit, the dwarf's effect stack projects tremorsense 60 + resource decremented to 1", () => {
    const dwarf = buildDwarf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(542) });
    let camp: Campaign = engine.createCampaign({ name: 'post-cast' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dwarf } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dwarf.id]);
    camp = enc.campaign;
    camp = commit(
      camp,
      engine.plan.stonecunning(camp.state, { dwarfId: dwarf.id, onStoneSurface: true }).events,
    );
    const post = camp.state.characters[dwarf.id]!;
    const stoneRes = post.resources.find((r) => r.resourceId === 'stonecunning');
    expect(stoneRes!.current).toBe(1);
    const acc = buildEffectStack({
      character: post,
      content: CONTENT,
      itemInstances: camp.state.itemInstances,
      pendingChoices: camp.state.pendingChoices,
    });
    expect(acc.senseRange('tremorsense')).toBe(60);
  });

  it('throws without onStoneSurface flag (consumer-managed gate)', () => {
    const dwarf = buildDwarf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(543) });
    let camp: Campaign = engine.createCampaign({ name: 'no-stone' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dwarf } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dwarf.id]);
    camp = enc.campaign;
    expect(() =>
      engine.plan.stonecunning(camp.state, { dwarfId: dwarf.id }),
    ).toThrow(/stone surface/i);
  });

  it('throws when a non-dwarf tries to use Stonecunning', () => {
    const human = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Human',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(544) });
    let camp: Campaign = engine.createCampaign({ name: 'no-dwarf' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [human.id]);
    camp = enc.campaign;
    expect(() =>
      engine.plan.stonecunning(camp.state, { dwarfId: human.id, onStoneSurface: true }),
    ).toThrow(/Dwarf species only/i);
  });

  it('throws when the dwarf has exhausted Stonecunning uses', () => {
    const dwarf = buildDwarf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(545) });
    let camp: Campaign = engine.createCampaign({ name: 'exhausted' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dwarf } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dwarf.id]);
    camp = enc.campaign;
    // Exhaust both PB +2 uses by advancing turn + recasting
    camp = commit(camp, engine.plan.stonecunning(camp.state, { dwarfId: dwarf.id, onStoneSurface: true }).events);
    camp = commit(camp, engine.plan.advanceTurn(camp.state, { encounterId: enc.encounterId }).events);
    camp = commit(camp, engine.plan.stonecunning(camp.state, { dwarfId: dwarf.id, onStoneSurface: true }).events);
    camp = commit(camp, engine.plan.advanceTurn(camp.state, { encounterId: enc.encounterId }).events);
    // Third attempt: no uses left
    expect(() =>
      engine.plan.stonecunning(camp.state, { dwarfId: dwarf.id, onStoneSurface: true }),
    ).toThrow(/no Stonecunning uses remaining/i);
  });
});
