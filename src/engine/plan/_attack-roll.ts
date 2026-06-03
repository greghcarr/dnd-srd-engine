// Slice 611: shared attack-roll core.
//
// Pre-slice the d20 + advantage + Halfling Luck + bonus-dice (Bless /
// Bane) + crit-threshold logic lived TWICE — in plan/attack.ts (weapon
// attacks, slice 538+) and again in plan/cast-spell.ts (spell attacks,
// slice 602's narrow target-side-advantage fix). The spell-attack
// version skipped Halfling Luck + Bless + extended crit range entirely,
// making spell attacks a half-implementation of RAW attack-roll
// semantics.
//
// This helper centralizes everything from "we know the final advantage
// state" onward. Callers compute their kind-specific advantage state +
// attacker bonus + target AC + facts, then route through this helper.
// Both weapon and spell attacks now go through the same dice + Halfling
// Luck + bonus-dice + crit-threshold path.
//
// RNG consumption (matches pre-slice attack.ts behavior):
//   - 1 d20 if advantage='none'; 2 if 'advantage' or 'disadvantage'.
//   - +1 d20 if usedRoll is 1 AND attacker has Halfling Luck.
//   - +K dice if attacker carries any AddBonusDie contributions
//     (Bless/Bane) for 'attack' that pass the facts gate. Unblessed
//     attacks consume no extra RNG, so their stream is unchanged.

import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckFromFlag } from './_halfling-luck.js';
import { rollBonusDice, type RolledBonusDice } from './_bonus-dice.js';
import type { BonusDieContribution } from '../../effects/builder.js';
import { D20_SIDES, NAT_1, NAT_20 } from '../../internal/constants.js';

export interface ResolveAttackRollInput {
  /** Pre-resolved advantage state. Callers compute this from attacker+target effects. */
  readonly advantage: 'none' | 'advantage' | 'disadvantage';
  /** Sum of attack-side modifiers (ability mod + prof + magic + per-type AddModifier contributions). Excludes bonus dice. */
  readonly attackBonus: number;
  /** Target's effective AC for this attack. */
  readonly targetAC: number;
  /** True if the attacker carries the Halfling Luck marker; the helper rerolls a nat-1 once. */
  readonly attackerHasHalflingLuck: boolean;
  /** Bless/Bane-style per-roll bonus dice contributions the attacker carries for `target: 'attack'`. Empty for the common case (no Bless). */
  readonly bonusDiceContributions: ReadonlyArray<BonusDieContribution>;
  /** Crit threshold — nat 20 by default; some features (Improved Critical, Superior Critical) lower it. Hit-required for a crit. */
  readonly critThreshold: number;
  /** Optional: if true AND the attack hits, the result is a critical regardless of the d20 value. Used for RAW "Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature" against Paralyzed / Unconscious / HP-0 targets in melee. Both weapon AND melee spell attacks honor this RAW rule. */
  readonly forceCritIfHit?: boolean;
  readonly rng: RNG;
}

export interface ResolveAttackRollOutput {
  /** The d20(s) rolled. 1 element for 'none' advantage, 2 for advantage/disadvantage, +1 if Halfling Luck rerolled. */
  readonly rolls: number[];
  /** The post-advantage, post-Halfling-Luck d20 value used to compute hit/miss/crit. */
  readonly usedRoll: number;
  /** Bonus-die roll detail (Bless/Bane); zero-total when no contributions. */
  readonly bonusDice: RolledBonusDice;
  /** attackBonus + bonusDice.total. The `total` field below is usedRoll + effectiveAttackBonus. */
  readonly effectiveAttackBonus: number;
  /** The full d20 + bonus result. */
  readonly total: number;
  readonly naturalHit: boolean;
  readonly naturalMiss: boolean;
  readonly hit: boolean;
  readonly critical: boolean;
}

export const resolveAttackRoll = (input: ResolveAttackRollInput): ResolveAttackRollOutput => {
  const {
    advantage,
    attackBonus,
    targetAC,
    attackerHasHalflingLuck,
    bonusDiceContributions,
    critThreshold,
    rng,
  } = input;

  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  if (advantage !== 'none') {
    rolls.push(rollDie(D20_SIDES, rng));
  }
  let usedRoll =
    advantage === 'advantage'
      ? Math.max(...rolls)
      : advantage === 'disadvantage'
        ? Math.min(...rolls)
        : rolls[0]!;
  // Slice 538-shape Halfling Luck: nat-1 reroll, once.
  usedRoll = applyHalflingLuckFromFlag(usedRoll, attackerHasHalflingLuck, rolls, rng);

  // Slice 330-shape per-roll bonus dice (Bless +1d4 / Bane -1d4 via
  // AddBonusDie). Rolled here, after the d20(s), and folded into the
  // attack bonus so `total === usedRoll + effectiveAttackBonus`.
  const bonusDice = rollBonusDice(bonusDiceContributions, rng);
  const effectiveAttackBonus = attackBonus + bonusDice.total;
  const total = usedRoll + effectiveAttackBonus;

  const naturalHit = usedRoll === NAT_20;
  const naturalMiss = usedRoll === NAT_1;
  const hit = !naturalMiss && (naturalHit || total >= targetAC);
  // Crit only on a hit. Extended crit ranges (Improved Critical 19+,
  // Superior Critical 18+, etc.) lower the threshold via the attacker's
  // ExpandCritRange. A 19 that misses AC is still a miss, not a crit.
  // The `forceCritIfHit` flag covers the RAW Paralyzed/Unconscious melee
  // auto-crit rule.
  const critical = hit && (usedRoll >= critThreshold || input.forceCritIfHit === true);

  return {
    rolls,
    usedRoll,
    bonusDice,
    effectiveAttackBonus,
    total,
    naturalHit,
    naturalMiss,
    hit,
    critical,
  };
};
