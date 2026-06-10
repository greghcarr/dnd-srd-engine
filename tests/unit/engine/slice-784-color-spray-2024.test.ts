// Slice 784: Color Spray rewired to the SRD 5.2.1 mechanic (replacing the
// 2014 HP-pool knockout).
//
// RAW (spells.md): "Each creature in a 15-foot Cone originating from you must
// succeed on a Constitution saving throw or have the Blinded condition until
// the end of your next turn." Level 1, Range Self, Instantaneous (no
// Concentration), no escalation, no auto-succeed gate.
//
// Wiring: save mechanic (CON) -> color-sprayed-blinded-active, a Blinded
// variant carrying the base Blinded effects + autoExpiry { afterRounds 1,
// turnEnd } (lifts at the end of the source caster's next turn).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Caster', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: ['color-spray'], preparedSpells: ['color-spray'],
  });

const buildTarget = (CON: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const seedCast = (engine: ReturnType<typeof createEngine>, name: string, caster: Character, target: Character): Campaign => {
  let campaign = engine.createCampaign({ name });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return campaign;
};

describe('Color Spray — SRD 5.2.1 save mechanic (slice 784)', () => {
  it('pack: Color Spray is a CON save -> color-sprayed-blinded-active, Instantaneous cone (no concentration)', () => {
    const cs = PACK.spells.find((s) => s.id === 'color-spray');
    expect(cs?.concentration).toBe(false);
    expect(cs?.targeting).toEqual({ shape: 'cone', size: 15 });
    expect(cs?.mechanicalEffects).toEqual([
      { kind: 'save', ability: 'CON', conditionOnFail: 'color-sprayed-blinded-active' },
    ]);
  });

  it('pack: color-sprayed-blinded-active carries Blinded effects + a 1-round turnEnd autoExpiry', () => {
    const c = PACK.conditions.find((cc) => cc.id === 'color-sprayed-blinded-active');
    expect(c?.effects).toEqual([
      { kind: 'SetAdvantage', on: 'attack', mode: 'disadvantage' },
      { kind: 'GrantAdvantageToAttackers' },
    ]);
    expect(c?.autoExpiry).toEqual({ afterRounds: 1, trigger: 'turnEnd' });
  });

  it('cast: a target that fails the CON save gets color-sprayed-blinded-active', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const caster = buildWizard();
      const target = buildTarget(6); // CON 6 -> -2, mostly fails
      const campaign = seedCast(engine, `cs-fail-${seed}`, caster, target);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: caster.id, spellId: 'color-spray', slotLevel: 1, targetIds: [target.id],
      });
      const save = events.find(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && (e as SaveRolledEvent).targetId === target.id,
      );
      if (save === undefined || save.success) continue;
      expect(save.ability).toBe('CON');
      const blinded = events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'color-sprayed-blinded-active',
      );
      expect(blinded?.targetId).toBe(target.id);
      return;
    }
    throw new Error('no seed where the target failed the Color Spray save');
  });

  it('cast: a target that succeeds takes no condition', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const caster = buildWizard();
      const target = buildTarget(20); // CON 20 -> +5, mostly succeeds
      const campaign = seedCast(engine, `cs-pass-${seed}`, caster, target);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: caster.id, spellId: 'color-spray', slotLevel: 1, targetIds: [target.id],
      });
      const save = events.find(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && (e as SaveRolledEvent).targetId === target.id,
      );
      if (save?.success !== true) continue;
      expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'color-sprayed-blinded-active')).toBe(false);
      return;
    }
    throw new Error('no seed where the target succeeded the Color Spray save');
  });
});
