import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { rollDie } from '../../rng/dice.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { getCreatureType } from '../../derive/creature-type.js';
import { planConcentrationOnDamage } from './concentration.js';
import { applyAll } from '../apply.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const CLERIC_CLASS_ID = 'cleric';
const CHANNEL_DIVINITY_LEVEL = 2;
const CHANNEL_DIVINITY_RESOURCE = 'channel-divinity';
const FRIGHTENED_CONDITION_ID = 'frightened';
const INCAPACITATED_CONDITION_ID = 'incapacitated';
const UNDEAD_TYPE = 'Undead';
// Sear Undead (Cleric L5): WIS-mod d8s (min 1) of Radiant to each Undead
// that fails the Turn Undead save; one pooled roll applied to all.
const SEAR_UNDEAD_LEVEL = 5;
const SEAR_UNDEAD_DIE_SIDES = 8;
const SEAR_UNDEAD_SOURCE = 'sear-undead';
const RADIANT_DAMAGE_TYPE = 'radiant';
const WIS_MOD_BREAKDOWN_SOURCE = 'WIS-mod';

export interface TurnUndeadIntent {
  readonly type: 'TurnUndead';
  readonly clericId: string;
  // The Undead creatures of the cleric's choice within the 30-ft range
  // (consumer-supplied; the engine doesn't model positions). Non-Undead
  // targets are silently skipped (RAW limits to Undead; a consumer
  // passing a mixed list shouldn't fail the whole action).
  readonly targetIds: ReadonlyArray<string>;
  readonly at?: string;
}

