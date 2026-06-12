// Slice 838: Giant Spider Web — single-target Recharge save-action. RAW (SRD
// 5.2.1 Giant Spider, CR 1): "Web (Recharge 5–6). Dexterity Saving Throw: DC
// 13, one creature the spider can see within 60 feet. Failure: the target has
// the Restrained condition until the web is destroyed." Closes the L7
// `single-target-recharge` quirk: the recharge tracking the audit noted as
// "breath-weapon only" was generalized to save-actions in slice 829 (Air
// Elemental Whirlwind); the Web wires onto that — a save-or-condition with
// `recharge`, no damage. The web object (AC 10/HP 5) + the "until destroyed"
// escape stay consumer/DM-managed (positions / objects are out of engine scope,
// like grapple escape DCs).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveActionRechargedEvent } from '../../../src/schemas/events/save-action.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const target = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Prey', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 10,
  });

const mkSpider = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Giant Spider', kind: 'creature', statblockId: 'giant-spider',
    speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === 'giant-spider')!.abilityScores,
    hp: { current: 26, max: 26, temp: 0 },
  });

const runWeb = (
  t: Character, want: 'fail' | 'success',
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; spiderId: string; events: ReadonlyArray<Event> } => {
  const spider = mkSpider();
  for (let seed = 1; seed < 400; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    let campaign: Campaign = engine.createCampaign({ name: 'web' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: spider } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.saveAction(campaign.state, {
      monsterId: spider.id, saveActionId: 'web', targetId: t.id,
    }).events as ReadonlyArray<Event>;
    const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    if (save === undefined) continue;
    if ((want === 'success') === save.success) return { engine, campaign, spiderId: spider.id, events };
  }
  throw new Error(`no ${want} seed for Web`);
};

describe('Giant Spider Web — single-target Recharge save-action (slice 838)', () => {
  it('the Web spec is DEX DC 13, Recharge 5–6, Restrained, no damage', () => {
    const spec = PACK.monsters.find((m) => m.id === 'giant-spider')!.saveActions.find((s) => s.id === 'web')!;
    expect(spec).toBeDefined();
    expect(spec.saveAbility).toBe('DEX');
    expect(spec.saveDC).toBe(13);
    expect(spec.recharge).toEqual({ rechargeMin: 5 });
    expect(spec.onFail.applyConditionIds).toEqual(['restrained']);
    expect(spec.onFail.damage).toEqual([]);
  });

  it('on a failed save: Restrained (sourced to the spider), no damage; expend marker fires', () => {
    const { events, spiderId } = runWeb(target(), 'fail');
    const restrained = events.find(
      (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'restrained',
    )!;
    expect(restrained).toBeDefined();
    expect(restrained.sourceCharacterId).toBe(spiderId);
    expect(events.some((e) => e.type === 'DamageApplied')).toBe(false);
    expect(events.some((e) => e.type === 'SaveActionExpended')).toBe(true);
  });

  it('on a successful save: nothing (only the SaveRolled + the expend marker)', () => {
    const { events } = runWeb(target(), 'success');
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(true);
  });

  it('expends on use and recharges at turn-start on a d6 >= 5', () => {
    const t = target();
    const fired = runWeb(t, 'fail');
    const after = commit(fired.campaign, fired.events);
    expect(after.state.characters[fired.spiderId]!.expendedSaveActionIds).toContain('web');
    // A re-fire while expended throws.
    expect(() =>
      fired.engine.plan.saveAction(after.state, { monsterId: fired.spiderId, saveActionId: 'web', targetId: t.id }),
    ).toThrow(/expended/);

    // End-to-end recharge: expend the Web, run an encounter, and on a turn-start
    // d6 >= 5 the Web returns to ready.
    for (let seed = 1; seed < 160; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const spider = mkSpider();
      const prey = target();
      let c: Campaign = engine.createCampaign({ name: `recharge-${seed}` });
      c = commit(c, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: spider } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: prey } satisfies CharacterCreatedEvent,
      ]);
      c = commit(c, engine.plan.saveAction(c.state, { monsterId: spider.id, saveActionId: 'web', targetId: prey.id }).events);
      expect(c.state.characters[spider.id]!.expendedSaveActionIds).toContain('web');
      const created = engine.plan.createEncounter(c.state, { combatantIds: [spider.id, prey.id] });
      c = commit(c, created.events);
      c = commit(c, engine.plan.rollInitiative(c.state, { encounterId: created.encounterId }).events);
      c = commit(c, engine.plan.startEncounter(c.state, { encounterId: created.encounterId }).events);
      const first = engine.plan.beginFirstTurn(c.state, { encounterId: created.encounterId });
      if (c.state.encounters[created.encounterId]!.combatants[0]!.combatantId !== spider.id) continue;
      const recharge = first.events.find((e): e is SaveActionRechargedEvent => e.type === 'SaveActionRecharged');
      if (recharge === undefined) continue; // d6 < 5 this seed
      expect(recharge.roll).toBeGreaterThanOrEqual(5);
      expect(recharge.saveActionId).toBe('web');
      const done = commit(c, first.events);
      expect(done.state.characters[spider.id]!.expendedSaveActionIds).not.toContain('web');
      return;
    }
    throw new Error('no seed produced a spider-first-turn Web recharge');
  });
});
