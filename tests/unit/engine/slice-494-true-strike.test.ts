// Slice 494: True Strike (2024 cantrip) - the spell-casts-a-weapon-attack
// mechanic. Closes the True Strike slot from the L1 schema-only audit.
//
// RAW (SRD 5.2.1 True Strike, cantrip, Bard/Sorcerer/Warlock/Wizard):
// "Guided by a flash of magical insight, you make one attack with the
// weapon used in the spell's casting. The attack uses your spellcasting
// ability for the attack and damage rolls instead of using Strength or
// Dexterity. If the attack deals damage, it can be Radiant damage or
// the weapon's normal damage type (your choice)."
//
// Engine additions:
//   - `abilityOverride?: AbilityScore` on AttackIntent + ResolveAttackInput
//     + ComputeAttackInput. When set, the attack-bonus and damage-mod
//     computations use this ability instead of the weapon-property-driven
//     default (STR/DEX).
//   - New SpellMechanic `kind: 'weaponAttack'`. Pure-marker mechanic
//     (no inner fields in this first ship).
//   - New `weaponInstanceId?: string` field on CastSpellIntent.
//   - New `planWeaponAttackMechanic` function in cast-spell.ts that
//     reads the weapon + caster's spellcasting ability and delegates
//     to resolveAttack with abilityOverride set.
//
// Content additions:
//   - True Strike's mechanicalEffects changed from [] to
//     [{ kind: 'weaponAttack' }].
//
// Deferred RAW arms (documented in the mechanic definition):
//   - Damage-type choice (radiant-or-normal). Attack deals the
//     weapon's printed damage type for now.
//   - Cantrip-scaling extra Radiant at L5/L11/L17 (+1d6/+2d6/+3d6).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildWizard = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 8, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: ['true-strike'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('True Strike (slice 494)', () => {
  it('true-strike spell ships with a weaponAttack mechanic', () => {
    const s = PACK.spells.find((sp) => sp.id === 'true-strike');
    expect(s?.mechanicalEffects).toEqual([{ kind: 'weaponAttack' }]);
  });

  it('casting True Strike with a quarterstaff emits an AttackRolled event using INT mod (not STR)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const wizard = buildWizard(1);
    const target = buildTarget();
    const staff = makeItemInstance('quarterstaff');
    let campaign: Campaign = engine.createCampaign({ name: 'true-strike' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: staff },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'true-strike',
      slotLevel: 0,
      targetIds: [target.id],
      weaponInstanceId: staff.id,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
    expect(attack).toBeDefined();
    expect(attack?.attackerId).toBe(wizard.id);
    expect(attack?.targetId).toBe(target.id);
    // Wizard: INT 18 (+4), STR 8 (-1). 2024 Wizard has no weapon
    // proficiencies in the pack, so attackBonus = ability mod only.
    // With True Strike's abilityOverride: INT +4. Without it (normal
    // quarterstaff attack), STR -1. The +5 delta proves the override
    // landed.
    expect(attack?.attackBonus).toBe(4);
  });

  it('a True Strike cast without weaponInstanceId throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const wizard = buildWizard(1);
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'no-weapon' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'true-strike',
        slotLevel: 0,
        targetIds: [target.id],
      }),
    ).toThrow(/weaponAttack mechanic and requires intent.weaponInstanceId/i);
  });

  it('damage roll on hit uses INT mod (not STR/DEX)', () => {
    // Try a few seeds to find a hit.
    for (let seed = 1; seed < 30; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const wizard = buildWizard(5);
      const target = buildTarget();
      const staff = makeItemInstance('quarterstaff');
      let campaign: Campaign = engine.createCampaign({ name: `damage-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: staff },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'true-strike',
        slotLevel: 0,
        targetIds: [target.id],
        weaponInstanceId: staff.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const dmg = events.find((e) => e.type === 'DamageRolled') as { rolls?: ReadonlyArray<{ modifier?: number }> } | undefined;
      expect(dmg).toBeDefined();
      // Quarterstaff 1d6, INT mod +4. Damage = roll(1d6) + 4. Verify
      // the rolls carry an INT-mod component (not STR -1).
      expect(dmg!.rolls![0]!.modifier).toBe(4);
      return;
    }
    throw new Error('No hit across 30 seeds');
  });
});
