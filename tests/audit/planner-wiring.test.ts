// Planner-wiring audit.
//
// Slice 364. A new planner is wired across ~6 sites (plan/index.ts export,
// engine/index.ts import + Engine.plan interface method + impl, the
// conveniences.ts performIntent dispatch, and apply.ts if it emits new
// events). tsc catches a missing export / import / interface / impl, and
// apply.ts is exhaustive over the event union. The one site tsc does NOT
// guard is the performIntent dispatch: that map is a plain
// `Record<string, ...>`, so a player-action planner can be added
// everywhere else yet silently omitted from dispatch (then
// `performIntent({ type: 'NewThing' })` throws "Unknown intent type" only
// when a consumer happens to call it).
//
// This audit closes that gap with the allowlist pattern (same shape as
// pack-integrity's EFFECT_LESS_OK): every method on `engine.plan` must be
// either (a) routed by the performIntent dispatch, or (b) on the
// EXCLUDED_FROM_DISPATCH allowlist of planners that are intentionally
// invoked directly (reactions, per-moment ticks, encounter lifecycle,
// transformations, sensor/illusion management, item-use, and special-cast
// planners that don't fit the intent -> events -> commit shape). Adding a
// new planner now forces a conscious choice: dispatch it, or allowlist it.
//
// When this audit fails:
//   - "not routed and not allowlisted": you added a planner. If it's a
//     player action, add a performIntent dispatch entry in conveniences.ts.
//     If it's a reaction / tick / lifecycle / special planner, add it to
//     EXCLUDED_FROM_DISPATCH below with its category.
//   - "dispatch target is not a planner" / "allowlist entry is not a
//     planner": a planner was renamed or removed; update the stale
//     reference here / in conveniences.ts.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../../src/engine/index.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { seededRNG } from '../../src/rng/seeded.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const engine = createEngine({ contentPacks: [loadStarterPack()], rng: seededRNG(1) });
const PLAN = engine.plan as unknown as Record<string, unknown>;
const planners = new Set(
  Object.keys(PLAN).filter((k) => typeof PLAN[k] === 'function'),
);

