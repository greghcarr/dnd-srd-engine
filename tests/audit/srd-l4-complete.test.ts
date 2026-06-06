// Slice 702: CI-guarded "L4 SRD complete" floor audit.
//
// Companion to slice 619's `srd-l1-complete.test.ts`, slice 633's
// `srd-l2-complete.test.ts`, and slice 645's `srd-l3-complete.test.ts`.
// Pins the surface area that constitutes a complete L4 SRD experience
// and defines the L4 punch list (xfails) the cycle will close.
//
// L4's new SRD 5.2.1 surface (verified against
// references/srd-markdown/classes.md) is small in headcount but
// structurally significant:
//
//   - ALL 12 classes gain "Ability Score Improvement" at L4 ("You gain
//     the Ability Score Improvement feat or another feat of your
//     choice for which you qualify"; recurs at 8/12/16). This is the
//     dominant L4 deliverable and is entirely unmodeled today — every
//     class's levelTable['4'] ships an empty feature row.
//   - Monk additionally gains "Slow Fall" at L4 (reaction; reduce
//     falling damage by 5 × monk level).
//   - Fighter's Second Wind uses rise to 3 at L4 (second-wind-3).
//   - No new spell level: full casters reached 2nd-level slots at L3
//     and reach 3rd at L5; half-casters reached 1st at L2 and reach
//     2nd at L5. So L4 adds NO spell-wiring surface (that was L3's).
//   - No subclass features at L4 (subclass grants land L3/L6/L10/L14).
//
// Sections:
//   1. ASI feature present in every class's L4 row (xfail today: the
//      L4 OfferChoice "feat-or-ASI" row is unmodeled for all 12).
//   2. Class-specific L4 features present (Monk Slow Fall, Fighter
//      Second Wind 3 uses) — passing today.
//   3. The "Ability Score Improvement" feat exists with the RAW
//      +2-one / +1-two shape (xfail today: no such feat ships).
//   4. Behavioral: leveling a character 3→4 emits the ASI/feat
//      ChoiceRequired (xfail until the L4 OfferChoice rows land).
//   5. L4 resource scaffolding (Fighter Second Wind max 3, Sorcerer
//      Sorcery Points → 4, Monk Focus Points → 4) — passing today.
//   6. Planner presence for Slow Fall — already wired via planFalling's
//      useSlowFall arm (the row was corrected from a wrongly-assumed
//      planSlowFall to the real planner in slice 708).
//
// What this audit deliberately does NOT cover (deferred to later L4
// hardening slices, same pattern as the L2/L3 floors 639-644 / 650-653):
//   - L4 fuzz matrix extension ([1,2,3] → [1,2,3,4]; mirrors slice 651).
//   - Full behavioral ASI resolution (pick ASI feat → +2 ability →
//     derived ability score moves), once the OfferChoice rows land.

import { describe, expect, it } from 'vitest';
import * as planNs from '../../src/engine/plan/index.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { evaluateFormula } from '../../src/effects/index.js';
import type { Formula } from '../../src/schemas/formula.js';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { eventId, isoTimestamp } from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();
const plan = planNs as Record<string, unknown>;

const ALL_CLASS_IDS: ReadonlyArray<string> = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
];

// ────────────────────────────────────────────────────────────────────
// Helpers.
// ────────────────────────────────────────────────────────────────────
interface PackFeature {
  readonly id: string;
  readonly effects?: ReadonlyArray<{ kind: string; [k: string]: unknown }>;
}

const l4Features = (classId: string): ReadonlyArray<PackFeature> => {
  const cls = PACK.classes?.find((c) => c.id === classId);
  return (cls?.levelTable?.['4']?.features as ReadonlyArray<PackFeature>) ?? [];
};

const findL4Feature = (classId: string, featureId: string): PackFeature | undefined =>
  l4Features(classId).find((f) => f.id === featureId);

// The L4 "feat-or-ASI" deliverable is structurally an OfferChoice on a
// class L4 feature (the player picks the Ability Score Improvement feat
// or another feat). Detect it by shape, not by a hard-coded id, so the
// eventual id choice doesn't have to be guessed in the punch list.
const hasAsiOfferChoice = (classId: string): boolean =>
  l4Features(classId).some(
    (f) =>
      /ability-score|asi|feat/i.test(f.id) ||
      (f.effects ?? []).some((e) => e.kind === 'OfferChoice' || e.kind === 'GrantFeat'),
  );

