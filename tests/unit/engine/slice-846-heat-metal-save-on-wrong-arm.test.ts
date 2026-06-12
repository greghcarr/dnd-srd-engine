// Slice 846: heat-metal-save-on-wrong-arm (L7 audit, Area 2). RAW 2024 Heat
// Metal: "Any creature in physical contact with the object takes 2d8 Fire
// damage when you cast the spell. ... If a creature is holding or wearing the
// object and takes the damage from it, the creature must succeed on a
// Constitution saving throw or drop the object if it can. If it doesn't drop
// the object, it has Disadvantage on attack rolls and ability checks until the
// start of your next turn." The engine gated the 2d8 fire behind the CON save
// (halfOnSuccess:false → a success negated the damage entirely). This slice
// adds a `damageIgnoresSave` flag to the save mechanic: the damage is dealt in
// full regardless of the save, and the save governs ONLY the condition —
// applying a new `heat-metal-gripped` (Disadvantage on attack rolls + ability
// checks until the caster's next turn) on a failure.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

// Level-5 Druid, WIS 16 (+3), PB +3 → spell save DC = 8 + 3 + 3 = 14.
const DRUID_SPELL_DC = 14;

const buildDruid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Druid', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 33, max: 33, temp: 0 },
    preparedSpells: ['heat-metal'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Knight', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 10, CON: 10, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 200, max: 200, temp: 0 },
  });

const setup = (seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const druid = buildDruid();
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: `heat-${seed}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, druid, target };
};

const cast = (s: ReturnType<typeof setup>, slotLevel = 2): ReadonlyArray<Event> =>
  s.engine.plan.castSpell(s.campaign.state, {
    characterId: s.druid.id, spellId: 'heat-metal', slotLevel, targetIds: [s.target.id],
  }).events as ReadonlyArray<Event>;

const fireTotal = (events: ReadonlyArray<Event>): number => {
  const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
  return (dmg?.components ?? []).filter((c) => c.type === 'fire').reduce((s, c) => s + c.amount, 0);
};

describe('Heat Metal damage ignores the save; the save only grips (slice 846)', () => {
  it('wires the damageIgnoresSave save mechanic + the heat-metal-gripped condition (disadvantage on attack/check, 1-round)', () => {
    const spell = PACK.spells.find((s) => s.id === 'heat-metal')!;
    expect(spell.mechanicalEffects[0]).toMatchObject({
      kind: 'save', ability: 'CON', damageDice: '2d8', damageType: 'fire',
      damageIgnoresSave: true, conditionOnFail: 'heat-metal-gripped', extraDicePerSlotLevel: 1,
    });
    const gripped = PACK.conditions.find((c) => c.id === 'heat-metal-gripped')!;
    expect(gripped.effects).toEqual([
      { kind: 'SetAdvantage', on: 'attack', mode: 'disadvantage' },
      { kind: 'SetAdvantage', on: { kind: 'check' }, mode: 'disadvantage' },
    ]);
    expect(gripped.autoExpiry).toEqual({ afterRounds: 1, trigger: 'turnStart' });
  });

  it('deals the full 2d8 fire even on a SUCCESSFUL save, and grips no one', () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const s = setup(seed);
      const events = cast(s);
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      expect(save?.ability).toBe('CON');
      expect(save?.dc).toBe(DRUID_SPELL_DC);
      if (save?.success !== true) continue;
      // The bug was: a success negated the damage. RAW: damage is automatic.
      expect(fireTotal(events), 'fire damage on a successful save').toBeGreaterThanOrEqual(2);
      expect(fireTotal(events)).toBeLessThanOrEqual(16);
      // No grip on a success.
      expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'heat-metal-gripped')).toBe(false);
      return;
    }
    throw new Error('no successful-save seed');
  });

  it('on a FAILED save, deals the full 2d8 fire AND grips the target (sourced to the caster)', () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const s = setup(seed);
      const events = cast(s);
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (save?.success !== false) continue;
      expect(fireTotal(events), 'fire damage on a failed save').toBeGreaterThanOrEqual(2);
      const grip = events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'heat-metal-gripped',
      );
      expect(grip, 'gripped on a failed save').toBeDefined();
      expect(grip!.targetId).toBe(s.target.id);
      expect(grip!.sourceCharacterId).toBe(s.druid.id);
      return;
    }
    throw new Error('no failed-save seed');
  });

  it('upcasts the damage (+1d8 per slot above 2nd) while still ignoring the save', () => {
    // At slot 3 the damage is 3d8 (3–24). Seed-search for a roll above the 2d8
    // ceiling (16) to prove the dice scaled — and prove damage lands regardless.
    let sawAboveBaseCeiling = false;
    for (let seed = 1; seed < 300 && !sawAboveBaseCeiling; seed += 1) {
      const total = fireTotal(cast(setup(seed), 3));
      expect(total).toBeGreaterThanOrEqual(3);
      expect(total).toBeLessThanOrEqual(24);
      if (total > 16) sawAboveBaseCeiling = true;
    }
    expect(sawAboveBaseCeiling, 'slot-3 Heat Metal rolled above the 2d8 ceiling (proves 3d8)').toBe(true);
  });
});