// The performIntent dispatch targets, parsed from the canonical
// `plan.X(state, i)` shape of the `planIntent` table in conveniences.ts
// (slice 714 extracted the table from performIntent into planIntent, which
// performIntent and engine.plan.useOption now share).
const dispatchTargets = new Set(
  [
    ...readFileSync(resolve(REPO_ROOT, 'src/engine/conveniences.ts'), 'utf8').matchAll(
      /\bplan\.(\w+)\(state\b/g,
    ),
  ].map((m) => m[1]!),
);

// Planners intentionally NOT routed through performIntent. They are
// invoked directly by the consumer (reactions, ticks, lifecycle) or take a
// shape that doesn't fit the intent -> events -> commit convenience.
// Grouped by why; membership is what the audit checks, the grouping is
// documentation. Add a new entry here ONLY for a planner that genuinely
// shouldn't be a performIntent player-action.
const EXCLUDED_FROM_DISPATCH: ReadonlySet<string> = new Set([
  // Consumer-extensible plugin seam (dispatches to a registered action
  // handler by id; not a fixed intent type). See docs/plugin-api-design.md.
  'custom',
  // Encounter lifecycle (sequenced by the consumer, not a single intent):
  'createEncounter', 'rollInitiative', 'swapInitiative', 'startEncounter', 'beginFirstTurn', 'advanceTurn', 'endEncounter',
  // Slice 683: mid-encounter placement (summons, teleports). Consumer
  // invokes when placing a previously-positionless combatant or
  // teleporting one to a new cell.
  'placeCombatant',
  // Reactions / triggered planners (called after observing a trigger event;
  // several return a derived outcome the consumer branches on):
  'dodge', 'shield', 'sanctuaryWardSave', 'protection', 'consumeGuidance',
  'consumeResistance', 'cuttingWords', 'uncannyDodge', 'superiorDefense', 'paladinsSmite', 'breathWeapon',
  // Slice 648: Monk L3 Deflect Attacks. Reaction-style planner that
  // returns DeflectAttacksOutcome (reduction + remainingDamage) the
  // consumer subtracts from a pending DamageApplied. Consumer
  // invokes after observing an AttackRolled hit + DamageRolled.
  'deflectAttacks',
  // Slice 558: Stone's Endurance is a reaction-style planner; returns
  // StonesEnduranceOutcome the consumer branches on (mirror of
  // uncannyDodge). Consumer invokes it after observing a DamageApplied
  // event on a Goliath with Stone's Endurance ancestry.
  'stonesEndurance',
  // Slice 559: Storm's Thunder is the sibling reaction; returns
  // StormsThunderOutcome with the thunder damage dealt to the attacker.
  'stormsThunder',
  // Slice 730: Dark One's Own Luck (Fiend L6) — returns a
  // DarkOnesOwnLuckOutcome { events, d10 } the consumer folds into the
  // augmented ability check / saving throw (Hero Points shape).
  'darkOnesOwnLuck',
  // Per-moment ticks / duration sweeps (called at turn boundaries / on movement):
  'expireSpellDurations', 'tickAura', 'tickMovementDamage', 'tickRecurring', 'tickRecurringSave', 'tickRecurringDamage', 'triggerTrap',
  // Stirge Blood Drain (slice 490): drain fires at the stirge's turn-start
  // (consumer-driven, mirrors tickRecurringSave); detachStirge is an
  // action invoked by the target or an adjacent ally to remove the
  // attachment.
  'stirgeDrain', 'detachStirge',
  // Special-cast / placed-entity / multi-arg spell planners (and the Dryad's
  // Tree Stride monster teleport ability, slice 820 — consumer-orchestrated
  // like mistyStep, not its own dispatched intent):
  'magicWeapon', 'removeCurse', 'mistyStep', 'thunderStep', 'dimensionDoor', 'treeStride',
  'silentImage', 'majorImage', 'clairvoyance', 'scrying', 'arcaneEye', 'divineIntervention',
  // Slice 762: innateSorcery moved to the performIntent dispatch (it's now a
  // bonusActions menu option routed via useOption), so it's no longer here.
  'selfRestoration',
  // Sensor / illusion management:
  'switchSensorMode', 'moveSensor', 'removeSensor', 'investigateIllusion', 'dismissIllusion',
  // Transformations (code-handler escape hatch shape):
  'polymorph', 'wildShape', 'simulacrum', 'wish',
  // Summons:
  'dismissCompanion',
  // Items / inventory:
  'equip', 'useItem', 'consumeItem',
  // Hero points:
  'grantInitialHeroPoints', 'spendHeroPoint',
  // Travel / rest / resurrection / attack follow-ups:
  'rest', 'forcedMarch', 'resurrect', 'cleave',
  // Slice 754: the two-phase attack sub-planners. `attack` (bundled) is the
  // dispatched player action; attackRoll/attackDamage are the consumer-
  // orchestrated halves (roll -> reaction window -> damage), invoked
  // directly, not as their own intent types.
  'attackRoll', 'attackDamage',
  // Slice 618: post-CharacterCreated choice cascade — consumer invokes
  // after committing CharacterCreated to drain L1 OfferChoice entries
  // (Fighter Fighting Style, future L1 origin-feat picks). Not a player
  // action and not part of the action-economy dispatch.
  'offerCharacterChoices',
  // Slice 660: post-LongRestEnded choice cascade — consumer invokes
  // after committing LongRestEnded to surface onLongRest OfferChoice
  // entries (Druid Circle of the Land's per-rest land pick). Sibling
  // of offerCharacterChoices.
  'offerLongRestChoices',
  // Slice 714: generic bonus-action executor — maps a query.bonusActions
  // option id to its own planner and routes it through the shared
  // planIntent table. It IS the dispatcher, not a routed intent.
  'useOption',
  // Slice 764: generic action executor — the actionOptions sibling of
  // useOption. Also a dispatcher, not a routed intent.
  'useActionOption',
]);

describe('planner-wiring audit: every engine.plan method is dispatch-routed or allowlisted', () => {
  it('no planner is silently missing from both the performIntent dispatch and the excluded allowlist', () => {
    const unaccounted = [...planners]
      .filter((p) => !dispatchTargets.has(p) && !EXCLUDED_FROM_DISPATCH.has(p))
      .sort();
    expect(
      unaccounted,
      `these engine.plan methods are neither in the performIntent dispatch nor allowlisted: ${JSON.stringify(unaccounted)}. If it is a player action, add a dispatch entry in conveniences.ts; otherwise add it to EXCLUDED_FROM_DISPATCH with its category.`,
    ).toEqual([]);
  });

  it('every performIntent dispatch target is a real engine.plan method', () => {
    const stale = [...dispatchTargets].filter((d) => !planners.has(d)).sort();
    expect(
      stale,
      `performIntent dispatches to non-existent planners (renamed/removed?): ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });

  it('the excluded allowlist stays accurate (every entry is a real engine.plan method)', () => {
    const stale = [...EXCLUDED_FROM_DISPATCH].filter((p) => !planners.has(p)).sort();
    expect(
      stale,
      `EXCLUDED_FROM_DISPATCH entries that are no longer engine.plan methods (remove them): ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });

  it('a dispatch target and the excluded allowlist never overlap', () => {
    const overlap = [...dispatchTargets].filter((d) => EXCLUDED_FROM_DISPATCH.has(d)).sort();
    expect(
      overlap,
      `planners both dispatched and allowlisted-as-excluded (pick one): ${JSON.stringify(overlap)}`,
    ).toEqual([]);
  });
});
