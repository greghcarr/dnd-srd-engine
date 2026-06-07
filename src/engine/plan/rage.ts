import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent } from '../../schemas/events/combat.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const BARBARIAN_CLASS_ID = 'barbarian';
const RAGE_RESOURCE_ID = 'rage';
const RAGING_CONDITION_ID = 'raging';
// Path of the Berserker L6 Mindless Rage: immune to Charmed/Frightened
// while raging, and entering Rage ends those conditions if present.
const BERSERKER_SUBCLASS_ID = 'path-of-the-berserker';
const MINDLESS_RAGE_LEVEL = 6;
const MINDLESS_RAGE_CONDITION_ID = 'mindless-rage-active';
const MINDLESS_RAGE_ENDS: ReadonlyArray<string> = ['charmed', 'frightened'];

export interface RageIntent {
  readonly type: 'Rage';
  readonly barbarianId: string;
  readonly at?: string;
}

// Barbarian L1 Rage. RAW (SRD 5.2.1 Barbarian L1): "You can imbue
// yourself with a primal power called Rage, a force that grants you
// extraordinary might and resilience. You can enter it as a Bonus
// Action if you aren't wearing Heavy armor. You can enter your Rage
// the number of times shown for your Barbarian level in the Rages
// column of the Barbarian Features table. You regain one expended
// use when you finish a Short Rest, and you regain all expended
// uses when you finish a Long Rest."
//
// Validates Barbarian class membership + rage resource > 0 +
// not wearing Heavy armor. Gates BA only when invoked inside an
// active encounter on the Barbarian's turn (out-of-encounter use
// is allowed by RAW — pre-combat preparation). Emits
// `ActionEconomyConsumed(bonusAction)` + `ResourceSpent(rage, 1)` +
// `ConditionApplied(raging)`. The `raging` condition projects the
// while-active effects: B/P/S resistance, +2 damage on STR-based
// attacks (RAW L1-3 rate; consumer reapplies the higher-tier variant
// for L4+), advantage on STR ability checks + saves.
//
// Documented RAW deferrals (consumer-managed):
// - Duration: RAW "lasts until the end of your next turn"
//   (extendable by attacking, forcing a save, or BA up to 10 min).
//   The engine doesn't model the auto-extend logic; the consumer
//   removes the condition explicitly via ConditionRemoved (or it
//   clears on Long Rest via the condition's endsOn).
// - Auto-end on donning Heavy armor / Incapacitated: not enforced.
// - "No Concentration or Spells while raging": not enforced; would
//   need a concentration-block primitive on the condition.
// - Rage Damage scaling beyond L1's +2: the wired `raging` condition
//   carries the L1-3 value; a future slice can introduce per-tier
//   variants (raging-l4 +3, raging-l9 +4, raging-l16 +4) or scale
//   via formula.
export const planRage = (
  state: CampaignState,
  content: ResolvedContent,
  intent: RageIntent,
): ReadonlyArray<Event> => {
  const barbarian = state.characters[intent.barbarianId];
  if (!barbarian) throw new Error(`Unknown character ${intent.barbarianId}`);

  const barbClass = barbarian.classes.find((c) => c.classId === BARBARIAN_CLASS_ID);
  if (!barbClass) {
    throw new Error(`${barbarian.name} does not have Rage (Barbarian L1 feature)`);
  }

  const resource = barbarian.resources.find((r) => r.resourceId === RAGE_RESOURCE_ID);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${barbarian.name} has no Rages remaining (regain 1 on a Short Rest, all on a Long Rest)`,
    );
  }

  const equippedArmorId = barbarian.equipped.armor;
  if (equippedArmorId !== undefined) {
    const armorInstance = state.itemInstances[equippedArmorId];
    const armorDef = armorInstance !== undefined
      ? content.items.get(armorInstance.definitionId)
      : undefined;
    if (armorDef !== undefined && armorDef.itemKind === 'armor' && armorDef.category === 'heavy') {
      throw new Error(
        `${barbarian.name} cannot enter Rage while wearing Heavy armor (${armorDef.name})`,
      );
    }
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.barbarianId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${barbarian.name} has already used their bonus action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.barbarianId,
        kind: 'bonusAction',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.barbarianId as ULID,
    resourceId: RAGE_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.barbarianId as ULID,
    conditionId: RAGING_CONDITION_ID,
    appliedConditionId: newAppliedConditionId(),
  } satisfies ConditionAppliedEvent);

  // Mindless Rage (Path of the Berserker L6): while raging, immune to
  // Charmed/Frightened (the `mindless-rage-active` condition carries the
  // GrantConditionImmunity entries, same consumer-managed lifecycle as
  // `raging`), and entering Rage ends those conditions if already present.
  if (barbClass.subclassId === BERSERKER_SUBCLASS_ID && barbClass.level >= MINDLESS_RAGE_LEVEL) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: intent.barbarianId as ULID,
      conditionId: MINDLESS_RAGE_CONDITION_ID,
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent);
    for (const conditionId of MINDLESS_RAGE_ENDS) {
      if (barbarian.appliedConditions.some((c) => c.conditionId === conditionId)) {
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'ConditionRemoved',
          targetId: intent.barbarianId as ULID,
          conditionId,
        } satisfies ConditionRemovedEvent);
      }
    }
  }

  return events;
};
