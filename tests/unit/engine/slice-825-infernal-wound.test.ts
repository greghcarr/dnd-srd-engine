// Slice 825: monster-onhit-rider-pass (batch 3) — the Bearded Devil's
// infernal wound, the first recurring-DAMAGE condition. A new
// `recurringDamage` condition field + `engine.plan.tickRecurringDamage`
// (the no-save sibling of tickRecurringSave): the consumer ticks it at the
// bearer's turn boundary and the bearer loses 1d10 HP. Applied by the
// Infernal Glaive's onHit CON-save rider; closes after 1 minute (autoExpiry).

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
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const target = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Victim', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 6, CON: 4, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 3,
  });

describe('Bearded Devil infernal wound — recurring damage (slice 825)', () => {
  it('ships the infernal-wound condition (recurringDamage 1d10 necrotic + 1-min autoExpiry) and the Glaive rider', () => {
    const cond = PACK.conditions.find((c) => c.id === 'infernal-wound') as
      | { recurringDamage?: { dice: string; damageType: string; trigger: string }; autoExpiry?: { afterRounds: number } }
      | undefined;
    expect(cond?.recurringDamage).toEqual({ dice: '1d10', damageType: 'necrotic', trigger: 'turnStart' });
    expect(cond?.autoExpiry?.afterRounds).toBe(10);
    const glaive = PACK.items.find((i) => i.id === 'bearded-devil-infernal-glaive') as { onHit?: Array<{ save?: { ability?: string; dc?: number; conditionOnFail?: string } }> };
    expect(glaive.onHit?.[0]?.save).toMatchObject({ ability: 'CON', dc: 12, conditionOnFail: 'infernal-wound' });
  });

  it('the Infernal Glaive inflicts the wound on a failed CON save, sourced by the devil', () => {
    const stat = PACK.monsters.find((m) => m.id === 'bearded-devil')!;
    for (let seed = 1; seed < 200; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const devil = CharacterSchema.parse({
        id: newCharacterId(), name: 'Bearded Devil', speciesId: 'human', backgroundId: 'soldier', statblockId: 'bearded-devil',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }], abilityScores: stat.abilityScores, hp: { current: 80, max: 80, temp: 0 },
      });
      const victim = target();
      const glaive = makeItemInstance('bearded-devil-infernal-glaive');
      let campaign: Campaign = engine.createCampaign({ name: 'glaive' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: glaive },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: devil } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: devil.id, targetId: victim.id, weaponInstanceId: glaive.id, advantage: 'advantage',
      }).events as ReadonlyArray<Event>;
      const hit = (events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true;
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (!hit || save === undefined || save.success !== false) continue;
      const wound = events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'infernal-wound',
      );
      expect(wound).toBeDefined();
      expect(wound!.sourceCharacterId).toBe(devil.id);
      return;
    }
    throw new Error('no hit+failed-save seed');
  });

  it('tickRecurringDamage drains 1d10 necrotic from a wounded creature, sourced by the devil', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const devilId = newCharacterId();
    const wounded = CharacterSchema.parse({
      id: newCharacterId(), name: 'Wounded', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 50, max: 50, temp: 0 },
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'infernal-wound', sourceCharacterId: devilId }],
    });
    let campaign: Campaign = engine.createCampaign({ name: 'tick' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wounded } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.tickRecurringDamage(campaign.state, { targetId: wounded.id, conditionId: 'infernal-wound' }).events;
    const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
    expect(dmg).toBeDefined();
    expect(dmg!.components.some((c) => c.type === 'necrotic' && c.amount >= 1 && c.amount <= 10)).toBe(true);
    expect(dmg!.sourceCharacterId).toBe(devilId);
    const after = commit(campaign, events);
    expect(after.state.characters[wounded.id]!.hp.current).toBeLessThan(50);
  });

  it('tickRecurringDamage throws for a creature that has no such condition', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const healthy = target();
    let campaign: Campaign = engine.createCampaign({ name: 'no-wound' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: healthy } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.tickRecurringDamage(campaign.state, { targetId: healthy.id, conditionId: 'infernal-wound' }),
    ).toThrow(/does not have condition/i);
  });
});
