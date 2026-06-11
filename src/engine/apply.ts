import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { Event } from '../schemas/events/index.js';
import { immerProduce } from '../internal/immer.js';
import { applyCharacterCreated } from './reducers/progression.js';
import {
  applyConditionApplied,
  applyConditionRemoved,
  applyCreaturePushed,
  applyDamageApplied,
  applyDeathSaveRolled,
  applyExhaustionChanged,
  applyHealed,
  applyStabilized,
  applyCreatureDestroyed,
  applyHPMaxBonusChanged,
  applyTempHPGranted,
} from './reducers/combat.js';
import {
  applyHitDieSpent,
  applyResourceRestored,
  applyResourceSpent,
} from './reducers/resources.js';
import {
  applyHeroicInspirationGranted,
  applyHeroicInspirationConsumed,
} from './reducers/heroic-inspiration.js';
import {
  applyLongRestEnded,
  applyLongRestStarted,
  applyShortRestEnded,
  applyShortRestStarted,
} from './reducers/rest.js';
import {
  applyEncounterCreated,
  applyEncounterEnded,
  applyEncounterStarted,
  applyInitiativeRolled,
  applyInitiativeSwapped,
  applyRoundEnded,
  applyTurnEnded,
  applyTurnStarted,
  applyCombatantPlaced,
} from './reducers/encounter.js';
import { applyAttackRolled, applyDamageRolled, applyWeaponLoaded } from './reducers/attack.js';
import {
  applyItemAcquired,
  applyItemAttuned,
  applyItemBuffApplied,
  applyItemBuffRemoved,
  applyItemConsumed,
  applyItemDestroyed,
  applyItemEquipped,
  applyItemTimeBudgetConsumed,
  applyItemUnattuned,
  applyItemUnequipped,
  applyItemUsed,
} from './reducers/inventory.js';
import {
  applyChoiceRequired,
  applyChoiceResolved,
  applyLevelUpResolved,
  applySubclassChosen,
} from './reducers/level-up.js';
import { applyAbilityCheckRolled, applySaveRolled } from './reducers/checks.js';
import {
  applyFreeCastUsed,
  applyPerDayCastUsed,
  applyPactSlotConsumed,
  applyPactSlotsRegained,
  applyPreparedSpellsChanged,
  applySpellCastDeclared,
  applySpellSlotConsumed,
  applySpellSlotsRegained,
} from './reducers/spellcasting.js';
import {
  applyConcentrationBroken,
  applyConcentrationStarted,
  applySpellEffectStarted,
} from './reducers/concentration.js';
import { applyTriggerFired } from './reducers/triggers.js';
import {
  applyActionEconomyConsumed,
  applyActionReadied,
  applyRecklessAttackActivated,
  applySteadyAimActivated,
  applySteadyAimConsumed,
  applyFastHandsActivated,
  applyDeflectAttacksUsed,
  applyStunningStrikeAttempted,
  applySavageAttackerUsed,
} from './reducers/action-economy.js';
import {
  applyCombatantMoved,
  applyDashed,
  applyDisengaged,
} from './reducers/movement.js';
import {
  applyPartyCreated,
  applyPartyMembersChanged,
  applyCurrencyAcquired,
  applyCurrencySpent,
  applyItemDepositedToParty,
  applyItemWithdrawnFromParty,
} from './reducers/party.js';
import {
  applySessionStarted,
  applySessionEnded,
  applyJournalEntryAdded,
  applyInGameTimeAdvanced,
} from './reducers/session.js';
import {
  applyLocationCreated,
  applyDoorAdded,
  applyDoorStateChanged,
  applyCharacterLocationChanged,
} from './reducers/locations.js';
import {
  applyQuestStarted,
  applyObjectiveProgressed,
  applyObjectiveCompleted,
  applyObjectiveFailed,
  applyQuestCompleted,
  applyQuestFailed,
  applyQuestAbandoned,
  applyQuestRewardClaimed,
  applyXPAwarded,
  applyMilestoneAwarded,
} from './reducers/quests.js';
import {
  applySpellCountered,
  applySpellDispelled,
  applyItemIdentified,
} from './reducers/reactive-spells.js';
import { applyMirrorImageDeflected } from './reducers/mirror-image.js';
import {
  applyRemoteSensorPlaced,
  applyRemoteSensorModeChanged,
  applyRemoteSensorRemoved,
  applyRemoteSensorMoved,
} from './reducers/sensor.js';
import {
  applyIllusionCreated,
  applyIllusionInvestigated,
  applyIllusionDismissed,
} from './reducers/illusion.js';
import {
  applyBreathWeaponFired,
  applyBreathWeaponRecharged,
} from './reducers/breath-weapon.js';
import {
  applySaveActionExpended,
  applySaveActionRecharged,
} from './reducers/save-action.js';
import { applyWeaponMasteryActivated, applyWeaponMasteriesChosen } from './reducers/weapon-mastery.js';
import {
  applyMounted,
  applyDismounted,
  applyVehicleAcquired,
  applyVehicleBoarded,
  applyVehicleDeparted,
  applyVehicleDamaged,
  applyVehicleRepaired,
} from './reducers/mounts-vehicles.js';
import {
  applyTravelLegCompleted,
  applyNavigationCheckRolled,
  applyForagedFor,
} from './reducers/travel.js';
import {
  applyAttitudeChanged,
  applyMoraleCheckRolled,
  applyMoraleBroken,
} from './reducers/npc.js';
import { applyDowntimeActivityResolved } from './reducers/downtime.js';
import {
  applyItemChargeConsumed,
  applyItemRecharged,
  applySentientItemConflict,
} from './reducers/charges.js';
import {
  applyBastionFounded,
  applyBastionFacilityAdded,
  applyBastionHirelingAdded,
  applyBastionTurnTaken,
  applyBastionDamaged,
  applyBastionLevelChanged,
} from './reducers/bastion.js';
import {
  applyCampaignSettingsChanged,
  applyHeroPointGranted,
  applyHeroPointSpent,
} from './reducers/settings.js';
import { applyCharacterResurrected } from './reducers/resurrection.js';
import {
  applyPolymorphApplied,
  applyPolymorphReverted,
  applySimulacrumCreated,
  applyWishGranted,
} from './reducers/transformations.js';
import {
  applyCompanionSummoned,
  applyCompanionDismissed,
} from './reducers/summons.js';
import {
  applyTrapArmed,
  applyTrapTriggered,
  applyTrapExpired,
} from './reducers/traps.js';
import { invariant } from '../internal/invariants.js';

