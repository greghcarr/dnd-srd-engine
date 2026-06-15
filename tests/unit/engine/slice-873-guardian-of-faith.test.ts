// Slice 873 — Guardian of Faith (L4) + the aura damage-budget primitive.
// Closes the L7 audit Area-2 row `l4-guardian-of-faith` ("summoned guardian
// dealing 20 radiant (DEX half) to 60-total; nothing summoned").
//
// RAW (SRD 5.2.1 Guardian of Faith, Cleric): "Any enemy that moves to a space
// within 10 feet of the guardian for the first time on a turn or starts its
// turn there makes a Dexterity saving throw, taking 20 Radiant damage on a
// failed save or half as much on a success. The guardian vanishes when it has
// dealt a total of 60 damage." (Duration 8 hours — NOT Concentration.)
//
// The damage is an `aura-damage` tick (10-ft, DEX, 20 radiant, half) ticked via
// the slice-872 non-concentration path; the NEW primitive is the cumulative-
// damage budget: a `damageBudget` on the mechanic, held as
// `auraDamageBudgetRemaining` on the spell's EffectInstance (created at cast),
// decremented by `planTickAura` each tick (an `AuraDamageBudgetSpent` event),
// the guardian vanishing (a `ConcentrationBroken('used')` that deletes the
// effect) once it's exhausted. Positioning / invulnerability stay consumer-
// managed, as for every aura.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SpellEffectStartedEvent, AuraDamageBudgetSpentEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();

// A level-7 Cleric (one 4th-level slot), WIS 18 -> spell save DC 8 + 3 + 4 = 15.
const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Cleric',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 45, max: 45, temp: 0 },
    preparedSpells: ['guardian-of-faith'],
  });

// A low-DEX enemy with enough HP to survive the full 60-damage budget.
const buildEnemy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Intruder',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 6, CON: 16, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 120, max: 120, temp: 0 },
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

describe('Guardian of Faith + aura damage-budget (slice 873)', () => {
  it('wires a 10-ft DEX-save 20-radiant aura with a 60 damage budget', () => {
    const mech = PACK.spells.find((s) => s.id === 'guardian-of-faith')?.mechanicalEffects?.[0] as
      | { kind: string; saveAbility?: string; damageType?: string; halfOnSuccess?: boolean; damageBudget?: number }
      | undefined;
    expect(mech?.kind).toBe('aura-damage');
    expect(mech?.saveAbility).toBe('DEX');
    expect(mech?.damageType).toBe('radiant');
    expect(mech?.halfOnSuccess).toBe(true);
    expect(mech?.damageBudget).toBe(60);
  });

  it('cast claims no Concentration and seeds the budget on a SpellEffectStarted', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const cleric = buildCleric();
    const enemy = buildEnemy();
    let campaign = seedParty(engine, 'gof-cast', cleric, enemy);
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'guardian-of-faith', slotLevel: 4, targetIds: [cleric.id],
    }).events;
    expect(cast.some((e) => e.type === 'ConcentrationStarted')).toBe(false);
    const started = cast.find((e) => e.type === 'SpellEffectStarted') as SpellEffectStartedEvent | undefined;
    expect(started, 'a non-concentration SpellEffectStarted').toBeDefined();
    expect(started?.auraDamageBudgetRemaining).toBe(60);
    campaign = commit(campaign, cast);
    expect(campaign.state.characters[cleric.id]!.concentrationEffectId).toBeUndefined();
    expect(campaign.state.effectInstances[started!.effectInstanceId]!.auraDamageBudgetRemaining).toBe(60);
  });

  it('each tick deals DEX-save radiant and spends that much budget; the guardian vanishes at 60', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const cleric = buildCleric();
    const enemy = buildEnemy();
    let campaign = seedParty(engine, 'gof-tick', cleric, enemy);
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'guardian-of-faith', slotLevel: 4, targetIds: [cleric.id],
    }).events;
    const effectId = (cast.find((e) => e.type === 'SpellEffectStarted') as SpellEffectStartedEvent).effectInstanceId;
    campaign = commit(campaign, cast);

    let totalDealt = 0;
    let vanished = false;
    for (let i = 0; i < 20 && !vanished; i += 1) {
      const before = campaign.state.effectInstances[effectId]!.auraDamageBudgetRemaining!;
      const tick = engine.plan.tickAura(campaign.state, {
        casterId: cleric.id, targetIds: [enemy.id], effectInstanceId: effectId,
      }).events;
      const save = tick.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(save?.ability).toBe('DEX');
      expect(save?.dc).toBe(15);
      // The budget spent this tick equals the damage applied this tick.
      const dmg = tick.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
      const dmgTotal = dmg?.components.reduce((s, c) => s + c.amount, 0) ?? 0;
      const spent = tick.find((e) => e.type === 'AuraDamageBudgetSpent') as AuraDamageBudgetSpentEvent | undefined;
      expect(spent?.amount ?? 0).toBe(dmgTotal);
      expect(dmg?.components.every((c) => c.type === 'radiant') ?? true).toBe(true);
      totalDealt += spent?.amount ?? 0;
      if (tick.some((e) => e.type === 'ConcentrationBroken')) vanished = true;
      campaign = commit(campaign, tick);
      // Budget decremented by exactly the damage dealt (clamped at 0).
      const after = campaign.state.effectInstances[effectId]?.auraDamageBudgetRemaining;
      if (!vanished) expect(after).toBe(Math.max(0, before - (spent?.amount ?? 0)));
    }

    expect(vanished, 'the guardian vanished within its budget').toBe(true);
    expect(totalDealt).toBeGreaterThanOrEqual(60);
    // The guardian is gone — its EffectInstance was deleted.
    expect(campaign.state.effectInstances[effectId]).toBeUndefined();
  });
});
