// Integration test for the combat-fuzz CLI's flag matrix.
//
// Pre-slice the slice-600 core extraction silently lost the slice-596
// "Beast" naming for monster opponents in --vs monster mode. The
// regression slid in because no test exercised the flag matrix at
// the refactor seam. Slice 606 fixed the symptom; this test (slice
// 614) closes the process gap so the same regression class can't
// slide again.
//
// Asserts on the simulator's output shape per flag combination, not
// on byte-for-byte transcripts (those drift with every RNG-affecting
// engine slice). The shape assertions (naming, team size, level)
// are stable across slice generations.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';

const STARTER = loadStarterPack();

describe('combat-fuzz CLI flag matrix (slice 614)', () => {
  it('default 1v1 vs PC: two combatants, both class-based names', () => {
    const result = runBattle({ seed: 1, pack: STARTER });
    expect(result.teamACharacterIds).toHaveLength(1);
    expect(result.teamBCharacterIds).toHaveLength(1);
    const all = Object.values(result.campaign.state.characters);
    expect(all).toHaveLength(2);
    const names = all.map((c) => c.name).sort();
    expect(names).toEqual(['Aria', 'Bran']);
    // No companion-classed (monster) entries.
    for (const c of all) {
      expect(c.classes[0]?.classId).not.toBe('companion');
    }
  });

  it('--vs monster: Beast opponent (companion class), not "Bran"', () => {
    const result = runBattle({ seed: 1, pack: STARTER, vs: 'monster' });
    const characters = Object.values(result.campaign.state.characters);
    // Find the team-B character; should be "Beast".
    const beastId = result.teamBCharacterIds[0]!;
    const beast = result.campaign.state.characters[beastId];
    expect(beast?.name).toBe('Beast');
    expect(beast?.classes[0]?.classId).toBe('companion');
    // Aria still on team A.
    expect(result.campaign.state.characters[result.teamACharacterIds[0]!]?.name).toBe('Aria');
    // Pin the regression: no character named "Bran" in --vs monster mode.
    for (const c of characters) {
      expect(c.name).not.toBe('Bran');
    }
  });

  it('--mode 2v2: 4 combatants, suffix-numbered names', () => {
    const result = runBattle({ seed: 2, pack: STARTER, teamSize: 2 });
    expect(result.teamACharacterIds).toHaveLength(2);
    expect(result.teamBCharacterIds).toHaveLength(2);
    const names = Object.values(result.campaign.state.characters).map((c) => c.name).sort();
    expect(names).toEqual(['Aria-1', 'Aria-2', 'Bran-1', 'Bran-2']);
  });

  it('--mode 2v2 --vs monster: 4 combatants, Aria-N + Beast-N', () => {
    const result = runBattle({ seed: 3, pack: STARTER, teamSize: 2, vs: 'monster' });
    expect(result.teamACharacterIds).toHaveLength(2);
    expect(result.teamBCharacterIds).toHaveLength(2);
    const names = Object.values(result.campaign.state.characters).map((c) => c.name).sort();
    expect(names).toEqual(['Aria-1', 'Aria-2', 'Beast-1', 'Beast-2']);
    // Pin again: no Bran in monster mode.
    for (const name of names) {
      expect(name).not.toMatch(/^Bran/);
    }
  });

  it('--level 3: characters built at level 3, not level 1', () => {
    const result = runBattle({ seed: 4, pack: STARTER, level: 3 });
    const characters = Object.values(result.campaign.state.characters);
    // At least one team-A character should have leveled up. Monsters
    // (companion class) don't level. So check team A's PCs.
    for (const id of result.teamACharacterIds) {
      const ch = result.campaign.state.characters[id]!;
      expect(ch.classes[0]?.level).toBe(3);
    }
    // teamB is also PCs in default vs=pc mode.
    for (const id of result.teamBCharacterIds) {
      const ch = result.campaign.state.characters[id]!;
      expect(ch.classes[0]?.level).toBe(3);
    }
    void characters;
  });

  it('--rest long: post-battle long-rest events appear in the event stream', () => {
    const result = runBattle({ seed: 5, pack: STARTER, rest: 'long' });
    // The rest events fire after the encounter ends. At least one
    // LongRestStarted should be in the event log when at least one
    // character survived (which is the typical case).
    const hasLongRest = result.campaign.events.some((e) => e.type === 'LongRestStarted');
    const someoneSurvived = Object.values(result.campaign.state.characters).some((c) => c.hp.current > 0);
    if (someoneSurvived) {
      expect(hasLongRest).toBe(true);
    }
  });
});
