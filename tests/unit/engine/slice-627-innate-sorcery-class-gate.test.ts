// Slice 627: Innate Sorcery's "Advantage on attack rolls of Sorcerer
// spells you cast" now gates on the spell's casting class, not just
// "any spell" while active. Closes the slice-623 RAW deviation.
//
// RAW 2024 Sorcerer L1 Innate Sorcery: "You have Advantage on the
// attack rolls of *Sorcerer* spells you cast." Slice 623 added the
// SetAdvantage effect unconditionally; the RAW gate is one of three
// arms (the others, +1 spell save DC and the L7+ Sorcery Incarnate
// metamagic doubling, were also class-scoped in RAW but the DC arm
// is left unconditional because computeSpellSaveDC doesn't yet
// thread a per-event casting class).
//
// Fix: new `event.spellCastingClassId` fact threaded from
// findCastingClassForSpell into casterAttackFacts. The
// innate-sorcery-active condition's SetAdvantage now gates on
// `event.spellCastingClassId === 'sorcerer'`.
//
// Invisible at pure L1 (a single-class sorcerer's cast always resolves
// to sorcerer); surfaces at multiclass (a sorcerer/wizard casting a
// wizard-only spell should NOT get the advantage).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Borc', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
  });

const applyInnateSorcery = (targetId: string) => ({
  id: eventId(), at: isoTimestamp(), type: 'ConditionApplied' as const,
  targetId: targetId as never, conditionId: 'innate-sorcery-active',
  appliedConditionId: newAppliedConditionId(),
});

const attackRoll = (events: ReadonlyArray<Event>): AttackRolledEvent | undefined =>
  events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;

describe('slice 627: Innate Sorcery advantage gates on spellCastingClassId === sorcerer', () => {
  it('single-class sorcerer with Innate Sorcery active gets advantage on Fire Bolt (sorcerer list)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const alyx = CharacterSchema.parse({
      id: newCharacterId(), name: 'Alyx', speciesId: 'human', backgroundId: 'sage',
      classes: [{ classId: 'sorcerer', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
      hp: { current: 8, max: 8, temp: 0 },
      knownSpells: ['fire-bolt'],
      preparedSpells: ['fire-bolt'],
    });
    const borc = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'slice-627-single' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
      applyInnateSorcery(alyx.id),
    ]);
    const result = engine.plan.castSpell(campaign.state, {
      characterId: alyx.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [borc.id],
    });
    const ar = attackRoll(result.events);
    expect(ar, 'fire-bolt emits AttackRolled').toBeDefined();
    expect(ar!.d20.length, 'single-class sorcerer keeps the Innate Sorcery advantage on a sorcerer-list spell').toBe(2);
    expect(ar!.used).toBe('advantage');
  });

  it('multiclass sorcerer/wizard with Innate Sorcery active does NOT get advantage on Acid Arrow (wizard-only)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    // Sorcerer L1 + Wizard L2 = combined caster level 3 = 4 L1 slots
    // + 2 L2 slots (per multiclass spellcasting table). Acid Arrow's
    // class list is ["wizard"] (verified in pack);
    // findCastingClassForSpell resolves the casting class by walking
    // character.classes in order against spell.classes, so we MUST
    // put sorcerer first to verify the gate doesn't just take the
    // first class -- it correctly resolves to wizard because acid
    // arrow isn't on the sorcerer list.
    const alyx = CharacterSchema.parse({
      id: newCharacterId(), name: 'Alyx', speciesId: 'human', backgroundId: 'sage',
      classes: [
        { classId: 'sorcerer', level: 1, hitDiceRemaining: 1 },
        { classId: 'wizard', level: 2, hitDiceRemaining: 2 },
      ],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 14, WIS: 10, CHA: 16 },
      hp: { current: 20, max: 20, temp: 0 },
      knownSpells: ['acid-arrow'],
      preparedSpells: ['acid-arrow'],
    });
    const borc = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'slice-627-multi-wizard' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
      applyInnateSorcery(alyx.id),
    ]);
    // Explicitly route the cast through Wizard (since acid-arrow is on
    // the wizard list, not sorcerer). The intent's castingClassId
    // override beats the default "first spellcasting class" picked by
    // findCastingClass. A future deeper fix to findCastingClass should
    // pick the wizard automatically; until then, callers pin it via
    // the intent.
    const result = engine.plan.castSpell(campaign.state, {
      characterId: alyx.id, spellId: 'acid-arrow', slotLevel: 2, targetIds: [borc.id],
      castingClassId: 'wizard',
    });
    const ar = attackRoll(result.events);
    expect(ar, 'acid-arrow emits AttackRolled').toBeDefined();
    expect(
      ar!.d20.length,
      'multiclass sorcerer/wizard casting a wizard-only spell does NOT get the Innate Sorcery advantage (event.spellCastingClassId === "wizard")',
    ).toBe(1);
    expect(ar!.used).toBe('none');
  });

  it('multiclass sorcerer/wizard with Innate Sorcery active DOES get advantage on Chromatic Orb (shared list, resolves to sorcerer first)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const alyx = CharacterSchema.parse({
      id: newCharacterId(), name: 'Alyx', speciesId: 'human', backgroundId: 'sage',
      classes: [
        { classId: 'sorcerer', level: 1, hitDiceRemaining: 1 },
        { classId: 'wizard', level: 1, hitDiceRemaining: 1 },
      ],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 14, WIS: 10, CHA: 16 },
      hp: { current: 14, max: 14, temp: 0 },
      knownSpells: ['chromatic-orb'],
      preparedSpells: ['chromatic-orb'],
    });
    const borc = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'slice-627-multi-shared' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
      applyInnateSorcery(alyx.id),
    ]);
    const result = engine.plan.castSpell(campaign.state, {
      characterId: alyx.id, spellId: 'chromatic-orb', slotLevel: 1, targetIds: [borc.id],
      casterChoice: { kind: 'damageType', value: 'fire' },
    });
    const ar = attackRoll(result.events);
    expect(ar!.d20.length, 'sorcerer-list spell still gets the advantage').toBe(2);
    expect(ar!.used).toBe('advantage');
  });
});
