import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { computeSavingThrow } from '../../derive/save.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ConditionRemovedEvent } from '../../schemas/events/combat.js';

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
  if (conditionDef.recurringSave === undefined) {
    throw new Error(
      `Condition '${intent.conditionId}' has no recurringSave metadata`,
    );
  }

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

  const dcResult = computeSpellSaveDC({
    character: caster,
    itemInstances: state.itemInstances,
    content,
    pendingChoices: state.pendingChoices,
    classId: castingClassId,
    characters: state.characters,
  });

  const saveDerivation = computeSavingThrow({
    character: target,
    itemInstances: state.itemInstances,
    content,
    ability: conditionDef.recurringSave.ability,
    characters: state.characters,
    // Slice 133: conditions with a recurringSave entry are spell-
    // applied (Hold Person, Hold Monster, Hideous Laughter, Confusion,
    // Bestow Curse's inactive-turn variant), so the recurring save
    // counts as a magical effect.
    sourceIsMagical: true,
    // Slice 291: when the recurring save's success ends the condition,
    // surface the condition id so per-condition save-advantage buffs
    // (Antitoxin's poisoned gate) can fire. onFail-only recurring
    // saves don't end the condition on success, so the gate stays
    // off.
    ...(conditionDef.recurringSave.onSuccess === 'removeCondition'
      ? { savePreventsCondition: intent.conditionId }
      : {}),
  });

  // Slice 133: honor save advantage / disadvantage. The recurring
  // path now rolls 2d20 take-max / take-min when applicable.
  const at = intent.at ?? nowIso();
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  if (saveDerivation.hasAdvantage || saveDerivation.hasDisadvantage) {
    rolls.push(rollDie(D20_SIDES, rng));
  }
  const used = saveDerivation.hasAdvantage
    ? 'advantage'
    : saveDerivation.hasDisadvantage
      ? 'disadvantage'
      : 'none';
  const usedD20 = saveDerivation.hasAdvantage
    ? Math.max(...rolls)
    : saveDerivation.hasDisadvantage
      ? Math.min(...rolls)
      : rolls[0]!;
  const total = usedD20 + saveDerivation.total;
  const success = total >= dcResult.total;

  const events: Event[] = [];
  const saveEvent: SaveRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.targetId as ULID,
    ability: conditionDef.recurringSave.ability,
    dc: dcResult.total,
    d20: rolls,
    used,
    bonus: saveDerivation.total,
    total,
    success,
    breakdown: [...saveDerivation.breakdown],
  };
  events.push(saveEvent);

  if (!success && conditionDef.recurringSave.onFail === 'consumeAction') {
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
      }
    }
  }

  if (success && conditionDef.recurringSave.onSuccess === 'removeCondition') {
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
