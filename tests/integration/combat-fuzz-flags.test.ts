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

  // Slice 717: Free Duel class pin (playerClass).
  const teamAClass = (r: ReturnType<typeof runBattle>): string | undefined =>
    r.campaign.state.characters[r.teamACharacterIds[0]!]?.classes[0]?.classId;
  const opponentBuild = (r: ReturnType<typeof runBattle>) => {
    const b = r.campaign.state.characters[r.teamBCharacterIds[0]!]!;
    return { classId: b.classes[0]?.classId, speciesId: b.speciesId, backgroundId: b.backgroundId };
  };

  it('--class wizard: pins team A[0] to wizard, leveled like everyone else', () => {
    const result = runBattle({ seed: 6, pack: STARTER, playerClass: 'wizard', level: 4 });
    const a0 = result.campaign.state.characters[result.teamACharacterIds[0]!]!;
    expect(a0.classes[0]?.classId).toBe('wizard');
    expect(a0.classes[0]?.level).toBe(4); // leveled via the same levelUpTo path
  });

  it('class pin is an independent axis: opponent + map identical with or without the pin', () => {
    const base = runBattle({ seed: 7, pack: STARTER, movement: 'tactical' });
    const pinned = runBattle({ seed: 7, pack: STARTER, playerClass: 'wizard', movement: 'tactical' });
    // The seed-driven opponent is byte-identical (the pin uses an isolated
    // RNG cursor and never perturbs the shared stream).
    expect(opponentBuild(pinned)).toEqual(opponentBuild(base));
    // The tactical map is seed-derived, so the arena is the same too.
    const mapOf = (r: ReturnType<typeof runBattle>) =>
      r.locationId !== undefined ? r.campaign.state.locations[r.locationId]?.map : undefined;
    expect(mapOf(pinned)).toEqual(mapOf(base));
    // A[0] is the pinned class regardless of what the seed would have rolled.
    expect(teamAClass(pinned)).toBe('wizard');
  });

  it('class pin is deterministic for a given (seed, playerClass)', () => {
    const a = runBattle({ seed: 9, pack: STARTER, playerClass: 'cleric' });
    const b = runBattle({ seed: 9, pack: STARTER, playerClass: 'cleric' });
    const sheet = (r: ReturnType<typeof runBattle>) => {
      const c = r.campaign.state.characters[r.teamACharacterIds[0]!]!;
      return { classId: c.classes[0]?.classId, speciesId: c.speciesId, backgroundId: c.backgroundId };
    };
    expect(sheet(a)).toEqual(sheet(b));
    expect(sheet(a).classId).toBe('cleric');
  });

  it('unknown playerClass falls back to a random A[0] (no pin, stream unchanged)', () => {
    const base = runBattle({ seed: 8, pack: STARTER });
    const bogus = runBattle({ seed: 8, pack: STARTER, playerClass: 'not-a-class' });
    expect(teamAClass(bogus)).toBe(teamAClass(base)); // identical to the no-pin random build
    expect(opponentBuild(bogus)).toEqual(opponentBuild(base));
  });
});
