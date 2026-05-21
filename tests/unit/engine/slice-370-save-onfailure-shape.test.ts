// Slice 370 - Sacred Flame / Burning Hands / Thunderwave dealt zero damage.
//
// Bug (found sweeping wired-mechanic semantic drift): these three save
// spells were authored with an `onFailure: { damageDice }` + `onSuccess:
// 'half'` shape that `SpellSaveMechanicSchema` does not have, so Zod
// silently stripped both fields, leaving the mechanic as { kind: 'save',
// ability } with no damage. cast-spell only reads top-level `damageDice`,
// so casting them emitted a SaveRolled but no DamageApplied. The
// SRD-drift audit missed it because it reads the raw authored
// `onFailure.damageDice` (which matched SRD), and the coverage test's
// `save` expectation only requires a SaveRolled.
//
// Fix: converted the three to the supported `damageDice` / `damageType` /
// `halfOnSuccess` shape (Thunderwave's 10-ft push now uses the supported
// `pushedFeetOnFail`), and made SpellSaveMechanicSchema `.strict()` so a
// future phantom field fails to parse loudly instead of being dropped.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { SpellMechanicSchema } from '../../../src/schemas/content/spell.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Caster', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 18, WIS: 14, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    preparedSpells: ['sacred-flame', 'burning-hands', 'thunderwave'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 1, CON: 1, INT: 10, WIS: 1, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const cast = (spellId: string, slotLevel: number): ReadonlyArray<Event> => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
  const caster = buildCaster();
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: spellId });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return engine.plan.castSpell(campaign.state, {
    characterId: caster.id, spellId, slotLevel, targetIds: [target.id],
  }).events as ReadonlyArray<Event>;
};

const hasDamage = (events: ReadonlyArray<Event>) => events.some((e) => e.type === 'DamageApplied');

describe('slice 370: save spells with the onFailure shape now deal damage', () => {
  it('Sacred Flame, Burning Hands, and Thunderwave each emit DamageApplied on cast', () => {
    expect(hasDamage(cast('sacred-flame', 0))).toBe(true);
    expect(hasDamage(cast('burning-hands', 1))).toBe(true);
    expect(hasDamage(cast('thunderwave', 1))).toBe(true);
  });

  it('Thunderwave emits the 10-ft push (CreaturePushed) on a failed save', () => {
    expect(cast('thunderwave', 1).some((e) => e.type === 'CreaturePushed')).toBe(true);
  });

  it('the resolved mechanics carry top-level damage (not a stripped onFailure)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    for (const id of ['sacred-flame', 'burning-hands', 'thunderwave']) {
      const me = engine.content.spells.get(id)?.mechanicalEffects?.[0] as { damageDice?: string } | undefined;
      expect(me?.damageDice, `${id} should carry a top-level damageDice`).toBeDefined();
    }
  });

  it('SpellSaveMechanicSchema rejects a phantom field (the .strict() guard)', () => {
    // The exact shape that silently broke the three spells must now fail.
    const phantom = SpellMechanicSchema.safeParse({
      kind: 'save',
      ability: 'DEX',
      onFailure: { damageDice: '3d6', damageType: 'fire' },
      onSuccess: 'half',
    });
    expect(phantom.success).toBe(false);
    // A well-formed save mechanic still parses.
    expect(
      SpellMechanicSchema.safeParse({ kind: 'save', ability: 'DEX', damageDice: '3d6', damageType: 'fire', halfOnSuccess: true }).success,
    ).toBe(true);
  });
});
