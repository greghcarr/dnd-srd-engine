// Slice 623: three RAW bugs surfaced by the slice-622 L1 fuzz review
// (10 seeds, 3 confirmed deviations from the 2024 PHB).
//
// Bug 1 (seed 7000): Vex mastery's autoExpiry fired at the end of the
//   *vexed target's* turn, not the *vexer's* — so the vexer never got
//   to use the Advantage on their next turn. Root cause: the encounter
//   sweep keys on `applied.sourceCharacterId` (used for consumeOnAttack
//   scoping) and Vex sets source = vexed target. Fix: add
//   `expirySourceFromBearer: true` to the condition's autoExpiry; the
//   sweep then keys on the BEARER (the vexer) instead.
//
// Bug 2 (seed 7006): Innate Sorcery's "Advantage on the attack rolls
//   of Sorcerer spells you cast" arm wasn't applied. The condition
//   carried only the +1 spell save DC effect; the spell-attack path in
//   cast-spell.ts also never folded attacker-side advantage in. Fix:
//   add `SetAdvantage on:'attack' mode:'advantage'` to the condition
//   AND query `casterEffects.advantageFor('attack', ...)` in the
//   spell-attack path (mirror of attack.ts:867 for weapons).
//
// Bug 3 (seed 7007): Monk Martial Arts' "Dexterous Attacks" benefit
//   (use DEX instead of STR on monk-eligible weapons) was missing.
//   The engine implemented only the Martial Arts damage-die scaling
//   for unarmed-strike. Fix: a new `martialArtsApplies` helper +
//   chooseAttackAbility / chooseDamageAbility additions.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId, newEffectInstanceId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const applyCondition = (
  targetId: string,
  conditionId: string,
  sourceId?: string,
  extras: { expiresOnRound?: number; expiryTrigger?: 'turnStart' | 'turnEnd' } = {},
) => ({
  id: eventId(), at: isoTimestamp(), type: 'ConditionApplied' as const,
  targetId: targetId as never, conditionId, appliedConditionId: newAppliedConditionId(),
  ...(sourceId !== undefined ? { sourceCharacterId: sourceId as never } : {}),
  ...(extras.expiresOnRound !== undefined ? { expiresOnRound: extras.expiresOnRound } : {}),
  ...(extras.expiryTrigger !== undefined ? { expiryTrigger: extras.expiryTrigger } : {}),
});

const attackRoll = (events: ReadonlyArray<Event>): AttackRolledEvent | undefined =>
  events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;

describe('slice 623 (bug 1): Vex autoExpiry keys on the BEARER (vexer), not the source (vexed target)', () => {
  // Build a one-encounter scenario: Alyx (the vexer) gets vexing-active
  // sourced to Borc (the vexed). End Borc's turn -> Vex still active
  // on Alyx (pre-slice-623 the engine would have removed it here). End
  // Alyx's turn -> Vex expires.
  const buildPC = (name: string, classId: string): Character =>
    CharacterSchema.parse({
      id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId, level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
    });

  it('Vex stays active across the vexed target turn-end and expires at the vexer turn-end', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const alyx = buildPC('Alyx', 'fighter');
    const borc = buildPC('Borc', 'fighter');
    let campaign: Campaign = engine.createCampaign({ name: 'vex' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, {
      combatantIds: [alyx.id, borc.id],
      name: 'Vex arena',
    });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
    // Apply Vex to Alyx (sourceCharacterId = Borc, matching the
    // production wiring after a Vex hit) with expiresOnRound=2 +
    // expiryTrigger='turnEnd' (matches the slice-623 vexing-active
    // wiring of afterRounds:1, trigger:turnEnd inside round 1).
    campaign = commit(campaign, [
      applyCondition(alyx.id, 'vexing-active', borc.id, { expiresOnRound: 2, expiryTrigger: 'turnEnd' }),
    ]);

    // Identify the initiative order so we can correlate turn-ends to
    // characters. Advance until each combatant has had their round-2
    // turn end. The pre-slice-623 sweep would have removed Vex when
    // Borc's round-2 turn ended (source-keyed). The fix makes it
    // expire only when Alyx's round-2 turn ends (bearer-keyed).
    const order = campaign.state.encounters[enc.encounterId]!.combatants.map((c) => c.combatantId);
    const tick = (): { whoseTurnEnded: string; round: number; stillVexed: boolean } => {
      const before = campaign.state.encounters[enc.encounterId]!;
      const whoseTurnEnded = order[before.activeIndex]!;
      const round = before.round;
      campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
      const stillVexed = campaign.state.characters[alyx.id]!.appliedConditions.some((c) => c.conditionId === 'vexing-active');
      return { whoseTurnEnded, round, stillVexed };
    };
    // Step through every round-1 + round-2 turn-end and find the
    // first one where Vex gets removed. With the slice-623 fix the
    // removal happens at the BEARER's (Alyx's) round-2 turn-end.
    // Pre-fix the removal would have happened at the SOURCE's
    // (Borc's) round-2 turn-end.
    const ticks: ReturnType<typeof tick>[] = [];
    let removedAt: { whoseTurnEnded: string; round: number } | null = null;
    let wasVexed = true;
    for (let i = 0; i < 4 && wasVexed; i += 1) {
      const t = tick();
      ticks.push(t);
      if (!t.stillVexed) {
        removedAt = { whoseTurnEnded: t.whoseTurnEnded, round: t.round };
        wasVexed = false;
      }
    }
    expect(removedAt, 'Vex was never removed across 4 turn-ends (sweep broken?)').not.toBeNull();
    expect(
      removedAt!.whoseTurnEnded,
      `Vex removed at ${removedAt!.whoseTurnEnded === borc.id ? 'Borc (source / vexed target)' : 'Alyx (bearer / vexer)'} turn-end of round ${removedAt!.round}; post-slice-623 RAW it must be the BEARER (Alyx)`,
    ).toBe(alyx.id);
    expect(removedAt!.round, 'Vex must survive at least until round 2 (expiresOnRound=2)').toBeGreaterThanOrEqual(2);
  });
});

