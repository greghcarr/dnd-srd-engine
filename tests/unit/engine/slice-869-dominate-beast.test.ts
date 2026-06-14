// Slice 869 — Dominate Beast (L4): WIS save -> Charmed (Concentration),
// with a damage-triggered repeat save. Closes the L7 audit Area-2 row
// `l4-dominate-beast` ("WIS save -> control; no save/condition emitted").
//
// RAW (SRD 5.2.1 Dominate Beast): "One Beast you can see within range must
// succeed on a Wisdom saving throw or have the Charmed condition for the
// duration. ... Whenever the target takes damage, it repeats the save,
// ending the spell on itself on a success." (Concentration, up to 1 minute.)
//
// Wiring (reuses shipped primitives, no new condition):
//   - `targetCreatureType: 'Beast'` (slice 500) gates to Beasts.
//   - `conditionOnFail: 'charmed'` reuses the SHARED Charmed condition, so the
//     slice-807 arms (can't attack the charmer, social Advantage) apply.
//   - Concentration binds it (sourceEffectInstanceId), so it lifts on a drop.
//   - New `conditionRepeatsSaveOnDamage` (slice 869) stamps the slice-388
//     per-instance recurring save (WIS vs the caster's spell DC) on the
//     applied Charmed, so the consumer ticks `tickRecurringSave` on damage.
//
// Deferred (consumer/DM): the telepathic control link, the "Advantage on the
// save if you/allies are fighting it" arm, and the upcast longer durations.
//
// Pattern-check: Dominate Person (L5) and Dominate Monster (L8) carry the
// identical RAW "repeats the save on damage" clause; the flag is applied to
// all three.

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
import type { ConditionAppliedEvent, ConditionRemovedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

// A level-7 Druid (one 4th-level slot), WIS 18 -> spell save DC 8 + 3 + 4 = 15.
const buildDruid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Druid',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 49, max: 49, temp: 0 },
    knownSpells: ['dominate-beast'],
    preparedSpells: ['dominate-beast'],
  });

// A Beast (wolf statblock), low WIS so it tends to fail.
const buildWolf = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Wolf',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'wolf',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 15, CON: 12, INT: 3, WIS: 7, CHA: 6 },
    hp: { current: 11, max: 11, temp: 0 },
  });

// A Humanoid (not a Beast) — skipped by the Beast filter.
const buildHumanoid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bandit',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 11, max: 11, temp: 0 },
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

describe('Dominate Beast (slice 869)', () => {
  it('all three Dominate spells wire WIS-save -> charmed with a damage re-save', () => {
    for (const id of ['dominate-beast', 'dominate-person', 'dominate-monster']) {
      const mech = PACK.spells.find((s) => s.id === id)?.mechanicalEffects?.[0] as
        | { kind: string; ability?: string; conditionOnFail?: string; conditionRepeatsSaveOnDamage?: boolean }
        | undefined;
      expect(mech?.kind, id).toBe('save');
      expect(mech?.ability, id).toBe('WIS');
      expect(mech?.conditionOnFail, id).toBe('charmed');
      expect(mech?.conditionRepeatsSaveOnDamage, id).toBe(true);
    }
    // Dominate Beast is additionally gated to Beast targets.
    const beast = PACK.spells.find((s) => s.id === 'dominate-beast')?.mechanicalEffects?.[0] as
      | { targetCreatureType?: string }
      | undefined;
    expect(beast?.targetCreatureType).toBe('Beast');
  });

  it('a Beast that fails the WIS save is Charmed, concentration-bound, with a stamped re-save', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const druid = buildDruid();
      const wolf = buildWolf();
      const campaign = seedParty(engine, `db-${seed}`, druid, wolf);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'dominate-beast',
        slotLevel: 4,
        targetIds: [wolf.id],
      }).events;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(save, 'a Beast target rolls a save').toBeDefined();
      expect(save?.ability).toBe('WIS');
      expect(save?.dc).toBe(15);
      if (save?.success === true) continue; // need a failed seed for the charm assertion
      const charm = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'charmed',
      ) as (ConditionAppliedEvent & { recurringSaveDC?: number; recurringSaveAbility?: string; sourceEffectInstanceId?: string }) | undefined;
      expect(charm, 'failed save applies Charmed').toBeDefined();
      expect(charm?.targetId).toBe(wolf.id);
      expect(charm?.sourceCharacterId).toBe(druid.id);
      // Concentration binding + the per-instance damage re-save (WIS vs DC 15).
      expect(charm?.sourceEffectInstanceId, 'concentration link').toBeDefined();
      expect(charm?.recurringSaveAbility).toBe('WIS');
      expect(charm?.recurringSaveDC).toBe(15);
      return;
    }
    throw new Error('no failed-save seed across 40 tries');
  });

  it('a non-Beast (Humanoid) target is skipped entirely — no save, no charm', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const druid = buildDruid();
    const bandit = buildHumanoid();
    const campaign = seedParty(engine, 'db-humanoid', druid, bandit);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: druid.id,
      spellId: 'dominate-beast',
      slotLevel: 4,
      targetIds: [bandit.id],
    }).events;
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
  });

  it('the damage-triggered re-save (ticked) ends the charm on a success', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const druid = buildDruid();
      const wolf = buildWolf();
      let campaign = seedParty(engine, `db-tick-${seed}`, druid, wolf);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'dominate-beast',
        slotLevel: 4,
        targetIds: [wolf.id],
      }).events;
      const charmed = cast.some(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'charmed',
      );
      if (!charmed) continue; // need the wolf charmed first
      campaign = commit(campaign, cast);
      // Tick the per-instance re-save (RAW: fired when the bearer takes damage).
      const tick = engine.plan.tickRecurringSave(campaign.state, {
        targetId: wolf.id,
        conditionId: 'charmed',
      }).events;
      const tickSave = tick.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(tickSave, 'tick rolls a save').toBeDefined();
      expect(tickSave?.ability).toBe('WIS');
      expect(tickSave?.dc).toBe(15);
      if (tickSave?.success !== true) continue; // need a successful re-save to see the removal
      const removed = tick.find(
        (e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'charmed',
      );
      expect(removed, 'a successful re-save ends the charm').toBeDefined();
      return;
    }
    throw new Error('no seed produced a charmed wolf then a successful re-save');
  });
});
