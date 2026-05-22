import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

// Slice 214: Cleric L1 Divine Order. RAW (SRD 5.2.1): choose
// Protector (martial weapons + heavy armor) or Thaumaturge (extra
// cleric cantrip + WIS-mod bonus to INT (Arcana / Religion) checks).
//
// The Thaumaturge variant ships with `guidance` hardcoded as the
// "extra cantrip" pick — RAW lets the player choose any cleric
// cantrip, but the pack picks the most flavor-appropriate one to
// avoid a nested OfferChoice. Future content can swap.

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Solace',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 12 },
    hp: { current: 9, max: 9, temp: 0 },
    featsTaken: [],
  });

const seedChoice = (
  characterId: string,
  selected: 'protector' | 'thaumaturge',
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId,
      characterId,
      promptKey: 'divine-order',
      prompt: 'Pick Protector or Thaumaturge.',
      options: [
        {
          id: 'protector',
          label: 'Protector',
          effects: [
            { kind: 'GrantProficiency', target: 'weapon', id: 'martial', level: 'proficient' },
            { kind: 'GrantProficiency', target: 'armor', id: 'heavy', level: 'proficient' },
          ],
        },
        {
          id: 'thaumaturge',
          label: 'Thaumaturge',
          effects: [
            { kind: 'GrantSpell', spellId: 'guidance', preparation: 'always-prepared' },
            {
              kind: 'AddModifier',
              target: { kind: 'skill', skill: 'arcana' },
              value: {
                kind: 'max',
                terms: [
                  { kind: 'const', value: 1 },
                  { kind: 'abilityMod', ability: 'WIS' },
                ],
              },
            },
            {
              kind: 'AddModifier',
              target: { kind: 'skill', skill: 'religion' },
              value: {
                kind: 'max',
                terms: [
                  { kind: 'const', value: 1 },
                  { kind: 'abilityMod', ability: 'WIS' },
                ],
              },
            },
          ],
        },
      ],
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

describe('Cleric L1 Divine Order (slice 214)', () => {
  it('Protector grants martial weapon + heavy armor proficiency', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(214) });
    const cleric = buildCleric();
    let campaign: Campaign = engine.createCampaign({ name: 'protector' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      ...seedChoice(cleric.id, 'protector'),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[cleric.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.proficiencyLevel('weapon', 'martial')).toBe('proficient');
    expect(acc.proficiencyLevel('armor', 'heavy')).toBe('proficient');
    expect(acc.grantedSpells()).toHaveLength(0);
  });

  it('Thaumaturge grants Guidance + WIS-mod bonus on Arcana / Religion', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(214) });
    const cleric = buildCleric();
    let campaign: Campaign = engine.createCampaign({ name: 'thaumaturge' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      ...seedChoice(cleric.id, 'thaumaturge'),
    ]);
    const stored = campaign.state.characters[cleric.id]!;
    const acc = buildEffectStack({
      character: stored,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.grantedSpells().some((g) => g.spellId === 'guidance')).toBe(true);
    expect(acc.proficiencyLevel('weapon', 'martial')).not.toBe('proficient');

    // INT 10 = 0 mod, +3 from WIS-mod bonus (WIS 16 = +3). The acolyte
    // background grants Religion proficiency (+2 PB at L1) but not
    // Arcana, so Arcana = 0 + 3 = 3 and Religion = 0 + 3 + 2 = 5.
    const arcana = computeAbilityCheck({
      character: stored,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'INT',
      skill: 'arcana',
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(arcana.total).toBe(3);
    const religion = computeAbilityCheck({
      character: stored,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'INT',
      skill: 'religion',
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(religion.total).toBe(5);
  });
});
