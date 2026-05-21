// Slice 360 - Oath of Devotion L7 Aura of Devotion (ally-side half).
//
// RAW 2024: you and your allies have Immunity to the Charmed condition
// while in your Aura of Protection (10 ft). The self-immunity was already
// wired via GrantConditionImmunity; this slice adds the ally-projecting
// half by mirroring the paladin's Aura of Courage exactly: a GrantAura
// { allyConditionId: 'aura-of-devotion-active' } on the feature plus the
// `aura-of-devotion-active` condition that grants Charmed immunity to
// allies it lands on. Pure content (the GrantAura primitive + the aura-
// application machinery already ship for Aura of Protection / Courage).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { collectEffectsFromCharacter } from '../../../src/derive/effect-stack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';

const PACK = loadStarterPack();

const buildPaladin = (level: number, subclass: string | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ser Davna',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 18, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 60, max: 60, temp: 0 },
    featsTaken: [],
  });

const effectsOf = (character: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  return collectEffectsFromCharacter({ character, content: engine.content, itemInstances: {} });
};

describe('slice 360: Aura of Devotion (ally-side half)', () => {
  it('an Oath of Devotion paladin L7 projects a 10-ft aura-of-devotion with the ally Charmed-immunity condition', () => {
    const effects = effectsOf(buildPaladin(7, 'oath-of-devotion'));
    const aura = effects.find((e) => e.kind === 'GrantAura' && e.auraId === 'aura-of-devotion');
    expect(aura).toBeDefined();
    if (aura?.kind === 'GrantAura') {
      expect(aura.rangeFeet).toBe(10);
      expect(aura.allyConditionId).toBe('aura-of-devotion-active');
    }
  });

  it('still grants the paladin self-immunity to Charmed', () => {
    const effects = effectsOf(buildPaladin(7, 'oath-of-devotion'));
    expect(effects.some((e) => e.kind === 'GrantConditionImmunity' && e.conditionId === 'charmed')).toBe(true);
  });

  it('the aura-of-devotion-active condition grants an ally Charmed immunity', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const condition = engine.content.conditions.get('aura-of-devotion-active');
    expect(condition).toBeDefined();
    expect(condition?.effects.some((e) => e.kind === 'GrantConditionImmunity' && e.conditionId === 'charmed')).toBe(true);
  });

  it('does not project before level 7 (the feature gates at L7)', () => {
    const effects = effectsOf(buildPaladin(6, 'oath-of-devotion'));
    expect(effects.some((e) => e.kind === 'GrantAura' && e.auraId === 'aura-of-devotion')).toBe(false);
  });
});
