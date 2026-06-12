// Slice 839: Legendary Resistance (Aboleth / Sphinx of Lore / Unicorn). RAW
// (SRD 5.2.1): "If the creature fails a saving throw, it can choose to succeed
// instead." A per-day budget (3/Day; +1 In Lair for some). Consumer-driven (the
// Shield preventedHit shape): the engine confirms the budgeted spend + emits
// LegendaryResistanceUsed; the consumer treats the failed save as a success.
// Advances the L7 `legendary-lair-actions` row (Legendary Resistance arm; the
// Legendary Actions pool is split out).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { LegendaryResistanceUsedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const mkCreature = (statblockId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: statblockId, kind: 'creature', statblockId,
    speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === statblockId)!.abilityScores,
    hp: { current: 100, max: 100, temp: 0 },
  });

const stage = (c: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'legendary' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};
const used = (c: Campaign, id: string): number => c.state.characters[id]!.legendaryResistanceUsed;

describe('Legendary Resistance (slice 839)', () => {
  it('the in-scope creatures carry the SRD budget', () => {
    expect(PACK.monsters.find((m) => m.id === 'aboleth')!.legendaryResistance).toEqual({ usesPerDay: 3, usesPerDayInLair: 4 });
    expect(PACK.monsters.find((m) => m.id === 'sphinx-of-lore')!.legendaryResistance).toEqual({ usesPerDay: 3, usesPerDayInLair: 4 });
    expect(PACK.monsters.find((m) => m.id === 'unicorn')!.legendaryResistance).toEqual({ usesPerDay: 3 });
  });

  it('spending one use emits LegendaryResistanceUsed and increments the counter', () => {
    const u = mkCreature('unicorn');
    const { engine, campaign } = stage(u);
    const result = engine.plan.legendaryResistance(campaign.state, { creatureId: u.id, triggeringSaveEventId: eventId() });
    const ev = result.events.find((e): e is LegendaryResistanceUsedEvent => e.type === 'LegendaryResistanceUsed')!;
    expect(ev).toBeDefined();
    expect(ev.creatureId).toBe(u.id);
    expect(ev.triggeringSaveEventId).toBeDefined();
    expect(used(commit(campaign, result.events), u.id)).toBe(1);
  });

  it('the 3/Day budget is enforced — the 4th use throws', () => {
    const u = mkCreature('unicorn');
    const { engine } = stage(u);
    let c = stage(u).campaign;
    // Re-stage on the same engine to keep the seed stream simple.
    const eng = engine;
    for (let i = 0; i < 3; i += 1) {
      c = commit(c, eng.plan.legendaryResistance(c.state, { creatureId: u.id }).events);
    }
    expect(used(c, u.id)).toBe(3);
    expect(() => eng.plan.legendaryResistance(c.state, { creatureId: u.id })).toThrow(/no Legendary Resistance left/);
  });

  it('In Lair raises the cap from 3 to 4', () => {
    const a = mkCreature('aboleth');
    const { engine, campaign } = stage(a);
    let c = campaign;
    for (let i = 0; i < 3; i += 1) {
      c = commit(c, engine.plan.legendaryResistance(c.state, { creatureId: a.id }).events);
    }
    // 4th without the lair (cap 3) throws; with inLair (cap 4) it's allowed.
    expect(() => engine.plan.legendaryResistance(c.state, { creatureId: a.id })).toThrow(/no Legendary Resistance left/);
    const inLair = engine.plan.legendaryResistance(c.state, { creatureId: a.id, inLair: true });
    expect(inLair.events.some((e) => e.type === 'LegendaryResistanceUsed')).toBe(true);
    expect(used(commit(c, inLair.events), a.id)).toBe(4);
  });

  it('a Long Rest refreshes the budget', () => {
    const u = mkCreature('unicorn');
    const { engine, campaign } = stage(u);
    let c = commit(campaign, engine.plan.legendaryResistance(campaign.state, { creatureId: u.id }).events);
    expect(used(c, u.id)).toBe(1);
    c = commit(c, engine.plan.longRest(c.state, { participantIds: [u.id] }).events);
    expect(used(c, u.id)).toBe(0);
  });

  it('throws for a creature without Legendary Resistance', () => {
    const wolf = mkCreature('wolf');
    const { engine, campaign } = stage(wolf);
    expect(() => engine.plan.legendaryResistance(campaign.state, { creatureId: wolf.id })).toThrow(/does not have Legendary Resistance/);
  });
});
