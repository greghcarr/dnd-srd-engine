// Slice 850 — `blindness-deafness-no-choice-no-saveends`.
//
// RAW (SRD 5.2.1 Blindness/Deafness): "One creature ... must succeed on a
// Constitution saving throw, or it has the Blinded or Deafened condition
// (your choice) for the duration. At the end of each of its turns, the target
// repeats the save, ending the spell on itself on a success."
//
// The engine hardwired `conditionOnFail: 'blinded'` — no Blinded/Deafened
// CHOICE — and the shared `blinded` condition deliberately has
// `recurringSave: null` (Blinded from a monster's gaze must NOT auto-end on a
// CON save), so the end-of-turn save-ends never fired.
//
// Content-only fix reusing shipped primitives: the save mechanic now uses
// `casterChoosesVariant` (the Command shape) to pick between two spell-only
// variant conditions — `blindness-deafness-blinded` / `-deafened` — each
// carrying the base Blinded/Deafened effects directly (so the shared
// conditions are untouched) plus a `recurringSave` { CON, turnEnd,
// removeCondition } with no fixedDC (→ resolves the caster's spell DC from
// sourceCharacterId, the Hold Person path) and `autoExpiry` { 10 rounds,
// turnEnd } as the 1-minute cap. No engine/schema change.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const spell = () => PACK.spells.find((s) => s.id === 'blindness-deafness')!;
const cond = (id: string) => PACK.conditions?.find((c) => c.id === id)!;

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mordin',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    preparedSpells: ['blindness-deafness'],
  });

// A Rogue (DEX / INT save proficiencies — NOT CON), CON 4 (−3, no prof), so it
// fails the wizard's DC 15 cast save on the seed-chosen d20.
const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sneak',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 12, DEX: 14, CON: 4, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 24, max: 24, temp: 0 },
  });

const seedCampaign = (seed: number, wizard: Character, target: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign = engine.createCampaign({ name: 'bd-guard' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 850: Blindness/Deafness — Blinded/Deafened choice + CON save-ends', () => {
  it('the CON save offers a Blinded/Deafened caster choice (no hardwired conditionOnFail)', () => {
    const save = spell().mechanicalEffects.find((m) => m.kind === 'save') as {
      ability?: string;
      conditionOnFail?: string;
      casterChoosesVariant?: { variants: { key: string; conditionId: string }[] };
    };
    expect(save.ability).toBe('CON');
    expect(save.conditionOnFail).toBeUndefined();
    const variants = save.casterChoosesVariant?.variants ?? [];
    expect(variants.find((v) => v.key === 'blindness')?.conditionId).toBe('blindness-deafness-blinded');
    expect(variants.find((v) => v.key === 'deafness')?.conditionId).toBe('blindness-deafness-deafened');
  });

  it('the Blinded variant carries base Blinded effects + a turn-end CON save-ends + 1-min cap', () => {
    const c = cond('blindness-deafness-blinded') as {
      effects: { kind: string; mode?: string }[];
      recurringSave?: { ability: string; trigger: string; onSuccess: string; fixedDC?: number };
      autoExpiry?: { afterRounds: number; trigger: string };
    };
    expect(c.effects.some((e) => e.kind === 'SetAdvantage' && e.mode === 'disadvantage')).toBe(true);
    expect(c.effects.some((e) => e.kind === 'GrantAdvantageToAttackers')).toBe(true);
    expect(c.recurringSave).toEqual({ ability: 'CON', trigger: 'turnEnd', onSuccess: 'removeCondition' });
    expect(c.recurringSave?.fixedDC).toBeUndefined(); // → caster's spell DC
    expect(c.autoExpiry).toEqual({ afterRounds: 10, trigger: 'turnEnd' });
  });

  it('the Deafened variant carries the base Deafened (hearing auto-fail) effect + the same save-ends', () => {
    const c = cond('blindness-deafness-deafened') as {
      effects: { kind: string; mode?: string }[];
      recurringSave?: { ability: string; trigger: string; onSuccess: string };
      autoExpiry?: { afterRounds: number; trigger: string };
    };
    expect(c.effects.some((e) => e.kind === 'SetAdvantage' && e.mode === 'auto-fail')).toBe(true);
    expect(c.recurringSave).toEqual({ ability: 'CON', trigger: 'turnEnd', onSuccess: 'removeCondition' });
    expect(c.autoExpiry).toEqual({ afterRounds: 10, trigger: 'turnEnd' });
  });

  it('a failed cast save applies the chosen variant, sourced to the caster', () => {
    for (const [choice, expected] of [
      ['blindness', 'blindness-deafness-blinded'],
      ['deafness', 'blindness-deafness-deafened'],
    ] as const) {
      const wizard = buildWizard();
      const target = buildTarget();
      const { engine, campaign } = seedCampaign(3, wizard, target);
      const res = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'blindness-deafness',
        slotLevel: 2,
        targetIds: [target.id],
        casterChoice: { kind: 'variant', value: choice },
      });
      expect(res.events.some((e) => e.type === 'SaveRolled' && !e.success)).toBe(true);
      const applied = res.events.find((e) => e.type === 'ConditionApplied');
      expect(applied?.conditionId).toBe(expected);
      expect(applied?.sourceCharacterId).toBe(wizard.id);
    }
  });

  it('the end-of-turn recurring CON save resolves vs the caster spell DC and ends the spell on a success', () => {
    const wizard = buildWizard();
    const target = buildTarget();
    const { engine, campaign } = seedCampaign(9, wizard, target); // cast fails, then a turn-end save succeeds
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'blindness-deafness',
      slotLevel: 2,
      targetIds: [target.id],
      casterChoice: { kind: 'variant', value: 'blindness' },
    });
    expect(cast.events.some((e) => e.type === 'ConditionApplied' && e.conditionId === 'blindness-deafness-blinded')).toBe(true);
    const afterCast = commit(campaign, cast.events);

    const tick = engine.plan.tickRecurringSave(afterCast.state, {
      targetId: target.id,
      conditionId: 'blindness-deafness-blinded',
      casterId: wizard.id,
    });
    const save = tick.events.find((e) => e.type === 'SaveRolled');
    expect(save).toBeDefined();
    expect((save as { ability: string }).ability).toBe('CON');
    expect((save as { dc: number }).dc).toBe(15); // wizard L5 INT 18 spell save DC
    expect((save as { success: boolean }).success).toBe(true);
    expect(
      tick.events.some((e) => e.type === 'ConditionRemoved' && e.conditionId === 'blindness-deafness-blinded'),
    ).toBe(true);
  });

  it('a failed end-of-turn save leaves the condition in place', () => {
    const wizard = buildWizard();
    const target = buildTarget();
    const { engine, campaign } = seedCampaign(3, wizard, target); // cast fails, then a turn-end save also fails
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'blindness-deafness',
      slotLevel: 2,
      targetIds: [target.id],
      casterChoice: { kind: 'variant', value: 'blindness' },
    });
    const afterCast = commit(campaign, cast.events);
    const tick = engine.plan.tickRecurringSave(afterCast.state, {
      targetId: target.id,
      conditionId: 'blindness-deafness-blinded',
      casterId: wizard.id,
    });
    expect(tick.events.some((e) => e.type === 'SaveRolled' && !e.success)).toBe(true);
    expect(tick.events.some((e) => e.type === 'ConditionRemoved')).toBe(false);
  });
});
