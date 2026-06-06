import type { CampaignState } from '../schemas/runtime/campaign.js';
import { emptyCampaignState } from '../schemas/runtime/campaign.js';
import type { Event } from '../schemas/events/index.js';
import type { ContentPack, ResolvedContent } from '../content/pack.js';
import { resolveContent } from '../content/pack.js';
import { validateCrossReferences } from '../content/validate.js';
import type { RNG } from '../rng/index.js';
import { defaultRNG } from '../rng/default.js';
import type { HandlerRegistry, HandlerContext, ContentBundle } from '../handlers/index.js';
import { mergeHandlerRegistries } from '../handlers/index.js';
import { apply, applyAll } from './apply.js';
import { replay } from './replay.js';
import { commit, type Campaign } from './commit.js';
import { undo, redo } from './undo-redo.js';

export { apply, applyAll } from './apply.js';
export { replay } from './replay.js';
export { commit } from './commit.js';
export { undo, redo } from './undo-redo.js';
export { performIntent, serializeCampaign, loadCampaign, createPC } from './conveniences.js';
export { seedResourcesFromContent } from './seed-resources.js';
export type { CreatePCOptions, SerializedCampaign } from './conveniences.js';
import { performIntent } from './conveniences.js';
import {
  planShortRest,
  planLongRest,
  planAttack,
  planCleave,
  planCreateEncounter,
  planPlaceCombatant,
  planRollInitiative,
  planSwapInitiative,
  planStartEncounter,
  planBeginFirstTurn,
  planAdvanceTurn,
  planEndEncounter,
  planLevelUp,
  planResolveChoice,
  planOfferCharacterChoices,
  planOfferLongRestChoices,
  type OfferCharacterChoicesIntent,
  type OfferLongRestChoicesIntent,
  planSave,
  planAbilityCheck,
  planCastSpell,
  planCheckConcentration,
  planExpireSpellDurations,
  planTickAura,
  planTickMovementDamage,
  planTickRecurring,
  planTickRecurringSave,
  planOpportunityAttack,
  planMove,
  planDash,
  planDisengage,
  planDodge,
  planMistyStep,
  planThunderStep,
  planDimensionDoor,
  planActionSurge,
  planSacredWeapon,
  planChooseWeaponMasteries,
  planConjurePactWeapon,
  planInnateSorcery,
  planSelfRestoration,
  planSuperiorDefense,
  planPaladinsSmite,
  planDivineIntervention,
  planConsumeItem,
  planUseItem,
  planMagicWeapon,
  planRecklessAttack,
  planSteadyAim,
  planFastHands,
  planDeflectAttacks,
  planStunningStrike,
  planFlurryOfBlows,
  planPatientDefense,
  planStepOfTheWind,
  planAdrenalineRush,
  planStonecunning,
  planDragonbornBreath,
  planConsumeHeroicInspiration,
  planSecondWind,
  planUseHealersKit,
  planRage,
  planHelp,
  planReady,
  planBardicInspiration,
  planLayOnHands,
  planSearch,
  planStudy,
  planInfluence,
  planUtilize,
  planCloudsJaunt,
  planStonesEndurance,
  planStormsThunder,
  planNimbleEscape,
  planCunningAction,
  planExpeditiousRetreatDash,
  planStirgeDrain,
  planDetachStirge,
  planTurnUndead,
  planDivineSpark,
  planUncannyMetabolism,
  planMagicalCunning,
  planIntimidatingPresence,
  planDragonWings,
  planPreserveLife,
  planLandsAid,
  planWholenessOfBody,
  planPeerlessSkill,
  planTacticalMind,
  planFrenzy,
  planExhaleDragonsBreath,
  planBlinkTurnEnd,
  planCuttingWords,
  planMetamagic,
  planWildCompanion,
  planEquip,
  planOffHandAttack,
  planMultiattack,
  planFalling,
  planGrapple,
  planShove,
  planHide,
  planCounterspell,
  planDispelMagic,
  planRemoveCurse,
  planClairvoyance,
  planSwitchSensorMode,
  planRemoveSensor,
  planScrying,
  planArcaneEye,
  planMoveSensor,
  planSilentImage,
  planMajorImage,
  planInvestigateIllusion,
  planDismissIllusion,
  planBreathWeapon,
  planIdentify,
  planShield,
  planSanctuaryWardSave,
  planProtection,
  planConsumeGuidance,
  planConsumeResistance,
  planUncannyDodge,
  planWeaponMastery,
  planForage,
  planNavigationCheck,
  planForcedMarch,
  planGrantInitialHeroPoints,
  planSpendHeroPoint,
  planMoraleCheck,
  planReactionRoll,
  planResurrect,
  planPolymorph,
  planWildShape,
  planSimulacrum,
  planWish,
  planDismissCompanion,
  planTriggerTrap,
  type GrappleIntent,
  type ShoveIntent,
  type HideIntent,
  type CounterspellIntent,
  type DispelMagicIntent,
  type RemoveCurseIntent,
  type ClairvoyanceIntent,
  type SwitchSensorModeIntent,
  type RemoveSensorIntent,
  type ScryingIntent,
  type ScryingOutcome,
  type ArcaneEyeIntent,
  type MoveSensorIntent,
  type SilentImageIntent,
  type MajorImageIntent,
  type InvestigateIllusionIntent,
  type DismissIllusionIntent,
  type BreathWeaponIntent,
  type IdentifyIntent,
  type ShieldIntent,
  type ShieldOutcome,
  type SanctuaryWardSaveIntent,
  type SanctuaryWardSaveOutcome,
  type ProtectionIntent,
  type ProtectionOutcome,
  type ConsumeGuidanceIntent,
  type ConsumeGuidanceOutcome,
  type ConsumeResistanceIntent,
  type ConsumeResistanceOutcome,
  type UncannyDodgeIntent,
  type UncannyDodgeOutcome,
  type WeaponMasteryIntent,
  type ForageIntent,
  type NavigationCheckIntent,
  type ForcedMarchIntent,
  type GrantInitialHeroPointsIntent,
  type SpendHeroPointIntent,
  type SpendHeroPointOutcome,
  type MoraleCheckIntent,
  type ReactionRollIntent,
  type ResurrectIntent,
  type PolymorphIntent,
  type PolymorphOutcome,
  type WildShapeIntent,
  type SimulacrumIntent,
  type SimulacrumOutcome,
  type WishIntent,
  type WishOutcome,
  type DismissCompanionIntent,
  type TriggerTrapIntent,
  type RestIntent,
  type AttackIntent,
  type CleaveIntent,
  type OpportunityAttackIntent,
  type MoveIntent,
  type DashIntent,
  type DisengageIntent,
  type DodgeIntent,
  type MistyStepIntent,
  type ThunderStepIntent,
  type DimensionDoorIntent,
  type ActionSurgeIntent,
  type SacredWeaponIntent,
  type ChooseWeaponMasteriesIntent,
  type ConjurePactWeaponIntent,
  type InnateSorceryIntent,
  type SelfRestorationIntent,
  type SuperiorDefenseIntent,
  type PaladinsSmiteIntent,
  type DivineInterventionIntent,
  type ConsumeItemIntent,
  type UseItemIntent,
  type MagicWeaponIntent,
  type RecklessAttackIntent,
  type SteadyAimIntent,
  type FastHandsIntent,
  type DeflectAttacksIntent,
  type DeflectAttacksOutcome,
  type StunningStrikeIntent,
  type FlurryOfBlowsIntent,
  type PatientDefenseIntent,
  type StepOfTheWindIntent,
  type AdrenalineRushIntent,
  type StonecunningIntent,
  type DragonbornBreathIntent,
  type ConsumeHeroicInspirationIntent,
  type SecondWindIntent,
  type UseHealersKitIntent,
  type RageIntent,
  type HelpIntent,
  type ReadyIntent,
  type BardicInspirationIntent,
  type LayOnHandsIntent,
  type SearchIntent,
  type StudyIntent,
  type InfluenceIntent,
  type UtilizeIntent,
  type CloudsJauntIntent,
  type StonesEnduranceIntent,
  type StonesEnduranceOutcome,
  type StormsThunderIntent,
  type StormsThunderOutcome,
  type NimbleEscapeIntent,
  type CunningActionIntent,
  type ExpeditiousRetreatDashIntent,
  type StirgeDrainIntent,
  type DetachStirgeIntent,
  type TurnUndeadIntent,
  type DivineSparkIntent,
  type UncannyMetabolismIntent,
  type MagicalCunningIntent,
  type IntimidatingPresenceIntent,
  type DragonWingsIntent,
  type PreserveLifeIntent,
  type LandsAidIntent,
  type WholenessOfBodyIntent,
  type PeerlessSkillIntent,
  type PeerlessSkillOutcome,
  type TacticalMindIntent,
  type TacticalMindOutcome,
  type FrenzyIntent,
  type ExhaleDragonsBreathIntent,
  type BlinkTurnEndIntent,
  type CuttingWordsIntent,
  type CuttingWordsOutcome,
  type MetamagicIntent,
  type WildCompanionIntent,
  type EquipIntent,
  type OffHandAttackIntent,
  type MultiattackIntent,
  type FallingIntent,
  type CreateEncounterIntent,
  type PlaceCombatantIntent,
  type RollInitiativeIntent,
  type SwapInitiativeIntent,
  type StartEncounterIntent,
  type AdvanceTurnIntent,
  type BeginFirstTurnIntent,
  type EndEncounterIntent,
  type LevelUpIntent,
  type ResolveChoiceIntent,
  type SaveIntent,
  type AbilityCheckIntent,
  type CastSpellIntent,
  type CheckConcentrationIntent,
  type ExpireSpellDurationsIntent,
  type TickAuraIntent,
  type TickMovementDamageIntent,
  type TickRecurringIntent,
  type TickRecurringSaveIntent,
} from './plan/index.js';
import { newCampaignId, newEventId, newAppliedConditionId, newEffectInstanceId } from '../ids.js';
import { nowIso } from '../internal/clock.js';
import { rollDie, rollExpression } from '../rng/dice.js';
import { withRollProvider as withRollProviderScope, type RollProvider } from '../rng/roll-provider.js';
import { HANDLER_API_VERSION } from '../handlers/index.js';
import { assertActorCanAct } from './plan/_actor-state.js';
import { assertReactionAvailable, economyConsumedIfEncountered } from './plan/reactive-spells.js';
import { computeAvailableSpellSlots } from '../derive/spell-slots.js';
import type { ULID } from './ids-utils.js';
import { SCHEMA_VERSION } from '../version.js';
import { computeAC } from '../derive/ac.js';
import { computeSavingThrow } from '../derive/save.js';
import { computeAttackBonus } from '../derive/attack.js';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../derive/spell-dc.js';
import { computeDerivedCharacter } from '../derive/character-view.js';
import { computeSpellSlots } from '../derive/spell-slots.js';
import { abilityModifier, proficiencyBonus } from '../derive/ability.js';
import type { AbilityScore } from '../schemas/primitives.js';

