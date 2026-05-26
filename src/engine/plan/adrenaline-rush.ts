import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { DashedEvent } from '../../schemas/events/movement.js';
import type { TempHPGrantedEvent } from '../../schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { proficiencyBonus } from '../../derive/ability.js';
import type { ULID } from '../ids-utils.js';

const ORC_SPECIES_ID = 'orc';
const ADRENALINE_RUSH_RESOURCE = 'adrenaline-rush';

export interface AdrenalineRushIntent {
  readonly type: 'AdrenalineRush';
  readonly orcId: string;
  readonly at?: string;
}

// Orc species trait (PHB 2024, SRD 5.2.1): "You can take the Dash
// action as a Bonus Action. When you do so, you gain a number of
// Temporary Hit Points equal to your Proficiency Bonus. You can use
// this trait a number of times equal to your Proficiency Bonus, and
// you regain all expended uses when you finish a Short or Long Rest."
//
// Resource-gated (PB uses per short/long rest); slice 458 corrected
// the at-will modeling slice 453 introduced. The orc species traits
// also carry a matching `GrantResource { resourceId:
// 'adrenaline-rush', max: profBonus, recharge: 'shortRest' }` so the
// pool refunds on rest. The Dash itself is positional, so this still
// requires the orc to be the active combatant in an active encounter
// (mirrors planDash / planStepOfTheWind). Emits ActionEconomyConsumed
// (bonusAction), ResourceSpent (1 of adrenaline-rush), Dashed, and
// TempHPGranted (= PB).
export const planAdrenalineRush = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: AdrenalineRushIntent,
): ReadonlyArray<Event> => {
  const orc = state.characters[intent.orcId];
  if (!orc) throw new Error(`Unknown character ${intent.orcId}`);
  if (orc.speciesId !== ORC_SPECIES_ID) {
    throw new Error(`${orc.name} does not have Adrenaline Rush (Orc species only)`);
  }

  const resource = orc.resources.find((r) => r.resourceId === ADRENALINE_RUSH_RESOURCE);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${orc.name} has no Adrenaline Rush uses remaining (regain on a Short or Long Rest)`,
    );
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Adrenaline Rush can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.orcId) {
    throw new Error(`${orc.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${orc.name} has already used their bonus action this turn`);
  }
  if (active.turnUsage.dashed) {
    throw new Error(`${orc.name} has already dashed this turn`);
  }

  const at = intent.at ?? nowIso();
  const totalLevel = computeTotalLevel(orc);
  const pb = proficiencyBonus(totalLevel);

  return [
    {
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: activeEncounterId,
      combatantId: intent.orcId,
      kind: 'bonusAction',
    } satisfies ActionEconomyConsumedEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.orcId as ULID,
      resourceId: ADRENALINE_RUSH_RESOURCE,
      amount: 1,
    } satisfies ResourceSpentEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'Dashed',
      encounterId: activeEncounterId,
      combatantId: intent.orcId as ULID,
    } satisfies DashedEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'TempHPGranted',
      targetId: intent.orcId as ULID,
      amount: pb,
    } satisfies TempHPGrantedEvent,
  ];
};
