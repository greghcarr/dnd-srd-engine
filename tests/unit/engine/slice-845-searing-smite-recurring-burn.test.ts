// Slice 845: searing-smite-no-recurring-burn (L7 audit, Area 2). RAW 2024
// Searing Smite: "As you hit the target, it takes an extra 1d6 Fire damage
// from the attack. At the start of each of its turns until the spell ends,
// the target takes 1d6 Fire damage and then makes a Constitution saving
// throw. On a failed save, the spell continues. On a successful save, the
// spell ends." The engine modeled only the one-time +1d6 (a self-buff with a
// consume-on-hit rider). This slice wires the recurring burn: the on-hit
// rider now also applies a `searing-smite-burning` condition to the TARGET
// carrying recurringDamage (1d6 fire, turnStart) + recurringSave (CON,
// turnStart, removeCondition on success — no fixedDC, so it falls back to the
// caster's spell DC) + autoExpiry (10 rounds = the 1-minute cap). Pure
// content reusing the slice-825 recurringDamage + the slice-488/677
// recurringSave + the ApplyCondition trigger action — no engine change.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

// Level-2 Paladin, CHA 16 (+3), PB +2 → spell save DC = 8 + 2 + 3 = 13.
const PALADIN_SPELL_DC = 13;

const buildPaladin = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Ariadne', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level: 2, hitDiceRemaining: 2 }],
    abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 16 },
    hp: { current: 22, max: 22, temp: 0 },
    preparedSpells: ['searing-smite'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Goblin', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 60, max: 60, temp: 0 }, armorClass: 8,
  });

describe('Searing Smite recurring burn (slice 845)', () => {
  it('ships the searing-smite-burning condition (recurringDamage 1d6 fire + recurringSave CON removeCondition + 1-min autoExpiry) and the rider applies it', () => {
    const burning = PACK.conditions.find((c) => c.id === 'searing-smite-burning') as {
      recurringDamage?: { dice: string; damageType: string; trigger: string };
      recurringSave?: { ability: string; trigger: string; onSuccess?: string; fixedDC?: number };
      autoExpiry?: { afterRounds: number; trigger: string };
      effects?: unknown[];
    } | undefined;
    expect(burning?.recurringDamage).toEqual({ dice: '1d6', damageType: 'fire', trigger: 'turnStart' });
    expect(burning?.recurringSave).toEqual({ ability: 'CON', trigger: 'turnStart', onSuccess: 'removeCondition' });
    // No fixedDC → the recurring save resolves against the caster's spell DC.
    expect(burning?.recurringSave?.fixedDC).toBeUndefined();
    expect(burning?.autoExpiry).toEqual({ afterRounds: 10, trigger: 'turnEnd' });

    // The self-buff's on-hit rider applies the burning condition to the target.
    const active = PACK.conditions.find((c) => c.id === 'searing-smite-active')!;
    const rider = active.effects.find((e): e is Extract<typeof e, { kind: 'OnEvent' }> => e.kind === 'OnEvent')!;
    expect(rider.actions.some((a) => a.kind === 'ApplyCondition' && a.conditionId === 'searing-smite-burning')).toBe(true);
  });

  it('a hit while Searing Smite is armed ignites the target (burning condition sourced to the caster)', () => {
    for (let seed = 1; seed < 100; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const paladin = buildPaladin();
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `ignite-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
        characterId: paladin.id, spellId: 'searing-smite', slotLevel: 1, targetIds: [paladin.id],
      }).events);

      const attack = engine.plan.attack(campaign.state, {
        attackerId: paladin.id, targetId: target.id, weaponInstanceId: longsword.id,
      }).events as ReadonlyArray<Event>;
      if ((attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit !== true) continue;

      const ignite = attack.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'searing-smite-burning',
      );
      expect(ignite, 'burning condition applied on hit').toBeDefined();
      expect(ignite!.targetId).toBe(target.id);
      expect(ignite!.sourceCharacterId).toBe(paladin.id);

      const after = commit(campaign, attack);
      // Target carries the burn; the caster's one-shot self-buff is consumed.
      expect(after.state.characters[target.id]!.appliedConditions.some((c) => c.conditionId === 'searing-smite-burning')).toBe(true);
      expect(after.state.characters[paladin.id]!.appliedConditions.some((c) => c.conditionId === 'searing-smite-active')).toBe(false);
      return;
    }
    throw new Error('no hit seed for Searing Smite');
  });

  it('tickRecurringDamage burns the target for 1d6 fire, sourced to the caster', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const casterId = newCharacterId();
    const burning = CharacterSchema.parse({
      id: newCharacterId(), name: 'Burning', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 50, max: 50, temp: 0 },
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'searing-smite-burning', sourceCharacterId: casterId }],
    });
    let campaign: Campaign = engine.createCampaign({ name: 'tick-dmg' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: burning } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.tickRecurringDamage(campaign.state, { targetId: burning.id, conditionId: 'searing-smite-burning' }).events;
    const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
    expect(dmg).toBeDefined();
    expect(dmg!.components.some((c) => c.type === 'fire' && c.amount >= 1 && c.amount <= 6)).toBe(true);
    expect(dmg!.sourceCharacterId).toBe(casterId);
    expect(commit(campaign, events).state.characters[burning.id]!.hp.current).toBeLessThan(50);
  });

  it('tickRecurringSave rolls a CON save vs the CASTER spell DC; the spell ends on a success', () => {
    // The paladin must be a real character so the recurring save resolves
    // against its spell save DC (no fixedDC on the condition).
    let proven = false;
    for (let seed = 1; seed < 200 && !proven; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const paladin = buildPaladin();
      const target = buildTarget();
      target.appliedConditions = [{ id: newAppliedConditionId(), conditionId: 'searing-smite-burning', sourceCharacterId: paladin.id }];
      let campaign: Campaign = engine.createCampaign({ name: `tick-save-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.tickRecurringSave(campaign.state, { targetId: target.id, conditionId: 'searing-smite-burning' }).events;
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      expect(save).toBeDefined();
      expect(save!.ability).toBe('CON');
      expect(save!.dc).toBe(PALADIN_SPELL_DC);
      if (save!.success !== true) continue;
      // On a success the spell ends: ConditionRemoved for the burn, and the
      // committed state no longer carries it.
      const removed = events.find(
        (e): e is ConditionRemovedEvent => e.type === 'ConditionRemoved' && e.conditionId === 'searing-smite-burning',
      );
      expect(removed, 'burn removed on a successful save').toBeDefined();
      expect(commit(campaign, events).state.characters[target.id]!.appliedConditions.some((c) => c.conditionId === 'searing-smite-burning')).toBe(false);
      proven = true;
    }
    expect(proven, 'no seed produced a successful recurring save').toBe(true);
  });
});
