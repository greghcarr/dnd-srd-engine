// Slice 383 - Evoker L3 Potent Cantrip.
//
// RAW: "When you cast a cantrip at a creature and you miss with the attack
// roll or the target succeeds on a saving throw against the cantrip, the
// target takes half the cantrip's damage (if any) but suffers no
// additional effect." Wired via the new GrantPotentCantrip marker, read
// by cast-spell on the caster's effect stack: a missed attack cantrip and
// a succeeded-save cantrip both deal half damage. A non-Evoker caster is
// unaffected (a miss / successful save deals nothing).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildWizard = (subclassId: string | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Mage', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5, ...(subclassId !== null ? { subclassId } : {}) }],
    abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 32, max: 32, temp: 0 },
    preparedSpells: ['fire-bolt', 'sacred-flame'],
  });

const buildTarget = (ac: number, dex: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: dex, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 80, max: 80, temp: 0 }, armorClass: ac,
  });

const seedCampaign = (caster: Character, target: Character, seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'potent' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const sumComponents = (e: DamageAppliedEvent | undefined): number =>
  e?.components.reduce((s, c) => s + c.amount, 0) ?? 0;
const damageEvent = (events: ReadonlyArray<Event>) =>
  events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');

describe('slice 383: Potent Cantrip - missed attack cantrip deals half', () => {
  // A high-AC target makes Fire Bolt miss on most seeds; pick the first
  // seed where it misses and compare an Evoker against a plain wizard.
  const findMissSeed = (): number => {
    const caster = buildWizard('evoker');
    const target = buildTarget(30, 10);
    for (let seed = 1; seed < 80; seed += 1) {
      const { engine, campaign } = seedCampaign(caster, target, seed);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: caster.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [target.id],
      }).events as ReadonlyArray<Event>;
      const ar = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (ar?.hit === false) return seed;
    }
    throw new Error('no seed produced a Fire Bolt miss');
  };

  it('an Evoker deals half damage on a missed Fire Bolt; a plain wizard deals none', () => {
    const seed = findMissSeed();
    const target = buildTarget(30, 10);

    const evoker = buildWizard('evoker');
    const ev = seedCampaign(evoker, target, seed);
    const evEvents = ev.engine.plan.castSpell(ev.campaign.state, {
      characterId: evoker.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [target.id],
    }).events as ReadonlyArray<Event>;
    const rolled = evEvents.find((e): e is DamageRolledEvent => e.type === 'DamageRolled');
    const applied = damageEvent(evEvents);
    expect(applied, 'Evoker should deal damage even on a miss').toBeDefined();
    const rolledTotal = rolled!.rolls[0]!.rolls.reduce((s, v) => s + v, 0) + rolled!.rolls[0]!.modifier;
    expect(sumComponents(applied)).toBe(Math.floor(rolledTotal / 2)); // exactly half

    const plain = buildWizard(null);
    const pl = seedCampaign(plain, target, seed);
    const plEvents = pl.engine.plan.castSpell(pl.campaign.state, {
      characterId: plain.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [target.id],
    }).events as ReadonlyArray<Event>;
    expect(plEvents.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined).toMatchObject({ hit: false });
    expect(damageEvent(plEvents), 'a plain wizard deals no damage on a miss').toBeUndefined();
  });
});

describe('slice 383: Potent Cantrip - successful save cantrip deals half', () => {
  // A high-DEX target succeeds on Sacred Flame's DEX save on most seeds.
  const findSaveSuccessSeed = (): number => {
    const caster = buildWizard('evoker');
    const target = buildTarget(12, 20);
    for (let seed = 1; seed < 80; seed += 1) {
      const { engine, campaign } = seedCampaign(caster, target, seed);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: caster.id, spellId: 'sacred-flame', slotLevel: 0, targetIds: [target.id],
      }).events as ReadonlyArray<Event>;
      const sr = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (sr?.success === true) return seed;
    }
    throw new Error('no seed produced a Sacred Flame save success');
  };

  it('an Evoker deals half on a successful save; a plain wizard deals none (Sacred Flame has no half)', () => {
    const seed = findSaveSuccessSeed();
    const target = buildTarget(12, 20);

    const evoker = buildWizard('evoker');
    const ev = seedCampaign(evoker, target, seed);
    const evEvents = ev.engine.plan.castSpell(ev.campaign.state, {
      characterId: evoker.id, spellId: 'sacred-flame', slotLevel: 0, targetIds: [target.id],
    }).events as ReadonlyArray<Event>;
    expect((evEvents.find((e) => e.type === 'SaveRolled') as SaveRolledEvent).success).toBe(true);
    expect(sumComponents(damageEvent(evEvents)), 'Evoker deals half on a successful save').toBeGreaterThan(0);

    const plain = buildWizard(null);
    const pl = seedCampaign(plain, target, seed);
    const plEvents = pl.engine.plan.castSpell(pl.campaign.state, {
      characterId: plain.id, spellId: 'sacred-flame', slotLevel: 0, targetIds: [target.id],
    }).events as ReadonlyArray<Event>;
    expect((plEvents.find((e) => e.type === 'SaveRolled') as SaveRolledEvent).success).toBe(true);
    expect(damageEvent(plEvents), 'a plain wizard deals no damage on a successful Sacred Flame save').toBeUndefined();
  });
});