export interface CreateEngineOptions {
  readonly rng?: RNG;
  // Plain content packs (data only). Optional when `bundles` is supplied.
  readonly contentPacks?: ReadonlyArray<ContentPack>;
  // Content packs paired with the behavior they supply, as single units.
  // A bundle's pack joins `contentPacks`; its handlers merge into the
  // registry (handlerId collisions across bundles throw).
  readonly bundles?: ReadonlyArray<ContentBundle>;
  // Standalone handler registry (merged with every bundle's handlers).
  readonly handlers?: HandlerRegistry;
}

export interface CampaignInit {
  readonly id?: string;
  readonly name: string;
}

export interface PlanResult {
  readonly events: ReadonlyArray<Event>;
}

export interface Engine {
  readonly content: ResolvedContent;
  readonly schemaVersion: number;
  readonly rng: RNG;

  createCampaign(init: CampaignInit): Campaign;

  apply(state: CampaignState, event: Event): CampaignState;
  applyAll(state: CampaignState, events: ReadonlyArray<Event>): CampaignState;
  replay(events: ReadonlyArray<Event>): CampaignState;
  commit(campaign: Campaign, events: ReadonlyArray<Event>): Campaign;
  undo(campaign: Campaign): Campaign;
  redo(campaign: Campaign): Campaign;
  do(campaign: Campaign, intent: { readonly type: string } & Record<string, unknown>): Campaign;

  // Slice 704 (A2): resolve ONE planning call against a chosen die-typed
  // RollProvider without making planning async. Installs `provider` as the
  // ambient roll source for the synchronous `fn`, restoring the previous
  // one afterward. With a SuppliedRollProvider, `fn` may throw NeedRoll
  // when the queue is exhausted; planning is pure, so the caller can
  // prompt for the die, extend the queue, and re-attempt `fn`.
  withRollProvider<T>(provider: RollProvider, fn: () => T): T;

