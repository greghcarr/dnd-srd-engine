// Slice 749: byte-identity guard for the reaction-policy seam.
//
// The reaction layer adds a per-action reaction-policy seam to runBattle.
// The default — reactions:'none' — must keep the event log byte-identical
// to the pre-seam path. The fuzz-matrix + replay-equivalence + golden
// suites prove the cross-cutting invariants (they call runBattle without
// the option and stay green); this test pins the specific guarantee: the
// default path fires no damage-mitigation reactions and explicit
// reactions:'none' is the same code path as omitting the option.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';
import { normalizeEvents } from '../fixtures/index.js';

const STARTER = loadStarterPack();
const SEEDS = [1, 2, 3, 7, 42];
const REACTION_EVENT_TYPES = ['UncannyDodgeUsed', 'DeflectAttacksUsed', 'SpellCountered'];

describe('combat-fuzz default reactions guard (slice 749)', () => {
  it('default path (reactions omitted) emits no damage-mitigation reaction events', () => {
    for (const seed of SEEDS) {
      // Level 7 so the reaction-bearing classes (Rogue L5 Uncanny Dodge,
      // Monk L3 Deflect Attacks) are present in the build pool — the
      // default path must still not fire them.
      const { campaign } = runBattle({ seed, pack: STARTER, level: 7, teamSize: 2 });
      const types = campaign.events.map((e) => e.type);
      for (const reactionType of REACTION_EVENT_TYPES) {
        expect(types, `seed=${seed} default emitted ${reactionType}`).not.toContain(reactionType);
      }
    }
  });

  it('default build does not inject Counterspell into any character (slice 751 build is auto-gated)', () => {
    // The RAW-faithful Counterspell prep is added only under reactions:'auto'
    // at L5+. The default build (and thus the CharacterCreated snapshots) must
    // be unchanged, or byte-identity with the pre-slice path breaks.
    for (const seed of SEEDS) {
      const { campaign } = runBattle({ seed, pack: STARTER, level: 7, teamSize: 2 });
      for (const character of Object.values(campaign.state.characters)) {
        expect(
          character.preparedSpells,
          `seed=${seed} ${character.name} has Counterspell prepared under the default`,
        ).not.toContain('counterspell');
      }
    }
  });

  it('explicit reactions:"none" matches the default (normalized: identical rolls, shape, order)', () => {
    // Entity ids (ulid) and wall-clock `at` stamps are fresh per run, so
    // raw JSON differs; normalize them out. What remains — event types,
    // order, and every RNG-driven value — must match, proving
    // reactions:'none' is the same code path as omitting the option.
    for (const seed of SEEDS) {
      const def = runBattle({ seed, pack: STARTER, level: 7, teamSize: 2 });
      const explicit = runBattle({ seed, pack: STARTER, level: 7, teamSize: 2, reactions: 'none' });
      expect(normalizeEvents(explicit.campaign.events)).toEqual(
        normalizeEvents(def.campaign.events),
      );
    }
  });

  it('reactions:"auto" diverges from the default (proves the option is wired)', () => {
    // At least one of these reaction-rich seeds must differ once reactions
    // fire — otherwise the seam isn't doing anything.
    const anyDifferent = SEEDS.some((seed) => {
      const def = runBattle({ seed, pack: STARTER, level: 7, teamSize: 2 });
      const auto = runBattle({ seed, pack: STARTER, level: 7, teamSize: 2, reactions: 'auto' });
      return JSON.stringify(normalizeEvents(def.campaign.events))
        !== JSON.stringify(normalizeEvents(auto.campaign.events));
    });
    expect(anyDifferent, 'reactions:"auto" produced no change on any seed').toBe(true);
  });
});
