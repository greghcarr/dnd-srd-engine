// Slice 876 — Shocking Grasp's "can't make Opportunity Attacks" rider. Closes
// the L7 audit Area-2 row `shocking-grasp-no-oa-denial`.
//
// RAW (SRD 5.2.1 Shocking Grasp): "On a hit, the target takes 1d8 Lightning
// damage, and it can't make Opportunity Attacks until the start of its next
// turn." The damage was wired; the OA-denial wasn't.
//
// Modeled like Monk Open Hand "Addle": a new effect-less `shocking-grasped`
// marker applied via the attack mechanic's `conditionOnHit`, read by the OA
// emission (planMove) and resolution (planOpportunityAttack) — the shared
// `cannotMakeOpportunityAttack` guard now covers `addled` + `shocking-grasped`,
// so an Addled creature is also (now) suppressed in the OA emission, not just
// rejected on resolution (a pattern-check fix).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEncounterId, newAppliedConditionId } from '../../../src/ids.js';
import { buildFighter, makeItemInstance, eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { OpportunityAvailableEvent, CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type {
  EncounterCreatedEvent, InitiativeRolledEvent, EncounterStartedEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
    knownSpells: ['shocking-grasp'],
    preparedSpells: ['shocking-grasp'],
  });

const applyCondition = (targetId: string, conditionId: string): ConditionAppliedEvent => ({
  id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId,
  conditionId, appliedConditionId: newAppliedConditionId(),
});

describe('Shocking Grasp OA-denial (slice 876)', () => {
  it('wires the on-hit shocking-grasped rider', () => {
    const mech = PACK.spells.find((s) => s.id === 'shocking-grasp')?.mechanicalEffects?.[0] as
      | { kind: string; conditionOnHit?: string }
      | undefined;
    expect(mech?.kind).toBe('attack');
    expect(mech?.conditionOnHit).toBe('shocking-grasped');
    expect(PACK.conditions!.some((c) => c.id === 'shocking-grasped')).toBe(true);
  });

  it('a hit applies shocking-grasped to the target', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const wizard = buildWizard();
      const target = buildFighter({ name: 'Target' });
      let campaign: Campaign = engine.createCampaign({ name: `sg-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id, spellId: 'shocking-grasp', slotLevel: 0, targetIds: [target.id],
      }).events;
      const cond = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'shocking-grasped',
      ) as ConditionAppliedEvent | undefined;
      if (cond === undefined) continue; // need a hit
      expect(cond.targetId).toBe(target.id);
      return;
    }
    throw new Error('no hit seed across 60 tries');
  });

  // A positioned encounter: a mover adjacent to two reactors moves out of reach
  // of both. The grasped reactor is NOT offered an OA; the free one is.
  const setupMoveOutOfReach = (graspReactorA: boolean, addleReactorA: boolean) => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const mover = buildFighter({ name: 'Mover', DEX: 18 });
    const reactorA = buildFighter({ name: 'ReactorA' });
    const reactorB = buildFighter({ name: 'ReactorB' });
    let campaign: Campaign = engine.createCampaign({ name: 'sg-oa' });
    campaign = commit(campaign, [mover, reactorA, reactorB].map((c) =>
      ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent));
    const encounterId = newEncounterId();
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [mover.id, reactorA.id, reactorB.id] } satisfies EncounterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [
        { combatantId: mover.id, d20: 20, modifier: 4, total: 24 },
        { combatantId: reactorA.id, d20: 5, modifier: 0, total: 5 },
        { combatantId: reactorB.id, d20: 4, modifier: 0, total: 4 },
      ] } satisfies InitiativeRolledEvent,
      { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: mover.id, round: 1 } satisfies TurnStartedEvent,
    ]);
    const place = (combatantId: string, x: number, y: number): CombatantMovedEvent => ({
      id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId, combatantId,
      fromPosition: { x: 0, y: 0 }, toPosition: { x, y }, feetTraveled: 0,
    });
    campaign = commit(campaign, [place(mover.id, 5, 5), place(reactorA.id, 10, 5), place(reactorB.id, 5, 10)]);
    if (graspReactorA) campaign = commit(campaign, [applyCondition(reactorA.id, 'shocking-grasped')]);
    if (addleReactorA) campaign = commit(campaign, [applyCondition(reactorA.id, 'addled')]);
    const events = engine.plan.move(campaign.state, { combatantId: mover.id, to: { x: 5, y: 25 } }).events;
    const oaReactorIds = events
      .filter((e): e is OpportunityAvailableEvent => e.type === 'OpportunityAvailable')
      .map((e) => e.reactorId);
    return { engine, campaign, oaReactorIds, reactorAId: reactorA.id, reactorBId: reactorB.id };
  };

  it('a shocking-grasped creature is not offered an Opportunity Attack (the free one is)', () => {
    const { oaReactorIds, reactorAId, reactorBId } = setupMoveOutOfReach(true, false);
    expect(oaReactorIds).toContain(reactorBId);
    expect(oaReactorIds).not.toContain(reactorAId);
  });

  it('pattern-check: an Addled creature is now also suppressed in the OA emission', () => {
    const { oaReactorIds, reactorAId, reactorBId } = setupMoveOutOfReach(false, true);
    expect(oaReactorIds).toContain(reactorBId);
    expect(oaReactorIds).not.toContain(reactorAId);
  });

  it('a shocking-grasped reactor is rejected at OA resolution', () => {
    const { engine, campaign, reactorAId } = (() => {
      const s = setupMoveOutOfReach(true, false);
      return s;
    })();
    const fist = makeItemInstance('unarmed-strike');
    const withFist = commit(campaign, [{ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fist }]);
    expect(() =>
      engine.plan.opportunityAttack(withFist.state, { reactorId: reactorAId, targetId: campaign.state.encounters[campaign.state.activeEncounterId!]!.combatants[0]!.combatantId, weaponInstanceId: fist.id }),
    ).toThrow(/Shocking-Grasped/);
  });
});
