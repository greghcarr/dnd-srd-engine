// Slice 514: Warlock invocation content sweep, batch 2.
//
// Two more L1-eligible invocations, content-only (no engine work):
//   - Ascendant Step    -> GrantSpell levitate at-will
//   - Gift of the Depths -> ModifySpeed swim matchWalkSpeed
//                           + GrantSpell water-breathing oncePerLongRest
//
// Documented RAW deviations:
//   - Gift of the Depths "breathe underwater" arm: consumer-managed.
//     The engine doesn't model breathing / drowning; the swim speed +
//     once-per-rest Water Breathing cover the mechanically-load-bearing
//     parts. A long-rest re-pick gives the breathing arm too.

import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { getEffectiveSpeedForMode } from '../../../src/derive/speed.js';
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

const buildWarlock = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: [],
    preparedSpells: [],
  });

const seedInvocationPick = (characterId: string, featId: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
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

describe('Warlock invocations content sweep batch 2 (slice 514)', () => {
  it('ships the slice-514 batch 2 invocations alongside earlier wires', () => {
    const ids = PACK.feats.filter((f) => f.category === 'invocation').map((f) => f.id);
    for (const id of ['ascendant-step', 'gift-of-the-depths']) {
      expect(ids).toContain(id);
    }
  });

  it('the warlock L1 OfferChoice exposes the slice-514 batch options', () => {
    const w = PACK.classes.find((c) => c.id === 'warlock')!;
    const feat = w.levelTable['1']!.features.find((f) => f.id === 'eldritch-invocations-2')!;
    const oc = feat.effects[0] as { options: ReadonlyArray<{ id: string }> };
    const ids = oc.options.map((o) => o.id);
    for (const id of ['ascendant-step', 'gift-of-the-depths']) {
      expect(ids).toContain(id);
    }
  });

  it('Ascendant Step grants Levitate at-will via the bearer\'s effective spell list', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(514) });
    let campaign: Campaign = engine.createCampaign({ name: 'ascendant-step' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedInvocationPick(warlock.id, 'ascendant-step'),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[warlock.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells().find((g) => g.spellId === 'levitate');
    expect(granted).toBeDefined();
    expect(granted!.preparation).toBe('at-will');
  });

  it('Ascendant Step lets the warlock cast Levitate without consuming a slot (at-will bypass)', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(515) });
    let campaign: Campaign = engine.createCampaign({ name: 'as-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedInvocationPick(warlock.id, 'ascendant-step'),
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: warlock.id,
      spellId: 'levitate',
      slotLevel: 2,
      targetIds: [warlock.id],
    }).events;
    const types = events.map((e) => e.type);
    expect(types).toContain('SpellCastDeclared');
    expect(types).not.toContain('SpellSlotConsumed');
    expect(types).not.toContain('PactSlotConsumed');
  });

  it('Gift of the Depths grants swim speed equal to walking speed AND Water Breathing once per long rest', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(516) });
    let campaign: Campaign = engine.createCampaign({ name: 'depths' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedInvocationPick(warlock.id, 'gift-of-the-depths'),
    ]);
    const stored = campaign.state.characters[warlock.id]!;
    // Swim speed matches the walking speed (humans walk 30).
    const swim = getEffectiveSpeedForMode({ character: stored, content: CONTENT, itemInstances: campaign.state.itemInstances, pendingChoices: campaign.state.pendingChoices }, 'swim');
    expect(swim).toBe(30);
    // Water Breathing is granted as oncePerLongRest.
    const acc = buildEffectStack({
      character: stored,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells().find((g) => g.spellId === 'water-breathing');
    expect(granted).toBeDefined();
    expect(granted!.preparation).toBe('oncePerLongRest');
  });
});
