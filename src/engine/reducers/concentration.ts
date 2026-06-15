import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  ConcentrationBrokenEvent,
  ConcentrationStartedEvent,
  SpellEffectStartedEvent,
  AuraDamageBudgetSpentEvent,
} from '../../schemas/events/concentration.js';
import { invariant } from '../../internal/invariants.js';

export const applyConcentrationStarted = (
  state: Draft<CampaignState>,
  event: ConcentrationStartedEvent,
): void => {
  const caster = state.characters[event.casterId];
  invariant(caster !== undefined, `Caster ${event.casterId} not found`);
  invariant(
    state.effectInstances[event.effectInstanceId] === undefined,
    `EffectInstance ${event.effectInstanceId} already exists`,
  );
  state.effectInstances[event.effectInstanceId] = {
    id: event.effectInstanceId,
    spellId: event.spellId,
    casterId: event.casterId,
    targetIds: [...event.targetIds],
    conditionsApplied: [...event.conditionsApplied],
    requiresConcentration: true,
    ...(event.durationRounds !== undefined ? { durationRounds: event.durationRounds } : {}),
    ...(event.durationMinutes !== undefined
      ? {
          durationMinutes: event.durationMinutes,
          startedAtMinutes: state.inGameTime.totalMinutes,
        }
      : {}),
    ...(event.slotLevel !== undefined ? { slotLevel: event.slotLevel } : {}),
    startedAtEventId: event.id,
    // Slice 495: persist zone metadata so consumers can read the
    // positioned AOE from state, not just from the event log.
    ...(event.zone !== undefined ? { zone: event.zone } : {}),
  };
  caster.concentrationEffectId = event.effectInstanceId;
};

// Slice 665: non-concentration spell-effect creation. Mirror of
// applyConcentrationStarted but:
//   - sets `requiresConcentration: false` on the EffectInstance, AND
//   - does NOT set `caster.concentrationEffectId` (the caster is not
//     concentrating; they can cast another concentration spell).
// Cleanup (when the listed duration ends) is the same
// ConcentrationBroken event handled by applyConcentrationBroken;
// `clearConcentrationEffect` tolerates non-concentration
// EffectInstances (it just deletes the record + cascades any
// applied conditions / rider state without caring about the
// concentration flag).
export const applySpellEffectStarted = (
  state: Draft<CampaignState>,
  event: SpellEffectStartedEvent,
): void => {
  const caster = state.characters[event.casterId];
  invariant(caster !== undefined, `Caster ${event.casterId} not found`);
  invariant(
    state.effectInstances[event.effectInstanceId] === undefined,
    `EffectInstance ${event.effectInstanceId} already exists`,
  );
  state.effectInstances[event.effectInstanceId] = {
    id: event.effectInstanceId,
    spellId: event.spellId,
    casterId: event.casterId,
    targetIds: [...event.targetIds],
    conditionsApplied: [...event.conditionsApplied],
    requiresConcentration: false,
    ...(event.durationRounds !== undefined ? { durationRounds: event.durationRounds } : {}),
    ...(event.durationMinutes !== undefined
      ? {
          durationMinutes: event.durationMinutes,
          startedAtMinutes: state.inGameTime.totalMinutes,
        }
      : {}),
    ...(event.slotLevel !== undefined ? { slotLevel: event.slotLevel } : {}),
    startedAtEventId: event.id,
    ...(event.zone !== undefined ? { zone: event.zone } : {}),
    // Slice 873: initial cumulative-damage budget (Guardian of Faith's 60).
    ...(event.auraDamageBudgetRemaining !== undefined
      ? { auraDamageBudgetRemaining: event.auraDamageBudgetRemaining }
      : {}),
  };
};

// Slice 873: a budgeted aura-damage tick spent part of its budget. Subtract
// from the EffectInstance's remaining budget (clamped at 0). The effect itself
// is deleted by the ConcentrationBroken the tick planner emits alongside this
// when the budget is exhausted; this reducer only updates the counter.
export const applyAuraDamageBudgetSpent = (
  state: Draft<CampaignState>,
  event: AuraDamageBudgetSpentEvent,
): void => {
  const effect = state.effectInstances[event.effectInstanceId];
  if (effect === undefined || effect.auraDamageBudgetRemaining === undefined) return;
  effect.auraDamageBudgetRemaining = Math.max(0, effect.auraDamageBudgetRemaining - event.amount);
};

/**
 * Cascading cleanup for an effect that the caster is concentrating on:
 * remove any conditions the effect applied to other characters, reverse
 * hpMax bonuses contributed by those conditions, clear the caster's
 * concentration pointer, and delete the effect instance.
 *
 * Tolerates a dangling `concentrationEffectId` pointing at a missing
 * effect instance (e.g. when the damage reducer needs to defensively
 * clear concentration on a character whose effect record never got
 * registered). In that case it just clears the caster's pointer.
 */
