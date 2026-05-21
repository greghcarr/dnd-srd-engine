import { z } from 'zod';
import {
  AbilityScoreSchema,
  type AbilityScore,
  DamageTypeSchema,
  type DamageType,
  DiceExpressionSchema,
  type DiceExpression,
  MovementModeSchema,
  type MovementMode,
  ProficiencyLevelSchema,
  type ProficiencyLevel,
  RechargeSchema,
  type Recharge,
  SenseSchema,
  type Sense,
  SkillSchema,
  type Skill,
  SpellLevelSchema,
  type SpellLevel,
  WeaponMasterySchema,
  type WeaponMastery,
} from './primitives.js';
import { FormulaSchema, type Formula } from './formula.js';
import { PredicateSchema, type Predicate } from './predicate.js';

export type ModifierTarget =
  | 'ac'
  | 'attack'
  | 'damage'
  | 'initiative'
  | 'spellAttack'
  | 'spellSaveDC'
  | 'hpMax'
  | 'speed'
  | 'passivePerception'
  // Slice 299: `ability` made optional on `save` and `check` (mirror
  // of slice-266 RollTarget wildcard). Canonical user: Stone of Good
  // Luck ("+1 to ability checks and saving throws") wires as two
  // entries (`{save}` + `{check}`) instead of 12 per-ability entries.
  // Sibling cleanups: Cloak/Ring of Protection (6 → 1), blessed /
  // baned / aura-of-protection-active (6 → 1).
  | { kind: 'save'; ability?: AbilityScore }
  | { kind: 'check'; ability?: AbilityScore }
  | { kind: 'skill'; skill: Skill };

export const ModifierTargetSchema: z.ZodType<ModifierTarget> = z.union([
  z.literal('ac'),
  z.literal('attack'),
  z.literal('damage'),
  z.literal('initiative'),
  z.literal('spellAttack'),
  z.literal('spellSaveDC'),
  z.literal('hpMax'),
  z.literal('speed'),
  z.literal('passivePerception'),
  z.object({ kind: z.literal('save'), ability: AbilityScoreSchema.optional() }),
  z.object({ kind: z.literal('check'), ability: AbilityScoreSchema.optional() }),
  z.object({ kind: z.literal('skill'), skill: SkillSchema }),
]);

// Slice 266: `ability` made optional on `save` and `check` so a
// single entry can target "any save" or "any check" (the wildcard).
// Canonical users: poisoned (disadvantage on any check); Mantle of
// Spell Resistance (advantage on any save vs spells). Without the
// wildcard, both needed 6 per-ability entries. The accumulator's
// `advantageFor(target, facts?)` merges wildcard entries with any
// specific-ability query: `advantageFor({kind:'save', ability:'WIS'})`
// picks up both `save:WIS` AND `save:*` entries.
export type RollTarget =
  | 'attack'
  | 'damage'
  | 'initiative'
  | { kind: 'save'; ability?: AbilityScore }
  | { kind: 'check'; ability?: AbilityScore }
  | { kind: 'skill'; skill: Skill };

export const RollTargetSchema: z.ZodType<RollTarget> = z.union([
  z.literal('attack'),
  z.literal('damage'),
  z.literal('initiative'),
  z.object({ kind: z.literal('save'), ability: AbilityScoreSchema.optional() }),
  z.object({ kind: z.literal('check'), ability: AbilityScoreSchema.optional() }),
  z.object({ kind: z.literal('skill'), skill: SkillSchema }),
]);