export const apply = (state: CampaignState, event: Event): CampaignState =>
  immerProduce(state, (draft) => {
    switch (event.type) {
      case 'CharacterCreated':
        applyCharacterCreated(draft, event);
        break;
      case 'DamageApplied':
        applyDamageApplied(draft, event);
        break;
      case 'Healed':
        applyHealed(draft, event);
        break;
      case 'TempHPGranted':
        applyTempHPGranted(draft, event);
        break;
      case 'ConditionApplied':
        applyConditionApplied(draft, event);
        break;
      case 'ConditionRemoved':
        applyConditionRemoved(draft, event);
        break;
      case 'CreaturePushed':
        applyCreaturePushed(draft, event);
        break;
      case 'ExhaustionChanged':
        applyExhaustionChanged(draft, event);
        break;
      case 'DeathSaveRolled':
        applyDeathSaveRolled(draft, event);
        break;
      case 'Stabilized':
        applyStabilized(draft, event);
        break;
      case 'HeroicInspirationGranted':
        applyHeroicInspirationGranted(draft, event);
        break;
      case 'HeroicInspirationConsumed':
        applyHeroicInspirationConsumed(draft, event);
        break;
      case 'CreatureDestroyed':
        applyCreatureDestroyed(draft, event);
        break;
      case 'HPMaxBonusChanged':
        applyHPMaxBonusChanged(draft, event);
        break;
      case 'ResourceSpent':
        applyResourceSpent(draft, event);
        break;
      case 'ResourceRestored':
        applyResourceRestored(draft, event);
        break;
      case 'HitDieSpent':
        applyHitDieSpent(draft, event);
        break;
      case 'ShortRestStarted':
        applyShortRestStarted(draft, event);
        break;
      case 'ShortRestEnded':
        applyShortRestEnded(draft, event);
        break;
      case 'LongRestStarted':
        applyLongRestStarted(draft, event);
        break;
      case 'LongRestEnded':
        applyLongRestEnded(draft, event);
        break;
      case 'EncounterCreated':
        applyEncounterCreated(draft, event);
        break;
      case 'CombatantPlaced':
        applyCombatantPlaced(draft, event);
        break;
      case 'EncounterStarted':
        applyEncounterStarted(draft, event);
        break;
      case 'InitiativeRolled':
        applyInitiativeRolled(draft, event);
        break;
      case 'InitiativeSwapped':
        applyInitiativeSwapped(draft, event);
        break;
      case 'TurnStarted':
        applyTurnStarted(draft, event);
        break;
      case 'TurnEnded':
        applyTurnEnded(draft, event);
        break;
      case 'RoundEnded':
        applyRoundEnded(draft, event);
        break;
      case 'EncounterEnded':
        applyEncounterEnded(draft, event);
        break;
      case 'AttackRolled':
        applyAttackRolled(draft, event);
        break;
      case 'DamageRolled':
        applyDamageRolled(draft, event);
        break;
      case 'WeaponLoaded':
        applyWeaponLoaded(draft, event);
        break;
      case 'ItemAcquired':
        applyItemAcquired(draft, event);
        break;
      case 'LevelUpResolved':
        applyLevelUpResolved(draft, event);
        break;
      case 'ChoiceRequired':
        applyChoiceRequired(draft, event);
        break;
      case 'ChoiceResolved':
        applyChoiceResolved(draft, event);
        break;
      case 'SubclassChosen':
        applySubclassChosen(draft, event);
        break;
      case 'SaveRolled':
        applySaveRolled(draft, event);
        break;
      case 'AbilityCheckRolled':
        applyAbilityCheckRolled(draft, event);
        break;
      case 'SpellCastDeclared':
        applySpellCastDeclared(draft, event);
        break;
      case 'SpellCastFizzled':
        // Slice 682: transcript-only marker (no state mutation).
        // The action consume (separate ActionEconomyConsumed event)
        // is what records the cost; no slot consumption per RAW.
        break;
      case 'SpellSlotConsumed':
        applySpellSlotConsumed(draft, event);
        break;
      case 'PactSlotConsumed':
        applyPactSlotConsumed(draft, event);
        break;
      case 'PactSlotsRegained':
        applyPactSlotsRegained(draft, event);
        break;
      case 'SpellSlotsRegained':
        applySpellSlotsRegained(draft, event);
        break;
      case 'PreparedSpellsChanged':
        applyPreparedSpellsChanged(draft, event);
        break;
      case 'FreeCastUsed':
        applyFreeCastUsed(draft, event);
        break;
      case 'PerDayCastUsed':
        applyPerDayCastUsed(draft, event);
        break;
      case 'ConcentrationStarted':
        applyConcentrationStarted(draft, event);
        break;
      case 'ConcentrationBroken':
        applyConcentrationBroken(draft, event);
        break;
      case 'SpellEffectStarted':
        applySpellEffectStarted(draft, event);
        break;
      case 'TriggerFired':
        applyTriggerFired(draft, event);
        break;
      case 'ActionEconomyConsumed':
        applyActionEconomyConsumed(draft, event);
        break;
      case 'ActionReadied':
        applyActionReadied(draft, event);
        break;
      case 'RecklessAttackActivated':
        applyRecklessAttackActivated(draft, event);
        break;
      case 'SteadyAimActivated':
        applySteadyAimActivated(draft, event);
        break;
      case 'SteadyAimConsumed':
        applySteadyAimConsumed(draft, event);
        break;
      case 'FastHandsActivated':
        applyFastHandsActivated(draft, event);
        break;
      case 'DeflectAttacksUsed':
        applyDeflectAttacksUsed(draft, event);
        break;
      case 'StunningStrikeAttempted':
        applyStunningStrikeAttempted(draft, event);
        break;
      case 'SavageAttackerUsed':
        applySavageAttackerUsed(draft, event);
        break;
      case 'CombatantMoved':
        applyCombatantMoved(draft, event);
        break;
      case 'Dashed':
        applyDashed(draft, event);
        break;
      case 'Disengaged':
        applyDisengaged(draft, event);
        break;
      case 'OpportunityAvailable':
        // Notification-only event: no state effect. Surfaced by
        // planMove so consumers can decide whether to dispatch an
        // opportunity attack. Replay is a no-op for the reducer.
        break;
      case 'ItemEquipped':
        applyItemEquipped(draft, event);
        break;
      case 'ItemUnequipped':
        applyItemUnequipped(draft, event);
        break;
      case 'ItemAttuned':
        applyItemAttuned(draft, event);
        break;
      case 'ItemUnattuned':
        applyItemUnattuned(draft, event);
        break;
      case 'ItemBuffApplied':
        applyItemBuffApplied(draft, event);
        break;
      case 'ItemBuffRemoved':
        applyItemBuffRemoved(draft, event);
        break;
      case 'ItemConsumed':
        applyItemConsumed(draft, event);
        break;
      case 'ItemUsed':
        applyItemUsed(draft, event);
        break;
      case 'ItemDestroyed':
        applyItemDestroyed(draft, event);
        break;
      case 'ItemTimeBudgetConsumed':
        applyItemTimeBudgetConsumed(draft, event);
        break;
      case 'PartyCreated':
        applyPartyCreated(draft, event);
        break;
      case 'PartyMembersChanged':
        applyPartyMembersChanged(draft, event);
        break;
      case 'CurrencyAcquired':
        applyCurrencyAcquired(draft, event);
        break;
      case 'CurrencySpent':
        applyCurrencySpent(draft, event);
        break;
      case 'ItemDepositedToParty':
        applyItemDepositedToParty(draft, event);
        break;
      case 'ItemWithdrawnFromParty':
        applyItemWithdrawnFromParty(draft, event);
        break;
      case 'SessionStarted':
        applySessionStarted(draft, event);
        break;
      case 'SessionEnded':
        applySessionEnded(draft, event);
        break;
      case 'JournalEntryAdded':
        applyJournalEntryAdded(draft, event);
        break;
      case 'InGameTimeAdvanced':
        applyInGameTimeAdvanced(draft, event);
        break;
      case 'LocationCreated':
        applyLocationCreated(draft, event);
        break;
      case 'DoorAdded':
        applyDoorAdded(draft, event);
        break;
      case 'DoorStateChanged':
        applyDoorStateChanged(draft, event);
        break;
      case 'CharacterLocationChanged':
        applyCharacterLocationChanged(draft, event);
        break;
      case 'QuestStarted':
        applyQuestStarted(draft, event);
        break;
      case 'ObjectiveProgressed':
        applyObjectiveProgressed(draft, event);
        break;
      case 'ObjectiveCompleted':
        applyObjectiveCompleted(draft, event);
        break;
      case 'ObjectiveFailed':
        applyObjectiveFailed(draft, event);
        break;
      case 'QuestCompleted':
        applyQuestCompleted(draft, event);
        break;
      case 'QuestFailed':
        applyQuestFailed(draft, event);
        break;
      case 'QuestAbandoned':
        applyQuestAbandoned(draft, event);
        break;
      case 'QuestRewardClaimed':
        applyQuestRewardClaimed(draft, event);
        break;
      case 'XPAwarded':
        applyXPAwarded(draft, event);
        break;
      case 'MilestoneAwarded':
        applyMilestoneAwarded(draft, event);
        break;
      case 'SpellCountered':
        applySpellCountered(draft, event);
        break;
      case 'SpellDispelled':
        applySpellDispelled(draft, event);
        break;
      case 'ItemIdentified':
        applyItemIdentified(draft, event);
        break;
      case 'ShieldCast':
        // Pure notification — the AC bump comes from ConditionApplied
        // ('shielded'), and the consumer decides whether to commit the
        // damage chain based on the `preventedHit` flag.
        break;
      case 'AbsorbElementsCast':
        // Pure notification — the damage refund flows through `Healed`
        // and the on-next-hit rider rides on a ConditionApplied for
        // the matching element. This event surfaces the absorbed type
        // + amount for transcript readability.
        break;
      case 'SanctuaryProtected':
        // Pure notification — the SaveRolled event already captures
        // the d20 + DC + outcome; this event marks the failed-save
        // case for the transcript and for the consumer's branching
        // (consumer redirects or drops the attack).
        break;
      case 'ProtectionUsed':
        // Pure notification — the new d20 is on the event payload;
        // the consumer pairs it with the original AttackRolled's d20
        // to compute the disadvantaged outcome (lower of the two).
        // ActionEconomyConsumed handles the reaction bookkeeping.
        break;
      case 'GuidanceUsed':
        // Pure notification — the 'guided' condition is lifted by the
        // ConcentrationBroken(reason='used') that the planner emits
        // alongside this event. The d4 value is informational; the
        // consumer adds it to whatever ability check it applies to.
        break;
      case 'UncannyDodgeUsed':
        // Pure notification — the damage refund flows through `Healed`
        // and the reaction bookkeeping rides on the
        // ActionEconomyConsumed event the planner also emits. This
        // event surfaces the halved-amount + the triggering
        // DamageApplied id for transcript readability.
        break;
      case 'MirrorImageDeflected':
        applyMirrorImageDeflected(draft, event);
        break;
      case 'WeaponMasteryActivated':
        applyWeaponMasteryActivated(draft, event);
        break;
      case 'WeaponMasteriesChosen':
        applyWeaponMasteriesChosen(draft, event);
        break;
      case 'Mounted':
        applyMounted(draft, event);
        break;
      case 'Dismounted':
        applyDismounted(draft, event);
        break;
      case 'VehicleAcquired':
        applyVehicleAcquired(draft, event);
        break;
      case 'VehicleBoarded':
        applyVehicleBoarded(draft, event);
        break;
      case 'VehicleDeparted':
        applyVehicleDeparted(draft, event);
        break;
      case 'VehicleDamaged':
        applyVehicleDamaged(draft, event);
        break;
      case 'VehicleRepaired':
        applyVehicleRepaired(draft, event);
        break;
      case 'TravelLegCompleted':
        applyTravelLegCompleted(draft, event);
        break;
      case 'NavigationCheckRolled':
        applyNavigationCheckRolled(draft, event);
        break;
      case 'ForagedFor':
        applyForagedFor(draft, event);
        break;
      case 'AttitudeChanged':
        applyAttitudeChanged(draft, event);
        break;
      case 'MoraleCheckRolled':
        applyMoraleCheckRolled(draft, event);
        break;
      case 'MoraleBroken':
        applyMoraleBroken(draft, event);
        break;
      case 'DowntimeActivityResolved':
        applyDowntimeActivityResolved(draft, event);
        break;
      case 'ItemChargeConsumed':
        applyItemChargeConsumed(draft, event);
        break;
      case 'ItemRecharged':
        applyItemRecharged(draft, event);
        break;
      case 'SentientItemConflict':
        applySentientItemConflict(draft, event);
        break;
      case 'BastionFounded':
        applyBastionFounded(draft, event);
        break;
      case 'BastionFacilityAdded':
        applyBastionFacilityAdded(draft, event);
        break;
      case 'BastionHirelingAdded':
        applyBastionHirelingAdded(draft, event);
        break;
      case 'BastionTurnTaken':
        applyBastionTurnTaken(draft, event);
        break;
      case 'BastionDamaged':
        applyBastionDamaged(draft, event);
        break;
      case 'BastionLevelChanged':
        applyBastionLevelChanged(draft, event);
        break;
      case 'CharacterResurrected':
        applyCharacterResurrected(draft, event);
        break;
      case 'PolymorphApplied':
        applyPolymorphApplied(draft, event);
        break;
      case 'PolymorphReverted':
        applyPolymorphReverted(draft, event);
        break;
      case 'SimulacrumCreated':
        applySimulacrumCreated(draft, event);
        break;
      case 'WishGranted':
        applyWishGranted(draft, event);
        break;
      case 'CompanionSummoned':
        applyCompanionSummoned(draft, event);
        break;
      case 'CompanionDismissed':
        applyCompanionDismissed(draft, event);
        break;
      case 'TrapArmed':
        applyTrapArmed(draft, event);
        break;
      case 'TrapTriggered':
        applyTrapTriggered(draft, event);
        break;
      case 'TrapExpired':
        applyTrapExpired(draft, event);
        break;
      case 'RemoteSensorPlaced':
        applyRemoteSensorPlaced(draft, event);
        break;
      case 'RemoteSensorModeChanged':
        applyRemoteSensorModeChanged(draft, event);
        break;
      case 'RemoteSensorRemoved':
        applyRemoteSensorRemoved(draft, event);
        break;
      case 'RemoteSensorMoved':
        applyRemoteSensorMoved(draft, event);
        break;
      case 'IllusionCreated':
        applyIllusionCreated(draft, event);
        break;
      case 'IllusionInvestigated':
        applyIllusionInvestigated(draft, event);
        break;
      case 'IllusionDismissed':
        applyIllusionDismissed(draft, event);
        break;
      case 'BreathWeaponFired':
        applyBreathWeaponFired(draft, event);
        break;
      case 'BreathWeaponRecharged':
        applyBreathWeaponRecharged(draft, event);
        break;
      case 'SaveActionExpended':
        applySaveActionExpended(draft, event);
        break;
      case 'SaveActionRecharged':
        applySaveActionRecharged(draft, event);
        break;
      case 'CampaignSettingsChanged':
        applyCampaignSettingsChanged(draft, event);
        break;
      case 'HeroPointGranted':
        applyHeroPointGranted(draft, event);
        break;
      case 'HeroPointSpent':
        applyHeroPointSpent(draft, event);
        break;
      default: {
        const exhaustive: never = event;
        invariant(false, `Unhandled event: ${JSON.stringify(exhaustive)}`);
      }
    }
    draft.version += 1;
  });

export const applyAll = (state: CampaignState, events: ReadonlyArray<Event>): CampaignState =>
  events.reduce<CampaignState>(apply, state);
