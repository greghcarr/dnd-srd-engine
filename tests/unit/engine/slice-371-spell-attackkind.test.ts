// Slice 371 - melee spell attacks were tagged ranged.
//
// Bug (the second half of the slice-370 phantom-field sweep): the five RAW
// melee spell attacks (Shocking Grasp, Spiritual Weapon, Chill Touch,
// Flame Blade, Vampiric Touch) carried `attackKind: 'melee'`, but
// SpellAttackMechanicSchema had no `attackKind` field, so Zod stripped it
// and cast-spell hardcoded `attackKind: 'ranged'` on the AttackRolled
// event. The `event.attackKind` predicate fact (dispatch.ts) was therefore
// 'ranged' for them, so melee-gated riders wouldn't fire and the
// ranged-in-melee disadvantage could wrongly apply. Fix: added
// `attackKind` (default 'ranged') to the schema, cast-spell stamps
// `mechanic.attackKind`, and the attack schema is now `.strict()`.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { SpellMechanicSchema } from '../../../src/schemas/content/spell.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Caster', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 10, DEX: 12, CON: 10, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    preparedSpells: ['shocking-grasp', 'fire-bolt'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const attackKindOf = (spellId: string): string | undefined => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const caster = buildCaster();
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: spellId });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.castSpell(campaign.state, {
    characterId: caster.id, spellId, slotLevel: spellId === 'shocking-grasp' || spellId === 'fire-bolt' ? 0 : 1, targetIds: [target.id],
  }).events as ReadonlyArray<Event>;
  const ar = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
  return ar?.attackKind;
};

describe('slice 371: spell attacks carry the correct attackKind', () => {
  it('a melee spell attack (Shocking Grasp) tags the AttackRolled as melee', () => {
    expect(attackKindOf('shocking-grasp')).toBe('melee');
  });

  it('a ranged spell attack (Fire Bolt) tags the AttackRolled as ranged', () => {
    expect(attackKindOf('fire-bolt')).toBe('ranged');
  });

  it('all five RAW melee spell attacks resolve with attackKind melee', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    for (const id of ['shocking-grasp', 'spiritual-weapon', 'chill-touch', 'flame-blade', 'vampiric-touch']) {
      const me = engine.content.spells.get(id)?.mechanicalEffects?.[0] as { attackKind?: string } | undefined;
      expect(me?.attackKind, `${id} should be a melee spell attack`).toBe('melee');
    }
  });

  it('SpellAttackMechanicSchema rejects a phantom field (the .strict() guard)', () => {
    const phantom = SpellMechanicSchema.safeParse({
      kind: 'attack',
      damageDice: '1d10',
      damageType: 'fire',
      meleeSpellAttack: true, // an unsupported field must now fail to parse
    });
    expect(phantom.success).toBe(false);
    expect(
      SpellMechanicSchema.safeParse({ kind: 'attack', damageDice: '1d10', damageType: 'fire', attackKind: 'melee' }).success,
    ).toBe(true);
  });
});