export type TriggerAction =
  | { kind: 'AddDamage'; dice: DiceExpression; damageType: DamageType }
  // Retaliation variant of AddDamage: emits damage to the attacker of
  // the triggering event instead of the target. Used by Fire Shield's
  // "creature that hits you takes 2d8" rider; the same shape will fit
  // Armor of Agathys (cold retaliation while temp HP > 0) once the
  // bearer-state predicate to gate on temp HP exists. Only fires
  // against AttackRolled triggers (the only event with an attackerId).
  | { kind: 'AddDamageToAttacker'; dice: DiceExpression; damageType: DamageType }
  | { kind: 'Heal'; amount: number | Formula }
  // Slice 349. Grants Temporary Hit Points to the rider's bearer (not
  // the triggering event's target). `amount` is resolved against the
  // bearer's formula context, so it can scale with the bearer's level
  // and ability modifiers. Canonical user: Warlock Fiend Patron's Dark
  // One's Blessing (temp HP = CHA mod + Warlock level, min 1, when the
  // bearer reduces an enemy to 0 HP). Emits a TempHPGranted event,
  // which uses max-not-additive temp-HP semantics (slice 75).
  | { kind: 'GrantTempHP'; amount: number | Formula }
  | { kind: 'ApplyCondition'; conditionId: string; durationRounds?: number }
  // Retaliation variant of ApplyCondition: stamps the condition on
  // the attacker of the triggering event instead of the target. Used
  // by Holy Aura's RAW "fiend or undead that hits you is blinded
  // until the spell ends" rider. Only fires against AttackRolled
  // triggers (the only event with an attackerId). When `durationRounds`
  // is omitted the condition sticks until consumer removes it; when
  // set, slice 102's auto-expiry lifts it at the start of the bearer's
  // turn in the target round.
  //
  // When `sourceFromEventTarget` is true, the emitted ConditionApplied's
  // `sourceCharacterId` is set to the triggering event's `targetId`
  // instead of the rider's bearer. Used by Fighter Studied Attacks
  // (L13): on a miss, the fighter applies a self-condition keyed
  // against the missed creature so SetAdvantageVsSource grants
  // advantage on the fighter's next attack against that same target.
  | { kind: 'ApplyConditionToAttacker'; conditionId: string; durationRounds?: number; sourceFromEventTarget?: boolean }
  | { kind: 'SpendResource'; resourceId: string; amount: number }
  | { kind: 'ModifyDamageTaken'; amount: number | Formula; cap?: number }
  // Slice 233. Spawns a new Character instance from a content
  // statblock when an OnEvent rider fires. Canonical user: Troll's
  // Loathsome Limbs (on slashing damage, spawns a Troll Limb). The
  // statblockId references a monster in the resolved content; the
  // dispatch helper builds a Character from that statblock (HP =
  // statblock average, ability scores + senses + traits copied) and
  // emits a CharacterCreated event for the spawn. Position is
  // narrative (engine doesn't model space). `count` defaults to 1
  // when omitted.
  | { kind: 'SpawnCreature'; statblockId: string; count?: number }
  | { kind: 'EmitEvent'; eventType: string; payload?: unknown };

export const TriggerActionSchema: z.ZodType<TriggerAction> = z.union([
  z.object({
    kind: z.literal('AddDamage'),
    dice: DiceExpressionSchema,
    damageType: DamageTypeSchema,
  }),
  z.object({
    kind: z.literal('AddDamageToAttacker'),
    dice: DiceExpressionSchema,
    damageType: DamageTypeSchema,
  }),
  z.object({
    kind: z.literal('Heal'),
    amount: z.union([z.number(), FormulaSchema]),
  }),
  z.object({
    kind: z.literal('GrantTempHP'),
    amount: z.union([z.number(), FormulaSchema]),
  }),
  z.object({
    kind: z.literal('ApplyCondition'),
    conditionId: z.string(),
    durationRounds: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('ApplyConditionToAttacker'),
    conditionId: z.string(),
    durationRounds: z.number().int().optional(),
    sourceFromEventTarget: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('SpendResource'),
    resourceId: z.string(),
    amount: z.number().int().min(1),
  }),
  z.object({
    kind: z.literal('ModifyDamageTaken'),
    amount: z.union([z.number(), FormulaSchema]),
    cap: z.number().optional(),
  }),
  z.object({
    kind: z.literal('SpawnCreature'),
    statblockId: z.string(),
    count: z.number().int().min(1).optional(),
  }),
  z.object({
    kind: z.literal('EmitEvent'),
    eventType: z.string(),
    payload: z.unknown().optional(),
  }),
]);

export interface ChoiceOptionShape {
  id: string;
  label: string;
  effects: Effect[];
}

