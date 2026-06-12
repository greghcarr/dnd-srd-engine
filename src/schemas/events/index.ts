import { z } from 'zod';
import {
  DamageAppliedEventSchema,
  HealedEventSchema,
  TempHPGrantedEventSchema,
  ConditionAppliedEventSchema,
  ConditionRemovedEventSchema,
  AbilityScoreDrainedEventSchema,
  LegendaryResistanceUsedEventSchema,
  LegendaryActionUsedEventSchema,
  CreaturePushedEventSchema,
  ExhaustionChangedEventSchema,
  DeathSaveRolledEventSchema,
  StabilizedEventSchema,
  CreatureDestroyedEventSchema,
  HPMaxBonusChangedEventSchema,
} from './combat.js';
import {
  ResourceSpentEventSchema,
  ResourceRestoredEventSchema,
  HitDieSpentEventSchema,
} from './resources.js';
import {
  ShortRestStartedEventSchema,
  ShortRestEndedEventSchema,
  LongRestStartedEventSchema,
  LongRestEndedEventSchema,
} from './rest.js';
import {
  HeroicInspirationGrantedEventSchema,
  HeroicInspirationConsumedEventSchema,
} from './heroic-inspiration.js';
import { CharacterCreatedEventSchema } from './progression.js';
import {
  EncounterCreatedEventSchema,
  EncounterEndedEventSchema,
  EncounterStartedEventSchema,
  InitiativeRolledEventSchema,
  InitiativeSwappedEventSchema,
  RoundEndedEventSchema,
  TurnEndedEventSchema,
  TurnStartedEventSchema,
  CombatantPlacedEventSchema,
} from './encounter.js';
import {
  AttackRolledEventSchema,
  DamageRolledEventSchema,
  WeaponLoadedEventSchema,
} from './attack.js';
import { ItemAcquiredEventSchema } from './inventory.js';
import {
  LevelUpResolvedEventSchema,
  ChoiceRequiredEventSchema,
  ChoiceResolvedEventSchema,
  SubclassChosenEventSchema,
} from './level-up.js';
import {
  SaveRolledEventSchema,
  AbilityCheckRolledEventSchema,
} from './checks.js';
import {
  SpellCastDeclaredEventSchema,
  SpellCastFizzledEventSchema,
  SpellSlotConsumedEventSchema,
  PactSlotConsumedEventSchema,
  PactSlotsRegainedEventSchema,
  SpellSlotsRegainedEventSchema,
  PreparedSpellsChangedEventSchema,
  FreeCastUsedEventSchema,
  PerDayCastUsedEventSchema,
} from './spellcasting.js';
import {
  ConcentrationStartedEventSchema,
  ConcentrationBrokenEventSchema,
  SpellEffectStartedEventSchema,
} from './concentration.js';
import { TriggerFiredEventSchema } from './triggers.js';
import {
  ActionEconomyConsumedEventSchema,
  ActionReadiedEventSchema,
  RecklessAttackActivatedEventSchema,
  SteadyAimActivatedEventSchema,
  SteadyAimConsumedEventSchema,
  FastHandsActivatedEventSchema,
  DeflectAttacksUsedEventSchema,
  StunningStrikeAttemptedEventSchema,
  SavageAttackerUsedEventSchema,
} from './action-economy.js';
import {
  CombatantMovedEventSchema,
  DashedEventSchema,
  DisengagedEventSchema,
  OpportunityAvailableEventSchema,
} from './movement.js';
import {
  ItemEquippedEventSchema,
  ItemUnequippedEventSchema,
  ItemAttunedEventSchema,
  ItemUnattunedEventSchema,
  ItemBuffAppliedEventSchema,
  ItemBuffRemovedEventSchema,
  ItemConsumedEventSchema,
  ItemUsedEventSchema,
  ItemDestroyedEventSchema,
  ItemTimeBudgetConsumedEventSchema,
} from './inventory.js';
import {
  PartyCreatedEventSchema,
  PartyMembersChangedEventSchema,
  CurrencyAcquiredEventSchema,
  CurrencySpentEventSchema,
  ItemDepositedToPartyEventSchema,
  ItemWithdrawnFromPartyEventSchema,
} from './party.js';
import {
  SessionStartedEventSchema,
  SessionEndedEventSchema,
  JournalEntryAddedEventSchema,
  InGameTimeAdvancedEventSchema,
} from './session.js';
import {
  LocationCreatedEventSchema,
  DoorAddedEventSchema,
  DoorStateChangedEventSchema,
  CharacterLocationChangedEventSchema,
} from './locations.js';
import {
  QuestStartedEventSchema,
  ObjectiveProgressedEventSchema,
  ObjectiveCompletedEventSchema,
  ObjectiveFailedEventSchema,
  QuestCompletedEventSchema,
  QuestFailedEventSchema,
  QuestAbandonedEventSchema,
  QuestRewardClaimedEventSchema,
  XPAwardedEventSchema,
  MilestoneAwardedEventSchema,
} from './quests.js';
import {
  SpellCounteredEventSchema,
  SpellDispelledEventSchema,
  ItemIdentifiedEventSchema,
  ShieldCastEventSchema,
  AbsorbElementsCastEventSchema,
  SanctuaryProtectedEventSchema,
  ProtectionUsedEventSchema,
  GuidanceUsedEventSchema,
  UncannyDodgeUsedEventSchema,
} from './reactive-spells.js';
import { WeaponMasteryActivatedEventSchema, WeaponMasteriesChosenEventSchema } from './weapon-mastery.js';
import {
  MountedEventSchema,
  DismountedEventSchema,
  VehicleAcquiredEventSchema,
  VehicleBoardedEventSchema,
  VehicleDepartedEventSchema,
  VehicleDamagedEventSchema,
  VehicleRepairedEventSchema,
} from './mounts-vehicles.js';
import {
  TravelLegCompletedEventSchema,
  NavigationCheckRolledEventSchema,
  ForagedForEventSchema,
} from './travel.js';
import {
  AttitudeChangedEventSchema,
  MoraleCheckRolledEventSchema,
  MoraleBrokenEventSchema,
} from './npc.js';
import { DowntimeActivityResolvedEventSchema } from './downtime.js';
import {
  ItemChargeConsumedEventSchema,
  ItemRechargedEventSchema,
  SentientItemConflictEventSchema,
} from './charges.js';
import {
  BastionFoundedEventSchema,
  BastionFacilityAddedEventSchema,
  BastionHirelingAddedEventSchema,
  BastionTurnTakenEventSchema,
  BastionDamagedEventSchema,
  BastionLevelChangedEventSchema,
} from './bastion.js';
import {
  CampaignSettingsChangedEventSchema,
  HeroPointGrantedEventSchema,
  HeroPointSpentEventSchema,
} from './settings.js';
import { CharacterResurrectedEventSchema } from './resurrection.js';
import {
  PolymorphAppliedEventSchema,
  PolymorphRevertedEventSchema,
  SimulacrumCreatedEventSchema,
  WishGrantedEventSchema,
} from './transformations.js';
import {
  CompanionSummonedEventSchema,
  CompanionDismissedEventSchema,
} from './summons.js';
import {
  TrapArmedEventSchema,
  TrapTriggeredEventSchema,
  TrapExpiredEventSchema,
} from './traps.js';
import {
  RemoteSensorPlacedEventSchema,
  RemoteSensorModeChangedEventSchema,
  RemoteSensorRemovedEventSchema,
  RemoteSensorMovedEventSchema,
} from './sensors.js';
import {
  IllusionCreatedEventSchema,
  IllusionInvestigatedEventSchema,
  IllusionDismissedEventSchema,
} from './illusions.js';
import {
  BreathWeaponFiredEventSchema,
  BreathWeaponRechargedEventSchema,
} from './breath-weapon.js';
import {
  SaveActionExpendedEventSchema,
  SaveActionRechargedEventSchema,
} from './save-action.js';
import { ParryUsedEventSchema } from './parry.js';
import { MirrorImageDeflectedEventSchema } from './mirror-image.js';

