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
  { classOrSubclassId: 'thief', featureId: 'fast-hands', plannerExport: 'planFastHands' }, // slice 647
  { classOrSubclassId: 'monk', featureId: 'deflect-attacks', plannerExport: 'planDeflectAttacks' }, // slice 648
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
      // Planner-wired (slices 646-648). Content row intentionally
      // stays effects:[] because the planner is the wiring; the pin
      // catches a regression that adds declarative effects without
      // intent.
      {
        kind: 'class',
        ownerId: 'rogue',
        featureId: 'steady-aim',
        reason: 'BA self-advantage; wired via planSteadyAim (slice 646). Content stays effects:[] intentionally.',
      },
      {
        kind: 'class',
        ownerId: 'monk',
        featureId: 'deflect-attacks',
        reason: 'Reaction reduction; wired via planDeflectAttacks (slice 648). Content stays effects:[] intentionally.',
      },
      {
        kind: 'subclass',
        ownerId: 'thief',
        featureId: 'fast-hands',
        reason: 'BA dispatcher; wired via planFastHands (slice 647). Content stays effects:[] intentionally.',
      },
      // Intentionally narrative (RAW: reveals immunity/resistance info
      // to the player; engine has no shown-information primitive).
      // Stays effects:[] permanently unless a "DM-reveal" primitive
      // lands and the consumer wants the engine to drive it.
      {
        kind: 'subclass',
        ownerId: 'hunter',
        featureId: 'hunters-lore',
        reason: 'Intentionally narrative: RAW reveals immunity/resistance info while Hunter\'s Mark is active. Engine has no shown-information primitive; consumer-side reveal.',
      },
      // (No still-unwired content stubs remain — slice 652 wired
      // circle-of-the-land-spells. If a future cycle introduces a
      // new L3 stub, add it here with its reason.)
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

  describe('Section 5: L3 resource scaffolding (GrantResource max + recharge at L3)', () => {
    // Slice 650: mirrors slice 639/640's L2 resource pin pattern, but
    // for the resources that scale to / come online at L3:
    //   - Barbarian:  rage uses scale to 3 at L3 (per RAW, the
    //                 "rage-uses-3" L3 feature ships a fresh
    //                 GrantResource max:3 that overrides the L1
    //                 max:2 grant).
    //   - Paladin:    Channel Divinity comes online at L3
    //                 (channel-divinity-paladin grants max:2 with
    //                 short-rest recharge — same shape as Cleric's
    //                 L2 grant; the L11 / L17 paladin tier-up grants
    //                 are tracked separately).
    //   - Sorcerer:   Sorcery Points scale to 3 at L3 (the L2 grant
    //                 uses a {kind:'level', classId:'sorcerer'}
    //                 formula; evaluates to 3 at L3).
    //   - Monk:       Focus Points (legacy resourceId 'ki') scale to
    //                 3 at L3 (same level formula on monks-focus at
    //                 L2; evaluates to 3 at L3).
    //
    // Each row: (classId, level-the-grant-lives-at, featureId,
    // resourceId, l3Max, recharge). The pin reads the GrantResource
    // off the grant-owner feature and asserts the L3 evaluation +
    // recharge.
    interface L3ResourceCheck {
      readonly classId: string;
      readonly grantLevel: '1' | '2' | '3';
      readonly featureId: string;
      readonly resourceId: string;
      readonly l3Max: number;
      readonly recharge: 'shortRest' | 'longRest' | 'partialShortFullLong';
    }
    const L3_RESOURCE_CHECKS: ReadonlyArray<L3ResourceCheck> = [
      { classId: 'barbarian', grantLevel: '3', featureId: 'rage-uses-3', resourceId: 'rage', l3Max: 3, recharge: 'longRest' },
      // Slice 657: was 'shortRest' (over-permissive); now uses the
      // RAW-exact 'partialShortFullLong' primitive.
      { classId: 'paladin', grantLevel: '3', featureId: 'channel-divinity-paladin', resourceId: 'channel-divinity', l3Max: 2, recharge: 'partialShortFullLong' },
      { classId: 'sorcerer', grantLevel: '2', featureId: 'font-of-magic', resourceId: 'sorcery-points', l3Max: 3, recharge: 'longRest' },
      { classId: 'monk', grantLevel: '2', featureId: 'monks-focus', resourceId: 'ki', l3Max: 3, recharge: 'shortRest' },
    ];
    for (const check of L3_RESOURCE_CHECKS) {
      it(`${check.classId} / ${check.featureId} (L${check.grantLevel}): GrantResource ${check.resourceId} max evaluates to ${check.l3Max} at L3, recharge = ${check.recharge}`, () => {
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
            classLevels: new Map([[check.classId, 3]]),
            totalLevel: 3,
          });
        } else {
          throw new Error(`${check.classId}/${check.featureId} GrantResource has no max field`);
        }
        expect(
          evaluatedMax,
          `${check.classId}/${check.featureId} L3 max evaluates to ${evaluatedMax}, RAW expects ${check.l3Max}`,
        ).toBe(check.l3Max);
        expect(
          grantResource!.recharge,
          `${check.classId}/${check.featureId} recharge is '${grantResource!.recharge}', expected '${check.recharge}'`,
        ).toBe(check.recharge);
      });
    }
  });

  describe('Section 6: L3 OfferChoice cascade (fresh L3 character emits the right ChoiceRequired)', () => {
    // Slice 653: behavioral tests verifying that the L3 OfferChoices
    // wired in slices 649 + 652 actually fire when a fresh L3
    // character is built and `engine.plan.offerCharacterChoices` is
    // called. Mirror of the L2 floor's Section 4 Wizard Scholar
    // test (slice 633). Three L3 OfferChoices ship today:
    //   - Barbarian L3 Primal Knowledge (6 skill options)
    //   - Druid Circle of the Land L3 Bonus Cantrip (11 cantrip options)
    //   - Druid Circle of the Land L3 Spells (4 land options)
    const buildL3Character = (
      classId: string,
      overrides?: Partial<Character>,
    ): Character =>
      CharacterSchema.parse({
        id: newCharacterId(),
        name: `L3 ${classId}`,
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId, level: 3, hitDiceRemaining: 3 }],
        abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 12, WIS: 12, CHA: 12 },
        hp: { current: 24, max: 24, temp: 0, maxBonus: 0 },
        ...overrides,
      });

    const findChoice = (
      events: ReadonlyArray<unknown>,
      promptKey: string,
    ): ChoiceRequiredEvent | undefined =>
      events.find(
        (e): e is ChoiceRequiredEvent =>
          (e as { type?: string }).type === 'ChoiceRequired' &&
          (e as { promptKey?: string }).promptKey === promptKey,
      );

    it('fresh L3 Barbarian emits Primal Knowledge ChoiceRequired with 6 skill options', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const barb = buildL3Character('barbarian');
      let campaign = engine.createCampaign({ name: 'l3-primal-knowledge' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: barb,
        } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.offerCharacterChoices(campaign.state, {
        characterId: barb.id,
      });
      const choice = findChoice(events, 'barbarian-primal-knowledge');
      expect(choice, 'L3 Barbarian Primal Knowledge did not emit ChoiceRequired').toBeDefined();
      const optionIds = choice?.options.map((o) => o.id).sort();
      expect(optionIds).toEqual([
        'animal-handling',
        'athletics',
        'intimidation',
        'nature',
        'perception',
        'survival',
      ]);
    });

    it('fresh L3 Druid with Circle of the Land emits Bonus Cantrip ChoiceRequired with 11 druid cantrip options', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const druid = buildL3Character('druid', {
        classes: [{ classId: 'druid', level: 3, hitDiceRemaining: 3, subclassId: 'circle-of-the-land' }],
        abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 16, CHA: 10 },
        hp: { current: 22, max: 22, temp: 0, maxBonus: 0 },
      });
      let campaign = engine.createCampaign({ name: 'l3-circle-cantrip' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: druid,
        } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.offerCharacterChoices(campaign.state, {
        characterId: druid.id,
      });
      const choice = findChoice(events, 'circle-of-the-land-cantrip');
      expect(choice, 'L3 Druid Circle Cantrip did not emit ChoiceRequired').toBeDefined();
      expect(choice?.options.length).toBe(11);
    });

    it('fresh L3 Druid with Circle of the Land emits Land-type ChoiceRequired via offerLongRestChoices (slice 660)', () => {
      // Slice 660: Circle of the Land Spells uses when: 'onLongRest'
      // per RAW ("Whenever you finish a Long Rest, choose one type
      // of land"). Surfaces via offerLongRestChoices, not
      // offerCharacterChoices.
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const druid = buildL3Character('druid', {
        classes: [{ classId: 'druid', level: 3, hitDiceRemaining: 3, subclassId: 'circle-of-the-land' }],
        abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 16, CHA: 10 },
        hp: { current: 22, max: 22, temp: 0, maxBonus: 0 },
      });
      let campaign = engine.createCampaign({ name: 'l3-circle-spells' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: druid,
        } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.offerLongRestChoices(campaign.state, {
        characterId: druid.id,
      });
      const choice = findChoice(events, 'circle-of-the-land-type');
      expect(choice, 'L3 Druid Circle Spells did not emit ChoiceRequired').toBeDefined();
      const optionIds = choice?.options.map((o) => o.id).sort();
      expect(optionIds).toEqual(['arid', 'polar', 'temperate', 'tropical']);
    });
  });

  describe('Section 7: subclass L3 spell-list scaffolding (RAW match)', () => {
    // Slice 655: pin the exact L3 spell list each "domain-spells"-style
    // subclass feature ships. RAW per SRD 5.2.1 (verified inline). The
    // 5th subclass with an L3 spell list — Druid Circle of the Land —
    // ships an OfferChoice over 4 land types (not a fixed list) and is
    // pinned by slice 653's Section 6 OfferChoice cascade tests; not
    // re-pinned here.
    interface L3SubclassSpellList {
      readonly subclassId: string;
      readonly featureId: string;
      readonly expectedSpellIds: ReadonlyArray<string>;
    }
    const L3_SUBCLASS_SPELL_LISTS: ReadonlyArray<L3SubclassSpellList> = [
      {
        subclassId: 'life-domain',
        featureId: 'life-domain-spells',
        expectedSpellIds: ['aid', 'bless', 'cure-wounds', 'lesser-restoration'],
      },
      {
        subclassId: 'oath-of-devotion',
        featureId: 'devotion-spells',
        expectedSpellIds: ['protection-from-evil-and-good', 'shield-of-faith'],
      },
      {
        subclassId: 'fiend-patron',
        featureId: 'fiend-spells',
        expectedSpellIds: ['burning-hands', 'command', 'scorching-ray', 'suggestion'],
      },
      {
        subclassId: 'draconic-sorcery',
        featureId: 'draconic-spells',
        expectedSpellIds: ['alter-self', 'chromatic-orb', 'command', 'dragons-breath'],
      },
    ];
    for (const check of L3_SUBCLASS_SPELL_LISTS) {
      it(`${check.subclassId} / ${check.featureId} ships the RAW L3 spell list`, () => {
        const feature = findL3SubclassFeature(check.subclassId, check.featureId) as
          | { effects?: ReadonlyArray<{ kind: string; spellId?: string; preparation?: string }> }
          | undefined;
        expect(feature, `${check.subclassId}/${check.featureId} missing`).toBeDefined();
        const grants = (feature!.effects ?? []).filter((e) => e.kind === 'GrantSpell');
        const actualSpellIds = grants.map((g) => g.spellId!).sort();
        const expected = [...check.expectedSpellIds].sort();
        expect(
          actualSpellIds,
          `${check.subclassId}/${check.featureId} spell list drift: got ${JSON.stringify(actualSpellIds)}, RAW expects ${JSON.stringify(expected)}`,
        ).toEqual(expected);
        // Pin preparation: 'always-prepared' per RAW ("you always
        // have these spells prepared"). A regression that uses
        // 'prepared' or 'known' would change the slot economy.
        for (const g of grants) {
          expect(
            g.preparation,
            `${check.subclassId}/${check.featureId} ${g.spellId} preparation is '${g.preparation}', RAW expects 'always-prepared'`,
          ).toBe('always-prepared');
        }
        // Pin that each granted spell actually exists in the pack
        // (defensive: a grant pointing at a missing spell would be a
        // silent content bug otherwise).
        for (const spellId of actualSpellIds) {
          const spell = PACK.spells?.find((s) => s.id === spellId);
          expect(spell, `${check.subclassId}/${check.featureId} grants missing spell '${spellId}'`).toBeDefined();
        }
      });
    }
  });
});
