// Slice 854 — `hand-rolled-saves-bypass-stack` (Open Hand Technique arm).
//
// The Monk's Open Hand Technique (Flurry of Blows → Push / Topple) hand-rolled
// its target's STR/DEX save as `abilityModifier(target.abilityScores[ability])`
// — a raw modifier bypassing `computeSavingThrow`, the same bug slice 853
// fixed for Topple the weapon mastery. So the save skipped save PROFICIENCY,
// Bless/Bane and other bonus dice, advantage/disadvantage, Magic Resistance,
// and the auto-fail.
//
// This slice routes Open Hand's save through the shared `rollSaveAgainstDC`
// primitive (`sourceIsMagical: false` — a Monk martial feature is not a
// magical effect). The Grapple/Shove arm of the same row stays tracked (it
// carries its own golden transcripts needing regen-with-inspection).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildOpenHandMonk = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Lin',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'monk', level: 5, hitDiceRemaining: 5, subclassId: 'warrior-of-the-open-hand' }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 35, max: 35, temp: 0 },
    resources: [{ resourceId: 'ki', current: 5, max: 5 }],
  });

// Rogue: PROFICIENT in DEX saves (Rogue saves are DEX + INT). DEX 14 (+2) → +4.
const buildDexProficientTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Nimble',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
    armorClass: 5,
  });

// Cleric: NOT proficient in DEX saves (Cleric saves are WIS + CHA). Same DEX 14 → +2.
const buildDexNonProficientTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Devout',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 10, INT: 10, WIS: 14, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
    armorClass: 5,
  });

// Flurry the target with Topple until a strike hits, returning the first
// DEX SaveRolled it produced. The `bonus` is seed-independent.
const toppleSaveFor = (target: Character): SaveRolledEvent => {
  const monk = buildOpenHandMonk();
  const fist = makeItemInstance('unarmed-strike');
  let campaign: Campaign = createEngine({ contentPacks: [PACK], rng: seededRNG(1) }).createCampaign({ name: 'oht' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fist },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const events = engine.plan.flurryOfBlows(campaign.state, {
      monkId: monk.id,
      targetId: target.id,
      weaponInstanceId: fist.id,
      openHandTechnique: 'topple',
    }).events as ReadonlyArray<Event>;
    const hit = events.some((e) => e.type === 'AttackRolled' && (e as AttackRolledEvent).hit === true);
    const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
    if (hit && save !== undefined) return save;
  }
  throw new Error('no seed produced a Flurry hit + Topple save');
};

describe('slice 854: Open Hand Technique save goes through the full derivation', () => {
  it('the Topple save carries a computeSavingThrow breakdown', () => {
    const save = toppleSaveFor(buildDexNonProficientTarget());
    expect(save.ability).toBe('DEX');
    // The old hand-rolled event had no breakdown; the derivation always emits one.
    expect(save.breakdown ?? []).not.toHaveLength(0);
  });

  it('a DEX-save-proficient target now adds proficiency (was raw DEX mod only)', () => {
    const proficient = toppleSaveFor(buildDexProficientTarget()); // DEX +2, prof +2 → +4
    const nonProficient = toppleSaveFor(buildDexNonProficientTarget()); // DEX +2, no prof → +2
    expect(proficient.bonus).toBe(4);
    expect(nonProficient.bonus).toBe(2);
    // The pre-854 raw-mod roll would have given both +2.
    expect(proficient.bonus).toBeGreaterThan(nonProficient.bonus);
  });
});
