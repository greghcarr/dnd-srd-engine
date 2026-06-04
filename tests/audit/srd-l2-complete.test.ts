// Slice 633: CI-guarded "L2 SRD complete" floor audit.
//
// Companion to slice 619's `srd-l1-complete.test.ts`. Pins the surface
// area that constitutes a complete L2 SRD experience so progress
// toward L2 is measurable and so no future slice can silently drop a
// shipped L2 capability.
//
// Sections:
//
//   1. Per-class L2 feature ids present in the pack.
//      Passes today (the L2 scaffolding has shipped since the early
//      class-features cohort). Locks the canonical id list so a
//      content rewrite can't silently rename or drop a feature.
//
//   2. Planner presence for each L2 feature that needs one.
//      All entries pass as of slice 638 (the four planner xfails
//      flipped across slices 634-637: planTacticalMind, planDivineSpark,
//      planUncannyMetabolism, planMagicalCunning).
//
//   3. Resource scaffolding for L2 resource-granting features.
//      Each L2 feature that grants a resource (Action Surge, Channel
//      Divinity, Wild Shape uses, Monk's Focus/Ki, Sorcery Points,
//      Rage tiers) ships with a `GrantResource` effect. Passes today;
//      pinned to prevent regressions while wiring fills out.
//
//   4. OfferChoice cascade for L2 features that emit choices on
//      level-up. Wizard Scholar + Ranger Deft Explorer both prompt
//      via `engine.plan.offerCharacterChoices`.
//
// As of slice 638 the floor is fully green (32/32 plain `it`).
// The 0.3.0-alpha.0 ("L2 complete") tag is unblocked.
//
// What this audit deliberately does NOT cover:
//   - L2 spell wiring split. Already guarded by gaps-spells-counts
//     and aggregated by doc-counts.
//   - Per-feature mechanical depth (damage dice, save DCs). Those
//     belong in feature-specific unit tests; this audit's job is to
//     light up the missing surface, not to re-test wiring.

import { describe, expect, it } from 'vitest';
import * as planNs from '../../src/engine/plan/index.js';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { eventId, isoTimestamp } from '../fixtures/index.js';
import { newCharacterId } from '../../src/ids.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../src/schemas/events/level-up.js';
import { evaluateFormula } from '../../src/effects/index.js';
import type { Formula } from '../../src/schemas/formula.js';

const PACK = loadStarterPack();
const plan = planNs as Record<string, unknown>;

// ────────────────────────────────────────────────────────────────────
// Section 1: per-class L2 feature ids.
//
// Canonical ids as authored in the starter pack at the slice-633
// reference point. Mirrors the L2 column of the SRD 5.2.1 class
// tables. Bard Expertise carries the `-bard` class disambiguator
// because Rogue's L1 Expertise uses `expertise-rogue`; Fighting Style
// carries a class disambiguator on Paladin and Ranger for the same
// reason (Fighter's L1 entry already does).
// ────────────────────────────────────────────────────────────────────
const REQUIRED_L2_FEATURES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['barbarian', ['reckless-attack', 'danger-sense']],
  ['bard', ['expertise-bard', 'jack-of-all-trades']],
  ['cleric', ['channel-divinity', 'divine-spark', 'turn-undead']],
  ['druid', ['wild-shape', 'wild-companion']],
  ['fighter', ['action-surge', 'tactical-mind']],
  ['monk', ['monks-focus', 'unarmored-movement-monk', 'uncanny-metabolism']],
  ['paladin', ['fighting-style-paladin', 'paladins-smite']],
  ['ranger', ['deft-explorer', 'fighting-style-ranger']],
  ['rogue', ['cunning-action']],
  ['sorcerer', ['font-of-magic', 'metamagic']],
  ['warlock', ['magical-cunning', 'eldritch-invocations-3']],
  ['wizard', ['scholar']],
]);

// ────────────────────────────────────────────────────────────────────
// Section 2: planner presence per L2 feature.
//
// Each entry names the exported symbol the engine should ship for
// that feature. If the planner exports under a different name
// post-slice, update both sides in the same slice.
// ────────────────────────────────────────────────────────────────────
interface PlannerExpectation {
  readonly classId: string;
  readonly featureId: string;
  readonly plannerExport: string;
  readonly xfail?: true;
  readonly xfailReason?: string;
}

