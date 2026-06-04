// Slice 530: Tiefling Fiendish Legacy + Otherworldly Presence.
//
// RAW (SRD 5.2.1 Tiefling): "Fiendish Legacy. You are the recipient
// of a legacy that grants you supernatural abilities. Choose a legacy
// from the Fiendish Legacies table. You gain the level 1 benefit of
// the chosen legacy. ... Otherworldly Presence. You know the
// Thaumaturgy cantrip. When you cast it with this trait, the spell
// uses the same spellcasting ability you use for your Fiendish
// Legacy trait."
//
// L1 Fiendish Legacies (each grants resistance + a cantrip):
//   - Abyssal: Poison resistance + Poison Spray cantrip
//   - Chthonic: Necrotic resistance + Chill Touch cantrip
//   - Infernal: Fire resistance + Fire Bolt cantrip
//
// Pure content slice. Reuses existing primitives: GrantSense
// (Darkvision), OfferChoice (legacy pick), GrantResistance (damage
// type per legacy), GrantSpell at-will (cantrip per legacy +
// Thaumaturgy from Otherworldly Presence). Composes through slice
// 527's at-will GrantSpell pathway for the cantrip casts.
//
// Documented RAW deviations (deferred):
//   - Spellcasting ability for Fiendish Legacy / Otherworldly
//     Presence is hardcoded to CHA. RAW lets the player choose
//     INT / WIS / CHA at legacy-pick time and uses the same ability
//     for both traits. Default to CHA since most tieflings use CHA;
//     consumer can override per-cast via the existing ability-
//     override pathway. Future slice could add a meta-choice for
//     the ability.
//   - L3 + L5 Fiendish Legacy spells (Ray of Sickness / False Life
//     / Hellish Rebuke at L3; Hold Person / Ray of Enfeeblement /
//     Darkness at L5) stay deferred — they're L3+ scope and the
//     current pack-level model is per-species-flat, not per-level
//     progression.

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

const buildTiefling = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'tiefling',
    backgroundId: 'sage',
    classes: [{ classId: 'sorcerer', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 7, max: 7, temp: 0 },
  });

const seedLegacyPick = (
  characterId: string,
  legacyId: 'abyssal' | 'chthonic' | 'infernal',
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  const legacyOptions = {
    abyssal: { label: 'Abyssal', effects: [{ kind: 'GrantResistance' as const, damageType: 'poison' as const }, { kind: 'GrantSpell' as const, spellId: 'poison-spray', preparation: 'at-will' as const, spellcastingAbility: 'CHA' as const }] },
    chthonic: { label: 'Chthonic', effects: [{ kind: 'GrantResistance' as const, damageType: 'necrotic' as const }, { kind: 'GrantSpell' as const, spellId: 'chill-touch', preparation: 'at-will' as const, spellcastingAbility: 'CHA' as const }] },
    infernal: { label: 'Infernal', effects: [{ kind: 'GrantResistance' as const, damageType: 'fire' as const }, { kind: 'GrantSpell' as const, spellId: 'fire-bolt', preparation: 'at-will' as const, spellcastingAbility: 'CHA' as const }] },
  };
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId,
      characterId, promptKey: 'tiefling-fiendish-legacy', prompt: 'Pick a legacy.',
      options: [{ id: legacyId, label: legacyOptions[legacyId].label, effects: legacyOptions[legacyId].effects }],
      oneOf: 1,
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId,
      characterId, selectedOptionIds: [legacyId],
    },
  ];
};

describe('Tiefling Fiendish Legacy + Otherworldly Presence (slice 530)', () => {
  it('the tiefling species ships the new OfferChoice + Thaumaturgy traits', () => {
    const sp = PACK.species.find((s) => s.id === 'tiefling')!;
    const kinds = sp.traits.map((t) => t.kind);
    expect(kinds).toContain('GrantSense');
    expect(kinds).toContain('OfferChoice');
    expect(kinds).toContain('GrantSpell');
    const grantThaum = sp.traits.find((t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === 'thaumaturgy');
    expect(grantThaum).toBeDefined();
    expect((grantThaum as { preparation: string }).preparation).toBe('at-will');
    expect((grantThaum as { spellcastingAbility: string }).spellcastingAbility).toBe('CHA');
  });

  it('the fiendish-legacy OfferChoice exposes all 3 legacies (abyssal / chthonic / infernal)', () => {
    const sp = PACK.species.find((s) => s.id === 'tiefling')!;
    const offer = sp.traits.find((t) => t.kind === 'OfferChoice' && (t as { choiceId?: string }).choiceId === 'tiefling-fiendish-legacy');
    expect(offer).toBeDefined();
    const optIds = ((offer as { options: ReadonlyArray<{ id: string }> }).options).map((o) => o.id);
    expect(optIds).toEqual(expect.arrayContaining(['abyssal', 'chthonic', 'infernal']));
  });

  it.each([
    ['abyssal', 'poison', 'poison-spray'],
    ['chthonic', 'necrotic', 'chill-touch'],
    ['infernal', 'fire', 'fire-bolt'],
  ] as const)('legacy %s grants %s resistance + %s cantrip via the effect stack', (legacyId, damageType, cantrip) => {
    const tiefling = buildTiefling();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(530) });
    let campaign: Campaign = engine.createCampaign({ name: `legacy-${legacyId}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: tiefling } satisfies CharacterCreatedEvent,
      ...seedLegacyPick(tiefling.id, legacyId),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[tiefling.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    // Resistance to the legacy's damage type
    expect(acc.hasResistance(damageType)).toBe(true);
    // Cantrip granted at-will
    const granted = acc.grantedSpells().find((g) => g.spellId === cantrip);
    expect(granted).toBeDefined();
    expect(granted!.preparation).toBe('at-will');
    expect(granted!.spellcastingAbility).toBe('CHA');
  });

  it('Otherworldly Presence: Thaumaturgy is granted at-will regardless of legacy pick', () => {
    const tiefling = buildTiefling();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(531) });
    let campaign: Campaign = engine.createCampaign({ name: 'thaum' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: tiefling } satisfies CharacterCreatedEvent,
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[tiefling.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const thaum = acc.grantedSpells().find((g) => g.spellId === 'thaumaturgy');
    expect(thaum).toBeDefined();
    expect(thaum!.preparation).toBe('at-will');
  });
});
