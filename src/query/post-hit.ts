// Slice 774: post-hit affordances — options contextual on an attack the actor
// just landed, rather than on the turn-menu state.
//
// Paladin's Smite is the canonical (and, through L7, only) case: RAW 2024 "When
// you hit a creature with a melee weapon or an Unarmed Strike, you can use a
// Bonus Action to expend a Paladin spell slot to deal Radiant damage." It is
// discoverable from neither existing surface:
//   - `bonusActions` is a turn-menu and has no triggering attack in scope, so it
//     can't know which hit a smite would ride (and the slot-level picker depends
//     on the hit);
//   - `castableSpells` surfaces the separate `divine-smite` SPELL (a 2024 Bonus
//     Action spell), not this L2 class FEATURE.
//
// So this is its own seam, mirroring `reactionsForTrigger`: given the triggering
// AttackRolled, `postHitOptions` enumerates the post-hit options whose owner +
// trigger match, each carrying the metadata the consumer needs to finish the
// intent (the Paladin spell-slot levels available to fuel it). `postHitIntent`
// then builds the ready-to-commit `PaladinsSmiteIntent` from the chosen slot.
//
// Execution: the consumer runs the built intent through `engine.plan.paladinsSmite`
// directly. Unlike the bonus-action / general-action families, Paladin's Smite is
// NOT in the `planIntent` dispatch (it's consumer-orchestrated post-hit, in
// EXCLUDED_FROM_DISPATCH), so there's no `useOption`-style executor — the consumer
// invokes the planner method with the intent (minus its `type` tag).
//
// The owner + trigger gate is RAW-correct and deliberately STRICTER than the
// lenient `planPaladinsSmite` (which checks only paladin-exists + slot-available
// + slotLevel 1-5): a smite is offered only to the Paladin who landed a MELEE hit
// on this target, on their own turn with their Bonus Action free. The affordance
// must never surface a RAW-illegal smite (after a ranged hit, off-turn via an
// Opportunity Attack — no Bonus Action exists then — or by a non-paladin).
// Everything it offers (`enabled`), the planner accepts.

import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import type { Character } from '../schemas/runtime/character.js';
import type { AttackRolledEvent } from '../schemas/events/attack.js';
import type { PaladinsSmiteIntent } from '../engine/plan/paladins-smite.js';
import { findActorBlockingCondition } from '../engine/plan/_actor-state.js';
import { computeAvailableSpellSlots } from '../derive/spell-slots.js';

// ── Named constants ─────────────────────────────────────────────────
const PALADIN_CLASS_ID = 'paladin';
const PALADINS_SMITE_OPTION_ID = 'paladins-smite';
const PALADINS_SMITE_LABEL = "Paladin's Smite";
// Paladin's Smite expends a Paladin spell slot of level 1-5 (the Paladin's top
// spell level); planPaladinsSmite throws outside that range.
const MAX_PALADIN_SLOT_LEVEL = 5;

// Machine-readable disabled reasons (mirrors the bonus-actions style).
const REASON_NOT_YOUR_TURN = 'not-your-turn';
const REASON_BONUS_ACTION_USED = 'bonus-action-used';
const REASON_NO_USES = 'no-uses';

// ── Public types ────────────────────────────────────────────────────
export interface PostHitOption {
  /** Stable id — pass back to `postHitIntent(optionId, ...)`. */
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  /**
   * Machine-readable reason when `enabled` is false: a blocking-condition id
   * ('incapacitated', 'stunned', ...), 'not-your-turn' (the smite rides a Bonus
   * Action, so it's usable only on the paladin's own turn — never off an
   * Opportunity Attack), 'bonus-action-used', or 'no-uses' (no spell slot).
   */
  readonly reason?: string;
  /**
   * The Paladin spell-slot levels (1-5, ascending) available to fuel the smite.
   * The consumer offers a level picker over these; passing one to `postHitIntent`
   * sets the smite's damage (2d8 + 1d8 per level above 1st). Empty when no slot
   * remains (then `enabled` is false with reason 'no-uses').
   */
  readonly slotLevels: ReadonlyArray<number>;
}

