// Slice 885 — per-target Cover on a spell's saving throw. Closes the L7 audit
// Area-3 DIVERGENCE `aoe-save-ignores-cover`.
//
// RAW (Cover): "A target with Half Cover has a +2 bonus to AC and Dexterity
// saving throws. A target with Three-Quarters Cover has a +5 bonus." Single-
// target save sites honor cover via `rollSaveAgainstDC` (slice 550), but the
// cast-spell AoE/save block had no cover channel — a creature behind half
// cover got no +2 Dex save vs Fireball. Slice 885 adds a consumer-supplied
// `CastSpellIntent.coverByTargetId` (positions are consumer state) applied to
// Dex saves, with the RAW Sacred Flame exception ("gains no benefit from
// Cover") modeled by a new `saveIgnoresCover` mechanic flag.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Mira', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 }, featsTaken: [],
    preparedSpells: ['fireball'],
  });

const buildTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 }, featsTaken: [],
  });

interface CastOpts {
  readonly spellId: string;
  readonly slotLevel: number;
  readonly targets: ReadonlyArray<Character>;
  readonly coverByTargetId?: Record<string, 'half' | 'three-quarters' | 'total'>;
}

const castSaves = (opts: CastOpts, seed = 0): ReadonlyArray<SaveRolledEvent> => {
  const wizard = buildWizard();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'cover-save' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ...opts.targets.map((t) =>
      ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t }) satisfies CharacterCreatedEvent),
  ]);
  const events = engine.plan.castSpell(campaign.state, {
    characterId: wizard.id,
    spellId: opts.spellId,
    slotLevel: opts.slotLevel,
    targetIds: opts.targets.map((t) => t.id),
    ignorePreparation: true,
    ...(opts.coverByTargetId !== undefined ? { coverByTargetId: opts.coverByTargetId } : {}),
  }).events;
  return events.filter((e): e is SaveRolledEvent => e.type === 'SaveRolled');
};

const bonusFor = (saves: ReadonlyArray<SaveRolledEvent>, targetId: string): number =>
  saves.find((s) => s.targetId === targetId)!.bonus;
const breakdownFor = (saves: ReadonlyArray<SaveRolledEvent>, targetId: string) =>
  saves.find((s) => s.targetId === targetId)!.breakdown ?? [];

describe('AoE save honors per-target Cover (slice 885)', () => {
  it('half cover adds +2 to the Dex save vs Fireball (same seed isolates the bonus)', () => {
    const t = buildTarget('Halfcover');
    const noCover = castSaves({ spellId: 'fireball', slotLevel: 3, targets: [t] }, 1);
    const withCover = castSaves({ spellId: 'fireball', slotLevel: 3, targets: [t], coverByTargetId: { [t.id]: 'half' } }, 1);
    expect(bonusFor(withCover, t.id)).toBe(bonusFor(noCover, t.id) + 2);
    expect(breakdownFor(withCover, t.id)).toContainEqual({ source: 'cover (half)', value: 2 });
  });

  it('three-quarters cover adds +5', () => {
    const t = buildTarget('Threecover');
    const noCover = castSaves({ spellId: 'fireball', slotLevel: 3, targets: [t] }, 2);
    const withCover = castSaves({ spellId: 'fireball', slotLevel: 3, targets: [t], coverByTargetId: { [t.id]: 'three-quarters' } }, 2);
    expect(bonusFor(withCover, t.id)).toBe(bonusFor(noCover, t.id) + 5);
    expect(breakdownFor(withCover, t.id)).toContainEqual({ source: 'cover (three-quarters)', value: 5 });
  });

  it('cover is per-target: only the covered creature in a multi-target blast gets the bonus', () => {
    const covered = buildTarget('Behind');
    const exposed = buildTarget('Open');
    const noCover = castSaves({ spellId: 'fireball', slotLevel: 3, targets: [covered, exposed] }, 3);
    const withCover = castSaves(
      { spellId: 'fireball', slotLevel: 3, targets: [covered, exposed], coverByTargetId: { [covered.id]: 'half' } }, 3);
    expect(bonusFor(withCover, covered.id)).toBe(bonusFor(noCover, covered.id) + 2);
    expect(bonusFor(withCover, exposed.id)).toBe(bonusFor(noCover, exposed.id)); // unchanged
  });

  it('Sacred Flame grants NO cover benefit (RAW exception via saveIgnoresCover)', () => {
    const t = buildTarget('Hidden');
    const noCover = castSaves({ spellId: 'sacred-flame', slotLevel: 0, targets: [t] }, 4);
    const withCover = castSaves({ spellId: 'sacred-flame', slotLevel: 0, targets: [t], coverByTargetId: { [t.id]: 'three-quarters' } }, 4);
    expect(bonusFor(withCover, t.id)).toBe(bonusFor(noCover, t.id));
    expect(breakdownFor(withCover, t.id).some((b) => b.source.startsWith('cover'))).toBe(false);
  });
});
