import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  LongRestEndedEvent,
  LongRestStartedEvent,
  ShortRestEndedEvent,
  ShortRestStartedEvent,
} from '../../schemas/events/rest.js';
import { invariant } from '../../internal/invariants.js';
import {
  clearLongRestCountersForCharacters,
  clearShortRestCountersForCharacters,
} from './triggers.js';

export const applyShortRestStarted = (
  state: Draft<CampaignState>,
  event: ShortRestStartedEvent,
): void => {
  invariant(state.activeShortRest === undefined, 'A short rest is already in progress');
  invariant(state.activeLongRest === undefined, 'Cannot short rest during a long rest');
  state.activeShortRest = {
    startedAtEventId: event.id,
    participantIds: [...event.participantIds],
  };
};

export const applyShortRestEnded = (
  state: Draft<CampaignState>,
  event: ShortRestEndedEvent,
): void => {
  const session = state.activeShortRest;
  invariant(session !== undefined, 'No active short rest to end');
  state.activeShortRest = undefined;
  for (const id of session.participantIds) {
    const character = state.characters[id];
    if (!character) continue;
    character.pactSlotsUsed = 0;
    // Slice 657: honor the per-resource recharge cadence on short
    // rest. 'shortRest' resources fully recharge; 'partialShortFullLong'
    // resources recharge +1 (capped at max). Other cadences
    // ('longRest', 'turn', 'dawn', etc.) are no-ops here. Pre-657
    // behavior was no-op for all resources; opt-in via the new
    // `recharge` field on ResourceState (default 'longRest' preserves
    // pre-657 behavior for characters that don't set it).
    for (const resource of character.resources) {
      const cadence = resource.recharge;
      if (cadence === 'shortRest') {
        resource.current = resource.max;
      } else if (cadence === 'partialShortFullLong' && resource.current < resource.max) {
        resource.current = Math.min(resource.max, resource.current + 1);
      }
    }
  }
  // Slice 718: apply the RecoverResource deltas the planner resolved
  // against the pre-rest state (Font of Inspiration regains all Bardic
  // Inspiration; Sorcerous Restoration regains floor(level/2) Sorcery
  // Points and spends its once-per-Long-Rest gate). Clamped to 0..max.
  for (const d of event.resourceDeltas ?? []) {
    const character = state.characters[d.characterId];
    if (!character) continue;
    const resource = character.resources.find((r) => r.resourceId === d.resourceId);
    if (resource === undefined) continue;
    resource.current = Math.max(0, Math.min(resource.max, resource.current + d.delta));
  }
  clearShortRestCountersForCharacters(state, session.participantIds);
};

export const applyLongRestStarted = (
  state: Draft<CampaignState>,
  event: LongRestStartedEvent,
): void => {
  invariant(state.activeShortRest === undefined, 'Cannot long rest during a short rest');
  invariant(state.activeLongRest === undefined, 'A long rest is already in progress');
  state.activeLongRest = {
    startedAtEventId: event.id,
    participantIds: [...event.participantIds],
  };
  // RAW 2024: a long rest involves at least 6 hours of sleep, and the
  // concentration rules end concentration when the caster falls
  // unconscious. So as soon as a long rest starts, every participant's
  // concentration (and the conditions it had applied on other targets)
  // should clear. Iterate the participants, find each one's concentration
  // effect, lift the conditions on any tracked targets, and free the
  // effect instance.
  for (const id of event.participantIds) {
    const character = state.characters[id];
    if (!character) continue;
    const effectId = character.concentrationEffectId;
    if (effectId === undefined) continue;
    const effect = state.effectInstances[effectId];
    if (effect !== undefined) {
      for (const applied of effect.conditionsApplied) {
        const target = state.characters[applied.targetId];
        if (!target) continue;
        const entry = target.appliedConditions.find((c) => c.id === applied.appliedConditionId);
        if (entry?.hpMaxBonusDelta !== undefined && entry.hpMaxBonusDelta !== 0) {
          target.hp.maxBonus = (target.hp.maxBonus ?? 0) - entry.hpMaxBonusDelta;
        }
        target.appliedConditions = target.appliedConditions.filter(
          (c) => c.id !== applied.appliedConditionId,
        );
      }
      delete state.effectInstances[effectId];
    }
    character.concentrationEffectId = undefined;
  }
};

export const applyLongRestEnded = (
  state: Draft<CampaignState>,
  _event: LongRestEndedEvent,
): void => {
  const session = state.activeLongRest;
  invariant(session !== undefined, 'No active long rest to end');
  state.activeLongRest = undefined;
  for (const id of session.participantIds) {
    const character = state.characters[id];
    if (!character) continue;
    character.hp.current = character.hp.max;
    character.hp.temp = 0;
    character.deathSaves.successes = 0;
    character.deathSaves.failures = 0;
    character.deathSaves.stable = false;
    if (character.exhaustion > 0) {
      character.exhaustion = character.exhaustion - 1;
    }
    // SRD 5.2.1 Long Rest regains ALL spent Hit Point Dice (rules-glossary
    // "Long Rest": "You regain all lost Hit Points and all spent Hit Point
    // Dice"). The prior half-your-total-HD budget was the 2014 rule
    // (slice 781 edition-drift fix).
    for (const enrollment of character.classes) {
      enrollment.hitDiceRemaining = enrollment.level;
    }
    for (const resource of character.resources) {
      resource.current = resource.max;
    }
    character.spellSlotsUsed = {};
    character.pactSlotsUsed = 0;
    // Slice 486: clear consumed once-per-long-rest free casts (Magic
    // Initiate, Warlock Contact Patron). Safe to overwrite as a fresh
    // empty array even when the participant never cast one this rest.
    character.usedFreeCastSpellIds = [];
    // Slice 794: clear the NPC "N/Day Each" per-spell cast counters
    // (Mage Fireball 2/Day, etc.) so the budget refreshes on a Long Rest.
    character.perDayCastsUsed = {};
    // Slice 835: ability-score drain (the Shadow's Draining Swipe) is
    // restored on a Long Rest — the 2024 default. Reset only when present so
    // an undrained participant stays byte-unchanged (abilityDrain absent).
    if (character.abilityDrain !== undefined) character.abilityDrain = {};
    // Slice 293. Reset per-long-rest item time budgets (Boots of
    // Speed's 10-min/LR cumulative activation pool). The field is
    // optional; only instances that have been activated since the
    // last LR carry a non-undefined `minutesUsed`. Resetting only
    // those preserves the "never been used" undefined state for
    // newly-acquired items.
    for (const instanceId of character.inventory) {
      const instance = state.itemInstances[instanceId];
      if (instance?.minutesUsed !== undefined) {
        instance.minutesUsed = 0;
      }
    }
  }
  clearLongRestCountersForCharacters(state, session.participantIds);
};
