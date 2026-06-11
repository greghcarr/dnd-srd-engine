// Slice 831: the monster Parry reaction. RAW (SRD 5.2.1 Bandit Captain /
// Knight / Warrior Veteran / Noble +2, Gladiator +3): "Trigger: hit by a
// melee attack roll while holding a weapon. Response: adds N to its AC
// against that attack, possibly causing it to miss." Modeled as a new
// `GrantParry { acBonus }` trait + `engine.plan.parry` (structural twin of
// planShield: +AC vs the triggering hit, reports preventedHit) + a reaction-
// affordance descriptor. Closes the L7 `monster-parry-reaction` divergence.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { reactionsForTrigger, availableReactions } from '../../../src/query/reactions.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ParryUsedEvent } from '../../../src/schemas/events/parry.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const mkMonster = (statblockId: string, name = statblockId): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name,
    statblockId,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === statblockId)!.abilityScores,
    hp: { current: 100, max: 100, temp: 0 },
  });

const stageOne = (c: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'parry' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const mkAttack = (
  attackerId: string, targetId: string, total: number, kind: 'melee' | 'ranged', targetAC = 18,
): AttackRolledEvent => ({
  id: eventId(), at: isoTimestamp(), type: 'AttackRolled',
  attackerId, targetId, weaponInstanceId: eventId(),
  d20: [15], used: 'none', attackBonus: 0, total, targetAC, hit: true, critical: false, attackKind: kind,
});

describe('monster Parry reaction (slice 831)', () => {
  it('the in-scope Parry monsters carry GrantParry with the SRD bonus', () => {
    const EXPECT: Record<string, number> = {
      'bandit-captain': 2, knight: 2, 'warrior-veteran': 2, noble: 2, gladiator: 3,
    };
    for (const [id, bonus] of Object.entries(EXPECT)) {
      const trait = (PACK.monsters.find((m) => m.id === id)!.traits ?? []).find(
        (t): t is { kind: 'GrantParry'; acBonus: number } => t.kind === 'GrantParry',
      );
      expect(trait, id).toBeDefined();
      expect(trait!.acBonus, id).toBe(bonus);
    }
  });

  it('the effect stack exposes parryBonus for a Parry monster and undefined otherwise', () => {
    const knight = mkMonster('knight');
    const { campaign } = stageOne(knight);
    const stack = buildEffectStack({
      character: knight, content: CONTENT,
      itemInstances: campaign.state.itemInstances, pendingChoices: campaign.state.pendingChoices,
    });
    expect(stack.parryBonus()).toBe(2);

    const wolf = mkMonster('wolf');
    const w = stageOne(wolf);
    expect(buildEffectStack({
      character: wolf, content: CONTENT,
      itemInstances: w.campaign.state.itemInstances, pendingChoices: w.campaign.state.pendingChoices,
    }).parryBonus()).toBeUndefined();
  });

  it('planParry: +2 that would flip the hit reports preventedHit and emits ParryUsed', () => {
    const knight = mkMonster('knight');
    const { engine, campaign } = stageOne(knight);
    // total 19 vs AC 18: a hit, but 19 < 18 + 2 → Parry flips it to a miss.
    const out = engine.plan.parry(campaign.state, {
      characterId: knight.id, triggeringAttackEventId: eventId(), triggeringAttackTotal: 19, originalAC: 18,
    });
    expect(out.preventedHit).toBe(true);
    const ev = out.events.find((e): e is ParryUsedEvent => e.type === 'ParryUsed')!;
    expect(ev.acBonus).toBe(2);
    expect(ev.preventedHit).toBe(true);
  });

  it('planParry: a hit +2 cannot flip still resolves, with preventedHit false', () => {
    const knight = mkMonster('knight');
    const { engine, campaign } = stageOne(knight);
    // total 20 vs AC 18: 20 >= 18 + 2 → Parry doesn't save it.
    const out = engine.plan.parry(campaign.state, {
      characterId: knight.id, triggeringAttackEventId: eventId(), triggeringAttackTotal: 20, originalAC: 18,
    });
    expect(out.preventedHit).toBe(false);
    expect(out.events.some((e) => e.type === 'ParryUsed')).toBe(true);
  });

  it('planParry throws for a creature without the Parry trait', () => {
    const wolf = mkMonster('wolf');
    const { engine, campaign } = stageOne(wolf);
    expect(() =>
      engine.plan.parry(campaign.state, {
        characterId: wolf.id, triggeringAttackEventId: eventId(), triggeringAttackTotal: 10, originalAC: 13,
      }),
    ).toThrow(/does not have the Parry/);
  });

  it('reactionsForTrigger surfaces Parry for a melee hit +2 would flip — not for ranged, not for a non-flipping hit', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const knight = mkMonster('knight');
    const attacker = mkMonster('wolf', 'Attacker');
    let c: Campaign = engine.createCampaign({ name: 'parry-aff' });
    c = commit(c, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: knight } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    ]);
    const created = engine.plan.createEncounter(c.state, { combatantIds: [knight.id, attacker.id] });
    c = commit(c, created.events);
    c = commit(c, engine.plan.rollInitiative(c.state, { encounterId: created.encounterId }).events);
    c = commit(c, engine.plan.startEncounter(c.state, { encounterId: created.encounterId }).events);
    c = commit(c, engine.plan.beginFirstTurn(c.state, { encounterId: created.encounterId }).events);

    const ids = (ev: AttackRolledEvent): string[] =>
      reactionsForTrigger(c.state, CONTENT, created.encounterId, knight.id, ev).map((r) => r.id);

    expect(ids(mkAttack(attacker.id, knight.id, 19, 'melee'))).toContain('parry'); // flips
    expect(ids(mkAttack(attacker.id, knight.id, 19, 'ranged'))).not.toContain('parry'); // melee-only
    expect(ids(mkAttack(attacker.id, knight.id, 20, 'melee'))).not.toContain('parry'); // +2 can't flip
    // The correlated intent is ready to dispatch to engine.plan.parry.
    const parry = reactionsForTrigger(c.state, CONTENT, created.encounterId, knight.id, mkAttack(attacker.id, knight.id, 19, 'melee'))
      .find((r) => r.id === 'parry')!;
    expect(parry.intent).toMatchObject({ type: 'Parry', characterId: knight.id, triggeringAttackTotal: 19, originalAC: 18 });
    // And availableReactions enumerates it.
    expect(availableReactions(c.state, CONTENT, created.encounterId, knight.id).map((r) => r.id)).toContain('parry');
  });

  it('Parry consumes the reaction; a second Parry the same round throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const knight = mkMonster('knight');
    const attacker = mkMonster('wolf', 'Attacker');
    let c: Campaign = engine.createCampaign({ name: 'parry-econ' });
    c = commit(c, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: knight } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    ]);
    const created = engine.plan.createEncounter(c.state, { combatantIds: [knight.id, attacker.id] });
    c = commit(c, created.events);
    c = commit(c, engine.plan.rollInitiative(c.state, { encounterId: created.encounterId }).events);
    c = commit(c, engine.plan.startEncounter(c.state, { encounterId: created.encounterId }).events);
    c = commit(c, engine.plan.beginFirstTurn(c.state, { encounterId: created.encounterId }).events);

    const first = engine.plan.parry(c.state, {
      characterId: knight.id, triggeringAttackEventId: eventId(), triggeringAttackTotal: 19, originalAC: 18,
    });
    expect(first.events.some((e) => e.type === 'ActionEconomyConsumed')).toBe(true);
    c = commit(c, first.events);
    expect(() =>
      engine.plan.parry(c.state, {
        characterId: knight.id, triggeringAttackEventId: eventId(), triggeringAttackTotal: 19, originalAC: 18,
      }),
    ).toThrow(/reaction already used/);
  });
});
