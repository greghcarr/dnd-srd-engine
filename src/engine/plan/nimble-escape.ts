import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { DisengagedEvent } from '../../schemas/events/movement.js';
import type { AbilityCheckRolledEvent } from '../../schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import { computeAbilityCheck } from '../../derive/ability-check.js';
import type { ULID } from '../ids-utils.js';

// Monsters whose 2024 SRD statblock carries the Nimble Escape Bonus
// Action. Hardcoded by statblockId for the same reason planAdrenaline
// Rush hardcodes 'orc': the Custom marker on the monster's traits is
// the discoverable signal, but planners gate on a direct id check to
// avoid the overhead of trait introspection. Add an id here when a new
// monster gets Nimble Escape in SRD.
const NIMBLE_ESCAPE_STATBLOCKS: ReadonlySet<string> = new Set([
  'goblin-warrior',
  'goblin-minion',
  'goblin-boss',
]);

const HIDE_DEFAULT_DC = 15;

export type NimbleEscapeMode = 'disengage' | 'hide';

export interface NimbleEscapeIntent {
  readonly type: 'NimbleEscape';
  readonly goblinId: string;
  // 'disengage' takes the Disengage action; 'hide' rolls a Stealth
  // check vs `dc` (default 15) and on success applies the `invisible`
  // condition. Both consume the goblin's Bonus Action.
  readonly mode: NimbleEscapeMode;
  // Stealth DC for the hide path. Default 15 mirrors planHide.
  readonly dc?: number;
  readonly at?: string;
}

// Goblin Warrior / Minion / Boss species trait (PHB 2024, SRD 5.2.1):
// "Nimble Escape. The goblin takes the Disengage or Hide action [as a
// Bonus Action]." At-will (no per-rest cap). Requires the goblin to be
// the active combatant in an active encounter (mirrors planDisengage /
// planStepOfTheWind). Emits ActionEconomyConsumed(bonusAction) + either
// a Disengaged event (mode 'disengage') or AbilityCheckRolled +
// optional ConditionApplied(invisible) (mode 'hide').
export const planNimbleEscape = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: NimbleEscapeIntent,
): ReadonlyArray<Event> => {
  const goblin = state.characters[intent.goblinId];
  if (!goblin) throw new Error(`Unknown character ${intent.goblinId}`);
  if (goblin.statblockId === undefined || !NIMBLE_ESCAPE_STATBLOCKS.has(goblin.statblockId)) {
    throw new Error(`${goblin.name} does not have Nimble Escape (Goblin statblocks only)`);
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Nimble Escape can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.goblinId) {
    throw new Error(`${goblin.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${goblin.name} has already used their bonus action this turn`);
  }
  if (intent.mode === 'disengage' && active.turnUsage.disengaged) {
    throw new Error(`${goblin.name} has already disengaged this turn`);
  }

  const at = intent.at ?? nowIso();
  const bonusConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: activeEncounterId,
    combatantId: intent.goblinId,
    kind: 'bonusAction',
  };

  if (intent.mode === 'disengage') {
    const disengaged: DisengagedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'Disengaged',
      encounterId: activeEncounterId,
      combatantId: intent.goblinId as ULID,
    };
    return [bonusConsumed, disengaged];
  }

  // mode === 'hide': mirrors planHide's body but consumes a bonus
  // action instead of an action.
  const dc = intent.dc ?? HIDE_DEFAULT_DC;
  const derivation = computeAbilityCheck({
    character: goblin,
    itemInstances: state.itemInstances,
    content,
    ability: 'DEX',
    skill: 'stealth',
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const d20 = rollDie(D20_SIDES, rng);
  const total = d20 + derivation.total;
  const success = total >= dc;
  const events: Event[] = [
    bonusConsumed,
    {
      id: newEventId() as ULID,
      at,
      type: 'AbilityCheckRolled',
      characterId: intent.goblinId,
      ability: 'DEX',
      skill: 'stealth',
      dc,
      success,
      d20: [d20],
      used: 'none',
      bonus: derivation.total,
      total,
    } satisfies AbilityCheckRolledEvent,
  ];
  if (success) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: intent.goblinId,
      conditionId: 'invisible',
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent);
  }
  return events;
};
