// Slice 866 — L7 audit closure for `over-capacity-speed-5` (QUIRK, Area 8).
//
// RAW (SRD 5.2.1, rules-glossary "Carrying Capacity"): "While dragging,
// lifting, or pushing weight in excess of the maximum weight you can carry,
// your Speed can be no more than 5 feet." The carry maximum is size × STR × 15
// (slice 865); the only mechanical consequence of exceeding it is this Speed
// cap, applied in the speed derive. "Your Speed" is general, so the cap covers
// walk and the non-walk modes alike, and it only LOWERS Speed (never raises a
// slower one, never lifts a 0).

import { describe, expect, it } from 'vitest';
import {
  getEffectiveSpeed,
  getEffectiveSpeeds,
  getEffectiveSpeedForMode,
} from '../../src/derive/speed.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { CharacterSchema } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { buildFighter, makeItemInstance } from '../fixtures/index.js';

// musket = 10 lb in the starter pack — a clean unit for load math.
const CONTENT = resolveContent([loadStarterPack()]);

// A human fighter (walk 30) carrying `qty` muskets. STR 10 → carry max 150 lb.
const fighterCarrying = (qty: number) => {
  const m = makeItemInstance('musket', { quantity: qty });
  return {
    character: buildFighter({ STR: 10, inventory: [m.id] }),
    content: CONTENT,
    itemInstances: { [m.id]: m },
  };
};

// A Ghost (statblock walk 5 / fly 40, STR 7 → carry max 105 lb) carrying
// `qty` muskets — used to prove the cap reaches a non-walk mode.
const ghostCarrying = (qty: number) => {
  const m = makeItemInstance('musket', { quantity: qty });
  const character = CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Ghost',
    statblockId: 'ghost',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 7, DEX: 13, CON: 10, INT: 10, WIS: 12, CHA: 17 },
    hp: { current: 45, max: 45, temp: 0 },
    inventory: [m.id],
    equipped: { attuned: [] },
  });
  return { character, content: CONTENT, itemInstances: { [m.id]: m } };
};

describe('slice 866 — over-capacity Speed cap (≤ 5 ft)', () => {
  it('walk Speed is capped at 5 ft when carried weight exceeds the carry max', () => {
    // 16 muskets = 160 lb > carry 150 → over capacity.
    expect(getEffectiveSpeed(fighterCarrying(16))).toBe(5);
  });

  it('walk Speed is unaffected at exactly the carry max', () => {
    // 15 muskets = 150 lb == carry 150 → not over.
    expect(getEffectiveSpeed(fighterCarrying(15))).toBe(30);
  });

  it('walk Speed is unaffected under the carry max', () => {
    expect(getEffectiveSpeed(fighterCarrying(5))).toBe(30);
  });

  it('an empty inventory takes the fast path (no cap, full Speed)', () => {
    const input = { character: buildFighter({ STR: 10 }), content: CONTENT, itemInstances: {} };
    expect(getEffectiveSpeed(input)).toBe(30);
  });

  it('getEffectiveSpeeds reflects the cap on walk', () => {
    expect(getEffectiveSpeeds(fighterCarrying(16)).walk).toBe(5);
    expect(getEffectiveSpeeds(fighterCarrying(15)).walk).toBe(30);
  });

  it('the cap reaches a non-walk mode: an over-capacity flyer is capped at 5', () => {
    // Ghost STR 7 → carry 105. 11 muskets = 110 lb > 105 → over capacity.
    const over = ghostCarrying(11);
    expect(getEffectiveSpeedForMode(over, 'fly')).toBe(5);
    expect(getEffectiveSpeeds(over)).toEqual({ walk: 5, fly: 5 });
  });

  it('an under-capacity flyer keeps its full fly Speed', () => {
    // 10 muskets = 100 lb ≤ 105 → not over.
    const under = ghostCarrying(10);
    expect(getEffectiveSpeedForMode(under, 'fly')).toBe(40);
    expect(getEffectiveSpeeds(under)).toEqual({ walk: 5, fly: 40 });
  });

  it('the cap only lowers Speed — a base Speed already ≤ 5 stays put', () => {
    // Ghost walk base is 5; over capacity keeps it 5 (min(5, 5)), not raised.
    expect(getEffectiveSpeedForMode(ghostCarrying(11), 'walk')).toBe(5);
  });
});