// ────────────────────────────────────────────────────────────────────
// Tests.
// ────────────────────────────────────────────────────────────────────
describe('slice 702: SRD L4 completeness audit', () => {
  describe('Section 1: Ability Score Improvement present in every class L4 row', () => {
    // RAW (SRD 5.2.1 classes.md): every class gains "Ability Score
    // Improvement" at L4. Landed in slice 707 — each class's
    // levelTable['4'] now ships an `ability-score-improvement-4` feature
    // whose OfferChoice grants the ASI feat or another general feat.
    for (const classId of ALL_CLASS_IDS) {
      it(`${classId} L4 row offers the ASI/feat choice`, () => {
        expect(
          hasAsiOfferChoice(classId),
          `${classId} levelTable['4'] has no ASI/feat OfferChoice — RAW grants Ability Score Improvement at L4`,
        ).toBe(true);
      });
    }
  });

  describe('Section 2: class-specific L4 features present today', () => {
    it('monk L4 ships Slow Fall', () => {
      const slowFall = findL4Feature('monk', 'slow-fall');
      expect(slowFall, "monk L4 missing 'slow-fall'").toBeDefined();
    });

    it('fighter L4 raises Second Wind to 3 uses (second-wind-3)', () => {
      const secondWind = findL4Feature('fighter', 'second-wind-3');
      expect(secondWind, "fighter L4 missing 'second-wind-3'").toBeDefined();
      const grant = (secondWind!.effects ?? []).find(
        (e) => e.kind === 'GrantResource' && e['resourceId'] === 'second-wind',
      );
      expect(grant, 'second-wind-3 has no GrantResource for second-wind').toBeDefined();
      expect(grant!['max'], 'second-wind-3 max should be 3 at L4 (RAW)').toBe(3);
    });
  });

  describe('Section 3: the "Ability Score Improvement" feat exists', () => {
    // RAW 2024 frames the L4 grant as a feat: "You gain the Ability
    // Score Improvement feat or another feat of your choice." The ASI
    // feat's RAW text: "Increase one ability score by 2, or two ability
    // scores by 1 each, to a maximum of 20." Modeled as an OfferChoice
    // (+2 one / +1 two) whose options carry IncreaseAbilityScore
    // effects (the slice-308 primitive). Landed in slice 703.
    it('an Ability Score Improvement feat ships with IncreaseAbilityScore options', () => {
      const feat = (PACK.feats ?? []).find((f) => /ability-score-improvement/i.test(f.id));
      expect(feat, 'no ability-score-improvement feat in the pack').toBeDefined();
      // Once it lands, it offers ability increases (directly or via a
      // nested OfferChoice whose options carry IncreaseAbilityScore).
      const json = JSON.stringify(feat);
      expect(
        /IncreaseAbilityScore/.test(json),
        'ASI feat does not reference IncreaseAbilityScore',
      ).toBe(true);
    });
  });

  describe('Section 4: leveling 3→4 emits the ASI/feat ChoiceRequired', () => {
    // Behavioral pin. A Fighter is used because its L4 row carries no
    // subclass-selection complication (subclassLevel is 3) and its
    // current L4 row (second-wind-3) emits no OfferChoice — so today
    // no ChoiceRequired fired on the 3→4 level-up. Slice 707 landed the
    // feat-or-ASI OfferChoice row, so planLevelUp now auto-emits the
    // ChoiceRequired (it already walks new-level OfferChoice effects).
    it('a Fighter leveling 3→4 receives an ASI/feat ChoiceRequired', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const fighter: Character = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'L3 fighter',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
        abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
        hp: { current: 28, max: 28, temp: 0, maxBonus: 0 },
      });
      let campaign = engine.createCampaign({ name: 'l4-asi-cascade' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: fighter,
        } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.levelUp(campaign.state, {
        characterId: fighter.id,
        classId: 'fighter',
        hpStrategy: 'average',
      });
      const choice = events.find(
        (e): e is ChoiceRequiredEvent =>
          (e as { type?: string }).type === 'ChoiceRequired' &&
          /ability-score|asi|feat/i.test((e as { promptKey?: string }).promptKey ?? ''),
      );
      expect(choice, 'no ASI/feat ChoiceRequired emitted on the 3→4 level-up').toBeDefined();
    });
  });

  describe('Section 5: L4 resource scaffolding (GrantResource max + recharge at L4)', () => {
    // Mirrors slice 650's L3 resource pin. The resources that change
    // value at / are evaluated for L4:
    //   - Fighter:   Second Wind uses rise to 3 (the L4 grant supplies
    //                a fresh GrantResource max:3 with shortRest
    //                recharge — pinned again here from the resource
    //                angle).
    //   - Sorcerer:  Sorcery Points = sorcerer level → 4 at L4 (the L2
    //                font-of-magic grant uses a {kind:'level'} formula).
    //   - Monk:      Focus Points (legacy resourceId 'ki') = monk level
    //                → 4 at L4 (the L2 monks-focus grant, same formula).
    interface L4ResourceCheck {
      readonly classId: string;
      readonly grantLevel: '2' | '4';
      readonly featureId: string;
      readonly resourceId: string;
      readonly l4Max: number;
      readonly recharge: 'shortRest' | 'longRest' | 'partialShortFullLong';
    }
    const L4_RESOURCE_CHECKS: ReadonlyArray<L4ResourceCheck> = [
      { classId: 'fighter', grantLevel: '4', featureId: 'second-wind-3', resourceId: 'second-wind', l4Max: 3, recharge: 'shortRest' },
      { classId: 'sorcerer', grantLevel: '2', featureId: 'font-of-magic', resourceId: 'sorcery-points', l4Max: 4, recharge: 'longRest' },
      { classId: 'monk', grantLevel: '2', featureId: 'monks-focus', resourceId: 'ki', l4Max: 4, recharge: 'shortRest' },
    ];
    for (const check of L4_RESOURCE_CHECKS) {
      it(`${check.classId} / ${check.featureId} (L${check.grantLevel}): ${check.resourceId} max evaluates to ${check.l4Max} at L4, recharge = ${check.recharge}`, () => {
        const cls = PACK.classes?.find((c) => c.id === check.classId);
        expect(cls, `class ${check.classId} missing`).toBeDefined();
        const feature = cls!.levelTable?.[check.grantLevel]?.features?.find(
          (f) => f.id === check.featureId,
        ) as { effects?: ReadonlyArray<{ kind: string; resourceId?: string; max?: number | Formula; recharge?: string }> } | undefined;
        expect(feature, `${check.classId} L${check.grantLevel} feature ${check.featureId} missing`).toBeDefined();
        const grantResource = (feature!.effects ?? []).find(
          (e) => e.kind === 'GrantResource' && e.resourceId === check.resourceId,
        );
        expect(
          grantResource,
          `${check.classId}/${check.featureId} has no GrantResource for '${check.resourceId}'`,
        ).toBeDefined();
        const maxField = grantResource!.max;
        let evaluatedMax: number;
        if (typeof maxField === 'number') {
          evaluatedMax = maxField;
        } else if (maxField !== undefined) {
          evaluatedMax = evaluateFormula(maxField as Formula, {
            abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
            proficiencyBonus: 2,
            classLevels: new Map([[check.classId, 4]]),
            totalLevel: 4,
          });
        } else {
          throw new Error(`${check.classId}/${check.featureId} GrantResource has no max field`);
        }
        expect(
          evaluatedMax,
          `${check.classId}/${check.featureId} L4 max evaluates to ${evaluatedMax}, RAW expects ${check.l4Max}`,
        ).toBe(check.l4Max);
        expect(
          grantResource!.recharge,
          `${check.classId}/${check.featureId} recharge is '${grantResource!.recharge}', expected '${check.recharge}'`,
        ).toBe(check.recharge);
      });
    }
  });

  describe('Section 6: planner presence per L4 feature', () => {
    // Slow Fall (Monk L4) reduces falling damage by 5 × monk level as a
    // Reaction. It is already wired via `planFalling`'s `useSlowFall`
    // arm (src/engine/plan/falling.ts) — planFalling models the fall
    // damage itself and subtracts the reduction. Slice 702's floor audit
    // assumed a separate `planSlowFall`; slice 708 corrected this row to
    // the real planner after the pack-integrity + planner-wiring audits
    // flagged a redundant duplicate.
    interface PlannerExpectation {
      readonly featureId: string;
      readonly plannerExport: string;
    }
    const PLANNERS: ReadonlyArray<PlannerExpectation> = [
      { featureId: 'slow-fall', plannerExport: 'planFalling' },
    ];
    for (const expectation of PLANNERS) {
      it(`${expectation.featureId} → ${expectation.plannerExport}`, () => {
        expect(
          plan[expectation.plannerExport],
          `planner ${expectation.plannerExport} not exported from src/engine/plan/index.ts`,
        ).toBeDefined();
        expect(typeof plan[expectation.plannerExport]).toBe('function');
      });
    }
  });
});
