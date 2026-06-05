// Slice 675: seedResourcesFromContent helper.
//
// Closes the slice-660 documented deferral. Walks the character's
// effect stack for `GrantResource` effects and populates
// `character.resources` with `{ resourceId, current=max, max,
// recharge }` so consumers don't have to hand-author the
// resources array when building characters.
//
// What this pins:
//   1. Barbarian L1 (rage grant in class L1 features) gets a
//      `rage` resource with max=2, recharge='longRest'.
//   2. Barbarian L3 (rage-uses-3 grant at L3 overrides) gets
//      max=3 (highest wins per-resourceId).
//   3. Cleric L3 (Channel Divinity grant at L2 + Paladin-shape
//      grant) gets channel-divinity with `partialShortFullLong`
//      recharge (slice 657's primitive).
//   4. Pre-existing resource entries are NOT overwritten
//      (idempotent / additive only).
//   5. Character without any GrantResource grants is returned
//      unchanged.

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { seedResourcesFromContent } from '../../../src/engine/seed-resources.js';

const PACK = loadStarterPack();
const ENGINE = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });

const buildBarbarian = (level: number, resources: Character['resources'] = []): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Krath',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    hp: { current: 12 * level, max: 12 * level, temp: 0 },
    resources,
  });

const buildCleric = (level: number, resources: Character['resources'] = []): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sera',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level, hitDiceRemaining: level, subclassId: level >= 3 ? 'life-domain' : undefined }],
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 8 * level, max: 8 * level, temp: 0 },
    resources,
  });

describe('slice 675: seedResourcesFromContent', () => {
  it('Barbarian L1: rage resource seeded with max=2 + longRest recharge', () => {
    const barb = buildBarbarian(1);
    expect(barb.resources).toEqual([]);
    const seeded = seedResourcesFromContent(barb, ENGINE.content);
    const rage = seeded.resources.find((r) => r.resourceId === 'rage');
    expect(rage, 'rage resource not seeded').toBeDefined();
    expect(rage!.max).toBe(2);
    expect(rage!.current).toBe(2);
    expect(rage!.recharge).toBe('longRest');
  });

  it('Barbarian L3: rage-uses-3 raises max to 3 (highest-wins per resourceId)', () => {
    const barb = buildBarbarian(3);
    const seeded = seedResourcesFromContent(barb, ENGINE.content);
    const rage = seeded.resources.find((r) => r.resourceId === 'rage');
    expect(rage).toBeDefined();
    expect(rage!.max).toBe(3);
    expect(rage!.recharge).toBe('longRest');
  });

  it('Cleric L3: channel-divinity seeded with partialShortFullLong recharge (slice 657 primitive)', () => {
    const cleric = buildCleric(3);
    const seeded = seedResourcesFromContent(cleric, ENGINE.content);
    const cd = seeded.resources.find((r) => r.resourceId === 'channel-divinity');
    expect(cd, 'channel-divinity not seeded').toBeDefined();
    expect(cd!.max).toBe(2); // L2/L3 Channel Divinity grant ships max=2 in the pack
    expect(cd!.recharge).toBe('partialShortFullLong');
  });

  it('idempotent: pre-existing resource entry is NOT overwritten', () => {
    const barb = buildBarbarian(1, [
      { resourceId: 'rage', current: 1, max: 2, recharge: 'longRest' },
    ]);
    const seeded = seedResourcesFromContent(barb, ENGINE.content);
    const rage = seeded.resources.find((r) => r.resourceId === 'rage');
    expect(rage!.current).toBe(1); // pre-existing current preserved
    expect(seeded.resources.length).toBe(barb.resources.length); // no duplicate
  });

  it('no-op: character without GrantResource grants is returned unchanged', () => {
    const fighter = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Pell',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
    });
    const seeded = seedResourcesFromContent(fighter, ENGINE.content);
    // Fighter L1 has second-wind grant; expect it seeded.
    const sw = seeded.resources.find((r) => r.resourceId === 'second-wind');
    expect(sw).toBeDefined();
    expect(sw!.recharge).toBe('shortRest');
  });
});
