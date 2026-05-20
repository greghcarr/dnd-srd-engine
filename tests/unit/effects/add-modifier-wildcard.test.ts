// Slice 299 — AddModifier save/check wildcard.
//
// Mirror of slice-266's SetAdvantage wildcard, extended to AddModifier.
// A no-ability AddModifier target (`{kind:'save'}` / `{kind:'check'}`)
// stores under a `save:*` / `check:*` key; specific-ability queries
// merge the wildcard into the per-ability sum.
//
// Canonical user: Stone of Good Luck (Luckstone) compressed from 12
// per-ability entries to 2 wildcard entries. Sibling cleanups: Cloak
// of Protection, Ring of Protection, blessed, baned,
// aura-of-protection-active. Net: 6 wires went from 36 entries
// combined to 6 entries combined.
import { describe, expect, it } from 'vitest';
import { EffectAccumulator } from '../../../src/effects/builder.js';

describe('AddModifier save/check wildcard (slice 299)', () => {
  it('a wildcard save entry contributes to every per-ability save query', () => {
    const acc = new EffectAccumulator();
    acc.addModifier({ kind: 'save' }, 1, 'test:save-wildcard');
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      expect(acc.modifierSum({ kind: 'save', ability })).toBe(1);
    }
  });

  it('a wildcard check entry contributes to every per-ability check query', () => {
    const acc = new EffectAccumulator();
    acc.addModifier({ kind: 'check' }, 2, 'test:check-wildcard');
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      expect(acc.modifierSum({ kind: 'check', ability })).toBe(2);
    }
  });

  it('wildcard and specific-ability entries stack additively', () => {
    const acc = new EffectAccumulator();
    acc.addModifier({ kind: 'save' }, 1, 'wildcard-source');
    acc.addModifier({ kind: 'save', ability: 'WIS' }, 3, 'specific-source');
    expect(acc.modifierSum({ kind: 'save', ability: 'WIS' })).toBe(4);
    expect(acc.modifierSum({ kind: 'save', ability: 'STR' })).toBe(1);
  });

  it('a save wildcard does NOT leak into check queries (and vice versa)', () => {
    const acc = new EffectAccumulator();
    acc.addModifier({ kind: 'save' }, 1, 'save-only');
    expect(acc.modifierSum({ kind: 'check', ability: 'STR' })).toBe(0);
    const acc2 = new EffectAccumulator();
    acc2.addModifier({ kind: 'check' }, 1, 'check-only');
    expect(acc2.modifierSum({ kind: 'save', ability: 'STR' })).toBe(0);
  });

  it('wildcard breakdown includes the wildcard entry alongside specific-ability entries', () => {
    const acc = new EffectAccumulator();
    acc.addModifier({ kind: 'save' }, 1, 'wildcard');
    acc.addModifier({ kind: 'save', ability: 'WIS' }, 2, 'specific');
    const breakdown = acc.modifierBreakdown({ kind: 'save', ability: 'WIS' });
    expect(breakdown).toHaveLength(2);
    const sources = breakdown.map((c) => c.source).sort();
    expect(sources).toEqual(['specific', 'wildcard']);
  });

  it('non-save/check ModifierTargets do not use wildcard logic', () => {
    const acc = new EffectAccumulator();
    acc.addModifier('ac', 1, 'cloak');
    acc.addModifier('attack', 2, 'bless');
    expect(acc.modifierSum('ac')).toBe(1);
    expect(acc.modifierSum('attack')).toBe(2);
  });

  it('a query against a wildcard target returns only the wildcard bucket (no recursive expansion)', () => {
    const acc = new EffectAccumulator();
    acc.addModifier({ kind: 'save' }, 1, 'wildcard');
    acc.addModifier({ kind: 'save', ability: 'WIS' }, 2, 'specific');
    // Wildcard query returns wildcard entries only (the specific-WIS
    // entry doesn't merge upward — only downward).
    expect(acc.modifierSum({ kind: 'save' })).toBe(1);
  });
});

describe('AddModifier wildcard pack refactor (slice 299)', () => {
  // Each previously-unrolled wire still produces the same observable
  // sum on a per-ability query. The wildcard merge keeps slot-stack
  // behavior unchanged from the caller's perspective.
  it('Stone of Good Luck still grants +1 to every save and check', () => {
    const acc = new EffectAccumulator();
    acc.addModifier({ kind: 'save' }, 1, 'luckstone');
    acc.addModifier({ kind: 'check' }, 1, 'luckstone');
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      expect(acc.modifierSum({ kind: 'save', ability })).toBe(1);
      expect(acc.modifierSum({ kind: 'check', ability })).toBe(1);
    }
  });

  it('Cloak of Protection still grants +1 to every save and +1 to AC', () => {
    const acc = new EffectAccumulator();
    acc.addModifier('ac', 1, 'cloak');
    acc.addModifier({ kind: 'save' }, 1, 'cloak');
    expect(acc.modifierSum('ac')).toBe(1);
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      expect(acc.modifierSum({ kind: 'save', ability })).toBe(1);
    }
  });
});