  plan: {
    // Consumer-extensible action seam: dispatches to a handler registered
    // under `opts.handlers.action[handlerId]`. Lets a content pack ship the
    // behavior for a bespoke spell/item/action alongside its JSON, instead
    // of the engine hardcoding it. See docs/plugin-api-design.md.
    custom(state: CampaignState, intent: { handlerId: string; params?: unknown; at?: string }): PlanResult;
    shortRest(state: CampaignState, intent: { participantIds: ReadonlyArray<string>; at?: string }): PlanResult;
    longRest(state: CampaignState, intent: { participantIds: ReadonlyArray<string>; at?: string }): PlanResult;
    rest(state: CampaignState, intent: RestIntent): PlanResult;
    attack(state: CampaignState, intent: Omit<AttackIntent, 'type'>): PlanResult;
    cleave(state: CampaignState, intent: Omit<CleaveIntent, 'type'>): PlanResult;
    opportunityAttack(state: CampaignState, intent: Omit<OpportunityAttackIntent, 'type'>): PlanResult;
    createEncounter(
      state: CampaignState,
      intent: Omit<CreateEncounterIntent, 'type'>,
    ): { events: ReadonlyArray<Event>; encounterId: string };
    placeCombatant(state: CampaignState, intent: Omit<PlaceCombatantIntent, 'type'>): PlanResult;
    rollInitiative(state: CampaignState, intent: Omit<RollInitiativeIntent, 'type'>): PlanResult;
    swapInitiative(state: CampaignState, intent: Omit<SwapInitiativeIntent, 'type'>): PlanResult;
    startEncounter(state: CampaignState, intent: Omit<StartEncounterIntent, 'type'>): PlanResult;
    beginFirstTurn(state: CampaignState, intent: Omit<BeginFirstTurnIntent, 'type'>): PlanResult;
    advanceTurn(state: CampaignState, intent: Omit<AdvanceTurnIntent, 'type'>): PlanResult;
    endEncounter(state: CampaignState, intent: Omit<EndEncounterIntent, 'type'>): PlanResult;
    levelUp(state: CampaignState, intent: Omit<LevelUpIntent, 'type'>): PlanResult;
    resolveChoice(state: CampaignState, intent: Omit<ResolveChoiceIntent, 'type'>): PlanResult;
    offerCharacterChoices(state: CampaignState, intent: Omit<OfferCharacterChoicesIntent, 'type'>): PlanResult;
    offerLongRestChoices(state: CampaignState, intent: Omit<OfferLongRestChoicesIntent, 'type'>): PlanResult;
    save(state: CampaignState, intent: Omit<SaveIntent, 'type'>): PlanResult;
    abilityCheck(state: CampaignState, intent: Omit<AbilityCheckIntent, 'type'>): PlanResult;
    castSpell(state: CampaignState, intent: Omit<CastSpellIntent, 'type'>): PlanResult;
    checkConcentration(
      state: CampaignState,
      intent: Omit<CheckConcentrationIntent, 'type'>,
    ): PlanResult;
    expireSpellDurations(
      state: CampaignState,
      intent?: Omit<ExpireSpellDurationsIntent, 'type'>,
    ): PlanResult;
    tickAura(state: CampaignState, intent: Omit<TickAuraIntent, 'type'>): PlanResult;
    tickMovementDamage(state: CampaignState, intent: Omit<TickMovementDamageIntent, 'type'>): PlanResult;
    tickRecurring(state: CampaignState, intent: Omit<TickRecurringIntent, 'type'>): PlanResult;
    tickRecurringSave(state: CampaignState, intent: Omit<TickRecurringSaveIntent, 'type'>): PlanResult;
    move(state: CampaignState, intent: Omit<MoveIntent, 'type'>): PlanResult;
    dash(state: CampaignState, intent: Omit<DashIntent, 'type'>): PlanResult;
    disengage(state: CampaignState, intent: Omit<DisengageIntent, 'type'>): PlanResult;
    dodge(state: CampaignState, intent: Omit<DodgeIntent, 'type'>): PlanResult;
    mistyStep(state: CampaignState, intent: Omit<MistyStepIntent, 'type'>): PlanResult;
    thunderStep(state: CampaignState, intent: Omit<ThunderStepIntent, 'type'>): PlanResult;
    dimensionDoor(state: CampaignState, intent: Omit<DimensionDoorIntent, 'type'>): PlanResult;
    actionSurge(state: CampaignState, intent: Omit<ActionSurgeIntent, 'type'>): PlanResult;
    sacredWeapon(state: CampaignState, intent: Omit<SacredWeaponIntent, 'type'>): PlanResult;
    chooseWeaponMasteries(state: CampaignState, intent: Omit<ChooseWeaponMasteriesIntent, 'type'>): PlanResult;
    conjurePactWeapon(state: CampaignState, intent: Omit<ConjurePactWeaponIntent, 'type'>): PlanResult;
    innateSorcery(state: CampaignState, intent: Omit<InnateSorceryIntent, 'type'>): PlanResult;
    selfRestoration(state: CampaignState, intent: Omit<SelfRestorationIntent, 'type'>): PlanResult;
    superiorDefense(state: CampaignState, intent: Omit<SuperiorDefenseIntent, 'type'>): PlanResult;
    paladinsSmite(state: CampaignState, intent: Omit<PaladinsSmiteIntent, 'type'>): PlanResult;
    divineIntervention(state: CampaignState, intent: Omit<DivineInterventionIntent, 'type'>): PlanResult;
    consumeItem(state: CampaignState, intent: Omit<ConsumeItemIntent, 'type'>): PlanResult;
    useItem(state: CampaignState, intent: Omit<UseItemIntent, 'type'>): PlanResult;
    magicWeapon(state: CampaignState, intent: Omit<MagicWeaponIntent, 'type'>): PlanResult;
    recklessAttack(state: CampaignState, intent: Omit<RecklessAttackIntent, 'type'>): PlanResult;
    steadyAim(state: CampaignState, intent: Omit<SteadyAimIntent, 'type'>): PlanResult;
    fastHands(state: CampaignState, intent: Omit<FastHandsIntent, 'type'>): PlanResult;
    deflectAttacks(state: CampaignState, intent: Omit<DeflectAttacksIntent, 'type'>): DeflectAttacksOutcome;
    stunningStrike(state: CampaignState, intent: Omit<StunningStrikeIntent, 'type'>): PlanResult;
    flurryOfBlows(state: CampaignState, intent: Omit<FlurryOfBlowsIntent, 'type'>): PlanResult;
    patientDefense(state: CampaignState, intent: Omit<PatientDefenseIntent, 'type'>): PlanResult;
    stepOfTheWind(state: CampaignState, intent: Omit<StepOfTheWindIntent, 'type'>): PlanResult;
    adrenalineRush(state: CampaignState, intent: Omit<AdrenalineRushIntent, 'type'>): PlanResult;
    stonecunning(state: CampaignState, intent: Omit<StonecunningIntent, 'type'>): PlanResult;
    dragonbornBreath(state: CampaignState, intent: Omit<DragonbornBreathIntent, 'type'>): PlanResult;
    consumeHeroicInspiration(state: CampaignState, intent: Omit<ConsumeHeroicInspirationIntent, 'type'>): PlanResult;
    secondWind(state: CampaignState, intent: Omit<SecondWindIntent, 'type'>): PlanResult;
    useHealersKit(state: CampaignState, intent: Omit<UseHealersKitIntent, 'type'>): PlanResult;
    rage(state: CampaignState, intent: Omit<RageIntent, 'type'>): PlanResult;
    help(state: CampaignState, intent: Omit<HelpIntent, 'type'>): PlanResult;
    ready(state: CampaignState, intent: Omit<ReadyIntent, 'type'>): PlanResult;
    bardicInspiration(state: CampaignState, intent: Omit<BardicInspirationIntent, 'type'>): PlanResult;
    layOnHands(state: CampaignState, intent: Omit<LayOnHandsIntent, 'type'>): PlanResult;
    search(state: CampaignState, intent: Omit<SearchIntent, 'type'>): PlanResult;
    study(state: CampaignState, intent: Omit<StudyIntent, 'type'>): PlanResult;
    influence(state: CampaignState, intent: Omit<InfluenceIntent, 'type'>): PlanResult;
    utilize(state: CampaignState, intent: Omit<UtilizeIntent, 'type'>): PlanResult;
    cloudsJaunt(state: CampaignState, intent: Omit<CloudsJauntIntent, 'type'>): PlanResult;
    stonesEndurance(
      state: CampaignState,
      intent: Omit<StonesEnduranceIntent, 'type'>,
    ): StonesEnduranceOutcome;
    stormsThunder(
      state: CampaignState,
      intent: Omit<StormsThunderIntent, 'type'>,
    ): StormsThunderOutcome;
    nimbleEscape(state: CampaignState, intent: Omit<NimbleEscapeIntent, 'type'>): PlanResult;
    cunningAction(state: CampaignState, intent: Omit<CunningActionIntent, 'type'>): PlanResult;
    expeditiousRetreatDash(state: CampaignState, intent: Omit<ExpeditiousRetreatDashIntent, 'type'>): PlanResult;
    stirgeDrain(state: CampaignState, intent: Omit<StirgeDrainIntent, 'type'>): PlanResult;
    detachStirge(state: CampaignState, intent: Omit<DetachStirgeIntent, 'type'>): PlanResult;
    turnUndead(state: CampaignState, intent: Omit<TurnUndeadIntent, 'type'>): PlanResult;
    divineSpark(state: CampaignState, intent: Omit<DivineSparkIntent, 'type'>): PlanResult;
    uncannyMetabolism(state: CampaignState, intent: Omit<UncannyMetabolismIntent, 'type'>): PlanResult;
    magicalCunning(state: CampaignState, intent: Omit<MagicalCunningIntent, 'type'>): PlanResult;
    intimidatingPresence(state: CampaignState, intent: Omit<IntimidatingPresenceIntent, 'type'>): PlanResult;
    dragonWings(state: CampaignState, intent: Omit<DragonWingsIntent, 'type'>): PlanResult;
    preserveLife(state: CampaignState, intent: Omit<PreserveLifeIntent, 'type'>): PlanResult;
    landsAid(state: CampaignState, intent: Omit<LandsAidIntent, 'type'>): PlanResult;
    wholenessOfBody(state: CampaignState, intent: Omit<WholenessOfBodyIntent, 'type'>): PlanResult;
    peerlessSkill(state: CampaignState, intent: Omit<PeerlessSkillIntent, 'type'>): PeerlessSkillOutcome;
    tacticalMind(state: CampaignState, intent: Omit<TacticalMindIntent, 'type'>): TacticalMindOutcome;
    frenzy(state: CampaignState, intent: Omit<FrenzyIntent, 'type'>): PlanResult;
    exhaleDragonsBreath(state: CampaignState, intent: Omit<ExhaleDragonsBreathIntent, 'type'>): PlanResult;
    blinkTurnEnd(state: CampaignState, intent: Omit<BlinkTurnEndIntent, 'type'>): PlanResult;
    cuttingWords(state: CampaignState, intent: Omit<CuttingWordsIntent, 'type'>): CuttingWordsOutcome;
    metamagic(state: CampaignState, intent: Omit<MetamagicIntent, 'type'>): PlanResult;
    wildCompanion(state: CampaignState, intent: Omit<WildCompanionIntent, 'type'>): PlanResult;
    equip(state: CampaignState, intent: Omit<EquipIntent, 'type'>): PlanResult;
    offHandAttack(state: CampaignState, intent: Omit<OffHandAttackIntent, 'type'>): PlanResult;
    multiattack(state: CampaignState, intent: Omit<MultiattackIntent, 'type'>): PlanResult;
    falling(state: CampaignState, intent: Omit<FallingIntent, 'type'>): PlanResult;
    grapple(state: CampaignState, intent: Omit<GrappleIntent, 'type'>): PlanResult;
    shove(state: CampaignState, intent: Omit<ShoveIntent, 'type'>): PlanResult;
    hide(state: CampaignState, intent: Omit<HideIntent, 'type'>): PlanResult;
    counterspell(state: CampaignState, intent: Omit<CounterspellIntent, 'type'>): PlanResult;
    dispelMagic(state: CampaignState, intent: Omit<DispelMagicIntent, 'type'>): PlanResult;
    removeCurse(state: CampaignState, intent: Omit<RemoveCurseIntent, 'type'>): PlanResult;
    clairvoyance(state: CampaignState, intent: Omit<ClairvoyanceIntent, 'type'>): PlanResult;
    switchSensorMode(state: CampaignState, intent: Omit<SwitchSensorModeIntent, 'type'>): PlanResult;
    removeSensor(state: CampaignState, intent: Omit<RemoveSensorIntent, 'type'>): PlanResult;
    scrying(state: CampaignState, intent: Omit<ScryingIntent, 'type'>): ScryingOutcome;
    arcaneEye(state: CampaignState, intent: Omit<ArcaneEyeIntent, 'type'>): PlanResult;
    moveSensor(state: CampaignState, intent: Omit<MoveSensorIntent, 'type'>): PlanResult;
    silentImage(state: CampaignState, intent: Omit<SilentImageIntent, 'type'>): PlanResult;
    majorImage(state: CampaignState, intent: Omit<MajorImageIntent, 'type'>): PlanResult;
    investigateIllusion(state: CampaignState, intent: Omit<InvestigateIllusionIntent, 'type'>): PlanResult;
    dismissIllusion(state: CampaignState, intent: Omit<DismissIllusionIntent, 'type'>): PlanResult;
    breathWeapon(state: CampaignState, intent: Omit<BreathWeaponIntent, 'type'>): PlanResult;
    identify(state: CampaignState, intent: Omit<IdentifyIntent, 'type'>): PlanResult;
    shield(state: CampaignState, intent: Omit<ShieldIntent, 'type'>): ShieldOutcome;
    sanctuaryWardSave(
      state: CampaignState,
      intent: Omit<SanctuaryWardSaveIntent, 'type'>,
    ): SanctuaryWardSaveOutcome;
    protection(
      state: CampaignState,
      intent: Omit<ProtectionIntent, 'type'>,
    ): ProtectionOutcome;
    consumeGuidance(
      state: CampaignState,
      intent: Omit<ConsumeGuidanceIntent, 'type'>,
    ): ConsumeGuidanceOutcome;
    consumeResistance(
      state: CampaignState,
      intent: Omit<ConsumeResistanceIntent, 'type'>,
    ): ConsumeResistanceOutcome;
    uncannyDodge(
      state: CampaignState,
      intent: Omit<UncannyDodgeIntent, 'type'>,
    ): UncannyDodgeOutcome;
    weaponMastery(state: CampaignState, intent: Omit<WeaponMasteryIntent, 'type'>): PlanResult;
    forage(state: CampaignState, intent: Omit<ForageIntent, 'type'>): PlanResult;
    navigationCheck(state: CampaignState, intent: Omit<NavigationCheckIntent, 'type'>): PlanResult;
    forcedMarch(state: CampaignState, intent: Omit<ForcedMarchIntent, 'type'>): PlanResult;
    grantInitialHeroPoints(
      state: CampaignState,
      intent: Omit<GrantInitialHeroPointsIntent, 'type'>,
    ): PlanResult;
    spendHeroPoint(
      state: CampaignState,
      intent: Omit<SpendHeroPointIntent, 'type'>,
    ): SpendHeroPointOutcome;
    moraleCheck(state: CampaignState, intent: Omit<MoraleCheckIntent, 'type'>): PlanResult;
    reactionRoll(state: CampaignState, intent: Omit<ReactionRollIntent, 'type'>): PlanResult;
    resurrect(state: CampaignState, intent: Omit<ResurrectIntent, 'type'>): PlanResult;
    polymorph(state: CampaignState, intent: Omit<PolymorphIntent, 'type'>): PolymorphOutcome;
    wildShape(state: CampaignState, intent: Omit<WildShapeIntent, 'type'>): PlanResult;
    simulacrum(state: CampaignState, intent: Omit<SimulacrumIntent, 'type'>): SimulacrumOutcome;
    wish(state: CampaignState, intent: Omit<WishIntent, 'type'>): WishOutcome;
    dismissCompanion(
      state: CampaignState,
      intent: Omit<DismissCompanionIntent, 'type'>,
    ): PlanResult;
    triggerTrap(state: CampaignState, intent: Omit<TriggerTrapIntent, 'type'>): PlanResult;
  };

