import { z } from 'zod';
import {
  AbilityScoreSchema,
  AbilityScoresSchema,
  CharacterLevelSchema,
  DamageTypeSchema,
  ExhaustionLevelSchema,
  RechargeSchema,
  SizeSchema,
  ULIDSchema,
} from '../primitives.js';

export const ResourceStateSchema = z.object({
  resourceId: z.string(),
  current: z.number().int().min(0),
  max: z.number().int().min(0),
  // Slice 657: runtime recharge cadence for this resource. Default
  // 'longRest' is over-conservative for back-compat: old characters
  // without this field continue to recharge only on long rest (which
  // was the engine's pre-657 behavior since applyShortRestEnded
  // didn't touch resources). Consumers that want RAW short-rest
  // recharge for a resource (Action Surge, Channel Divinity, Ki,
  // Second Wind, etc.) opt in by setting `recharge: 'shortRest'`.
  // applyShortRestEnded honors this field as of slice 657.
  recharge: RechargeSchema.optional(),
});
export type ResourceState = z.infer<typeof ResourceStateSchema>;

export const AppliedConditionSchema = z.object({
  id: ULIDSchema,
  conditionId: z.string(),
  sourceEventId: ULIDSchema.optional(),
  // RAW PHB Appendix "Conditions" — several conditions (Frightened,
  // Charmed) are sourced by a specific creature, and constrain the
  // affected creature's actions w.r.t. that source ("can't willingly
  // move closer to the source", "can't attack the charmer"). When the
  // condition has such a source, store it here so planners can enforce
  // the restriction. Unsourced conditions (Prone, Poisoned, etc.)
  // leave this undefined.
  sourceCharacterId: ULIDSchema.optional(),
  level: z.number().int().min(1).optional(),
  expiresOnRound: z.number().int().optional(),
  // Which turn-boundary the `expiresOnRound` check fires on.
  // 'turnStart' (default, used by slice-102 trigger-applied conditions
  // like Spirit Shroud's heal-block) lifts the condition at the start
  // of the source's turn in the target round. 'turnEnd' (slice 109,
  // for Blade Ward's "1 round" self-buff) lifts at the end of the
  // source's turn in the target round. Stamped from the condition
  // definition's `autoExpiry.trigger` at apply time when the source
  // planner is inside an active encounter.
  expiryTrigger: z.enum(['turnStart', 'turnEnd']).optional(),
  // The hpMax-modifier delta this applied condition contributed to
  // the character's `hp.maxBonus`. Stored here so removal (via
  // ConditionRemoved or ConcentrationBroken) can reverse exactly the
  // same delta without re-running content lookups from the reducer.
  hpMaxBonusDelta: z.number().int().optional(),
  // Set on conditions applied transitively by an OnEvent rider that
  // lives inside a parent concentration effect (Holy Aura's blinded
  // rider, Spirit Shroud's heal-block rider). Points at the parent
  // concentration's EffectInstance id so `clearConcentrationEffect`
  // can sweep these out when concentration ends. Unset for direct
  // cast-time applications (those are tracked via
  // `EffectInstance.conditionsApplied` instead) and for riders
  // applied by non-concentration sources (class features, magic items).
  sourceEffectInstanceId: ULIDSchema.optional(),
  // Per-instance fixed-DC recurring save (slice 388). Stamped from the
  // ConditionApplied event when a non-spell source (Cunning Strike Poison
  // / Knock Out) wants the bearer to repeat a save at the end of each of
  // its turns to shake the condition. `planTickRecurringSave` uses these
  // instead of the condition definition's `recurringSave` + a spell DC.
  recurringSaveDC: z.number().int().optional(),
  recurringSaveAbility: AbilityScoreSchema.optional(),
  // Per-instance override for this condition's OnEvent AddDamage rider
  // dice (slice 390). Absorb Elements bakes `${slotLevel}d6` here so the
  // next-hit bonus scales with the slot it was cast at.
  riderDamageDice: z.string().optional(),
  // Per-instance "ends if the bearer takes any damage" (slice 391). Set by
  // Sleep / Knock Out (which apply base `unconscious`); the damage
  // chokepoint removes the condition when the bearer takes positive damage.
  endsOnDamage: z.boolean().optional(),
});
export type AppliedCondition = z.infer<typeof AppliedConditionSchema>;

export const HPSchema = z.object({
  current: z.number().int(),
  max: z.number().int().min(1),
  temp: z.number().int().min(0).default(0),
  // Running sum of `AddModifier { target: 'hpMax' }` effects from
  // active conditions (Aid, Aspect of the Beast, etc.). The damage
  // reducer reads `max + maxBonus` when checking the massive-damage
  // threshold, so a low-HP character buffed by Aid is correctly
  // harder to instakill. The buff/remove-buff planners maintain this
  // value via `HPMaxBonusChanged` events.
  maxBonus: z.number().int().default(0),
});
export type HP = z.infer<typeof HPSchema>;

