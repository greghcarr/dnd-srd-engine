// Slice 452: Sunlight Sensitivity / Sunlight Weakness sweep across
// the four affected Undead monsters in the pack.
//
// RAW (SRD 5.2.1):
//   Specter / Wight / Wraith — "Sunlight Sensitivity. While in sunlight,
//     [creature] has Disadvantage on ability checks and attack rolls."
//   Shadow — "Sunlight Weakness. While in sunlight, the shadow has
//     Disadvantage on D20 Tests." (Same as Sunlight Sensitivity at the
//     attack-roll and ability-check arms; the saving-throw arm of
//     "D20 Tests" stays deferred this slice — see CHANGELOG.)
//
// All four reuse the slice-279 / slice-451 `bearer.lightLevel` fact;
// this slice is pure content. One spot-check per monster id confirms
// the trait wire works through the planAttack path.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildUndead = (statblockId: string, name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name,
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId,
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

const buildHero = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const runAttack = (statblockId: string, lightLevel: 'bright' | 'dim' | 'darkness'): AttackRolledEvent => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(101) });
  const dagger = makeItemInstance('dagger');
  const undead = buildUndead(statblockId, statblockId);
  const hero = buildHero();
  let campaign = engine.createCampaign({ name: `${statblockId}-${lightLevel}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: undead } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.attack(campaign.state, {
    attackerId: undead.id,
    targetId: hero.id,
    weaponInstanceId: dagger.id,
    lightLevel,
  }).events;
  return events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent;
};

describe('Sunlight Sensitivity / Sunlight Weakness sweep (slice 452)', () => {
  for (const monster of ['specter', 'wight', 'wraith', 'shadow']) {
    it(`${monster} attack in 'bright' light rolls with disadvantage`, () => {
      expect(runAttack(monster, 'bright').used).toBe('disadvantage');
    });
    it(`${monster} attack in 'dim' light rolls normally`, () => {
      expect(runAttack(monster, 'dim').used).toBe('none');
    });
  }
});
