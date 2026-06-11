// Slice 828: monster save-action mechanism (Constrict). The auto-hit,
// no-attack-roll "Strength Saving Throw: DC N ... Failure: damage + Grappled"
// shape — the save-or-effect sibling of the breath weapon. Canonical users:
// Behir / Couatl / Salamander / Constrictor Snake (each SRD-verified against
// monsters-A-Z.md / animals.md). Closes the last open shape of the L7
// `monster-onhit-rider-pass` quirk.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

// A plain Medium target with no STR-save proficiency (STR mod 0), so a
// seed loop can reach both a passing and a failing save against any DC.
const mkTarget = (name: string, statblockId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    ...(statblockId !== undefined ? { statblockId } : {}),
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 },
    armorClass: 10,
  });

const mkMonster = (statblockId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: statblockId,
    speciesId: 'human',
    backgroundId: 'soldier',
    statblockId,
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === statblockId)!.abilityScores,
    hp: { current: 200, max: 200, temp: 0 },
  });

const stage = (monster: Character, t: Character, seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'save-action' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

// Seed-loop until the save lands on the wanted side (both reachable for an
// unproficient STR-10 target vs every in-pack Constrict DC).
const runSaveAction = (
  statblockId: string,
  saveActionId: string,
  t: Character,
  want: 'fail' | 'success',
): { events: ReadonlyArray<Event>; monsterId: string } => {
  const monster = mkMonster(statblockId);
  for (let seed = 1; seed < 400; seed += 1) {
    const { engine, campaign } = stage(monster, t, seed);
    const events = engine.plan.saveAction(campaign.state, {
      monsterId: monster.id,
      saveActionId,
      targetId: t.id,
    }).events as ReadonlyArray<Event>;
    const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    if (save === undefined) continue;
    if ((want === 'success') === save.success) return { events, monsterId: monster.id };
  }
  throw new Error(`no ${want} seed for ${statblockId} ${saveActionId}`);
};

const conditionsOf = (events: ReadonlyArray<Event>): ConditionAppliedEvent[] =>
  events.filter((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied');
const damageOf = (events: ReadonlyArray<Event>): DamageAppliedEvent | undefined =>
  events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');

describe('monster save-actions: Constrict (slice 828)', () => {
  it('the four constrictors carry the SRD Constrict spec', () => {
    const EXPECT: Record<string, { dc: number; size: string; reach: number; conds: string[] }> = {
      behir: { dc: 18, size: 'Large', reach: 5, conds: ['grappled', 'restrained'] },
      couatl: { dc: 15, size: 'Medium', reach: 5, conds: ['grappled', 'restrained'] },
      salamander: { dc: 15, size: 'Large', reach: 10, conds: ['grappled', 'restrained'] },
      'constrictor-snake': { dc: 12, size: 'Medium', reach: 5, conds: ['grappled'] },
    };
    for (const [id, e] of Object.entries(EXPECT)) {
      const spec = PACK.monsters.find((m) => m.id === id)!.saveActions.find((s) => s.id === 'constrict')!;
      expect(spec, id).toBeDefined();
      expect(spec.saveAbility, id).toBe('STR');
      expect(spec.saveDC, id).toBe(e.dc);
      expect(spec.maxTargetSize, id).toBe(e.size);
      expect(spec.reachFeet, id).toBe(e.reach);
      expect(spec.onFail.applyConditionIds, id).toEqual(e.conds);
    }
  });

  it('Behir Constrict on a failed save deals bludgeoning + Grappled + Restrained, sourced to the behir', () => {
    const { events, monsterId } = runSaveAction('behir', 'constrict', mkTarget('PC'), 'fail');
    const ids = conditionsOf(events).map((c) => c.conditionId).sort();
    expect(ids).toEqual(['grappled', 'restrained']);
    const grappled = conditionsOf(events).find((c) => c.conditionId === 'grappled')!;
    expect(grappled.sourceCharacterId).toBe(monsterId);
    expect(damageOf(events)!.components.some((c) => c.type === 'bludgeoning')).toBe(true);
  });

  it('Constrict on a successful save does nothing (no damage, no condition)', () => {
    const { events } = runSaveAction('couatl', 'constrict', mkTarget('PC'), 'success');
    expect(events.map((e) => e.type)).toEqual(['SaveRolled']);
  });

  it('Salamander Constrict deals both bludgeoning and fire on a failed save', () => {
    const { events } = runSaveAction('salamander', 'constrict', mkTarget('PC'), 'fail');
    const types = new Set(damageOf(events)!.components.map((c) => c.type));
    expect(types.has('bludgeoning')).toBe(true);
    expect(types.has('fire')).toBe(true);
  });

  it('Constrictor Snake applies Grappled only (no Restrained)', () => {
    const { events } = runSaveAction('constrictor-snake', 'constrict', mkTarget('PC'), 'fail');
    const ids = conditionsOf(events).map((c) => c.conditionId);
    expect(ids).toContain('grappled');
    expect(ids).not.toContain('restrained');
  });

  it('Behir Constrict (Large-or-smaller) refuses a Huge target', () => {
    const monster = mkMonster('behir');
    const huge = mkTarget('Hill Giant', 'hill-giant');
    const { engine, campaign } = stage(monster, huge, 1);
    expect(() =>
      engine.plan.saveAction(campaign.state, {
        monsterId: monster.id,
        saveActionId: 'constrict',
        targetId: huge.id,
      }),
    ).toThrow(/Large or smaller/);
  });
});
