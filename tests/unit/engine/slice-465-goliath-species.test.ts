// Slice 465: Goliath species traits + new ability-check
// `endingCondition` consumer-coordinated fact.
//
// RAW (SRD 5.2.1 Goliath):
// - Powerful Build: "Advantage on any ability check you make to end
//   the Grappled condition. You also count as one size larger when
//   determining your carrying capacity."
// - Giant Ancestry: "Choose one of the following benefits ...; you
//   can use the chosen benefit a number of times equal to your
//   Proficiency Bonus, and you regain all expended uses when you
//   finish a Long Rest." Six options: Cloud's Jaunt, Fire's Burn,
//   Frost's Chill, Hill's Tumble, Stone's Endurance, Storm's Thunder.
// - Large Form (level 5+): deferred — needs a transformation
//   primitive the engine doesn't carry today.
//
// This slice wires:
// 1. New `endingCondition?: string` fact on ComputeAbilityCheckInput
//    + AbilityCheckIntent (mirror of slice-291 savePreventsCondition).
// 2. Goliath species:
//    - Powerful Build grapple-escape Advantage (SetAdvantage on:'check'
//      gated on event.endingCondition='grappled' — works for Athletics
//      OR Acrobatics OR any other escape ability).
//    - Powerful Build carrying-capacity arm: Custom marker (deferred).
//    - Large Form: Custom marker (deferred).
//    - Giant Ancestry: OfferChoice over 6 options + top-level
//      GrantResource giant-ancestry PB/long-rest. Each option ships as
//      a Custom-handler marker; the six mechanics each become future
//      slices.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
} from '../../../src/schemas/events/level-up.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildGoliath = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Krev',
    speciesId: 'goliath',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 14, max: 14, temp: 0 },
    featsTaken: [],
  });

const seedGiantAncestry = (
  characterId: string,
  selected: string,
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  const options = [
    { id: 'clouds-jaunt', label: "Cloud's Jaunt (Cloud Giant)", effects: [{ kind: 'Custom' as const, handlerId: 'goliath-clouds-jaunt' }] },
    { id: 'fires-burn', label: "Fire's Burn (Fire Giant)", effects: [{ kind: 'Custom' as const, handlerId: 'goliath-fires-burn' }] },
    { id: 'frosts-chill', label: "Frost's Chill (Frost Giant)", effects: [{ kind: 'Custom' as const, handlerId: 'goliath-frosts-chill' }] },
    { id: 'hills-tumble', label: "Hill's Tumble (Hill Giant)", effects: [{ kind: 'Custom' as const, handlerId: 'goliath-hills-tumble' }] },
    { id: 'stones-endurance', label: "Stone's Endurance (Stone Giant)", effects: [{ kind: 'Custom' as const, handlerId: 'goliath-stones-endurance' }] },
    { id: 'storms-thunder', label: "Storm's Thunder (Storm Giant)", effects: [{ kind: 'Custom' as const, handlerId: 'goliath-storms-thunder' }] },
  ];
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId,
      characterId,
      promptKey: 'goliath-giant-ancestry',
      prompt: 'Choose a Giant Ancestry.',
      options,
      oneOf: 1,
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceResolved',
      choiceId,
      characterId,
      selectedOptionIds: [selected],
    },
  ];
};

