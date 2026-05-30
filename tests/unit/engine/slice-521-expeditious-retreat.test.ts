// Slice 521: Expeditious Retreat + planExpeditiousRetreatDash.
//
// RAW (Expeditious Retreat, 1st-level transmutation, V/S, Self,
// Concentration up to 10 minutes): "Cast this spell as a Bonus Action.
// Until the spell ends, you can take the Dash action as a Bonus Action
// on each of your turns."
//
// Engine surface:
//   - The spell's mechanicalEffects: [{ kind: 'buff', conditionId:
//     'expeditious-retreat-active' }] applies the marker condition on
//     Self at cast time; concentration handling cleans the condition
//     when concentration breaks.
//   - The cast itself consumes the bearer's Bonus Action (handled by
//     the existing castingTime: "Bonus Action" path).
//   - The new planExpeditiousRetreatDash is the per-subsequent-turn
//     arm: gated on the bearer carrying the condition; consumes BA;
//     emits Dashed.
//
// Documented RAW deviations (consumer-managed):
//   - The cast turn itself: the bearer's BA is consumed by the cast,
//     so they cannot also BA-Dash that turn (correct per RAW; the
//     spell starts the buff but doesn't grant a free first Dash).
//   - "10 minutes" concentration timer is consumer-managed (the
//     engine doesn't tick wall-clock; concentration cleanup happens
//     on cast-of-a-new-concentration-spell or damage-CON-save fail).

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildSorcerer = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Rin',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'sorcerer', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 8, max: 8, temp: 0 },
    preparedSpells: ['expeditious-retreat'],
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
  });

const startEncounter = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  combatantIds: string[],
): { campaign: Campaign; encounterId: string } => {
  const created = engine.plan.createEncounter(campaign.state, { combatantIds, name: 'er-test' });
  campaign = commit(campaign, created.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events);
  return { campaign, encounterId: created.encounterId };
};

const ensureCasterFirst = (
  campaign: Campaign,
  encounterId: string,
  casterId: string,
  engine: ReturnType<typeof createEngine>,
): Campaign => {
  // Advance turns until the caster is the active combatant.
  for (let i = 0; i < 6; i += 1) {
    const enc = campaign.state.encounters[encounterId];
    if (enc?.combatants[enc.activeIndex]?.combatantId === casterId) return campaign;
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId }).events);
  }
  throw new Error('caster never became active');
};

describe('Expeditious Retreat (slice 521)', () => {
  it('the spell wires the buff mechanic with the new `expeditious-retreat-active` condition', () => {
    const spell = PACK.spells.find((s) => s.id === 'expeditious-retreat');
    expect(spell).toBeDefined();
    expect(spell!.mechanicalEffects).toEqual([{ kind: 'buff', conditionId: 'expeditious-retreat-active' }]);
    expect(spell!.castingTime).toBe('Bonus Action');
    expect(spell!.concentration).toBe(true);
  });

  it('the new `expeditious-retreat-active` condition ships in the pack with no inline effects (marker)', () => {
    const cond = PACK.conditions.find((c) => c.id === 'expeditious-retreat-active');
    expect(cond).toBeDefined();
    expect(cond!.effects).toEqual([]);
    expect(cond!.stackable).toBe(false);
  });

  it('casting the spell applies expeditious-retreat-active on the caster and starts concentration', () => {
    const sorcerer = buildSorcerer();
    const ally = buildAlly();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(521) });
    let campaign: Campaign = engine.createCampaign({ name: 'cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sorcerer } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    const enc = startEncounter(engine, campaign, [sorcerer.id, ally.id]);
    campaign = ensureCasterFirst(enc.campaign, enc.encounterId, sorcerer.id, engine);
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: sorcerer.id,
      spellId: 'expeditious-retreat',
      slotLevel: 1,
      targetIds: [sorcerer.id],
    }).events;
    expect(cast.some((e) => e.type === 'ConditionApplied' && (e as { conditionId?: string }).conditionId === 'expeditious-retreat-active')).toBe(true);
    expect(cast.some((e) => e.type === 'ConcentrationStarted')).toBe(true);
    campaign = commit(campaign, cast);
    const post = campaign.state.characters[sorcerer.id]!;
    expect(post.appliedConditions.some((c) => c.conditionId === 'expeditious-retreat-active')).toBe(true);
    expect(post.concentrationEffectId).toBeDefined();
  });

  it('without the buff, planExpeditiousRetreatDash throws (gate works)', () => {
    const sorcerer = buildSorcerer();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(522) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-buff' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sorcerer } satisfies CharacterCreatedEvent,
    ]);
    const enc = startEncounter(engine, campaign, [sorcerer.id]);
    campaign = enc.campaign;
    expect(() =>
      engine.plan.expeditiousRetreatDash(campaign.state, { actorId: sorcerer.id }),
    ).toThrow(/not under the effect of Expeditious Retreat/i);
  });

  it('with the buff active, on a subsequent turn planExpeditiousRetreatDash emits BA + Dashed', () => {
    const sorcerer = buildSorcerer();
    const ally = buildAlly();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(523) });
    let campaign: Campaign = engine.createCampaign({ name: 'dash' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sorcerer } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    const enc = startEncounter(engine, campaign, [sorcerer.id, ally.id]);
    campaign = ensureCasterFirst(enc.campaign, enc.encounterId, sorcerer.id, engine);
    // Cast on the caster's turn (consumes BA + 1st-level slot).
    campaign = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: sorcerer.id,
        spellId: 'expeditious-retreat',
        slotLevel: 1,
        targetIds: [sorcerer.id],
      }).events,
    );
    // Advance through the rest of the round back to the sorcerer.
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
    // Now on the sorcerer's NEXT turn, BA-Dash should be available.
    const dashEvents = engine.plan.expeditiousRetreatDash(campaign.state, { actorId: sorcerer.id }).events;
    const kinds = dashEvents.map((e) => e.type);
    expect(kinds).toContain('ActionEconomyConsumed');
    expect(kinds).toContain('Dashed');
    const ae = dashEvents.find((e) => e.type === 'ActionEconomyConsumed') as { kind: string };
    expect(ae.kind).toBe('bonusAction');
  });

  it('on the cast turn itself, BA-Dash is blocked because cast already consumed the BA', () => {
    const sorcerer = buildSorcerer();
    const ally = buildAlly();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(524) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-double-ba' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sorcerer } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    const enc = startEncounter(engine, campaign, [sorcerer.id, ally.id]);
    campaign = ensureCasterFirst(enc.campaign, enc.encounterId, sorcerer.id, engine);
    campaign = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: sorcerer.id,
        spellId: 'expeditious-retreat',
        slotLevel: 1,
        targetIds: [sorcerer.id],
      }).events,
    );
    expect(() =>
      engine.plan.expeditiousRetreatDash(campaign.state, { actorId: sorcerer.id }),
    ).toThrow(/already used their bonus action/i);
  });
});
