// Slice 457: Wizard L1 Ritual Adept.
//
// RAW (SRD 5.2.1 Wizard L1 Ritual Adept): "You can cast any spell as a
// Ritual if that spell has the Ritual tag and the spell is in your
// spellbook. You needn't have the spell prepared, but you must read
// from the book to cast a spell in this way."
//
// The engine's `characterKnowsSpell` (cast-spell.ts) returns true for
// either `knownSpells` (the wizard's spellbook) or `preparedSpells`, so
// the asRitual path already accepts a spellbook-only spell for a
// wizard. Slice 457 added a discoverable `Custom { handlerId:
// 'ritual-adept' }` marker; slice 505 promoted it to a real
// `GrantRitualAdept` marker effect (observable in the effect stack via
// `hasRitualAdept()`). This file's third case below was updated to the
// new shape; the cast scenarios stay as regression targets.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

const buildWizard = (knownRitual: boolean): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vanya',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    // detect-magic is in the spellbook (knownSpells) but NOT prepared.
    // RAW (Ritual Adept): can still be cast as a ritual. Engine
    // permits via the characterKnowsSpell shared check.
    knownSpells: knownRitual ? ['detect-magic'] : [],
    preparedSpells: [],
  });

describe('Wizard Ritual Adept (slice 457)', () => {
  it('L1 wizard casts a ritual-tagged spell in spellbook (knownSpells, not prepared) as a ritual: no slot consumed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const wizard = buildWizard(true);
    let campaign = engine.createCampaign({ name: 'ritual-adept' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    const before = campaign.state.characters[wizard.id]!.spellSlotsUsed['1'] ?? 0;
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'detect-magic',
      slotLevel: 1,
      targetIds: [],
      asRitual: true,
    });
    expect(events.some((e) => e.type === 'SpellCastDeclared')).toBe(true);
    expect(events.some((e) => e.type === 'SpellSlotConsumed')).toBe(false);
    campaign = commit(campaign, events);
    const after = campaign.state.characters[wizard.id]!.spellSlotsUsed['1'] ?? 0;
    expect(after).toBe(before);
  });

  it('Wizard who does not know detect-magic cannot cast it (control: ritual gate still requires the spell be known)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const wizard = buildWizard(false);
    let campaign = engine.createCampaign({ name: 'unknown-ritual' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'detect-magic',
        slotLevel: 1,
        targetIds: [],
        asRitual: true,
      }),
    ).toThrow();
  });

  it('Wizard L1 carries the ritual-adept Custom marker on their effect stack (discoverable signal)', () => {
    // The marker is the documentation surface; engine permits the
    // mechanic by default, but consumers (sheet builders, AI / UI
    // copilots) can find Ritual Adept by inspecting features.
    const wizClass = PACK.classes.find((c) => c.id === 'wizard');
    expect(wizClass).toBeDefined();
    const l1Features = wizClass!.levelTable['1']!.features;
    const ritualAdept = l1Features.find((f) => f.id === 'ritual-adept');
    expect(ritualAdept).toBeDefined();
    expect(ritualAdept!.effects).toEqual([
      { kind: 'GrantRitualAdept' },
    ]);
  });
});
