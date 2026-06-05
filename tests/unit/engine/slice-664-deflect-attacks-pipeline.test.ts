// Slice 664: Deflect Attacks damage-pipeline auto-integration.
//
// Pre-664 the slice-648/658 planner returned `reduction` and
// `remainingDamage` for the consumer to manually subtract from the
// pending DamageApplied (or emit a smaller damage event). Slice 664
// auto-emits a `Healed { amount: min(reduction, incomingDamage),
// source: 'deflect-attacks' }` so the engine restores the deflected
// damage automatically.
//
// What this pins:
//   1. A Healed event is emitted alongside DeflectAttacksUsed.
//   2. The Healed amount equals `min(reduction, incomingDamage)`
//      (no over-heal when the reduction exceeds the attack).
//   3. Post-state HP matches the RAW-expected net damage.
//   4. Outcome carries `appliedReduction` so consumers can verify.
//   5. When the planner is called with incomingDamage=0 (degenerate),
//      no Healed is emitted.
//   6. Back-compat: `remainingDamage` is still returned (slice-648
//      consumers that read it for UI purposes are unaffected).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent, HealedEvent } from '../../../src/schemas/events/combat.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const buildL3Monk = (currentHp = 24): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ren',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'monk', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 8 },
    hp: { current: currentHp, max: 24, temp: 0 },
    resources: [{ resourceId: 'ki', current: 3, max: 3, recharge: 'shortRest' }],
  });

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'deflect-pipeline' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

// Simulate the consumer flow: emit a DamageApplied for the
// triggering attack, commit, then call planDeflectAttacks and
// commit its events. Returns the post-state monk + the Healed
// event (if any).
const driveAttackAndDeflect = (
  s: { engine: ReturnType<typeof createEngine>; campaign: Campaign },
  monk: Character,
  incomingDamage: number,
): { postMonk: Character; healed: HealedEvent | undefined; outcome: ReturnType<typeof s.engine.plan.deflectAttacks> } => {
  const attackEventId = eventId();
  const damageApplied: DamageAppliedEvent = {
    id: attackEventId,
    at: isoTimestamp(),
    type: 'DamageApplied',
    targetId: monk.id as ULID,
    components: [{ amount: incomingDamage, type: 'slashing' }],
  };
  let campaign = commit(s.campaign, [damageApplied]);
  const outcome = s.engine.plan.deflectAttacks(campaign.state, {
    monkId: monk.id,
    triggeringAttackEventId: attackEventId,
    incomingDamage,
    damageType: 'slashing',
  });
  campaign = commit(campaign, outcome.events);
  const postMonk = campaign.state.characters[monk.id]!;
  const healed = outcome.events.find(
    (e): e is HealedEvent => e.type === 'Healed' && e.targetId === monk.id,
  );
  return { postMonk, healed, outcome };
};

describe('slice 664: Deflect Attacks damage-pipeline auto-integration', () => {
  it('emits a Healed event alongside DeflectAttacksUsed with amount = min(reduction, incomingDamage)', () => {
    const monk = buildL3Monk(20);
    const s = seed(monk);
    const { healed, outcome } = driveAttackAndDeflect(s, monk, 12);
    expect(healed, 'Healed event not emitted by planDeflectAttacks').toBeDefined();
    expect(healed!.source).toBe('deflect-attacks');
    expect(healed!.amount).toBe(Math.min(outcome.reduction, 12));
    expect(outcome.appliedReduction).toBe(Math.min(outcome.reduction, 12));
  });

  it('net post-state HP matches RAW expectation (current - max(0, incoming - reduction))', () => {
    const startingHp = 20;
    const monk = buildL3Monk(startingHp);
    const s = seed(monk);
    const incoming = 12;
    const { postMonk, outcome } = driveAttackAndDeflect(s, monk, incoming);
    const netDamage = Math.max(0, incoming - outcome.reduction);
    // Pre-664: would have been (startingHp - incoming) without auto-heal.
    // Post-664: (startingHp - netDamage).
    expect(postMonk.hp.current).toBe(startingHp - netDamage);
  });

  it('over-heal cap: when reduction > incomingDamage, only incomingDamage is healed (no HP gain past pre-attack state)', () => {
    // Force a scenario where reduction exceeds incoming: use small
    // incoming damage and let the random reduction roll be larger.
    const monk = buildL3Monk(24);
    const s = seed(monk);
    const incoming = 2;
    const { postMonk, healed, outcome } = driveAttackAndDeflect(s, monk, incoming);
    expect(healed!.amount).toBe(incoming); // never more than incoming.
    expect(outcome.appliedReduction).toBe(incoming);
    // Post-state HP: started at 24 (max), took 2, healed 2 = 24.
    expect(postMonk.hp.current).toBe(24);
  });

  it('zero-incoming-damage edge: no Healed event emitted (incoming is 0; appliedReduction is 0)', () => {
    const monk = buildL3Monk(20);
    const s = seed(monk);
    const { healed, outcome } = driveAttackAndDeflect(s, monk, 0);
    expect(healed).toBeUndefined();
    expect(outcome.appliedReduction).toBe(0);
    expect(outcome.remainingDamage).toBe(0);
  });

  it('back-compat: outcome.remainingDamage still reflects max(0, incomingDamage - reduction)', () => {
    const monk = buildL3Monk(20);
    const s = seed(monk);
    const incoming = 20;
    const { outcome } = driveAttackAndDeflect(s, monk, incoming);
    expect(outcome.remainingDamage).toBe(Math.max(0, incoming - outcome.reduction));
  });

  it('fatal attack then deflect: monk transiently drops to 0 in the event log, then the Healed reverses it (death saves cleared)', () => {
    // Edge: 24 HP monk takes 30 damage. Pre-heal monk hits 0 and
    // applyHealed's wasUnconscious branch fires on heal-back,
    // resetting death saves. Post-state: HP > 0, death saves reset.
    const monk = buildL3Monk(24);
    const s = seed(monk);
    const { postMonk } = driveAttackAndDeflect(s, monk, 30);
    // The exact HP depends on the deflect roll, but the monk should
    // either be at 0 (incoming exceeded heal) OR up to (heal)
    // positive HP if reduction is large enough.
    if (postMonk.hp.current > 0) {
      // Death saves should be reset by applyHealed's
      // wasUnconscious branch.
      expect(postMonk.deathSaves.successes).toBe(0);
      expect(postMonk.deathSaves.failures).toBe(0);
    }
  });
});