export const EventSchema = z.discriminatedUnion('type', [
  CharacterCreatedEventSchema,
  DamageAppliedEventSchema,
  HealedEventSchema,
  TempHPGrantedEventSchema,
  ConditionAppliedEventSchema,
  ConditionRemovedEventSchema,
  AbilityScoreDrainedEventSchema,
  LegendaryResistanceUsedEventSchema,
  LegendaryActionUsedEventSchema,
  CreaturePushedEventSchema,
  ExhaustionChangedEventSchema,
  DeathSaveRolledEventSchema,
  StabilizedEventSchema,
  CreatureDestroyedEventSchema,
  HPMaxBonusChangedEventSchema,
  HeroicInspirationGrantedEventSchema,
  HeroicInspirationConsumedEventSchema,
  ResourceSpentEventSchema,
  ResourceRestoredEventSchema,
  HitDieSpentEventSchema,
  ShortRestStartedEventSchema,
  ShortRestEndedEventSchema,
  LongRestStartedEventSchema,
  LongRestEndedEventSchema,
  EncounterCreatedEventSchema,
  CombatantPlacedEventSchema,
  EncounterStartedEventSchema,
  InitiativeRolledEventSchema,
  InitiativeSwappedEventSchema,
  TurnStartedEventSchema,
  TurnEndedEventSchema,
  RoundEndedEventSchema,
  EncounterEndedEventSchema,
  AttackRolledEventSchema,
  DamageRolledEventSchema,
  WeaponLoadedEventSchema,
  ItemAcquiredEventSchema,
  LevelUpResolvedEventSchema,
  ChoiceRequiredEventSchema,
  ChoiceResolvedEventSchema,
  SubclassChosenEventSchema,
  SaveRolledEventSchema,
  AbilityCheckRolledEventSchema,
  SpellCastDeclaredEventSchema,
  SpellCastFizzledEventSchema,
  SpellSlotConsumedEventSchema,
  PactSlotConsumedEventSchema,
  PactSlotsRegainedEventSchema,
  SpellSlotsRegainedEventSchema,
  PreparedSpellsChangedEventSchema,
  FreeCastUsedEventSchema,
  PerDayCastUsedEventSchema,
  ConcentrationStartedEventSchema,
  ConcentrationBrokenEventSchema,
  SpellEffectStartedEventSchema,
  TriggerFiredEventSchema,
  ActionEconomyConsumedEventSchema,
  ActionReadiedEventSchema,
  RecklessAttackActivatedEventSchema,
  SteadyAimActivatedEventSchema,
  SteadyAimConsumedEventSchema,
  FastHandsActivatedEventSchema,
  DeflectAttacksUsedEventSchema,
  StunningStrikeAttemptedEventSchema,
  SavageAttackerUsedEventSchema,
  CombatantMovedEventSchema,
  DashedEventSchema,
  DisengagedEventSchema,
  OpportunityAvailableEventSchema,
  ItemEquippedEventSchema,
  ItemUnequippedEventSchema,
  ItemAttunedEventSchema,
  ItemUnattunedEventSchema,
  ItemBuffAppliedEventSchema,
  ItemBuffRemovedEventSchema,
  ItemConsumedEventSchema,
  ItemUsedEventSchema,
  ItemDestroyedEventSchema,
  ItemTimeBudgetConsumedEventSchema,
  PartyCreatedEventSchema,
  PartyMembersChangedEventSchema,
  CurrencyAcquiredEventSchema,
  CurrencySpentEventSchema,
  ItemDepositedToPartyEventSchema,
  ItemWithdrawnFromPartyEventSchema,
  SessionStartedEventSchema,
  SessionEndedEventSchema,
  JournalEntryAddedEventSchema,
  InGameTimeAdvancedEventSchema,
  LocationCreatedEventSchema,
  DoorAddedEventSchema,
  DoorStateChangedEventSchema,
  CharacterLocationChangedEventSchema,
  QuestStartedEventSchema,
  ObjectiveProgressedEventSchema,
  ObjectiveCompletedEventSchema,
  ObjectiveFailedEventSchema,
  QuestCompletedEventSchema,
  QuestFailedEventSchema,
  QuestAbandonedEventSchema,
  QuestRewardClaimedEventSchema,
  XPAwardedEventSchema,
  MilestoneAwardedEventSchema,
  SpellCounteredEventSchema,
  SpellDispelledEventSchema,
  ItemIdentifiedEventSchema,
  ShieldCastEventSchema,
  AbsorbElementsCastEventSchema,
  SanctuaryProtectedEventSchema,
  ProtectionUsedEventSchema,
  GuidanceUsedEventSchema,
  UncannyDodgeUsedEventSchema,
  WeaponMasteryActivatedEventSchema,
  WeaponMasteriesChosenEventSchema,
  MountedEventSchema,
  DismountedEventSchema,
  VehicleAcquiredEventSchema,
  VehicleBoardedEventSchema,
  VehicleDepartedEventSchema,
  VehicleDamagedEventSchema,
  VehicleRepairedEventSchema,
  TravelLegCompletedEventSchema,
  NavigationCheckRolledEventSchema,
  ForagedForEventSchema,
  AttitudeChangedEventSchema,
  MoraleCheckRolledEventSchema,
  MoraleBrokenEventSchema,
  DowntimeActivityResolvedEventSchema,
  ItemChargeConsumedEventSchema,
  ItemRechargedEventSchema,
  SentientItemConflictEventSchema,
  BastionFoundedEventSchema,
  BastionFacilityAddedEventSchema,
  BastionHirelingAddedEventSchema,
  BastionTurnTakenEventSchema,
  BastionDamagedEventSchema,
  BastionLevelChangedEventSchema,
  CharacterResurrectedEventSchema,
  PolymorphAppliedEventSchema,
  PolymorphRevertedEventSchema,
  SimulacrumCreatedEventSchema,
  WishGrantedEventSchema,
  CompanionSummonedEventSchema,
  CompanionDismissedEventSchema,
  TrapArmedEventSchema,
  TrapTriggeredEventSchema,
  TrapExpiredEventSchema,
  RemoteSensorPlacedEventSchema,
  RemoteSensorModeChangedEventSchema,
  RemoteSensorRemovedEventSchema,
  RemoteSensorMovedEventSchema,
  IllusionCreatedEventSchema,
  IllusionInvestigatedEventSchema,
  IllusionDismissedEventSchema,
  BreathWeaponFiredEventSchema,
  BreathWeaponRechargedEventSchema,
  SaveActionExpendedEventSchema,
  SaveActionRechargedEventSchema,
  ParryUsedEventSchema,
  CampaignSettingsChangedEventSchema,
  HeroPointGrantedEventSchema,
  HeroPointSpentEventSchema,
  MirrorImageDeflectedEventSchema,
]);
export type Event = z.infer<typeof EventSchema>;
export type EventType = Event['type'];

