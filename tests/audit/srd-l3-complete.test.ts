// Slice 645: CI-guarded "L3 SRD complete" floor audit.
//
// Companion to slice 619's `srd-l1-complete.test.ts` and slice 633's
// `srd-l2-complete.test.ts`. Pins the surface area that constitutes a
// complete L3 SRD experience.
//
// L3 introduces TWO new structural pieces over L2:
//   - Class L3 features (varies per class; many classes have no
//     class-only L3 feature beyond subclass selection).
//   - Subclass features at L3 — every class picks one subclass at L3
//     in the 2024 SRD (every class ships subclassLevel: 3), and the
//     pack ships one canonical L3 subclass per class (12 total).
//
// Sections (mirroring slice 633's L2 floor):
//
//   1. Per-class L3 feature ids present in the pack.
//      Several classes ship empty class-only L3 rows (subclass
//      selection is the entire L3 event); only classes with a
//      named class-only L3 feature are pinned.
//
//   2. Per-subclass L3 feature ids present (the 12 canonical
//      subclasses). Subclass content uses `levelGrants` (not
//      `levelTable.features`) — schema deviation predates this
//      audit.
//
//   3. Planner presence for L3 features that need one. Most L3
//      subclass features are passive (Disciple of Life,
//      Improved Critical, Draconic Resilience, Potent Cantrip)
//      or applied as effect-stack riders (Open Hand Technique
//      rides Flurry); only a handful need standalone planners
//      (Frenzy, Cutting Words, Preserve Life, Land's Aid,
//      Sacred Weapon — all wired). Xfailing today:
//        - rogue / steady-aim (class L3): BA self-advantage +
//          speed=0 self-debuff. Content is effects:[].
//        - thief / fast-hands (subclass L3): BA thieves' tools /
//          sleight of hand / disarm-trap. Content is effects:[].
//        - monk / deflect-attacks (class L3): reaction to reduce
//          incoming damage + reflect a thrown weapon. Content
//          is effects:[].
//
//   4. Subclass-selection OfferChoice cascade at L3.
//      Every class with subclassLevel: 3 should emit a
//      ChoiceRequired naming the subclass options when the
//      character is at L3. The cascade is the player's
//      subclass pick. Xfail today until the level-up planner
//      surfaces this through `engine.plan.offerCharacterChoices`
//      or its sibling.
//
// What this audit deliberately does NOT cover (deferred to later
// hardening slices, same pattern as L2 floors 639-644):
//   - L3 resource scaffolding (resource max + recharge per class at
//     L3 — Paladin channel-divinity comes online here, Sorcerer
//     Sorcery Points scale to 3, Barbarian Rage uses scale to 3).
//   - Subclass spell-list GrantSpell scaffolding (Life Domain
//     Spells, Devotion Spells, Fiend Spells, Draconic Spells,
//     Circle of the Land Spells).
//   - L3 spell wiring counts (already guarded by
//     gaps-spells-counts at the per-level floor introduced by
//     slice 641 — L3 floor = 27 wired).
//   - L3 fuzz floor (deferred until the L3 punch-list xfails
//     close; mirrors slice 643/644's place in the L2 cycle).

import { describe, expect, it } from 'vitest';
import * as planNs from '../../src/engine/plan/index.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';

const PACK = loadStarterPack();
const plan = planNs as Record<string, unknown>;

// ────────────────────────────────────────────────────────────────────
// Section 1: per-class L3 feature ids (the class-only row, excluding
// the implicit subclass-selection event).
//
// Classes with a named L3 class-only feature in SRD 5.2.1:
//   - Barbarian:  Primal Knowledge (skill prof from sneak attack list)
//                 + Rage uses scaling to 3
//   - Monk:       Deflect Attacks (reaction)
//   - Paladin:    Channel Divinity (resource comes online at L3)
//   - Rogue:      Steady Aim (BA self-advantage)
//
// Other classes (Bard, Cleric, Druid, Fighter, Ranger, Sorcerer,
// Warlock, Wizard) have ONLY subclass selection at L3 — no class-
// only feature row. Their class-level L3 row is `effects: []` by
// design and not pinned in this section.
// ────────────────────────────────────────────────────────────────────
const REQUIRED_L3_CLASS_FEATURES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['barbarian', ['primal-knowledge', 'rage-uses-3']],
  ['monk', ['deflect-attacks']],
  ['paladin', ['channel-divinity-paladin']],
  ['rogue', ['sneak-attack', 'steady-aim']],
]);

