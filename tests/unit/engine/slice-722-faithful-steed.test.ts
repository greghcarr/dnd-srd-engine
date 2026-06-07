// Slice 722: Paladin L5 Faithful Steed.
//
// SRD 5.2.1: "You always have the Find Steed spell prepared. You can also
// cast the spell once without expending a spell slot, and you regain the
// ability to do so when you finish a Long Rest."
//
// Modeled as a single GrantSpell{ find-steed, oncePerLongRest, CHA } on
// the Paladin L5 feature: the grant puts Find Steed in the effective spell
// list (always prepared, castable with a slot) AND enables the
// once-per-Long-Rest free cast via the existing free-cast machinery.

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

const buildPaladin = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Paladin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 10, CHA: 16 },
    hp: { current: 40, max: 40, temp: 0 },
    // NOTE: find-steed is NOT in preparedSpells; it comes from the feature.
  });

const seed = (character: Character): Campaign =>
  commit(ENGINE.createCampaign({ name: 'faithful-steed' }), [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);

const types = (events: ReadonlyArray<{ type: string }>): string[] => events.map((e) => e.type);

describe('slice 722: Faithful Steed (Paladin L5)', () => {
  it('L5 paladin can free-cast Find Steed without a slot (always prepared + free cast)', () => {
    const pal = buildPaladin(5);
    const campaign = seed(pal);
    const events = ENGINE.plan.castSpell(campaign.state, {
      characterId: pal.id,
      spellId: 'find-steed',
      slotLevel: 2,
      targetIds: [],
      useFreeCast: true,
    }).events;
    expect(types(events)).toContain('CompanionSummoned'); // the steed is summoned
    expect(types(events)).toContain('FreeCastUsed'); // via the free cast
    expect(types(events)).not.toContain('SpellSlotConsumed'); // no slot spent
  });

  it('the free cast is once per Long Rest', () => {
    const pal = buildPaladin(5);
    let campaign = seed(pal);
    campaign = commit(campaign, ENGINE.plan.castSpell(campaign.state, {
      characterId: pal.id, spellId: 'find-steed', slotLevel: 2, targetIds: [], useFreeCast: true,
    }).events);
    // Second free cast before a long rest is blocked.
    expect(() =>
      ENGINE.plan.castSpell(campaign.state, {
        characterId: pal.id, spellId: 'find-steed', slotLevel: 2, targetIds: [], useFreeCast: true,
      }),
    ).toThrow();
    // After a long rest the free cast is available again.
    campaign = commit(campaign, ENGINE.plan.longRest(campaign.state, { participantIds: [pal.id] }).events);
    const after = ENGINE.plan.castSpell(campaign.state, {
      characterId: pal.id, spellId: 'find-steed', slotLevel: 2, targetIds: [], useFreeCast: true,
    }).events;
    expect(types(after)).toContain('FreeCastUsed');
  });

  it('Find Steed is also castable with a spell slot (always prepared)', () => {
    const pal = buildPaladin(5);
    const campaign = seed(pal);
    const events = ENGINE.plan.castSpell(campaign.state, {
      characterId: pal.id, spellId: 'find-steed', slotLevel: 2, targetIds: [],
    }).events;
    expect(types(events)).toContain('CompanionSummoned');
    expect(types(events)).toContain('SpellSlotConsumed'); // a 2nd-level slot
  });

  it('a Paladin below L5 does not have Find Steed (not granted)', () => {
    const pal = buildPaladin(4);
    const campaign = seed(pal);
    expect(() =>
      ENGINE.plan.castSpell(campaign.state, {
        characterId: pal.id, spellId: 'find-steed', slotLevel: 2, targetIds: [],
      }),
    ).toThrow();
  });
});
