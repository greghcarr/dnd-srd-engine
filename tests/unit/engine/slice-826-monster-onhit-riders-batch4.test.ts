// Slice 826: monster-onhit-rider-pass (batch 4) — more size-gated grapple /
// prone weapon riders using existing conditions + the slice-446
// target.creatureSize / slice-491 charge facts, the same shape as batch 1
// (822). 6 natural weapons across 6 in-scope monsters, each SRD-verified.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const target = (name: string, statblockId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    ...(statblockId !== undefined ? { statblockId } : {}),
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 6, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 3,
  });
const medium = () => target('Medium PC');
const large = () => target('Ogre', 'ogre');
const huge = () => target('Hill Giant', 'hill-giant');

const riderAttack = (
  statblockId: string, weaponId: string, t: Character, opts: { charged?: boolean } = {},
): { events: ReadonlyArray<Event>; attackerId: string } => {
  for (let seed = 1; seed < 160; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const attacker = CharacterSchema.parse({
      id: newCharacterId(), name: statblockId, speciesId: 'human', backgroundId: 'soldier', statblockId,
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: PACK.monsters.find((m) => m.id === statblockId)!.abilityScores,
      hp: { current: 150, max: 150, temp: 0 },
    });
    const weapon = makeItemInstance(weaponId);
    let campaign: Campaign = engine.createCampaign({ name: 'rider' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: attacker.id, targetId: t.id, weaponInstanceId: weapon.id, advantage: 'advantage',
      ...(opts.charged === true ? { chargedAtTarget: true } : {}),
    }).events as ReadonlyArray<Event>;
    if ((events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true) {
      return { events, attackerId: attacker.id };
    }
  }
  throw new Error(`no hitting seed for ${weaponId}`);
};

const conditions = (events: ReadonlyArray<Event>): ConditionAppliedEvent[] =>
  events.filter((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied');
const appliedIds = (events: ReadonlyArray<Event>): string[] => conditions(events).map((e) => e.conditionId);

describe('monster on-hit riders batch 4 (slice 826)', () => {
  it('the 6 swept natural weapons carry the SRD on-hit conditions', () => {
    const EXPECT: Record<string, string[]> = {
      'glabrezu-pincer': ['grappled'],
      'roc-talons': ['grappled', 'restrained'],
      'grick-tentacles': ['grappled'],
      'barbed-devil-claws': ['grappled'],
      'chimera-ram': ['prone'],
      'mammoth-gore': ['prone'],
    };
    for (const [id, expected] of Object.entries(EXPECT)) {
      const w = PACK.items.find((i) => i.id === id) as { onHit?: Array<{ applyConditionId?: string }> };
      expect((w.onHit ?? []).map((r) => r.applyConditionId).filter(Boolean), id).toEqual(expected);
    }
  });

  it('Grick Tentacles (Medium-or-smaller) grapples a Medium target — recording the grick — but not a Large one', () => {
    const med = riderAttack('grick', 'grick-tentacles', medium());
    const grappled = conditions(med.events).find((e) => e.conditionId === 'grappled');
    expect(grappled).toBeDefined();
    expect(grappled!.sourceCharacterId).toBe(med.attackerId);
    expect(appliedIds(riderAttack('grick', 'grick-tentacles', large()).events)).not.toContain('grappled');
  });

  it('Roc Talons (Huge-or-smaller) apply BOTH Grappled and Restrained to a Huge target', () => {
    const ids = appliedIds(riderAttack('roc', 'roc-talons', huge()).events);
    expect(ids).toContain('grappled');
    expect(ids).toContain('restrained');
  });

  it('Glabrezu Pincer grapples a Medium target; Barbed Devil Claws grapple a Large one', () => {
    expect(appliedIds(riderAttack('glabrezu', 'glabrezu-pincer', medium()).events)).toContain('grappled');
    expect(appliedIds(riderAttack('barbed-devil', 'barbed-devil-claws', large()).events)).toContain('grappled');
  });

  it('Chimera Ram knocks a Medium target Prone', () => {
    expect(appliedIds(riderAttack('chimera', 'chimera-ram', medium()).events)).toContain('prone');
  });

  it('Mammoth Gore knocks Prone only on a charge', () => {
    expect(appliedIds(riderAttack('mammoth', 'mammoth-gore', medium(), { charged: true }).events)).toContain('prone');
    expect(appliedIds(riderAttack('mammoth', 'mammoth-gore', medium(), { charged: false }).events)).not.toContain('prone');
  });
});
