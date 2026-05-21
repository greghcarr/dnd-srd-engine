// Slice 372 - Ray of Frost / Shocking Grasp didn't scale with level.
//
// Bug (generalizing the slice-370/371 phantom-field sweep to all content):
// four cantrips carried a top-level `cantripScalingDice` map
// ({ "5": "2d8", ... }) that `SpellSchema` doesn't have, so Zod stripped
// it. The engine only reads the per-mechanic `cantripScalingDice` string.
// Ray of Frost and Shocking Grasp had it ONLY at the top level (not in
// their attack mechanic), so they stayed 1d8 at every level. Fix: added
// `cantripScalingDice: '1d8'` to their mechanics (RAW: +1d8 at L5/11/17),
// removed the dead top-level maps from all four, and made `SpellSchema`
// `.strict()`. Eldritch Blast scales by adding beams (separate attack
// rolls), not dice, so its map was a wrong model - removed and left as a
// documented deferral (needs multi-beam support); Sacred Flame already
// scaled via its mechanic, so its map was redundant.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { SpellSchema } from '../../../src/schemas/content/spell.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const ONE_D8_MAX = 8;

const buildWizard = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Mage', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    preparedSpells: ['ray-of-frost', 'shocking-grasp'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
  });

// Returns the max hit-damage seen across seeds for a cantrip at a level.
const maxHitDamage = (spellId: string, level: number): number => {
  let max = 0;
  for (let seed = 1; seed < 60; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const caster = buildWizard(level);
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: `${spellId}-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: caster.id, spellId, slotLevel: 0, targetIds: [target.id],
    }).events as ReadonlyArray<Event>;
    const ar = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (ar?.hit !== true) continue;
    if (ar.critical === true) continue; // a crit doubles the dice; exclude so the cap reflects the die count, not the crit
    const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
    const total = dmg?.components.reduce((s, c) => s + c.amount, 0) ?? 0;
    if (total > max) max = total;
  }
  return max;
};

describe('slice 372: Ray of Frost / Shocking Grasp scale with level', () => {
  it('Ray of Frost rolls more than 1d8 at level 5 (it scales)', () => {
    // At L1 the max is a single 1d8 (8). At L5 it should be 2d8, so some
    // hit must exceed 8 - impossible with one die.
    expect(maxHitDamage('ray-of-frost', 1)).toBeLessThanOrEqual(ONE_D8_MAX);
    expect(maxHitDamage('ray-of-frost', 5)).toBeGreaterThan(ONE_D8_MAX);
  });

  it('Shocking Grasp rolls more than 1d8 at level 5 (it scales)', () => {
    expect(maxHitDamage('shocking-grasp', 1)).toBeLessThanOrEqual(ONE_D8_MAX);
    expect(maxHitDamage('shocking-grasp', 5)).toBeGreaterThan(ONE_D8_MAX);
  });

  it('the scaling lives on the mechanic (not a stripped top-level field)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    for (const id of ['ray-of-frost', 'shocking-grasp']) {
      const me = engine.content.spells.get(id)?.mechanicalEffects?.[0] as { cantripScalingDice?: string } | undefined;
      expect(me?.cantripScalingDice, `${id} mechanic should carry cantripScalingDice`).toBe('1d8');
    }
  });

  it('SpellSchema rejects a misplaced top-level cantripScalingDice (the .strict() guard)', () => {
    const phantom = SpellSchema.safeParse({
      id: 'x', name: 'X', level: 0, school: 'evocation', castingTime: 'Action',
      range: '60 feet', components: { verbal: true }, duration: 'Instantaneous',
      cantripScalingDice: { '5': '2d8' }, // misplaced top-level field
      mechanicalEffects: [{ kind: 'attack', damageDice: '1d8', damageType: 'cold' }],
    });
    expect(phantom.success).toBe(false);
  });
});