export const clearConcentrationEffect = (
  state: Draft<CampaignState>,
  effectInstanceId: string,
): void => {
  const effect = state.effectInstances[effectInstanceId];
  if (effect === undefined) {
    // Dangling pointer: walk characters and unset any matching
    // concentrationEffectId. Cheap; the character table is small.
    for (const ch of Object.values(state.characters)) {
      if (ch.concentrationEffectId === effectInstanceId) {
        ch.concentrationEffectId = undefined;
      }
    }
    return;
  }
  const caster = state.characters[effect.casterId];
  for (const applied of effect.conditionsApplied) {
    const target = state.characters[applied.targetId];
    if (!target) continue;
    // Reverse any hpMax bonus the dropped condition contributed,
    // mirroring applyConditionRemoved.
    const entry = target.appliedConditions.find((c) => c.id === applied.appliedConditionId);
    if (entry?.hpMaxBonusDelta !== undefined && entry.hpMaxBonusDelta !== 0) {
      target.hp.maxBonus = (target.hp.maxBonus ?? 0) - entry.hpMaxBonusDelta;
    }
    target.appliedConditions = target.appliedConditions.filter(
      (c) => c.id !== applied.appliedConditionId,
    );
  }
  // Slice 110: sweep rider-applied conditions across all characters.
  // Rider-applied entries (Holy Aura's blinded on attackers, Spirit
  // Shroud's heal-block on hit targets) are stamped with
  // `sourceEffectInstanceId` at dispatch time. The direct-condition
  // loop above only catches what the EffectInstance tracks in its
  // `conditionsApplied` array; this loop catches everything else
  // keyed back to this concentration.
  for (const ch of Object.values(state.characters)) {
    const matches = ch.appliedConditions.filter(
      (c) => c.sourceEffectInstanceId === effectInstanceId,
    );
    if (matches.length === 0) continue;
    for (const entry of matches) {
      if (entry.hpMaxBonusDelta !== undefined && entry.hpMaxBonusDelta !== 0) {
        ch.hp.maxBonus = (ch.hp.maxBonus ?? 0) - entry.hpMaxBonusDelta;
      }
    }
    ch.appliedConditions = ch.appliedConditions.filter(
      (c) => c.sourceEffectInstanceId !== effectInstanceId,
    );
  }
  if (caster?.concentrationEffectId === effectInstanceId) {
    caster.concentrationEffectId = undefined;
  }
  // Auto-dismiss any companions whose summon was bound to this
  // concentration effect. Mirrors the condition-removal pattern just
  // above: the companion's existence depended on the effect, so it
  // goes when the effect goes. No explicit CompanionDismissed event
  // fires; the ConcentrationBroken event covers the cause.
  for (const ch of Object.values(state.characters)) {
    if (ch.summonSource?.effectInstanceId === effectInstanceId) {
      delete state.characters[ch.id];
    }
  }
  // Strip any item buffs (Magic Weapon, Elemental Weapon, etc.) that
  // were stamped onto an item instance by this concentration effect.
  // No standalone ItemBuffRemoved event fires — the ConcentrationBroken
  // event covers the cause and this loop does the actual clear.
  for (const instance of Object.values(state.itemInstances)) {
    if (instance.temporaryBuff?.sourceEffectInstanceId === effectInstanceId) {
      instance.temporaryBuff = undefined;
    }
  }
  // Slice 135: sweep sensors (Clairvoyance, future Scrying) linked
  // to this concentration. Same shape as the item-buff sweep above.
  for (const sensorId of Object.keys(state.sensors)) {
    const sensor = state.sensors[sensorId];
    if (sensor?.sourceEffectInstanceId === effectInstanceId) {
      delete state.sensors[sensorId];
    }
  }
  // Slice 137: sweep illusions (Silent Image, Major Image, future
  // illusion spells) linked to this concentration.
  for (const illusionId of Object.keys(state.illusions)) {
    const illusion = state.illusions[illusionId];
    if (illusion?.sourceEffectInstanceId === effectInstanceId) {
      delete state.illusions[illusionId];
    }
  }
  delete state.effectInstances[effectInstanceId];
};

export const applyConcentrationBroken = (
  state: Draft<CampaignState>,
  event: ConcentrationBrokenEvent,
): void => {
  // No invariant on the effectInstance — clearConcentrationEffect
  // tolerates a dangling pointer (defensive helper extracted from
  // this reducer). The same event can fire harmlessly if a prior
  // commit already cleared the concentration (e.g. the
  // DamageApplied auto-clear inside the same event chain, followed
  // by an explicit ConcentrationBroken from planConcentrationBreakOnDrop).
  clearConcentrationEffect(state, event.effectInstanceId);
};
