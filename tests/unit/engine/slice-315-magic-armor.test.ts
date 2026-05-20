// Slice 315 — magic equipment modeling, stage 1: magic armor.
//
// Single-base magic armor / shields now ship as itemKind 'armor' (was
// 'magic'), so the AC derive recognizes them as worn armor and applies
// baseAC + DEX + acBonus, and their `effects` project to the wearer's
// effect stack when equipped + attuned (slice-132 rule, broadened to
// armor). Multi-base magic armor stays itemKind 'magic' (deferred).
import { describe, expect, it } from 'vitest';
import { computeAC } from '../../../src/derive/ac.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// DEX 14 (+2) so the dex-cap interactions are observable.
const buildHero = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 8, hitDiceRemaining: 8 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
    ...overrides,
  });

describe('slice 315: magic body armor grants base AC + acBonus', () => {
  it('Glamoured Studded Leather: 12 + DEX + 1 (light, no cap)', () => {
    const armor = makeItemInstance('glamoured-studded-leather');
    const hero = buildHero({ inventory: [armor.id], equipped: { armor: armor.id as never, attuned: [] } });
    const ac = computeAC({ character: hero, itemInstances: { [armor.id]: armor }, content: CONTENT });
    expect(ac.total).toBe(15); // 12 + 2 + 1
  });

  it('Dragon Scale Mail: 14 + min(DEX,2) + 1 (medium, dexCap 2)', () => {
    const armor = makeItemInstance('dragon-scale-mail');
    const hero = buildHero({ inventory: [armor.id], equipped: { armor: armor.id as never, attuned: [armor.id] as never } });
    const ac = computeAC({ character: hero, itemInstances: { [armor.id]: armor }, content: CONTENT });
    expect(ac.total).toBe(17); // 14 + 2 + 1
  });

  it('Armor of Invulnerability: plate 18, no DEX (heavy), no acBonus', () => {
    const armor = makeItemInstance('armor-of-invulnerability');
    const hero = buildHero({ inventory: [armor.id], equipped: { armor: armor.id as never, attuned: [armor.id] as never } });
    const ac = computeAC({ character: hero, itemInstances: { [armor.id]: armor }, content: CONTENT });
    expect(ac.total).toBe(18);
  });
});

describe('slice 315: magic shields grant the shield AC', () => {
  it('Spellguard Shield equipped in the shield slot adds +2 AC', () => {
    const shield = makeItemInstance('spellguard-shield');
    const withShield = buildHero({ inventory: [shield.id], equipped: { shield: shield.id as never, attuned: [shield.id] as never } });
    const acWith = computeAC({ character: withShield, itemInstances: { [shield.id]: shield }, content: CONTENT });
    const acWithout = computeAC({ character: buildHero(), itemInstances: {}, content: CONTENT });
    expect(acWith.total - acWithout.total).toBe(2);
  });
});

describe('slice 315: magic armor/shield effects project when worn + attuned', () => {
  it('Spellguard Shield (held + attuned) grants Magic Resistance', () => {
    const shield = makeItemInstance('spellguard-shield');
    const hero = buildHero({ inventory: [shield.id], equipped: { shield: shield.id as never, attuned: [shield.id] as never } });
    const r = computeSavingThrow({ character: hero, itemInstances: { [shield.id]: shield }, content: CONTENT, ability: 'WIS', sourceIsMagical: true });
    expect(r.hasAdvantage).toBe(true);
  });

  it('Armor of Invulnerability (worn + attuned) projects B/P/S resistance', () => {
    const armor = makeItemInstance('armor-of-invulnerability');
    const hero = buildHero({ inventory: [armor.id], equipped: { armor: armor.id as never, attuned: [armor.id] as never } });
    const e = buildEffectStack({ character: hero, itemInstances: { [armor.id]: armor }, content: CONTENT, pendingChoices: {} });
    expect(e.hasResistance('bludgeoning')).toBe(true);
    expect(e.hasResistance('piercing')).toBe(true);
    expect(e.hasResistance('slashing')).toBe(true);
    expect(e.hasResistance('fire')).toBe(false);
  });

  it('Sentinel Shield (held, no attunement) grants initiative + Perception advantage', () => {
    const shield = makeItemInstance('sentinel-shield');
    const hero = buildHero({ inventory: [shield.id], equipped: { shield: shield.id as never, attuned: [] } });
    const e = buildEffectStack({ character: hero, itemInstances: { [shield.id]: shield }, content: CONTENT, pendingChoices: {} });
    expect(e.advantageFor('initiative').advantage).toBe(true);
    expect(e.advantageFor({ kind: 'skill', skill: 'perception' }).advantage).toBe(true);
  });
});
