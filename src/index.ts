export { SCHEMA_VERSION } from './version.js';
export type { SchemaVersion } from './version.js';

export {
  newCharacterId,
  newCreatureId,
  newPartyId,
  newEncounterId,
  newCampaignId,
  newSessionId,
  newLocationId,
  newQuestId,
  newJournalEntryId,
  newEventId,
  newChoiceId,
  newEffectInstanceId,
  newAppliedConditionId,
  newItemInstanceId,
  asCharacterId,
  asCreatureId,
  asSpeciesId,
  asBackgroundId,
  asClassId,
  asSubclassId,
  asClassFeatureId,
  asFeatId,
  asSpellId,
  asConditionId,
  asMonsterStatblockId,
  asResourceId,
  asItemDefinitionId,
  asItemInstanceId,
  asContentPackId,
  asHandlerId,
} from './ids.js';
export type {
  CharacterId,
  CreatureId,
  CombatantId,
  PartyId,
  EncounterId,
  CampaignId,
  SessionId,
  LocationId,
  QuestId,
  JournalEntryId,
  EventId,
  ChoiceId,
  EffectInstanceId,
  AppliedConditionId,
  SpeciesId,
  BackgroundId,
  ClassId,
  SubclassId,
  ClassFeatureId,
  FeatId,
  SpellId,
  ConditionId,
  MonsterStatblockId,
  ResourceId,
  ItemDefinitionId,
  ItemInstanceId,
  ContentPackId,
  HandlerId,
} from './ids.js';

