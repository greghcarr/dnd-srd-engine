// Slice 872 — Faithful Hound (L4) + the non-concentration aura tick. Closes the
// L7 audit Area-2 row `l4-faithful-hound` ("invisible watchdog + 4d8 bite vs
// adjacent hostiles; nothing").
//
// RAW (SRD 5.2.1 Faithful Hound, Wizard): "At the start of each of your turns,
// the hound attempts to bite one enemy within 5 feet of it. That enemy must
// succeed on a Dexterity saving throw or take 4d8 Force damage." (Duration 8
// hours, NOT Concentration.)
//
// The bite is an `aura-damage` tick (5-ft range, DEX save, 4d8 Force, no half).
// The blocker was that `planTickAura` required the caster's concentration
// effect — Faithful Hound is non-concentration. Slice 872 lets `tickAura` tick
// a non-concentration aura by `spellId` directly (no effect instance; the
// hound's position / existence is consumer-managed, like every aura). The
// invisible-watchdog / bark-alarm / placement arms stay consumer/narrative.
//
// Pattern-check: Grease (L1) is the other non-concentration aura-damage spell —
// its tick was unusable for the same reason; it now ticks via the same path.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent, } from '../../../src/schemas/events/checks.js';
import type { DamageAppliedEvent, ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

// A level-7 Wizard (one 4th-level slot), INT 18 -> spell save DC 8 + 3 + 4 = 15.
const buildWizard = (spells: string[]): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 38, max: 38, temp: 0 },
    knownSpells: spells,
    preparedSpells: spells,
  });

const buildVictim = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Intruder',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 6, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const seedParty = (engine: ReturnType<typeof createEngine>, name: string, ...party: Character[]): Campaign => {
  let campaign = engine.createCampaign({ name });
  campaign = commit(
    campaign,
    party.map((c) => ({
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c,
    }) satisfies CharacterCreatedEvent),
  );
  return campaign;
};

describe('Faithful Hound + non-concentration aura tick (slice 872)', () => {
  it('wires the bite as a 5-ft DEX-save 4d8 Force aura-damage', () => {
    const mech = PACK.spells.find((s) => s.id === 'faithful-hound')?.mechanicalEffects?.[0] as
      | { kind: string; rangeFeet?: number; saveAbility?: string; damageDice?: string; damageType?: string; halfOnSuccess?: boolean }
      | undefined;
    expect(mech?.kind).toBe('aura-damage');
    expect(mech?.saveAbility).toBe('DEX');
    expect(mech?.damageDice).toBe('4d8');
    expect(mech?.damageType).toBe('force');
    expect(mech?.halfOnSuccess).toBe(false);
  });

  it('casting Faithful Hound claims no Concentration; the bite ticks by spellId', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const wizard = buildWizard(['faithful-hound']);
      const victim = buildVictim();
      let campaign = seedParty(engine, `fh-${seed}`, wizard, victim);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'faithful-hound',
        slotLevel: 4,
        targetIds: [wizard.id],
      }).events;
      // Non-concentration: no ConcentrationStarted, and the caster isn't tied up.
      expect(cast.some((e) => e.type === 'ConcentrationStarted')).toBe(false);
      campaign = commit(campaign, cast);
      expect(campaign.state.characters[wizard.id]!.concentrationEffectId).toBeUndefined();

      // The bite: tick by spellId (no concentration effect to read it from).
      const tick = engine.plan.tickAura(campaign.state, {
        casterId: wizard.id,
        targetIds: [victim.id],
        spellId: 'faithful-hound',
        slotLevel: 4,
      }).events;
      const save = tick.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(save, 'the bite rolls a DEX save').toBeDefined();
      expect(save?.ability).toBe('DEX');
      expect(save?.dc).toBe(15);
      if (save?.success !== false) continue; // need a failed save to see the damage
      const dmg = tick.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
      expect(dmg, 'a failed save takes 4d8 Force').toBeDefined();
      expect(dmg?.components.every((c) => c.type === 'force')).toBe(true);
      return;
    }
    throw new Error('no failed-save seed across 40 tries');
  });

  it('ticking without spellId still requires concentration (rejects a non-concentration caster)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const wizard = buildWizard(['faithful-hound']);
    const victim = buildVictim();
    const campaign = seedParty(engine, 'fh-noconc', wizard, victim);
    expect(() =>
      engine.plan.tickAura(campaign.state, { casterId: wizard.id, targetIds: [victim.id] }),
    ).toThrow(/concentration/i);
  });

  it('pattern-check: Grease (also non-concentration) ticks by spellId — DEX save or Prone', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const wizard = buildWizard(['grease']);
      const victim = buildVictim();
      let campaign = seedParty(engine, `grease-${seed}`, wizard, victim);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'grease',
        slotLevel: 1,
        targetIds: [wizard.id],
      }).events;
      campaign = commit(campaign, cast);
      const tick = engine.plan.tickAura(campaign.state, {
        casterId: wizard.id,
        targetIds: [victim.id],
        spellId: 'grease',
        slotLevel: 1,
      }).events;
      const save = tick.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(save?.ability).toBe('DEX');
      if (save?.success !== false) continue;
      const prone = tick.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'prone',
      );
      expect(prone, 'a failed save falls Prone').toBeDefined();
      return;
    }
    throw new Error('no failed-save seed across 40 tries');
  });
});
