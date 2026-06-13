import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { RNG } from '../../rng/index.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ConditionRemovedEvent, ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { AbilityScore } from '../../schemas/primitives.js';

export interface TickRecurringSaveIntent {
  readonly type: 'TickRecurringSave';
  // The bearer of the condition (the creature making the save).
  readonly targetId: string;
  // Which condition on the bearer to tick. The condition must declare
  // `recurringSave` metadata — the planner throws otherwise.
  readonly conditionId: string;
  // The spell caster whose DC the save is rolled against. Defaults to
  // the AppliedCondition's `sourceCharacterId` (set by spell planners
  // since slice 88); throws if both are absent.
  readonly casterId?: string;
  // Defaults to the caster's primary spellcasting class. Throws if no
  // spellcasting class is available.
  readonly castingClassId?: string;
  // Slice 847: roll this tick's save with Advantage. RAW Hideous Laughter:
  // "At the end of each of its turns AND each time it takes damage, it makes
  // another Wisdom saving throw. The target has Advantage on the save if the
  // save is triggered by damage." The condition's `recurringSave.trigger`
  // names the end-of-turn tick (rolled flat); the consumer sets this flag
  // when it instead fires the tick in response to the bearer taking damage.
  // It nets against any disadvantage source per RAW (see _save-roll.ts).
  readonly advantage?: boolean;
  readonly at?: string;
}

const findPrimarySpellcastingClass = (
  character: Character,
  content: ResolvedContent,
): string | undefined => {
  for (const enrollment of character.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (cls?.spellcasting !== undefined) return enrollment.classId;
  }
  return undefined;
};

/**
 * One tick of a recurring-save effect against the named condition on
 * the named bearer. The consumer calls this at the trigger moment
 * (start or end of the bearer's turn, per the condition's metadata)
 * for any condition that declares `recurringSave`. Two RAW shapes:
 *
 *   - onFail = 'consumeAction' (Bestow Curse "Inactive Turn"): WIS
 *     save against the curse caster's spell DC; failure consumes the
 *     bearer's action that turn.
 *   - onSuccess = 'removeCondition' (Hold Person / Hold Monster /
 *     Hideous Laughter / Confusion): save against the caster's DC;
 *     success lifts the condition off the bearer (the spell ends on
 *     the target).
 *
 * Emits a `SaveRolled` event. On failure, if onFail is set and the
 * bearer is a combatant in the active encounter, emits an
 * `ActionEconomyConsumed` (action) — out-of-encounter ticks skip
 * action-consume since action economy only exists inside initiative.
 * On success, if onSuccess is set, emits a `ConditionRemoved` for
 * the named condition on the bearer.
 *
 * Slice 847: when `intent.advantage` is set, the save rolls with an
 * extra advantage source (netted against disadvantage per RAW). The
 * consumer sets it for Hideous Laughter's damage-triggered repeat save
 * ("Advantage on the save if the save is triggered by damage"); the
 * end-of-turn tick leaves it unset (rolled flat).
 */