describe("slice 623 (bug 2): Innate Sorcery grants Advantage on the sorcerer's spell attacks", () => {
  const buildSorcerer = (name: string): Character =>
    CharacterSchema.parse({
      id: newCharacterId(), name, speciesId: 'human', backgroundId: 'sage',
      classes: [{ classId: 'sorcerer', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
      hp: { current: 8, max: 8, temp: 0 },
      knownSpells: ['fire-bolt'],
      preparedSpells: ['fire-bolt'],
    });
  const buildTarget = (name: string): Character =>
    CharacterSchema.parse({
      id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
    });

  it('a sorcerer with innate-sorcery-active rolls a spell attack with advantage', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const alyx = buildSorcerer('Alyx');
    const borc = buildTarget('Borc');
    let campaign: Campaign = engine.createCampaign({ name: 'innate-sorcery' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
      applyCondition(alyx.id, 'innate-sorcery-active'),
    ]);
    const result = engine.plan.castSpell(campaign.state, {
      characterId: alyx.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [borc.id],
    });
    const ar = attackRoll(result.events);
    expect(ar, 'cast should emit an AttackRolled event for the fire-bolt spell attack').toBeDefined();
    expect(ar!.d20.length, 'spell attack with Innate Sorcery active rolls 2d20 (advantage)').toBe(2);
    expect(ar!.used).toBe('advantage');
  });

  it('the same sorcerer without innate-sorcery-active rolls a single d20', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const alyx = buildSorcerer('Alyx');
    const borc = buildTarget('Borc');
    let campaign: Campaign = engine.createCampaign({ name: 'no-innate' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    const result = engine.plan.castSpell(campaign.state, {
      characterId: alyx.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [borc.id],
    });
    const ar = attackRoll(result.events);
    expect(ar!.d20.length, 'spell attack without Innate Sorcery rolls a single d20').toBe(1);
    expect(ar!.used).toBe('none');
  });
});

describe('slice 623 (bug 3): Monk Martial Arts "Dexterous Attacks" uses DEX for monk weapons', () => {
  // Monk with DEX 16 / STR 8: a javelin (simple melee) should use DEX
  // for both attack and damage. Pre-slice the engine used STR for the
  // melee attack (no finesse property on javelin) -- so the monk's
  // attack bonus was based on STR (-1) instead of DEX (+3).
  const buildMonk = (name: string, opts: { hasArmor?: boolean; hasShield?: boolean } = {}): Character => {
    const javelin = makeItemInstance('javelin');
    const armor = makeItemInstance('leather-armor');
    const shield = makeItemInstance('shield');
    return {
      ...CharacterSchema.parse({
        id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'monk', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 8, DEX: 16, CON: 12, INT: 10, WIS: 14, CHA: 10 },
        hp: { current: 9, max: 9, temp: 0 },
        inventory: [javelin.id, ...(opts.hasArmor ? [armor.id] : []), ...(opts.hasShield ? [shield.id] : [])],
        equipped: {
          mainHand: javelin.id,
          ...(opts.hasArmor ? { armor: armor.id } : {}),
          ...(opts.hasShield ? { shield: shield.id } : {}),
          attuned: [],
        },
      }),
      _javelin: javelin, _armor: armor, _shield: shield,
    } as Character & { _javelin: ReturnType<typeof makeItemInstance>; _armor: ReturnType<typeof makeItemInstance>; _shield: ReturnType<typeof makeItemInstance> };
  };
  const buildTarget = (name: string): Character =>
    CharacterSchema.parse({
      id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
    });

  it('a monk wielding a javelin (simple melee) attacks with DEX (+3) not STR (-1)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(11) });
    const alyx = buildMonk('Alyx');
    const javelin = (alyx as Character & { _javelin: { id: string } })._javelin;
    const borc = buildTarget('Borc');
    let campaign: Campaign = engine.createCampaign({ name: 'monk-dex' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: javelin } as Event,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    const result = engine.plan.attack(campaign.state, {
      attackerId: alyx.id, targetId: borc.id, weaponInstanceId: javelin.id,
    });
    const ar = attackRoll(result.events);
    // DEX +3 + PB +2 = +5. STR -1 + PB +2 = +1. Monk Martial Arts
    // should pick DEX, so attackBonus must be +5.
    expect(ar, 'attack roll event present').toBeDefined();
    expect(ar!.attackBonus, 'monk javelin attack uses DEX (+3) + PB (+2) = +5').toBe(5);
  });

  it('a monk WEARING ARMOR loses Martial Arts and falls back to STR', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(11) });
    const alyx = buildMonk('Alyx', { hasArmor: true });
    const javelin = (alyx as Character & { _javelin: { id: string } })._javelin;
    const armor = (alyx as Character & { _armor: { id: string } })._armor;
    const borc = buildTarget('Borc');
    let campaign: Campaign = engine.createCampaign({ name: 'monk-armored' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: javelin } as Event,
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armor } as Event,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    const result = engine.plan.attack(campaign.state, {
      attackerId: alyx.id, targetId: borc.id, weaponInstanceId: javelin.id,
    });
    const ar = attackRoll(result.events);
    // STR -1 + PB +2 = +1.
    expect(ar!.attackBonus, 'armored monk loses Martial Arts; falls back to STR (-1) + PB (+2) = +1').toBe(1);
  });
});
