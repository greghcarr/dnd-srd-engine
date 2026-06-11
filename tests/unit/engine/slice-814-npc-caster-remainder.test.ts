// Slice 814: npc-caster-sweep-remainder — the slice 794-795 fixed-DC
// primitive applied to the rest of the pack's NPC casters. Pure content.
//
// Two strands closed here:
//   (1) Existing at-will casters that print a flat spell save DC but
//       carried no SetSpellcastingProfile, so a save spell they cast
//       derived DC 0 (a class-less Character has no spellcasting class).
//       The ACTIVE bug was the Dryad — Animal Friendship + Charm Monster
//       are WIS saves. Swept all eight printed-DC casters: dryad,
//       cloud-giant, storm-giant, couatl, unicorn, deva, planetar, solar
//       (the latter seven cast only no-save spells today, so their fix is
//       latent, but recording the canonical DC is the pattern-check).
//   (2) The Archmage gains its full Spellcasting action (INT, DC 17).
//
// Still tracked (NOT this slice): the bonus-action / reaction spell
// groups (Misty Step 3/Day, Spiritual Weapon, Divine Aid, Protective
// Magic, Tree Stride) — they need action-economy placement.

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { computeSpellSaveDC } from '../../../src/derive/spell-dc.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

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

// The DC the engine derives for a runtime Character built from the
// statblock — the whole point of the fix (it was 0 before the profile).
const deriveDC = (statblockId: string): number => {
  const caster = buildMonster(statblockId, `Test-${statblockId}`);
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8140) });
  let campaign: Campaign = engine.createCampaign({ name: `${statblockId}-dc` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
  ]);
  return computeSpellSaveDC({
    character: campaign.state.characters[caster.id]!,
    itemInstances: campaign.state.itemInstances,
    content: CONTENT,
    classId: '',
  }).total;
};

const PROFILES: ReadonlyArray<{ id: string; ability: string; dc: number }> = [
  { id: 'dryad', ability: 'CHA', dc: 14 },
  { id: 'cloud-giant', ability: 'CHA', dc: 15 },
  { id: 'storm-giant', ability: 'WIS', dc: 18 },
  { id: 'couatl', ability: 'WIS', dc: 15 },
  { id: 'unicorn', ability: 'CHA', dc: 14 },
  { id: 'deva', ability: 'CHA', dc: 17 },
  { id: 'planetar', ability: 'CHA', dc: 20 },
  { id: 'solar', ability: 'CHA', dc: 25 },
  { id: 'archmage', ability: 'INT', dc: 17 },
];

const spellById = new Map(PACK.spells.map((s) => [s.id, s]));
const imposesSave = (spellId: string): boolean => {
  const s = spellById.get(spellId) as { mechanicalEffects?: ReadonlyArray<{ kind?: string }> } | undefined;
  return !!s?.mechanicalEffects?.some((m) => m.kind === 'save');
};

describe('npc-caster-sweep-remainder (slice 814)', () => {
  it.each(PROFILES)('$id carries the SRD fixed spell save DC $dc ($ability)', ({ id, ability, dc }) => {
    const sb = PACK.monsters.find((m) => m.id === id);
    expect(sb, `${id} statblock present`).toBeDefined();
    const profile = sb!.traits.find((t) => t.kind === 'SetSpellcastingProfile');
    expect(profile).toMatchObject({ ability, saveDC: dc });
  });

  it.each(PROFILES)('$id derives spell save DC $dc through the engine (was 0 before the profile)', ({ id, dc }) => {
    expect(deriveDC(id)).toBe(dc);
  });

  // The durable guard for the Dryad bug class: a granted save-imposing
  // spell with no SetSpellcastingProfile is a silent DC-0 bug.
  it('no monster grants a save-imposing spell without a SetSpellcastingProfile', () => {
    const offenders: string[] = [];
    for (const m of PACK.monsters) {
      const traits = m.traits ?? [];
      const grants = traits.filter((t) => t.kind === 'GrantSpell') as Array<{ spellId: string }>;
      if (!grants.length) continue;
      if (traits.some((t) => t.kind === 'SetSpellcastingProfile')) continue;
      const saveSpells = grants.map((g) => g.spellId).filter(imposesSave);
      if (saveSpells.length) offenders.push(`${m.id}: ${saveSpells.join(', ')}`);
    }
    expect(offenders, `${offenders.length} monster(s) cast a save spell with no profile`).toEqual([]);
  });

  it('the Dryad completes its canonical bucket (1/Day Entangle + Pass without Trace)', () => {
    const sb = PACK.monsters.find((m) => m.id === 'dryad')!;
    for (const id of ['entangle', 'pass-without-trace']) {
      const g = sb.traits.find((t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === id);
      expect(g, id).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 1 });
    }
  });

  it('the Archmage ships its full At Will + N/Day Spellcasting buckets', () => {
    const sb = PACK.monsters.find((m) => m.id === 'archmage')!;
    const grant = (id: string) =>
      sb.traits.find((t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === id);
    for (const id of ['detect-magic', 'detect-thoughts', 'disguise-self', 'invisibility', 'light', 'mage-armor', 'mage-hand', 'prestidigitation']) {
      expect((grant(id) as { preparation?: string } | undefined)?.preparation, id).toBe('at-will');
    }
    expect(grant('fly')).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 2 });
    expect(grant('lightning-bolt')).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 2 });
    for (const id of ['cone-of-cold', 'mind-blank', 'scrying', 'teleport']) {
      expect(grant(id), id).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 1 });
    }
  });
});
