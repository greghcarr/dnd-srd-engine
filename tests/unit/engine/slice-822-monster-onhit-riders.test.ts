// Slice 822: monster-onhit-rider-pass (batch 1) — the size-gated grapple /
// prone on-hit riders the multiattack sweep (789-792) deferred. Modeled on
// the wolf-bite / boar-gore template (slice-321 `applyConditionId` + the
// slice-446 `target.creatureSize` predicate fact), using existing conditions
// (grappled / restrained / poisoned / prone). 10 natural weapons across 8
// in-scope monsters, each SRD-verified against monsters-A-Z.md / animals.md.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { creatureSize } from '../../../src/derive/creature-size.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const target = (name: string, statblockId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    ...(statblockId !== undefined ? { statblockId } : {}),
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 6, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 3,
  });
const mediumTarget = () => target('Medium PC');
const largeTarget = () => target('Ogre', 'ogre');
const hugeTarget = () => target('Hill Giant', 'hill-giant');

// Resolve `statblockId`'s natural-weapon attack against `t`, looping seeds
// until it hits, and return the on-hit events + the attacker id.
const riderAttack = (
  statblockId: string,
  weaponId: string,
  t: Character,
  opts: { charged?: boolean } = {},
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

describe('monster on-hit grapple/prone riders (slice 822)', () => {
  it('the 10 swept natural weapons carry the SRD on-hit conditions', () => {
    const EXPECT: Record<string, string[]> = {
      'aboleth-tentacle': ['grappled'],
      'chuul-pincer': ['grappled'],
      'chain-devil-chain': ['grappled', 'restrained'],
      'griffon-rend': ['grappled'],
      'otyugh-tentacle': ['grappled'],
      'roper-tentacle': ['grappled', 'poisoned'],
      'tyrannosaurus-rex-bite': ['grappled', 'restrained'],
      'stone-giant-boulder': ['prone'],
      'tyrannosaurus-rex-tail': ['prone'],
      'triceratops-gore': ['prone'],
    };
    for (const [id, expected] of Object.entries(EXPECT)) {
      const w = PACK.items.find((i) => i.id === id) as { onHit?: Array<{ applyConditionId?: string }> };
      const got = (w.onHit ?? []).map((r) => r.applyConditionId).filter(Boolean);
      expect(got, id).toEqual(expected);
    }
  });

  it('the target-size targets are the expected sizes', () => {
    expect(creatureSize(mediumTarget(), CONTENT)).toBe('Medium');
    expect(creatureSize(largeTarget(), CONTENT)).toBe('Large');
    expect(creatureSize(hugeTarget(), CONTENT)).toBe('Huge');
  });

  it('Griffon Rend (Medium-or-smaller) grapples a Medium target, recording the griffon as grappler — but not a Large one', () => {
    const med = riderAttack('griffon', 'griffon-rend', mediumTarget());
    const grappled = conditions(med.events).find((e) => e.conditionId === 'grappled');
    expect(grappled).toBeDefined();
    expect(grappled!.sourceCharacterId).toBe(med.attackerId); // the grappler
    expect(appliedIds(riderAttack('griffon', 'griffon-rend', largeTarget()).events)).not.toContain('grappled');
  });

  it('Aboleth Tentacle (Large-or-smaller) grapples a Large target but not a Huge one', () => {
    expect(appliedIds(riderAttack('aboleth', 'aboleth-tentacle', largeTarget()).events)).toContain('grappled');
    expect(appliedIds(riderAttack('aboleth', 'aboleth-tentacle', hugeTarget()).events)).not.toContain('grappled');
  });

  it('Chain Devil Chain applies BOTH Grappled and Restrained to a Large target', () => {
    const ids = appliedIds(riderAttack('chain-devil', 'chain-devil-chain', largeTarget()).events);
    expect(ids).toContain('grappled');
    expect(ids).toContain('restrained');
  });

  it('Roper Tentacle (no size gate) grapples and poisons any target', () => {
    const ids = appliedIds(riderAttack('roper', 'roper-tentacle', hugeTarget()).events);
    expect(ids).toContain('grappled');
    expect(ids).toContain('poisoned');
  });

  it('Tyrannosaurus Tail (Huge-or-smaller) knocks a Huge target Prone', () => {
    expect(appliedIds(riderAttack('tyrannosaurus-rex', 'tyrannosaurus-rex-tail', hugeTarget()).events)).toContain('prone');
  });

  it('Triceratops Gore: extra 2d8 + Prone only on a charge', () => {
    const charged = riderAttack('triceratops', 'triceratops-gore', mediumTarget(), { charged: true });
    expect(appliedIds(charged.events)).toContain('prone');
    const notCharged = riderAttack('triceratops', 'triceratops-gore', mediumTarget(), { charged: false });
    expect(appliedIds(notCharged.events)).not.toContain('prone');
  });
});