export {
  AbilityScoreSchema,
  AbilityScoreValueSchema,
  AbilityScoresSchema,
  SizeSchema,
  CreatureTypeSchema,
  DamageTypeSchema,
  SkillSchema,
  ProficiencyLevelSchema,
  HitDieSchema,
  MovementModeSchema,
  SpeedSchema,
  SenseSchema,
  SensesSchema,
  SpellSchoolSchema,
  SpellLevelSchema,
  CharacterLevelSchema,
  ExhaustionLevelSchema,
  AlignmentSchema,
  ULIDSchema,
  CurrencySchema,
  RechargeSchema,
  WeaponPropertySchema,
  WeaponMasterySchema,
  DiceExpressionSchema,
  ABILITY_SCORES,
  SIZES,
  CREATURE_TYPES,
  DAMAGE_TYPES,
  SKILLS,
  WEAPON_PROPERTIES,
  WEAPON_MASTERIES,
  SKILL_ABILITY,
  PROFICIENCY_MULTIPLIER,
  CURRENCY_KEYS,
  ABILITY_SCORE_MIN,
  ABILITY_SCORE_MAX,
  SPELL_LEVEL_MIN,
  SPELL_LEVEL_MAX,
  CHARACTER_LEVEL_MIN,
  CHARACTER_LEVEL_MAX,
  EXHAUSTION_MIN,
  EXHAUSTION_MAX,
} from './schemas/primitives.js';
export { FormulaSchema, isFormula } from './schemas/formula.js';
export { PredicateSchema, isPredicate } from './schemas/predicate.js';
export { EffectSchema, EFFECT_KINDS, ModifierTargetSchema, RollTargetSchema } from './schemas/effects.js';
export {
  ConditionSchema,
  SpeciesSchema,
  BackgroundSchema,
  FeatSchema,
  ClassSchema,
  ClassFeatureSchema,
  SubclassSchema,
  SpellcastingProgressionSchema,
  SpellSchema,
  ItemDefinitionSchema,
  WeaponSchema,
  ArmorSchema,
  ToolSchema,
  MagicItemSchema,
  ConsumableSchema,
  GearSchema,
  MonsterStatblockSchema,
  MonsterMultiattackSchema,
} from './schemas/content/index.js';
export {
  CharacterSchema,
  HPSchema,
  DeathSavesSchema,
  ClassEnrollmentSchema,
  AppliedConditionSchema,
  ResourceStateSchema,
  ItemInstanceSchema,
  PendingChoiceSchema,
  ChoiceOptionSchema,
  CampaignStateSchema,
  emptyCampaignState,
  computeTotalLevel,
} from './schemas/runtime/index.js';
export {
  EventSchema,
  EVENT_TYPES,
  EventEnvelopeSchema,
  DamageAppliedEventSchema,
  HealedEventSchema,
  TempHPGrantedEventSchema,
  ConditionAppliedEventSchema,
  ConditionRemovedEventSchema,
  ExhaustionChangedEventSchema,
  DeathSaveRolledEventSchema,
  StabilizedEventSchema,
  ResourceSpentEventSchema,
  ResourceRestoredEventSchema,
  HitDieSpentEventSchema,
  ShortRestStartedEventSchema,
  ShortRestEndedEventSchema,
  LongRestStartedEventSchema,
  LongRestEndedEventSchema,
  CharacterCreatedEventSchema,
  EncounterCreatedEventSchema,
  EncounterStartedEventSchema,
  InitiativeRolledEventSchema,
  InitiativeRollSchema,
  TurnStartedEventSchema,
  TurnEndedEventSchema,
  RoundEndedEventSchema,
  EncounterEndedEventSchema,
  AttackRolledEventSchema,
  DamageRolledEventSchema,
  DamageRollSchema,
  AttackAdvantageSchema,
  ItemAcquiredEventSchema,
  LevelUpResolvedEventSchema,
  ChoiceRequiredEventSchema,
  ChoiceResolvedEventSchema,
  HPStrategySchema,
  SaveRolledEventSchema,
  AbilityCheckRolledEventSchema,
  CheckAdvantageSchema,
} from './schemas/events/index.js';
export {
  EncounterSchema,
  CombatantSchema,
  EncounterStatusSchema,
  PartySchema,
  CURRENCY_DENOMINATIONS,
  emptyCurrency,
  totalInCopper,
  addCurrency,
  subtractCurrency,
} from './schemas/runtime/index.js';
export type { Party, CurrencyDenomination, Currency } from './schemas/runtime/index.js';
export {
  SessionSchema,
  JournalEntrySchema,
  JournalAuthorKindSchema,
  JournalVisibilitySchema,
  JOURNAL_AUTHOR_KINDS,
  JOURNAL_VISIBILITIES,
  InGameTimeSchema,
  breakdownInGameTime,
  formatInGameTime,
  advanceInGameTime,
} from './schemas/runtime/index.js';
export type {
  Session,
  JournalEntry,
  JournalAuthorKind,
  JournalVisibility,
  InGameTime,
  InGameClockBreakdown,
} from './schemas/runtime/index.js';
export {
  LocationSchema,
  LocationMapSchema,
  DoorSchema,
  TerrainKindSchema,
  DoorStateSchema,
  TERRAIN_KINDS,
  DOOR_STATES,
  DEFAULT_CELL_SIZE_FEET,
  NORMAL_MOVEMENT_COST,
  DIFFICULT_MOVEMENT_COST,
} from './schemas/runtime/index.js';
export type {
  Location,
  LocationMap,
  Door,
  TerrainKind,
  DoorState,
} from './schemas/runtime/index.js';
export {
  LocationCreatedEventSchema,
  DoorAddedEventSchema,
  DoorStateChangedEventSchema,
  CharacterLocationChangedEventSchema,
} from './schemas/events/index.js';
export type {
  LocationCreatedEvent,
  DoorAddedEvent,
  DoorStateChangedEvent,
  CharacterLocationChangedEvent,
} from './schemas/events/index.js';
export {
  QuestSchema,
  QuestObjectiveSchema,
  QuestRewardSchema,
  QuestStatusSchema,
  ObjectiveStatusSchema,
  QUEST_STATUSES,
  OBJECTIVE_STATUSES,
} from './schemas/runtime/index.js';
export type {
  Quest,
  QuestObjective,
  QuestReward,
  QuestStatus,
  ObjectiveStatus,
} from './schemas/runtime/index.js';
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
} from './schemas/events/index.js';
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
} from './schemas/events/index.js';

export type * from './types/index.js';

