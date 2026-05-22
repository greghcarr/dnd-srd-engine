// Property test: plan determinism.
//
// Asserts the architectural promise that planners are deterministic
// in their RNG: same seed + same state + same intent must produce the
// same rolls. The test compares the *roll payloads* (d20 / damage
// dice) rather than ULIDs, because ULID factories use time + random
// and aren't part of the plan-determinism contract.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ulid } from 'ulid';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { TEST_PACK, buildFighter, makeItemInstance } from '../fixtures/index.js';
import type { Event } from '../../src/schemas/events/index.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../src/schemas/events/attack.js';

const NUM_RUNS = Number.parseInt(process.env['FAST_CHECK_NUM_RUNS'] ?? '50', 10);

const setupAttack = (seed: number) => {
  const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(seed) });
  const longsword = makeItemInstance('longsword');
  const armor = makeItemInstance('chain-mail');
  const attacker = buildFighter({ STR: 18 });
  const target = buildFighter({ hpMax: 50, hpCurrent: 50, armorInstanceId: armor.id });
  let campaign = engine.createCampaign({ name: 'plan-prop' });
  campaign = commit(campaign, [
    { id: ulid() as Event['id'], at: '2026-01-01T00:00:00Z', type: 'ItemAcquired', instance: longsword },
    { id: ulid() as Event['id'], at: '2026-01-01T00:00:00Z', type: 'ItemAcquired', instance: armor },
    { id: ulid() as Event['id'], at: '2026-01-01T00:00:00Z', type: 'CharacterCreated', snapshot: attacker },
    { id: ulid() as Event['id'], at: '2026-01-01T00:00:00Z', type: 'CharacterCreated', snapshot: target },
  ]);
  return {
    engine,
    state: campaign.state,
    attackerId: attacker.id,
    targetId: target.id,
    weaponInstanceId: longsword.id,
  };
};

const rollSignature = (events: ReadonlyArray<Event>): string => {
  // Extract the dice payloads only — ignore ULIDs and any time-dependent
  // bits. Same seed + same state → same signature.
  const parts: string[] = [];
  for (const e of events) {
    if (e.type === 'AttackRolled') {
      const a = e as AttackRolledEvent;
      parts.push(`atk:${a.d20.join(',')}|used=${a.used}|crit=${a.critical}|hit=${a.hit}`);
    } else if (e.type === 'DamageRolled') {
      const d = e as DamageRolledEvent;
      const rolls = d.rolls.map((r) => `${r.expression}:${r.rolls.join(',')}+${r.modifier}`).join('|');
      parts.push(`dmg:${rolls}|crit=${d.critical}`);
    }
  }
  return parts.join(';;');
};

describe('property: plan() is deterministic in its seed', () => {
  it('same seed → byte-equivalent dice payloads', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (seed) => {
        const a = setupAttack(seed);
        const b = setupAttack(seed);
        const evA = a.engine.plan.attack(a.state, {
          attackerId: a.attackerId,
          targetId: a.targetId,
          weaponInstanceId: a.weaponInstanceId,
        }).events;
        const evB = b.engine.plan.attack(b.state, {
          attackerId: b.attackerId,
          targetId: b.targetId,
          weaponInstanceId: b.weaponInstanceId,
        }).events;
        expect(rollSignature(evA)).toBe(rollSignature(evB));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('different seeds produce at least one differing payload (across enough samples)', () => {
    // The contract: plan() depends meaningfully on the RNG. Two
    // different seeds should differ on *some* property we can observe.
    // We sweep a batch and accept the property if ANY pair differs —
    // weaker than "every pair differs" (a few seeds could
    // legitimately produce identical attacks at the same state), but
    // strong enough to catch a regression where plan() ignored the
    // RNG entirely.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100_000 }), { minLength: 10, maxLength: 10 }),
        (seeds) => {
          const signatures = new Set<string>();
          for (const s of seeds) {
            const ctx = setupAttack(s);
            const events = ctx.engine.plan.attack(ctx.state, {
              attackerId: ctx.attackerId,
              targetId: ctx.targetId,
              weaponInstanceId: ctx.weaponInstanceId,
            }).events;
            signatures.add(rollSignature(events));
          }
          // With 10 distinct seeds, at minimum 2 distinct signatures
          // should appear — otherwise the RNG isn't driving the plan.
          expect(signatures.size).toBeGreaterThanOrEqual(2);
        },
      ),
      { numRuns: Math.min(NUM_RUNS, 100) }, // each iteration runs 10 plans; cap total work
    );
  });
});
