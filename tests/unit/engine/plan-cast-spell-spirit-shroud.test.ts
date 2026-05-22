import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { Campaign } from '../../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { DamageType } from '../../../src/schemas/primitives.js';
import { eventId, isoTimestamp, makeItemInstance, loadPhbExtrasTestPack } from '../../fixtures/index.js';

// Tests Spirit Shroud's three caster-chosen damage variants. The
// condition lives on the caster; the rider fires on every successful
// attack the caster makes, adding +1d8 of the chosen type. RAW gates
// the rider on the target being within 10 ft; that range gate isn't
// modeled (engine doesn't track positions). Tests pin the damage-type
// routing, not the range semantics.

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Shroud',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    hp: { current: 42, max: 42, temp: 0 },
    featsTaken: [],
    preparedSpells: ['spirit-shroud'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 60, max: 60, temp: 0 },
    featsTaken: [],
  });

describe("Spirit Shroud caster-chosen damage type (3-variant buff with attacker-side rider)", () => {
  it.each<[string, DamageType]>([
    ['cold', 'cold'],
    ['necrotic', 'necrotic'],
    ['radiant', 'radiant'],
  ])("the '%s' variant adds +1d8 %s to the caster's hits", (variantKey, damageType) => {
    for (let seed = 1; seed < 100; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const caster = buildCleric();
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `shroud-${variantKey}-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);

      campaign = commit(
        campaign,
        engine.plan.castSpell(campaign.state, {
          characterId: caster.id,
          spellId: 'spirit-shroud',
          slotLevel: 3,
          targetIds: [caster.id],
          casterChoice: { kind: 'variant', value: variantKey },
        }).events,
      );

      const attack = engine.plan.attack(campaign.state, {
        attackerId: caster.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      }).events;
      const attackRolled = attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attackRolled?.hit !== true) continue;

      const damageOfType = attack.find(
        (e) =>
          e.type === 'DamageApplied'
          && (e as DamageAppliedEvent).components.some((c) => c.type === damageType),
      ) as DamageAppliedEvent | undefined;
      expect(damageOfType, `expected a ${damageType} DamageApplied from the spirit-shroud rider`).toBeDefined();
      const amount = damageOfType!.components
        .filter((c) => c.type === damageType)
        .reduce((sum, c) => sum + c.amount, 0);
      expect(amount).toBeGreaterThanOrEqual(1);
      expect(amount).toBeLessThanOrEqual(attackRolled.critical ? 16 : 8);
      return;
    }
    throw new Error(`no seed produced a hit for variant ${variantKey}`);
  });

  it('throws when no casterChoice is supplied', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(0) });
    const caster = buildCleric();
    let campaign: Campaign = engine.createCampaign({ name: 'shroud-missing-choice' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: caster.id,
        spellId: 'spirit-shroud',
        slotLevel: 3,
        targetIds: [caster.id],
      }),
    ).toThrow(/casterChoice/);
  });
});
