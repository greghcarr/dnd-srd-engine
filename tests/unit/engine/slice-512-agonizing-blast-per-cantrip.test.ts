// Slice 512: per-cantrip generalization for Agonizing Blast.
//
// RAW (Agonizing Blast invocation): "Choose one of your known Warlock
// cantrips that deals damage. You can add your Charisma modifier to that
// spell's damage rolls."
//
// Slices 510/511 hardcoded the chosen cantrip to Eldritch Blast (the
// canonical pick). Slice 512 closes that documented deviation by
// authoring one Feat per warlock damage cantrip
// (`agonizing-blast-{eldritch-blast,chill-touch,poison-spray}`) and
// expanding the warlock L1 invocation OfferChoice to three options.
// The player's pick at acquisition time IS the cantrip choice (no
// nested OfferChoice needed). RAW deviation closed.
//
// Design note: this content-only approach (N per-cantrip Feat variants
// + N OfferChoice options) is intentionally simple. A future
// multi-pick invocation (Pact of the Tome picks 3 cantrips) will need a
// real ChoiceResolved-cascade mechanism in `applyChoiceResolved` or a
// parameterized invocation primitive; for one-cantrip-pick invocations,
// the per-variant pattern is the minimum complexity.

import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
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

const buildWarlock = (cha: number, knownCantrip: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: cha },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: [knownCantrip],
    preparedSpells: [knownCantrip],
  });

const seedVariantPick = (characterId: string, featId: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId,
      characterId, promptKey: 'eldritch-invocations-l1', prompt: 'Pick an invocation.',
      options: [{ id: featId, label: featId, effects: [{ kind: 'GrantFeat', featId }] }],
      oneOf: 1,
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId,
      characterId, selectedOptionIds: [featId],
    },
  ];
};

describe('Agonizing Blast per-cantrip generalization (slice 512)', () => {
  it('ships three Agonizing Blast variants (one per warlock damage cantrip), each as an invocation feat', () => {
    const variants = PACK.feats.filter((f) =>
      f.category === 'invocation' && f.id.startsWith('agonizing-blast-'),
    );
    expect(variants.map((f) => f.id).sort()).toEqual([
      'agonizing-blast-chill-touch',
      'agonizing-blast-eldritch-blast',
      'agonizing-blast-poison-spray',
    ]);
    for (const v of variants) {
      const cantripId = v.id.replace('agonizing-blast-', '');
      expect(v.effects).toEqual([
        {
          kind: 'AddModifier',
          target: 'damage',
          value: { kind: 'abilityMod', ability: 'CHA' },
          condition: { kind: 'eq', path: 'event.spellId', value: cantripId },
        },
      ]);
    }
  });

  it('the warlock L1 invocation OfferChoice exposes all three variants', () => {
    const w = PACK.classes.find((c) => c.id === 'warlock')!;
    const feat = w.levelTable['1']!.features.find((f) => f.id === 'eldritch-invocations-2')!;
    const oc = feat.effects[0] as {
      kind: string;
      oneOf: number;
      options: ReadonlyArray<{ id: string; effects: ReadonlyArray<{ kind: string; featId?: string }> }>;
    };
    expect(oc.oneOf).toBe(1);
    // Slice 513 expanded the OfferChoice from 3 -> 9 options (added 6
    // sweep invocations). Check the 3 Agonizing Blast variants are
    // PRESENT (subset), not that they're the only options.
    const optionIds = oc.options.map((o) => o.id);
    expect(optionIds).toContain('agonizing-blast-chill-touch');
    expect(optionIds).toContain('agonizing-blast-eldritch-blast');
    expect(optionIds).toContain('agonizing-blast-poison-spray');
    for (const opt of oc.options.filter((o) => o.id.startsWith('agonizing-blast-'))) {
      expect(opt.effects).toEqual([{ kind: 'GrantFeat', featId: opt.id }]);
    }
  });

  it('picking the Chill Touch variant adds +CHA-mod to Chill Touch damage but NOT to Eldritch Blast', () => {
    const warlock = buildWarlock(18, 'chill-touch');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(512) });
    let campaign: Campaign = engine.createCampaign({ name: 'ab-ct' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedVariantPick(warlock.id, 'agonizing-blast-chill-touch'),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[warlock.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.modifierSum('damage', new Map([['event.spellId', 'chill-touch']]))).toBe(4);
    expect(acc.modifierSum('damage', new Map([['event.spellId', 'eldritch-blast']]))).toBe(0);
    expect(acc.modifierSum('damage', new Map([['event.spellId', 'poison-spray']]))).toBe(0);
  });

  it('picking the Poison Spray variant adds +CHA-mod to Poison Spray damage only', () => {
    const warlock = buildWarlock(16, 'poison-spray'); // CHA 16 -> +3
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(513) });
    let campaign: Campaign = engine.createCampaign({ name: 'ab-ps' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedVariantPick(warlock.id, 'agonizing-blast-poison-spray'),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[warlock.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.modifierSum('damage', new Map([['event.spellId', 'poison-spray']]))).toBe(3);
    expect(acc.modifierSum('damage', new Map([['event.spellId', 'chill-touch']]))).toBe(0);
    expect(acc.modifierSum('damage', new Map([['event.spellId', 'eldritch-blast']]))).toBe(0);
  });
});