export type Effect =
  | { kind: 'GrantProficiency'; target: 'skill' | 'tool' | 'weapon' | 'armor' | 'save' | 'language'; id: string; level: ProficiencyLevel }
  | { kind: 'GrantSense'; sense: Sense; range: number }
  | { kind: 'ModifySpeed'; mode: MovementMode; op: 'set' | 'add' | 'multiply' | 'matchWalkSpeed'; value: number }
  | { kind: 'AddModifier'; target: ModifierTarget; value: number | Formula; condition?: Predicate }
  // Slice 330: a bonus die rolled fresh on each affected roll (RAW
  // "add 1d4 to the attack roll or save", Bless / Bane / Guidance /
  // Resistance / Bardic Inspiration). Distinct from AddModifier's
  // static `value`: the die is rolled in the planner (RNG only lives
  // there) and baked into the emitted roll event, so apply() stays
  // RNG-free. `subtract` flips the sign (Bane). `target` reuses the
  // ModifierTarget vocabulary (attack / { kind: 'save' } / { kind:
  // 'check' } and their per-ability/skill forms).
  | { kind: 'AddBonusDie'; target: ModifierTarget; dice: DiceExpression; subtract?: boolean; condition?: Predicate }
  | { kind: 'SetAdvantage'; on: RollTarget; mode: 'advantage' | 'disadvantage' | 'auto-crit' | 'auto-fail'; condition?: Predicate }
  // Direction-filtered advantage: only applies when the roll's target
  // (e.g. the attack's target creature) equals the bearing applied
  // condition's `sourceCharacterId`. Used by Bestow Curse's "Disadvantage
  // on attack rolls against the caster" variant. Has no effect when the
  // bearing condition has no `sourceCharacterId` (the planner stamps
  // this on spell-applied conditions since slice 88).
  | { kind: 'SetAdvantageVsSource'; on: RollTarget; mode: 'advantage' | 'disadvantage' | 'auto-crit' | 'auto-fail' }
  // Slice 231. Mirror of SetAdvantageVsSource but lives on the
  // attacker (not on a condition on the target). The bearer of this
  // effect has advantage / disadvantage on rolls of `on` whenever
  // the roll's counterparty (e.g. the attack target) carries an
  // active condition with id `conditionId` whose `sourceCharacterId`
  // matches the bearer. Canonical user: Ranger L17 Precise Hunter
  // ("while your Hunter's Mark spell is on a creature, you have
  // Advantage on attack rolls against that creature"). 3-way join:
  // bearer has the marker, target has the named condition, condition's
  // source is the bearer.
  | { kind: 'GrantAdvantageVsBearersOfMyCondition'; conditionId: string; on: RollTarget; mode: 'advantage' | 'disadvantage' | 'auto-crit' | 'auto-fail' }
  // While the bearing condition is active, the bearer cannot regain
  // hit points. Heal planners consult this via the effect stack and,
  // when blocked, emit a Healed event with amount=0 (the reducer's
  // `amount <= 0` early-return makes it a no-op) plus an annotation
  // in the `source` field. Used by Spirit Shroud's "target can't
  // regain HP until start of caster's next turn" rider on a hit;
  // duration is consumer-managed today (no auto-expiry).
  | { kind: 'BlockHealing' }
  // Slice 112: optional `qualifier` restricts the resistance to one
  // damage-source kind. `'nonmagical'` (Stoneskin in SRD form, the
  // common MM "resistance to B/P/S from nonmagical attacks" pattern)
  // applies only when the attacking weapon is not magical and the
  // damage is not spell-sourced. `'magical'` applies only when the
  // damage source IS magical (some monster traits and abjuration
  // effects). When unset the resistance applies regardless of source.
  | { kind: 'GrantResistance'; damageType: DamageType | 'all'; qualifier?: 'nonmagical' | 'magical'; condition?: Predicate }
  | { kind: 'GrantImmunity'; damageType: DamageType | 'all' }
  | { kind: 'GrantVulnerability'; damageType: DamageType }
  | { kind: 'GrantConditionImmunity'; conditionId: string; condition?: Predicate }
  // Slice 131: RAW Magic Resistance. "The creature has advantage on
  // saving throws against spells and other magical effects." Marker-
  // only; consumers (computeSavingThrow) consult the accumulator's
  // hasMagicResistance() and contribute advantage when the save's
  // sourceIsMagical fact is true. Canonical across most CR 5+
  // Fiends / Fey / Dragons / spellcaster monsters.
  | { kind: 'GrantMagicResistance' }
  | { kind: 'OverrideACFormula'; base: number | 'dex' | 'con' | 'wis'; abilityModifiers: AbilityScore[]; dexCap?: number; priority?: number }
  // Sets a floor on the target's AC: after the natural AC is computed
  // from armor + DEX + modifiers, the result is bumped up to `value`
  // if it would otherwise be lower. Used by Barkskin (AC can't be
  // lower than 17 regardless of armor) and similar "minimum AC"
  // effects. Multiple floors fold to the highest. Distinct from
  // OverrideACFormula (which replaces the formula entirely and only
  // applies when unarmored).
  | { kind: 'SetACFloor'; value: number }
  // Slice 229. Floor on an ability score: bumps the bearer's named
  // ability score up to `value` if it would otherwise be lower; has
  // no effect if the bearer's base score is already at or above
  // `value`. Multiple floors on the same ability fold to the highest.
  // Mirrors the SetACFloor shape (slice 74). Canonical users: Amulet
  // of Health (CON 19), Gauntlets of Ogre Power (STR 19), the 6
  // Belt of Giant Strength variants (STR 21/23/25/27/29). Future
  // users: Headband of Intellect, Tome of *, Manual of *.
  | { kind: 'OverrideAbilityScore'; ability: AbilityScore; value: number }
  // Slice 308. Additive ability-score increase capped at `max`,
  // distinct from OverrideAbilityScore (which *sets* a value and would
  // mask a wearer's own higher score). RAW shape: "Your [ability]
  // increases by `amount`, to a maximum of `max`." Canonical users:
  // the six ability Ioun Stones (+2 to max 20) and Belt of
  // Dwarvenkind's Toughness arm (CON +2 to max 20). The increase only
  // raises (never lowers a score that already exceeds `max`); see
  // effectiveAbilityScore. The Manual/Tome variant (permanently raises
  // the score AND its max on a one-time read) is a separate
  // application shape, not this passive-worn projection.
  | { kind: 'IncreaseAbilityScore'; ability: AbilityScore; amount: number; max: number }
  // Slice 232. Monster trait: the bearer regains `perTurn` HP at the
  // start of each of their turns. If they take damage of a type in
  // `suppressedBy` during a turn, regeneration is suppressed on the
  // following turn (the `regenerationSuppressedThisTurn` Character
  // field tracks the per-turn suppression flag). Canonical users:
  // Troll (15 HP/turn, suppressed by Acid/Fire), Troll Limb (5 HP/turn,
  // same suppression). Future users: Werewolf, Hag variants, Vampire.
  // RAW "dies only if it starts its turn with 0 HP and doesn't
  // regenerate" is honored by the Healed-at-turn-start mechanic
  // (regen brings a 0-HP creature back; suppressed + 0 HP falls
  // through to standard unconsciousness rules).
  | { kind: 'Regeneration'; perTurn: number; suppressedBy: DamageType[] }
  | { kind: 'GrantResource'; resourceId: string; max: number | Formula; recharge: Recharge; diceSize?: number }
  | { kind: 'GrantSpellSlots'; level: SpellLevel; count: number; source: 'full' | 'half' | 'third' | 'pact' }
  | { kind: 'GrantSpell'; spellId: string; preparation: 'always-prepared' | 'prepared' | 'known' | 'at-will' | 'oncePerLongRest' | 'oncePerShortRest'; spellcastingAbility?: AbilityScore }
  | { kind: 'OnEvent'; id?: string; trigger: { eventType: string; filter?: Predicate }; actions: TriggerAction[]; oncePer?: 'turn' | 'round' | 'shortRest' | 'longRest'; requiresReaction?: boolean; consumeOnTrigger?: boolean }
  | { kind: 'RecoverResource'; resourceId: string; amount: number | 'all' | Formula; when: 'shortRest' | 'longRest' | 'turnStart' | 'turnEnd' | 'dawn' }
  | { kind: 'GrantAction'; actionId: string; name: string; cost: 'action' | 'bonusAction' | 'reaction' | 'free'; resourceCost?: { resourceId: string; amount: number } }
  | { kind: 'ModifyActionEconomy'; op: 'extraAttack' | 'extraAction' | 'extraBonusAction'; count: number; condition?: Predicate }
  | { kind: 'GrantWeaponMastery'; masteries: WeaponMastery[]; slots: number }
  | { kind: 'ExpandSpellList'; classId: string; spellIds: string[] }
  | { kind: 'SetHPMaxFormula'; formula: Formula }
  | { kind: 'OfferChoice'; choiceId: string; prompt: string; options: ChoiceOptionShape[]; oneOf: number; when: 'onAcquire' | 'onLevelUp' | 'onLongRest' }
  | { kind: 'FlatDamageReduction'; damageTypes: DamageType[]; amount: number }
  // Lowers the natural-d20 threshold at which the attacker's weapon
  // attacks crit. Default threshold is 20; Improved Critical sets 19,
  // Superior Critical sets 18. Multiple sources stack to the lowest.
  // Does not change auto-hit semantics: only a natural 20 auto-hits.
  | { kind: 'ExpandCritRange'; threshold: number }
  // Bard's Jack of All Trades and similar: any ability check the actor
  // is NOT already proficient in (skill prof level === 'none', or a raw
  // ability check with no skill) gains `floor(profBonus / 2)`. Existing
  // prof / expertise / half-prof are not stacked with.
  | { kind: 'GrantHalfProficiencyBonusFloor' }
  // Cleric's Disciple of Life and similar: boost the HP restored by
  // any healing spell of 1st level or higher cast by this character.
  // Total bonus per heal target is `flat + perSpellLevel * slotLevel`.
  // Cantrips (slotLevel 0) are excluded by the planner that reads this.
  | { kind: 'BoostHealing'; flat: number; perSpellLevel: number }
  // Rogue / Monk Evasion: when this character is forced to make a DEX
  // save against an area-effect spell that ordinarily halves on
  // success, they instead take no damage on success and half damage on
  // failure. Read by `planCastSpell` from the target's effect stack.
  | { kind: 'GrantEvasion' }
  // Evoker L3 Potent Cantrip: the caster's damaging cantrips deal half
  // damage even when the attack roll misses or the target succeeds on the
  // save (and no additional effect). Read by `planCastSpell` from the
  // caster's effect stack.
  | { kind: 'GrantPotentCantrip' }
  // Cross-character effect: while this is active on a character, attacks
  // against that character are made with advantage. Used by Faerie Fire,
  // Hex (kind of), Hunter's Mark variants. The attack planner consults
  // the *target's* effect stack to pick this up; the attacker doesn't
  // need to know.
  | { kind: 'GrantAdvantageToAttackers'; condition?: Predicate }
  | { kind: 'ImposeDisadvantageOnAttackers'; condition?: Predicate }
  // Slice 199. Marker primitive: while bearing this, any source that
  // would grant an incoming attacker advantage against this character
  // is cancelled. Distinct from `ImposeDisadvantageOnAttackers` — that
  // imposes disadvantage outright (which then cancels with any
  // attacker-side advantage to net "neither"). `CancelAdvantageOnAttackers`
  // suppresses the *advantage* contribution itself, leaving the attack
  // resolved without it (still rolled with whatever disadvantage
  // sources also apply). Canonical user: Rogue L18 Elusive ("No attack
  // roll can have Advantage against you unless you have the
  // Incapacitated condition") via a `bearerHasIncapacitated` predicate
  // that the attack planner populates from `findActorBlockingCondition`.
  // Future users: Wizard / Sorcerer Foresight, similar "advantage
  // immunity" features.
  | { kind: 'CancelAdvantageOnAttackers'; condition?: Predicate }
  // Slice 200. Marker primitive that flags a character as eligible to
  // spend their reaction to halve damage from a hit. Consumed by
  // `planUncannyDodge`, which checks `EffectAccumulator.hasUncannyDodge()`
  // before allowing the reaction. Canonical user: Rogue L5 Uncanny
  // Dodge. The reaction itself is consumer-driven (RAW: "you can
  // take a Reaction") — the engine doesn't auto-fire it; it just
  // gates the planner.
  | { kind: 'GrantUncannyDodge' }
  // Slice 201. Marker primitive that unlocks the Sorcery-Points
  // alternative cost on `planInnateSorcery`. Without the marker, the
  // planner only accepts the innate-sorcery resource path; with it,
  // the consumer may pass `useSorceryPoints: true` to spend 2 SP
  // instead (RAW Sorcery Incarnate L7: "If you have no uses of
  // Innate Sorcery left, you can use it if you spend 2 Sorcery
  // Points..."). Canonical user: Sorcerer L7 Sorcery Incarnate. The
  // double-metamagic arm of the same feature is deferred (needs
  // once-per-spell metamagic enforcement first).
  | { kind: 'GrantInnateSorcerySpendAlternative' }
  // Slice 202. Marker primitive that gates `planSelfRestoration`,
  // RAW Monk L10 Self-Restoration: "you can remove one of the
  // following conditions from yourself at the end of each of your
  // turns: Charmed, Frightened, or Poisoned." The planner removes
  // the named condition unconditionally (no save, no resource cost)
  // when the bearer has the marker. The "food and drink doesn't
  // give Exhaustion" arm of the same feature is consumer-side
  // narrative state (the engine doesn't model food / water).
  | { kind: 'GrantSelfRestoration' }
  // Slice 205. Marker primitive: while the caster bears this, every
  // healing-dice roll in the cast-spell heal-mechanic path is
  // replaced by its maximum value. RAW Life Domain L17 Supreme
  // Healing: "When you would normally roll one or more dice to
  // restore HP with a spell or Channel Divinity, you don't roll
  // those dice; you use the highest possible value instead."
  // Flat modifiers (CHA mod, Disciple of Life boost) compose
  // unchanged on top.
  | { kind: 'GrantMaxHealingDice' }
  // Slice 207. Marker primitive: the bearer's unarmed strikes count
  // as magical attacks for the purposes of overcoming Resistance and
  // Immunity to nonmagical damage. RAW Monk L6 Empowered Strikes.
  // `isMagicWeaponAttack` in src/derive/magicality.ts consults this
  // when the weapon's id is `unarmed-strike`. Doesn't change the
  // damage dice or the attack roll, just the `sourceIsMagical` flag
  // passed to `mitigateDamage`.
  | { kind: 'GrantUnarmedAsMagical' }
  // Slice 221. Marker primitive that unlocks the Wish branch of
  // `planDivineIntervention`. Without the marker, the planner only
  // accepts Cleric spells of level 5 or lower; with it, the consumer
  // may pass `spellId: 'wish'` even though Wish is level 9 and not
  // on the Cleric list. Canonical user: Cleric L20 Greater Divine
  // Intervention. RAW: "When you use your Divine Intervention
  // feature, you can choose Wish when you select a spell." The
  // 2d4-long-rest cooldown on the Wish branch is a separate concern,
  // pending a `ResourceCooldownExtended` primitive that the rest
  // reducer can honor.
  | { kind: 'GrantDivineInterventionWish' }
  // Slice 211. Additive bonus to the range of every aura the bearer
  // projects. Canonical user: Paladin L18 Aura Expansion (10 ft to
  // 30 ft → addFeet: 20). The engine doesn't auto-project auras
  // (positions are consumer territory) — `GrantAura` ships metadata
  // for consumers to read. This primitive adds an accumulator-side
  // bonus that consumers can read via `effects.auraRangeBonus()` and
  // fold into the displayed / enforced aura range.
  | { kind: 'ExpandAuraRange'; addFeet: number }
  // A "this character projects an aura" marker. Auras are inherently
  // position-dependent (RAW typically "creatures within X feet"), and
  // the engine doesn't model continuous position. So this effect is
  // metadata-only: the consumer (dndbnb / DM tool / VTT) reads the
  // bearer's `GrantAura` effects, decides which characters are
  // currently in range using whatever position model it tracks, and
  // applies / removes the `allyConditionId` on those characters via
  // `ConditionApplied` / `ConditionRemoved` events. The bearer's own
  // self-effect (e.g. Aura of Courage also making the bearer Frightened-
  // immune) ships as a separate sibling effect on the same feature.
  | { kind: 'GrantAura'; auraId: string; rangeFeet: number; allyConditionId: string; description?: string }
  // Negates fall damage entirely (Feather Fall, Monk Slow Fall at
  // high tiers, similar). Distinct from damage-type immunity because
  // falling isn't a damage type — it's a damage source. planFalling
  // consults this when computing fall damage; presence zeroes the
  // outgoing DamageApplied.
  | { kind: 'GrantFallingProtection' }
  // Slice 111. When the bearing condition lives on a creature and
  // incoming damage would drop HP to 0 or below, the damage is
  // reduced so HP lands at 1 and the bearing condition is removed.
  // Canonical user: Death Ward. Future users: Half-Orc Relentless
  // Endurance, Aura of Life.
  | { kind: 'PreventFatalDamage' }
  // Slice 119. Marker that enables the Two-Weapon Fighting bonus:
  // planOffHandAttack adds the wielder's ability modifier to off-hand
  // damage (positive mods included). Without this flag, off-hand
  // damage only includes negative ability mods per RAW. Canonical
  // user: the Two-Weapon Fighting Fighting Style.
  | { kind: 'GrantTwoWeaponFighting' }
  // Slice 120. Marker that enables the Protection reaction:
  // planProtection consults the bearer's effect stack for this flag
  // before letting them spend their reaction to impose disadvantage on
  // an attack against a nearby ally. The shield requirement is checked
  // separately (character.equipped.shield !== undefined). Canonical
  // user: the Protection Fighting Style.
  | { kind: 'GrantProtectionFightingStyle' }
  // Slice 121. Marker that enables Great Weapon Fighting's reroll
  // rule: planAttack replaces any 1 or 2 on a weapon damage die with
  // 3, but only when the attack is melee and the weapon is wielded
  // two-handed (Two-Handed property, or Versatile property with both
  // off-hand and shield slots empty). Canonical user: the Great
  // Weapon Fighting Fighting Style.
  | { kind: 'GrantGreatWeaponFighting' }
  | { kind: 'Custom'; handlerId: string; params?: unknown };

