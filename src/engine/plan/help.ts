import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { assertActorCanAct } from './_actor-state.js';
import type { ULID } from '../ids-utils.js';

const HELPED_AGAINST_CONDITION_ID = 'helped-against-active';
const HELPED_ON_CHECK_CONDITION_ID = 'helped-on-check-active';

export type HelpMode = 'attack' | 'check';

export interface HelpIntent {
  readonly type: 'Help';
  readonly helperId: string;
  readonly targetId: string;
  readonly mode: HelpMode;
  readonly at?: string;
}

// L1 RAW Help action (SRD 5.2.1, "Help" entry under PHB ch.7 Actions):
//
//   - **Help (Attack)**: "You momentarily distract a foe within 5 feet
//     of you. The next attack roll one of your allies makes against
//     that foe before the start of your next turn has Advantage on
//     the attack roll."
//   - **Help (Ability Check)**: "You momentarily help another creature
//     do something. When you do so, choose one of your skill
//     proficiencies, choose a creature that can see and hear you, and
//     choose an ability check the chosen creature is about to make
//     using the chosen skill. The creature has Advantage on that
//     ability check."
//
// The engine models the Help action as an Action-economy consumption
// plus the application of one of two paired conditions:
//   - mode 'attack' → apply `helped-against-active` to the foe; the
//     condition carries `GrantAdvantageToAttackers` +
//     `consumeOnIncomingAttack` (next incoming attack consumes it) +
//     `autoExpiry { afterRounds: 1, trigger: 'turnEnd' }` (RAW: "before
//     the start of your next turn").
//   - mode 'check' → apply `helped-on-check-active` to the ally;
//     the condition carries `SetAdvantage on { kind: 'check' }` with
//     autoExpiry afterRounds:1 turnEnd. RAW deviation: the engine does
//     NOT enforce "consumed on first check" (no `consumeOnCheck`
//     primitive yet); the bearer carries advantage on ANY check until
//     expiry. Acceptable for L1 simulation purposes; a future slice
//     can add `consumeOnCheck` parity with `consumeOnAttack`.
//   - Skill-of-proficiency gate (RAW: helper must be proficient in
//     the chosen skill) is consumer-managed — the planner doesn't
//     validate which skill the help applies to.
//   - 5-foot proximity gate (Attack mode) is consumer-managed — the
//     engine doesn't track positions.
//
// Both modes:
//   - The helper's class doesn't matter (Help is a universal action).
//   - Action economy: consumes Action when invoked in an active
//     encounter on the helper's turn. Out-of-encounter use (e.g. a
//     downtime skill check) bypasses the action gate.
//   - The helper can't be Incapacitated / Stunned / Paralyzed / etc.
//     (assertActorCanAct).
export const planHelp = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: HelpIntent,
): ReadonlyArray<Event> => {
  const helper = state.characters[intent.helperId];
  if (!helper) throw new Error(`Unknown helper ${intent.helperId}`);
  assertActorCanAct(helper, 'Help');

  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown Help target ${intent.targetId}`);

  if (intent.helperId === intent.targetId) {
    throw new Error(`${helper.name} cannot Help themself`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.helperId) {
      if (active.turnUsage.actionUsed) {
        throw new Error(`${helper.name} has already used their action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.helperId,
        kind: 'action',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  const conditionId = intent.mode === 'attack'
    ? HELPED_AGAINST_CONDITION_ID
    : HELPED_ON_CHECK_CONDITION_ID;

  // For the autoExpiry "before the start of your next turn" RAW: stamp
  // expiresOnRound off the current encounter round when in combat.
  // Out-of-encounter applies don't need the expiry; the auto-clear
  // never fires until a turn-tick happens.
  const currentRound = activeEncounterId !== undefined
    ? state.encounters[activeEncounterId]?.round
    : undefined;
  const expiryFields = currentRound !== undefined
    ? { expiresOnRound: currentRound + 1, expiryTrigger: 'turnEnd' as const }
    : {};

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.targetId as ULID,
    conditionId,
    appliedConditionId: newAppliedConditionId(),
    sourceCharacterId: intent.helperId as ULID,
    ...expiryFields,
  } satisfies ConditionAppliedEvent);

  return events;
};