const PLANNERS: ReadonlyArray<PlannerExpectation> = [
  // Wired today.
  { classId: 'barbarian', featureId: 'reckless-attack', plannerExport: 'planRecklessAttack' },
  { classId: 'cleric', featureId: 'turn-undead', plannerExport: 'planTurnUndead' },
  { classId: 'cleric', featureId: 'divine-spark', plannerExport: 'planDivineSpark' }, // slice 635
  { classId: 'druid', featureId: 'wild-shape', plannerExport: 'planWildShape' },
  { classId: 'druid', featureId: 'wild-companion', plannerExport: 'planWildCompanion' },
  { classId: 'fighter', featureId: 'action-surge', plannerExport: 'planActionSurge' },
  { classId: 'fighter', featureId: 'tactical-mind', plannerExport: 'planTacticalMind' }, // slice 634
  { classId: 'monk', featureId: 'unarmored-movement-monk', plannerExport: 'planStepOfTheWind' },
  { classId: 'monk', featureId: 'uncanny-metabolism', plannerExport: 'planUncannyMetabolism' }, // slice 636
  { classId: 'paladin', featureId: 'paladins-smite', plannerExport: 'planPaladinsSmite' },
  { classId: 'rogue', featureId: 'cunning-action', plannerExport: 'planCunningAction' },
  { classId: 'sorcerer', featureId: 'metamagic', plannerExport: 'planMetamagic' },
  { classId: 'warlock', featureId: 'magical-cunning', plannerExport: 'planMagicalCunning' }, // slice 637

  // Xfail today. Remaining planners that must land before L2 is complete.
];

// ────────────────────────────────────────────────────────────────────
// Section 3: L2 resource scaffolding.
//
// Each entry names a feature whose L2 row should ship a GrantResource
// effect (the resource definition itself, max, recharge cadence).
// Mechanical correctness of the resource (per-rest reset, max
// scaling) is covered by per-class tests; this section pins that the
// resource is at least declared at L2 so consumers building L2
// characters see it AND that the L2 max value matches RAW.
//
// Slice 639: extended from "GrantResource is present" to "the L2 max
// value evaluates to the RAW number." Caught two failure modes that
// the earlier section couldn't see: a literal max getting silently
// changed, and a Formula max whose evaluation at L2 drifts from RAW.
// The RAW max values at L2 per the SRD 5.2.1 class tables:
//   - fighter   Action Surge column @ L2 = 1
//   - cleric    Channel Divinity column @ L2 = 2
//   - druid     Wild Shape column @ L2 = 2 (PHB 2024 / SRD 5.2.1)
//   - monk      Focus Points column @ L2 = 2 ("Your Monk level")
//   - sorcerer  Sorcery Points column @ L2 = 2 ("Your Sorcerer level")
// ────────────────────────────────────────────────────────────────────
const RESOURCE_BEARING_L2_FEATURES: ReadonlyArray<{
  classId: string;
  featureId: string;
  resourceId: string;
  l2Max: number;
}> = [
  { classId: 'fighter', featureId: 'action-surge', resourceId: 'action-surge', l2Max: 1 },
  { classId: 'cleric', featureId: 'channel-divinity', resourceId: 'channel-divinity', l2Max: 2 },
  { classId: 'druid', featureId: 'wild-shape', resourceId: 'wild-shape', l2Max: 2 },
  { classId: 'monk', featureId: 'monks-focus', resourceId: 'ki', l2Max: 2 },
  { classId: 'sorcerer', featureId: 'font-of-magic', resourceId: 'sorcery-points', l2Max: 2 },
];

// ────────────────────────────────────────────────────────────────────
// Helpers.
// ────────────────────────────────────────────────────────────────────
const findL2Feature = (
  classId: string,
  featureId: string,
): { effects?: ReadonlyArray<{ kind: string }> } | undefined => {
  const cls = PACK.classes?.find((c) => c.id === classId);
  if (!cls) return undefined;
  const l2 = cls.levelTable?.['2'];
  return (l2?.features as Array<{ id: string; effects?: ReadonlyArray<{ kind: string }> }>)?.find(
    (f) => f.id === featureId,
  );
};

const buildL2Character = (
  classId: string,
  overrides?: Partial<Character>,
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `L2 ${classId}`,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId, level: 2, hitDiceRemaining: 2 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 12, WIS: 12, CHA: 12 },
    hp: { current: 16, max: 16, temp: 0, maxBonus: 0 },
    ...overrides,
  });

