// Slice 450: `noAbilityModifierDamage` weapon flag.
//
// Closes the slice-449 documented RAW deviation for Sprite Enchanting
// Bow. RAW (SRD 5.2.1 Sprite Enchanting Bow): "Hit: 1 Piercing damage,
// and the target has the Charmed condition until the start of the
// sprite's next turn." The "1" is a flat number, not "1 + DEX". Before
// slice 450 the attack planner's automatic +ability_mod fold inflated
// the Sprite's 1 damage to ~5 (DEX 18 -> +4).
//
// Slice 450 adds an opt-in `noAbilityModifierDamage: true` flag on the
// weapon definition. When set, the planner zeros the ability fold for
// both the primary attack and any Cleave secondary that would have
// stripped the same mod (defensive even though Cleave is melee-only).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildSprite = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Sprite',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'sprite',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 3, DEX: 18, CON: 10, INT: 14, WIS: 13, CHA: 11 },
    hp: { current: 10, max: 10, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

describe('noAbilityModifierDamage weapon flag (slice 450)', () => {
  it('Sprite Enchanting Bow on a hit deals exactly 1 damage despite Sprite DEX +4', () => {
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt) });
      const bow = makeItemInstance('sprite-enchanting-bow');
      const sprite = buildSprite();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'flat-damage' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow },
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: sprite,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: target,
        } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: sprite.id,
        targetId: target.id,
        weaponInstanceId: bow.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as
        | AttackRolledEvent
        | undefined;
      if (attack?.hit !== true) continue;

      const damageRolled = events.find((e) => e.type === 'DamageRolled') as
        | DamageRolledEvent
        | undefined;
      expect(damageRolled).toBeDefined();
      // Base damage roll (the first entry; subsequent entries are riders
      // like Charmed-applying-condition does not roll dice). The bow
      // ships with damageDice '0d4+1' (zero dice, +1 flat) and
      // noAbilityModifierDamage: true, so the modifier should be exactly
      // 1 (the +1 from the expression, plus 0 from ability mod) and the
      // rolls array should be empty (0d4).
      const baseRoll = damageRolled!.rolls.find((r) => r.type === 'piercing');
      expect(baseRoll).toBeDefined();
      expect(baseRoll!.rolls.length).toBe(0);
      expect(baseRoll!.modifier).toBe(1);
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });

  it('Sprite Needle Sword (no flag) still receives the wielder DEX mod (control)', () => {
    // Sprite has no STR/DEX-finesse bias to worry about — the Needle
    // Sword is a simple melee 1d4 with no `finesse` property, so it
    // uses STR. Sprite STR is 3 (mod -4). So damage on a hit is
    // 1d4 + (-4) (with the negative-mod clamp at zero per RAW... let me
    // check the engine).
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt + 200) });
      const sword = makeItemInstance('sprite-needle-sword');
      const sprite = buildSprite();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'control' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: sprite,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: target,
        } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: sprite.id,
        targetId: target.id,
        weaponInstanceId: sword.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as
        | AttackRolledEvent
        | undefined;
      if (attack?.hit !== true) continue;

      const damageRolled = events.find((e) => e.type === 'DamageRolled') as
        | DamageRolledEvent
        | undefined;
      expect(damageRolled).toBeDefined();
      // The damage modifier should include the wielder's STR mod (-4
      // for STR 3), proving the flag isn't a global behavior change.
      const baseRoll = damageRolled!.rolls.find((r) => r.type === 'piercing');
      expect(baseRoll).toBeDefined();
      expect(baseRoll!.modifier).toBe(-4);
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });
});
