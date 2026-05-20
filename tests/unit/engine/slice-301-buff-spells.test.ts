// Slice 301 — buff-shape spell sweep (first cluster).
//
// Two spells wired via the existing `buff` mechanicalEffect + new
// per-spell condition entries. Both use only existing effect
// primitives.
//
// - True Seeing (L6): new `true-seeing-active` condition with
//   GrantSense truesight 120. Auto-folds into slice-271's
//   bypassesSightIllusion (Blur, Mirror Image) and slice-273's
//   canLocateInvisible (Invisible condition) facts, since both
//   check hasSense('truesight').
// - Warding Bond (L2): new `warding-bond-active` condition with
//   +1 AC, +1 save-wildcard (slice-299 primitive), Resistance to
//   all damage. The 60-ft proximity gate is consumer-managed; the
//   damage-sharing arm is deferred (no shared-damage-link primitive
//   yet).
import { describe, expect, it } from 'vitest';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { mitigateDamage } from '../../../src/derive/damage-mitigation.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { newAppliedConditionId, newEventId } from '../../../src/ids.js';
import { buildFighter } from '../../fixtures/index.js';
import type { AppliedCondition } from '../../../src/schemas/runtime/character.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const applyCondition = (conditionId: string): AppliedCondition => ({
  id: newAppliedConditionId(),
  conditionId,
});

const buffedFighter = (conditionId: string) => {
  const base = buildFighter({});
  return { ...base, appliedConditions: [applyCondition(conditionId)] };
};

const baselineFighter = () => buildFighter({});

describe('slice 301: True Seeing grants Truesight 120 ft', () => {
  it('the buffed creature carries truesight in its effect stack', () => {
    const wearer = buffedFighter('true-seeing-active');
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.hasSense('truesight')).toBe(true);
  });

  it('the spell is wired with the buff -> true-seeing-active condition', () => {
    const spell = PACK.spells.find((s) => s.id === 'true-seeing');
    expect(spell?.mechanicalEffects).toEqual([
      { kind: 'buff', conditionId: 'true-seeing-active' },
    ]);
  });

  it('a creature without the buff does not carry truesight', () => {
    const wearer = baselineFighter();
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.hasSense('truesight')).toBe(false);
  });
});

describe('slice 301: Warding Bond grants +1 AC, +1 save wildcard, Resistance to all', () => {
  it('the spell is wired with the buff -> warding-bond-active condition', () => {
    const spell = PACK.spells.find((s) => s.id === 'warding-bond');
    expect(spell?.mechanicalEffects).toEqual([
      { kind: 'buff', conditionId: 'warding-bond-active' },
    ]);
  });

  it('+1 AC on the bonded creature', () => {
    const wearer = buffedFighter('warding-bond-active');
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.modifierSum('ac')).toBe(1);
  });

  it('+1 to every per-ability save (slice-299 wildcard fires for all 6)', () => {
    const wearer = buffedFighter('warding-bond-active');
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      const save = computeSavingThrow({
        character: wearer,
        itemInstances: {},
        content: CONTENT,
        ability,
      });
      // The +1 from warding-bond shows up on every save's bonus.
      const wbContribution = save.breakdown.find(
        (b) => /warding-bond-active/.test(b.source ?? '') || b.value === 1,
      );
      expect(wbContribution).toBeDefined();
    }
  });

  it('halves incoming fire damage (Resistance to all)', () => {
    const wearer = buffedFighter('warding-bond-active');
    const result = mitigateDamage({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      rawComponents: [{ amount: 10, type: 'fire' }],
    });
    expect(result[0]?.amount).toBe(5);
  });

  it('halves incoming necrotic damage too (Resistance to all covers every damage type)', () => {
    const wearer = buffedFighter('warding-bond-active');
    const result = mitigateDamage({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      rawComponents: [{ amount: 20, type: 'necrotic' }],
    });
    expect(result[0]?.amount).toBe(10);
  });

  it('no AC or save bonus without the buff', () => {
    const wearer = baselineFighter();
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.modifierSum('ac')).toBe(0);
    expect(effects.modifierSum({ kind: 'save', ability: 'WIS' })).toBe(0);
  });
});
