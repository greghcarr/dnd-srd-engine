// Slice 316 — magic equipment modeling, stage 2: magic weapons.
//
// Single-base magic weapons now ship as itemKind 'weapon' (was
// 'magic'), so the attack planner wields them and applies the
// enhancement: `attackBonus` / `damageBonus` (Sun Blade +2), the
// intrinsic `onHit` per-hit rider (Thunderous Greatclub +1d8 thunder),
// projected `effects` (Thunderous Greatclub's STR-20 floor), and the
// counts-as-magical resistance bypass.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { computeAttackBonus } from '../../../src/derive/attack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { isMagicWeaponAttack } from '../../../src/derive/magicality.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildFighter = (weaponId: string, overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Fighter',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    inventory: [weaponId],
    equipped: { mainHand: weaponId, attuned: [weaponId] as never },
    ...overrides,
  });

describe('slice 316: magic-weapon enhancement bonus', () => {
  it('Sun Blade gives +2 to the attack bonus (vs a mundane longsword)', () => {
    const sun = makeItemInstance('sun-blade');
    const plain = makeItemInstance('longsword');
    const fighter = buildFighter(sun.id);
    const items = { [sun.id]: sun, [plain.id]: plain };
    const withSun = computeAttackBonus({ character: fighter, itemInstances: items, content: CONTENT, weaponInstanceId: sun.id });
    const withPlain = computeAttackBonus({ character: { ...fighter, equipped: { mainHand: plain.id, attuned: [] } }, itemInstances: items, content: CONTENT, weaponInstanceId: plain.id });
    expect(withSun.total - withPlain.total).toBe(2);
    expect(withSun.breakdown.some((b) => b.source === 'magic-weapon:sun-blade')).toBe(true);
  });

  it('a magic weapon counts as magical for resistance bypass', () => {
    const sun = makeItemInstance('sun-blade');
    const def = CONTENT.items.get('sun-blade')!;
    expect(isMagicWeaponAttack(sun, def)).toBe(true);
    const plainDef = CONTENT.items.get('longsword')!;
    expect(isMagicWeaponAttack(makeItemInstance('longsword'), plainDef)).toBe(false);
  });
});

describe('slice 316: intrinsic onHit rider (Thunderous Greatclub +1d8 thunder)', () => {
  it('a hit with Thunderous Greatclub adds a thunder damage component', () => {
    const club = makeItemInstance('thunderous-greatclub');
    const victim = CharacterSchema.parse({
      id: newCharacterId(), name: 'Dummy', speciesId: 'human', backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
      abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 12, WIS: 10, CHA: 10 },
      hp: { current: 200, max: 200, temp: 0 }, armorClass: 8,
    });
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const fighter = buildFighter(club.id);
      let campaign: Campaign = engine.createCampaign({ name: `tg-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, { attackerId: fighter.id, targetId: victim.id, weaponInstanceId: club.id }).events;
      const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== true) continue;
      const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled')!;
      const thunder = damage.rolls.find((r) => r.type === 'thunder');
      expect(thunder, 'expected a thunder rider component').toBeDefined();
      expect(thunder!.rolls.length).toBeGreaterThanOrEqual(1);
      return;
    }
    throw new Error('no hit found in 60 seeds');
  });
});

describe('slice 316: magic-weapon effects project while held + attuned', () => {
  it('Thunderous Greatclub sets a STR-20 floor', () => {
    const club = makeItemInstance('thunderous-greatclub');
    const fighter = buildFighter(club.id, { abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 } });
    const e = buildEffectStack({ character: fighter, itemInstances: { [club.id]: club }, content: CONTENT, pendingChoices: {} });
    expect(e.effectiveAbilityScoreFloor('STR')?.value).toBe(20);
  });

  it('Quarterstaff of the Acrobat grants +2 attack and Acrobatics advantage', () => {
    const qs = makeItemInstance('quarterstaff-of-the-acrobat');
    const fighter = buildFighter(qs.id);
    const items = { [qs.id]: qs };
    const e = buildEffectStack({ character: fighter, itemInstances: items, content: CONTENT, pendingChoices: {} });
    expect(e.advantageFor({ kind: 'skill', skill: 'acrobatics' }).advantage).toBe(true);
    const ab = computeAttackBonus({ character: fighter, itemInstances: items, content: CONTENT, weaponInstanceId: qs.id });
    expect(ab.breakdown.some((b) => b.source === 'magic-weapon:quarterstaff-of-the-acrobat')).toBe(true);
  });
});