export const DeathSavesSchema = z.object({
  successes: z.number().int().min(0).max(3).default(0),
  failures: z.number().int().min(0).max(3).default(0),
  stable: z.boolean().default(false),
});
export type DeathSaves = z.infer<typeof DeathSavesSchema>;

export const ClassEnrollmentSchema = z.object({
  classId: z.string(),
  subclassId: z.string().optional(),
  level: CharacterLevelSchema,
  hitDiceRemaining: z.number().int().min(0),
});
export type ClassEnrollment = z.infer<typeof ClassEnrollmentSchema>;

export const CHARACTER_KINDS = ['pc', 'npc', 'creature'] as const;
export const CharacterKindSchema = z.enum(CHARACTER_KINDS);
export type CharacterKind = z.infer<typeof CharacterKindSchema>;

export const MultiattackPatternSchema = z.object({
  name: z.string(),
  attacks: z.array(
    z.object({
      weaponInstanceId: ULIDSchema,
      count: z.number().int().min(1),
    }),
  ).min(1),
});
export type MultiattackPattern = z.infer<typeof MultiattackPatternSchema>;

export const CharacterSchema = z.object({
  id: ULIDSchema,
  kind: CharacterKindSchema.default('pc'),
  statblockId: z.string().optional(),
  multiattack: MultiattackPatternSchema.optional(),
  name: z.string().min(1),
  playerId: z.string().optional(),
  speciesId: z.string(),
  // Slice 560: optional size override for species that offer a size
  // choice at character creation (RAW Human / Tiefling are Medium or
  // Small). When set, `creatureSize` returns this in preference to
  // the species's base size. Additive + defaulted to undefined, so
  // old saves load unchanged and characters without a choice fall
  // back to species size as before.
  sizeOverride: SizeSchema.optional(),
  backgroundId: z.string(),
  classes: z.array(ClassEnrollmentSchema).min(1),
  abilityScores: AbilityScoresSchema,
  // Slice 793: the 2024 background ability-score increase — which abilities
  // receive the +2/+1 (or +1/+1/+1) from the character's background. When
  // present, the engine applies it on top of `abilityScores` (composed via
  // effectiveAbilityScoreIncrease, capped at 20), so `abilityScores` are the
  // BASE (pre-background) scores and every derivation — sheet, saves, checks,
  // attacks, AC, spell DC — reflects the increase. Optional + opt-in for
  // backward compatibility: a character without it gets no increase, so the
  // existing "consumer supplies final scores" callers are byte-unchanged.
  // Validate the allocation against the background's `abilityScoreIncreases`
  // (`options` / `pattern`) with `validateBackgroundAbilityIncrease`.
  backgroundAbilityIncrease: z.record(AbilityScoreSchema, z.number().int().min(1).max(2)).optional(),
  hp: HPSchema,
  deathSaves: DeathSavesSchema.default({ successes: 0, failures: 0, stable: false }),
  exhaustion: ExhaustionLevelSchema.default(0),
  // Slice 542: Heroic Inspiration (RAW: "You can have only one
  // Heroic Inspiration at a time"). Boolean rather than count.
  // Granted on Long Rest by features with the GrantHeroic
  // InspirationOnLongRest marker (Human Resourceful, etc.); spent
  // via planConsumeHeroicInspiration. Additive default; old saves
  // load clean.
  heroicInspiration: z.boolean().default(false),
  // Optional explicit walk-speed override. When set (transformations,
  // summons, a consumer pinning a custom value), it wins. When absent,
  // the walk speed derives from the species' / statblock's walk speed
  // (slice 426 fix: a Goliath now reports 35, not the old default 30).
  speedFeet: z.number().int().min(0).optional(),
  // Optional natural-armor AC. When set, computeAC uses this in place of
  // the armor + DEX computation. Intended for creatures whose AC comes
  // from a statblock (hide, scales, plate-skin) rather than worn armor.
  // PCs leave it undefined.
  armorClass: z.number().int().min(0).optional(),
  inventory: z.array(ULIDSchema).default([]),
  equipped: z
    .object({
      mainHand: ULIDSchema.optional(),
      offHand: ULIDSchema.optional(),
      armor: ULIDSchema.optional(),
      shield: ULIDSchema.optional(),
      attuned: z.array(ULIDSchema).max(3).default([]),
    })
    .default({ attuned: [] }),
  resources: z.array(ResourceStateSchema).default([]),
  appliedConditions: z.array(AppliedConditionSchema).default([]),
  knownSpells: z.array(z.string()).default([]),
  preparedSpells: z.array(z.string()).default([]),
  spellSlotsUsed: z
    .record(
      z.string().regex(/^[1-9]$/, 'Slot level keys must be 1..9'),
      z.number().int().min(0),
    )
    .default({}),
  pactSlotsUsed: z.number().int().min(0).default(0),
  // Slice 486: tracks which `oncePerLongRest`-granted spell IDs have
  // consumed their free cast since the last long rest. Magic Initiate
  // (Cleric / Wizard / Druid), Warlock Contact Patron, and any other
  // feature that GrantSpell-with-`oncePerLongRest` populates this when
  // the consumer passes `useFreeCast: true` on the cast intent. Cleared
  // by `applyLongRestEnded`. Empty by default; pre-slice-486 saves load
  // clean.
  usedFreeCastSpellIds: z.array(z.string()).default([]),
  // Slice 794: per-spell cast counts consumed since the last long rest
  // for `GrantSpell { preparation: 'perLongRest' }` grants — the SRD
  // 5.2.1 NPC "N/Day Each" usage buckets (Mage Fireball 2/Day, etc.).
  // Keyed by spellId → times cast. The cast gate allows a cast while the
  // count is below the grant's `usesPerLongRest`; `PerDayCastUsed`
  // increments it; `applyLongRestEnded` clears it. A count generalizes
  // the boolean `usedFreeCastSpellIds` (which stays the 1/long-rest PC
  // free-cast path). Empty by default; pre-slice-794 saves load clean.
  perDayCastsUsed: z.record(z.string(), z.number().int().min(0)).default({}),
  // Slice 502: the weapon definition ids this character has chosen for
  // the 2024 Weapon Mastery feature (Fighter 3, Barbarian / Paladin /
  // Ranger / Rogue 2). A weapon's mastery property applies only when its
  // id is in this list AND the character is proficient with it (see
  // `canUseWeaponMastery`). Populated via `planChooseWeaponMasteries`,
  // re-choosable on a Long Rest (consumer-managed timing). Empty by
  // default; pre-slice-502 saves load clean.
  weaponMasteries: z.array(z.string()).default([]),
  concentrationEffectId: ULIDSchema.optional(),
  triggerCounters: z
    .record(
      z.string(),
      z.object({
        firedThisTurn: z.boolean().optional(),
        firedThisRound: z.boolean().optional(),
        firedThisShortRest: z.boolean().optional(),
        firedThisLongRest: z.boolean().optional(),
      }),
    )
    .default({}),
  featsTaken: z.array(z.string()).default([]),
  pendingChoiceIds: z.array(ULIDSchema).default([]),
  // Slice 140: tracks whether the bearer's `MonsterStatblock.breath
  // Weapon` action is currently expended. Cleared at turn-start when
  // a d6 recharge roll meets the breathWeapon.rechargeMin threshold;
  // set true after planBreathWeapon emits the fire chain. Defaults
  // false (action available). Persists across encounters per RAW
  // (recharge resolves by die roll, not by rest).
  breathWeaponExpended: z.boolean().default(false),
  // Slice 232: damage types taken since the bearer's last turn-start.
  // Populated by the damage reducer (deduped append per DamageApplied).
  // Consumed by the turn-start Regeneration hook: at the start of the
  // bearer's turn, compare these types against the bearer's Regeneration
  // suppressedBy lists; if no match, emit a Healed for perTurn. Cleared
  // at turn-start regardless of outcome. The reducer can populate this
  // without content; the suppression check sits in the planner where
  // the effect stack is already built.
  damageTypesTakenThisTurn: z.array(DamageTypeSchema).default([]),
  // Hero Points pool (DMG 2024 variant rule, gated by
  // `CampaignSettings.heroPoints`). Each character starts with
  // `5 + 1 per level above 1`. Spent for a 1d6 bonus on an attack /
  // save / ability check, or to spend one to stabilize when downed.
  // The engine tracks the integer here; planSpendHeroPoint enforces
  // availability + rolls the d6.
  heroPoints: z.number().int().min(0).default(0),
  xp: z.number().int().min(0).default(0),
  mountedOnId: ULIDSchema.optional(),
  attitude: z.enum(['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful']).optional(),
  morale: z
    .object({
      current: z.number().int(),
      max: z.number().int().min(1),
    })
    .optional(),
  moraleBroken: z.boolean().default(false),
  polymorphedSnapshot: z
    .object({
      hp: z.object({
        current: z.number().int(),
        max: z.number().int().min(1),
        temp: z.number().int().min(0).default(0),
        maxBonus: z.number().int().default(0),
      }),
      abilityScores: AbilityScoresSchema,
      speedFeet: z.number().int().min(0).optional(),
      speciesId: z.string(),
      kind: z.enum(['polymorph', 'wild-shape', 'true-polymorph']),
      formName: z.string(),
      armorClass: z.number().int().min(0).optional(),
    })
    .optional(),
  // Set on characters that exist because a summon spell created them
  // (Find Familiar, Conjure Animals, Summon Beast, etc). The controller
  // is the caster. The effectInstanceId, when present, ties the
  // companion to a concentration effect; when that effect's
  // concentration ends, `clearConcentrationEffect` removes the
  // companion from state.characters along with the conditions the
  // effect applied. Unset on PCs / NPCs / non-summon creatures.
  summonSource: z
    .object({
      controllerId: ULIDSchema,
      spellId: z.string(),
      slotLevel: z.number().int().min(1).max(9),
      effectInstanceId: ULIDSchema.optional(),
    })
    .optional(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const computeTotalLevel = (character: Character): number =>
  character.classes.reduce((acc, enrollment) => acc + enrollment.level, 0);
