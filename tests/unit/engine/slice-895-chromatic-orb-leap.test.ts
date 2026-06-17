// Slice 895 — Chromatic Orb's leap. Closes the L7 audit Area-2 quirk
// `chromatic-orb-no-leap`.
//
// RAW: "On a hit, the target takes 3d8 damage of the chosen type. If you roll
// the same number on two or more of the d8s, the orb leaps to a different
// target of your choice within 30 feet ... Make an attack roll against the new
// target, and make a new damage roll. The orb can't leap again unless you cast
// the spell with a level 2+ spell slot." Upcast: "leap a maximum number of
// times equal to the level of the slot expended, and a creature can be targeted
// only once by each casting."
//
// The leap target is consumer-supplied (`leapTargetIds`, within 30 ft — a
// positional fact); the engine detects the 2+-matching-d8s trigger and chains a
// fresh attack + damage at the next leap target, capped at `slotLevel` leaps,
// each creature once.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Mage', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 }, featsTaken: [],
    preparedSpells: ['chromatic-orb'],
  });

const buildTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'commoner', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 8, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 }, featsTaken: [],
  });

interface CastResult {
  readonly attacks: ReadonlyArray<AttackRolledEvent>;
  readonly damages: ReadonlyArray<DamageRolledEvent>;
  readonly t1: string;
  readonly t2: string;
  readonly t3: string;
}

const cast = (seed: number, slotLevel: number, leapTargetIds: (ids: string[]) => string[]): CastResult => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const wizard = buildWizard();
  const t1 = buildTarget('T1'); const t2 = buildTarget('T2'); const t3 = buildTarget('T3');
  let campaign: Campaign = engine.createCampaign({ name: 'chromatic' });
  campaign = commit(campaign, [wizard, t1, t2, t3].map((c) =>
    ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent));
  const events = engine.plan.castSpell(campaign.state, {
    characterId: wizard.id, spellId: 'chromatic-orb', slotLevel, targetIds: [t1.id],
    casterChoice: { kind: 'damageType', value: 'fire' },
    leapTargetIds: leapTargetIds([t2.id, t3.id]),
  }).events;
  return {
    attacks: events.filter((e): e is AttackRolledEvent => e.type === 'AttackRolled'),
    damages: events.filter((e): e is DamageRolledEvent => e.type === 'DamageRolled'),
    t1: t1.id, t2: t2.id, t3: t3.id,
  };
};

const primaryHitWithMatch = (r: CastResult): boolean => {
  const primaryAttack = r.attacks.find((a) => a.targetId === r.t1);
  if (primaryAttack === undefined || !primaryAttack.hit) return false;
  const dmg = r.damages.find((d) => d.targetId === r.t1);
  if (dmg === undefined) return false;
  const d8s = dmg.rolls[0]!.rolls;
  return new Set(d8s).size < d8s.length; // 2+ equal d8s
};

describe('Chromatic Orb leap (slice 895)', () => {
  it('leaps to the next target on a hit with 2+ matching d8s (new attack + damage)', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const r = cast(seed, 2, (ids) => ids);
      if (!primaryHitWithMatch(r)) continue;
      // A leap fired: T2 received its own attack roll + damage roll.
      expect(r.attacks.some((a) => a.targetId === r.t2)).toBe(true);
      expect(r.damages.some((d) => d.targetId === r.t2)).toBe(true);
      return;
    }
    throw new Error('no hit-with-matching-d8s seed found in 300 tries');
  });

  it('does NOT leap when the d8s are all distinct', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const r = cast(seed, 2, (ids) => ids);
      const primaryAttack = r.attacks.find((a) => a.targetId === r.t1);
      const dmg = r.damages.find((d) => d.targetId === r.t1);
      if (primaryAttack === undefined || !primaryAttack.hit || dmg === undefined) continue;
      const d8s = dmg.rolls[0]!.rolls;
      if (new Set(d8s).size !== d8s.length) continue; // want all-distinct
      // No match → no leap: only the primary was attacked.
      expect(r.attacks.some((a) => a.targetId === r.t2)).toBe(false);
      expect(r.attacks).toHaveLength(1);
      return;
    }
    throw new Error('no all-distinct-d8s seed found in 300 tries');
  });

  it('does not leap when the consumer supplies no leap targets (graceful)', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const r = cast(seed, 2, () => []);
      if (!primaryHitWithMatch(r)) continue;
      expect(r.attacks).toHaveLength(1); // matched, but nowhere to leap
      return;
    }
    throw new Error('no hit-with-matching-d8s seed found in 300 tries');
  });

  it('at slot level 1 the orb leaps at most once (max leaps = slot level)', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const r = cast(seed, 1, (ids) => ids); // two leap targets offered, budget 1
      if (!primaryHitWithMatch(r)) continue;
      // Even if the first leap also matched, the slot-1 budget caps leaps at 1,
      // so T3 (the second leap target) is never attacked.
      expect(r.attacks.some((a) => a.targetId === r.t3)).toBe(false);
      expect(r.attacks.length).toBeLessThanOrEqual(2);
      return;
    }
    throw new Error('no hit-with-matching-d8s seed found in 300 tries');
  });
});