/** The intent `postHitIntent` produces — consumer runs it via `engine.plan.paladinsSmite`. */
export type PostHitIntent = PaladinsSmiteIntent;

/** Per-option parameters for `postHitIntent`. */
export interface PostHitParams {
  /** The Paladin spell-slot level to expend (one of the option's `slotLevels`). */
  readonly slotLevel: number;
  /**
   * RAW +1d8 radiant when the target is an Undead or a Fiend. The engine doesn't
   * model those creature types, so the consumer determines it; omitted = no bonus.
   */
  readonly targetIsUndeadOrFiend?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────
const isPaladin = (character: Character): boolean =>
  character.classes.some((c) => c.classId === PALADIN_CLASS_ID);

// The Paladin spell-slot levels (1..MAX) the paladin can still expend, ascending.
const availableSmiteSlotLevels = (
  character: Character,
  content: ResolvedContent,
): ReadonlyArray<number> => {
  const { standardByLevel } = computeAvailableSpellSlots(character, content.classes);
  const levels: number[] = [];
  for (let level = 1; level <= MAX_PALADIN_SLOT_LEVEL; level += 1) {
    if ((standardByLevel[level - 1] ?? 0) > 0) levels.push(level);
  }
  return levels;
};

// ── postHitOptions (enumeration) ────────────────────────────────────
//
// Given the just-committed AttackRolled, the post-hit options the attacker can
// take. Returns [] unless the attack is a MELEE hit by a paladin (the only
// post-hit feature through L7) — an empty array means "no post-hit prompt." When
// it does apply, the single option carries the spell-slot picker; `enabled` /
// `reason` reflect the Bonus Action economy (a smite costs the paladin's Bonus
// Action on their own turn, so it's gated like one) and slot availability.
export const postHitOptions = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  attackEvent: AttackRolledEvent,
): ReadonlyArray<PostHitOption> => {
  if (attackEvent.hit !== true || attackEvent.attackKind !== 'melee') return [];
  const attackerId = attackEvent.attackerId;
  const character = state.characters[attackerId];
  if (character === undefined || !isPaladin(character)) return [];

  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === attackerId);
  if (encounter === undefined || self === undefined) return [];

  const slotLevels = availableSmiteSlotLevels(character, content);
  const reason = ((): string | undefined => {
    const blocker = findActorBlockingCondition(character);
    if (blocker !== undefined) return blocker;
    const isActiveTurn =
      encounter.status === 'active' && encounter.combatants[encounter.activeIndex]?.combatantId === attackerId;
    if (!isActiveTurn) return REASON_NOT_YOUR_TURN;
    if (self.turnUsage.bonusActionUsed) return REASON_BONUS_ACTION_USED;
    if (slotLevels.length === 0) return REASON_NO_USES;
    return undefined;
  })();

  return [
    {
      id: PALADINS_SMITE_OPTION_ID,
      label: PALADINS_SMITE_LABEL,
      enabled: reason === undefined,
      ...(reason !== undefined ? { reason } : {}),
      slotLevels,
    },
  ];
};

// ── postHitIntent (dispatch builder) ────────────────────────────────
//
// Maps an option id (+ the chosen slot) to its planner intent, with the
// paladin / target / triggering-attack ids read from the event. Throws on an
// unknown id — the same fail-fast contract the other affordance builders honor.
// The consumer runs the result through `engine.plan.paladinsSmite` (dropping
// the `type` tag, which that method re-adds).
export const postHitIntent = (
  optionId: string,
  attackEvent: AttackRolledEvent,
  params: PostHitParams,
): PostHitIntent => {
  if (optionId !== PALADINS_SMITE_OPTION_ID) throw new Error(`Unknown post-hit option: ${optionId}`);
  return {
    type: 'PaladinsSmite',
    paladinId: attackEvent.attackerId,
    targetId: attackEvent.targetId,
    slotLevel: params.slotLevel,
    triggeringAttackEventId: attackEvent.id,
    ...(params.targetIsUndeadOrFiend !== undefined ? { targetIsUndeadOrFiend: params.targetIsUndeadOrFiend } : {}),
  };
};
