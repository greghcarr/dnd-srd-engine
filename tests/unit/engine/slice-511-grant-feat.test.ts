// Slice 511: `GrantFeat` primitive + Agonizing Blast refactored as a Feat.
//
// Adds an indirection effect kind that lets one effect projection include
// another Feat's effects by id. Expanded by `expandGrantFeatEffects` in
// `src/derive/effect-stack.ts` before reaching `applyEffectToBuilder`
// (the builder switch sees only fully-expanded leaf effects), with cycle
// protection (a feat that transitively grants itself is broken at the
// second visit).
//
// Canonical user: Warlock Eldritch Invocations. Agonizing Blast moves
// from inline-in-the-OfferChoice-option (slice 510) to a standalone Feat
// content row (`category: 'invocation'`). The warlock L1 invocation
// OfferChoice's option now reads `{ kind: 'GrantFeat', featId:
// 'agonizing-blast-eldritch-blast' }` rather than inlining the AddModifier. Behavior is
// identical to slice 510 (the slice-510 end-to-end test continues to
// pass); the wire shape scales — future invocations are just new Feat
// rows + one new option entry on each tier's OfferChoice.
//
// Deferred (separate slice): the per-cantrip generalization (RAW lets
// the warlock pick which damage cantrip benefits from Agonizing Blast)
// needs either a ChoiceResolved-cascade mechanism (so the granted feat's
// own OfferChoices install PendingChoices when the parent option is
// picked) or a parameterized invocation shape. Both are architectural
// decisions outside the scope of this primitive-introducing slice.

import { describe, expect, it } from 'vitest';
import { buildEffectStack, expandGrantFeatEffects } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { Effect } from '../../../src/schemas/effects.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

describe('GrantFeat primitive (slice 511)', () => {
  it('the pack ships Agonizing Blast as a Feat (category: invocation) with the inline AddModifier on damage', () => {
    const feat = PACK.feats.find((f) => f.id === 'agonizing-blast-eldritch-blast');
    expect(feat).toBeDefined();
    expect(feat!.category).toBe('invocation');
    // Slice 512: per-variant (one feat per warlock damage cantrip), so
    // each variant is `repeatable: false` — picking the same variant twice
    // is a no-op. Repeatability of "Agonizing Blast" RAW is across the
    // variants (the warlock could pick a different one at a later tier).
    expect(feat!.repeatable).toBe(false);
    expect(feat!.effects).toEqual([
      {
        kind: 'AddModifier',
        target: 'damage',
        value: { kind: 'abilityMod', ability: 'CHA' },
        condition: { kind: 'eq', path: 'event.spellId', value: 'eldritch-blast' },
      },
    ]);
  });

  it('the warlock L1 invocation OfferChoice option uses GrantFeat (not inline effects)', () => {
    const w = PACK.classes.find((c) => c.id === 'warlock')!;
    const feat = w.levelTable['1']!.features.find((f) => f.id === 'eldritch-invocations-2')!;
    const oc = feat.effects[0] as {
      kind: string;
      options: ReadonlyArray<{ id: string; effects: ReadonlyArray<{ kind: string }> }>;
    };
    expect(oc.kind).toBe('OfferChoice');
    expect(oc.options[0]!.id).toBe('agonizing-blast-eldritch-blast');
    expect(oc.options[0]!.effects).toEqual([{ kind: 'GrantFeat', featId: 'agonizing-blast-eldritch-blast' }]);
  });

  it('expandGrantFeatEffects recursively resolves a GrantFeat reference to the named feat\'s effects', () => {
    const input: Effect[] = [{ kind: 'GrantFeat', featId: 'agonizing-blast-eldritch-blast' }];
    const expanded = expandGrantFeatEffects(input, CONTENT);
    expect(expanded).toEqual([
      {
        kind: 'AddModifier',
        target: 'damage',
        value: { kind: 'abilityMod', ability: 'CHA' },
        condition: { kind: 'eq', path: 'event.spellId', value: 'eldritch-blast' },
      },
    ]);
  });

  it('expandGrantFeatEffects breaks self-referential cycles (the second visit is skipped)', () => {
    // The pack has no cyclic feats, so synthesize the situation by
    // pre-seeding the visited set with the only-reachable feat id.
    const input: Effect[] = [{ kind: 'GrantFeat', featId: 'agonizing-blast-eldritch-blast' }];
    const expanded = expandGrantFeatEffects(input, CONTENT, new Set(['agonizing-blast-eldritch-blast']));
    expect(expanded).toEqual([]);
  });

  it('expandGrantFeatEffects drops an unknown featId reference rather than throwing', () => {
    const input: Effect[] = [{ kind: 'GrantFeat', featId: 'nonexistent-invocation' }];
    expect(expandGrantFeatEffects(input, CONTENT)).toEqual([]);
  });

  it('end-to-end: a Warlock who picks Agonizing Blast via the OfferChoice gets the AddModifier projected through the GrantFeat indirection', () => {
    const warlock = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Vex',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 18 },
      hp: { current: 8, max: 8, temp: 0 },
      knownSpells: ['eldritch-blast'],
      preparedSpells: ['eldritch-blast'],
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(511) });
    let campaign: Campaign = engine.createCampaign({ name: 'grant-feat-e2e' });
    const choiceId = newChoiceId();
    const seeded: [ChoiceRequiredEvent, ChoiceResolvedEvent] = [
      {
        id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId,
        characterId: warlock.id, promptKey: 'eldritch-invocations-l1', prompt: 'Pick an invocation.',
        options: [{
          id: 'agonizing-blast-eldritch-blast',
          label: 'Agonizing Blast',
          effects: [{ kind: 'GrantFeat', featId: 'agonizing-blast-eldritch-blast' }],
        }],
        oneOf: 1,
      },
      {
        id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId,
        characterId: warlock.id, selectedOptionIds: ['agonizing-blast-eldritch-blast'],
      },
    ];
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seeded,
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[warlock.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    // The AddModifier from the Agonizing Blast feat reaches the effect
    // stack via choice -> GrantFeat -> expansion -> applyEffectToBuilder.
    const facts = new Map<string, unknown>([['event.spellId', 'eldritch-blast']]);
    expect(acc.modifierSum('damage', facts)).toBe(4); // CHA 18 -> +4
  });
});
