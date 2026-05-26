// Slice 468: Alert (Origin Feat) - the Criminal background lights
// up end-to-end.
//
// RAW (SRD 5.2.1 Alert):
// - Initiative Proficiency: "When you roll Initiative, you can add
//   your Proficiency Bonus to the roll."
// - Initiative Swap: "Immediately after you roll Initiative, you can
//   swap your Initiative with the Initiative of one willing ally in
//   the same combat. You can't make this swap if you or the ally has
//   the Incapacitated condition."
//
// Wiring:
// - alert feat ships effects: AddModifier target:'initiative'
//   value: { kind: 'profBonus' } (the Initiative Proficiency arm).
// - planRollInitiative now folds the effect-stack modifierSum into
//   the InitiativeRoll.modifier (was DEX-only).
// - New planner planSwapInitiative + InitiativeSwapped event + reducer
//   handle the Initiative Swap arm. Reducer swaps initiative values
//   and recomputes initiativeOrder across all combatants.
// - The slice-466 auto-projection (background.originFeatId) means a
//   Criminal-background character gets the feat without explicit
//   featsTaken seeding.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { EncounterCreatedEvent, InitiativeRolledEvent, InitiativeSwappedEvent } from '../../../src/schemas/events/encounter.js';

const PACK = loadStarterPack();

// Criminal background -> auto-gets alert feat via slice 466.
const buildCriminal = (
  overrides: Partial<{ name: string; backgroundId: string; conditions: ReadonlyArray<string> }> = {},
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: overrides.name ?? 'Larva',
    speciesId: 'human',
    backgroundId: overrides.backgroundId ?? 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
    appliedConditions: (overrides.conditions ?? []).map((cid) => ({
      id: newAppliedConditionId(),
      conditionId: cid,
    })),
    featsTaken: [],
  });

// Soldier background -> auto-gets savage-attacker, NOT alert.
const buildSoldier = (
  overrides: Partial<{ name: string; conditions: ReadonlyArray<string> }> = {},
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: overrides.name ?? 'Recruit',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    appliedConditions: (overrides.conditions ?? []).map((cid) => ({
      id: newAppliedConditionId(),
      conditionId: cid,
    })),
    featsTaken: [],
  });

const setupEncounter = (
  combatants: ReadonlyArray<Character>,
  seed = 1,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; encounterId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'alert' });
  campaign = commit(
    campaign,
    combatants.map(
      (c) =>
        ({
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: c,
        }) satisfies CharacterCreatedEvent,
    ),
  );
  const result = engine.plan.createEncounter(campaign.state, {
    name: 'alert-encounter',
    combatantIds: combatants.map((c) => c.id),
  });
  campaign = commit(campaign, result.events);
  return { engine, campaign, encounterId: result.encounterId };
};

describe('Alert - Initiative Proficiency arm (slice 468)', () => {
  it('Criminal initiative roll folds +PB into the modifier (background auto-projects alert)', () => {
    const criminal = buildCriminal();
    const { engine, campaign, encounterId } = setupEncounter([criminal]);
    const events = engine.plan.rollInitiative(campaign.state, { encounterId }).events;
    const rolled = events.find((e) => e.type === 'InitiativeRolled') as
      | InitiativeRolledEvent
      | undefined;
    expect(rolled).toBeDefined();
    const roll = rolled!.rolls.find((r) => r.combatantId === criminal.id);
    expect(roll).toBeDefined();
    // DEX 14 -> mod +2. PB at level 1 -> +2. Expected modifier: +4.
    expect(roll!.modifier).toBe(4);
    expect(roll!.total).toBe(roll!.d20 + 4);
  });

  it('Soldier initiative roll does NOT get +PB (no alert)', () => {
    const soldier = buildSoldier();
    const { engine, campaign, encounterId } = setupEncounter([soldier], 2);
    const events = engine.plan.rollInitiative(campaign.state, { encounterId }).events;
    const rolled = events.find((e) => e.type === 'InitiativeRolled') as InitiativeRolledEvent;
    const roll = rolled.rolls.find((r) => r.combatantId === soldier.id)!;
    // DEX 14 -> mod +2. No alert -> just DEX. Expected modifier: +2.
    expect(roll.modifier).toBe(2);
  });
});

