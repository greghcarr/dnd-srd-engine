// Slice 505: Wizard L1 Ritual Adept - effect-stack marker + canonical
// cast scenario.
//
// RAW (Wizard L1 Ritual Adept): "You can cast any spell as a Ritual if
// that spell has the Ritual tag and the spell is in your spellbook. You
// needn't have the spell prepared, but you must read from the book to
// cast a spell in this way."
//
// The underlying cast behavior has been functional since the cast
// pathway shipped: `intent.asRitual: true` already requires the `ritual`
// tag, skips slot consumption, and skips action-economy consumption;
// `characterKnowsSpell` accepts `knownSpells` (the wizard's spellbook)
// alone. Slice 505 replaces the misleading `Custom { handlerId:
// 'ritual-adept' }` content stub on the Wizard L1 feature with a real
// `GrantRitualAdept` marker effect (mirror of GrantPotentCantrip /
// GrantEvasion) so the wire is observable in the effect stack and
// available to a future RAW-tightening slice.
//
// Documented RAW deviation: the cast pathway does NOT yet gate
// `asRitual` strictly on a ritual-casting class feature; any character
// with the spell in `knownSpells`/`preparedSpells` can ritually cast.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildWizard = (knownSpells: string[], preparedSpells: string[] = []): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells,
    preparedSpells,
  });

const buildFighter = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Fighter',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

describe('Ritual Adept (slice 505)', () => {
  it("the Wizard L1 ritual-adept feature ships GrantRitualAdept (no longer a Custom-handler stub)", () => {
    const wizard = PACK.classes.find((c) => c.id === 'wizard')!;
    const ra = wizard.levelTable['1']!.features.find((f) => f.id === 'ritual-adept')!;
    expect(ra.effects).toEqual([{ kind: 'GrantRitualAdept' }]);
  });

  it("a Wizard's effect stack projects hasRitualAdept = true; a Fighter's does not", () => {
    const wiz = buildEffectStack({ character: buildWizard([]), content: CONTENT, itemInstances: {}, pendingChoices: {} });
    expect(wiz.hasRitualAdept()).toBe(true);
    const fighter = buildEffectStack({ character: buildFighter(), content: CONTENT, itemInstances: {}, pendingChoices: {} });
    expect(fighter.hasRitualAdept()).toBe(false);
  });

  it('a Wizard ritually casts an unprepared spellbook ritual without consuming a slot', () => {
    const wizard = buildWizard(['detect-magic'], []);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign: Campaign = engine.createCampaign({ name: 'ra' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'detect-magic',
      slotLevel: 1,
      targetIds: [],
      asRitual: true,
    }).events;
    const types = events.map((e) => e.type);
    expect(types).toContain('SpellCastDeclared');
    expect(types).not.toContain('SpellSlotConsumed');
  });

  it('a non-ritual spell still throws when cast asRitual (the ritual-tag gate stands)', () => {
    const wizard = buildWizard(['magic-missile'], []);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    let campaign: Campaign = engine.createCampaign({ name: 'ra-not-ritual' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'magic-missile',
        slotLevel: 1,
        targetIds: [wizard.id],
        asRitual: true,
      }),
    ).toThrow(/cannot be cast as a ritual/i);
  });
});