export const EffectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal('GrantProficiency'),
      target: z.enum(['skill', 'tool', 'weapon', 'armor', 'save', 'language']),
      id: z.string(),
      level: ProficiencyLevelSchema,
    }),
    z.object({
      kind: z.literal('GrantSense'),
      sense: SenseSchema,
      range: z.number().int().min(0),
    }),
    z.object({
      kind: z.literal('ModifySpeed'),
      mode: MovementModeSchema,
      op: z.enum(['set', 'add', 'multiply', 'matchWalkSpeed']),
      // `value` is unused for `op: 'matchWalkSpeed'` (the entry says
      // "set this mode's speed to the bearer's effective walk speed").
      // Kept required across all ops to avoid a discriminated-union
      // expansion; `matchWalkSpeed` entries should ship `value: 0`.
      value: z.number(),
    }),
    z.object({
      kind: z.literal('AddModifier'),
      target: ModifierTargetSchema,
      value: z.union([z.number(), FormulaSchema]),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('AddBonusDie'),
      target: ModifierTargetSchema,
      dice: DiceExpressionSchema,
      subtract: z.boolean().optional(),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('SetAdvantage'),
      on: RollTargetSchema,
      mode: z.enum(['advantage', 'disadvantage', 'auto-crit', 'auto-fail']),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('SetAdvantageVsSource'),
      on: RollTargetSchema,
      mode: z.enum(['advantage', 'disadvantage', 'auto-crit', 'auto-fail']),
    }),
    z.object({
      kind: z.literal('GrantAdvantageVsBearersOfMyCondition'),
      conditionId: z.string(),
      on: RollTargetSchema,
      mode: z.enum(['advantage', 'disadvantage', 'auto-crit', 'auto-fail']),
    }),
    z.object({
      kind: z.literal('BlockHealing'),
    }),
    z.object({
      kind: z.literal('GrantResistance'),
      damageType: z.union([DamageTypeSchema, z.literal('all')]),
      qualifier: z.enum(['nonmagical', 'magical']).optional(),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('GrantImmunity'),
      damageType: z.union([DamageTypeSchema, z.literal('all')]),
    }),
    z.object({
      kind: z.literal('GrantVulnerability'),
      damageType: DamageTypeSchema,
    }),
    z.object({
      kind: z.literal('GrantConditionImmunity'),
      conditionId: z.string(),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('GrantMagicResistance'),
    }),
    z.object({
      kind: z.literal('OverrideACFormula'),
      base: z.union([z.number(), z.literal('dex'), z.literal('con'), z.literal('wis')]),
      abilityModifiers: z.array(AbilityScoreSchema),
      dexCap: z.number().optional(),
      priority: z.number().int().optional(),
    }),
    z.object({
      kind: z.literal('OverrideAbilityScore'),
      ability: AbilityScoreSchema,
      value: z.number().int().min(1).max(30),
    }),
    z.object({
      kind: z.literal('IncreaseAbilityScore'),
      ability: AbilityScoreSchema,
      amount: z.number().int().min(1),
      max: z.number().int().min(1).max(30),
    }),
    z.object({
      kind: z.literal('Regeneration'),
      perTurn: z.number().int().min(1),
      suppressedBy: z.array(DamageTypeSchema),
    }),
    z.object({
      kind: z.literal('SetACFloor'),
      value: z.number().int().min(1),
    }),
    z.object({
      kind: z.literal('GrantResource'),
      resourceId: z.string(),
      max: z.union([z.number().int().min(0), FormulaSchema]),
      recharge: RechargeSchema,
      diceSize: z.number().int().optional(),
    }),
    z.object({
      kind: z.literal('GrantSpellSlots'),
      level: SpellLevelSchema,
      count: z.number().int().min(0),
      source: z.enum(['full', 'half', 'third', 'pact']),
    }),
    z.object({
      kind: z.literal('GrantSpell'),
      spellId: z.string(),
      preparation: z.enum([
        'always-prepared',
        'prepared',
        'known',
        'at-will',
        'oncePerLongRest',
        'oncePerShortRest',
      ]),
      spellcastingAbility: AbilityScoreSchema.optional(),
    }),
    z.object({
      kind: z.literal('OnEvent'),
      id: z.string().optional(),
      trigger: z.object({
        eventType: z.string(),
        filter: PredicateSchema.optional(),
      }),
      actions: z.array(TriggerActionSchema),
      oncePer: z.enum(['turn', 'round', 'shortRest', 'longRest']).optional(),
      requiresReaction: z.boolean().optional(),
      consumeOnTrigger: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal('RecoverResource'),
      resourceId: z.string(),
      amount: z.union([z.number(), z.literal('all'), FormulaSchema]),
      when: z.enum(['shortRest', 'longRest', 'turnStart', 'turnEnd', 'dawn']),
    }),
    z.object({
      kind: z.literal('GrantAction'),
      actionId: z.string(),
      name: z.string(),
      cost: z.enum(['action', 'bonusAction', 'reaction', 'free']),
      resourceCost: z
        .object({ resourceId: z.string(), amount: z.number().int().min(1) })
        .optional(),
    }),
    z.object({
      kind: z.literal('ModifyActionEconomy'),
      op: z.enum(['extraAttack', 'extraAction', 'extraBonusAction']),
      count: z.number().int().min(1),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('GrantWeaponMastery'),
      masteries: z.array(WeaponMasterySchema),
      slots: z.number().int().min(1),
    }),
    z.object({
      kind: z.literal('ExpandSpellList'),
      classId: z.string(),
      spellIds: z.array(z.string()),
    }),
    z.object({
      kind: z.literal('SetHPMaxFormula'),
      formula: FormulaSchema,
    }),
    z.object({
      kind: z.literal('OfferChoice'),
      choiceId: z.string(),
      prompt: z.string(),
      options: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            effects: z.array(EffectSchema),
          }),
        )
        .min(1),
      oneOf: z.number().int().min(1),
      when: z.enum(['onAcquire', 'onLevelUp', 'onLongRest']),
    }),
    z.object({
      kind: z.literal('FlatDamageReduction'),
      damageTypes: z.array(DamageTypeSchema).min(1),
      amount: z.number().int().min(1),
    }),
    z.object({
      kind: z.literal('ExpandCritRange'),
      threshold: z.number().int().min(2).max(20),
    }),
    z.object({
      kind: z.literal('GrantHalfProficiencyBonusFloor'),
    }),
    z.object({
      kind: z.literal('BoostHealing'),
      flat: z.number().int(),
      perSpellLevel: z.number().int(),
    }),
    z.object({
      kind: z.literal('GrantEvasion'),
    }),
    z.object({
      kind: z.literal('GrantPotentCantrip'),
    }),
    z.object({
      kind: z.literal('GrantAdvantageToAttackers'),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('ImposeDisadvantageOnAttackers'),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('CancelAdvantageOnAttackers'),
      condition: PredicateSchema.optional(),
    }),
    z.object({
      kind: z.literal('GrantUncannyDodge'),
    }),
    z.object({
      kind: z.literal('GrantInnateSorcerySpendAlternative'),
    }),
    z.object({
      kind: z.literal('GrantSelfRestoration'),
    }),
    z.object({
      kind: z.literal('GrantMaxHealingDice'),
    }),
    z.object({
      kind: z.literal('GrantUnarmedAsMagical'),
    }),
    z.object({
      kind: z.literal('GrantDivineInterventionWish'),
    }),
    z.object({
      kind: z.literal('ExpandAuraRange'),
      addFeet: z.number().int().min(0),
    }),
    z.object({
      kind: z.literal('GrantAura'),
      auraId: z.string(),
      rangeFeet: z.number().int().min(0),
      allyConditionId: z.string(),
      description: z.string().optional(),
    }),
    z.object({
      kind: z.literal('GrantFallingProtection'),
    }),
    z.object({
      // Slice 111. Marker primitive. When the bearing condition lives
      // on a creature and incoming damage would drop their HP to 0 or
      // below, the damage is reduced so HP lands at 1 and the bearing
      // condition is removed. Canonical user: Death Ward (PHB 2024).
      // Future users: Half-Orc Relentless Endurance, Aura of Life
      // floor, Beacon of Hope's death-save advantage variant.
      kind: z.literal('PreventFatalDamage'),
    }),
    z.object({
      kind: z.literal('GrantTwoWeaponFighting'),
    }),
    z.object({
      kind: z.literal('GrantProtectionFightingStyle'),
    }),
    z.object({
      kind: z.literal('GrantGreatWeaponFighting'),
    }),
    z.object({
      kind: z.literal('Custom'),
      handlerId: z.string(),
      params: z.unknown().optional(),
    }),
  ]),
);