describe('Alert - Initiative Swap arm (slice 468)', () => {
  it('Criminal can swap initiative with a willing ally', () => {
    const criminal = buildCriminal({ name: 'Larva' });
    const ally = buildSoldier({ name: 'Cassius' });
    const { engine, campaign: initial, encounterId } = setupEncounter([criminal, ally], 3);
    let campaign = commit(
      initial,
      engine.plan.rollInitiative(initial.state, { encounterId }).events,
    );
    const beforeCb = campaign.state.encounters[encounterId]!.combatants;
    const criminalBefore = beforeCb.find((c) => c.combatantId === criminal.id)!;
    const allyBefore = beforeCb.find((c) => c.combatantId === ally.id)!;
    const criminalInitBefore = criminalBefore.initiative;
    const allyInitBefore = allyBefore.initiative;
    // Skip the swap if the values happen to be equal (no observable
    // change). Seed 3 gives distinct rolls, but the assertion below
    // covers the common case directly.
    expect(criminalInitBefore).not.toBe(allyInitBefore);
    const swap = engine.plan.swapInitiative(campaign.state, {
      encounterId,
      swapperId: criminal.id,
      allyId: ally.id,
    }).events;
    const event = swap.find((e) => e.type === 'InitiativeSwapped') as InitiativeSwappedEvent;
    expect(event).toBeDefined();
    expect(event.swapperPreviousTotal).toBe(criminalInitBefore);
    expect(event.allyPreviousTotal).toBe(allyInitBefore);
    campaign = commit(campaign, swap);
    const afterCb = campaign.state.encounters[encounterId]!.combatants;
    const criminalAfter = afterCb.find((c) => c.combatantId === criminal.id)!;
    const allyAfter = afterCb.find((c) => c.combatantId === ally.id)!;
    expect(criminalAfter.initiative).toBe(allyInitBefore);
    expect(allyAfter.initiative).toBe(criminalInitBefore);
  });

  it('rejects swap by a character without alert', () => {
    const soldier = buildSoldier();
    const ally = buildCriminal();
    const { engine, campaign: initial, encounterId } = setupEncounter([soldier, ally], 4);
    const campaign = commit(initial, engine.plan.rollInitiative(initial.state, { encounterId }).events);
    expect(() =>
      engine.plan.swapInitiative(campaign.state, {
        encounterId,
        swapperId: soldier.id,
        allyId: ally.id,
      }),
    ).toThrow(/does not have the Alert feat/);
  });

  it('rejects swap when the swapper is Incapacitated', () => {
    const criminal = buildCriminal({ conditions: ['incapacitated'] });
    const ally = buildSoldier();
    const { engine, campaign: initial, encounterId } = setupEncounter([criminal, ally], 5);
    const campaign = commit(initial, engine.plan.rollInitiative(initial.state, { encounterId }).events);
    expect(() =>
      engine.plan.swapInitiative(campaign.state, {
        encounterId,
        swapperId: criminal.id,
        allyId: ally.id,
      }),
    ).toThrow(/cannot swap initiative while Incapacitated/);
  });

  it('rejects swap when the ally is Incapacitated', () => {
    const criminal = buildCriminal();
    const ally = buildSoldier({ conditions: ['incapacitated'] });
    const { engine, campaign: initial, encounterId } = setupEncounter([criminal, ally], 6);
    const campaign = commit(initial, engine.plan.rollInitiative(initial.state, { encounterId }).events);
    expect(() =>
      engine.plan.swapInitiative(campaign.state, {
        encounterId,
        swapperId: criminal.id,
        allyId: ally.id,
      }),
    ).toThrow(/cannot swap initiative while Incapacitated/);
  });

  it('rejects swap with self', () => {
    const criminal = buildCriminal();
    const ally = buildSoldier();
    const { engine, campaign: initial, encounterId } = setupEncounter([criminal, ally], 7);
    const campaign = commit(initial, engine.plan.rollInitiative(initial.state, { encounterId }).events);
    expect(() =>
      engine.plan.swapInitiative(campaign.state, {
        encounterId,
        swapperId: criminal.id,
        allyId: criminal.id,
      }),
    ).toThrow(/swap initiative with self/);
  });

  it('rejects swap after the encounter has started (RAW: immediately after rolling)', () => {
    const criminal = buildCriminal();
    const ally = buildSoldier();
    const { engine, campaign: initial, encounterId } = setupEncounter([criminal, ally], 8);
    let campaign = commit(initial, engine.plan.rollInitiative(initial.state, { encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId }).events);
    expect(() =>
      engine.plan.swapInitiative(campaign.state, {
        encounterId,
        swapperId: criminal.id,
        allyId: ally.id,
      }),
    ).toThrow(/planning status/);
  });

  it('swap recomputes initiativeOrder so the post-swap order matches the swapped values', () => {
    // Three combatants. After the swap, the order should reflect the
    // exchanged initiatives.
    const criminal = buildCriminal({ name: 'Larva' });
    const middle = buildSoldier({ name: 'Cassius' });
    const ally = buildCriminal({ name: 'Slag', backgroundId: 'soldier' }); // soldier no alert
    const { engine, campaign: initial, encounterId } = setupEncounter(
      [criminal, middle, ally],
      9,
    );
    let campaign = commit(initial, engine.plan.rollInitiative(initial.state, { encounterId }).events);
    const beforeCb = campaign.state.encounters[encounterId]!.combatants;
    const criminalInit = beforeCb.find((c) => c.combatantId === criminal.id)!.initiative;
    const allyInit = beforeCb.find((c) => c.combatantId === ally.id)!.initiative;
    if (criminalInit === allyInit) return; // skip degenerate seed
    campaign = commit(
      campaign,
      engine.plan.swapInitiative(campaign.state, {
        encounterId,
        swapperId: criminal.id,
        allyId: ally.id,
      }).events,
    );
    const afterCb = campaign.state.encounters[encounterId]!.combatants;
    // The combatants array is sorted by initiativeOrder; the higher
    // initiative should be earlier in the array.
    for (let i = 1; i < afterCb.length; i++) {
      expect(afterCb[i - 1]!.initiativeOrder).toBeLessThan(afterCb[i]!.initiativeOrder);
    }
    // The order matches the post-swap initiatives in descending order.
    const sortedByInit = [...afterCb].sort((a, b) => b.initiative - a.initiative);
    for (let i = 0; i < sortedByInit.length; i++) {
      expect(sortedByInit[i]!.combatantId).toBe(afterCb[i]!.combatantId);
    }
  });
});
