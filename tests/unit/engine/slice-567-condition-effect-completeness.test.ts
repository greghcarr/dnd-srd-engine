// Slice 567: Condition effect-list completeness sweep.
//
// Pre-slice five RAW conditions had under-modeled effect arrays at the
// pack level:
//   - Blinded:     missing GrantAdvantageToAttackers (attacks vs
//                  bearer get Advantage per RAW)
//   - Paralyzed:   missing GrantAdvantageToAttackers
//   - Stunned:     missing ModifySpeed walk:0 AND
//                  GrantAdvantageToAttackers
//   - Unconscious: missing GrantAdvantageToAttackers
//   - Petrified:   missing GrantAdvantageToAttackers AND auto-fail
//                  STR/DEX saves (RAW: Petrified composes Paralyzed)
//
// Slice 567 adds the missing arms to each condition. Incapacitated
// composition (action / bonus action / reaction block) stays
// engine-hardcoded via _actor-state.ts's ACTION_BLOCKING_CONDITIONS.
// Within-5-ft auto-crit for paralyzed / unconscious is deferred to
// slice 568.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

interface SetAdvantageEffect {
  readonly kind: 'SetAdvantage';
  readonly on: string | { kind: string; ability?: string };
  readonly mode: string;
}
interface ModifySpeedEffect {
  readonly kind: 'ModifySpeed';
  readonly mode: string;
  readonly op: string;
  readonly value: number;
}

const getCondition = (id: string) => PACK.conditions?.find((c) => c.id === id);

const hasAttackerAdvantage = (id: string): boolean =>
  getCondition(id)?.effects.some((e) => e.kind === 'GrantAdvantageToAttackers') ?? false;

const hasSpeedZero = (id: string): boolean =>
  getCondition(id)?.effects.some(
    (e) => e.kind === 'ModifySpeed'
      && (e as ModifySpeedEffect).mode === 'walk'
      && (e as ModifySpeedEffect).op === 'set'
      && (e as ModifySpeedEffect).value === 0,
  ) ?? false;

const hasAutoFailSave = (id: string, ability: 'STR' | 'DEX'): boolean =>
  getCondition(id)?.effects.some((e) => {
    if (e.kind !== 'SetAdvantage') return false;
    const s = e as SetAdvantageEffect;
    if (s.mode !== 'auto-fail') return false;
    if (typeof s.on === 'string') return false;
    return s.on.kind === 'save' && s.on.ability === ability;
  }) ?? false;

describe('Condition effect-list completeness (slice 567)', () => {
  describe('GrantAdvantageToAttackers added to 5 conditions (was previously restrained-only)', () => {
    it('blinded: attacks against blinded bearer have Advantage', () => {
      expect(hasAttackerAdvantage('blinded')).toBe(true);
    });
    it('paralyzed: attacks against paralyzed bearer have Advantage', () => {
      expect(hasAttackerAdvantage('paralyzed')).toBe(true);
    });
    it('stunned: attacks against stunned bearer have Advantage', () => {
      expect(hasAttackerAdvantage('stunned')).toBe(true);
    });
    it('unconscious: attacks against unconscious bearer have Advantage', () => {
      expect(hasAttackerAdvantage('unconscious')).toBe(true);
    });
    it('petrified: attacks against petrified bearer have Advantage', () => {
      expect(hasAttackerAdvantage('petrified')).toBe(true);
    });
    it('restrained: pre-existing GrantAdvantageToAttackers preserved', () => {
      expect(hasAttackerAdvantage('restrained')).toBe(true);
    });
  });

  describe('Stunned Speed 0 (was missing pre-slice)', () => {
    it('stunned: ModifySpeed walk:0 set entry present', () => {
      expect(hasSpeedZero('stunned')).toBe(true);
    });
  });

  describe('Petrified composes Paralyzed (auto-fail STR/DEX saves)', () => {
    it('petrified: auto-fail STR save entry present', () => {
      expect(hasAutoFailSave('petrified', 'STR')).toBe(true);
    });
    it('petrified: auto-fail DEX save entry present', () => {
      expect(hasAutoFailSave('petrified', 'DEX')).toBe(true);
    });
  });

  describe('pre-existing arms preserved (regression smoke)', () => {
    it('blinded retains bearer-side attack disadvantage', () => {
      const eff = getCondition('blinded')!.effects.find(
        (e) => e.kind === 'SetAdvantage' && (e as SetAdvantageEffect).on === 'attack',
      ) as SetAdvantageEffect | undefined;
      expect(eff?.mode).toBe('disadvantage');
    });
    it('paralyzed retains Speed 0 + auto-fail saves', () => {
      expect(hasSpeedZero('paralyzed')).toBe(true);
      expect(hasAutoFailSave('paralyzed', 'STR')).toBe(true);
      expect(hasAutoFailSave('paralyzed', 'DEX')).toBe(true);
    });
    it('unconscious retains Speed 0 + auto-fail saves', () => {
      expect(hasSpeedZero('unconscious')).toBe(true);
      expect(hasAutoFailSave('unconscious', 'STR')).toBe(true);
      expect(hasAutoFailSave('unconscious', 'DEX')).toBe(true);
    });
    it('petrified retains Speed 0 + resistance-all + poison immunity', () => {
      const c = getCondition('petrified');
      expect(hasSpeedZero('petrified')).toBe(true);
      expect(c?.effects.some((e) => e.kind === 'GrantResistance' && (e as { damageType?: string }).damageType === 'all')).toBe(true);
      expect(c?.effects.some((e) => e.kind === 'GrantConditionImmunity' && (e as { conditionId?: string }).conditionId === 'poisoned')).toBe(true);
    });
    it('stunned retains auto-fail STR + DEX saves', () => {
      expect(hasAutoFailSave('stunned', 'STR')).toBe(true);
      expect(hasAutoFailSave('stunned', 'DEX')).toBe(true);
    });
  });
});