export const planTickRecurringSave = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: TickRecurringSaveIntent,
): ReadonlyArray<Event> => {
  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown target ${intent.targetId}`);

  const applied = target.appliedConditions.find((c) => c.conditionId === intent.conditionId);
  if (!applied) {
    throw new Error(
      `${target.name} does not have condition '${intent.conditionId}'`,
    );
  }

  const conditionDef = content.conditions.get(intent.conditionId);
  if (!conditionDef) {
    throw new Error(`Condition '${intent.conditionId}' not found in content`);
  }
  // Per-instance fixed-DC recurring save (slice 388): a non-spell source
  // (Cunning Strike Poison / Knock Out) bakes the save ability + DC onto
  // the applied condition. When present, re-roll that save at the bearer's
  // baked DC and end the condition on a success, with no caster /
  // spellcasting-class resolution. Otherwise fall back to the definition's
  // `recurringSave` against the source's spell DC (Hold Person, etc.).
  const instanceFixed =
    applied.recurringSaveDC !== undefined && applied.recurringSaveAbility !== undefined
      ? { ability: applied.recurringSaveAbility, dc: applied.recurringSaveDC }
      : undefined;
  if (instanceFixed === undefined && conditionDef.recurringSave === undefined) {
    throw new Error(
      `Condition '${intent.conditionId}' has no recurringSave metadata`,
    );
  }

  let dc: number;
  let saveAbility: AbilityScore;
  let onSuccess: 'removeCondition' | undefined;
  let onFail: 'consumeAction' | 'dodge' | 'escalateToCondition' | undefined;
  let escalateToConditionId: string | undefined;
  if (instanceFixed !== undefined) {
    dc = instanceFixed.dc;
    saveAbility = instanceFixed.ability;
    onSuccess = 'removeCondition'; // a fixed-DC instance always ends on a success
    onFail = undefined;
  } else {
    const def = conditionDef.recurringSave;
    if (def === undefined) throw new Error(`Condition '${intent.conditionId}' has no recurringSave metadata`);
    saveAbility = def.ability;
    onSuccess = def.onSuccess;
    onFail = def.onFail;
    escalateToConditionId = def.escalateToConditionId;
    // Slice 488: condition-definition `fixedDC` skips caster / spellcasting-class
    // resolution entirely (Cockatrice CON DC 11). When unset, fall back to the
    // source caster's spell DC (Hold Person, etc.).
    if (def.fixedDC !== undefined) {
      dc = def.fixedDC;
    } else {
      const casterId = intent.casterId ?? applied.sourceCharacterId;
      if (casterId === undefined) {
        throw new Error(
          `Cannot tick recurring save for '${intent.conditionId}' on ${target.name}: no casterId in intent and no sourceCharacterId on the applied condition`,
        );
      }
      const caster = state.characters[casterId];
      if (!caster) throw new Error(`Unknown caster ${casterId}`);
      const castingClassId =
        intent.castingClassId ?? findPrimarySpellcastingClass(caster, content);
      if (castingClassId === undefined) {
        throw new Error(`Caster ${caster.name} has no spellcasting class`);
      }
      dc = computeSpellSaveDC({
        character: caster,
        itemInstances: state.itemInstances,
        content,
        pendingChoices: state.pendingChoices,
        classId: castingClassId,
        characters: state.characters,
      }).total;
    }
  }

  const at = intent.at ?? nowIso();
  // Slice 133: conditions with a recurringSave entry are spell-applied
  // (Hold Person, Hold Monster, Hideous Laughter, Confusion, Bestow
  // Curse's inactive-turn variant), so the recurring save counts as a
  // magical effect (sourceIsMagical) and honors save advantage /
  // disadvantage. Slice 291: when success ends the condition, surface
  // the condition id so per-condition save-advantage buffs (Antitoxin's
  // poisoned gate) fire; onFail-only recurring saves don't end the
  // condition on success, so the gate stays off.
  const saveResult = rollSaveAgainstDC({
    state,
    content,
    targetId: intent.targetId,
    ability: saveAbility,
    dc,
    sourceIsMagical: true,
    rng,
    at,
    ...(intent.advantage === true ? { advantage: true } : {}),
    ...(onSuccess === 'removeCondition'
      ? { savePreventsCondition: intent.conditionId }
      : {}),
  });
  // The bearer was resolved above (throws on miss), so the save always
  // rolls; the helper only returns undefined on an unknown target.
  if (saveResult === undefined) throw new Error(`Unknown target ${intent.targetId}`);
  const saveEvent = saveResult.event;
  const success = saveResult.success;

  const events: Event[] = [];
  events.push(saveEvent);

  if (!success && (onFail === 'consumeAction' || onFail === 'dodge')) {
    const activeEncounterId = state.activeEncounterId;
    if (activeEncounterId !== undefined) {
      const encounter = state.encounters[activeEncounterId];
      if (encounter?.combatants.some((c) => c.combatantId === intent.targetId)) {
        const consumed: ActionEconomyConsumedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'ActionEconomyConsumed',
          encounterId: activeEncounterId,
          combatantId: intent.targetId,
          kind: 'action',
          causedByEventId: saveEvent.id,
        };
        events.push(consumed);
        // 'dodge' (Bestow Curse inactive-turn arm): forced to take the
        // Dodge action, so the bearer also gains Dodge's defensive
        // benefit. Mirrors planDodge: a plain ConditionApplied('dodged');
        // expiry comes from the condition's own `endsOn` (turn end).
        if (onFail === 'dodge') {
          const dodged: ConditionAppliedEvent = {
            id: newEventId() as ULID,
            at,
            type: 'ConditionApplied',
            targetId: intent.targetId as ULID,
            conditionId: 'dodged',
            appliedConditionId: newAppliedConditionId(),
            causedByEventId: saveEvent.id,
          };
          events.push(dodged);
        }
      }
    }
  }
  // Slice 488: escalation arm. On a failed save, remove the current
  // condition and apply the target condition (Cockatrice Restrained ->
  // Petrified). The condition reducer enforces immunity (statblock
  // conditionImmunities + effect-stack GrantConditionImmunity), so the
  // planner emits both events unconditionally and lets the reducer
  // canonicalize. Source carries through from the original applied
  // condition so the escalated condition's `sourceCharacterId` still
  // names the Cockatrice / Medusa / etc. that bit the target.
  if (!success && onFail === 'escalateToCondition' && escalateToConditionId !== undefined) {
    const removed: ConditionRemovedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: intent.targetId as ULID,
      conditionId: intent.conditionId,
      causedByEventId: saveEvent.id,
    };
    events.push(removed);
    const escalated: ConditionAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: intent.targetId as ULID,
      conditionId: escalateToConditionId,
      appliedConditionId: newAppliedConditionId(),
      sourceCharacterId: applied.sourceCharacterId,
      causedByEventId: saveEvent.id,
      // Slice 783: carry the original condition's concentration link +
      // ends-on-damage onto the escalated condition. Sleep's drowsy phase
      // escalates to Unconscious; the new condition must still clear when the
      // caster drops concentration (clearConcentrationEffect sweeps applied
      // conditions by sourceEffectInstanceId) and end if the target takes
      // damage. Cockatrice's fixed-DC Petrified carries neither, so this is
      // a no-op there.
      ...(applied.sourceEffectInstanceId !== undefined
        ? { sourceEffectInstanceId: applied.sourceEffectInstanceId }
        : {}),
      ...(applied.endsOnDamage === true ? { endsOnDamage: true } : {}),
    };
    events.push(escalated);
  }

  if (success && onSuccess === 'removeCondition') {
    const removed: ConditionRemovedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: intent.targetId as ULID,
      conditionId: intent.conditionId,
      causedByEventId: saveEvent.id,
    };
    events.push(removed);
  }

  return events;
};
