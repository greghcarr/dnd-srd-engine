// Slice 317 — magic equipment modeling, stage 3: multi-base enchantment
// overlay. A base weapon/armor instance references a magic-item
// enchantment via `enchantmentDefinitionId`; the attack planner, AC
// derive, effect projection, and magicality detector overlay the
// enchantment's fields onto the base. This unblocks the multi-base
// magic equipment (Frost Brand = any of 6 weapons, "+N weapon/armor")
// whose base is chosen at instance creation.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { computeAttackBonus } from '../../../src/derive/attack.js';
import { computeAC } from '../../../src/derive/ac.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { isMagicWeaponAttack } from '../../../src/derive/magicality.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// A base item instance carrying an enchantment overlay.
const enchanted = (baseId: string, enchantmentId: string): ItemInstance =>
  ItemInstanceSchema.parse({
    id: newItemInstanceId(),
    definitionId: baseId,
    enchantmentDefinitionId: enchantmentId,
  });

const buildFighter = (weapon: ItemInstance, overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Fighter',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    inventory: [weapon.id],
    equipped: { mainHand: weapon.id, attuned: [weapon.id] as never },
    ...overrides,
  });

describe('slice 317: weapon enchantment overlay (+N)', () => {
  it('a +2 weapon enchantment on a longsword adds +2 attack', () => {
    const sword = enchanted('longsword', 'weapon-plus-2');
    const plain = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });
    const fighter = buildFighter(sword);
    const items = { [sword.id]: sword, [plain.id]: plain };
    const withEnch = computeAttackBonus({ character: fighter, itemInstances: items, content: CONTENT, weaponInstanceId: sword.id });
    const without = computeAttackBonus({ character: { ...fighter, equipped: { mainHand: plain.id, attuned: [] } }, itemInstances: items, content: CONTENT, weaponInstanceId: plain.id });
    expect(withEnch.total - without.total).toBe(2);
    expect(withEnch.breakdown.some((b) => b.source === 'enchantment:weapon-plus-2')).toBe(true);
  });

  it('an enchanted base weapon counts as magical', () => {
    const sword = enchanted('longsword', 'weapon-plus-1');
    const plainDef = CONTENT.items.get('longsword')!;
    expect(isMagicWeaponAttack(sword, plainDef)).toBe(true);
    const plain = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });
    expect(isMagicWeaponAttack(plain, plainDef)).toBe(false);
  });
});

describe('slice 317: Frost Brand enchantment (onHit cold + fire resistance)', () => {
  it('a hit with a Frost Brand longsword adds a cold damage component', () => {
    const fb = enchanted('longsword', 'frost-brand');
    const victim = CharacterSchema.parse({
      id: newCharacterId(), name: 'Dummy', speciesId: 'human', backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
      abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 12, WIS: 10, CHA: 10 },
      hp: { current: 200, max: 200, temp: 0 }, armorClass: 8,
    });
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const fighter = buildFighter(fb);
      let campaign: Campaign = engine.createCampaign({ name: `fb-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fb },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, { attackerId: fighter.id, targetId: victim.id, weaponInstanceId: fb.id }).events;
      const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== true) continue;
      const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled')!;
      expect(damage.rolls.some((r) => r.type === 'cold'), 'expected a cold rider').toBe(true);
      return;
    }
    throw new Error('no hit found in 60 seeds');
  });

  it('Frost Brand projects fire resistance to the wielder', () => {
    const fb = enchanted('longsword', 'frost-brand');
    const fighter = buildFighter(fb);
    const e = buildEffectStack({ character: fighter, itemInstances: { [fb.id]: fb }, content: CONTENT, pendingChoices: {} });
    expect(e.hasResistance('fire')).toBe(true);
  });
});

describe('slice 317: armor enchantment overlay (+N AC)', () => {
  it('a +1 armor enchantment on plate adds +1 AC', () => {
    const armor = enchanted('plate', 'armor-plus-1');
    const wearer = CharacterSchema.parse({
      id: newCharacterId(), name: 'Tank', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 44, max: 44, temp: 0 },
      inventory: [armor.id], equipped: { armor: armor.id as never, attuned: [] },
    });
    const ac = computeAC({ character: wearer, itemInstances: { [armor.id]: armor }, content: CONTENT });
    expect(ac.total).toBe(19); // plate 18 (heavy, no DEX) + 1
  });
});
