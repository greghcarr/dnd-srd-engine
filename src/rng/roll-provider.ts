import type { RNG } from './index.js';

// Slice 704 (A2): a die-typed, resumable roll seam layered over the
// value-typed RNG. Planners draw all randomness through `rollDie`
// (src/rng/dice.ts), which — when an ambient RollProvider is installed
// via `withRollProvider` — routes the draw through the provider instead
// of the injected RNG. This lets a caller (e.g. an interactive viewer)
// supply physical-die values for the player's own actions while keeping
// planning synchronous and pure.
//
// Byte-identity guarantee: with NO ambient provider, `rollDie` is the
// untouched `floor(rng.next() * die) + 1` path; the SeededRollProvider
// reproduces that exact formula on a SeededRNG, in the same draw order
// (rollDie/rollDice are the sole RNG consumers in planning — verified).
// The existing golden + replay-equivalence suites are the proof.

/**
 * What a roll is for. Carried on {@link NeedRoll} so a UI can label the
 * prompt ("Roll your attack", "Roll damage"). Best-effort: a roll site
 * that doesn't pass a context yields `undefined` here.
 */
export type RollContext =
  | 'attack'
  | 'damage'
  | 'save'
  | 'check'
  | 'initiative'
  | 'heal'
  | 'hit-dice'
  | 'death-save'
  | 'other';

/**
 * A die-typed source of faces: asked for a specific die size, returns a
 * face in `1..die`. Distinct from {@link RNG} (a value-typed float
 * source) precisely because it knows the die, so a caller can supply
 * real-world dice values per roll.
 */
export interface RollProvider {
  roll(die: number, context?: RollContext): number;
}

/**
 * Thrown by {@link SuppliedRollProvider} when its queue runs out mid-plan.
 * The resumable-prefix driver catches this, prompts the user for `die`
 * (labeled by `context`), appends the answer to the queue, and
 * re-attempts the plan from scratch — the same value prefix re-draws the
 * identical earlier dice and advances exactly one more roll.
 */
export class NeedRoll extends Error {
  readonly die: number;
  readonly context: RollContext | undefined;

  constructor(die: number, context?: RollContext) {
    super(`Roll required: d${die}${context !== undefined ? ` (${context})` : ''} — supplied roll queue exhausted`);
    this.name = 'NeedRoll';
    this.die = die;
    this.context = context;
  }
}

/**
 * Default provider: wraps an {@link RNG} and reproduces `rollDie`
 * bit-for-bit. The face formula is inlined (a single expression) to keep
 * this module free of an import cycle with dice.ts; it MUST stay
 * identical to `rollDie`'s core.
 */
export class SeededRollProvider implements RollProvider {
  constructor(private readonly rng: RNG) {}

  roll(die: number, _context?: RollContext): number {
    // Mirrors rollDie(die, rng) in src/rng/dice.ts exactly.
    return Math.floor(this.rng.next() * die) + 1;
  }
}

/**
 * Manual provider: returns caller-supplied faces in order; throws
 * {@link NeedRoll} once the queue is exhausted. Validates each face is a
 * legal `1..die` value (the queue is external input).
 */
export class SuppliedRollProvider implements RollProvider {
  private cursor = 0;

  constructor(private readonly queue: ReadonlyArray<number>) {}

  roll(die: number, context?: RollContext): number {
    if (this.cursor >= this.queue.length) {
      throw new NeedRoll(die, context);
    }
    const value = this.queue[this.cursor]!;
    if (!Number.isInteger(value) || value < 1 || value > die) {
      throw new Error(
        `Supplied roll #${this.cursor + 1} (${value}) is not a legal d${die} face (expected an integer 1..${die})`,
      );
    }
    this.cursor += 1;
    return value;
  }

  /** Faces consumed so far (diagnostics / UI progress). */
  get consumed(): number {
    return this.cursor;
  }
}

// ── Ambient scope ───────────────────────────────────────────────────
//
// A single module-scoped active provider. `withRollProvider` installs it
// for the duration of a synchronous callback and restores the previous
// one in `finally` (reentrant-safe). Manual dice are used only for the
// player's own actions in an unranked context, so one shared stream is
// acceptable; per-combatant stream forking is a deliberate non-goal for
// now (a future option).

let activeProvider: RollProvider | undefined;

/** The ambient provider, or `undefined` when none is installed. */
export const getActiveRollProvider = (): RollProvider | undefined => activeProvider;

/**
 * Run `fn` with `provider` installed as the ambient roll source, then
 * restore the previous provider. Synchronous and pure: planning produces
 * events without side effects, so a caught {@link NeedRoll} can be
 * resolved by re-attempting `fn` against a longer supplied queue.
 */
export const withRollProvider = <T>(provider: RollProvider, fn: () => T): T => {
  const previous = activeProvider;
  activeProvider = provider;
  try {
    return fn();
  } finally {
    activeProvider = previous;
  }
};
