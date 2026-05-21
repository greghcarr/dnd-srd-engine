// Slice 359 - Evoker L10 Empowered Evocation.
//
// RAW 2024: whenever you cast a Wizard spell from the Evocation school,
// you can add your Intelligence modifier to one damage roll of that spell.
// Modeled as a passive `AddModifier { target: 'damage' }` gated on the new
// `event.spellSchool` fact (== 'evocation'), folded once into the shared
// damage roll in cast-spell (so AoE saves get the bonus once, applied to
// every target via the full/half split, honoring "one damage roll").
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const INT_MODIFIER = 5; // INT 20 -> +5

const buildWizard = (subclass: string | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: subclass === 'evoker' ? 'Evoker' : 'Plain Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 10, hitDiceRemaining: 10, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 20, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
    preparedSpells: ['fireball', 'blight'],
  });

// Save DC is 8 + INT(+5) + proficiency(+4 at L10) = 17. A target with -5
// in every save ability can roll at most 15, so it always fails and takes
// full damage, making the +INT bonus an exact, deterministic delta.
const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Foe',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    hp: { current: 400, max: 400, temp: 0 },
  });

const totalDamage = (events: ReadonlyArray<Event>): number =>
  events
    .filter((e): e is DamageAppliedEvent => e.type === 'DamageApplied')
    .flatMap((e) => e.components)
    .reduce((s, c) => s + c.amount, 0);

const castDamage = (caster: Character, spellId: string, slotLevel: number): number => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: 'ee' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.castSpell(campaign.state, {
    characterId: caster.id,
    spellId,
    slotLevel,
    targetIds: [target.id],
  }).events as ReadonlyArray<Event>;
  return totalDamage(events);
};

describe('slice 359: Empowered Evocation', () => {
  it('adds the INT modifier once to an Evocation spell (Fireball) on a failed save', () => {
    const evoker = castDamage(buildWizard('evoker'), 'fireball', 3);
    const plain = castDamage(buildWizard(null), 'fireball', 3);
    expect(evoker).toBe(plain + INT_MODIFIER);
  });

  it('does not apply to a non-Evocation spell (Blight, necromancy)', () => {
    const evoker = castDamage(buildWizard('evoker'), 'blight', 4);
    const plain = castDamage(buildWizard(null), 'blight', 4);
    expect(evoker).toBe(plain);
  });
});
