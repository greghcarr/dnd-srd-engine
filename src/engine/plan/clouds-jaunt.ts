import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { CombatantMovedEvent } from '../../schemas/events/movement.js';
import type { Position } from '../../schemas/runtime/encounter.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { chebyshevDistance } from './movement.js';
import { findGoliathAncestryChoice, GIANT_ANCESTRY_RESOURCE_ID, GOLIATH_SPECIES_ID } from './_giant-ancestry.js';
import type { ULID } from '../ids-utils.js';

const CLOUDS_JAUNT_RANGE_FEET = 30;
const CLOUDS_JAUNT_OPTION_ID = 'clouds-jaunt';

export interface CloudsJauntIntent {
  readonly type: 'CloudsJaunt';
  readonly goliathId: string;
  readonly to: Position;
  readonly at?: string;
}

// Goliath Giant Ancestry → Cloud's Jaunt (Cloud Giant).
//
// RAW (SRD 5.2.1 Goliath): "As a Bonus Action, you magically teleport
// up to 30 feet to an unoccupied space you can see."
//
// Validates Goliath species + resolved Cloud's Jaunt ancestry choice
// + `giant-ancestry` resource > 0 + active combatant on their own
// turn + Bonus Action available + destination ≤ 30 ft + unoccupied.
// Emits ActionEconomyConsumed(bonusAction) + ResourceSpent
// (giant-ancestry, 1) + CombatantMoved (teleport — feetTraveled
// stays 0 so it doesn't drain normal movement).
//
// Documented RAW deviations (consumer-managed):
// - **"You can see it"**: the engine doesn't model line-of-sight to
//   the destination cell. Consumer (UI / VTT) gates positionally.
// - **Range as Chebyshev**: 30 ft is checked via chebyshevDistance
//   (matches planMistyStep's approach), so diagonal moves cost the
//   same as orthogonal — RAW-compliant by the 5e square-grid model.
export const planCloudsJaunt = (
  state: CampaignState,
  content: ResolvedContent,
  intent: CloudsJauntIntent,
): ReadonlyArray<Event> => {
  const goliath = state.characters[intent.goliathId];
  if (!goliath) throw new Error(`Unknown character ${intent.goliathId}`);
  if (goliath.speciesId !== GOLIATH_SPECIES_ID) {
    throw new Error(`${goliath.name} is not a Goliath (Cloud's Jaunt is a Goliath Giant Ancestry option)`);
  }

  const ancestry = findGoliathAncestryChoice(goliath, state);
  if (ancestry !== CLOUDS_JAUNT_OPTION_ID) {
    throw new Error(
      `${goliath.name} did not choose Cloud's Jaunt as their Giant Ancestry (current: ${ancestry ?? 'unresolved'})`,
    );
  }

  const resource = goliath.resources.find((r) => r.resourceId === GIANT_ANCESTRY_RESOURCE_ID);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${goliath.name} has no Giant Ancestry uses remaining (regain all on a Long Rest)`,
    );
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error("Cloud's Jaunt can only be used in an active encounter");
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.goliathId) {
    throw new Error(`${goliath.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${goliath.name} has already used their bonus action this turn`);
  }
  if (active.position === undefined) {
    throw new Error('Combatant has no position set');
  }

  const distance = chebyshevDistance(active.position, intent.to);
  if (distance > CLOUDS_JAUNT_RANGE_FEET) {
    throw new Error(`Cloud's Jaunt destination is ${distance}ft away (max ${CLOUDS_JAUNT_RANGE_FEET}ft)`);
  }
  const blocker = encounter?.combatants.find(
    (c) => c.combatantId !== intent.goliathId
      && c.position !== undefined
      && c.position.x === intent.to.x
      && c.position.y === intent.to.y,
  );
  if (blocker !== undefined) {
    const occupier = state.characters[blocker.combatantId];
    throw new Error(
      `Cloud's Jaunt destination (${intent.to.x},${intent.to.y}) is occupied by ${occupier?.name ?? blocker.combatantId}`,
    );
  }

  const at = intent.at ?? nowIso();
  return [
    {
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: activeEncounterId,
      combatantId: intent.goliathId,
      kind: 'bonusAction',
    } satisfies ActionEconomyConsumedEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.goliathId as ULID,
      resourceId: GIANT_ANCESTRY_RESOURCE_ID,
      amount: 1,
    } satisfies ResourceSpentEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'CombatantMoved',
      encounterId: activeEncounterId,
      combatantId: intent.goliathId as ULID,
      fromPosition: { ...active.position },
      toPosition: { ...intent.to },
      feetTraveled: 0,
    } satisfies CombatantMovedEvent,
  ];
};
