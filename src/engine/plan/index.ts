export {
  planShortRest,
  planLongRest,
  type ShortRestIntent,
  type LongRestIntent,
  type RestIntent,
} from './rest.js';
export {
  planAttack,
  planCleave,
  resolveAttack,
  type AttackIntent,
  type CleaveIntent,
  type ResolveAttackInput,
} from './attack.js';
export {
  planOpportunityAttack,
  type OpportunityAttackIntent,
} from './opportunity-attack.js';
export {
  planCreateEncounter,
  planRollInitiative,
  planStartEncounter,
  planAdvanceTurn,
  planBeginFirstTurn,
  planEndEncounter,
  type CreateEncounterIntent,
  type RollInitiativeIntent,
  type StartEncounterIntent,
  type AdvanceTurnIntent,
  type BeginFirstTurnIntent,
  type EndEncounterIntent,
} from './encounter.js';
export {
  planLevelUp,
  planResolveChoice,
  type LevelUpIntent,
  type ResolveChoiceIntent,
} from './level-up.js';
export {
  planSave,
  planAbilityCheck,
  type SaveIntent,
  type AbilityCheckIntent,
} from './checks.js';
export {
  planCastSpell,
  type CastSpellIntent,
  type CasterChoice,
} from './cast-spell.js';
export {
  planCheckConcentration,
  planExpireSpellDurations,
  planTickAura,
  planTickMovementDamage,
  planTickRecurring,
  type CheckConcentrationIntent,
  type ExpireSpellDurationsIntent,
  type TickAuraIntent,
  type TickMovementDamageIntent,
  type TickRecurringIntent,
} from './concentration.js';
export {
  planTickRecurringSave,
  type TickRecurringSaveIntent,
} from './recurring-save.js';
export {
  planMove,
  planDash,
  planDisengage,
  planDodge,
  planMistyStep,
  planThunderStep,
  planDimensionDoor,
  chebyshevDistance,
  type MoveIntent,
  type DashIntent,
  type DisengageIntent,
  type DodgeIntent,
  type MistyStepIntent,
  type ThunderStepIntent,
  type DimensionDoorIntent,
} from './movement.js';
export { planActionSurge, type ActionSurgeIntent } from './action-surge.js';
export { planSacredWeapon, type SacredWeaponIntent } from './sacred-weapon.js';
export { planInnateSorcery, type InnateSorceryIntent } from './innate-sorcery.js';
export { planSelfRestoration, type SelfRestorationIntent } from './self-restoration.js';
export { planSuperiorDefense, type SuperiorDefenseIntent } from './superior-defense.js';
export { planPaladinsSmite, type PaladinsSmiteIntent } from './paladins-smite.js';
export { planDivineIntervention, type DivineInterventionIntent } from './divine-intervention.js';
export { planConsumeItem, type ConsumeItemIntent } from './consume-item.js';
export { planUseItem, type UseItemIntent } from './use-item.js';
export { planMagicWeapon, type MagicWeaponIntent } from './magic-weapon.js';
export { planElementalWeapon, type ElementalWeaponIntent } from './elemental-weapon.js';
export { planRecklessAttack, type RecklessAttackIntent } from './reckless-attack.js';
export { planStunningStrike, type StunningStrikeIntent } from './stunning-strike.js';
export { planFlurryOfBlows, type FlurryOfBlowsIntent } from './flurry-of-blows.js';
export { planPatientDefense, type PatientDefenseIntent } from './patient-defense.js';
export { planStepOfTheWind, type StepOfTheWindIntent } from './step-of-the-wind.js';
export { planIntimidatingPresence, type IntimidatingPresenceIntent } from './intimidating-presence.js';
export { planDragonWings, type DragonWingsIntent } from './dragon-wings.js';
export { planPreserveLife, type PreserveLifeIntent } from './preserve-life.js';
export { planLandsAid, type LandsAidIntent } from './lands-aid.js';
export { planWholenessOfBody, type WholenessOfBodyIntent } from './wholeness-of-body.js';
export { planFrenzy, type FrenzyIntent } from './frenzy.js';
export {
  planCuttingWords,
  type CuttingWordsIntent,
  type CuttingWordsOutcome,
} from './cutting-words.js';
export {
  planMetamagic,
  METAMAGIC_OPTIONS,
  type MetamagicIntent,
  type MetamagicOption,
} from './metamagic.js';
export { planWildCompanion, type WildCompanionIntent } from './wild-companion.js';
export { planEquip, type EquipIntent } from './inventory.js';
export { planOffHandAttack, type OffHandAttackIntent } from './offhand-attack.js';
export { planMultiattack, type MultiattackIntent } from './multiattack.js';
export { planFalling, type FallingIntent } from './falling.js';
export { coverACBonus, COVER_KINDS, type CoverKind } from './attack.js';
export {
  planGrapple,
  planShove,
  planHide,
  type GrappleIntent,
  type ShoveIntent,
  type HideIntent,
} from './contested.js';
export {
  planClairvoyance,
  planSwitchSensorMode,
  planRemoveSensor,
  planScrying,
  planArcaneEye,
  planMoveSensor,
  type ClairvoyanceIntent,
  type SwitchSensorModeIntent,
  type RemoveSensorIntent,
  type ScryingIntent,
  type ScryingOutcome,
  type ArcaneEyeIntent,
  type MoveSensorIntent,
} from './sensor.js';
export {
  planSilentImage,
  planMajorImage,
  planInvestigateIllusion,
  planDismissIllusion,
  type SilentImageIntent,
  type MajorImageIntent,
  type InvestigateIllusionIntent,
  type DismissIllusionIntent,
} from './illusion.js';
export {
  planBreathWeapon,
  planBreathWeaponRechargeAtTurnStart,
  type BreathWeaponIntent,
} from './breath-weapon.js';
export {
  planCounterspell,
  planDispelMagic,
  planRemoveCurse,
  planIdentify,
  planShield,
  planAbsorbElements,
  planSanctuaryWardSave,
  planProtection,
  planConsumeGuidance,
  planUncannyDodge,
  type CounterspellIntent,
  type DispelMagicIntent,
  type RemoveCurseIntent,
  type IdentifyIntent,
  type ShieldIntent,
  type ShieldOutcome,
  type AbsorbElementsIntent,
  type AbsorbElementsOutcome,
  type SanctuaryWardSaveIntent,
  type SanctuaryWardSaveOutcome,
  type ProtectionIntent,
  type ProtectionOutcome,
  type ConsumeGuidanceIntent,
  type ConsumeGuidanceOutcome,
  type UncannyDodgeIntent,
  type UncannyDodgeOutcome,
} from './reactive-spells.js';
export { planWeaponMastery, type WeaponMasteryIntent } from './weapon-mastery.js';
export {
  planForage,
  planNavigationCheck,
  planForcedMarch,
  type ForageIntent,
  type NavigationCheckIntent,
  type ForcedMarchIntent,
} from './travel.js';
export {
  planGrantInitialHeroPoints,
  planSpendHeroPoint,
  type GrantInitialHeroPointsIntent,
  type SpendHeroPointIntent,
  type SpendHeroPointOutcome,
} from './hero-points.js';
export {
  planMoraleCheck,
  planReactionRoll,
  type MoraleCheckIntent,
  type ReactionRollIntent,
} from './npc.js';
export {
  planResurrect,
  type ResurrectIntent,
  type ResurrectVia,
} from './resurrect.js';
export {
  planPolymorph,
  planWildShape,
  planSimulacrum,
  planWish,
  type PolymorphIntent,
  type PolymorphOutcome,
  type WildShapeIntent,
  type SimulacrumIntent,
  type SimulacrumOutcome,
  type WishIntent,
  type WishOutcome,
} from './transformations.js';
export {
  planDismissCompanion,
  type DismissCompanionIntent,
} from './dismiss-companion.js';
export {
  planTriggerTrap,
  type TriggerTrapIntent,
} from './trap.js';
