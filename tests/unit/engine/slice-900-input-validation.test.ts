// Slice 900 — `input-validation-silent-trust`.
//
// The planners throw on most illegal single-target input, but the consumer-
// supplied combat ENUMS (advantage / cover / lightLevel on an AttackIntent,
// the per-target cover map on a CastSpellIntent) were trusted blindly: a typo
// or a deserialized-from-JSON garbage value slipped past the type system and
// silently degraded — e.g. `advantage: 'adv'` reads as neither advantage nor
// disadvantage, so the engine rolls straight (a silent wrong result). The
// planners now validate each enum's well-formedness up front and throw,
// matching the visible-failure contract the single-target gates already give.
//
// (The position-dependent "trusts" the audit row also names — AoE membership
// from explicit targetIds, positionless range — stay consumer-owned by design:
// the engine can't validate them without owning positions. Those are their own
// rows + the opt-in `aim` membership seam.)

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

type Engine = ReturnType<typeof createEngine>;
type AttackIntentArg = Parameters<Engine['plan']['attack']>[1];
type CastIntentArg = Parameters<Engine['plan']['castSpell']>[1];

const buildFighter = (mainHandId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Striker',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    inventory: [mainHandId],
    equipped: { mainHand: mainHandId, attuned: [] },
  });

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 35, max: 35, temp: 0 },
    preparedSpells: ['cause-fear'],
  });

const buildVictim = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Victim',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
  });

const meleeScene = () => {
  const sword = makeItemInstance('longsword');
  const fighter = buildFighter(sword.id);
  const victim = buildVictim();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'input-validation' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, fighter, victim, sword };
};

const castScene = () => {
  const caster = buildCaster();
  const victim = buildVictim();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'input-validation-cast' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, caster, victim };
};

describe('slice 900: planners validate consumer-supplied combat enums', () => {
  it('a valid attack with well-formed enums does not throw', () => {
    const { engine, campaign, fighter, victim, sword } = meleeScene();
    expect(() =>
      engine.plan.attack(campaign.state, {
        attackerId: fighter.id, targetId: victim.id, weaponInstanceId: sword.id,
        advantage: 'advantage', cover: 'half', lightLevel: 'dim',
      }),
    ).not.toThrow();
  });

  it('rejects a malformed `advantage` enum', () => {
    const { engine, campaign, fighter, victim, sword } = meleeScene();
    const intent = {
      attackerId: fighter.id, targetId: victim.id, weaponInstanceId: sword.id, advantage: 'adv',
    } as unknown as AttackIntentArg;
    expect(() => engine.plan.attack(campaign.state, intent)).toThrow(/Invalid advantage "adv"/);
  });

  it('rejects a malformed `cover` enum', () => {
    const { engine, campaign, fighter, victim, sword } = meleeScene();
    const intent = {
      attackerId: fighter.id, targetId: victim.id, weaponInstanceId: sword.id, cover: 'partial',
    } as unknown as AttackIntentArg;
    expect(() => engine.plan.attack(campaign.state, intent)).toThrow(/Invalid cover "partial"/);
  });

  it('rejects a malformed `lightLevel` enum', () => {
    const { engine, campaign, fighter, victim, sword } = meleeScene();
    const intent = {
      attackerId: fighter.id, targetId: victim.id, weaponInstanceId: sword.id, lightLevel: 'gloomy',
    } as unknown as AttackIntentArg;
    expect(() => engine.plan.attack(campaign.state, intent)).toThrow(/Invalid lightLevel "gloomy"/);
  });

  it('rejects a malformed per-target cover value on a CastSpellIntent', () => {
    const { engine, campaign, caster, victim } = castScene();
    const intent = {
      characterId: caster.id, spellId: 'cause-fear', slotLevel: 1, targetIds: [victim.id],
      coverByTargetId: { [victim.id]: 'mostly' },
    } as unknown as CastIntentArg;
    expect(() => engine.plan.castSpell(campaign.state, intent)).toThrow(/Invalid cover.*"mostly"/);
  });

  it('a well-formed per-target cover value on a cast does not trip the validation', () => {
    const { engine, campaign, caster, victim } = castScene();
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: caster.id, spellId: 'cause-fear', slotLevel: 1, targetIds: [victim.id],
        coverByTargetId: { [victim.id]: 'half' },
      }),
    ).not.toThrow(/Invalid cover/);
  });
});
