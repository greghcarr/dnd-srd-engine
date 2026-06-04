// Slice 533: Human Versatile origin-feat choice.
//
// RAW (SRD 5.2.1 Human): "Versatile. You gain an Origin feat of your
// choice (see 'Feats'). Skilled is recommended."
//
// Pure content slice. Reuses OfferChoice + GrantFeat (slice 511's
// indirection primitive) to expose all 6 origin feats as choices.
// The chosen feat's effects auto-project through the slice-511
// expandGrantFeatEffects pathway.
//
// Documented RAW deviation:
//   - The Resourceful trait (Heroic Inspiration on every Long Rest)
//     stays deferred to a follow-up slice (it's a separate primitive
//     for granting Heroic Inspiration at rest boundaries).
//   - Magic Initiate feat options carry their own nested OfferChoices
//     (cantrip + L1 spell picks); those cascade through the slice-517
//     ChoiceResolved pathway.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const ORIGIN_FEATS = [
  'savage-attacker',
  'alert',
  'magic-initiate-cleric',
  'magic-initiate-wizard',
  'magic-initiate-druid',
  'skilled',
] as const;

const buildHuman = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aria',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 12, WIS: 12, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const seedVersatilePick = (
  characterId: string,
  featId: string,
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId,
      characterId, promptKey: 'human-versatile', prompt: 'Pick an origin feat.',
      options: [{ id: featId, label: featId, effects: [{ kind: 'GrantFeat', featId }] }],
      oneOf: 1,
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId,
      characterId, selectedOptionIds: [featId],
    },
  ];
};

describe('Human Versatile (slice 533)', () => {
  it('human species ships a human-versatile OfferChoice exposing all 6 origin feats', () => {
    const sp = PACK.species.find((s) => s.id === 'human')!;
    const offer = sp.traits.find((t) => t.kind === 'OfferChoice' && (t as { choiceId?: string }).choiceId === 'human-versatile');
    expect(offer).toBeDefined();
    const ids = ((offer as { options: ReadonlyArray<{ id: string }> }).options).map((o) => o.id).sort();
    expect(ids).toEqual([...ORIGIN_FEATS].sort());
  });

  it('with Alert picked, the AddModifier initiative bonus from the feat projects through the effect stack (slice-511 expandGrantFeatEffects)', () => {
    const human = buildHuman();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(534) });
    let campaign: Campaign = engine.createCampaign({ name: 'alert' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
      ...seedVersatilePick(human.id, 'alert'),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[human.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    // Alert grants AddModifier initiative; verify the modifier sum is
    // positive (the feat's projected effect reaches the bearer).
    expect(acc.modifierSum('initiative')).toBeGreaterThan(0);
  });

  it('all 6 origin-feat options are wired with GrantFeat (the canonical shape)', () => {
    const sp = PACK.species.find((s) => s.id === 'human')!;
    const offer = sp.traits.find((t) => t.kind === 'OfferChoice' && (t as { choiceId?: string }).choiceId === 'human-versatile')!;
    const options = (offer as { options: ReadonlyArray<{ id: string; effects: ReadonlyArray<{ kind: string; featId?: string }> }> }).options;
    for (const opt of options) {
      expect(opt.effects).toHaveLength(1);
      expect(opt.effects[0]!.kind).toBe('GrantFeat');
      expect(opt.effects[0]!.featId).toBe(opt.id);
    }
  });
});