// ────────────────────────────────────────────────────────────────────
// Tests.
// ────────────────────────────────────────────────────────────────────
describe('slice 633: SRD L2 completeness audit', () => {
  describe('Section 1: per-class L2 features (canonical ids present)', () => {
    for (const [classId, requiredFeatureIds] of REQUIRED_L2_FEATURES) {
      it(`${classId} L2 row has the canonical feature ids`, () => {
        const cls = PACK.classes?.find((c) => c.id === classId);
        expect(cls, `class ${classId} missing from pack`).toBeDefined();
        const l2 = cls!.levelTable?.['2'];
        expect(l2, `${classId} levelTable['2'] missing`).toBeDefined();
        const l2Features = (l2!.features ?? []).map((f) => f.id);
        for (const requiredId of requiredFeatureIds) {
          expect(
            l2Features,
            `${classId} L2 missing canonical feature ${requiredId}`,
          ).toContain(requiredId);
        }
      });
    }
  });

  describe('Section 2: planner presence per L2 feature', () => {
    for (const expectation of PLANNERS) {
      const label = `${expectation.classId} / ${expectation.featureId} → ${expectation.plannerExport}`;
      if (expectation.xfail) {
        it.fails(`xfail: ${label} (${expectation.xfailReason})`, () => {
          expect(
            plan[expectation.plannerExport],
            `planner ${expectation.plannerExport} not exported from src/engine/plan/index.ts`,
          ).toBeDefined();
        });
      } else {
        it(label, () => {
          expect(
            plan[expectation.plannerExport],
            `planner ${expectation.plannerExport} not exported from src/engine/plan/index.ts`,
          ).toBeDefined();
          expect(typeof plan[expectation.plannerExport]).toBe('function');
        });
      }
    }
  });

  describe('Section 3: L2 resource scaffolding (GrantResource effect + RAW max at L2)', () => {
    for (const { classId, featureId, resourceId, l2Max } of RESOURCE_BEARING_L2_FEATURES) {
      it(`${classId} / ${featureId} ships GrantResource (${resourceId}) with L2 max = ${l2Max}`, () => {
        const feature = findL2Feature(classId, featureId);
        expect(feature, `feature ${featureId} missing on ${classId} L2`).toBeDefined();
        const effects = (feature!.effects ?? []) as Array<{
          kind: string;
          resourceId?: string;
          max?: number | Formula;
        }>;
        const grantResource = effects.find(
          (e) => e.kind === 'GrantResource' && e.resourceId === resourceId,
        );
        expect(
          grantResource,
          `${classId}/${featureId} L2 entry has no GrantResource for '${resourceId}' (got ${effects.map((e) => e.kind).join(', ') || 'none'})`,
        ).toBeDefined();

        // Resolve the max: literal number or evaluated Formula. The
        // Formula path needs a context the audit synthesizes — at L2
        // for the relevant class — so a {kind:'level', classId} formula
        // returns 2. Constructed minimal context: only the fields the
        // resource-max formulas in the pack actually read.
        const maxField = grantResource!.max;
        let evaluatedMax: number;
        if (typeof maxField === 'number') {
          evaluatedMax = maxField;
        } else if (maxField !== undefined) {
          evaluatedMax = evaluateFormula(maxField as Formula, {
            abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
            proficiencyBonus: 2,
            classLevels: new Map([[classId, 2]]),
            totalLevel: 2,
          });
        } else {
          throw new Error(
            `${classId}/${featureId} GrantResource has no max field`,
          );
        }
        expect(
          evaluatedMax,
          `${classId}/${featureId} L2 max evaluates to ${evaluatedMax}, RAW expects ${l2Max}`,
        ).toBe(l2Max);
      });
    }
  });

  describe('Section 4: OfferChoice cascade for L2 features that emit choices', () => {
    it('fresh L2 Wizard emits Scholar ChoiceRequired with the 6 academic skill options', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const wizard = buildL2Character('wizard', {
        abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
        hp: { current: 14, max: 14, temp: 0, maxBonus: 0 },
      });
      let campaign = engine.createCampaign({ name: 'l2-scholar-audit' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: wizard,
        } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.offerCharacterChoices(campaign.state, {
        characterId: wizard.id,
      });
      const scholarChoice = events.find(
        (e): e is ChoiceRequiredEvent =>
          e.type === 'ChoiceRequired' && e.promptKey === 'wizard-scholar',
      );
      expect(scholarChoice, 'L2 Wizard Scholar did not emit ChoiceRequired').toBeDefined();
      const optionIds = scholarChoice?.options.map((o) => o.id).sort();
      expect(optionIds).toEqual([
        'arcana',
        'history',
        'investigation',
        'medicine',
        'nature',
        'religion',
      ]);
    });

    it('warlock invocation catalog ships at least 3 invocation entries for the L2 OfferChoice to draw from', () => {
      // The L2 Warlock's "Eldritch Invocations (3 known)" row is a
      // tier marker; the OfferChoice mechanism that draws picks is at
      // L1, and the per-tier increase rides the same `GrantFeat`
      // path. The "catalog" the audit gates on is the existing feat
      // catalog filtered by category 'invocation' (slice 511 added
      // the category enum entry; slices 513-516 authored the first
      // 16 invocation feats). The original slice-633 xfail queried
      // `pack.eldritchInvocations` (a nonexistent top-level key);
      // slice 638 corrects the query to the real catalog location
      // and flips the xfail to a plain assertion.
      const invocations = (PACK.feats ?? []).filter((f) => f.category === 'invocation');
      expect(
        invocations.length,
        'No invocation-category feats in the pack; the L2 warlock cannot make their 3 picks',
      ).toBeGreaterThanOrEqual(3);
    });
  });
});
