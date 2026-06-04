// Slice 586: spell-attack trigger dispatch.
//
// Before the slice, `planAttackMechanic` in cast-spell.ts emitted
// AttackRolled events without calling dispatchTriggers on them. The
// weapon-attack path (planAttack at attack.ts:1101) DID dispatch.
// So target-side attack-triggered riders (Hex's 1d6 necrotic,
// Hunter's Mark's 1d6 force, etc.) fired on weapon swings but not
// on spell-attack hits (Eldritch Blast, Fire Bolt, Ray of Frost,
// Chill Touch, etc.).
//
// Surfaced by the slice 585 combat-fuzz tool: across 15 random
// battles, Hex was applied 3 times and the hex-damage-rider trigger
// never fired (the only attacks were Eldritch Blast / Fire Bolt
// spell attacks). Hunter's Mark on a Ranger's longbow DID fire,
// confirming the gap was spell-attack-only.
//
// Slice 586 adds the dispatch in cast-spell.ts:planAttackMechanic
// right after the AttackRolled event is emitted, mirroring the
// attack.ts wiring. The dispatcher's trigger-action events (e.g.,
// the Hex AddDamage 1d6 necrotic) emit a DamageApplied that fires
// alongside the spell's own damage.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildWarlock = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Warlock',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 10, max: 10, temp: 0 },
    knownSpells: ['hex', 'eldritch-blast'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Spell-attack trigger dispatch (slice 586)', () => {
  it('Eldritch Blast hit against a Hexed target fires the hex-damage-rider', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const warlock = buildWarlock();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: `hex-eb-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      // Cast Hex (BA) on target with STR variant.
      campaign = commit(
        campaign,
        engine.plan.castSpell(campaign.state, {
          characterId: warlock.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
          casterChoice: { kind: 'variant', value: 'STR' },
        }).events,
      );
      // Now cast Eldritch Blast at the Hexed target.
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [target.id],
      });
      const attack = events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      if (attack?.hit !== true) continue;
      // On hit, the Hex damage rider should emit a DamageApplied with
      // a necrotic component (slice 586 wiring).
      const damageEvents = events.filter((e): e is DamageAppliedEvent =>
        (e as { type: string }).type === 'DamageApplied');
      const hasNecrotic = damageEvents.some((d) =>
        d.components.some((c) => c.type === 'necrotic'));
      expect(hasNecrotic, `seed ${seed}: hex 1d6 necrotic should fire on EB hit`).toBe(true);
      return;
    }
    throw new Error('no seed produced an EB hit');
  });

  it('Eldritch Blast hit against an UN-Hexed target does NOT fire necrotic', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const warlock = buildWarlock();
    const target = buildTarget();
    let campaign = engine.createCampaign({ name: 'no-hex' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    for (let seed = 1; seed < 80; seed += 1) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const { events } = eng.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [target.id],
      });
      const attack = events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      if (attack?.hit !== true) continue;
      const damageEvents = events.filter((e): e is DamageAppliedEvent =>
        (e as { type: string }).type === 'DamageApplied');
      const hasNecrotic = damageEvents.some((d) =>
        d.components.some((c) => c.type === 'necrotic'));
      expect(hasNecrotic, 'no Hex => no necrotic component').toBe(false);
      return;
    }
    throw new Error('no seed produced an EB hit');
  });
});
