// Unit test for Paladin L18 Aura Expansion.
//
// Pre-slice 211: the L18 entry re-declared `aura-of-protection` and
// `aura-of-courage` with `rangeFeet: 30`, riding the
// `dedupeFeaturesByLatestLevel` helper to replace the L6/L10 entries.
//
// Slice 211 swap: the L18 entry is now a separate feature
// `aura-expansion` that ships a single `ExpandAuraRange { addFeet: 20 }`.
// The L6 and L10 GrantAura entries continue to ship `rangeFeet: 10`;
// consumers (dndbnb, VTTs) compute the bearer's effective aura range
// as `GrantAura.rangeFeet + effects.auraRangeBonus()`. This keeps the
// aura definitions self-describing about their base range, lets
// future content (DMG magic items, etc.) compose additional aura
// bonuses, and aligns with the audit doc's "Aura Expansion" entry.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import {
  buildEffectStack,
  collectEffectsFromCharacter,
} from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const buildPaladin = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ariadne',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level, hitDiceRemaining: level }],
    abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 22 + level * 6, max: 22 + level * 6, temp: 0 },
    featsTaken: [],
  });

const PACK = loadStarterPack();

const findAura = (
  character: Character,
  auraId: string,
): { rangeFeet: number } | undefined => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const effects = collectEffectsFromCharacter({
    character,
    content: engine.content,
    itemInstances: {},
  });
  const aura = effects.find((e) => e.kind === 'GrantAura' && e.auraId === auraId);
  return aura?.kind === 'GrantAura' ? { rangeFeet: aura.rangeFeet } : undefined;
};

const buildAcc = (character: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  return buildEffectStack({
    character,
    content: engine.content,
    itemInstances: {},
  });
};

describe('Paladin L18 Aura Expansion (slice 211)', () => {
  it('L6 paladin has 10-ft Aura of Protection and 0 aura range bonus', () => {
    const character = buildPaladin(6);
    expect(findAura(character, 'aura-of-protection')?.rangeFeet).toBe(10);
    expect(buildAcc(character).auraRangeBonus()).toBe(0);
  });

  it('L10 paladin has 10-ft Aura of Courage and 0 aura range bonus', () => {
    const character = buildPaladin(10);
    expect(findAura(character, 'aura-of-courage')?.rangeFeet).toBe(10);
    expect(buildAcc(character).auraRangeBonus()).toBe(0);
  });

  it('L18 paladin: GrantAura entries still ship the 10-ft base; +20 ft bonus on the accumulator', () => {
    const character = buildPaladin(18);
    expect(findAura(character, 'aura-of-protection')?.rangeFeet).toBe(10);
    expect(findAura(character, 'aura-of-courage')?.rangeFeet).toBe(10);
    expect(buildAcc(character).auraRangeBonus()).toBe(20);
    // Consumer-side effective range: 10 + 20 = 30 ft for both auras.
  });

  it('L18 paladin retains the self-effects from L6 + L10 (CHA-mod saves + Frightened immunity)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const paladin = buildPaladin(18);
    let campaign = engine.createCampaign({ name: 'l18-paladin' });
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: paladin,
      } satisfies CharacterCreatedEvent,
    ]);
    const effects = collectEffectsFromCharacter({
      character: campaign.state.characters[paladin.id]!,
      content: engine.content,
      itemInstances: campaign.state.itemInstances,
    });
    const frightenedImmunity = effects.find(
      (e) => e.kind === 'GrantConditionImmunity' && e.conditionId === 'frightened',
    );
    expect(frightenedImmunity).toBeDefined();
    // Slice 299: Aura of Protection's per-ability save buffs were
    // compressed to a single save-wildcard AddModifier (target.kind
    // 'save', no `ability`). The wildcard reader merges into every
    // per-ability sum, so WIS saves still receive the buff.
    const saveBuff = effects.find(
      (e) =>
        e.kind === 'AddModifier' &&
        typeof e.target === 'object' &&
        e.target.kind === 'save',
    );
    expect(saveBuff).toBeDefined();
  });
});
