import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { DashedEvent, DisengagedEvent } from '../../schemas/events/movement.js';
import type { AbilityCheckRolledEvent } from '../../schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckForCharacter } from './_halfling-luck.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import { computeAbilityCheck } from '../../derive/ability-check.js';
import type { ULID } from '../ids-utils.js';

// Monsters whose 2024 SRD statblock carries Cunning Action.
// Hardcoded by statblockId, mirroring planNimbleEscape's allowlist.
// Add an id here when a new monster gets Cunning Action in SRD.
const CUNNING_ACTION_STATBLOCKS: ReadonlySet<string> = new Set([
  'spy',
]);

// Class-level eligibility: Rogue L2+ characters carry Cunning Action
// via the L2 feature. The pack ships the feature as a Custom marker
// (effects: [{ kind: 'Custom', handlerId: 'cunning-action' }]); the
// mechanic is keyed off the class enrollment + level here, matching
// the slice-303 pack-integrity convention for class-driven planners.
const CUNNING_ACTION_CLASS_ID = 'rogue';
const CUNNING_ACTION_MIN_CLASS_LEVEL = 2;

const HIDE_DEFAULT_DC = 15;

const characterHasCunningAction = (
  character: { classes: ReadonlyArray<{ classId: string; level: number }>; statblockId?: string },
): boolean => {
  if (character.statblockId !== undefined && CUNNING_ACTION_STATBLOCKS.has(character.statblockId)) {
    return true;
  }
  return character.classes.some(
    (c) => c.classId === CUNNING_ACTION_CLASS_ID && c.level >= CUNNING_ACTION_MIN_CLASS_LEVEL,
  );
};

export type CunningActionMode = 'dash' | 'disengage' | 'hide';

export interface CunningActionIntent {
  readonly type: 'CunningAction';
  readonly actorId: string;
  // 'dash' takes the Dash action; 'disengage' takes Disengage; 'hide'
  // rolls a Stealth check vs `dc` (default 15) and on success applies
  // the `invisible` condition. All three consume the actor's Bonus Action.
  readonly mode: CunningActionMode;
  // Stealth DC for the hide path. Default 15 mirrors planHide and
  // planNimbleEscape.
  readonly dc?: number;
  readonly at?: string;
}

// Rogue L2 Cunning Action + Spy Cunning Action (any monster that
// carries it in the CUNNING_ACTION_STATBLOCKS allowlist). RAW
// (SRD 5.2.1 Rogue L2): "You can take the Dash, Disengage, or Hide
// action as a Bonus Action." RAW (SRD 5.2.1 Spy, CR 1): "Cunning
// Action. The spy takes the Dash, Disengage, or Hide action."
// At-will (no per-rest cap). Requires the actor to be the active
// combatant in an active encounter (mirrors planDisengage /
// planNimbleEscape). Emits ActionEconomyConsumed(bonusAction) plus
// the mode-specific event (Dashed / Disengaged / AbilityCheckRolled
// + optional ConditionApplied(invisible) on a successful Hide).
export const planCunningAction = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CunningActionIntent,
): ReadonlyArray<Event> => {
  const actor = state.characters[intent.actorId];
  if (!actor) throw new Error(`Unknown character ${intent.actorId}`);
  if (!characterHasCunningAction(actor)) {
    throw new Error(`${actor.name} does not have Cunning Action (requires Rogue L2+ or a statblock that carries it)`);
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Cunning Action can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.actorId) {
    throw new Error(`${actor.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${actor.name} has already used their bonus action this turn`);
  }
  if (intent.mode === 'dash' && active.turnUsage.dashed) {
    throw new Error(`${actor.name} has already dashed this turn`);
  }
  if (intent.mode === 'disengage' && active.turnUsage.disengaged) {
    throw new Error(`${actor.name} has already disengaged this turn`);
  }

  const at = intent.at ?? nowIso();
  const bonusConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: activeEncounterId,
    combatantId: intent.actorId,
    kind: 'bonusAction',
  };

  if (intent.mode === 'dash') {
    const dashed: DashedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'Dashed',
      encounterId: activeEncounterId,
      combatantId: intent.actorId as ULID,
    };
    return [bonusConsumed, dashed];
  }

  if (intent.mode === 'disengage') {
    const disengaged: DisengagedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'Disengaged',
      encounterId: activeEncounterId,
      combatantId: intent.actorId as ULID,
    };
    return [bonusConsumed, disengaged];
  }

  // mode === 'hide'
  const dc = intent.dc ?? HIDE_DEFAULT_DC;
  const derivation = computeAbilityCheck({
    character: actor,
    itemInstances: state.itemInstances,
    content,
    ability: 'DEX',
    skill: 'stealth',
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on Cunning Action Hide check.
  const d20 = applyHalflingLuckForCharacter(rolls[0]!, intent.actorId, state, content, rolls, rng);
  const total = d20 + derivation.total;
  const success = total >= dc;
  const events: Event[] = [
    bonusConsumed,
    {
      id: newEventId() as ULID,
      at,
      type: 'AbilityCheckRolled',
      characterId: intent.actorId,
      ability: 'DEX',
      skill: 'stealth',
      dc,
      success,
      d20: rolls,
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
      targetId: intent.actorId,
      conditionId: 'invisible',
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent);
  }
  return events;
};
