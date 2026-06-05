// Slice 661: land-swap supersession via OfferChoice
// `lifecycle: 'supersede'`.
//
// RAW (SRD 5.2.1 Druid Circle of the Land L3): "Whenever you finish
// a Long Rest, choose one type of land ... you always have the spells
// listed for your Druid level and lower prepared." The intent is
// per-long-rest selection: picking a new land at the next long rest
// REPLACES the prior land's prepared spells, not adds to them.
//
// Pre-slice-661 behavior accumulated both lands' spell grants
// (`collectResolvedChoiceEffects` walked every resolved PendingChoice
// indiscriminately). This audit pins the post-661 RAW behavior:
//   1. After two long-rest resolutions of the Circle Spells choice
//      (arid then polar), the effective spell list contains ONLY
//      the polar spells (arid's grants are dropped).
//   2. Pre-existing 'accumulate' lifecycle (default for the slice-618
//      onAcquire choices like Fighter Fighting Style) is unaffected.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';
import { collectEffectsFromCharacter } from '../../../src/derive/effect-stack.js';

const PACK = loadStarterPack();

const buildL3LandDruid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wren',
    speciesId: 'elf',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 3, hitDiceRemaining: 3, subclassId: 'circle-of-the-land' }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 16, CHA: 10 },
    hp: { current: 22, max: 22, temp: 0 },
  });

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'land-swap' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

// Convenience: drive one long-rest land pick. Emits ChoiceRequired,
// commits, resolves with selectedOptionId, commits, returns the
// updated campaign.
const pickLand = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  characterId: string,
  selectedOptionId: string,
): Campaign => {
  const offer = engine.plan.offerLongRestChoices(campaign.state, { characterId });
  let next = commit(campaign, offer.events);
  const choice = offer.events.find(
    (e): e is ChoiceRequiredEvent =>
      e.type === 'ChoiceRequired' && e.promptKey === 'circle-of-the-land-type',
  )!;
  const resolveOut = engine.plan.resolveChoice(next.state, {
    choiceId: choice.choiceId,
    characterId,
    selectedOptionIds: [selectedOptionId],
  });
  next = commit(next, resolveOut.events);
  return next;
};

// Pull the GrantSpell spellIds out of the effective effect stack
// for the character. Used to assert which land's spells are in
// effect.
const grantedSpellIds = (
  campaign: Campaign,
  engine: ReturnType<typeof createEngine>,
  character: Character,
): string[] => {
  const effects = collectEffectsFromCharacter({
    character: campaign.state.characters[character.id]!,
    content: engine.content,
    itemInstances: campaign.state.itemInstances,
    pendingChoices: campaign.state.pendingChoices,
  });
  return effects
    .filter((e): e is { kind: 'GrantSpell'; spellId: string } & typeof e =>
      e.kind === 'GrantSpell',
    )
    .map((e) => e.spellId)
    .sort();
};

describe('slice 661: land-swap supersession (OfferChoice lifecycle: supersede)', () => {
  it('after picking arid then polar, only polar spells are in the effect stack', () => {
    const druid = buildL3LandDruid();
    const s = seed(druid);

    let campaign = pickLand(s.engine, s.campaign, druid.id, 'arid');
    const aridGrants = grantedSpellIds(campaign, s.engine, druid);
    expect(aridGrants).toContain('fire-bolt');

    campaign = pickLand(s.engine, campaign, druid.id, 'polar');
    const polarGrants = grantedSpellIds(campaign, s.engine, druid);
    // Polar (RAW): hold-person, ray-of-frost, sleep. Arid spells
    // (fire-bolt, burning-hands, blur) must NOT be present.
    expect(polarGrants).not.toContain('fire-bolt');
    expect(polarGrants).not.toContain('burning-hands');
    expect(polarGrants).not.toContain('blur');
  });

  it('three resolutions (arid -> polar -> tropical): only tropical spells remain', () => {
    const druid = buildL3LandDruid();
    const s = seed(druid);
    let campaign = pickLand(s.engine, s.campaign, druid.id, 'arid');
    campaign = pickLand(s.engine, campaign, druid.id, 'polar');
    campaign = pickLand(s.engine, campaign, druid.id, 'tropical');
    const finalGrants = grantedSpellIds(campaign, s.engine, druid);
    // No arid (fire-bolt/burning-hands/blur) or polar (hold-person)
    // grants should leak through.
    expect(finalGrants).not.toContain('fire-bolt');
    expect(finalGrants).not.toContain('burning-hands');
    expect(finalGrants).not.toContain('blur');
    expect(finalGrants).not.toContain('hold-person');
  });

  it('all prior resolutions still exist in state.pendingChoices (replay-honest; only derive drops them)', () => {
    const druid = buildL3LandDruid();
    const s = seed(druid);
    let campaign = pickLand(s.engine, s.campaign, druid.id, 'arid');
    campaign = pickLand(s.engine, campaign, druid.id, 'polar');
    const landTypeChoices = Object.values(campaign.state.pendingChoices).filter(
      (pc) => pc.promptKey === 'circle-of-the-land-type' && pc.forCharacterId === druid.id,
    );
    // Both PendingChoices stay in state; supersession is a derive-
    // layer concern, not a state mutation.
    expect(landTypeChoices.length).toBe(2);
    expect(landTypeChoices.every((pc) => pc.resolution !== undefined)).toBe(true);
    // Both ship the persisted supersede lifecycle.
    expect(landTypeChoices.every((pc) => pc.lifecycle === 'supersede')).toBe(true);
  });

  it('default lifecycle (accumulate) is unchanged for onAcquire choices like Fighter Fighting Style', () => {
    // A fresh L1 Fighter has Fighting Style as an onAcquire choice
    // with no lifecycle field. After resolving it, the effect stack
    // contains the picked style's effects. Re-invoking
    // offerCharacterChoices doesn't re-emit (slice-618 dedupe
    // honors prior resolution), but the effect stack still carries
    // the resolution. That's accumulate-by-default.
    const fighter = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'L1 Fighter',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'fs-accumulate' });
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: fighter,
      } satisfies CharacterCreatedEvent,
    ]);
    const offer = engine.plan.offerCharacterChoices(campaign.state, { characterId: fighter.id });
    const fsChoice = offer.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'fighting-style-fighter',
    )!;
    // The fighter's onAcquire choice has no lifecycle field — the
    // emitted event must also omit it (preserving accumulate
    // semantics).
    expect(fsChoice.lifecycle).toBeUndefined();
  });
});
