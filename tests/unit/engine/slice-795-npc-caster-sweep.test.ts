// Slice 795: the SRD 5.2.1 NPC-caster content sweep on the slice-794
// primitive — Priest, Druid, Cultist Fanatic now carry their RAW
// Spellcasting action (the Mage shipped as 794's canonical user). This
// closes the `spellcaster-npc-no-spells` L7 blocker for the four named
// casters. Each statblock ships a SetSpellcastingProfile trait (fixed
// spell save DC / attack) + the At Will and N/Day-Each GrantSpell
// buckets; the engine code is unchanged (pure content).
//
//   Priest          (CR 2, WIS, DC 13): At Will Light/Thaumaturgy;
//                    1/Day Spirit Guardians
//   Druid           (CR 2, WIS, DC 13): At Will Druidcraft/Speak with
//                    Animals; 2/Day Entangle, Thunderwave; 1/Day Animal
//                    Messenger, Longstrider, Moonbeam
//   Cultist Fanatic (CR 2, WIS, DC 12, +4 atk): At Will Light/
//                    Thaumaturgy; 2/Day Command; 1/Day Hold Person
//
// Tracked follow-up (NOT this slice): the bonus-action/reaction spell
// groups (Priest Divine Aid, Cultist Spiritual Weapon), the Archmage,
// and the latent fixed-DC profiles for the dragons' existing at-will
// casting.

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../../../src/derive/spell-dc.js';
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

interface CasterSpec {
  id: string;
  ability: 'WIS';
  dc: number;
  attack?: number;
  atWill: string[];
  meter: Record<string, number>; // spellId -> usesPerLongRest
}

const CASTERS: CasterSpec[] = [
  { id: 'priest', ability: 'WIS', dc: 13, atWill: ['light', 'thaumaturgy'], meter: { 'spirit-guardians': 1 } },
  {
    id: 'druid', ability: 'WIS', dc: 13,
    atWill: ['druidcraft', 'speak-with-animals'],
    meter: { entangle: 2, thunderwave: 2, 'animal-messenger': 1, longstrider: 1, moonbeam: 1 },
  },
  { id: 'cultist-fanatic', ability: 'WIS', dc: 12, attack: 4, atWill: ['light', 'thaumaturgy'], meter: { command: 2, 'hold-person': 1 } },
];

describe('NPC-caster content sweep (slice 795)', () => {
  it.each(CASTERS)('$id ships the profile + the correct At Will / N/Day buckets', (spec) => {
    const sb = PACK.monsters.find((m) => m.id === spec.id)!;
    const profile = sb.traits.find((t) => t.kind === 'SetSpellcastingProfile');
    expect(profile).toMatchObject(
      spec.attack !== undefined
        ? { ability: spec.ability, saveDC: spec.dc, attackBonus: spec.attack }
        : { ability: spec.ability, saveDC: spec.dc },
    );
    for (const id of spec.atWill) {
      const g = sb.traits.find((t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === id);
      expect((g as { preparation?: string } | undefined)?.preparation).toBe('at-will');
    }
    for (const [id, uses] of Object.entries(spec.meter)) {
      const g = sb.traits.find((t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === id);
      expect(g).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: uses });
    }
  });

  it.each(CASTERS)('$id derives the flat statblock spell save DC (not a class-derived value)', (spec) => {
    const caster = buildMonster(spec.id, `Test-${spec.id}`);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7950) });
    let campaign: Campaign = engine.createCampaign({ name: `${spec.id}-dc` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    ]);
    const dc = computeSpellSaveDC({
      character: campaign.state.characters[caster.id]!,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      classId: '',
    });
    expect(dc.total).toBe(spec.dc);
    if (spec.attack !== undefined) {
      const atk = computeSpellAttackBonus({
        character: campaign.state.characters[caster.id]!,
        itemInstances: campaign.state.itemInstances,
        content: CONTENT,
        classId: '',
      });
      expect(atk.total).toBe(spec.attack);
    }
  });

  it('a non-Mage caster meters end-to-end: the Druid spends a Thunderwave use (no slot)', () => {
    const druid = buildMonster('druid', 'Test Druid');
    const target = buildMonster('boar', 'Target');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7951) });
    let campaign: Campaign = engine.createCampaign({ name: 'druid-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const cast = () => engine.plan.castSpell(campaign.state, {
      characterId: druid.id, spellId: 'thunderwave', slotLevel: 1, targetIds: [target.id], useFreeCast: true,
    }).events;
    const events = cast();
    expect(events.map((e) => e.type)).toContain('PerDayCastUsed');
    expect(events.map((e) => e.type)).not.toContain('SpellSlotConsumed');
    campaign = commit(campaign, events);
    campaign = commit(campaign, cast()); // 2/Day: second is fine
    expect(campaign.state.characters[druid.id]?.perDayCastsUsed['thunderwave']).toBe(2);
    expect(cast).toThrow(/no remaining daily uses/i); // third blocked
  });
});
