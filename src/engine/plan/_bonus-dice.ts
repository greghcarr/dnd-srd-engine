import type { RNG } from '../../rng/index.js';
import { rollDie, parseDiceExpression } from '../../rng/dice.js';
import type { BonusDieContribution } from '../../effects/builder.js';
import type { RollBreakdownEntry } from '../../schemas/events/checks.js';

// One rolled bonus-die contribution, baked into the emitting roll event
// so apply()/replay never re-rolls. `total` is the signed contribution
// (negative when `subtract`).
export interface BonusDieRoll {
  readonly dice: string;
  readonly rolls: ReadonlyArray<number>;
  readonly subtract: boolean;
  readonly source: string;
  readonly total: number;
}

export interface RolledBonusDice {
  readonly total: number;
  readonly rolls: ReadonlyArray<BonusDieRoll>;
}

// Rolls each AddBonusDie contribution fresh (Bless/Bane's per-roll 1d4).
// Lives in the planner layer because it consumes RNG. Returns the signed
// total to fold into the roll plus per-die detail for the event. When
// `entries` is empty (the common case) no RNG is consumed.
export const rollBonusDice = (
  entries: ReadonlyArray<BonusDieContribution>,
  rng: RNG,
): RolledBonusDice => {
  const rolls: BonusDieRoll[] = [];
  let total = 0;
  for (const entry of entries) {
    const parsed = parseDiceExpression(entry.dice);
    const dieRolls: number[] = [];
    for (let i = 0; i < parsed.count; i += 1) dieRolls.push(rollDie(parsed.die, rng));
    const magnitude = dieRolls.reduce((sum, v) => sum + v, 0) + parsed.modifier;
    const signed = entry.subtract ? -magnitude : magnitude;
    total += signed;
    rolls.push({
      dice: entry.dice,
      rolls: dieRolls,
      subtract: entry.subtract,
      source: entry.source,
      total: signed,
    });
  }
  return { total, rolls };
};

export interface SaveBonusDice {
  readonly total: number;
  readonly breakdown: ReadonlyArray<RollBreakdownEntry>;
}

// Rolls the bonus dice that apply to a saving throw (Bless / Bane) and
// returns the signed total plus breakdown entries to merge into the
// SaveRolled event's `breakdown` (and `bonus`/`total`). Empty entries
// roll no RNG, so an unaffected save's stream is unchanged. Used by every
// save-rolling planner so the bonus applies wherever a save is made.
export const rollSaveBonusDice = (
  entries: ReadonlyArray<BonusDieContribution>,
  rng: RNG,
): SaveBonusDice => {
  const rolled = rollBonusDice(entries, rng);
  return {
    total: rolled.total,
    breakdown: rolled.rolls.map((r) => ({
      source: `${r.source} (${r.subtract ? '-' : '+'}${r.dice}=${r.rolls.join(',')})`,
      value: r.total,
    })),
  };
};
