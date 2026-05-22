import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const BERSERKER_SUBCLASS_ID = 'path-of-the-berserker';
const INTIMIDATING_PRESENCE_LEVEL = 14;
const INTIMIDATING_PRESENCE_DC_BASE = 8;
const FRIGHTENED_CONDITION_ID = 'frightened';

export interface IntimidatingPresenceIntent {
  readonly type: 'IntimidatingPresence';
  readonly barbarianId: string;
  // The creatures of the barbarian's choice within the 30-ft emanation.
  // The engine doesn't model positions, so the consumer supplies the
  // in-range targets (RAW: "each creature of your choice in a 30-foot
  // Emanation").
  readonly targetIds: ReadonlyArray<string>;
  readonly at?: string;
}

// Path of the Berserker L14 Intimidating Presence. As a Bonus Action,
// each chosen creature makes a Wisdom save (DC 8 + STR mod + Proficiency
// Bonus); on a failure it has the Frightened condition. Reuses the
// shared `rollSaveAgainstDC` helper (full save derivation: advantage,
// Bless/Bane bonus dice, Magic Resistance, etc.) and the bare
// `frightened` condition.
//
// The RAW "at the end of each of the Frightened creature's turns it
// repeats the save" arm IS modeled (slice 389): the Frightened condition
// is stamped with the per-instance fixed-DC recurring save (slice 388),
// so `tickRecurringSave` re-rolls the WIS save against this feature DC and
// lifts the fear on a success. Still deferred / consumer-managed: the
// 1-minute duration and the once-per-Long-Rest use (restorable by
// spending a Rage); the Bonus Action economy still limits this to once
// per turn.
export const planIntimidatingPresence = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: IntimidatingPresenceIntent,
): ReadonlyArray<Event> => {
  const barbarian = state.characters[intent.barbarianId];
  if (!barbarian) throw new Error(`Unknown barbarian ${intent.barbarianId}`);
  const enrollment = barbarian.classes.find((c) => c.classId === 'barbarian');
  if (
    enrollment === undefined ||
    enrollment.level < INTIMIDATING_PRESENCE_LEVEL ||
    enrollment.subclassId !== BERSERKER_SUBCLASS_ID
  ) {
    throw new Error(
      `${barbarian.name} does not have Intimidating Presence (requires Path of the Berserker, Barbarian level ${INTIMIDATING_PRESENCE_LEVEL})`,
    );
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Intimidating Presence can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.barbarianId) {
    throw new Error(`${barbarian.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${barbarian.name} has already used their bonus action this turn`);
  }

  const at = intent.at ?? nowIso();
  const dc =
    INTIMIDATING_PRESENCE_DC_BASE +
    abilityModifier(barbarian.abilityScores.STR) +
    proficiencyBonus(computeTotalLevel(barbarian));

  const events: Event[] = [
    {
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: activeEncounterId,
      combatantId: intent.barbarianId,
      kind: 'bonusAction',
    } satisfies ActionEconomyConsumedEvent,
  ];

  for (const targetId of intent.targetIds) {
    const result = rollSaveAgainstDC({
      state,
      content,
      targetId,
      ability: 'WIS',
      dc,
      sourceIsMagical: false,
      rng,
      at,
      savePreventsCondition: FRIGHTENED_CONDITION_ID,
    });
    if (result === undefined) continue;
    events.push(result.event);
    if (!result.success) {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: targetId as ULID,
        conditionId: FRIGHTENED_CONDITION_ID,
        appliedConditionId: newAppliedConditionId(),
        sourceCharacterId: intent.barbarianId as ULID,
        causedByEventId: result.event.id,
        // RAW: "At the end of each of its turns, the creature repeats the
        // save, ending the effect on a success." Baked as a per-instance
        // fixed-DC recurring WIS save (slice 388 primitive) against the
        // same feature DC; the consumer ticks it via `tickRecurringSave`.
        recurringSaveDC: dc,
        recurringSaveAbility: 'WIS',
      } satisfies ConditionAppliedEvent);
    }
  }

  return events;
};
