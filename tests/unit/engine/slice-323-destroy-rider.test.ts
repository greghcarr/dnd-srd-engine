// Slice 323 — instant-destroy on-hit save rider. Mace of Disruption:
// against a Fiend/Undead, the +2d6 radiant rider also carries a save
// gated on post-damage HP <= 25 — DC 15 WIS or be destroyed (a
// CreatureDestroyed event, bypassing death saves); on a success the
// target is Frightened. The save fires only within the HP threshold and
// only when the rider's vs-Fiend/Undead gate passes.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { throwOnCallRNG } from '../../../src/rng/throw.js';
import { replay } from '../../../src/engine/replay.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const WEAPON_ID = 'mace-of-disruption';

const buildWielder = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Cleric', speciesId: 'human', backgroundId: 'acolyte',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    inventory: [weaponId], equipped: { mainHand: weaponId, attuned: [weaponId] as never },
  });

const buildTarget = (opts: { hp: number; statblockId?: string }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'sage',
    ...(opts.statblockId !== undefined ? { kind: 'creature', statblockId: opts.statblockId } : {}),
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: opts.hp, max: opts.hp }, armorClass: 8,
  });

const statblockOfType = (type: string): string | undefined =>
  PACK.monsters.find((m) => (m as { type?: string }).type === type)?.id;

interface HitOutcome {
  campaign: Campaign;
  events: ReadonlyArray<import('../../../src/schemas/events/index.js').Event>;
  targetId: string;
  wielderId: string;
}

// Drives one attack on a fresh campaign for the given seed; returns the
// committed campaign + events when the attack hits, else undefined.
const attackOnHit = (seed: number, target: Character): HitOutcome | undefined => {
  const weapon = makeItemInstance(WEAPON_ID);
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const wielder = buildWielder(weapon.id);
  let campaign: Campaign = engine.createCampaign({ name: `md-${seed}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wielder } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.attack(campaign.state, { attackerId: wielder.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
  const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
  if (rolled?.hit !== true) return undefined;
  return { campaign: commit(campaign, events), events, targetId: target.id, wielderId: wielder.id };
};

describe('slice 323: Mace of Disruption destroy-or-Frighten save', () => {
  const undeadId = statblockOfType('Undead');

  it.runIf(undeadId !== undefined)('destroys a low-HP Undead on a failed WIS save', () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const out = attackOnHit(seed, buildTarget({ hp: 22, statblockId: undeadId }));
      if (out === undefined) continue;
      const save = out.events.find((e) => e.type === 'SaveRolled');
      if (save === undefined || (save as { success: boolean }).success !== false) continue;
      // Failed save -> CreatureDestroyed, and the target is dead in state.
      expect(out.events.some((e) => e.type === 'CreatureDestroyed')).toBe(true);
      const victim = out.campaign.state.characters[out.targetId]!;
      expect(victim.hp.current).toBe(0);
      expect(victim.deathSaves.failures).toBe(3);
      // Replay-equivalence holds with the new event in the stream.
      expect(JSON.stringify(replay(out.campaign.events))).toBe(JSON.stringify(out.campaign.state));
      void throwOnCallRNG();
      expect(() => replay(out.campaign.events)).not.toThrow();
      return;
    }
    throw new Error('no failed-save destroy found within the seed budget');
  });

  it.runIf(undeadId !== undefined)('Frightens (does not destroy) a low-HP Undead on a successful save', () => {
    for (let seed = 1; seed < 400; seed += 1) {
      const out = attackOnHit(seed, buildTarget({ hp: 22, statblockId: undeadId }));
      if (out === undefined) continue;
      const save = out.events.find((e) => e.type === 'SaveRolled');
      if (save === undefined || (save as { success: boolean }).success !== true) continue;
      expect(out.events.some((e) => e.type === 'CreatureDestroyed')).toBe(false);
      const cond = out.events.find((e) => e.type === 'ConditionApplied');
      expect(cond).toBeDefined();
      expect((cond as { conditionId: string }).conditionId).toBe('frightened');
      return;
    }
    throw new Error('no successful-save frighten found within the seed budget');
  });

  it.runIf(undeadId !== undefined)('rolls no save against a high-HP Undead (over the 25-HP threshold)', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const out = attackOnHit(seed, buildTarget({ hp: 200, statblockId: undeadId }));
      if (out === undefined) continue;
      expect(out.events.some((e) => e.type === 'SaveRolled')).toBe(false);
      expect(out.events.some((e) => e.type === 'CreatureDestroyed')).toBe(false);
      // The radiant rider still fired (vs-Undead gate passed).
      const damage = out.events.find((e) => e.type === 'DamageRolled');
      expect((damage as { rolls: { type: string }[] }).rolls.some((r) => r.type === 'radiant')).toBe(true);
      return;
    }
    throw new Error('no hit found within the seed budget');
  });

  it('rolls no save and no radiant against a non-Fiend/Undead (Humanoid) target', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const out = attackOnHit(seed, buildTarget({ hp: 22 }));
      if (out === undefined) continue;
      expect(out.events.some((e) => e.type === 'SaveRolled')).toBe(false);
      expect(out.events.some((e) => e.type === 'CreatureDestroyed')).toBe(false);
      const damage = out.events.find((e) => e.type === 'DamageRolled');
      expect((damage as { rolls: { type: string }[] }).rolls.some((r) => r.type === 'radiant')).toBe(false);
      return;
    }
    throw new Error('no hit found within the seed budget');
  });
});