export const EVENT_TYPES = [
  'CharacterCreated',
  'DamageApplied',
  'Healed',
  'TempHPGranted',
  'ConditionApplied',
  'ConditionRemoved',
  'CreaturePushed',
  'ExhaustionChanged',
  'DeathSaveRolled',
  'Stabilized',
  'CreatureDestroyed',
  'HPMaxBonusChanged',
  'ResourceSpent',
  'ResourceRestored',
  'HitDieSpent',
  'ShortRestStarted',
  'ShortRestEnded',
  'LongRestStarted',
  'LongRestEnded',
  'EncounterCreated',
  'CombatantPlaced',
  'EncounterStarted',
  'InitiativeRolled',
  'InitiativeSwapped',
  'TurnStarted',
  'TurnEnded',
  'RoundEnded',
  'EncounterEnded',
  'AttackRolled',
  'DamageRolled',
  'WeaponLoaded',
  'ItemAcquired',
  'LevelUpResolved',
  'ChoiceRequired',
  'ChoiceResolved',
  'SubclassChosen',
  'SaveRolled',
  'AbilityCheckRolled',
  'SpellCastDeclared',
  'SpellCastFizzled',
  'SpellSlotConsumed',
  'PactSlotConsumed',
  'PactSlotsRegained',
  'SpellSlotsRegained',
  'PreparedSpellsChanged',
  'FreeCastUsed',
  'PerDayCastUsed',
  'ConcentrationStarted',
  'ConcentrationBroken',
  'SpellEffectStarted',
  'TriggerFired',
  'ActionEconomyConsumed',
  'ActionReadied',
  'RecklessAttackActivated',
  'SteadyAimActivated',
  'SteadyAimConsumed',
  'FastHandsActivated',
  'DeflectAttacksUsed',
  'StunningStrikeAttempted',
  'SavageAttackerUsed',
  'CombatantMoved',
  'Dashed',
  'Disengaged',
  'OpportunityAvailable',
  'ItemEquipped',
  'ItemUnequipped',
  'ItemAttuned',
  'ItemUnattuned',
  'ItemBuffApplied',
  'ItemBuffRemoved',
  'ItemTimeBudgetConsumed',
  'PartyCreated',
  'PartyMembersChanged',
  'CurrencyAcquired',
  'CurrencySpent',
  'ItemDepositedToParty',
  'ItemWithdrawnFromParty',
  'SessionStarted',
  'SessionEnded',
  'JournalEntryAdded',
  'InGameTimeAdvanced',
  'LocationCreated',
  'DoorAdded',
  'DoorStateChanged',
  'CharacterLocationChanged',
  'QuestStarted',
  'ObjectiveProgressed',
  'ObjectiveCompleted',
  'ObjectiveFailed',
  'QuestCompleted',
  'QuestFailed',
  'QuestAbandoned',
  'QuestRewardClaimed',
  'XPAwarded',
  'MilestoneAwarded',
  'SpellCountered',
  'SpellDispelled',
  'ItemIdentified',
  'ShieldCast',
  'AbsorbElementsCast',
  'SanctuaryProtected',
  'ProtectionUsed',
  'GuidanceUsed',
  'UncannyDodgeUsed',
  'WeaponMasteryActivated',
  'WeaponMasteriesChosen',
  'Mounted',
  'Dismounted',
  'VehicleAcquired',
  'VehicleBoarded',
  'VehicleDeparted',
  'VehicleDamaged',
  'VehicleRepaired',
  'TravelLegCompleted',
  'NavigationCheckRolled',
  'ForagedFor',
  'AttitudeChanged',
  'MoraleCheckRolled',
  'MoraleBroken',
  'DowntimeActivityResolved',
  'ItemChargeConsumed',
  'ItemRecharged',
  'SentientItemConflict',
  'BastionFounded',
  'BastionFacilityAdded',
  'BastionHirelingAdded',
  'BastionTurnTaken',
  'BastionDamaged',
  'BastionLevelChanged',
  'CharacterResurrected',
  'PolymorphApplied',
  'PolymorphReverted',
  'SimulacrumCreated',
  'WishGranted',
  'TrapArmed',
  'TrapTriggered',
  'TrapExpired',
  'RemoteSensorPlaced',
  'RemoteSensorModeChanged',
  'RemoteSensorRemoved',
  'RemoteSensorMoved',
  'IllusionCreated',
  'IllusionInvestigated',
  'IllusionDismissed',
  'BreathWeaponFired',
  'BreathWeaponRecharged',
  'CampaignSettingsChanged',
  'HeroPointGranted',
  'HeroPointSpent',
  'MirrorImageDeflected',
] as const satisfies ReadonlyArray<EventType>;

