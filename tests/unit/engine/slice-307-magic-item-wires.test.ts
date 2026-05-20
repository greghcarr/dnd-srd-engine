// Slice 307 — magic-item buff sweep (cont.). Two defensive wearables,
// passive arms wired via existing primitives; their charged / spell-
// attack arms are deferred (see the pack entry descriptions).
//
// - Spellguard Shield: GrantMagicResistance (advantage on saves vs
//   magical sources). The "spell attacks have Disadvantage against
//   you" arm is deferred (no isSpellAttack fact distinct from the
//   melee/ranged attackKind).
// - Armor of Invulnerability: GrantResistance to bludgeoning /
//   piercing / slashing. The Metal Shell timed-immunity action is
//   deferred.
import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHero = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    ...overrides,
  });

const attune = (defId: string) => {
  const item = makeItemInstance(defId);
  const wearer = buildHero({ inventory: [item.id], equipped: { attuned: [item.id] as never } });
  return { item, wearer };
};

describe('slice 307: Spellguard Shield (Magic Resistance arm)', () => {
  it('grants advantage on saves vs magical sources while attuned', () => {
    const { item, wearer } = attune('spellguard-shield');
    const r = computeSavingThrow({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      ability: 'WIS',
      sourceIsMagical: true,
    });
    expect(r.hasAdvantage).toBe(true);
  });

  it('does not grant advantage vs non-magical sources', () => {
    const { item, wearer } = attune('spellguard-shield');
    const r = computeSavingThrow({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      ability: 'WIS',
    });
    expect(r.hasAdvantage).toBe(false);
  });
});

describe('slice 307: Armor of Invulnerability (resistance to B/P/S)', () => {
  it('grants resistance to bludgeoning, piercing, and slashing while attuned', () => {
    const { item, wearer } = attune('armor-of-invulnerability');
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.hasResistance('bludgeoning')).toBe(true);
    expect(effects.hasResistance('piercing')).toBe(true);
    expect(effects.hasResistance('slashing')).toBe(true);
  });

  it('does not grant resistance to other damage types', () => {
    const { item, wearer } = attune('armor-of-invulnerability');
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.hasResistance('fire')).toBe(false);
    expect(effects.hasResistance('necrotic')).toBe(false);
  });
});