export {
  ContentPackSchema,
  loadContentPack,
  resolveContent,
  mergeContent,
  detectIdCollisions,
  validateCrossReferences,
  validatePacks,
  ContentPackLoadError,
} from './content/index.js';
export type { ContentPack, ResolvedContent, ContentValidationIssue, ContentPackIssue } from './content/index.js';
export { loadStarterPack, STARTER_PACK_RAW } from './content/packs/starter.js';
export { querySpells, queryMonsters, queryItems, buildCharacterSheet, buildEncounterView } from './query/index.js';
export {
  legalMoveDestinations,
  actionEconomy,
  availableActions,
  legalTargets,
  castableSpells,
} from './query/index.js';
// Slice 706 (A3): tactical enemy AI policy, graduated from scripts/ so
// consumers can import it from the package.
export {
  planTacticalMove,
  classifyTacticalRole,
  pickByTotalOrder,
} from './ai/index.js';
export type {
  TacticalRole,
  TacticalRoleKind,
  TacticalMove,
  TacticalMoveInput,
} from './ai/index.js';
export type {
  MoveDestination,
  ActionEconomyView,
  AvailableAction,
  AffordanceActionId,
  TargetCandidate,
  CastableSpell,
  SpellFilter,
  MonsterFilter,
  ItemFilter,
  CharacterSheet,
  SkillView,
  PassiveScores,
  InitiativeView,
  AttackView,
  SpellcastingView,
  SpellcastingClassView,
  SpellListEntry,
  SpellLevelGroup,
  InventoryView,
  InventoryEntry,
  EquipSlot,
  EncounterView,
  CombatantView,
  CombatantConditionView,
  CombatantTurnView,
} from './query/index.js';

export {
  DefaultRNG,
  defaultRNG,
  SeededRNG,
  seededRNG,
  ThrowOnCallRNG,
  throwOnCallRNG,
  rollDie,
  rollDice,
  rollExpression,
  parseDiceExpression,
  NeedRoll,
  SeededRollProvider,
  SuppliedRollProvider,
  withRollProvider,
  getActiveRollProvider,
} from './rng/index.js';
export type { RNG, DieRoll, DiceRollResult, RollProvider, RollContext } from './rng/index.js';

export {
  abilityModifier,
  proficiencyBonus,
  computeAC,
  computeSavingThrow,
  computeAttackBonus,
  computeWeaponDamage,
  computeUnarmedStrike,
  getEffectiveSpeed,
  getEffectiveSpeeds,
  computeSpellSaveDC,
  computeSpellAttackBonus,
  computeSpellSlots,
  spellSlotsForLevel,
  buildEffectStack,
  computeDerivedCharacter,
  computeKnownLanguages,
  computeAbilityCheck,
  computePassiveScore,
  terrainAt,
  movementCostFor,
  movementCostAt,
  chebyshevDistanceFeet,
  isInRangeFeet,
  hasLineOfSight,
  hasLineOfEffect,
  runtimeMultiattackFromStatblock,
  getEffectiveFeatIds,
} from './derive/index.js';
export type {
  ACResult,
  AttackResult,
  WeaponDamage,
  WeaponDamageResult,
  ComputeUnarmedStrikeInput,
  UnarmedStrikeResult,
  GetEffectiveSpeedInput,
  EffectiveSpeeds,
  EncumbranceResult,
  EncumbranceLevel,
  SaveResult,
  SpellDCResult,
  SpellSlotsResult,
  DerivedCharacter,
  AbilityCheckResult,
} from './derive/index.js';

export { evaluateFormula, evaluatePredicate, EffectAccumulator } from './effects/index.js';
export type { FormulaContext, PredicateContext } from './effects/index.js';

