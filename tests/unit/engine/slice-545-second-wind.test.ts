// Slice 545: Fighter L1 Second Wind.
//
// RAW (SRD 5.2.1 Fighter L1): "As a Bonus Action, you can use it to
// regain Hit Points equal to 1d10 plus your Fighter level. You can
// use this feature twice. You regain one expended use when you finish
// a Short Rest, and you regain all expended uses when you finish a
// Long Rest."
//
// New `planSecondWind` planner emits: ActionEconomyConsumed
// (bonus action), ResourceSpent (1 of second-wind), Healed (1d10 +
// Fighter level). Bonus-action economy is enforced only when invoked
// inside an active encounter on the fighter's own turn (per RAW
// Second Wind can be used between encounters too).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { HealedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildFighter = (level: number, secondWindRemaining?: number, uses?: number): Character => {
  const max = uses ?? (level >= 10 ? 4 : level >= 4 ? 3 : 2);
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alyx',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: 5, max: 12, temp: 0 },
    resources: [{ resourceId: 'second-wind', current: secondWindRemaining ?? max, max }],
  });
};

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Merik',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 6, max: 8, temp: 0 },
  });

const startEncounter = (engine: ReturnType<typeof createEngine>, characters: Character[]) => {
  let campaign = engine.createCampaign({ name: 'second-wind' });
  campaign = commit(
    campaign,
    characters.map(
      (c) =>
        ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
    ),
  );
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: characters.map((c) => c.id) });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return campaign;
};

describe('Fighter Second Wind (slice 545)', () => {
  it('Fighter L1 in encounter: emits bonus-action, ResourceSpent, Healed (1d10 + level)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const fighter = buildFighter(1);
    const campaign = startEncounter(engine, [fighter]);
    const events = engine.plan.secondWind(campaign.state, { fighterId: fighter.id }).events;
    expect(events.length).toBe(3);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect(events[1]!.type).toBe('ResourceSpent');
    expect(events[2]!.type).toBe('Healed');
    const healed = events[2] as HealedEvent;
    expect(healed.targetId).toBe(fighter.id);
    expect(healed.amount).toBeGreaterThanOrEqual(2); // 1 (min d10) + L1
    expect(healed.amount).toBeLessThanOrEqual(11); // 10 (max d10) + L1
    expect(healed.source).toBe('second-wind');
  });

  it('Fighter L5 heals 1d10 + 5', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const fighter = buildFighter(5);
    const campaign = startEncounter(engine, [fighter]);
    const events = engine.plan.secondWind(campaign.state, { fighterId: fighter.id }).events;
    const healed = events.find((e) => e.type === 'Healed') as HealedEvent | undefined;
    expect(healed?.amount).toBeGreaterThanOrEqual(6);
    expect(healed?.amount).toBeLessThanOrEqual(15);
  });

  it('out-of-encounter use: skips bonus-action gate, still consumes resource + heals', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const fighter = buildFighter(1);
    let campaign = engine.createCampaign({ name: 'sw-rest' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.secondWind(campaign.state, { fighterId: fighter.id }).events;
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('ResourceSpent');
    expect(events[1]!.type).toBe('Healed');
  });

  it('Fighter with depleted second-wind resource: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const fighter = buildFighter(1, 0);
    const campaign = startEncounter(engine, [fighter]);
    expect(() => engine.plan.secondWind(campaign.state, { fighterId: fighter.id }))
      .toThrow(/no Second Wind uses remaining/);
  });

  it('non-Fighter is rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const wizard = buildWizard();
    const campaign = startEncounter(engine, [wizard]);
    expect(() => engine.plan.secondWind(campaign.state, { fighterId: wizard.id }))
      .toThrow(/does not have Second Wind/);
  });

  it('rejects when bonus action already used', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const fighter = buildFighter(1);
    let campaign = startEncounter(engine, [fighter]);
    const first = engine.plan.secondWind(campaign.state, { fighterId: fighter.id }).events;
    campaign = commit(campaign, first);
    expect(() => engine.plan.secondWind(campaign.state, { fighterId: fighter.id }))
      .toThrow(/already used their bonus action/);
  });

  it('replay equivalence: events committed → state matches', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const fighter = buildFighter(1);
    let campaign = startEncounter(engine, [fighter]);
    const events = engine.plan.secondWind(campaign.state, { fighterId: fighter.id }).events;
    campaign = commit(campaign, events);
    const after = campaign.state.characters[fighter.id]!;
    expect(after.hp.current).toBeGreaterThan(5); // initial HP was 5
    expect(after.resources.find((r) => r.resourceId === 'second-wind')?.current).toBe(1);
  });
});
