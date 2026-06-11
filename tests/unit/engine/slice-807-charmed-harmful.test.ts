// Slice 807: Charmed's "Can't Harm the Charmer" + "Social Advantage" arms
// (Area 4 divergence `charmed-harmful-target-arm`). RAW (rules-glossary
// "Charmed"): "You can't attack the charmer or target the charmer with
// damaging abilities or magical effects." and "The charmer has Advantage
// on any ability check to interact with you socially." The engine already
// blocked WEAPON attacks on the charmer (attack.ts) but not harmful
// spells, and the social-advantage arm was unmodeled.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildWizard = (name: string, charmedBy?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 10, CHA: 16 },
    hp: { current: 27, max: 27, temp: 0 },
    knownSpells: ['fire-bolt', 'mage-armor'], preparedSpells: ['fire-bolt', 'mage-armor'],
    ...(charmedBy !== undefined
      ? { appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'charmed', sourceCharacterId: charmedBy }] }
      : {}),
  });

describe('Charmed — Can\'t Harm the Charmer (spells) + Social Advantage (slice 807)', () => {
  it('a Charmed caster cannot target the charmer with a harmful (attack) spell', () => {
    const charmer = buildWizard('Charmer');
    const victim = buildWizard('Victim', charmer.id); // charmed by Charmer
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(807) });
    let campaign: Campaign = engine.createCampaign({ name: 'charmed' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: charmer } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    expect(() => engine.plan.castSpell(campaign.state, {
      characterId: victim.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [charmer.id], ignorePreparation: true,
    })).toThrow(/Charmed by .* and cannot target them/i);
  });

  it('the same caster CAN target a non-charmer with the harmful spell, and CAN buff the charmer', () => {
    const charmer = buildWizard('Charmer');
    const victim = buildWizard('Victim', charmer.id);
    const bystander = buildWizard('Bystander');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(808) });
    let campaign: Campaign = engine.createCampaign({ name: 'charmed-ok' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: charmer } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bystander } satisfies CharacterCreatedEvent,
    ]);
    // Harmful spell at a non-charmer → not blocked by the charm.
    expect(() => engine.plan.castSpell(campaign.state, {
      characterId: victim.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [bystander.id], ignorePreparation: true,
    })).not.toThrow(/Charmed/i);
    // A beneficial spell (Mage Armor: no attack/save) AT the charmer → allowed.
    expect(() => engine.plan.castSpell(campaign.state, {
      characterId: victim.id, spellId: 'mage-armor', slotLevel: 1, targetIds: [charmer.id], ignorePreparation: true,
    })).not.toThrow(/Charmed/i);
  });

  it('the charmer has Advantage on a social check directed at the charmed creature', () => {
    const charmer = buildWizard('Charmer');
    const victim = buildWizard('Victim', charmer.id);
    const characters = { [charmer.id]: charmer, [victim.id]: victim };
    const persuade = computeAbilityCheck({
      character: charmer, itemInstances: {}, content: CONTENT, ability: 'CHA', skill: 'persuasion',
      characters, socialCheckTargetId: victim.id,
    });
    expect(persuade.hasAdvantage).toBe(true);
    // No advantage without the designated target, against a non-charmed
    // target, or on a non-social skill.
    expect(computeAbilityCheck({ character: charmer, itemInstances: {}, content: CONTENT, ability: 'CHA', skill: 'persuasion', characters }).hasAdvantage).toBe(false);
    const stranger = buildWizard('Stranger');
    expect(computeAbilityCheck({ character: charmer, itemInstances: {}, content: CONTENT, ability: 'CHA', skill: 'persuasion', characters: { [stranger.id]: stranger }, socialCheckTargetId: stranger.id }).hasAdvantage).toBe(false);
    expect(computeAbilityCheck({ character: charmer, itemInstances: {}, content: CONTENT, ability: 'STR', skill: 'athletics', characters, socialCheckTargetId: victim.id }).hasAdvantage).toBe(false);
  });
});
