// Slice 840: Legendary Actions (the Aboleth). RAW (SRD 5.2.1): "Legendary
// Action Uses: 3 (4 in Lair). Immediately after another creature's turn, the
// aboleth can expend a use to take one of the following actions [Lash / Psychic
// Drain]. The aboleth regains all expended uses at the start of each of its
// turns." The engine owns the budget (pool + turn-start refresh + validated
// spend); the timing + the underlying action are consumer-orchestrated. Closes
// the L7 `legendary-actions-pool` row.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { LegendaryActionUsedEvent } from '../../../src/schemas/events/combat.js';
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
  let campaign: Campaign = engine.createCampaign({ name: 'legendary-action' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};
const laUsed = (c: Campaign, id: string): number => c.state.characters[id]!.legendaryActionsUsed;

describe('Legendary Actions (slice 840)', () => {
  it('the Aboleth carries the SRD pool + menu (3, 4 In Lair; Lash + Psychic Drain, cost 1)', () => {
    const spec = PACK.monsters.find((m) => m.id === 'aboleth')!.legendaryActions!;
    expect(spec.uses).toBe(3);
    expect(spec.usesInLair).toBe(4);
    expect(spec.actions).toEqual([{ name: 'Lash', cost: 1 }, { name: 'Psychic Drain', cost: 1 }]);
  });

  it('spending Lash emits LegendaryActionUsed and increments the pool counter', () => {
    const a = mkCreature('aboleth');
    const { engine, campaign } = stage(a);
    const result = engine.plan.legendaryAction(campaign.state, { creatureId: a.id, actionName: 'Lash' });
    const ev = result.events.find((e): e is LegendaryActionUsedEvent => e.type === 'LegendaryActionUsed')!;
    expect(ev).toBeDefined();
    expect(ev.actionName).toBe('Lash');
    expect(ev.cost).toBe(1);
    expect(laUsed(commit(campaign, result.events), a.id)).toBe(1);
  });

  it('the pool of 3 is enforced — a 4th spend throws; In Lair raises it to 4', () => {
    const a = mkCreature('aboleth');
    const { engine, campaign } = stage(a);
    let c = campaign;
    for (let i = 0; i < 3; i += 1) {
      c = commit(c, engine.plan.legendaryAction(c.state, { creatureId: a.id, actionName: 'Lash' }).events);
    }
    expect(laUsed(c, a.id)).toBe(3);
    expect(() => engine.plan.legendaryAction(c.state, { creatureId: a.id, actionName: 'Lash' })).toThrow(/can't afford/);
    // In Lair, the cap is 4 → a 4th is allowed.
    const inLair = engine.plan.legendaryAction(c.state, { creatureId: a.id, actionName: 'Psychic Drain', inLair: true });
    expect(laUsed(commit(c, inLair.events), a.id)).toBe(4);
  });

  it('the pool refreshes at the start of the creature\'s turn', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const aboleth = mkCreature('aboleth');
    const foe = mkCreature('wolf');
    let c: Campaign = engine.createCampaign({ name: 'refresh' });
    c = commit(c, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: aboleth } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: foe } satisfies CharacterCreatedEvent,
    ]);
    const created = engine.plan.createEncounter(c.state, { combatantIds: [aboleth.id, foe.id] });
    c = commit(c, created.events);
    c = commit(c, engine.plan.rollInitiative(c.state, { encounterId: created.encounterId }).events);
    c = commit(c, engine.plan.startEncounter(c.state, { encounterId: created.encounterId }).events);
    c = commit(c, engine.plan.beginFirstTurn(c.state, { encounterId: created.encounterId }).events);
    // Spend two Legendary Actions (legal at any time outside its turn-start gate
    // — the budget is what we're testing).
    c = commit(c, engine.plan.legendaryAction(c.state, { creatureId: aboleth.id, actionName: 'Lash' }).events);
    c = commit(c, engine.plan.legendaryAction(c.state, { creatureId: aboleth.id, actionName: 'Lash' }).events);
    expect(laUsed(c, aboleth.id)).toBe(2);
    // Advance turns until the aboleth's next TurnStarted refreshes the pool.
    for (let i = 0; i < 6 && laUsed(c, aboleth.id) > 0; i += 1) {
      c = commit(c, engine.plan.advanceTurn(c.state, { encounterId: created.encounterId }).events);
    }
    expect(laUsed(c, aboleth.id)).toBe(0);
  });

  it('throws for an unknown action name or a non-legendary creature', () => {
    const a = mkCreature('aboleth');
    const s = stage(a);
    expect(() => s.engine.plan.legendaryAction(s.campaign.state, { creatureId: a.id, actionName: 'Nope' })).toThrow(/no Legendary Action/);
    const wolf = mkCreature('wolf');
    const w = stage(wolf);
    expect(() => w.engine.plan.legendaryAction(w.campaign.state, { creatureId: wolf.id, actionName: 'Lash' })).toThrow(/no Legendary Actions/);
  });
});
