// Slice 506: Cleric L1 Divine Order. Closes the slice-504 follow-up
// (the audit found Divine Order was already wired as an OfferChoice but
// untested for projection).
//
// RAW (Cleric L1 Divine Order): choose Protector or Thaumaturge.
//   - Protector: martial weapon + heavy armor proficiency.
//   - Thaumaturge: extra cantrip (engine pack: Guidance, always-prepared)
//     + max(1, WIS-mod) bonus on Arcana / Religion checks.
//
// Mirrors the Druid L1 Primal Order test (slice 215) verbatim — same
// OfferChoice + ChoiceRequired + ChoiceResolved seeding shape.

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

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aurel',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'cleric', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
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
              value: { kind: 'max', terms: [{ kind: 'const', value: 1 }, { kind: 'abilityMod', ability: 'WIS' }] },
            },
            {
              kind: 'AddModifier',
              target: { kind: 'skill', skill: 'religion' },
              value: { kind: 'max', terms: [{ kind: 'const', value: 1 }, { kind: 'abilityMod', ability: 'WIS' }] },
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

describe('Cleric L1 Divine Order (slice 506)', () => {
  it('Protector grants martial weapon + heavy armor proficiency (no Thaumaturge perks)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(506) });
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
    expect(acc.grantedSpells().some((g) => g.spellId === 'guidance')).toBe(false);
  });

  it('Thaumaturge grants Guidance (always-prepared) + WIS-mod bonus on Arcana / Religion (no martial / heavy-armor perks)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(506) });
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
    expect(acc.proficiencyLevel('armor', 'heavy')).not.toBe('proficient');

    // INT 10 = 0 mod, WIS 16 = +3 bonus, PB +2 at L1.
    // Sage background grants Arcana proficiency: Arcana (INT) = 0 + 3 + 2 = 5.
    // Religion is not a sage skill: Religion (WIS) = 3 + 3 = 6.
    const arcana = computeAbilityCheck({
      character: stored,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'INT',
      skill: 'arcana',
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(arcana.total).toBe(5);
    const religion = computeAbilityCheck({
      character: stored,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'WIS',
      skill: 'religion',
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(religion.total).toBe(6);
  });
});
