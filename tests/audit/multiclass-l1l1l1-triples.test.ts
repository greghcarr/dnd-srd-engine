// Slice 673: triple-class multiclass build audit (L1+L1+L1).
//
// Sibling of slice 642's L1+L1 pairs audit and slice 656's L1+L2
// ordered pairs audit. Covers the third combinatoric shape of
// total-character-level-3 multiclass builds: three distinct classes
// each at L1.
//
// Class order doesn't matter for ability-grant correctness (the
// derive layer doesn't care about ordering for distinct classes),
// so this audit iterates UNORDERED triples — C(12,3) = 220
// combinations.
//
// Each test builds the character with all-14 stats (clears every
// RAW multiclass prerequisite at 13+), commits CharacterCreated,
// and confirms `engine.derive.character` returns a sheet without
// throwing.
//
// What this audit deliberately does NOT cover (still deferred):
//   - Per-pair feature presence (covered implicitly by the L1
//     floor for each single-class build; triple-class just
//     combines three of them).
//   - L1+L1+L2 / L1+L2+L1 / etc. mixed-level triples (this audit
//     is L1+L1+L1 only — total level 3 with three classes).
//   - Multiclass spellcasting slot math at triple-class (covered
//     by computeSpellSlots tests).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { CharacterSchema } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../fixtures/index.js';

const PACK = loadStarterPack();

const CLASSES = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
] as const;

// Unordered distinct triples — C(12,3) = 220.
const TRIPLES: ReadonlyArray<readonly [string, string, string]> = (() => {
  const out: Array<[string, string, string]> = [];
  for (let i = 0; i < CLASSES.length; i += 1) {
    for (let j = i + 1; j < CLASSES.length; j += 1) {
      for (let k = j + 1; k < CLASSES.length; k += 1) {
        out.push([CLASSES[i]!, CLASSES[j]!, CLASSES[k]!]);
      }
    }
  }
  return out;
})();

describe('slice 673: triple-class L1+L1+L1 builds cleanly for every distinct triple', () => {
  it('enumerates 220 unordered triples (C(12,3))', () => {
    expect(TRIPLES).toHaveLength(220);
  });

  for (const [a, b, c] of TRIPLES) {
    it(`L1 ${a} + L1 ${b} + L1 ${c}: builds, commits, derives without throwing`, () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const character = CharacterSchema.parse({
        id: newCharacterId(),
        name: `Triple ${a}1/${b}1/${c}1`,
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [
          { classId: a, level: 1, hitDiceRemaining: 1 },
          { classId: b, level: 1, hitDiceRemaining: 1 },
          { classId: c, level: 1, hitDiceRemaining: 1 },
        ],
        abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 14, WIS: 14, CHA: 14 },
        hp: { current: 18, max: 18, temp: 0, maxBonus: 0 },
      });
      expect(character.classes).toHaveLength(3);

      let campaign = engine.createCampaign({ name: 'multiclass-triple-audit' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: character,
        } satisfies CharacterCreatedEvent,
      ]);

      const derived = engine.derive.character(campaign.state, character.id);
      expect(derived, `engine.derive.character returned no sheet for triple ${a}+${b}+${c}`).toBeDefined();
    });
  }
});