describe('Goliath species (slice 465)', () => {
  it('basics: Medium size, 35 ft walk speed, Humanoid', () => {
    const goliath = PACK.species.find((s) => s.id === 'goliath')!;
    expect(goliath.size).toBe('Medium');
    expect(goliath.speed.walk).toBe(35);
    expect(goliath.creatureType).toBe('Humanoid');
    expect(goliath.languages).toEqual(['common', 'giant']);
  });

  it('Powerful Build: ability check with endingCondition=grappled rolls with Advantage', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const goliath = buildGoliath();
    let campaign: Campaign = engine.createCampaign({ name: 'goliath-grapple-escape' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: goliath } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.abilityCheck(campaign.state, {
      characterId: goliath.id,
      ability: 'STR',
      skill: 'athletics',
      endingCondition: 'grappled',
    }).events;
    const rolled = events.find((e) => e.type === 'AbilityCheckRolled')!;
    expect(rolled.used).toBe('advantage');
  });

  it('Powerful Build: a generic ability check (no endingCondition) does NOT get Advantage', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const goliath = buildGoliath();
    let campaign: Campaign = engine.createCampaign({ name: 'goliath-generic-check' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: goliath } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.abilityCheck(campaign.state, {
      characterId: goliath.id,
      ability: 'STR',
      skill: 'athletics',
    }).events;
    const rolled = events.find((e) => e.type === 'AbilityCheckRolled')!;
    expect(rolled.used).toBe('none');
  });

  it('Powerful Build: works at the derive layer via computeAbilityCheck too', () => {
    const goliath = buildGoliath();
    const withGate = computeAbilityCheck({
      character: goliath,
      itemInstances: {},
      content: CONTENT,
      ability: 'STR',
      skill: 'athletics',
      endingCondition: 'grappled',
    });
    const without = computeAbilityCheck({
      character: goliath,
      itemInstances: {},
      content: CONTENT,
      ability: 'STR',
      skill: 'athletics',
    });
    expect(withGate.hasAdvantage).toBe(true);
    expect(without.hasAdvantage).toBe(false);
  });

  it('Powerful Build: the gate is condition-keyed, not skill-keyed (Acrobatics-escape also gets Advantage)', () => {
    const goliath = buildGoliath();
    // RAW: "any ability check you make to end the Grappled condition" -
    // the escape can be Athletics OR Acrobatics. Both must trigger.
    const acrobatics = computeAbilityCheck({
      character: goliath,
      itemInstances: {},
      content: CONTENT,
      ability: 'DEX',
      skill: 'acrobatics',
      endingCondition: 'grappled',
    });
    expect(acrobatics.hasAdvantage).toBe(true);
  });

  it('Powerful Build: a check ending a different condition does NOT get Advantage', () => {
    const goliath = buildGoliath();
    const ending = computeAbilityCheck({
      character: goliath,
      itemInstances: {},
      content: CONTENT,
      ability: 'STR',
      skill: 'athletics',
      endingCondition: 'restrained',
    });
    expect(ending.hasAdvantage).toBe(false);
  });

  it('Giant Ancestry: species declares GrantResource giant-ancestry PB-uses / long rest', () => {
    const goliath = PACK.species.find((s) => s.id === 'goliath')!;
    const grant = goliath.traits.find(
      (t) => t.kind === 'GrantResource' && t.resourceId === 'giant-ancestry',
    );
    expect(grant).toBeDefined();
    expect(grant && grant.kind === 'GrantResource' ? grant.recharge : undefined).toBe('longRest');
    expect(grant && grant.kind === 'GrantResource' ? grant.max : undefined).toEqual({ kind: 'profBonus' });
  });

  it('Giant Ancestry: species declares an OfferChoice over the 6 RAW ancestries', () => {
    const goliath = PACK.species.find((s) => s.id === 'goliath')!;
    const choice = goliath.traits.find(
      (t) => t.kind === 'OfferChoice' && t.choiceId === 'goliath-giant-ancestry',
    );
    expect(choice).toBeDefined();
    const optionIds = choice && choice.kind === 'OfferChoice'
      ? choice.options.map((o) => o.id).sort()
      : [];
    expect(optionIds).toEqual(
      ['clouds-jaunt', 'fires-burn', 'frosts-chill', 'hills-tumble', 'stones-endurance', 'storms-thunder'].sort(),
    );
  });

  it("Giant Ancestry: choice can resolve to Stone's Endurance (or any of the 6 ancestries)", () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const goliath = buildGoliath();
    let campaign: Campaign = engine.createCampaign({ name: 'goliath-stones-endurance' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: goliath } satisfies CharacterCreatedEvent,
      ...seedGiantAncestry(goliath.id, 'stones-endurance'),
    ]);
    // No exception means the choice resolved successfully. The chosen
    // mechanic's actual implementation (reaction damage reduction) is
    // a deferred follow-up; for this slice we assert the choice path
    // works end-to-end.
    const resolved = campaign.events.find((e) => e.type === 'ChoiceResolved');
    expect(resolved).toBeDefined();
  });
});
