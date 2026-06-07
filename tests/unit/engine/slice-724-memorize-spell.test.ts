// Slice 724: Wizard L5 Memorize Spell.
//
// SRD 5.2.1: "Whenever you finish a Short Rest, you can study your
// spellbook and replace one of the level 1+ Wizard spells you have
// prepared with another level 1+ spell from the book." The engine doesn't
// enforce prepared-spell counts, so this is the mechanical one-for-one
// swap (validated per RAW); the short-rest timing is consumer-driven.

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
const ENGINE = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });

const SPELLBOOK = ['fire-bolt', 'magic-missile', 'shield', 'mage-armor', 'fireball'];

const buildWizard = (level: number, prepared: string[]): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
    knownSpells: SPELLBOOK,
    preparedSpells: prepared,
  });

const seed = (character: Character): Campaign =>
  commit(ENGINE.createCampaign({ name: 'memorize' }), [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);

const prepared = (campaign: Campaign, id: string): readonly string[] =>
  campaign.state.characters[id]!.preparedSpells;

describe('slice 724: Wizard Memorize Spell (L5)', () => {
  it('swaps one prepared level-1+ spell for a spellbook spell', () => {
    const wiz = buildWizard(5, ['magic-missile', 'shield']);
    let campaign = seed(wiz);
    campaign = commit(campaign, ENGINE.plan.memorizeSpell(campaign.state, {
      wizardId: wiz.id, removeSpellId: 'magic-missile', addSpellId: 'mage-armor',
    }).events);
    expect(prepared(campaign, wiz.id)).not.toContain('magic-missile');
    expect(prepared(campaign, wiz.id)).toContain('mage-armor');
    expect(prepared(campaign, wiz.id)).toContain('shield'); // untouched
  });

  it('rejects swapping out a spell that is not prepared', () => {
    const wiz = buildWizard(5, ['shield']);
    const campaign = seed(wiz);
    expect(() =>
      ENGINE.plan.memorizeSpell(campaign.state, { wizardId: wiz.id, removeSpellId: 'magic-missile', addSpellId: 'mage-armor' }),
    ).toThrow(/does not have magic-missile prepared/);
  });

  it('rejects adding a spell not in the spellbook', () => {
    const wiz = buildWizard(5, ['magic-missile']);
    const campaign = seed(wiz);
    expect(() =>
      ENGINE.plan.memorizeSpell(campaign.state, { wizardId: wiz.id, removeSpellId: 'magic-missile', addSpellId: 'counterspell' }),
    ).toThrow(/spellbook/);
  });

  it('rejects adding an already-prepared spell', () => {
    const wiz = buildWizard(5, ['magic-missile', 'shield']);
    const campaign = seed(wiz);
    expect(() =>
      ENGINE.plan.memorizeSpell(campaign.state, { wizardId: wiz.id, removeSpellId: 'magic-missile', addSpellId: 'shield' }),
    ).toThrow(/already has shield prepared/);
  });

  it('rejects swapping a cantrip (level 1+ only)', () => {
    const wiz = buildWizard(5, ['fire-bolt', 'magic-missile']);
    const campaign = seed(wiz);
    expect(() =>
      ENGINE.plan.memorizeSpell(campaign.state, { wizardId: wiz.id, removeSpellId: 'fire-bolt', addSpellId: 'mage-armor' }),
    ).toThrow(/level-1\+/);
  });

  it('a Wizard below level 5 does not have Memorize Spell', () => {
    const wiz = buildWizard(4, ['magic-missile']);
    const campaign = seed(wiz);
    expect(() =>
      ENGINE.plan.memorizeSpell(campaign.state, { wizardId: wiz.id, removeSpellId: 'magic-missile', addSpellId: 'mage-armor' }),
    ).toThrow(/requires Wizard level 5/);
  });
});
