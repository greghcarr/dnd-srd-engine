// Slice 507: Floating Disk (L1 Wizard) - the last L1 spell formerly
// classified as "deferred" reclassified as consumer-side narrative.
//
// RAW (SRD 5.2.1 Floating Disk, L1 Wizard Conjuration, Action or Ritual,
// 30ft range, 1 hour, NOT concentration, IS ritual): "This spell creates
// a circular, horizontal plane of force, 3 feet in diameter and 1 inch
// thick, that floats 3 feet above the ground... The disk remains for the
// duration and can hold up to 500 pounds. If more weight is placed on
// it, the spell ends... The disk is immobile while you are within 20
// feet of it. If you move more than 20 feet away from it, the disk
// follows you so that it remains within 20 feet of you."
//
// The CAST itself works through planCastSpell — Action consumes a slot,
// Ritual doesn't, neither emits mechanical effects (mechanicalEffects:
// []). The DISK is a positional carry-capacity world entity the engine
// explicitly doesn't model (consistent with the "engine doesn't model
// positions" stance). This test locks the cast behavior; the disk's
// 500-lb capacity, follow-the-caster, 10-ft elevation gate, and
// fall-off-when-overloaded behavior are documented consumer-side.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: ['floating-disk'],
    preparedSpells: ['floating-disk'],
  });

const setup = () => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(507) });
  const wizard = buildWizard();
  let campaign: Campaign = engine.createCampaign({ name: 'floating-disk' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, wizard };
};

describe('Floating Disk (slice 507)', () => {
  it('ships with empty mechanicalEffects (the disk is a consumer-side world entity)', () => {
    const s = PACK.spells.find((sp) => sp.id === 'floating-disk');
    expect(s).toBeDefined();
    expect(s?.mechanicalEffects).toEqual([]);
    expect(s?.ritual).toBe(true);
    expect(s?.concentration).toBe(false);
  });

  it('cast as an Action consumes a spell slot and emits no mechanical events', () => {
    const { engine, campaign, wizard } = setup();
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'floating-disk',
      slotLevel: 1,
      targetIds: [],
    }).events;
    const types = events.map((e) => e.type);
    expect(types).toContain('SpellCastDeclared');
    expect(types).toContain('SpellSlotConsumed');
    // No mechanicalEffects -> no downstream effect events.
    expect(types).not.toContain('ConcentrationStarted');
    expect(types).not.toContain('DamageApplied');
    expect(types).not.toContain('SaveRolled');
    expect(types).not.toContain('AttackRolled');
    expect(types).not.toContain('ConditionApplied');
  });

  it('cast as a Ritual does NOT consume a slot (and still emits no mechanical events)', () => {
    const { engine, campaign, wizard } = setup();
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'floating-disk',
      slotLevel: 1,
      targetIds: [],
      asRitual: true,
    }).events;
    const types = events.map((e) => e.type);
    expect(types).toContain('SpellCastDeclared');
    expect(types).not.toContain('SpellSlotConsumed');
    expect(types).not.toContain('ConcentrationStarted');
  });
});
