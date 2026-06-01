// Slice 562: Eldritch Blast multi-beam scaling.
//
// RAW (SRD 5.2.1 Eldritch Blast): "A beam of crackling energy
// streaks toward a creature within range. Make a ranged spell
// attack against the target. On a hit, the target takes 1d10
// Force damage.
//
// **Cantrip Upgrade.** The spell creates more than one beam when
// you reach higher levels: two beams at level 5, three beams at
// level 11, and four beams at level 17. You can direct the beams
// at the same target or at different ones. Make a separate attack
// roll for each beam."
//
// Pre-slice the engine fired one beam regardless of caster level
// (cantripScalingDice was absent, so no extra dice; cantripBeamScaling
// didn't exist, so no extra beams). This slice adds the
// `cantripBeamScaling: true` field to the attack mechanic schema,
// wires Eldritch Blast to use it, and enforces beam-count limits at
// plan time: 1 beam at L1, 2 at L5, 3 at L11, 4 at L17. Each beam
// rolls its own attack against (possibly) a different target.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildWarlock = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pact',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'warlock', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 10, CHA: 16 },
    hp: { current: 8 + level, max: 8 + level, temp: 0 },
    knownSpells: ['eldritch-blast'],
  });

const buildTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const setup = (engine: ReturnType<typeof createEngine>, warlock: Character, targets: Character[]) => {
  let campaign = engine.createCampaign({ name: 'eb' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
    ...targets.map<CharacterCreatedEvent>((t) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t })),
  ]);
  return campaign;
};

describe('Eldritch Blast multi-beam scaling (slice 562)', () => {
  describe('pack declaration', () => {
    it('Eldritch Blast attack mechanic has cantripBeamScaling: true', () => {
      const eb = PACK.spells?.find((s) => s.id === 'eldritch-blast');
      expect(eb).toBeDefined();
      const attack = eb!.mechanicalEffects?.find((e) => e.kind === 'attack') as { cantripBeamScaling?: boolean } | undefined;
      expect(attack).toBeDefined();
      expect(attack!.cantripBeamScaling).toBe(true);
    });
  });

  describe('beam count by character level', () => {
    it('L1 Warlock fires 1 beam (1 attack roll, 1 damage roll on hit)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const warlock = buildWarlock(1);
      const target = buildTarget('Dummy');
      const campaign = setup(engine, warlock, [target]);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [target.id],
      });
      const attacks = events.filter((e) => (e as { type: string }).type === 'AttackRolled');
      expect(attacks.length).toBe(1);
    });

    it('L1 Warlock with 2 target ids: rejected (exceeds beam count)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
      const warlock = buildWarlock(1);
      const t1 = buildTarget('A');
      const t2 = buildTarget('B');
      const campaign = setup(engine, warlock, [t1, t2]);
      expect(() => engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [t1.id, t2.id],
      })).toThrow(/1 beam at character level 1; received 2/);
    });

    it('L5 Warlock fires 2 beams (2 attack rolls)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
      const warlock = buildWarlock(5);
      const t1 = buildTarget('A');
      const t2 = buildTarget('B');
      const campaign = setup(engine, warlock, [t1, t2]);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [t1.id, t2.id],
      });
      const attacks = events.filter((e) => (e as { type: string }).type === 'AttackRolled') as AttackRolledEvent[];
      expect(attacks.length).toBe(2);
      // Each beam is its own attack roll
      expect(attacks[0]!.targetId).toBe(t1.id);
      expect(attacks[1]!.targetId).toBe(t2.id);
    });

    it('L5 Warlock can direct both beams at the SAME target (RAW: "same or different")', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
      const warlock = buildWarlock(5);
      const target = buildTarget('Solo');
      const campaign = setup(engine, warlock, [target]);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [target.id, target.id],
      });
      const attacks = events.filter((e) => (e as { type: string }).type === 'AttackRolled') as AttackRolledEvent[];
      expect(attacks.length).toBe(2);
      expect(attacks[0]!.targetId).toBe(target.id);
      expect(attacks[1]!.targetId).toBe(target.id);
    });

    it('L5 Warlock with 3 beam targets: rejected', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
      const warlock = buildWarlock(5);
      const t1 = buildTarget('A');
      const t2 = buildTarget('B');
      const t3 = buildTarget('C');
      const campaign = setup(engine, warlock, [t1, t2, t3]);
      expect(() => engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [t1.id, t2.id, t3.id],
      })).toThrow(/2 beams at character level 5; received 3/);
    });

    it('L11 Warlock fires 3 beams', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
      const warlock = buildWarlock(11);
      const t1 = buildTarget('A');
      const t2 = buildTarget('B');
      const t3 = buildTarget('C');
      const campaign = setup(engine, warlock, [t1, t2, t3]);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [t1.id, t2.id, t3.id],
      });
      const attacks = events.filter((e) => (e as { type: string }).type === 'AttackRolled');
      expect(attacks.length).toBe(3);
    });

    it('L17 Warlock fires 4 beams', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
      const warlock = buildWarlock(17);
      const t1 = buildTarget('A');
      const t2 = buildTarget('B');
      const t3 = buildTarget('C');
      const t4 = buildTarget('D');
      const campaign = setup(engine, warlock, [t1, t2, t3, t4]);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [t1.id, t2.id, t3.id, t4.id],
      });
      const attacks = events.filter((e) => (e as { type: string }).type === 'AttackRolled');
      expect(attacks.length).toBe(4);
    });

    it('zero target ids: rejected', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8) });
      const warlock = buildWarlock(1);
      const target = buildTarget('Dummy');
      const campaign = setup(engine, warlock, [target]);
      expect(() => engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [],
      })).toThrow(/at least one beam target/);
    });
  });

  describe('per-beam damage stays 1d10 (no cantripScaling extra dice)', () => {
    it('L5 Warlock: each beam rolls only 1d10 (not 2d10)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(9) });
      const warlock = buildWarlock(5);
      const t1 = buildTarget('A');
      const t2 = buildTarget('B');
      const campaign = setup(engine, warlock, [t1, t2]);
      // Iterate seeds until both beams hit so we get damage events
      let damageRolled: DamageRolledEvent[] = [];
      for (let seed = 1; seed < 80; seed++) {
        const e2 = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
        const { events } = e2.plan.castSpell(campaign.state, {
          characterId: warlock.id,
          spellId: 'eldritch-blast',
          slotLevel: 0,
          targetIds: [t1.id, t2.id],
        });
        const drs = events.filter((e) => (e as { type: string }).type === 'DamageRolled') as DamageRolledEvent[];
        if (drs.length >= 1) {
          damageRolled = drs;
          break;
        }
      }
      expect(damageRolled.length).toBeGreaterThanOrEqual(1);
      // Each beam's damage rolls is a single 1d10 (no cantripScaling)
      for (const dr of damageRolled) {
        const forceRolls = dr.rolls.find((r) => r.type === 'force');
        expect(forceRolls).toBeDefined();
        expect(forceRolls!.rolls.length).toBe(1); // 1d10 — one die, not two
      }
    });
  });
});
