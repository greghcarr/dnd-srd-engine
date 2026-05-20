// Slice 302 — buff-shape spell sweep (second cluster).
//
// Two more clean wires using existing primitives:
// - Heroes' Feast (L6): new heroes-feasted-active condition with
//   GrantResistance(poison) + GrantConditionImmunity(frightened) +
//   GrantConditionImmunity(poisoned). 2d10 HP-max-increase arm
//   deferred (needs per-cast random rolled value baked at cast time).
// - Wind Walk (L6): new wind-walking-active condition with
//   ModifySpeed(fly, set, 300) + GrantConditionImmunity(prone) +
//   3x GrantResistance(B/P/S). Action restriction + revert mechanic
//   stay consumer-managed.
import { describe, expect, it } from 'vitest';
import { mitigateDamage } from '../../../src/derive/damage-mitigation.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { getEffectiveFlySpeed } from '../../../src/engine/plan/_actor-state.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { newAppliedConditionId } from '../../../src/ids.js';
import { buildFighter } from '../../fixtures/index.js';
import type { AppliedCondition } from '../../../src/schemas/runtime/character.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buffedFighter = (conditionId: string) => {
  const base = buildFighter({});
  const cond: AppliedCondition = { id: newAppliedConditionId(), conditionId };
  return { ...base, appliedConditions: [cond] };
};

describe("slice 302: Heroes' Feast grants poison resistance + frightened/poisoned immunity", () => {
  it('the spell is wired with the buff -> heroes-feasted-active condition', () => {
    const spell = PACK.spells.find((s) => s.id === 'heroes-feast');
    expect(spell?.mechanicalEffects).toEqual([
      { kind: 'buff', conditionId: 'heroes-feasted-active' },
    ]);
  });

  it('halves incoming poison damage', () => {
    const wearer = buffedFighter('heroes-feasted-active');
    const result = mitigateDamage({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      rawComponents: [{ amount: 20, type: 'poison' }],
    });
    expect(result[0]?.amount).toBe(10);
  });

  it('grants immunity to Frightened + Poisoned but not unrelated conditions', () => {
    const wearer = buffedFighter('heroes-feasted-active');
    const stack = buildEffectStack({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      pendingChoices: {},
    });
    expect(stack.hasConditionImmunity('frightened')).toBe(true);
    expect(stack.hasConditionImmunity('poisoned')).toBe(true);
    expect(stack.hasConditionImmunity('charmed')).toBe(false);
  });
});

describe('slice 302: Wind Walk grants fly 300 + prone immunity + B/P/S resistance', () => {
  it('the spell is wired with the buff -> wind-walking-active condition', () => {
    const spell = PACK.spells.find((s) => s.id === 'wind-walk');
    expect(spell?.mechanicalEffects).toEqual([
      { kind: 'buff', conditionId: 'wind-walking-active' },
    ]);
  });

  it('grants a Fly Speed of 300', () => {
    const wearer = buffedFighter('wind-walking-active');
    const fly = getEffectiveFlySpeed({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
    });
    expect(fly).toBe(300);
  });

  it('grants immunity to the Prone condition', () => {
    const wearer = buffedFighter('wind-walking-active');
    const stack = buildEffectStack({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      pendingChoices: {},
    });
    expect(stack.hasConditionImmunity('prone')).toBe(true);
  });

  for (const damageType of ['bludgeoning', 'piercing', 'slashing'] as const) {
    it(`halves incoming ${damageType} damage (Resistance to ${damageType})`, () => {
      const wearer = buffedFighter('wind-walking-active');
      const result = mitigateDamage({
        character: wearer,
        itemInstances: {},
        content: CONTENT,
        rawComponents: [{ amount: 10, type: damageType }],
      });
      expect(result[0]?.amount).toBe(5);
    });
  }

  it('does not halve fire damage (Resistance is B/P/S only)', () => {
    const wearer = buffedFighter('wind-walking-active');
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: {},
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.hasResistance('fire')).toBe(false);
  });
});
