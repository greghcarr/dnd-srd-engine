// Slice 874 — Acid Arrow (L2): half-on-miss + the delayed 2d4. Closes the L7
// audit Area-2 row `acid-arrow-no-delayed-or-miss` ("wired as flat 4d4 on hit;
// RAW adds 2d4 at end of target's next turn and half on a miss").
//
// RAW (SRD 5.2.1 Acid Arrow, Wizard): "Make a ranged spell attack against the
// target. On a hit, the target takes 4d4 Acid damage and 2d4 Acid damage at the
// end of its next turn. On a miss, the arrow splashes the target with acid for
// half as much of the initial damage only."
//
// Wiring: a new `halfDamageOnMiss` flag on the attack mechanic (the rolled
// initial damage is halved on a miss, the same outcome as the Potent-Cantrip
// path); the delayed 2d4 reuses the slice-825 `recurringDamage` — `conditionOnHit`
// applies `acid-arrow-burning` on a hit (and only a hit), and the consumer ticks
// `tickRecurringDamage` at the target's turn-end for the one drip. The +1d4/slot
// upcast on the delayed die is deferred (static condition dice).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent, ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
    knownSpells: ['acid-arrow'],
    preparedSpells: ['acid-arrow'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const seedParty = (engine: ReturnType<typeof createEngine>, name: string, ...party: Character[]): Campaign => {
  let campaign = engine.createCampaign({ name });
  campaign = commit(
    campaign,
    party.map((c) => ({
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c,
    }) satisfies CharacterCreatedEvent),
  );
  return campaign;
};

const acidTotal = (dmg: DamageAppliedEvent | undefined): number =>
  dmg?.components.filter((c) => c.type === 'acid').reduce((s, c) => s + c.amount, 0) ?? 0;

describe('Acid Arrow (slice 874)', () => {
  it('wires half-on-miss + an on-hit delayed-2d4 condition carrying recurringDamage', () => {
    const mech = PACK.spells.find((s) => s.id === 'acid-arrow')?.mechanicalEffects?.[0] as
      | { kind: string; halfDamageOnMiss?: boolean; conditionOnHit?: string }
      | undefined;
    expect(mech?.kind).toBe('attack');
    expect(mech?.halfDamageOnMiss).toBe(true);
    expect(mech?.conditionOnHit).toBe('acid-arrow-burning');
    const cond = CONTENT.conditions.get('acid-arrow-burning');
    expect(cond?.recurringDamage).toEqual({ dice: '2d4', damageType: 'acid', trigger: 'turnEnd' });
  });

  it('a hit deals 4d4 Acid and applies the lingering condition; a miss deals half and no condition', () => {
    let sawHit = false;
    let sawMiss = false;
    for (let seed = 1; seed < 80 && !(sawHit && sawMiss); seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const wizard = buildWizard();
      const target = buildTarget();
      const campaign = seedParty(engine, `aa-${seed}`, wizard, target);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id, spellId: 'acid-arrow', slotLevel: 2, targetIds: [target.id],
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent;
      const rolled = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      const applied = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
      const condition = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'acid-arrow-burning',
      );
      const fullRoll = (rolled?.rolls ?? []).reduce(
        (s, r) => s + r.rolls.reduce((a, b) => a + b, 0) + r.modifier, 0,
      );
      if (attack.hit) {
        sawHit = true;
        expect(acidTotal(applied)).toBe(fullRoll); // full initial damage
        expect(condition, 'a hit applies the lingering acid').toBeDefined();
      } else {
        sawMiss = true;
        expect(acidTotal(applied), 'a miss deals half the initial').toBe(Math.floor(fullRoll / 2));
        expect(condition, 'a miss applies no lingering acid').toBeUndefined();
      }
    }
    expect(sawHit, 'saw a hit').toBe(true);
    expect(sawMiss, 'saw a miss').toBe(true);
  });

  it('the lingering condition drips 2d4 Acid when ticked at the target\'s turn-end', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const wizard = buildWizard();
      const target = buildTarget();
      let campaign = seedParty(engine, `aa-tick-${seed}`, wizard, target);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id, spellId: 'acid-arrow', slotLevel: 2, targetIds: [target.id],
      }).events;
      if (!cast.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'acid-arrow-burning')) {
        continue; // need a hit
      }
      campaign = commit(campaign, cast);
      const tick = engine.plan.tickRecurringDamage(campaign.state, {
        targetId: target.id, conditionId: 'acid-arrow-burning',
      }).events;
      const drip = tick.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
      const total = acidTotal(drip);
      expect(total, 'the delayed drip is 2d4 Acid').toBeGreaterThanOrEqual(2);
      expect(total).toBeLessThanOrEqual(8);
      return;
    }
    throw new Error('no hit seed across 80 tries');
  });
});