// Cleric L2 Channel Divinity option (PHB 2024, SRD 5.2.1): "As a Magic
// action, you present your Holy Symbol and censure Undead creatures.
// Each Undead of your choice within 30 feet of you must make a Wisdom
// saving throw. If the creature fails its save, it has the Frightened
// and Incapacitated conditions for 1 minute. ... This effect ends
// early on the creature if it takes any damage, if you have the
// Incapacitated condition, or if you die."
//
// Spends 1 Channel Divinity use. Save DC = cleric's spell save DC
// (8 + WIS + PB). On failure: Frightened + Incapacitated, both
// stamped with `endsOnDamage: true` (slice 391: any positive damage
// removes them, modeling the "ends early on damage" RAW arm).
//
// Consumer-managed / deferred:
//   - 30-ft range (engine has no positions; consumer filters).
//   - 1-minute duration (mirror of slice 286 — engine emits without
//     auto-expiry; consumer scrubs at the 1-minute boundary).
//   - "ends early ... if you have the Incapacitated condition, or
//     if you die" (engine doesn't track which condition was applied
//     by which feature; consumer scrubs when the cleric drops).
//   - "tries to move as far from you as it can" (positional AI).
//
// Sear Undead (Cleric L5, slice 720): a cleric of level 5+ rolls one pool
// of max(1, WIS mod) d8s and deals that Radiant total to EACH Undead that
// fails the save. Emitted before the conditions so it doesn't end the turn
// effect (RAW). Routed through the normal mitigate + fatal-intercept
// pipeline (radiant resistance / Undead Fortitude apply).
export const planTurnUndead = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: TurnUndeadIntent,
): ReadonlyArray<Event> => {
  const cleric = state.characters[intent.clericId];
  if (!cleric) throw new Error(`Unknown character ${intent.clericId}`);
  const enrollment = cleric.classes.find((c) => c.classId === CLERIC_CLASS_ID);
  if (enrollment === undefined || enrollment.level < CHANNEL_DIVINITY_LEVEL) {
    throw new Error(
      `${cleric.name} does not have Channel Divinity (requires Cleric level ${CHANNEL_DIVINITY_LEVEL})`,
    );
  }

  const resource = cleric.resources.find((r) => r.resourceId === CHANNEL_DIVINITY_RESOURCE);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${cleric.name} has no Channel Divinity uses remaining (regain on a Short or Long Rest)`,
    );
  }

  const activeEncounterId = state.activeEncounterId;
  const encounter = activeEncounterId ? state.encounters[activeEncounterId] : undefined;
  const active = encounter?.combatants[encounter.activeIndex];
  // Action-economy gate only fires when in-encounter and active.
  if (encounter !== undefined && active?.combatantId === intent.clericId) {
    if (active.turnUsage.actionUsed) {
      throw new Error(`${cleric.name} has already used their action this turn`);
    }
  }

  const at = intent.at ?? nowIso();
  const dcResult = computeSpellSaveDC({
    character: cleric,
    itemInstances: state.itemInstances,
    content,
    classId: CLERIC_CLASS_ID,
    pendingChoices: state.pendingChoices,
  });
  const dc = dcResult.total;

  // Sear Undead (Cleric L5): one pooled roll of max(1, WIS mod) d8s,
  // applied as Radiant to EACH Undead that fails its save. The WIS mod is
  // read from the (effective-score-aware) save-DC breakdown, mirroring
  // Divine Spark. Rolled once here so the per-target loop reuses the total.
  const hasSearUndead = enrollment.level >= SEAR_UNDEAD_LEVEL;
  const wisMod = dcResult.breakdown.find((e) => e.source === WIS_MOD_BREAKDOWN_SOURCE)?.value ?? 0;
  let searTotal = 0;
  if (hasSearUndead) {
    const dice = Math.max(1, wisMod);
    for (let i = 0; i < dice; i += 1) searTotal += rollDie(SEAR_UNDEAD_DIE_SIDES, rng);
  }

  const events: Event[] = [];
  if (encounter !== undefined && active?.combatantId === intent.clericId) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: encounter.id,
      combatantId: intent.clericId,
      kind: 'action',
    } satisfies ActionEconomyConsumedEvent);
  }
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.clericId as ULID,
    resourceId: CHANNEL_DIVINITY_RESOURCE,
    amount: 1,
  } satisfies ResourceSpentEvent);

  for (const targetId of intent.targetIds) {
    const target = state.characters[targetId];
    if (target === undefined) continue;
    // RAW: only Undead. Skip silently if the consumer passed a non-
    // Undead target so a mixed list doesn't break the action.
    if (getCreatureType(target, content) !== UNDEAD_TYPE) continue;
    const result = rollSaveAgainstDC({
      state,
      content,
      targetId,
      ability: 'WIS',
      dc,
      sourceIsMagical: true,
      rng,
      at,
      savePreventsCondition: FRIGHTENED_CONDITION_ID,
    });
    if (result === undefined) continue;
    events.push(result.event);
    if (!result.success) {
      const causedBy = result.event.id;
      // Sear Undead damage is emitted BEFORE the Frightened/Incapacitated
      // conditions (which carry endsOnDamage) so it doesn't end the turn
      // effect it accompanies (RAW: "This damage doesn't end the turn
      // effect"). Subsequent OTHER damage still ends them.
      if (hasSearUndead && searTotal > 0) {
        const mitigated = mitigateDamage({
          character: target,
          itemInstances: state.itemInstances,
          content,
          rawComponents: [{ amount: searTotal, type: RADIANT_DAMAGE_TYPE }],
          characters: state.characters,
          sourceIsMagical: true,
        });
        const intercept = interceptFatalDamage({
          state: applyAll(state, events),
          content,
          targetId,
          mitigatedComponents: mitigated,
          causedByEventId: causedBy,
          at,
          rng,
        });
        const searDamage: DamageAppliedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'DamageApplied',
          targetId: targetId as ULID,
          components: intercept.components,
          causedByEventId: causedBy,
          sourceCharacterId: intent.clericId as ULID,
          source: SEAR_UNDEAD_SOURCE,
        };
        events.push(searDamage);
        events.push(...intercept.extraEvents);
        // RAW: taking damage forces a concentration save (same pipeline as
        // every other DamageApplied emitter).
        events.push(
          ...planConcentrationOnDamage(state, content, rng, target, intercept.components, searDamage.id, at),
        );
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: targetId as ULID,
        conditionId: FRIGHTENED_CONDITION_ID,
        appliedConditionId: newAppliedConditionId(),
        sourceCharacterId: intent.clericId as ULID,
        causedByEventId: causedBy,
        endsOnDamage: true,
      } satisfies ConditionAppliedEvent);
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: targetId as ULID,
        conditionId: INCAPACITATED_CONDITION_ID,
        appliedConditionId: newAppliedConditionId(),
        sourceCharacterId: intent.clericId as ULID,
        causedByEventId: causedBy,
        endsOnDamage: true,
      } satisfies ConditionAppliedEvent);
    }
  }

  return events;
};
