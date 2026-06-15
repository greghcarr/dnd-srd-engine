// Slice 870 — Compulsion (L4): multi-target WIS save -> Charmed
// (Concentration). Closes the L7 audit Area-2 row `l4-compulsion`
// ("WIS save -> forced move each turn; nothing emitted").
//
// RAW (SRD 5.2.1 Compulsion, Bard): "Each creature of your choice that you
// can see within range must succeed on a Wisdom saving throw or have the
// Charmed condition until the spell ends. For the duration, you can take a
// Bonus Action to designate a direction ... Each Charmed target must use as
// much of its movement as possible to move in that direction on its next
// turn ... After moving in this way, a target repeats the save, ending the
// spell on itself on a success." (Concentration, up to 1 minute.)
//
// Wiring (reuses shipped primitives, no engine change): multi-target
// `{ save WIS, conditionOnFail: 'charmed' }`, concentration-bound. Reuses the
// SHARED Charmed condition, so the slice-807 can't-attack-the-charmer / social
// -Advantage arms apply. The Bonus-Action forced-movement direction and its
// coupled "re-save after moving" are one positional/consumer arm (deferred,
// like Dominate Beast's telepathic control).

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
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

// A level-7 Bard (one 4th-level slot), CHA 18 -> spell save DC 8 + 3 + 4 = 15.
const buildBard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'bard', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 44, max: 44, temp: 0 },
    knownSpells: ['compulsion'],
    preparedSpells: ['compulsion'],
  });

// A low-WIS Humanoid that tends to fail.
const buildVictim = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 6, CHA: 10 },
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

describe('Compulsion (slice 870)', () => {
  it('wires a WIS save -> charmed mechanic', () => {
    const mech = PACK.spells.find((s) => s.id === 'compulsion')?.mechanicalEffects?.[0] as
      | { kind: string; ability?: string; conditionOnFail?: string }
      | undefined;
    expect(mech?.kind).toBe('save');
    expect(mech?.ability).toBe('WIS');
    expect(mech?.conditionOnFail).toBe('charmed');
  });

  it('rolls a WIS save per chosen target; a failed target is Charmed (concentration-bound, by the caster)', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const bard = buildBard();
      const a = buildVictim('Thug A');
      const b = buildVictim('Thug B');
      const campaign = seedParty(engine, `cmp-${seed}`, bard, a, b);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: bard.id,
        spellId: 'compulsion',
        slotLevel: 4,
        targetIds: [a.id, b.id],
      }).events;
      const saves = events.filter((e) => e.type === 'SaveRolled') as SaveRolledEvent[];
      expect(saves.length, 'one save per chosen target').toBe(2);
      expect(saves.every((s) => s.ability === 'WIS' && s.dc === 15)).toBe(true);
      const failed = saves.filter((s) => !s.success).map((s) => s.targetId);
      const charms = events.filter(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'charmed',
      ) as ConditionAppliedEvent[];
      // Exactly the failed targets are Charmed, sourced to the bard + bound to
      // the caster's Concentration (so the spell ends -> the charm lifts).
      expect(charms.map((c) => c.targetId).sort()).toEqual([...failed].sort());
      if (charms.length === 0) continue; // want at least one fail to assert the binding
      for (const charm of charms) {
        expect(charm.sourceCharacterId).toBe(bard.id);
        expect((charm as { sourceEffectInstanceId?: string }).sourceEffectInstanceId, 'concentration link').toBeDefined();
      }
      return;
    }
    throw new Error('no seed produced a failed save across 40 tries');
  });

  it('a target that succeeds on the WIS save is not Charmed', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const bard = buildBard();
      const a = buildVictim('Thug A');
      const campaign = seedParty(engine, `cmp-pass-${seed}`, bard, a);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: bard.id,
        spellId: 'compulsion',
        slotLevel: 4,
        targetIds: [a.id],
      }).events;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save?.success !== true) continue; // need a success seed
      expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
      return;
    }
    throw new Error('no successful-save seed across 60 tries');
  });
});