  derive: {
    character(state: CampaignState, id: string): ReturnType<typeof computeDerivedCharacter>;
    ac(state: CampaignState, characterId: string): ReturnType<typeof computeAC>;
    savingThrow(state: CampaignState, characterId: string, ability: AbilityScore): ReturnType<typeof computeSavingThrow>;
    attackBonus(state: CampaignState, characterId: string, weaponInstanceId: string): ReturnType<typeof computeAttackBonus>;
    spellSaveDC(state: CampaignState, characterId: string, classId: string): ReturnType<typeof computeSpellSaveDC>;
    spellAttackBonus(state: CampaignState, characterId: string, classId: string): ReturnType<typeof computeSpellAttackBonus>;
    spellSlots(state: CampaignState, characterId: string): ReturnType<typeof computeSpellSlots>;
    abilityModifier(score: number): number;
    proficiencyBonus(level: number): number;
  };
}

const requireCharacter = (state: CampaignState, id: string) => {
  const c = state.characters[id];
  if (!c) throw new Error(`Unknown character ${id}`);
  return c;
};

export const createEngine = (opts: CreateEngineOptions): Engine => {
  // A bundle's pack joins the plain content packs; its handlers merge into
  // the registry. Handler-id collisions across bundles throw (mirrors the
  // pack id-collision policy); pack id-collisions throw inside resolveContent.
  const bundles = opts.bundles ?? [];
  const content = resolveContent([...(opts.contentPacks ?? []), ...bundles.map((b) => b.pack)]);
  const handlers = mergeHandlerRegistries([opts.handlers, ...bundles.map((b) => b.handlers)]);
  const validationIssues = validateCrossReferences(content);
  if (validationIssues.length > 0) {
    const formatted = validationIssues.map((i) => `${i.path}: ${i.message}`).join('\n');
    throw new Error(`Content pack cross-reference validation failed:\n${formatted}`);
  }
  const rng = opts.rng ?? defaultRNG();

  const planNs: Engine['plan'] = {
    custom(state, intent) {
      const handler = handlers.action?.[intent.handlerId];
      if (handler === undefined) {
        throw new Error(
          `No custom action handler registered for '${intent.handlerId}' (register one under createEngine({ handlers: { action: { ... } } }))`,
        );
      }
      const at = intent.at ?? nowIso();
      const ctx: HandlerContext = {
        apiVersion: HANDLER_API_VERSION,
        state,
        content,
        rng,
        at,
        rollDie: (die) => rollDie(die, rng),
        rollExpression: (expr) => rollExpression(expr, rng),
        newEventId: () => newEventId() as ULID,
        newAppliedConditionId,
        newEffectInstanceId,
        assertActorCanAct: (character, actionLabel) => assertActorCanAct(character, actionLabel),
        spellSlotsRemaining: (character, slotLevel) =>
          computeAvailableSpellSlots(character, content.classes).standardByLevel[slotLevel - 1] ?? 0,
        assertReactionAvailable: (character, actionLabel) =>
          assertReactionAvailable(state, character.id, actionLabel),
        consumeActionEconomy: (character, kind) =>
          economyConsumedIfEncountered(state, character.id, at, kind),
      };
      return { events: handler.plan(ctx, intent.params) };
    },
    shortRest(state, intent) {
      return { events: planShortRest(state, { type: 'ShortRest', ...intent }) };
    },
    longRest(state, intent) {
      return { events: planLongRest(state, content, { type: 'LongRest', ...intent }) };
    },
    rest(state, intent) {
      if (intent.type === 'ShortRest') return { events: planShortRest(state, intent) };
      return { events: planLongRest(state, content, intent) };
    },
    attack(state, intent) {
      return { events: planAttack(state, content, rng, { type: 'Attack', ...intent }) };
    },
    cleave(state, intent) {
      return { events: planCleave(state, content, rng, { type: 'Cleave', ...intent }) };
    },
    opportunityAttack(state, intent) {
      return {
        events: planOpportunityAttack(state, content, rng, {
          type: 'OpportunityAttack',
          ...intent,
        }),
      };
    },
    createEncounter(state, intent) {
      return planCreateEncounter(state, content, { type: 'CreateEncounter', ...intent });
    },
    placeCombatant(state, intent) {
      return { events: planPlaceCombatant(state, content, { type: 'PlaceCombatant', ...intent }) };
    },
    rollInitiative(state, intent) {
      return {
        events: planRollInitiative(state, content, rng, { type: 'RollInitiative', ...intent }),
      };
    },
    swapInitiative(state, intent) {
      return {
        events: planSwapInitiative(state, content, { type: 'SwapInitiative', ...intent }),
      };
    },
    startEncounter(state, intent) {
      return { events: planStartEncounter(state, content, { type: 'StartEncounter', ...intent }) };
    },
    beginFirstTurn(state, intent) {
      return { events: planBeginFirstTurn(state, content, rng, { type: 'BeginFirstTurn', ...intent }) };
    },
    advanceTurn(state, intent) {
      return { events: planAdvanceTurn(state, content, rng, { type: 'AdvanceTurn', ...intent }) };
    },
    endEncounter(state, intent) {
      return { events: planEndEncounter(state, content, { type: 'EndEncounter', ...intent }) };
    },
    levelUp(state, intent) {
      return { events: planLevelUp(state, content, rng, { type: 'LevelUp', ...intent }) };
    },
    resolveChoice(state, intent) {
      return { events: planResolveChoice(state, content, { type: 'ResolveChoice', ...intent }) };
    },
    offerCharacterChoices(state, intent) {
      return { events: planOfferCharacterChoices(state, content, { type: 'OfferCharacterChoices', ...intent }) };
    },
    offerLongRestChoices(state, intent) {
      return { events: planOfferLongRestChoices(state, content, { type: 'OfferLongRestChoices', ...intent }) };
    },
    save(state, intent) {
      return { events: planSave(state, content, rng, { type: 'Save', ...intent }) };
    },
    abilityCheck(state, intent) {
      return { events: planAbilityCheck(state, content, rng, { type: 'AbilityCheck', ...intent }) };
    },
    castSpell(state, intent) {
      return { events: planCastSpell(state, content, rng, { type: 'CastSpell', ...intent }) };
    },
    checkConcentration(state, intent) {
      return {
        events: planCheckConcentration(state, content, rng, {
          type: 'CheckConcentration',
          ...intent,
        }),
      };
    },
    expireSpellDurations(state, intent) {
      return {
        events: planExpireSpellDurations(state, content, {
          type: 'ExpireSpellDurations',
          ...(intent ?? {}),
        }),
      };
    },
    tickAura(state, intent) {
      return {
        events: planTickAura(state, content, rng, { type: 'TickAura', ...intent }),
      };
    },
    tickMovementDamage(state, intent) {
      return {
        events: planTickMovementDamage(state, content, rng, {
          type: 'TickMovementDamage',
          ...intent,
        }),
      };
    },
    tickRecurring(state, intent) {
      return {
        events: planTickRecurring(state, content, rng, {
          type: 'TickRecurring',
          ...intent,
        }),
      };
    },
    tickRecurringSave(state, intent) {
      return {
        events: planTickRecurringSave(state, content, rng, {
          type: 'TickRecurringSave',
          ...intent,
        }),
      };
    },
    move(state, intent) {
      return { events: planMove(state, content, { type: 'Move', ...intent }) };
    },
    dash(state, intent) {
      return { events: planDash(state, content, { type: 'Dash', ...intent }) };
    },
    disengage(state, intent) {
      return { events: planDisengage(state, content, { type: 'Disengage', ...intent }) };
    },
    dodge(state, intent) {
      return { events: planDodge(state, content, { type: 'Dodge', ...intent }) };
    },
    mistyStep(state, intent) {
      return { events: planMistyStep(state, content, { type: 'MistyStep', ...intent }) };
    },
    thunderStep(state, intent) {
      return { events: planThunderStep(state, content, rng, { type: 'ThunderStep', ...intent }) };
    },
    dimensionDoor(state, intent) {
      return { events: planDimensionDoor(state, content, { type: 'DimensionDoor', ...intent }) };
    },
    actionSurge(state, intent) {
      return { events: planActionSurge(state, content, { type: 'ActionSurge', ...intent }) };
    },
    sacredWeapon(state, intent) {
      return { events: planSacredWeapon(state, content, { type: 'SacredWeapon', ...intent }) };
    },
    chooseWeaponMasteries(state, intent) {
      return { events: planChooseWeaponMasteries(state, content, { type: 'ChooseWeaponMasteries', ...intent }) };
    },
    conjurePactWeapon(state, intent) {
      return { events: planConjurePactWeapon(state, content, { type: 'ConjurePactWeapon', ...intent }) };
    },
    innateSorcery(state, intent) {
      return { events: planInnateSorcery(state, content, { type: 'InnateSorcery', ...intent }) };
    },
    selfRestoration(state, intent) {
      return { events: planSelfRestoration(state, content, { type: 'SelfRestoration', ...intent }) };
    },
    superiorDefense(state, intent) {
      return { events: planSuperiorDefense(state, { type: 'SuperiorDefense', ...intent }) };
    },
    paladinsSmite(state, intent) {
      return { events: planPaladinsSmite(state, content, rng, { type: 'PaladinsSmite', ...intent }) };
    },
    divineIntervention(state, intent) {
      return {
        events: planDivineIntervention(state, content, rng, {
          type: 'DivineIntervention',
          ...intent,
        }),
      };
    },
    consumeItem(state, intent) {
      return { events: planConsumeItem(state, content, rng, { type: 'ConsumeItem', ...intent }) };
    },
    useItem(state, intent) {
      return { events: planUseItem(state, content, rng, { type: 'UseItem', ...intent }) };
    },
    magicWeapon(state, intent) {
      return { events: planMagicWeapon(state, content, { type: 'MagicWeapon', ...intent }) };
    },
    recklessAttack(state, intent) {
      return { events: planRecklessAttack(state, content, { type: 'RecklessAttack', ...intent }) };
    },
    steadyAim(state, intent) {
      return { events: planSteadyAim(state, content, { type: 'SteadyAim', ...intent }) };
    },
    fastHands(state, intent) {
      return { events: planFastHands(state, content, { type: 'FastHands', ...intent }) };
    },
    deflectAttacks(state, intent) {
      return planDeflectAttacks(state, content, rng, { type: 'DeflectAttacks', ...intent });
    },
    stunningStrike(state, intent) {
      return { events: planStunningStrike(state, content, rng, { type: 'StunningStrike', ...intent }) };
    },
    flurryOfBlows(state, intent) {
      return { events: planFlurryOfBlows(state, content, rng, { type: 'FlurryOfBlows', ...intent }) };
    },
    patientDefense(state, intent) {
      return { events: planPatientDefense(state, content, rng, { type: 'PatientDefense', ...intent }) };
    },
    stepOfTheWind(state, intent) {
      return { events: planStepOfTheWind(state, content, { type: 'StepOfTheWind', ...intent }) };
    },
    adrenalineRush(state, intent) {
      return { events: planAdrenalineRush(state, content, { type: 'AdrenalineRush', ...intent }) };
    },
    stonecunning(state, intent) {
      return { events: planStonecunning(state, { type: 'Stonecunning', ...intent }) };
    },
    dragonbornBreath(state, intent) {
      return { events: planDragonbornBreath(state, content, rng, { type: 'DragonbornBreath', ...intent }) };
    },
    consumeHeroicInspiration(state, intent) {
      return { events: planConsumeHeroicInspiration(state, { type: 'ConsumeHeroicInspiration', ...intent }) };
    },
    secondWind(state, intent) {
      return { events: planSecondWind(state, content, rng, { type: 'SecondWind', ...intent }) };
    },
    useHealersKit(state, intent) {
      return { events: planUseHealersKit(state, content, { type: 'UseHealersKit', ...intent }) };
    },
    rage(state, intent) {
      return { events: planRage(state, content, { type: 'Rage', ...intent }) };
    },
    help(state, intent) {
      return { events: planHelp(state, content, { type: 'Help', ...intent }) };
    },
    ready(state, intent) {
      return { events: planReady(state, content, { type: 'Ready', ...intent }) };
    },
    bardicInspiration(state, intent) {
      return { events: planBardicInspiration(state, content, { type: 'BardicInspiration', ...intent }) };
    },
    layOnHands(state, intent) {
      return { events: planLayOnHands(state, content, { type: 'LayOnHands', ...intent }) };
    },
    search(state, intent) {
      return { events: planSearch(state, content, rng, { type: 'Search', ...intent }) };
    },
    study(state, intent) {
      return { events: planStudy(state, content, rng, { type: 'Study', ...intent }) };
    },
    influence(state, intent) {
      return { events: planInfluence(state, content, rng, { type: 'Influence', ...intent }) };
    },
    utilize(state, intent) {
      return { events: planUtilize(state, content, rng, { type: 'Utilize', ...intent }) };
    },
    cloudsJaunt(state, intent) {
      return { events: planCloudsJaunt(state, content, { type: 'CloudsJaunt', ...intent }) };
    },
    stonesEndurance(state, intent) {
      return planStonesEndurance(state, content, rng, { type: 'StonesEndurance', ...intent });
    },
    stormsThunder(state, intent) {
      return planStormsThunder(state, content, rng, { type: 'StormsThunder', ...intent });
    },
    nimbleEscape(state, intent) {
      return { events: planNimbleEscape(state, content, rng, { type: 'NimbleEscape', ...intent }) };
    },
    cunningAction(state, intent) {
      return { events: planCunningAction(state, content, rng, { type: 'CunningAction', ...intent }) };
    },
    expeditiousRetreatDash(state, intent) {
      return { events: planExpeditiousRetreatDash(state, { type: 'ExpeditiousRetreatDash', ...intent }) };
    },
    stirgeDrain(state, intent) {
      return { events: planStirgeDrain(state, content, rng, { type: 'StirgeDrain', ...intent }) };
    },
    detachStirge(state, intent) {
      return { events: planDetachStirge(state, content, { type: 'DetachStirge', ...intent }) };
    },
    turnUndead(state, intent) {
      return { events: planTurnUndead(state, content, rng, { type: 'TurnUndead', ...intent }) };
    },
    divineSpark(state, intent) {
      return { events: planDivineSpark(state, content, rng, { type: 'DivineSpark', ...intent }) };
    },
    uncannyMetabolism(state, intent) {
      return { events: planUncannyMetabolism(state, content, rng, { type: 'UncannyMetabolism', ...intent }) };
    },
    magicalCunning(state, intent) {
      return { events: planMagicalCunning(state, content, rng, { type: 'MagicalCunning', ...intent }) };
    },
    intimidatingPresence(state, intent) {
      return { events: planIntimidatingPresence(state, content, rng, { type: 'IntimidatingPresence', ...intent }) };
    },
    dragonWings(state, intent) {
      return { events: planDragonWings(state, content, { type: 'DragonWings', ...intent }) };
    },
    preserveLife(state, intent) {
      return { events: planPreserveLife(state, content, { type: 'PreserveLife', ...intent }) };
    },
    landsAid(state, intent) {
      return { events: planLandsAid(state, content, rng, { type: 'LandsAid', ...intent }) };
    },
    wholenessOfBody(state, intent) {
      return { events: planWholenessOfBody(state, content, rng, { type: 'WholenessOfBody', ...intent }) };
    },
    peerlessSkill(state, intent) {
      return planPeerlessSkill(state, content, rng, { type: 'PeerlessSkill', ...intent });
    },
    tacticalMind(state, intent) {
      return planTacticalMind(state, content, rng, { type: 'TacticalMind', ...intent });
    },
    frenzy(state, intent) {
      return { events: planFrenzy(state, content, { type: 'Frenzy', ...intent }) };
    },
    exhaleDragonsBreath(state, intent) {
      return { events: planExhaleDragonsBreath(state, content, rng, { type: 'ExhaleDragonsBreath', ...intent }) };
    },
    blinkTurnEnd(state, intent) {
      return { events: planBlinkTurnEnd(state, content, rng, { type: 'BlinkTurnEnd', ...intent }) };
    },
    cuttingWords(state, intent) {
      return planCuttingWords(state, content, rng, { type: 'CuttingWords', ...intent });
    },
    metamagic(state, intent) {
      return { events: planMetamagic(state, content, { type: 'Metamagic', ...intent }) };
    },
    wildCompanion(state, intent) {
      return { events: planWildCompanion(state, content, { type: 'WildCompanion', ...intent }) };
    },
    equip(state, intent) {
      return { events: planEquip(state, content, { type: 'Equip', ...intent }) };
    },
    offHandAttack(state, intent) {
      return { events: planOffHandAttack(state, content, rng, { type: 'OffHandAttack', ...intent }) };
    },
    multiattack(state, intent) {
      return { events: planMultiattack(state, content, rng, { type: 'Multiattack', ...intent }) };
    },
    falling(state, intent) {
      return { events: planFalling(state, content, rng, { type: 'Falling', ...intent }) };
    },
    grapple(state, intent) {
      return { events: planGrapple(state, content, rng, { type: 'Grapple', ...intent }) };
    },
    shove(state, intent) {
      return { events: planShove(state, content, rng, { type: 'Shove', ...intent }) };
    },
    hide(state, intent) {
      return { events: planHide(state, content, rng, { type: 'Hide', ...intent }) };
    },
    counterspell(state, intent) {
      return { events: planCounterspell(state, content, rng, { type: 'Counterspell', ...intent }) };
    },
    dispelMagic(state, intent) {
      return { events: planDispelMagic(state, content, rng, { type: 'DispelMagic', ...intent }) };
    },
    removeCurse(state, intent) {
      return { events: planRemoveCurse(state, content, rng, { type: 'RemoveCurse', ...intent }) };
    },
    clairvoyance(state, intent) {
      return { events: planClairvoyance(state, content, rng, { type: 'Clairvoyance', ...intent }) };
    },
    switchSensorMode(state, intent) {
      return { events: planSwitchSensorMode(state, content, rng, { type: 'SwitchSensorMode', ...intent }) };
    },
    removeSensor(state, intent) {
      return { events: planRemoveSensor(state, content, rng, { type: 'RemoveSensor', ...intent }) };
    },
    scrying(state, intent) {
      return planScrying(state, content, rng, { type: 'Scrying', ...intent });
    },
    arcaneEye(state, intent) {
      return { events: planArcaneEye(state, content, rng, { type: 'ArcaneEye', ...intent }) };
    },
    moveSensor(state, intent) {
      return { events: planMoveSensor(state, content, rng, { type: 'MoveSensor', ...intent }) };
    },
    silentImage(state, intent) {
      return { events: planSilentImage(state, content, rng, { type: 'SilentImage', ...intent }) };
    },
    majorImage(state, intent) {
      return { events: planMajorImage(state, content, rng, { type: 'MajorImage', ...intent }) };
    },
    investigateIllusion(state, intent) {
      return { events: planInvestigateIllusion(state, content, rng, { type: 'InvestigateIllusion', ...intent }) };
    },
    dismissIllusion(state, intent) {
      return { events: planDismissIllusion(state, content, rng, { type: 'DismissIllusion', ...intent }) };
    },
    breathWeapon(state, intent) {
      return { events: planBreathWeapon(state, content, rng, { type: 'BreathWeapon', ...intent }) };
    },
    identify(state, intent) {
      return { events: planIdentify(state, content, rng, { type: 'Identify', ...intent }) };
    },
    shield(state, intent) {
      return planShield(state, content, { type: 'Shield', ...intent });
    },
    sanctuaryWardSave(state, intent) {
      return planSanctuaryWardSave(state, content, rng, {
        type: 'SanctuaryWardSave',
        ...intent,
      });
    },
    protection(state, intent) {
      return planProtection(state, content, rng, {
        type: 'Protection',
        ...intent,
      });
    },
    consumeGuidance(state, intent) {
      return planConsumeGuidance(state, content, rng, {
        type: 'ConsumeGuidance',
        ...intent,
      });
    },
    consumeResistance(state, intent) {
      return planConsumeResistance(state, content, rng, {
        type: 'ConsumeResistance',
        ...intent,
      });
    },
    uncannyDodge(state, intent) {
      return planUncannyDodge(state, content, { type: 'UncannyDodge', ...intent });
    },
    weaponMastery(state, intent) {
      return { events: planWeaponMastery(state, content, rng, { type: 'WeaponMastery', ...intent }) };
    },
    forage(state, intent) {
      return { events: planForage(state, content, rng, { type: 'Forage', ...intent }) };
    },
    navigationCheck(state, intent) {
      return { events: planNavigationCheck(state, content, rng, { type: 'NavigationCheck', ...intent }) };
    },
    forcedMarch(state, intent) {
      return { events: planForcedMarch(state, content, rng, { type: 'ForcedMarch', ...intent }) };
    },
    grantInitialHeroPoints(state, intent) {
      return {
        events: planGrantInitialHeroPoints(state, content, {
          type: 'GrantInitialHeroPoints',
          ...intent,
        }),
      };
    },
    spendHeroPoint(state, intent) {
      return planSpendHeroPoint(state, content, rng, { type: 'SpendHeroPoint', ...intent });
    },
    moraleCheck(state, intent) {
      return { events: planMoraleCheck(state, content, rng, { type: 'MoraleCheck', ...intent }) };
    },
    reactionRoll(state, intent) {
      return { events: planReactionRoll(state, content, rng, { type: 'ReactionRoll', ...intent }) };
    },
    resurrect(state, intent) {
      return { events: planResurrect(state, content, { type: 'Resurrect', ...intent }) };
    },
    polymorph(state, intent) {
      return planPolymorph(state, content, rng, { type: 'Polymorph', ...intent });
    },
    wildShape(state, intent) {
      return { events: planWildShape(state, content, rng, { type: 'WildShape', ...intent }) };
    },
    simulacrum(state, intent) {
      return planSimulacrum(state, content, rng, { type: 'Simulacrum', ...intent });
    },
    wish(state, intent) {
      return planWish(state, content, rng, { type: 'Wish', ...intent });
    },
    dismissCompanion(state, intent) {
      return { events: planDismissCompanion(state, { type: 'DismissCompanion', ...intent }) };
    },
    triggerTrap(state, intent) {
      return { events: planTriggerTrap(state, content, rng, { type: 'TriggerTrap', ...intent }) };
    },
  };

  const memo = new Map<string, unknown>();
  let memoVersion = -1;
  const memoize = <T>(args: ReadonlyArray<string | number>, state: CampaignState, compute: () => T): T => {
    if (state.version !== memoVersion) {
      memo.clear();
      memoVersion = state.version;
    }
    const key = args.join('|');
    if (memo.has(key)) return memo.get(key) as T;
    const result = compute();
    memo.set(key, result);
    return result;
  };

  const deriveNs: Engine['derive'] = {
    character(state, id) {
      return memoize(['character', id], state, () =>
        computeDerivedCharacter({
          character: requireCharacter(state, id),
          itemInstances: state.itemInstances,
          content,
          pendingChoices: state.pendingChoices,
          characters: state.characters,
        }),
      );
    },
    ac(state, id) {
      return memoize(['ac', id], state, () =>
        computeAC({
          character: requireCharacter(state, id),
          itemInstances: state.itemInstances,
          content,
          pendingChoices: state.pendingChoices,
          characters: state.characters,
        }),
      );
    },
    savingThrow(state, id, ability) {
      return memoize(['save', id, ability], state, () =>
        computeSavingThrow({
          character: requireCharacter(state, id),
          itemInstances: state.itemInstances,
          content,
          pendingChoices: state.pendingChoices,
          ability,
          characters: state.characters,
        }),
      );
    },
    attackBonus(state, id, weaponInstanceId) {
      return memoize(['attack', id, weaponInstanceId], state, () =>
        computeAttackBonus({
          character: requireCharacter(state, id),
          itemInstances: state.itemInstances,
          content,
          pendingChoices: state.pendingChoices,
          weaponInstanceId,
          characters: state.characters,
        }),
      );
    },
    spellSaveDC(state, id, classId) {
      return memoize(['spellDC', id, classId], state, () =>
        computeSpellSaveDC({
          character: requireCharacter(state, id),
          itemInstances: state.itemInstances,
          content,
          pendingChoices: state.pendingChoices,
          classId,
          characters: state.characters,
        }),
      );
    },
    spellAttackBonus(state, id, classId) {
      return memoize(['spellAtk', id, classId], state, () =>
        computeSpellAttackBonus({
          character: requireCharacter(state, id),
          itemInstances: state.itemInstances,
          content,
          pendingChoices: state.pendingChoices,
          classId,
          characters: state.characters,
        }),
      );
    },
    spellSlots(state, id) {
      return memoize(['slots', id], state, () =>
        computeSpellSlots(requireCharacter(state, id), content.classes),
      );
    },
    abilityModifier(score) {
      return abilityModifier(score);
    },
    proficiencyBonus(level) {
      return proficiencyBonus(level);
    },
  };

  return {
    content,
    schemaVersion: SCHEMA_VERSION,
    rng,
    createCampaign(init) {
      return {
        id: init.id ?? newCampaignId(),
        name: init.name,
        state: emptyCampaignState(),
        events: [],
        cursor: 0,
        schemaVersion: SCHEMA_VERSION,
      };
    },
    apply,
    applyAll,
    replay,
    commit,
    undo,
    redo,
    do(campaign, intent) {
      return performIntent(this, campaign, intent);
    },
    withRollProvider(provider, fn) {
      return withRollProviderScope(provider, fn);
    },
    plan: planNs,
    derive: deriveNs,
  };
};

export type { Campaign } from './commit.js';
