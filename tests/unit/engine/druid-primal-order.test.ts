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

// Slice 215: Druid L1 Primal Order. RAW choice between Magician
// (extra druid cantrip + WIS-mod bonus on INT (Arcana / Nature)
// checks) and Warden (martial weapons + medium armor). Mirrors
// slice 214's Cleric Divine Order shape. The pack hardcodes
// Druidcraft as the Magician cantrip.

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildDruid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Thornroot',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 9, max: 9, temp: 0 },
    featsTaken: [],
  });

const seedChoice = (
  characterId: string,
  selected: 'magician' | 'warden',
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId,
      characterId,
      promptKey: 'primal-order',
      prompt: 'Pick Magician or Warden.',
      options: [
        {
          id: 'magician',
          label: 'Magician',
          effects: [
            { kind: 'GrantSpell', spellId: 'druidcraft', preparation: 'always-prepared' },
            {
              kind: 'AddModifier',
              target: { kind: 'skill', skill: 'arcana' },
              value: { kind: 'max', terms: [{ kind: 'const', value: 1 }, { kind: 'abilityMod', ability: 'WIS' }] },
            },
            {
              kind: 'AddModifier',
              target: { kind: 'skill', skill: 'nature' },
              value: { kind: 'max', terms: [{ kind: 'const', value: 1 }, { kind: 'abilityMod', ability: 'WIS' }] },
            },
          ],
        },
        {
          id: 'warden',
          label: 'Warden',
          effects: [
            { kind: 'GrantProficiency', target: 'weapon', id: 'martial', level: 'proficient' },
            { kind: 'GrantProficiency', target: 'armor', id: 'medium', level: 'proficient' },
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

describe('Druid L1 Primal Order (slice 215)', () => {
  it('Warden grants martial weapon + medium armor proficiency', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(215) });
    const druid = buildDruid();
    let campaign: Campaign = engine.createCampaign({ name: 'warden' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
      ...seedChoice(druid.id, 'warden'),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[druid.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.proficiencyLevel('weapon', 'martial')).toBe('proficient');
    expect(acc.proficiencyLevel('armor', 'medium')).toBe('proficient');
    expect(acc.grantedSpells()).toHaveLength(0);
  });

  it('Magician grants Druidcraft + WIS-mod bonus on Arcana / Nature', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(215) });
    const druid = buildDruid();
    let campaign: Campaign = engine.createCampaign({ name: 'magician' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
      ...seedChoice(druid.id, 'magician'),
    ]);
    const stored = campaign.state.characters[druid.id]!;
    const acc = buildEffectStack({
      character: stored,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.grantedSpells().some((g) => g.spellId === 'druidcraft')).toBe(true);
    expect(acc.proficiencyLevel('weapon', 'martial')).not.toBe('proficient');

    // INT 10 = 0 mod, WIS 16 = +3 bonus. The sage background grants
    // Arcana proficiency (+2 PB at L1), so Arcana = 0 + 3 + 2 = 5;
    // Nature is not a sage skill, so Nature = 0 + 3 = 3.
    const arcana = computeAbilityCheck({
      character: stored,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'INT',
      skill: 'arcana',
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(arcana.total).toBe(5);
    const nature = computeAbilityCheck({
      character: stored,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'INT',
      skill: 'nature',
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(nature.total).toBe(3);
  });
});
