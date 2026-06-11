// Slice 823: monster-onhit-rider-pass (batch 2) — the on-hit save/condition
// riders the multiattack sweep deferred that use existing machinery:
//   - Were-creature lycanthropy: a NEW `lycanthropy-cursed` marker condition
//     applied via the onHit `save.conditionOnFail` path (CON save, gated on a
//     Humanoid target). Inert in the engine — the "0 HP -> becomes a
//     Were-creature" transformation is GM/consumer territory.
//   - Cloud Giant Thundercloud -> Incapacitated, Oni Nightmare Ray ->
//     Frightened (unconditional `applyConditionId`, existing conditions).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { getCreatureType } from '../../../src/derive/creature-type.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// A Humanoid PC target with feeble CON so the curse save usually fails.
const humanoidTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Villager', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 6, CON: 4, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 3,
  });
// A non-Humanoid target (Skeleton = Undead) — the curse gate must exclude it.
const undeadTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Skeleton', speciesId: 'human', backgroundId: 'soldier', statblockId: 'skeleton',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 6, CON: 4, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 3,
  });

// Resolve `statblockId`'s natural-weapon attack against `t`, looping seeds
// until the attack hits (and, when `untilSaveFails`, until its on-hit save
// also fails). Returns the events + attacker id.
const riderAttack = (
  statblockId: string, weaponId: string, t: Character, opts: { untilSaveFails?: boolean } = {},
): { events: ReadonlyArray<Event>; attackerId: string } => {
  for (let seed = 1; seed < 200; seed += 1) {
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
    }).events as ReadonlyArray<Event>;
    const hit = (events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true;
    if (!hit) continue;
    if (opts.untilSaveFails) {
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (save === undefined || save.success !== false) continue;
    }
    return { events, attackerId: attacker.id };
  }
  throw new Error(`no qualifying seed for ${weaponId}`);
};

const appliedIds = (events: ReadonlyArray<Event>): string[] =>
  events.filter((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied').map((e) => e.conditionId);

describe('lycanthropy + on-hit condition riders (slice 823)', () => {
  it('ships the lycanthropy-cursed marker condition and the 7 batch-2 riders', () => {
    expect(PACK.conditions.find((c) => c.id === 'lycanthropy-cursed')).toBeDefined();
    const onHitOf = (id: string) =>
      (PACK.items.find((i) => i.id === id) as { onHit?: Array<Record<string, unknown>> }).onHit;
    for (const id of ['werebear-bite', 'wereboar-gore', 'wererat-bite', 'weretiger-bite', 'werewolf-bite']) {
      const save = (onHitOf(id)?.[0]?.save ?? {}) as { ability?: string; conditionOnFail?: string };
      expect(save.ability, id).toBe('CON');
      expect(save.conditionOnFail, id).toBe('lycanthropy-cursed');
    }
    expect(onHitOf('cloud-giant-thundercloud')?.[0]?.applyConditionId).toBe('incapacitated');
    expect(onHitOf('oni-nightmare-ray')?.[0]?.applyConditionId).toBe('frightened');
  });

  it('the curse gate distinguishes Humanoid from non-Humanoid targets', () => {
    expect(getCreatureType(humanoidTarget(), CONTENT)).toBe('Humanoid');
    expect(getCreatureType(undeadTarget(), CONTENT)).not.toBe('Humanoid');
  });

  it('Werewolf Bite curses a Humanoid on a failed CON save, sourced by the werewolf', () => {
    const r = riderAttack('werewolf', 'werewolf-bite', humanoidTarget(), { untilSaveFails: true });
    const curse = r.events.find(
      (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'lycanthropy-cursed',
    );
    expect(curse).toBeDefined();
    expect(curse!.sourceCharacterId).toBe(r.attackerId);
  });

  it('Werewolf Bite on an Undead target rolls no curse save and applies no curse', () => {
    const r = riderAttack('werewolf', 'werewolf-bite', undeadTarget());
    expect(r.events.some((e) => e.type === 'SaveRolled')).toBe(false);
    expect(appliedIds(r.events)).not.toContain('lycanthropy-cursed');
  });

  it('Cloud Giant Thundercloud incapacitates its target on a hit', () => {
    expect(appliedIds(riderAttack('cloud-giant', 'cloud-giant-thundercloud', humanoidTarget()).events)).toContain('incapacitated');
  });

  it('Oni Nightmare Ray frightens its target on a hit', () => {
    expect(appliedIds(riderAttack('oni', 'oni-nightmare-ray', humanoidTarget()).events)).toContain('frightened');
  });
});