// ────────────────────────────────────────────────────────────────────
// Section 2: canonical L3 subclass per class + the L3 features each
// subclass ships in `levelGrants['3']`.
// ────────────────────────────────────────────────────────────────────
interface SubclassExpectation {
  readonly classId: string;
  readonly subclassId: string;
  readonly l3FeatureIds: ReadonlyArray<string>;
}

const REQUIRED_L3_SUBCLASS_FEATURES: ReadonlyArray<SubclassExpectation> = [
  { classId: 'barbarian', subclassId: 'path-of-the-berserker', l3FeatureIds: ['frenzy'] },
  { classId: 'bard', subclassId: 'college-of-lore', l3FeatureIds: ['lore-bonus-proficiencies', 'cutting-words'] },
  {
    classId: 'cleric',
    subclassId: 'life-domain',
    l3FeatureIds: ['life-domain-armor-training', 'disciple-of-life', 'life-domain-spells', 'preserve-life'],
  },
  {
    classId: 'druid',
    subclassId: 'circle-of-the-land',
    l3FeatureIds: ['circle-of-the-land-cantrip', 'lands-aid', 'circle-of-the-land-spells'],
  },
  { classId: 'fighter', subclassId: 'champion', l3FeatureIds: ['improved-critical', 'remarkable-athlete'] },
  { classId: 'monk', subclassId: 'warrior-of-the-open-hand', l3FeatureIds: ['open-hand-technique'] },
  { classId: 'paladin', subclassId: 'oath-of-devotion', l3FeatureIds: ['devotion-spells', 'sacred-weapon'] },
  { classId: 'ranger', subclassId: 'hunter', l3FeatureIds: ['hunters-lore', 'hunters-prey'] },
  { classId: 'rogue', subclassId: 'thief', l3FeatureIds: ['fast-hands', 'second-story-work'] },
  {
    classId: 'sorcerer',
    subclassId: 'draconic-sorcery',
    l3FeatureIds: ['draconic-resilience-ac', 'draconic-resilience-hp', 'draconic-spells'],
  },
  { classId: 'warlock', subclassId: 'fiend-patron', l3FeatureIds: ['dark-ones-blessing', 'fiend-spells'] },
  { classId: 'wizard', subclassId: 'evoker', l3FeatureIds: ['evocation-savant', 'potent-cantrip'] },
];

// ────────────────────────────────────────────────────────────────────
// Section 3: planner presence per L3 feature that needs one.
//
// The wired entries below are L3 features whose canonical surface is
// a standalone planner (the consumer drives via engine.plan.X). Many
// other L3 features are passive (effect-stack contributions) or
// applied as riders during another planner (Open Hand Technique
// rides Flurry, Dark One's Blessing is trigger-driven, etc.) — those
// aren't part of this audit's planner-presence pin.
// ────────────────────────────────────────────────────────────────────
interface PlannerExpectation {
  readonly classOrSubclassId: string;
  readonly featureId: string;
  readonly plannerExport: string;
  readonly xfail?: true;
  readonly xfailReason?: string;
}

