// Slice 349 - Fiend Patron Dark One's Blessing (Warlock L3).
//
// RAW 2024: "When you reduce an enemy to 0 Hit Points, you gain
// Temporary Hit Points equal to your Charisma modifier plus your
// Warlock level (minimum of 1)." Wired as an always-on OnEvent rider on
// DamageApplied gated on the new `event.sourceIsSelf` +
// `event.targetReducedToZero` facts, granting temp HP to the bearer via
// the new `GrantTempHP` trigger action (amount = max(1, CHA mod +
// Warlock level)). The "ally drops a nearby enemy" arm is consumer-side
// (positions aren't modeled).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { TempHPGrantedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
// CHA 16 (mod +3) + Warlock level 5 = 8 temp HP.
const WARLOCK_LEVEL = 5;
const EXPECTED_TEMP_HP = 8;

const buildWarlock = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Marrow',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'warlock', level: WARLOCK_LEVEL, hitDiceRemaining: WARLOCK_LEVEL, subclassId: 'fiend-patron' }],
    abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 38, max: 38, temp: 0 },
  });

const buildTarget = (hp: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Thrall',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: hp, max: hp, temp: 0 },
    armorClass: 5,
  });

interface HitOut {
  events: ReadonlyArray<Event>;
  warlockId: string;
}

const attackOnHit = (seed: number, target: Character): HitOut | undefined => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const warlock = buildWarlock();
  const weapon = makeItemInstance('rapier');
  let campaign: Campaign = engine.createCampaign({ name: `dob-${seed}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.attack(campaign.state, {
    attackerId: warlock.id, targetId: target.id, weaponInstanceId: weapon.id,
  }).events as ReadonlyArray<Event>;
  const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
  return rolled?.hit === true ? { events, warlockId: warlock.id } : undefined;
};

const selfTempHp = (out: HitOut): TempHPGrantedEvent | undefined =>
  out.events.find(
    (e): e is TempHPGrantedEvent => e.type === 'TempHPGranted' && e.targetId === out.warlockId,
  );

describe('slice 349: Dark One\'s Blessing', () => {
  it('grants the bearer CHA-mod + warlock-level temp HP when an attack drops an enemy to 0', () => {
    let fired = false;
    for (let seed = 1; seed < 80 && !fired; seed += 1) {
      const out = attackOnHit(seed, buildTarget(1)); // 1 HP: any hit kills
      if (out === undefined) continue;
      const temp = selfTempHp(out);
      expect(temp, 'expected TempHPGranted to the warlock on the kill').toBeDefined();
      expect(temp!.amount).toBe(EXPECTED_TEMP_HP);
      fired = true;
    }
    expect(fired, 'expected at least one killing hit').toBe(true);
  });

  it('does not grant temp HP when the enemy survives the hit', () => {
    let testedASurvivor = false;
    for (let seed = 1; seed < 80 && !testedASurvivor; seed += 1) {
      const out = attackOnHit(seed, buildTarget(60)); // high HP: survives one hit
      if (out === undefined) continue;
      expect(selfTempHp(out)).toBeUndefined();
      testedASurvivor = true;
    }
    expect(testedASurvivor, 'expected at least one non-lethal hit').toBe(true);
  });
});
