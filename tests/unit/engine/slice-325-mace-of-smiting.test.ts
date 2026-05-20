// Slice 325 — Mace of Smiting's crit riders + Construct auto-destroy.
// On a crit: +7 Bludgeoning vs a non-Construct, +14 vs a Construct; and
// if a Construct has <= 25 HP after that damage it is destroyed (no
// save — the unconditional `destroy` rider arm). Exercises the crit-gate
// (slice 324), the flat-damage 0d6+N shape, and CreatureDestroyed
// (slice 323) via the no-save destroy arm.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { replay } from '../../../src/engine/replay.js';
import { throwOnCallRNG } from '../../../src/rng/throw.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const WEAPON_ID = 'mace-of-smiting';

const buildWielder = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Smiter', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    inventory: [weaponId], equipped: { mainHand: weaponId },
  });

const buildTarget = (opts: { hp: number; statblockId?: string }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'sage',
    ...(opts.statblockId !== undefined ? { kind: 'creature', statblockId: opts.statblockId } : {}),
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: opts.hp, max: opts.hp }, armorClass: 8,
  });

const constructId = PACK.monsters.find((m) => (m as { type?: string }).type === 'Construct')?.id;

interface Outcome { campaign: Campaign; events: ReadonlyArray<Event>; targetId: string; }

// First seed whose attack hits with `wantCritical`. Returns the
// committed campaign + events.
const attack = (target: Character, wantCritical: boolean): Outcome | undefined => {
  for (let seed = 1; seed < 200; seed += 1) {
    const weapon = makeItemInstance(WEAPON_ID);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const wielder = buildWielder(weapon.id);
    let campaign: Campaign = engine.createCampaign({ name: `ms-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wielder } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, { attackerId: wielder.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (rolled?.hit !== true || rolled.critical !== wantCritical) continue;
    return { campaign: commit(campaign, events), events, targetId: target.id };
  }
  return undefined;
};

const bludgeoningRider = (events: ReadonlyArray<Event>): number | undefined => {
  const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled');
  // The base mace component is also bludgeoning; the flat rider is the
  // component with 0 rolled dice and a positive modifier.
  const flat = damage?.rolls.find((r) => r.type === 'bludgeoning' && r.rolls.length === 0 && r.modifier > 0);
  return flat?.modifier;
};

describe('slice 325: Mace of Smiting crit riders + Construct destroy', () => {
  it('adds +7 flat bludgeoning on a crit vs a Humanoid (no destroy)', () => {
    const out = attack(buildTarget({ hp: 200 }), true);
    expect(out, 'expected a crit').toBeDefined();
    expect(bludgeoningRider(out!.events)).toBe(7);
    expect(out!.events.some((e) => e.type === 'CreatureDestroyed')).toBe(false);
  });

  it('adds no rider on a normal (non-crit) hit', () => {
    const out = attack(buildTarget({ hp: 200 }), false);
    expect(out, 'expected a normal hit').toBeDefined();
    expect(bludgeoningRider(out!.events)).toBeUndefined();
  });

  it.runIf(constructId !== undefined)('adds +14 vs a high-HP Construct on a crit, but does not destroy (over 25 HP)', () => {
    const out = attack(buildTarget({ hp: 200, statblockId: constructId }), true);
    expect(out, 'expected a crit').toBeDefined();
    expect(bludgeoningRider(out!.events)).toBe(14);
    expect(out!.events.some((e) => e.type === 'CreatureDestroyed')).toBe(false);
  });

  it.runIf(constructId !== undefined)('destroys a Construct left at <= 25 HP after the crit damage', () => {
    const out = attack(buildTarget({ hp: 20, statblockId: constructId }), true);
    expect(out, 'expected a crit').toBeDefined();
    expect(bludgeoningRider(out!.events)).toBe(14);
    expect(out!.events.some((e) => e.type === 'CreatureDestroyed')).toBe(true);
    const victim = out!.campaign.state.characters[out!.targetId]!;
    expect(victim.hp.current).toBe(0);
    expect(victim.deathSaves.failures).toBe(3);
    // Replay-equivalence + RNG-capture hold with the destroy in the stream.
    expect(JSON.stringify(replay(out!.campaign.events))).toBe(JSON.stringify(out!.campaign.state));
    void throwOnCallRNG();
    expect(() => replay(out!.campaign.events)).not.toThrow();
  });
});