const PLANNERS: ReadonlyArray<PlannerExpectation> = [
  // Wired today.
  { classOrSubclassId: 'path-of-the-berserker', featureId: 'frenzy', plannerExport: 'planFrenzy' },
  { classOrSubclassId: 'college-of-lore', featureId: 'cutting-words', plannerExport: 'planCuttingWords' },
  { classOrSubclassId: 'life-domain', featureId: 'preserve-life', plannerExport: 'planPreserveLife' },
  { classOrSubclassId: 'circle-of-the-land', featureId: 'lands-aid', plannerExport: 'planLandsAid' },
  { classOrSubclassId: 'oath-of-devotion', featureId: 'sacred-weapon', plannerExport: 'planSacredWeapon' },
  { classOrSubclassId: 'rogue', featureId: 'steady-aim', plannerExport: 'planSteadyAim' }, // slice 646

  // Xfail today. Two L3 features still need standalone planners that
  // don't yet exist. Content currently ships effects:[] for each.
  {
    classOrSubclassId: 'thief',
    featureId: 'fast-hands',
    plannerExport: 'planFastHands',
    xfail: true,
    xfailReason:
      'L3 Thief subclass feature: bonus action to use a thieves\' tools check (sleight of hand / disarm trap / pick lock) or to use an object. Needs a BA-economy planner with a sub-action enum.',
  },
  {
    classOrSubclassId: 'monk',
    featureId: 'deflect-attacks',
    plannerExport: 'planDeflectAttacks',
    xfail: true,
    xfailReason:
      "L3 Monk feature: reaction to reduce incoming weapon-attack damage by 1d10 + DEX + monk level; on full reduction with the same hand, can spend 1 Focus Point to make an unarmed-strike counter or throw the deflected weapon. Needs reaction + damage-reduction primitive.",
  },
];

// ────────────────────────────────────────────────────────────────────
// Helpers.
// ────────────────────────────────────────────────────────────────────
const findL3ClassFeature = (
  classId: string,
  featureId: string,
): { id: string; effects?: ReadonlyArray<{ kind: string }> } | undefined => {
  const cls = PACK.classes?.find((c) => c.id === classId);
  if (!cls) return undefined;
  const l3 = cls.levelTable?.['3'];
  return (l3?.features as Array<{ id: string; effects?: ReadonlyArray<{ kind: string }> }>)?.find(
    (f) => f.id === featureId,
  );
};

const findL3SubclassFeature = (
  subclassId: string,
  featureId: string,
): { id: string; effects?: ReadonlyArray<{ kind: string }> } | undefined => {
  const sc = PACK.subclasses?.find((s) => s.id === subclassId) as
    | { levelGrants?: Record<string, Array<{ id: string; effects?: ReadonlyArray<{ kind: string }> }>> }
    | undefined;
  if (!sc) return undefined;
  return sc.levelGrants?.['3']?.find((f) => f.id === featureId);
};

