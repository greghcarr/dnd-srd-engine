import type { RNG } from './index.js';
import { getActiveRollProvider, type RollContext } from './roll-provider.js';

const DICE_EXPRESSION_RE = /^(\d+)d(\d+)([+-]\d+)?$/i;

export interface DieRoll {
  readonly die: number;
  readonly value: number;
}

export interface DiceRollResult {
  readonly rolls: ReadonlyArray<DieRoll>;
  readonly modifier: number;
  readonly total: number;
}

export interface ParsedDiceExpression {
  readonly count: number;
  readonly die: number;
  readonly modifier: number;
}

export const parseDiceExpression = (expression: string): ParsedDiceExpression => {
  const match = DICE_EXPRESSION_RE.exec(expression.trim());
  if (!match) {
    throw new Error(`Invalid dice expression: ${expression}`);
  }
  const countStr = match[1];
  const dieStr = match[2];
  const modStr = match[3];
  if (countStr === undefined || dieStr === undefined) {
    throw new Error(`Invalid dice expression: ${expression}`);
  }
  const count = Number.parseInt(countStr, 10);
  const die = Number.parseInt(dieStr, 10);
  const modifier = modStr === undefined ? 0 : Number.parseInt(modStr, 10);
  // Slice 122: allow count=0 for flat-damage shapes ("0d6+5" =
  // 5 flat). Existing dice paths skip the roll loop when count=0
  // and fold modifier in unchanged. Die size is still > 1 since
  // count=0 makes the die value irrelevant.
  if (count < 0) throw new Error(`Dice count must be >= 0: ${expression}`);
  if (die <= 1) throw new Error(`Die size must be > 1: ${expression}`);
  return { count, die, modifier };
};

// Slice 704 (A2): when an ambient RollProvider is installed (via
// `withRollProvider`), the draw routes through it instead of the injected
// RNG; with none installed this is the untouched `floor(next*die)+1`
// path, so existing golden + replay output is byte-identical. The
// optional `context` labels a resulting NeedRoll for the UI.
export const rollDie = (die: number, rng: RNG, context?: RollContext): number => {
  if (die <= 1 || !Number.isInteger(die)) {
    throw new Error(`Invalid die size: ${die}`);
  }
  const provider = getActiveRollProvider();
  if (provider !== undefined) {
    return provider.roll(die, context);
  }
  return Math.floor(rng.next() * die) + 1;
};

export const rollDice = (
  count: number,
  die: number,
  rng: RNG,
  context?: RollContext,
): ReadonlyArray<DieRoll> => {
  if (count <= 0 || !Number.isInteger(count)) {
    throw new Error(`Invalid dice count: ${count}`);
  }
  const rolls: DieRoll[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push({ die, value: rollDie(die, rng, context) });
  }
  return rolls;
};

export const rollExpression = (
  expression: string,
  rng: RNG,
  context?: RollContext,
): DiceRollResult => {
  const parsed = parseDiceExpression(expression);
  const rolls = rollDice(parsed.count, parsed.die, rng, context);
  const sumOfRolls = rolls.reduce((acc, r) => acc + r.value, 0);
  return {
    rolls,
    modifier: parsed.modifier,
    total: sumOfRolls + parsed.modifier,
  };
};
