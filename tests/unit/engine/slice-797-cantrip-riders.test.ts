// Slice 797: two cantrip on-hit riders that were missing (Area 2 quirks),
// each reusing an existing effect primitive on the slice-796 on-hit
// autoExpiry path:
//
//   - Ray of Frost (SRD 5.2.1): "its Speed is reduced by 10 feet until
//     the start of your next turn." -> ray-of-frost-slowed (ModifySpeed
//     -10, autoExpiry { afterRounds 1, turnStart }).
//   - Chill Touch (SRD 5.2.1): "it can't regain Hit Points until the end
//     of your next turn." -> chill-touched-no-heal (BlockHealing,
//     autoExpiry { afterRounds 1, turnEnd }).
//
// Both ride the attack mechanic's `conditionOnHit`; the slice-796 fix
// stamps each rider's autoExpiry so the window self-lifts. The
// ModifySpeed / BlockHealing effects themselves are pre-existing,
// separately-tested primitives — this slice wires + meters them.
//
// Shocking Grasp ("can't make Opportunity Attacks until the start of its
// next turn") is deferred: no "prevent opportunity attacks" effect
// primitive exists (tracked).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildWizard = (spell: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Caster', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 27, max: 27, temp: 0 },
    knownSpells: [spell], preparedSpells: [spell],
  });

// Very low AC so the cantrip hits on nearly every seed.
const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 1, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 }, armorClass: 5,
  });

// Cast `spell` at a hittable target inside an active encounter; return
// the cast events + the encounter round they were cast in. Iterates seeds
// until the attack hits.
const castInEncounterUntilHit = (spell: string): { events: ReadonlyArray<Event>; round: number; targetId: string } => {
  for (let seed = 1; seed < 60; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const caster = buildWizard(spell);
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: `${spell}-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [caster.id, target.id] });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
    const round = campaign.state.encounters[enc.encounterId]!.round;
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: caster.id, spellId: spell, slotLevel: 0, targetIds: [target.id], ignorePreparation: true,
    });
    const attack = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (attack !== undefined && attack.hit !== false) return { events, round, targetId: target.id };
  }
  throw new Error(`no seed where ${spell} hit`);
};

describe('Cantrip on-hit riders (slice 797)', () => {
  it('pack: Ray of Frost carries conditionOnHit ray-of-frost-slowed (1d8 cold)', () => {
    const s = PACK.spells.find((sp) => sp.id === 'ray-of-frost');
    expect(s?.mechanicalEffects).toEqual([
      { kind: 'attack', attackKind: 'ranged', damageDice: '1d8', damageType: 'cold', cantripScalingDice: '1d8', conditionOnHit: 'ray-of-frost-slowed' },
    ]);
    const c = PACK.conditions.find((cc) => cc.id === 'ray-of-frost-slowed');
    expect(c?.effects).toEqual([{ kind: 'ModifySpeed', mode: 'walk', op: 'add', value: -10 }]);
    expect(c?.autoExpiry).toEqual({ afterRounds: 1, trigger: 'turnStart' });
  });

  it('pack: Chill Touch carries conditionOnHit chill-touched-no-heal (1d10 necrotic)', () => {
    const s = PACK.spells.find((sp) => sp.id === 'chill-touch');
    expect(s?.mechanicalEffects).toEqual([
      { kind: 'attack', attackKind: 'melee', damageDice: '1d10', damageType: 'necrotic', cantripScalingDice: '1d10', conditionOnHit: 'chill-touched-no-heal' },
    ]);
    const c = PACK.conditions.find((cc) => cc.id === 'chill-touched-no-heal');
    expect(c?.effects).toEqual([{ kind: 'BlockHealing' }]);
    expect(c?.autoExpiry).toEqual({ afterRounds: 1, trigger: 'turnEnd' });
  });

  it('cast: Ray of Frost hit slows the target until the start of the caster\'s next turn', () => {
    const { events, round, targetId } = castInEncounterUntilHit('ray-of-frost');
    const glow = events.find(
      (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'ray-of-frost-slowed',
    );
    expect(glow, 'slow not applied on hit').toBeDefined();
    expect(glow!.targetId).toBe(targetId);
    expect(glow!.expiryTrigger).toBe('turnStart');
    expect(glow!.expiresOnRound).toBe(round + 1);
  });

  it('cast: Chill Touch hit blocks the target\'s healing until the end of the caster\'s next turn', () => {
    const { events, round, targetId } = castInEncounterUntilHit('chill-touch');
    const glow = events.find(
      (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'chill-touched-no-heal',
    );
    expect(glow, 'no-heal not applied on hit').toBeDefined();
    expect(glow!.targetId).toBe(targetId);
    expect(glow!.expiryTrigger).toBe('turnEnd');
    expect(glow!.expiresOnRound).toBe(round + 1);
  });
});
