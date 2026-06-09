// Slice 753: deterministic correctness gate for the positional Protection
// branch of the pre-damage reaction resolver. Random tactical fuzz almost
// never lines up (a shield-bearing ally with the Protection fighting style
// adjacent to an attacked ally), so this constructs the scenario directly:
// two allies 5 ft apart, the protector with Protection + a shield, an
// enemy hitting the other ally. Asserts the reaction fires and the damage
// is dropped exactly when the disadvantage reroll flips the hit to a miss,
// and that an out-of-range protector does NOT react.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { resolveAttackWithReactions } from '../../../scripts/reactions/pre-damage-policy.js';
import { disadvantageFlipsHit } from '../../../src/ai/reactions.js';
import { replay } from '../../../src/engine/replay.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance, loadPhbExtrasTestPack } from '../../fixtures/index.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();
const EXTRAS = loadPhbExtrasTestPack();

const ORIG_D20 = 20;
const ATTACK_BONUS = 0;
const TARGET_AC = 20; // total 20 >= 20 hits; disadvantage flips it iff the reroll < 20

const fighter = (name: string, opts: { shieldId?: string; protection?: boolean } = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: opts.protection === true ? ['fighting-style-protection'] : [],
    inventory: opts.shieldId !== undefined ? [opts.shieldId] : [],
    equipped: { ...(opts.shieldId !== undefined ? { shield: opts.shieldId } : {}), attuned: [] },
  });

// Build a started, positioned encounter (protector, target, attacker) and a
// planned (uncommitted) attack on the target, then run the resolver.
const run = (protectorPos: { x: number; y: number }): { campaign: Campaign; targetId: string } => {
  const engine = createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(7) });
  const shield = makeItemInstance('shield');
  const protector = fighter('Shielder', { shieldId: shield.id, protection: true });
  const target = fighter('Ally');
  const attacker = fighter('Goblin');

  let campaign = engine.createCampaign({ name: 'protection' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: shield },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: protector },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker },
  ] as Event[]);

  const enc = engine.plan.createEncounter(campaign.state, {
    name: 'arena',
    combatants: [
      { characterId: protector.id, position: protectorPos },
      { characterId: target.id, position: { x: 5, y: 0 } },
      { characterId: attacker.id, position: { x: 100, y: 0 } },
    ],
  });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);

  // A planned (uncommitted) attack on the target: a hit that disadvantage
  // can flip. dropDamageChain cuts at the first damage event (DamageApplied).
  const attackEvents = [
    {
      id: eventId(), at: isoTimestamp(), type: 'AttackRolled',
      attackerId: attacker.id, targetId: target.id, weaponInstanceId: eventId(),
      d20: [ORIG_D20], used: 'none', attackBonus: ATTACK_BONUS, total: ORIG_D20 + ATTACK_BONUS,
      targetAC: TARGET_AC, hit: true, critical: false, attackKind: 'melee',
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'DamageApplied',
      targetId: target.id, components: [{ amount: 8, type: 'slashing' }],
    },
  ] as unknown as Event[];

  const after = resolveAttackWithReactions({
    engine,
    campaign,
    encounterId: enc.encounterId,
    attackEvents,
    defenderTeam: [protector.id, target.id],
    isTactical: true,
  });
  return { campaign: after, targetId: target.id };
};

const damageAppliedTo = (events: ReadonlyArray<Event>, targetId: string): boolean =>
  events.some((e) => e.type === 'DamageApplied' && (e as { targetId: string }).targetId === targetId);

describe('Protection resolver (slice 753)', () => {
  it('an adjacent shield-protector reacts; damage is dropped exactly when the reroll flips the hit', () => {
    const { campaign, targetId } = run({ x: 0, y: 0 }); // 5 ft from the target
    const used = campaign.events.find((e) => e.type === 'ProtectionUsed');
    expect(used, 'Protection did not fire for the adjacent protector').toBeDefined();
    const newD20 = (used as { newD20: number }).newD20;
    const flipped = disadvantageFlipsHit(ORIG_D20, newD20, ATTACK_BONUS, TARGET_AC);
    expect(damageAppliedTo(campaign.events, targetId), 'damage should be dropped iff the hit flipped to a miss')
      .toBe(!flipped);
    // The committed (possibly sliced) log must rebuild the exact state.
    expect(JSON.stringify(replay(campaign.events))).toBe(JSON.stringify(campaign.state));
  });

  it('a protector more than 5 ft away does not react', () => {
    const { campaign, targetId } = run({ x: 50, y: 0 }); // 45 ft from the target
    expect(campaign.events.some((e) => e.type === 'ProtectionUsed'), 'Protection fired out of range').toBe(false);
    expect(damageAppliedTo(campaign.events, targetId), 'the unprotected hit should land').toBe(true);
  });
});