export type {
  DamageAppliedEvent,
  DamageComponent,
  HealedEvent,
  TempHPGrantedEvent,
  ConditionAppliedEvent,
  ConditionRemovedEvent,
  AbilityScoreDrainedEvent,
  LegendaryResistanceUsedEvent,
  LegendaryActionUsedEvent,
  CreaturePushedEvent,
  ExhaustionChangedEvent,
  DeathSaveRolledEvent,
  StabilizedEvent,
  CreatureDestroyedEvent,
  HPMaxBonusChangedEvent,
} from './combat.js';
export type {
  HeroicInspirationGrantedEvent,
  HeroicInspirationConsumedEvent,
} from './heroic-inspiration.js';
export type {
  ResourceSpentEvent,
  ResourceRestoredEvent,
  HitDieSpentEvent,
} from './resources.js';
export type {
  ShortRestStartedEvent,
  ShortRestEndedEvent,
  LongRestStartedEvent,
  LongRestEndedEvent,
} from './rest.js';
export type { CharacterCreatedEvent } from './progression.js';
export type { EventEnvelope } from './envelope.js';
export type {
  EncounterCreatedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  InitiativeRoll,
  InitiativeSwappedEvent,
  TurnStartedEvent,
  TurnEndedEvent,
  RoundEndedEvent,
  EncounterEndedEvent,
} from './encounter.js';
export type {
  AttackRolledEvent,
  DamageRolledEvent,
  DamageRoll,
  AttackAdvantage,
} from './attack.js';
export {
  DamageAppliedEventSchema,
  HealedEventSchema,
  TempHPGrantedEventSchema,
  ConditionAppliedEventSchema,
  ConditionRemovedEventSchema,
  AbilityScoreDrainedEventSchema,
  LegendaryResistanceUsedEventSchema,
  LegendaryActionUsedEventSchema,
  CreaturePushedEventSchema,
  ExhaustionChangedEventSchema,
  DeathSaveRolledEventSchema,
  StabilizedEventSchema,
  CreatureDestroyedEventSchema,
  HPMaxBonusChangedEventSchema,
} from './combat.js';
export {
  HeroicInspirationGrantedEventSchema,
  HeroicInspirationConsumedEventSchema,
} from './heroic-inspiration.js';
export {
  ResourceSpentEventSchema,
  ResourceRestoredEventSchema,
  HitDieSpentEventSchema,
} from './resources.js';
export {
  ShortRestStartedEventSchema,
  ShortRestEndedEventSchema,
  LongRestStartedEventSchema,
  LongRestEndedEventSchema,
} from './rest.js';
export { CharacterCreatedEventSchema } from './progression.js';
export { EventEnvelopeSchema } from './envelope.js';
export {
  EncounterCreatedEventSchema,
  CombatantPlacedEventSchema,
  EncounterCombatantPlacementSchema,
  EncounterStartedEventSchema,
  InitiativeRolledEventSchema,
  InitiativeRollSchema,
  InitiativeSwappedEventSchema,
  TurnStartedEventSchema,
  TurnEndedEventSchema,
  RoundEndedEventSchema,
  EncounterEndedEventSchema,
} from './encounter.js';
export type {
  CombatantPlacedEvent,
  EncounterCombatantPlacement,
} from './encounter.js';
export {
  AttackRolledEventSchema,
  DamageRolledEventSchema,
  WeaponLoadedEventSchema,
  DamageRollSchema,
  AttackAdvantageSchema,
} from './attack.js';
export type { WeaponLoadedEvent } from './attack.js';
export {
  ItemAcquiredEventSchema,
  ItemEquippedEventSchema,
  ItemUnequippedEventSchema,
  ItemAttunedEventSchema,
  ItemUnattunedEventSchema,
  ItemBuffAppliedEventSchema,
  ItemBuffRemovedEventSchema,
  ItemConsumedEventSchema,
  ItemUsedEventSchema,
  ItemDestroyedEventSchema,
  ItemTimeBudgetConsumedEventSchema,
  EquipSlotSchema,
  EQUIP_SLOTS,
} from './inventory.js';
export type {
  ItemAcquiredEvent,
  ItemEquippedEvent,
  ItemUnequippedEvent,
  ItemAttunedEvent,
  ItemUnattunedEvent,
  ItemBuffAppliedEvent,
  ItemBuffRemovedEvent,
  ItemConsumedEvent,
  ItemUsedEvent,
  ItemTimeBudgetConsumedEvent,
  EquipSlot,
} from './inventory.js';
export {
  LevelUpResolvedEventSchema,
  ChoiceRequiredEventSchema,
  ChoiceResolvedEventSchema,
  SubclassChosenEventSchema,
  HPStrategySchema,
} from './level-up.js';
export type {
  LevelUpResolvedEvent,
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
  SubclassChosenEvent,
  HPStrategy,
} from './level-up.js';
export {
  SaveRolledEventSchema,
  AbilityCheckRolledEventSchema,
  CheckAdvantageSchema,
} from './checks.js';
export type {
  SaveRolledEvent,
  AbilityCheckRolledEvent,
  CheckAdvantage,
} from './checks.js';
export {
  SpellCastDeclaredEventSchema,
  SpellCastFizzledEventSchema,
  SpellSlotConsumedEventSchema,
  PactSlotConsumedEventSchema,
  PactSlotsRegainedEventSchema,
  SpellSlotsRegainedEventSchema,
  PreparedSpellsChangedEventSchema,
  FreeCastUsedEventSchema,
  PerDayCastUsedEventSchema,
  SpellSlotSourceSchema,
} from './spellcasting.js';
export type {
  SpellCastDeclaredEvent,
  SpellCastFizzledEvent,
  SpellSlotConsumedEvent,
  PactSlotConsumedEvent,
  PactSlotsRegainedEvent,
  SpellSlotsRegainedEvent,
  PreparedSpellsChangedEvent,
  FreeCastUsedEvent,
  PerDayCastUsedEvent,
  SpellSlotSource,
} from './spellcasting.js';
export {
  ConcentrationStartedEventSchema,
  ConcentrationBrokenEventSchema,
  ConcentrationBrokenReasonSchema,
  SpellEffectStartedEventSchema,
} from './concentration.js';
export type {
  ConcentrationStartedEvent,
  ConcentrationBrokenEvent,
  ConcentrationBrokenReason,
  SpellEffectStartedEvent,
} from './concentration.js';
export { TriggerFiredEventSchema } from './triggers.js';
export type { TriggerFiredEvent } from './triggers.js';
export {
  ActionEconomyConsumedEventSchema,
  ActionReadiedEventSchema,
  RecklessAttackActivatedEventSchema,
  SteadyAimActivatedEventSchema,
  SteadyAimConsumedEventSchema,
  FastHandsActivatedEventSchema,
  DeflectAttacksUsedEventSchema,
  StunningStrikeAttemptedEventSchema,
  SavageAttackerUsedEventSchema,
  ActionEconomyKindSchema,
  ACTION_ECONOMY_KINDS,
} from './action-economy.js';
export type {
  ActionEconomyConsumedEvent,
  ActionReadiedEvent,
  RecklessAttackActivatedEvent,
  SteadyAimActivatedEvent,
  SteadyAimConsumedEvent,
  FastHandsActivatedEvent,
  DeflectAttacksUsedEvent,
  StunningStrikeAttemptedEvent,
  SavageAttackerUsedEvent,
  ActionEconomyKind,
} from './action-economy.js';
export {
  CombatantMovedEventSchema,
  DashedEventSchema,
  DisengagedEventSchema,
  OpportunityAvailableEventSchema,
} from './movement.js';
export type {
  CombatantMovedEvent,
  DashedEvent,
  DisengagedEvent,
  OpportunityAvailableEvent,
} from './movement.js';
export {
  PartyCreatedEventSchema,
  PartyMembersChangedEventSchema,
  CurrencyAcquiredEventSchema,
  CurrencySpentEventSchema,
  ItemDepositedToPartyEventSchema,
  ItemWithdrawnFromPartyEventSchema,
} from './party.js';
export type {
  PartyCreatedEvent,
  PartyMembersChangedEvent,
  CurrencyAcquiredEvent,
  CurrencySpentEvent,
  ItemDepositedToPartyEvent,
  ItemWithdrawnFromPartyEvent,
} from './party.js';
export {
  SessionStartedEventSchema,
  SessionEndedEventSchema,
  JournalEntryAddedEventSchema,
  InGameTimeAdvancedEventSchema,
} from './session.js';
export type {
  SessionStartedEvent,
  SessionEndedEvent,
  JournalEntryAddedEvent,
  InGameTimeAdvancedEvent,
} from './session.js';
export {
  LocationCreatedEventSchema,
  DoorAddedEventSchema,
  DoorStateChangedEventSchema,
  CharacterLocationChangedEventSchema,
} from './locations.js';
export type {
  LocationCreatedEvent,
  DoorAddedEvent,
  DoorStateChangedEvent,
  CharacterLocationChangedEvent,
} from './locations.js';
export {
  QuestStartedEventSchema,
  ObjectiveProgressedEventSchema,
  ObjectiveCompletedEventSchema,
  ObjectiveFailedEventSchema,
  QuestCompletedEventSchema,
  QuestFailedEventSchema,
  QuestAbandonedEventSchema,
  QuestRewardClaimedEventSchema,
  XPAwardedEventSchema,
  MilestoneAwardedEventSchema,
  MilestoneKindSchema,
  MILESTONE_KINDS,
} from './quests.js';
export type {
  QuestStartedEvent,
  ObjectiveProgressedEvent,
  ObjectiveCompletedEvent,
  ObjectiveFailedEvent,
  QuestCompletedEvent,
  QuestFailedEvent,
  QuestAbandonedEvent,
  QuestRewardClaimedEvent,
  XPAwardedEvent,
  MilestoneAwardedEvent,
  MilestoneKind,
} from './quests.js';
export {
  SpellCounteredEventSchema,
  SpellDispelledEventSchema,
  ItemIdentifiedEventSchema,
  ShieldCastEventSchema,
  AbsorbElementsCastEventSchema,
  SanctuaryProtectedEventSchema,
  ProtectionUsedEventSchema,
  GuidanceUsedEventSchema,
  UncannyDodgeUsedEventSchema,
} from './reactive-spells.js';
export type {
  SpellCounteredEvent,
  SpellDispelledEvent,
  ItemIdentifiedEvent,
  ShieldCastEvent,
  AbsorbElementsCastEvent,
  SanctuaryProtectedEvent,
  ProtectionUsedEvent,
  GuidanceUsedEvent,
  UncannyDodgeUsedEvent,
} from './reactive-spells.js';
export { WeaponMasteryActivatedEventSchema } from './weapon-mastery.js';
export type { WeaponMasteryActivatedEvent } from './weapon-mastery.js';
export { WeaponMasteriesChosenEventSchema } from './weapon-mastery.js';
export type { WeaponMasteriesChosenEvent } from './weapon-mastery.js';
export {
  MountedEventSchema,
  DismountedEventSchema,
  VehicleAcquiredEventSchema,
  VehicleBoardedEventSchema,
  VehicleDepartedEventSchema,
  VehicleDamagedEventSchema,
  VehicleRepairedEventSchema,
} from './mounts-vehicles.js';
export type {
  MountedEvent,
  DismountedEvent,
  VehicleAcquiredEvent,
  VehicleBoardedEvent,
  VehicleDepartedEvent,
  VehicleDamagedEvent,
  VehicleRepairedEvent,
} from './mounts-vehicles.js';
export {
  TravelLegCompletedEventSchema,
  NavigationCheckRolledEventSchema,
  ForagedForEventSchema,
} from './travel.js';
export type {
  TravelLegCompletedEvent,
  NavigationCheckRolledEvent,
  ForagedForEvent,
} from './travel.js';
export {
  AttitudeChangedEventSchema,
  MoraleCheckRolledEventSchema,
  MoraleBrokenEventSchema,
  AttitudeSchema,
  ATTITUDES,
} from './npc.js';
export type {
  AttitudeChangedEvent,
  MoraleCheckRolledEvent,
  MoraleBrokenEvent,
  Attitude,
} from './npc.js';
export {
  DowntimeActivityResolvedEventSchema,
  DowntimeKindSchema,
  DowntimeOutcomeSchema,
  DOWNTIME_KINDS,
  DOWNTIME_OUTCOMES,
} from './downtime.js';
export type {
  DowntimeActivityResolvedEvent,
  DowntimeKind,
  DowntimeOutcome,
} from './downtime.js';
export {
  ItemChargeConsumedEventSchema,
  ItemRechargedEventSchema,
  SentientItemConflictEventSchema,
  RechargeCadenceSchema,
  RECHARGE_CADENCES,
} from './charges.js';
export type {
  ItemChargeConsumedEvent,
  ItemRechargedEvent,
  SentientItemConflictEvent,
  RechargeCadence,
} from './charges.js';
export {
  BastionFoundedEventSchema,
  BastionFacilityAddedEventSchema,
  BastionHirelingAddedEventSchema,
  BastionTurnTakenEventSchema,
  BastionDamagedEventSchema,
  BastionLevelChangedEventSchema,
  BastionTurnOrderSchema,
  BASTION_TURN_ORDERS,
} from './bastion.js';
export type {
  BastionFoundedEvent,
  BastionFacilityAddedEvent,
  BastionHirelingAddedEvent,
  BastionTurnTakenEvent,
  BastionDamagedEvent,
  BastionLevelChangedEvent,
  BastionTurnOrder,
} from './bastion.js';
export {
  CampaignSettingsChangedEventSchema,
  HeroPointGrantedEventSchema,
  HeroPointSpentEventSchema,
} from './settings.js';
export type {
  HeroPointGrantedEvent,
  HeroPointSpentEvent,
} from './settings.js';
export type { CampaignSettingsChangedEvent } from './settings.js';
export {
  CharacterResurrectedEventSchema,
  ResurrectionSpellSchema,
  ResurrectionViaSchema,
  RESURRECTION_SPELLS,
  RESURRECTION_VIAS,
} from './resurrection.js';
export type {
  CharacterResurrectedEvent,
  ResurrectionSpell,
  ResurrectionVia,
} from './resurrection.js';
export {
  PolymorphAppliedEventSchema,
  PolymorphRevertedEventSchema,
  SimulacrumCreatedEventSchema,
  WishGrantedEventSchema,
  PolymorphFormSchema,
  PolymorphKindSchema,
  POLYMORPH_KINDS,
} from './transformations.js';
export type {
  PolymorphAppliedEvent,
  PolymorphRevertedEvent,
  SimulacrumCreatedEvent,
  WishGrantedEvent,
  PolymorphForm,
  PolymorphKind,
} from './transformations.js';
export {
  CompanionSummonedEventSchema,
  CompanionDismissedEventSchema,
} from './summons.js';
export type {
  CompanionSummonedEvent,
  CompanionDismissedEvent,
} from './summons.js';
export {
  TrapArmedEventSchema,
  TrapTriggeredEventSchema,
  TrapExpiredEventSchema,
  TRAP_EXPIRY_REASONS,
  TrapExpiryReasonSchema,
} from './traps.js';
export type {
  TrapArmedEvent,
  TrapTriggeredEvent,
  TrapExpiredEvent,
  TrapExpiryReason,
} from './traps.js';
export {
  RemoteSensorPlacedEventSchema,
  RemoteSensorModeChangedEventSchema,
  RemoteSensorRemovedEventSchema,
  RemoteSensorMovedEventSchema,
  SENSOR_REMOVAL_REASONS,
  SensorRemovalReasonSchema,
} from './sensors.js';
export type {
  RemoteSensorPlacedEvent,
  RemoteSensorModeChangedEvent,
  RemoteSensorRemovedEvent,
  RemoteSensorMovedEvent,
  SensorRemovalReason,
} from './sensors.js';
export {
  IllusionCreatedEventSchema,
  IllusionInvestigatedEventSchema,
  IllusionDismissedEventSchema,
  ILLUSION_DISMISSAL_REASONS,
  IllusionDismissalReasonSchema,
} from './illusions.js';
export type {
  IllusionCreatedEvent,
  IllusionInvestigatedEvent,
  IllusionDismissedEvent,
  IllusionDismissalReason,
} from './illusions.js';
export {
  BreathWeaponFiredEventSchema,
  BreathWeaponRechargedEventSchema,
} from './breath-weapon.js';
export type {
  BreathWeaponFiredEvent,
  BreathWeaponRechargedEvent,
} from './breath-weapon.js';
export {
  SaveActionExpendedEventSchema,
  SaveActionRechargedEventSchema,
} from './save-action.js';
export type {
  SaveActionExpendedEvent,
  SaveActionRechargedEvent,
} from './save-action.js';
export { ParryUsedEventSchema } from './parry.js';
export type { ParryUsedEvent } from './parry.js';
export { MirrorImageDeflectedEventSchema } from './mirror-image.js';
export type { MirrorImageDeflectedEvent } from './mirror-image.js';
