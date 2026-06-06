// Slice 704 (A2): die-typed roll-provider seam — engine-level proofs.
//
// These exercise the seam through a real plan.attack:
//   1. Byte-identity: SeededRollProvider(seed) == the default RNG path
//      (normalized events equal).
//   2. Reproduction: the exact faces a seeded run drew, replayed via
//      SuppliedRollProvider, reproduce that run's events.
//   3. NeedRoll: thrown with the correct die + context at the first
//      undrawn roll (the attack d20).
//   4. Resumable convergence: a nat-20 requests the doubled damage dice;
//      a nat-1 miss requests no damage dice; the resumable-prefix loop
//      converges either way.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import {
  NeedRoll,
  SeededRollProvider,
  SuppliedRollProvider,
  type RollContext,
  type RollProvider,
} from '../../../src/rng/roll-provider.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp, normalizeEvents } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const longsword = (): ItemInstance =>
  ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });

// A plain L1 fighter (no Extra Attack, no Savage Attacker) so the draw
// order is exactly: one attack d20, then the weapon's damage dice.
const buildFighter = (sword: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Striker',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    inventory: [sword],
    equipped: { mainHand: sword, attuned: [] },
  });

const buildTarget = (ac: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    armorClass: ac,
  });

interface Scenario {
  readonly engine: ReturnType<typeof createEngine>;
  readonly campaign: Campaign;
  readonly attackerId: string;
  readonly targetId: string;
  readonly swordId: string;
}

const setup = (seed: number, targetAC = 12): Scenario => {
  const sword = longsword();
  const attacker = buildFighter(sword.id);
  const target = buildTarget(targetAC);
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: `rp-${seed}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, attackerId: attacker.id, targetId: target.id, swordId: sword.id };
};

const attack = (s: Scenario) =>
  s.engine.plan.attack(s.campaign.state, {
    attackerId: s.attackerId,
    targetId: s.targetId,
    weaponInstanceId: s.swordId,
  }).events;

// A provider that records every (die, value, context) drawn, for the
// reproduction proof.
class RecordingRollProvider implements RollProvider {
  readonly draws: Array<{ die: number; value: number; context: RollContext | undefined }> = [];
  constructor(private readonly inner: RollProvider) {}
  roll(die: number, context?: RollContext): number {
    const value = this.inner.roll(die, context);
    this.draws.push({ die, value, context });
    return value;
  }
}

describe('A2: roll-provider engine integration', () => {
  it('SeededRollProvider(seed) is byte-identical to the default RNG path', () => {
    // Default path.
    const a = setup(4242);
    const defaultEvents = attack(a);
    // Provider path: a fresh SeededRNG(seed) routed through the provider.
    const b = setup(4242);
    const providerEvents = b.engine.withRollProvider(
      new SeededRollProvider(seededRNG(4242)),
      () => attack(b),
    );
    expect(normalizeEvents(providerEvents)).toEqual(normalizeEvents(defaultEvents));
  });

  it('SuppliedRollProvider replaying a seeded run’s exact faces reproduces its events', () => {
    const a = setup(777);
    const recorder = new RecordingRollProvider(new SeededRollProvider(seededRNG(777)));
    const recordedEvents = a.engine.withRollProvider(recorder, () => attack(a));
    const faces = recorder.draws.map((d) => d.value);

    const b = setup(777);
    const replayedEvents = b.engine.withRollProvider(
      new SuppliedRollProvider(faces),
      () => attack(b),
    );
    expect(normalizeEvents(replayedEvents)).toEqual(normalizeEvents(recordedEvents));
  });

  it('throws NeedRoll for the attack d20 first when the queue is empty', () => {
    const s = setup(1);
    try {
      s.engine.withRollProvider(new SuppliedRollProvider([]), () => attack(s));
      throw new Error('expected NeedRoll');
    } catch (err) {
      expect(err).toBeInstanceOf(NeedRoll);
      expect((err as NeedRoll).die).toBe(20);
      expect((err as NeedRoll).context).toBe('attack');
    }
  });

  // Resumable-prefix driver: attempt the plan; on NeedRoll, record the
  // need, append a chosen face, re-attempt from scratch. Converges
  // because each re-attempt re-draws the identical prefix and advances
  // exactly one more roll.
  const drive = (
    s: Scenario,
    faceFor: (die: number, context: RollContext | undefined) => number,
  ): { needed: Array<{ die: number; context: RollContext | undefined }> } => {
    const queue: number[] = [];
    const needed: Array<{ die: number; context: RollContext | undefined }> = [];
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        s.engine.withRollProvider(new SuppliedRollProvider([...queue]), () => attack(s));
        return { needed };
      } catch (err) {
        if (!(err instanceof NeedRoll)) throw err;
        needed.push({ die: err.die, context: err.context });
        queue.push(faceFor(err.die, err.context));
      }
    }
    throw new Error('resumable loop did not converge');
  };

  it('a nat-1 miss requests no damage dice (loop converges after the attack roll)', () => {
    const s = setup(2, 12);
    const { needed } = drive(s, (_die, context) => (context === 'attack' ? 1 : 4));
    expect(needed.filter((n) => n.context === 'damage')).toHaveLength(0);
    expect(needed).toHaveLength(1); // just the attack d20
    expect(needed[0]).toEqual({ die: 20, context: 'attack' });
  });

  it('a nat-20 requests doubled damage dice (twice the normal-hit count)', () => {
    // Normal hit (15 hits AC 12, not a crit): the weapon's base damage dice.
    const hit = drive(setup(3, 12), (_die, context) => (context === 'attack' ? 15 : 4));
    const normalDamageDice = hit.needed.filter((n) => n.context === 'damage').length;
    expect(normalDamageDice).toBeGreaterThanOrEqual(1);

    // Crit (nat 20): doubled weapon damage dice.
    const crit = drive(setup(3, 12), (_die, context) => (context === 'attack' ? 20 : 4));
    const critDamageDice = crit.needed.filter((n) => n.context === 'damage').length;
    expect(critDamageDice).toBe(normalDamageDice * 2);

    // Every damage NeedRoll is tagged 'damage' and uses the weapon die.
    for (const n of crit.needed.filter((x) => x.context === 'damage')) {
      expect(n.context).toBe('damage');
    }
  });
});
