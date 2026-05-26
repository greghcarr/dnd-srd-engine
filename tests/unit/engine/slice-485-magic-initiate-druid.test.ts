// Slice 485: Magic Initiate (Druid) - the third Magic Initiate variant.
//
// RAW (SRD 5.2.1 Magic Initiate) - same shape as the Cleric / Wizard
// variants (slice 469), with the Druid spell list instead. The Druid
// list as it ships in the starter pack: 11 cantrips + 18 level-1 spells.
//
// Pure content slice: the engine already supports the OfferChoice +
// GrantSpell + always-prepared / oncePerLongRest plumbing via slice
// 469. spellcastingAbility defaults to WIS (the canonical Druid
// ability); the player choice across INT/WIS/CHA is deferred (same
// follow-up tracked on the Cleric/Wizard variants).
//
// Closes the slice-469 open follow-up "Magic Initiate (Druid)".

import { describe, expect, it } from 'vitest';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
} from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildPC = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Druidic PC',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 14, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
    featsTaken: ['magic-initiate-druid'],
  });

const seedChoice = (
  characterId: string,
  choiceId: string,
  prompt: string,
  options: ReadonlyArray<{ id: string; label: string; effects: ReadonlyArray<unknown> }>,
  selected: ReadonlyArray<string>,
  oneOf: number,
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const cid = newChoiceId();
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId: cid,
      characterId,
      promptKey: choiceId,
      prompt,
      options: options as never,
      oneOf,
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceResolved',
      choiceId: cid,
      characterId,
      selectedOptionIds: [...selected],
    },
  ];
};

const featOfferChoice = (featId: string, choiceId: string) => {
  const feat = PACK.feats.find((f) => f.id === featId)!;
  const oc = feat.effects.find(
    (e) => e.kind === 'OfferChoice' && (e as { choiceId?: string }).choiceId === choiceId,
  );
  if (!oc || oc.kind !== 'OfferChoice') throw new Error(`OfferChoice ${choiceId} not on ${featId}`);
  return oc;
};

describe('Magic Initiate (Druid) (slice 485)', () => {
  it('the feat ships two OfferChoice effects (cantrips oneOf:2, L1 oneOf:1)', () => {
    const feat = PACK.feats.find((f) => f.id === 'magic-initiate-druid');
    expect(feat).toBeDefined();
    const offers = feat!.effects.filter((e) => e.kind === 'OfferChoice');
    expect(offers).toHaveLength(2);
    const cantrips = featOfferChoice('magic-initiate-druid', 'magic-initiate-druid-cantrips');
    const l1 = featOfferChoice('magic-initiate-druid', 'magic-initiate-druid-l1');
    expect(cantrips.oneOf).toBe(2);
    expect(l1.oneOf).toBe(1);
  });

  it('every cantrip option grants a real druid cantrip with always-prepared + WIS', () => {
    const cantrips = featOfferChoice('magic-initiate-druid', 'magic-initiate-druid-cantrips');
    for (const opt of cantrips.options) {
      expect(opt.effects).toHaveLength(1);
      const eff = opt.effects[0] as { kind: string; spellId: string; preparation: string; spellcastingAbility: string };
      expect(eff.kind).toBe('GrantSpell');
      expect(eff.preparation).toBe('always-prepared');
      expect(eff.spellcastingAbility).toBe('WIS');
      const spell = PACK.spells.find((s) => s.id === eff.spellId);
      expect(spell?.level).toBe(0);
      expect(spell?.classes).toContain('druid');
    }
  });

  it('every L1 option grants a real druid L1 spell with oncePerLongRest + WIS', () => {
    const l1 = featOfferChoice('magic-initiate-druid', 'magic-initiate-druid-l1');
    for (const opt of l1.options) {
      expect(opt.effects).toHaveLength(1);
      const eff = opt.effects[0] as { kind: string; spellId: string; preparation: string; spellcastingAbility: string };
      expect(eff.kind).toBe('GrantSpell');
      expect(eff.preparation).toBe('oncePerLongRest');
      expect(eff.spellcastingAbility).toBe('WIS');
      const spell = PACK.spells.find((s) => s.id === eff.spellId);
      expect(spell?.level).toBe(1);
      expect(spell?.classes).toContain('druid');
    }
  });

  it('a PC who picks Druidcraft + Guidance + Goodberry has the three spells granted', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const pc = buildPC();
    const cantrips = featOfferChoice('magic-initiate-druid', 'magic-initiate-druid-cantrips');
    const l1 = featOfferChoice('magic-initiate-druid', 'magic-initiate-druid-l1');
    let campaign: Campaign = engine.createCampaign({ name: 'magic-initiate-druid' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
      ...seedChoice(pc.id, 'magic-initiate-druid-cantrips', cantrips.prompt, cantrips.options, ['druidcraft', 'guidance'], 2),
      ...seedChoice(pc.id, 'magic-initiate-druid-l1', l1.prompt, l1.options, ['goodberry'], 1),
    ]);
    const stored = campaign.state.characters[pc.id]!;
    const acc = buildEffectStack({
      character: stored,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells();
    const grantedIds = granted.map((g) => g.spellId).sort();
    expect(grantedIds).toEqual(['druidcraft', 'goodberry', 'guidance']);
    expect(granted.find((g) => g.spellId === 'druidcraft')?.preparation).toBe('always-prepared');
    expect(granted.find((g) => g.spellId === 'guidance')?.preparation).toBe('always-prepared');
    expect(granted.find((g) => g.spellId === 'goodberry')?.preparation).toBe('oncePerLongRest');
    for (const g of granted) expect(g.spellcastingAbility).toBe('WIS');
  });
});
