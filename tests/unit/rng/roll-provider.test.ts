// Slice 704 (A2): die-typed roll-provider seam — unit tests.
//
// Covers the provider primitives + the ambient `withRollProvider` scope
// + the `rollDie`/`rollDice`/`rollExpression` routing. The engine-level
// byte-identity + resumable-replay proofs live in
// tests/unit/engine/roll-provider-attack.test.ts.

import { describe, expect, it } from 'vitest';
import { rollDie, rollDice, rollExpression } from '../../../src/rng/dice.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { throwOnCallRNG } from '../../../src/rng/throw.js';
import {
  NeedRoll,
  SeededRollProvider,
  SuppliedRollProvider,
  withRollProvider,
  getActiveRollProvider,
} from '../../../src/rng/roll-provider.js';

describe('A2: SeededRollProvider reproduces rollDie bit-for-bit', () => {
  const DICE = [20, 8, 6, 20, 12, 4, 10, 20, 100, 2];

  it('matches the direct rollDie sequence for a mixed-die draw order', () => {
    const rngA = seededRNG(12345);
    const direct = DICE.map((d) => rollDie(d, rngA));
    const provider = new SeededRollProvider(seededRNG(12345));
    const viaProvider = DICE.map((d) => provider.roll(d));
    expect(viaProvider).toEqual(direct);
  });

  it('routed through rollDie under withRollProvider matches the default path (RNG bypassed)', () => {
    const rngA = seededRNG(999);
    const direct = DICE.map((d) => rollDie(d, rngA));
    // The injected RNG here throws if touched — proving the provider
    // intercepts every draw.
    const routed = withRollProvider(new SeededRollProvider(seededRNG(999)), () =>
      DICE.map((d) => rollDie(d, throwOnCallRNG())),
    );
    expect(routed).toEqual(direct);
  });
});

describe('A2: withRollProvider scope', () => {
  it('installs the provider for the callback and restores afterward', () => {
    expect(getActiveRollProvider()).toBeUndefined();
    const provider = new SuppliedRollProvider([5]);
    const seen = withRollProvider(provider, () => getActiveRollProvider());
    expect(seen).toBe(provider);
    expect(getActiveRollProvider()).toBeUndefined();
  });

  it('restores the previous provider on nested scopes and after a throw', () => {
    const outer = new SuppliedRollProvider([1, 2, 3]);
    const inner = new SuppliedRollProvider([9]);
    withRollProvider(outer, () => {
      expect(getActiveRollProvider()).toBe(outer);
      withRollProvider(inner, () => expect(getActiveRollProvider()).toBe(inner));
      expect(getActiveRollProvider()).toBe(outer);
      expect(() =>
        withRollProvider(inner, () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(getActiveRollProvider()).toBe(outer);
    });
    expect(getActiveRollProvider()).toBeUndefined();
  });

  it('rollDie ignores the injected RNG while a provider is active', () => {
    const value = withRollProvider(new SuppliedRollProvider([7]), () =>
      rollDie(20, throwOnCallRNG()),
    );
    expect(value).toBe(7);
  });
});

describe('A2: SuppliedRollProvider', () => {
  it('returns queued faces in order and tracks consumption', () => {
    const provider = new SuppliedRollProvider([3, 1, 4]);
    expect(provider.roll(6)).toBe(3);
    expect(provider.roll(20)).toBe(1);
    expect(provider.roll(8)).toBe(4);
    expect(provider.consumed).toBe(3);
  });

  it('throws NeedRoll carrying the requested die + context when exhausted', () => {
    const provider = new SuppliedRollProvider([20]);
    expect(provider.roll(20, 'attack')).toBe(20);
    try {
      provider.roll(8, 'damage');
      throw new Error('expected NeedRoll to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NeedRoll);
      expect((err as NeedRoll).die).toBe(8);
      expect((err as NeedRoll).context).toBe('damage');
    }
  });

  it('rejects an out-of-range supplied face (external input validation)', () => {
    expect(() => new SuppliedRollProvider([7]).roll(6)).toThrow(/not a legal d6 face/);
    expect(() => new SuppliedRollProvider([0]).roll(20)).toThrow(/not a legal d20 face/);
  });

  it('rollDice and rollExpression route through the provider in order', () => {
    const diced = withRollProvider(new SuppliedRollProvider([2, 3, 4]), () =>
      rollDice(3, 6, throwOnCallRNG()),
    );
    expect(diced.map((r) => r.value)).toEqual([2, 3, 4]);

    const expr = withRollProvider(new SuppliedRollProvider([5, 6]), () =>
      rollExpression('2d8+3', throwOnCallRNG()),
    );
    expect(expr.rolls.map((r) => r.value)).toEqual([5, 6]);
    expect(expr.total).toBe(5 + 6 + 3);
  });
});