// ────────────────────────────────────────────────────────────────────
// Tests.
// ────────────────────────────────────────────────────────────────────
describe('slice 645: SRD L3 completeness audit', () => {
  describe('Section 1: per-class L3 features (class-only row, excluding subclass selection)', () => {
    for (const [classId, requiredFeatureIds] of REQUIRED_L3_CLASS_FEATURES) {
      it(`${classId} L3 row has the canonical class-only feature ids`, () => {
        const cls = PACK.classes?.find((c) => c.id === classId);
        expect(cls, `class ${classId} missing from pack`).toBeDefined();
        const l3 = cls!.levelTable?.['3'];
        expect(l3, `${classId} levelTable['3'] missing`).toBeDefined();
        const l3Features = (l3!.features ?? []).map((f) => f.id);
        for (const requiredId of requiredFeatureIds) {
          expect(
            l3Features,
            `${classId} L3 missing canonical feature ${requiredId}`,
          ).toContain(requiredId);
        }
      });
    }
  });

  describe('Section 2: per-subclass L3 features (canonical 12 subclasses)', () => {
    for (const { classId, subclassId, l3FeatureIds } of REQUIRED_L3_SUBCLASS_FEATURES) {
      it(`${subclassId} (${classId}) L3 levelGrants has the canonical feature ids`, () => {
        const sc = PACK.subclasses?.find((s) => s.id === subclassId);
        expect(sc, `subclass ${subclassId} missing from pack`).toBeDefined();
        expect(
          (sc as { parentClassId?: string }).parentClassId,
          `${subclassId} parentClassId mismatch`,
        ).toBe(classId);
        for (const featureId of l3FeatureIds) {
          expect(
            findL3SubclassFeature(subclassId, featureId),
            `${subclassId} L3 missing canonical feature ${featureId}`,
          ).toBeDefined();
        }
      });
    }

    it('one canonical L3 subclass ships per class (12 subclasses total in the pack)', () => {
      const expectedSubclassIds = REQUIRED_L3_SUBCLASS_FEATURES.map((e) => e.subclassId).sort();
      const actualSubclassIds = (PACK.subclasses ?? []).map((s) => s.id).sort();
      // Pack may ship subclasses for L3+ tier cohorts later; pin
      // the canonical-12 floor, not an exact match.
      for (const id of expectedSubclassIds) {
        expect(actualSubclassIds, `canonical subclass ${id} missing from pack`).toContain(id);
      }
    });
  });

  describe('Section 3: planner presence per L3 feature', () => {
    for (const expectation of PLANNERS) {
      const label = `${expectation.classOrSubclassId} / ${expectation.featureId} → ${expectation.plannerExport}`;
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

  describe('Section 4: empty-content stubs (effects:[] today, content sweep needed)', () => {
    // L3 features whose pack entry currently ships `effects: []`.
    // Pin them so a regression that removes the stub gets noticed; a
    // future content slice replaces the stub with real effects and
    // can either delete the row from this section or convert it to
    // a stronger "has effects" assertion.
    const EMPTY_STUBS: ReadonlyArray<{
      readonly kind: 'class' | 'subclass';
      readonly ownerId: string;
      readonly featureId: string;
      readonly reason: string;
    }> = [
      {
        kind: 'class',
        ownerId: 'barbarian',
        featureId: 'primal-knowledge',
        reason: 'Skill prof picked from the sneak-attack list — needs OfferChoice over the rogue skill subset.',
      },
      {
        kind: 'class',
        ownerId: 'rogue',
        featureId: 'steady-aim',
        reason: 'BA self-advantage; planSteadyAim xfailing in Section 3.',
      },
      {
        kind: 'class',
        ownerId: 'monk',
        featureId: 'deflect-attacks',
        reason: 'Reaction; planDeflectAttacks xfailing in Section 3.',
      },
      {
        kind: 'subclass',
        ownerId: 'circle-of-the-land',
        featureId: 'circle-of-the-land-cantrip',
        reason: 'Bonus druid cantrip pick at L3; needs OfferChoice over druid cantrip list.',
      },
      {
        kind: 'subclass',
        ownerId: 'circle-of-the-land',
        featureId: 'circle-of-the-land-spells',
        reason: 'Land-type expanded spell list (Arctic / Coast / Desert / etc.); needs OfferChoice over land type + GrantSpell per land.',
      },
      {
        kind: 'subclass',
        ownerId: 'hunter',
        featureId: 'hunters-lore',
        reason: 'Favored Enemy lore narrative ability; may be content-only (no planner needed).',
      },
      {
        kind: 'subclass',
        ownerId: 'thief',
        featureId: 'fast-hands',
        reason: 'BA thieves\' tools; planFastHands xfailing in Section 3.',
      },
    ];

    for (const stub of EMPTY_STUBS) {
      it(`${stub.kind} ${stub.ownerId} / ${stub.featureId}: still effects:[] (${stub.reason})`, () => {
        const feature =
          stub.kind === 'class'
            ? findL3ClassFeature(stub.ownerId, stub.featureId)
            : findL3SubclassFeature(stub.ownerId, stub.featureId);
        expect(feature, `${stub.kind} ${stub.ownerId}/${stub.featureId} missing entirely`).toBeDefined();
        const effects = feature!.effects ?? [];
        // When the content sweep lands real effects, this assertion
        // flips inverted (`.toBeGreaterThan(0)`) and the row moves
        // to a separate "wired-with-effects" section. The L3 floor
        // tracks the stub list so the punch list stays visible.
        expect(
          effects.length,
          `${stub.kind} ${stub.ownerId}/${stub.featureId} unexpectedly grew effects — flip this entry to a wired check`,
        ).toBe(0);
      });
    }
  });
});