export type EffectKind = Effect['kind'];

export const EFFECT_KINDS = [
  'GrantProficiency',
  'GrantSense',
  'ModifySpeed',
  'AddModifier',
  'AddBonusDie',
  'SetAdvantage',
  'SetAdvantageVsSource',
  'GrantAdvantageVsBearersOfMyCondition',
  'BlockHealing',
  'GrantResistance',
  'GrantImmunity',
  'GrantVulnerability',
  'GrantConditionImmunity',
  'GrantMagicResistance',
  'OverrideACFormula',
  'OverrideAbilityScore',
  'IncreaseAbilityScore',
  'Regeneration',
  'SetACFloor',
  'GrantResource',
  'GrantSpellSlots',
  'GrantSpell',
  'OnEvent',
  'RecoverResource',
  'GrantAction',
  'ModifyActionEconomy',
  'GrantWeaponMastery',
  'ExpandSpellList',
  'SetHPMaxFormula',
  'OfferChoice',
  'FlatDamageReduction',
  'ExpandCritRange',
  'GrantHalfProficiencyBonusFloor',
  'BoostHealing',
  'GrantEvasion',
  'GrantPotentCantrip',
  'GrantAdvantageToAttackers',
  'ImposeDisadvantageOnAttackers',
  'CancelAdvantageOnAttackers',
  'GrantUncannyDodge',
  'GrantInnateSorcerySpendAlternative',
  'GrantSelfRestoration',
  'GrantMaxHealingDice',
  'GrantUnarmedAsMagical',
  'GrantDivineInterventionWish',
  'ExpandAuraRange',
  'GrantAura',
  'GrantFallingProtection',
  'PreventFatalDamage',
  'GrantTwoWeaponFighting',
  'GrantProtectionFightingStyle',
  'GrantGreatWeaponFighting',
  'Custom',
] as const satisfies ReadonlyArray<EffectKind>;
