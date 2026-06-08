// Engine handoff (fuzz level range): every CLASS_POOLS class — and its
// seed-driven opponent — must build reliably to any level 1-20 so the
// sibling dnd-web viewer can offer a 1-20 level picker. The fuzz
// auto-leveler (`levelUpTo` + `drainPendingChoices` in combat-fuzz-core)
// resolves every planner-emitted level-up choice via a deterministic
// legal-option-set picker and fails LOUD: an unresolvable choice or an
// under-level throws (the prior behavior swallowed the throw and silently
// left the character at L1 while the caller believed it was leveled).
//
// This audit drives the real `runBattle` seam — the same path dnd-web's
// EngineBridge.startBattle forwards into — at every level 2..20 for every
// class, and spot-checks a level-20 character is combat-valid.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle, FUZZ_CLASS_IDS, FUZZ_MAX_LEVEL } from '../../scripts/combat-fuzz-core.js';
import { resolveContent } from '../../src/content/pack.js';
import { computeAvailableSpellSlots } from '../../src/derive/spell-slots.js';
import { proficiencyBonus } from '../../src/derive/ability.js';
import type { Campaign } from '../../src/engine/commit.js';
import type { Character } from '../../src/schemas/runtime/character.js';

const STARTER = loadStarterPack();
const CONTENT = resolveContent([STARTER]);

const totalLevel = (c: Character): number => c.classes.reduce((s, x) => s + x.level, 0);
const unresolvedCount = (campaign: Campaign, id: string): number =>
  Object.values(campaign.state.pendingChoices).filter((p) => p.forCharacterId === id && p.resolution === undefined).length;

const FULL_CASTERS = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);
const HALF_CASTERS = new Set(['paladin', 'ranger']);
const L20_PROFICIENCY_BONUS = 6;

describe('combat-fuzz level range: every class builds 1-20', () => {
  it('FUZZ_MAX_LEVEL is 20', () => {
    expect(FUZZ_MAX_LEVEL).toBe(20);
  });

  describe('player + seed-driven PC opponent reach every level 2..20 with zero unresolved choices', () => {
    for (const cls of FUZZ_CLASS_IDS) {
      it(`${cls}: L2..${FUZZ_MAX_LEVEL}`, () => {
        for (let level = 2; level <= FUZZ_MAX_LEVEL; level += 1) {
          // runBattle throws loudly if any class PC can't reach `level`.
          const res = runBattle({ seed: level * 7 + 3, pack: STARTER, level, vs: 'pc', teamSize: 1, playerClass: cls });
          const player = res.campaign.state.characters[res.teamACharacterIds[0]!]!;
          const opponent = res.campaign.state.characters[res.teamBCharacterIds[0]!]!;
          expect(totalLevel(player), `${cls} player did not reach L${level}`).toBe(level);
          expect(totalLevel(opponent), `opponent (vs ${cls}) did not reach L${level}`).toBe(level);
          expect(unresolvedCount(res.campaign, player.id), `${cls} player has unresolved choices @L${level}`).toBe(0);
          expect(unresolvedCount(res.campaign, opponent.id), `opponent has unresolved choices @L${level}`).toBe(0);
        }
      });
    }
  });

  it('a level-20 character of every class is combat-valid (level, HP, proficiency bonus, spell slots)', () => {
    for (const cls of FUZZ_CLASS_IDS) {
      const res = runBattle({ seed: 909, pack: STARTER, level: 20, vs: 'pc', teamSize: 1, playerClass: cls });
      const c = res.campaign.state.characters[res.teamACharacterIds[0]!]!;
      expect(totalLevel(c), `${cls} L20 level`).toBe(20);
      expect(proficiencyBonus(totalLevel(c)), `${cls} L20 proficiency bonus`).toBe(L20_PROFICIENCY_BONUS);
      // HP grew far past a level-1 character (smallest die d6 + CON over 20 levels).
      expect(c.hp.max, `${cls} L20 HP`).toBeGreaterThan(40);

      const slots = computeAvailableSpellSlots(c, CONTENT.classes);
      if (FULL_CASTERS.has(cls)) {
        expect(slots.standardByLevel[8] ?? 0, `${cls} should have a 9th-level slot @L20`).toBeGreaterThan(0);
      } else if (HALF_CASTERS.has(cls)) {
        expect(slots.standardByLevel[4] ?? 0, `${cls} should have a 5th-level slot @L20`).toBeGreaterThan(0);
      } else if (cls === 'warlock') {
        expect(slots.pact?.level, 'warlock pact slots should be 5th level @L20').toBe(5);
      }
    }
  });

  it('vs=monster at L20: the player levels, the monster keeps its statblock', () => {
    const res = runBattle({ seed: 77, pack: STARTER, level: 20, vs: 'monster', teamSize: 1, playerClass: 'fighter' });
    const player = res.campaign.state.characters[res.teamACharacterIds[0]!]!;
    const monster = res.campaign.state.characters[res.teamBCharacterIds[0]!]!;
    expect(totalLevel(player)).toBe(20);
    expect(monster.statblockId, 'monster should be statblock-based').toBeDefined();
    // The monster is NOT class-leveled (it stays at its statblock's level 1 shell).
    expect(monster.classes[0]?.level).toBe(1);
    expect(unresolvedCount(res.campaign, player.id)).toBe(0);
  });
});