export { createEngine } from './engine/index.js';
export { apply, applyAll } from './engine/apply.js';
export { replay } from './engine/replay.js';
export { commit } from './engine/commit.js';
export { undo, redo } from './engine/undo-redo.js';
export { performIntent, serializeCampaign, loadCampaign, createPC } from './engine/conveniences.js';
export type { CreatePCOptions, SerializedCampaign } from './engine/conveniences.js';
export type { Engine, Campaign, CreateEngineOptions, CampaignInit, PlanResult } from './engine/index.js';
export {
  planShortRest,
  planLongRest,
  planAttack,
  planOpportunityAttack,
  planCreateEncounter,
  planRollInitiative,
  planStartEncounter,
  planBeginFirstTurn,
  planAdvanceTurn,
  planEndEncounter,
  planLevelUp,
  planResolveChoice,
  planSave,
  planAbilityCheck,
  planGrapple,
  planShove,
  planHide,
  planCounterspell,
  planDispelMagic,
  planIdentify,
  planWeaponMastery,
  planForage,
  planNavigationCheck,
  planMoraleCheck,
  planReactionRoll,
} from './engine/plan/index.js';
export type {
  ShortRestIntent,
  LongRestIntent,
  RestIntent,
  AttackIntent,
  CleaveIntent,
  OpportunityAttackIntent,
  CreateEncounterIntent,
  RollInitiativeIntent,
  StartEncounterIntent,
  AdvanceTurnIntent,
  BeginFirstTurnIntent,
  EndEncounterIntent,
  LevelUpIntent,
  ResolveChoiceIntent,
  SaveIntent,
  AbilityCheckIntent,
  CastSpellIntent,
  CasterChoice,
  CheckConcentrationIntent,
  ExpireSpellDurationsIntent,
  TickAuraIntent,
  MoveIntent,
  DashIntent,
  DisengageIntent,
  MistyStepIntent,
  DimensionDoorIntent,
  GrappleIntent,
  ShoveIntent,
  HideIntent,
  CounterspellIntent,
  DispelMagicIntent,
  IdentifyIntent,
  ShieldIntent,
  ShieldOutcome,
  ConsumeGuidanceIntent,
  ConsumeGuidanceOutcome,
  ConsumeResistanceIntent,
  ConsumeResistanceOutcome,
  WeaponMasteryIntent,
  ForageIntent,
  NavigationCheckIntent,
  ForcedMarchIntent,
  MoraleCheckIntent,
  ReactionRollIntent,
  ResurrectIntent,
  ResurrectVia,
  PolymorphIntent,
  PolymorphOutcome,
  WildShapeIntent,
  SimulacrumIntent,
  SimulacrumOutcome,
  WishIntent,
  WishOutcome,
  DismissCompanionIntent,
  TriggerTrapIntent,
  GrantInitialHeroPointsIntent,
  SpendHeroPointIntent,
  SpendHeroPointOutcome,
} from './engine/plan/index.js';
export {
  AttitudeChangedEventSchema,
  MoraleCheckRolledEventSchema,
  MoraleBrokenEventSchema,
  AttitudeSchema,
  ATTITUDES,
} from './schemas/events/index.js';
export type {
  AttitudeChangedEvent,
  MoraleCheckRolledEvent,
  MoraleBrokenEvent,
  Attitude,
} from './schemas/events/index.js';
export {
  DowntimeActivityResolvedEventSchema,
  DowntimeKindSchema,
  DowntimeOutcomeSchema,
  DOWNTIME_KINDS,
  DOWNTIME_OUTCOMES,
} from './schemas/events/index.js';
export type {
  DowntimeActivityResolvedEvent,
  DowntimeKind,
  DowntimeOutcome,
} from './schemas/events/index.js';
export {
  ItemChargeConsumedEventSchema,
  ItemRechargedEventSchema,
  SentientItemConflictEventSchema,
  RechargeCadenceSchema,
  RECHARGE_CADENCES,
} from './schemas/events/index.js';
export type {
  ItemChargeConsumedEvent,
  ItemRechargedEvent,
  SentientItemConflictEvent,
  RechargeCadence,
} from './schemas/events/index.js';
export {
  BastionFoundedEventSchema,
  BastionFacilityAddedEventSchema,
  BastionHirelingAddedEventSchema,
  BastionTurnTakenEventSchema,
  BastionDamagedEventSchema,
  BastionLevelChangedEventSchema,
  BastionTurnOrderSchema,
  BASTION_TURN_ORDERS,
} from './schemas/events/index.js';
export type {
  BastionFoundedEvent,
  BastionFacilityAddedEvent,
  BastionHirelingAddedEvent,
  BastionTurnTakenEvent,
  BastionDamagedEvent,
  BastionLevelChangedEvent,
  BastionTurnOrder,
} from './schemas/events/index.js';
export {
  CampaignSettingsSchema,
  defaultCampaignSettings,
} from './schemas/runtime/index.js';
export type { CampaignSettings } from './schemas/runtime/index.js';
export { CampaignSettingsChangedEventSchema } from './schemas/events/index.js';
export type { CampaignSettingsChangedEvent } from './schemas/events/index.js';
export {
  CharacterResurrectedEventSchema,
  ResurrectionSpellSchema,
  ResurrectionViaSchema,
  RESURRECTION_SPELLS,
  RESURRECTION_VIAS,
} from './schemas/events/index.js';
export type {
  CharacterResurrectedEvent,
  ResurrectionSpell,
  ResurrectionVia,
} from './schemas/events/index.js';
export {
  PolymorphAppliedEventSchema,
  PolymorphRevertedEventSchema,
  SimulacrumCreatedEventSchema,
  WishGrantedEventSchema,
  PolymorphFormSchema,
  PolymorphKindSchema,
  POLYMORPH_KINDS,
} from './schemas/events/index.js';
export type {
  PolymorphAppliedEvent,
  PolymorphRevertedEvent,
  SimulacrumCreatedEvent,
  WishGrantedEvent,
  PolymorphForm,
  PolymorphKind,
} from './schemas/events/index.js';
export {
  CompanionSummonedEventSchema,
  CompanionDismissedEventSchema,
} from './schemas/events/index.js';
export type {
  CompanionSummonedEvent,
  CompanionDismissedEvent,
} from './schemas/events/index.js';
export {
  TrapArmedEventSchema,
  TrapTriggeredEventSchema,
  TrapExpiredEventSchema,
  TRAP_EXPIRY_REASONS,
  TrapExpiryReasonSchema,
} from './schemas/events/index.js';
export type {
  TrapArmedEvent,
  TrapTriggeredEvent,
  TrapExpiredEvent,
  TrapExpiryReason,
} from './schemas/events/index.js';
export {
  SpellCounteredEventSchema,
  SpellDispelledEventSchema,
  ItemIdentifiedEventSchema,
} from './schemas/events/index.js';
export type {
  SpellCounteredEvent,
  SpellDispelledEvent,
  ItemIdentifiedEvent,
} from './schemas/events/index.js';
export { WeaponMasteryActivatedEventSchema } from './schemas/events/index.js';
export type { WeaponMasteryActivatedEvent } from './schemas/events/index.js';
export {
  VehicleSchema,
  VehicleKindSchema,
  VEHICLE_KINDS,
} from './schemas/runtime/index.js';
export type { Vehicle, VehicleKind } from './schemas/runtime/index.js';
export {
  MountedEventSchema,
  DismountedEventSchema,
  VehicleAcquiredEventSchema,
  VehicleBoardedEventSchema,
  VehicleDepartedEventSchema,
  VehicleDamagedEventSchema,
  VehicleRepairedEventSchema,
} from './schemas/events/index.js';
export type {
  MountedEvent,
  DismountedEvent,
  VehicleAcquiredEvent,
  VehicleBoardedEvent,
  VehicleDepartedEvent,
  VehicleDamagedEvent,
  VehicleRepairedEvent,
} from './schemas/events/index.js';
export {
  TravelLegCompletedEventSchema,
  NavigationCheckRolledEventSchema,
  ForagedForEventSchema,
} from './schemas/events/index.js';
export type {
  TravelLegCompletedEvent,
  NavigationCheckRolledEvent,
  ForagedForEvent,
} from './schemas/events/index.js';

export type { HandlerRegistry, EffectHandler, ActionHandler, HandlerContext, ContentBundle } from './handlers/index.js';
export { HANDLER_API_VERSION, mergeHandlerRegistries } from './handlers/index.js';

export { migrate } from './migrations/index.js';
