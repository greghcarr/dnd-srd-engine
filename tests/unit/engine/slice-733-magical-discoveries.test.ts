// Slice 733: Bard College of Lore L6 — Magical Discoveries.
//
// SRD 5.2.1: "You learn two spells of your choice. These spells can come
// from the Cleric, Druid, or Wizard spell list or any combination thereof.
// A spell you choose must be a cantrip or a spell for which you have spell
// slots... You always have the chosen spells prepared."
//
// Wired as an OfferChoice (oneOf 2, onAcquire) whose options each grant a
// Cleric/Druid/Wizard spell `always-prepared` (the Pact of the Tome
// cross-list shape, slice 517). The cast path treats granted spells as
// known (effectiveSpellList), so a chosen Wizard spell casts as a Bard
// spell with the bard's CHA + slots.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildBard = (level: number, subclassId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'bard', level, hitDiceRemaining: level, ...(subclassId !== undefined ? { subclassId } : {}) }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 38, max: 38, temp: 0 },
    knownSpells: ['vicious-mockery'],
    preparedSpells: [],
  });

const buildFoe = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Foe',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    hp: { current: 400, max: 400, temp: 0 },
  });

describe('slice 733: Magical Discoveries (College of Lore L6)', () => {
  it('the lore L6 row carries the cross-list spell OfferChoice (oneOf 2, always-prepared)', () => {
    const lore = PACK.subclasses.find((s) => s.id === 'college-of-lore')!;
    const feature = lore.levelGrants['6']!.find((f) => f.id === 'magical-discoveries');
    expect(feature, 'college-of-lore L6 missing magical-discoveries').toBeDefined();
    const choice = (feature!.effects ?? []).find((e) => e.kind === 'OfferChoice') as
      | { kind: 'OfferChoice'; oneOf: number; options: ReadonlyArray<{ effects: ReadonlyArray<{ kind: string; preparation?: string }> }> }
      | undefined;
    expect(choice).toBeDefined();
    expect(choice!.oneOf).toBe(2);
    expect(choice!.options.length).toBeGreaterThanOrEqual(10);
    // Every option grants exactly one always-prepared spell.
    for (const opt of choice!.options) {
      expect(opt.effects).toHaveLength(1);
      expect(opt.effects[0]!.kind).toBe('GrantSpell');
      expect(opt.effects[0]!.preparation).toBe('always-prepared');
    }
  });

  it('a L5 lore bard is not offered Magical Discoveries yet', () => {
    const bard = buildBard(5, 'college-of-lore');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(733) });
    let campaign: Campaign = engine.createCampaign({ name: 'l5-lore' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
    ]);
    const offered = engine.plan.offerCharacterChoices(campaign.state, { characterId: bard.id }).events;
    const md = offered.find(
      (e): e is ChoiceRequiredEvent => e.type === 'ChoiceRequired' && (e as ChoiceRequiredEvent).promptKey === 'magical-discoveries',
    );
    expect(md).toBeUndefined();
  });

  it('a L6 lore bard is offered the choice; resolving it grants cross-list spells that cast as Bard spells', () => {
    const bard = buildBard(6, 'college-of-lore');
    const foe = buildFoe();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(733) });
    let campaign: Campaign = engine.createCampaign({ name: 'magical-discoveries' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: foe } satisfies CharacterCreatedEvent,
    ]);

    const offered = engine.plan.offerCharacterChoices(campaign.state, { characterId: bard.id }).events;
    campaign = commit(campaign, offered);

    const cr = offered.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && (e as ChoiceRequiredEvent).promptKey === 'magical-discoveries',
    );
    expect(cr, 'no Magical Discoveries ChoiceRequired offered at L6').toBeDefined();
    expect(cr!.oneOf).toBe(2);

    // Pick a Wizard spell (Fireball) and a Cleric spell (Spirit Guardians).
    const resolved = engine.plan.resolveChoice(campaign.state, {
      choiceId: cr!.choiceId,
      characterId: bard.id,
      selectedOptionIds: ['fireball', 'spirit-guardians'],
    }).events;
    campaign = commit(campaign, resolved);

    const acc = buildEffectStack({
      character: campaign.state.characters[bard.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells().map((g) => g.spellId);
    expect(granted).toContain('fireball');
    expect(granted).toContain('spirit-guardians');

    // The discovered Wizard spell casts as a Bard spell (bard CHA + a 3rd-
    // level bard slot at L6) — it deals damage to the foe.
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: bard.id,
      spellId: 'fireball',
      slotLevel: 3,
      targetIds: [foe.id],
    }).events;
    expect(castEvents.some((e) => e.type === 'DamageApplied')).toBe(true);
  });
});
