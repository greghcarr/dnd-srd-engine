// Slice 794: SRD 5.2.1 NPC spellcasting — the "casts one of the
// following spells, using <ability> (spell save DC N): At Will / N/Day
// Each" envelope, modeled with two additive primitives:
//
//   - SetSpellcastingProfile (a statblock trait) pins the flat spell
//     save DC / attack bonus / ability for a creature with no
//     spellcasting class. Before this, a creature-built Mage derived
//     DC 0 (no class) — "a Mage is a stick-wielder."
//   - GrantSpell { preparation: 'perLongRest', usesPerLongRest: N }
//     meters the "N/Day Each" buckets via the bearer's perDayCastsUsed
//     counter (a generalization of the boolean oncePerLongRest path);
//     a long rest clears it. "At Will" stays the slice-527 at-will
//     GrantSpell (unlimited, slot-free).
//
// Canonical user: the Mage (CR 6). Spellcasting, INT, spell save DC 14:
//   At Will: Detect Magic, Light, Mage Armor, Mage Hand, Prestidigitation
//   2/Day Each: Fireball (lvl 4 version), Invisibility
//   1/Day Each: Cone of Cold, Fly
// (The "Fireball level 4 version" upcast pin is deferred polish; the
// consumer passes the slot level on the cast intent for now.)
//
// Contract note: a `perLongRest` spell is cast with `useFreeCast: true`
// (same as the oncePerLongRest free-cast path) — that's the signal to
// spend a daily use and bypass the (non-existent) slot. An at-will
// granted spell bypasses slots without the flag.

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeSpellSaveDC } from '../../../src/derive/spell-dc.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// Monsters live as runtime Characters; the dummy fighter class carries
// no spellcasting, so the Mage's DC resolves through the statblock
// profile, not a class level.
const buildMonster = (statblockId: string, name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === statblockId)!.abilityScores,
    hp: { current: 200, max: 200, temp: 0 },
    statblockId,
  });

const seatMage = (seed: number): { engine: ReturnType<typeof createEngine>; campaign: Campaign; mage: Character; target: Character } => {
  const mage = buildMonster('mage', 'Test Mage');
  const target = buildMonster('boar', 'Target Dummy');
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'mage-cast' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: mage } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, mage, target };
};

describe('NPC spellcasting envelope — the Mage (slice 794)', () => {
  it('the statblock ships the profile + the At Will and N/Day GrantSpell buckets', () => {
    const mage = PACK.monsters.find((m) => m.id === 'mage')!;
    const profile = mage.traits.find((t) => t.kind === 'SetSpellcastingProfile');
    expect(profile).toMatchObject({ ability: 'INT', saveDC: 14 });

    const grant = (id: string) =>
      mage.traits.find((t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === id) as
        | { preparation: string; usesPerLongRest?: number }
        | undefined;
    expect(grant('mage-hand')?.preparation).toBe('at-will');
    expect(grant('fireball')).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 2 });
    expect(grant('invisibility')).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 2 });
    expect(grant('cone-of-cold')).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 1 });
    expect(grant('fly')).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 1 });
  });

  it('the fixed spell save DC is 14 (not the class-derived value) and the profile carries INT', () => {
    const { campaign, mage } = seatMage(7940);
    const acc = buildEffectStack({
      character: campaign.state.characters[mage.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.spellcastingProfile()).toMatchObject({ ability: 'INT', saveDC: 14 });
    // Without the profile a class-less creature derives DC 0; with it,
    // the flat 14 short-circuits the 8 + prof + mod derivation.
    const dc = computeSpellSaveDC({
      character: campaign.state.characters[mage.id]!,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      classId: '',
    });
    expect(dc.total).toBe(14);
    expect(dc.breakdown).toEqual([{ source: 'fixed', value: 14 }]);
  });

  it('an At Will leveled spell (Mage Armor) casts with no slot and no daily-use spend', () => {
    const { engine, campaign, mage } = seatMage(7941);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: mage.id,
      spellId: 'mage-armor',
      slotLevel: 1,
      targetIds: [mage.id],
    }).events;
    const kinds = events.map((e) => e.type);
    expect(kinds).toContain('SpellCastDeclared');
    expect(kinds).not.toContain('SpellSlotConsumed');
    expect(kinds).not.toContain('PerDayCastUsed');
  });

  it('a 1/Day spell (Cone of Cold) meters: one cast spends the use, the next is blocked', () => {
    let { engine, campaign, mage, target } = seatMage(7942);
    const castConeOfCold = () =>
      engine.plan.castSpell(campaign.state, {
        characterId: mage.id,
        spellId: 'cone-of-cold',
        slotLevel: 5,
        targetIds: [target.id],
        useFreeCast: true,
      }).events;

    const first = castConeOfCold();
    const kinds = first.map((e) => e.type);
    expect(kinds).toContain('PerDayCastUsed');
    expect(kinds).not.toContain('SpellSlotConsumed');
    campaign = commit(campaign, first);
    expect(campaign.state.characters[mage.id]?.perDayCastsUsed['cone-of-cold']).toBe(1);

    // 1/Day exhausted → second cast throws.
    expect(castConeOfCold).toThrow(/no remaining daily uses/i);
  });

  it('a 2/Day spell (Fireball) allows exactly two casts per long rest', () => {
    let { engine, campaign, mage, target } = seatMage(7943);
    const castFireball = () =>
      engine.plan.castSpell(campaign.state, {
        characterId: mage.id,
        spellId: 'fireball',
        slotLevel: 3,
        targetIds: [target.id],
        useFreeCast: true,
      }).events;

    campaign = commit(campaign, castFireball());
    campaign = commit(campaign, castFireball());
    expect(campaign.state.characters[mage.id]?.perDayCastsUsed['fireball']).toBe(2);
    expect(castFireball).toThrow(/no remaining daily uses/i);
  });

  it('a long rest refreshes the daily budget', () => {
    let { engine, campaign, mage, target } = seatMage(7944);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: mage.id, spellId: 'cone-of-cold', slotLevel: 5, targetIds: [target.id], useFreeCast: true,
    }).events);
    expect(campaign.state.characters[mage.id]?.perDayCastsUsed['cone-of-cold']).toBe(1);

    campaign = commit(campaign, engine.plan.longRest(campaign.state, { participantIds: [mage.id, target.id] }).events);
    expect(campaign.state.characters[mage.id]?.perDayCastsUsed).toEqual({});

    // Available again.
    expect(() => engine.plan.castSpell(campaign.state, {
      characterId: mage.id, spellId: 'cone-of-cold', slotLevel: 5, targetIds: [target.id], useFreeCast: true,
    }).events).not.toThrow();
  });
});
