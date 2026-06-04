// Slice 656: multiclass L1+L2 build audit.
//
// Sibling of slice 642's L1+L1 audit. Covers the other shape of
// total-character-level-3 multiclass builds: one class at L1 + a
// different class at L2.
//
// Ordered pairs matter here (unlike L1+L1): a Fighter1 + Wizard2
// character is mechanically distinct from a Fighter2 + Wizard1
// character (different hit-die distribution, different feature
// access). So this audit iterates ordered pairs:
//   - First class at L1, second class at L2 (distinct)
//   - 12 × 11 = 132 pairs
//
// Each test builds the character with all-14 stats (clears every
// RAW multiclass prerequisite at 13+), commits CharacterCreated,
// and confirms `engine.plan.derive.character` returns a sheet
// without throwing.
//
// What this audit deliberately does NOT cover (deferred follow-ups):
//   - Triple-class L1+L1+L1 (C(12,3) = 220 combinations). Rare in
//     practice; can be a future hardening slice.
//   - Specific feature presence per pair (covered implicitly by
//     the L1 + L2 floors for each single-class build; multiclass
//     just combines them).
//   - Multiclass spellcasting slot math (covered by
//     computeSpellSlots tests).

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

// Ordered pairs (A at L1, B at L2) where A ≠ B. 12 × 11 = 132.
const PAIRS: ReadonlyArray<readonly [string, string]> = (() => {
  const out: Array<[string, string]> = [];
  for (const a of CLASSES) {
    for (const b of CLASSES) {
      if (a !== b) out.push([a, b]);
    }
  }
  return out;
})();

describe('slice 656: multiclass L1+L2 builds cleanly for every (L1 class, L2 class) ordered pair', () => {
  it('enumerates 132 ordered pairs (12 × 11 distinct-class combinations)', () => {
    expect(PAIRS).toHaveLength(132);
  });

  for (const [l1, l2] of PAIRS) {
    it(`L1 ${l1} + L2 ${l2}: builds, commits, derives without throwing`, () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const character = CharacterSchema.parse({
        id: newCharacterId(),
        name: `Multiclass ${l1}1/${l2}2`,
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [
          { classId: l1, level: 1, hitDiceRemaining: 1 },
          { classId: l2, level: 2, hitDiceRemaining: 2 },
        ],
        abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 14, WIS: 14, CHA: 14 },
        hp: { current: 20, max: 20, temp: 0, maxBonus: 0 },
      });
      expect(character.classes).toHaveLength(2);

      let campaign = engine.createCampaign({ name: 'multiclass-l1l2-audit' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: character,
        } satisfies CharacterCreatedEvent,
      ]);

      const derived = engine.derive.character(campaign.state, character.id);
      expect(derived, `engine.derive.character returned no sheet for L1 ${l1} + L2 ${l2}`).toBeDefined();
    });
  }
});
