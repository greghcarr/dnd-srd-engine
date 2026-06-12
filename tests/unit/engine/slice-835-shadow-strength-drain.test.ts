// Slice 835: Shadow Strength Drain — the ability-score-drain accumulator. RAW
// (SRD 5.2.1 Shadow, CR 1/2): "Draining Swipe. Melee Attack Roll: +4, reach 5
// ft. Hit: 5 (1d6 + 2) Necrotic damage, and the target's Strength score
// decreases by 1d4. The target dies if this reduces that score to 0." New
// weapon `drainsAbility` flag + `character.abilityDrain` accumulator threaded
// through `effectiveAbilityScore` at the combat/derived consumers, restored on
// a Long Rest. Closes the L7 `drain-undead-shadow` row (the on-kill Shadow
// spawn stays consumer/DM-managed).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { effectiveAbilityScore } from '../../../src/derive/ability.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { AbilityScoreDrainedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const target = (str = 10): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Victim', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: str, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 3,
  });

const mkShadow = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Shadow', kind: 'creature', statblockId: 'shadow',
    speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === 'shadow')!.abilityScores,
    hp: { current: 50, max: 50, temp: 0 },
  });

// Seed-loop until the Draining Swipe hits.
const drainSwipe = (
  t: Character,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; events: ReadonlyArray<Event>; targetId: string } => {
  const shadow = mkShadow();
  for (let seed = 1; seed < 200; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const weapon = makeItemInstance('shadow-draining-swipe');
    let campaign: Campaign = engine.createCampaign({ name: 'shadow' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: shadow } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: shadow.id, targetId: t.id, weaponInstanceId: weapon.id, advantage: 'advantage',
    }).events as ReadonlyArray<Event>;
    if ((events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true) {
      return { engine, campaign, events, targetId: t.id };
    }
  }
  throw new Error('no hitting seed for Shadow Draining Swipe');
};

const drained = (events: ReadonlyArray<Event>): AbilityScoreDrainedEvent | undefined =>
  events.find((e): e is AbilityScoreDrainedEvent => e.type === 'AbilityScoreDrained');

describe('Shadow Strength Drain — ability-score-drain accumulator (slice 835)', () => {
  it('effectiveAbilityScore subtracts the drain last and clamps to 1', () => {
    expect(effectiveAbilityScore(14, undefined, undefined, 4)).toBe(10);
    expect(effectiveAbilityScore(14, undefined, undefined, 0)).toBe(14); // no drain
    expect(effectiveAbilityScore(2, undefined, undefined, 5)).toBe(1); // clamp (a dead creature)
    // Floor/increase apply before the drain: floor 19 (Gauntlets) − 4 = 15.
    expect(effectiveAbilityScore(8, 19, undefined, 4)).toBe(15);
  });

  it('the Shadow Draining Swipe weapon drains STR by 1d4, and the action is wired', () => {
    const w = PACK.items.find((i) => i.id === 'shadow-draining-swipe') as { drainsAbility?: { ability: string; dice: string }; damageType?: string };
    expect(w.drainsAbility).toEqual({ ability: 'STR', dice: '1d4' });
    expect(w.damageType).toBe('necrotic');
    expect(PACK.monsters.find((m) => m.id === 'shadow')!.actions.map((a) => a.weaponId)).toContain('shadow-draining-swipe');
  });

  it('a hit deals necrotic + drains STR (accumulating on abilityDrain), reflected in a STR save', () => {
    const { campaign, events, targetId } = drainSwipe(target(14));
    const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied')!;
    expect(dmg.components.some((c) => c.type === 'necrotic')).toBe(true);
    const drain = drained(events)!;
    expect(drain).toBeDefined();
    expect(drain.ability).toBe('STR');
    expect(drain.amount).toBeGreaterThanOrEqual(1);
    expect(drain.amount).toBeLessThanOrEqual(4);

    const beforeSave = computeSavingThrow({ character: campaign.state.characters[targetId]!, itemInstances: campaign.state.itemInstances, content: CONTENT, ability: 'STR' }).total;
    const after = commit(campaign, events);
    expect(after.state.characters[targetId]!.abilityDrain?.STR).toBe(drain.amount);
    // The drained STR lowers the STR save (wizard isn't STR-save proficient, so
    // the save is the raw mod): −1 per 2 points drained.
    const afterSave = computeSavingThrow({ character: after.state.characters[targetId]!, itemInstances: after.state.itemInstances, content: CONTENT, ability: 'STR' }).total;
    expect(afterSave).toBe(beforeSave - Math.floor(drain.amount / 2));
  });

  it('drains accumulate on abilityDrain (a second drain adds to the first)', () => {
    const t = target(16);
    const first = drainSwipe(t);
    const firstAmount = drained(first.events)!.amount;
    let after = commit(first.campaign, first.events);
    expect(after.state.characters[t.id]!.abilityDrain?.STR).toBe(firstAmount);
    // A second drain adds to the running total (the reducer accumulates).
    after = commit(after, [{
      id: eventId(), at: isoTimestamp(), type: 'AbilityScoreDrained', targetId: t.id, ability: 'STR', amount: 3,
    } satisfies AbilityScoreDrainedEvent]);
    expect(after.state.characters[t.id]!.abilityDrain?.STR).toBe(firstAmount + 3);
  });

  it('the target DIES when the drain reduces its Strength to 0', () => {
    // A STR-1 target: any 1d4 drain (>= 1) reduces STR to <= 0 -> CreatureDestroyed.
    const { events } = drainSwipe(target(1));
    expect(events.some((e) => e.type === 'CreatureDestroyed')).toBe(true);
  });

  it('a Long Rest restores the drained Strength', () => {
    const { engine, campaign, events, targetId } = drainSwipe(target(14));
    let after = commit(campaign, events);
    expect(after.state.characters[targetId]!.abilityDrain?.STR).toBeGreaterThan(0);
    after = commit(after, engine.plan.longRest(after.state, { participantIds: [targetId] }).events);
    expect(after.state.characters[targetId]!.abilityDrain?.STR ?? 0).toBe(0);
  });
});
