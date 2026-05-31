// Slice 529: at-will spellcasting sweep — wires the at-will arm of
// Innate Spellcasting for 8 monsters via monster-trait GrantSpell.
//
// Follow-up to slice 527's discovery that monster at-will spellcasting
// composes through three pre-existing slices (effect-stack trait
// folding + slice 212 effective-spell-list + slice 513 at-will slot-
// bypass) with no new engine code. This slice authors the at-will
// arm of every per-spell-envelope monster in the pack per SRD 5.2.1.
//
// Per-spell-envelope monsters wired here (at-will arm only; per-day
// arm still deferred pending the per-day-usage primitive):
//   - Cloud Giant (CHA): Detect Magic, Fog Cloud, Light
//   - Storm Giant (WIS): Detect Magic, Light
//   - Couatl (WIS): Detect Evil and Good, Detect Magic, Detect Thoughts
//   - Unicorn (CHA): Detect Evil and Good, Druidcraft
//   - Deva (CHA): Detect Evil and Good
//   - Planetar (CHA): Detect Evil and Good
//   - Solar (CHA): Detect Evil and Good
//   - Dryad (CHA): Animal Friendship, Charm Monster, Druidcraft
//
// Folds in 5 missing Magic Resistance traits that the audit surfaced
// while wiring this batch: Unicorn, Dryad, Deva, Planetar, Solar all
// have Magic Resistance per SRD 5.2.1 RAW but the pack was missing
// the trait. Couatl does NOT have Magic Resistance in SRD 2024 (the
// pre-2024 version did; the 2024 SRD dropped it). All 5 fixes here.
//
// Documented RAW deferrals (still per-monster):
//   - Couatl + Deva "Shapechange" at-will action: deferred (Shape-
//     Shift primitive).
//   - Planetar + Solar "Invisibility self-only" at-will: not wired
//     here because the SRD 2024 spec puts those under Divine Aid
//     (2/Day, not at-will). Re-checked: SRD 2024 Planetar / Solar
//     Spellcasting blocks only list Detect Evil and Good at-will;
//     Invisibility is under Divine Aid (the deferred-mechanics doc
//     listed Invisibility as at-will but this is a 2014-era claim).
//   - All per-day spell lists (3/Day, 1/Day) stay deferred per the
//     slice 528 doc update.

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

interface AtWillExpectation {
  readonly monsterId: string;
  readonly ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  readonly spells: ReadonlyArray<string>;
}

const EXPECTATIONS: ReadonlyArray<AtWillExpectation> = [
  { monsterId: 'cloud-giant', ability: 'CHA', spells: ['detect-magic', 'fog-cloud', 'light'] },
  { monsterId: 'storm-giant', ability: 'WIS', spells: ['detect-magic', 'light'] },
  { monsterId: 'couatl', ability: 'WIS', spells: ['detect-evil-and-good', 'detect-magic', 'detect-thoughts'] },
  { monsterId: 'unicorn', ability: 'CHA', spells: ['detect-evil-and-good', 'druidcraft'] },
  { monsterId: 'deva', ability: 'CHA', spells: ['detect-evil-and-good'] },
  { monsterId: 'planetar', ability: 'CHA', spells: ['detect-evil-and-good'] },
  { monsterId: 'solar', ability: 'CHA', spells: ['detect-evil-and-good'] },
  { monsterId: 'dryad', ability: 'CHA', spells: ['animal-friendship', 'charm-monster', 'druidcraft'] },
];

const MAGIC_RESISTANCE_ADDED = ['unicorn', 'dryad', 'deva', 'planetar', 'solar'];

const buildMonster = (statblockId: string): Character => {
  const sb = PACK.monsters.find((m) => m.id === statblockId)!;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: `Test-${statblockId}`,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: sb.abilityScores,
    hp: { current: sb.hp.average, max: sb.hp.average, temp: 0 },
    statblockId: sb.id,
  });
};

describe('At-will spellcasting sweep (slice 529)', () => {
  it.each(EXPECTATIONS)(
    '$monsterId ships at-will GrantSpell traits for $spells with ability $ability',
    ({ monsterId, ability, spells }) => {
      const m = PACK.monsters.find((mon) => mon.id === monsterId)!;
      for (const spellId of spells) {
        const trait = m.traits.find(
          (t) =>
            t.kind === 'GrantSpell' &&
            (t as { spellId?: string }).spellId === spellId,
        );
        expect(trait, `${monsterId} missing GrantSpell trait for ${spellId}`).toBeDefined();
        expect((trait as { preparation: string }).preparation).toBe('at-will');
        expect((trait as { spellcastingAbility: string }).spellcastingAbility).toBe(ability);
      }
    },
  );

  it.each(EXPECTATIONS)(
    '$monsterId effect stack projects every at-will spell as granted',
    ({ monsterId, ability, spells }) => {
      const monster = buildMonster(monsterId);
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(529) });
      let campaign: Campaign = engine.createCampaign({ name: `${monsterId}-grants` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monster } satisfies CharacterCreatedEvent,
      ]);
      const acc = buildEffectStack({
        character: campaign.state.characters[monster.id]!,
        content: CONTENT,
        itemInstances: campaign.state.itemInstances,
        pendingChoices: campaign.state.pendingChoices,
      });
      for (const spellId of spells) {
        const granted = acc.grantedSpells().find((g) => g.spellId === spellId);
        expect(granted, `${monsterId} effect stack missing granted ${spellId}`).toBeDefined();
        expect(granted!.preparation).toBe('at-will');
        expect(granted!.spellcastingAbility).toBe(ability);
      }
    },
  );

  it.each(MAGIC_RESISTANCE_ADDED)('%s ships the previously-missing GrantMagicResistance trait', (mid) => {
    const m = PACK.monsters.find((mon) => mon.id === mid)!;
    expect(m.traits.some((t) => t.kind === 'GrantMagicResistance')).toBe(true);
  });

  it('Couatl does NOT carry GrantMagicResistance (SRD 2024 dropped it; pre-2024 carried it)', () => {
    const m = PACK.monsters.find((mon) => mon.id === 'couatl')!;
    expect(m.traits.some((t) => t.kind === 'GrantMagicResistance')).toBe(false);
  });

  it('Imp Detect-Evil-and-Good cast end-to-end: Cloud Giant casts Detect Magic with NO slot consumed (smoke test)', () => {
    const monster = buildMonster('cloud-giant');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(530) });
    let campaign: Campaign = engine.createCampaign({ name: 'cloud-giant-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monster } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: monster.id,
      spellId: 'detect-magic',
      slotLevel: 1,
      targetIds: [monster.id],
    }).events;
    const kinds = events.map((e) => e.type);
    expect(kinds).toContain('SpellCastDeclared');
    expect(kinds).not.toContain('SpellSlotConsumed');
    expect(kinds).not.toContain('PactSlotConsumed');
  });
});
