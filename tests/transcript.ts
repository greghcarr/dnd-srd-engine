// Human-readable transcript formatter for golden test scenarios.
// Each event becomes a single markdown line; encounter and turn events
// insert grouping headers. Used via vitest `toMatchFileSnapshot` so every
// golden scenario writes a checked-in .transcript.md alongside it. Open
// the file in VS Code and run "Open Preview" (Cmd+Shift+V) to read it as
// rich text with bold names and sized headings rather than parsing raw
// markdown markers.

import type { Event } from '../src/schemas/events/index.js';
import type { CampaignState } from '../src/schemas/runtime/campaign.js';
import type { ResolvedContent } from '../src/content/pack.js';
import { emptyCampaignState } from '../src/schemas/runtime/campaign.js';
import { apply } from '../src/engine/apply.js';
import { formatInGameTime } from '../src/schemas/runtime/in-game-time.js';

interface FormatterContext {
  readonly stateBefore: CampaignState;
  readonly stateAfter: CampaignState;
  readonly content: ResolvedContent;
}

const characterName = (state: CampaignState, id: string): string =>
  state.characters[id]?.name ?? `<${id.slice(0, 8)}>`;

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const itemName = (state: CampaignState, content: ResolvedContent, id: string): string => {
  const inst = state.itemInstances[id];
  if (!inst) return id;
  const def = content.items.get(inst.definitionId);
  return inst.customName ?? def?.name ?? inst.definitionId;
};

const spellName = (content: ResolvedContent, id: string): string =>
  content.spells.get(id)?.name ?? id;

const conditionName = (content: ResolvedContent, id: string): string =>
  content.conditions.get(id)?.name ?? id;

const encounterLabel = (state: CampaignState, id: string): string => {
  const name = state.encounters[id]?.name;
  return name !== undefined ? `"${name}"` : 'the encounter';
};

const hpChange = (before: number | undefined, after: number | undefined): string => {
  if (before === undefined || after === undefined) return '';
  if (before === after) return '';
  return ` (HP ${before} -> ${after})`;
};

// Render a roll's component breakdown next to the flat bonus so a reader
// can tell where a small or zero bonus came from. Returns "" when the
// breakdown is absent, has one entry, or contains only zero contributions
// — those cases would just repeat the bonus number with no new information.
const formatBreakdown = (
  breakdown: ReadonlyArray<{ source: string; value: number }> | undefined,
): string => {
  if (breakdown === undefined || breakdown.length <= 1) return '';
  const meaningful = breakdown.filter((e) => e.value !== 0);
  if (meaningful.length <= 1) return '';
  const parts = meaningful.map(
    (e) => `${e.value >= 0 ? '+' : ''}${e.value} ${e.source}`,
  );
  return ` (${parts.join(', ')})`;
};

const sumDamage = (event: Extract<Event, { type: 'DamageApplied' }>): { total: number; summary: string } => {
  let total = 0;
  const parts: string[] = [];
  for (const c of event.components) {
    total += c.amount;
    const baseLabel = `${c.amount} ${c.type}`;
    if (c.mitigation !== undefined && c.rawAmount !== undefined) {
      parts.push(`${baseLabel} [${c.mitigation} from ${c.rawAmount}]`);
    } else {
      parts.push(baseLabel);
    }
  }
  return { total, summary: parts.join(' + ') };
};

const formatEvent = (event: Event, ctx: FormatterContext): string => {
  const { stateBefore, stateAfter, content } = ctx;
  switch (event.type) {
    case 'CharacterCreated': {
      const c = event.snapshot;
      if (c.kind === 'creature') {
        const label = c.statblockId !== undefined ? c.statblockId : 'creature';
        return `**${c.name}** appears (${label}, ${c.hp.current}/${c.hp.max} HP).`;
      }
      if (c.kind === 'npc') {
        return `**${c.name}** appears (NPC, ${c.hp.current}/${c.hp.max} HP).`;
      }
      const cls = c.classes.map((e) => `${e.classId} ${e.level}`).join(' / ');
      return `**${c.name}** joined (${cls}, ${c.hp.current}/${c.hp.max} HP).`;
    }
    case 'ItemAcquired':
      return `Item acquired: ${content.items.get(event.instance.definitionId)?.name ?? event.instance.definitionId}.`;
    case 'DamageApplied': {
      const target = characterName(stateBefore, event.targetId);
      const before = stateBefore.characters[event.targetId]?.hp.current;
      const after = stateAfter.characters[event.targetId]?.hp.current;
      const { total, summary } = sumDamage(event);
      const sourceLabel = event.sourceCharacterId !== undefined
        ? ` from **${characterName(stateBefore, event.sourceCharacterId)}**`
        : event.source !== undefined
          ? ` from ${event.source}`
          : '';
      return `**${target}** takes ${total} damage${sourceLabel} (${summary}).${hpChange(before, after)}`;
    }
    case 'Healed': {
      const target = characterName(stateBefore, event.targetId);
      const before = stateBefore.characters[event.targetId]?.hp.current;
      const after = stateAfter.characters[event.targetId]?.hp.current;
      const source = event.source !== undefined ? ` from ${event.source}` : '';
      return `**${target}** healed ${event.amount}${source}.${hpChange(before, after)}`;
    }
    case 'TempHPGranted':
      return `**${characterName(stateBefore, event.targetId)}** gains ${event.amount} temp HP.`;
    case 'ConditionApplied':
      return `**${characterName(stateBefore, event.targetId)}** is now ${conditionName(content, event.conditionId)}${event.level !== undefined ? ` (level ${event.level})` : ''}.`;
    case 'ConditionRemoved':
      return `**${characterName(stateBefore, event.targetId)}** is no longer ${conditionName(content, event.conditionId)}.`;
    case 'CreaturePushed':
      return `**${characterName(stateBefore, event.targetId)}** is pushed ${event.distanceFeet} ft (${event.source ?? 'source unknown'}).`;
    case 'ExhaustionChanged':
      return `**${characterName(stateBefore, event.targetId)}** exhaustion ${event.fromLevel} -> ${event.toLevel}.`;
    case 'DeathSaveRolled': {
      const verdict = event.critical ? 'critical success!' : event.success ? 'success' : 'failure';
      return `**${characterName(stateBefore, event.targetId)}** death save: d20(${event.d20}) -> ${verdict}.`;
    }
    case 'Stabilized':
      return `**${characterName(stateBefore, event.targetId)}** stabilized.`;
    case 'CreatureDestroyed':
      return `**${characterName(stateBefore, event.targetId)}** is destroyed${event.sourceCharacterId !== undefined ? ` by **${characterName(stateBefore, event.sourceCharacterId)}**` : ''}.`;
    case 'ResourceSpent':
      return `**${characterName(stateBefore, event.characterId)}** spends ${event.amount} ${event.resourceId}.`;
    case 'ResourceRestored':
      return `**${characterName(stateBefore, event.characterId)}** restores ${event.amount === 'all' ? 'all' : event.amount} ${event.resourceId}.`;
    case 'HitDieSpent':
      return `**${characterName(stateBefore, event.characterId)}** spends a hit die (d${event.die}=${event.rolled}+${event.conMod}=${event.healed} HP).`;
    case 'ShortRestStarted':
      return `\n## Short rest begins (${event.participantIds.map((id) => characterName(stateBefore, id)).join(', ')})\n`;
    case 'ShortRestEnded':
      return `Short rest ends.\n`;
    case 'LongRestStarted':
      return `\n## Long rest begins (${event.participantIds.map((id) => characterName(stateBefore, id)).join(', ')})\n`;
    case 'LongRestEnded':
      return `Long rest ends.\n`;
    case 'EncounterCreated':
      return `\n## Encounter created: ${event.name ?? 'unnamed'} (${event.combatantIds.length} combatants)\n`;
    case 'InitiativeRolled': {
      const sorted = [...event.rolls].sort((a, b) => b.total - a.total);
      const order = sorted.map(
        (r) => `${characterName(stateBefore, r.combatantId)} (d20=${r.d20}${r.modifier >= 0 ? '+' : ''}${r.modifier}=${r.total})`,
      );
      return `Initiative: ${order.join(', ')}.`;
    }
    case 'EncounterStarted':
      return `Encounter ${encounterLabel(stateBefore, event.encounterId)} begins.`;
    case 'TurnStarted':
      return `\n### Round ${event.round}: ${characterName(stateBefore, event.combatantId)}'s turn\n`;
    case 'TurnEnded':
      return `End of ${characterName(stateBefore, event.combatantId)}'s turn.`;
    case 'RoundEnded':
      return `\nEnd of round ${event.round}.\n`;
    case 'EncounterEnded':
      return `\n## Encounter ends: ${event.outcome}.\n`;
    case 'AttackRolled': {
      const attacker = characterName(stateBefore, event.attackerId);
      const target = characterName(stateBefore, event.targetId);
      const advLabel = event.used === 'none' ? '' : ` [${event.used}]`;
      const rollLabel = event.d20.length === 2 ? `${event.d20[0]}/${event.d20[1]}` : `${event.d20[0]}`;
      const verdict = event.critical
        ? 'CRITICAL HIT!'
        : event.hit
          ? 'hit'
          : 'miss';
      const bonusDiceLabel =
        event.bonusDice === undefined
          ? ''
          : event.bonusDice
              .map((b) => ` [${b.subtract ? '-' : '+'}${b.dice}=${b.rolls.join(',')} ${b.source}]`)
              .join('');
      return `**${attacker}** attacks **${target}**${advLabel}: d20(${rollLabel}) + ${event.attackBonus}${bonusDiceLabel} = ${event.total} vs AC ${event.targetAC} -> ${verdict}.`;
    }
    case 'DamageRolled': {
      const parts = event.rolls.map(
        (r) => `${r.expression}=[${r.rolls.join(',')}]${r.modifier >= 0 ? '+' : ''}${r.modifier} ${r.type}`,
      );
      return `Damage rolled${event.critical ? ' (critical, doubled dice)' : ''}: ${parts.join(', ')}.`;
    }
    case 'SaveRolled':
      return `**${characterName(stateBefore, event.targetId)}** ${event.ability} save: d20(${event.d20[0]}) + ${event.bonus}${formatBreakdown(event.breakdown)} = ${event.total} vs DC ${event.dc} -> ${event.success ? 'success' : 'failure'}.`;
    case 'AbilityCheckRolled': {
      const label = event.skill !== undefined ? event.skill : `${event.ability} check`;
      const dcLine = event.dc !== undefined ? ` vs DC ${event.dc} -> ${event.success === true ? 'success' : 'failure'}` : '';
      return `**${characterName(stateBefore, event.characterId)}** ${label}: d20(${event.d20[0]}) + ${event.bonus}${formatBreakdown(event.breakdown)} = ${event.total}${dcLine}.`;
    }
    case 'LevelUpResolved': {
      const hpLabel = event.hpRoll !== undefined ? `rolled d? = ${event.hpRoll}, total +${event.hpGained}` : `average, +${event.hpGained}`;
      return `**${characterName(stateBefore, event.characterId)}** levels up: ${event.classId} -> ${event.newClassLevel} (${hpLabel} HP).`;
    }
    case 'ChoiceRequired':
      return `Choice required for **${characterName(stateBefore, event.characterId)}**: ${event.prompt} (${event.options.map((o) => o.label).join(' / ')}).`;
    case 'ChoiceResolved':
      return `**${characterName(stateBefore, event.characterId)}** chose: ${event.selectedOptionIds.join(', ')}.`;
    case 'SpellCastDeclared': {
      const targets = event.targetIds.length === 0
        ? 'no targets'
        : event.targetIds.map((id) => characterName(stateBefore, id)).join(', ');
      const slotLabel = event.slotLevel === 0 ? 'cantrip' : `${ordinal(event.slotLevel)}-level slot${event.slotSource === 'pact' ? ' (pact)' : ''}`;
      return `**${characterName(stateBefore, event.characterId)}** casts ${spellName(content, event.spellId)} (${slotLabel}) at ${targets}.`;
    }
    case 'SpellSlotConsumed':
      return `Slot consumed: ${ordinal(event.slotLevel)}-level.`;
    case 'PactSlotConsumed':
      return `Pact slot consumed.`;
    case 'ConcentrationStarted': {
      const caster = characterName(stateBefore, event.casterId);
      const spell = spellName(content, event.spellId);
      return `**${caster}** is now concentrating on ${spell}.`;
    }
    case 'ConcentrationBroken': {
      const caster = characterName(stateBefore, event.casterId);
      const spell = stateBefore.effectInstances[event.effectInstanceId]?.spellId;
      const spellLabel = spell !== undefined ? spellName(content, spell) : 'their spell';
      return `**${caster}**'s concentration on ${spellLabel} broke (${event.reason}).`;
    }
    case 'TriggerFired':
      return `_(${event.triggerId.split(':').slice(1).join(':')} triggers for ${characterName(stateBefore, event.characterId)})_`;
    case 'ActionEconomyConsumed':
      return `_(${characterName(stateBefore, event.combatantId)} consumes ${event.kind})_`;
    case 'RecklessAttackActivated':
      return `**${characterName(stateBefore, event.combatantId)}** attacks recklessly.`;
    case 'StunningStrikeAttempted':
      return `**${characterName(stateBefore, event.combatantId)}** attempts a Stunning Strike against **${characterName(stateBefore, event.targetId)}**.`;
    case 'CombatantMoved': {
      const who = characterName(stateBefore, event.combatantId);
      const from = event.fromPosition;
      const to = event.toPosition;
      const fromLabel = from !== undefined ? `(${from.x}, ${from.y})` : '?';
      return `**${who}** moves ${event.feetTraveled}ft: ${fromLabel} -> (${to.x}, ${to.y}).`;
    }
    case 'Dashed':
      return `**${characterName(stateBefore, event.combatantId)}** Dashes.`;
    case 'Disengaged':
      return `**${characterName(stateBefore, event.combatantId)}** Disengages.`;
    case 'OpportunityAvailable':
      return `_(${characterName(stateBefore, event.reactorId)} has an opportunity attack on ${characterName(stateBefore, event.moverId)})_`;
    case 'WeaponLoaded':
      return `_(${characterName(stateBefore, event.combatantId)}'s loading weapon spent this turn)_`;
    case 'ItemEquipped':
      return `**${characterName(stateBefore, event.characterId)}** equips ${itemName(stateBefore, content, event.instanceId)} (${event.slot}).`;
    case 'ItemUnequipped':
      return `**${characterName(stateBefore, event.characterId)}** unequips ${event.slot}.`;
    case 'ItemAttuned':
      return `**${characterName(stateBefore, event.characterId)}** attunes to ${itemName(stateBefore, content, event.instanceId)}.`;
    case 'ItemUnattuned':
      return `**${characterName(stateBefore, event.characterId)}** ends attunement to ${itemName(stateBefore, content, event.instanceId)}.`;
    case 'ItemBuffApplied':
      return `${itemName(stateBefore, content, event.instanceId)} gains +${event.attackBonus} attack / +${event.damageBonus} damage (${event.source ?? 'spell'}).`;
    case 'ItemBuffRemoved':
      return `${itemName(stateBefore, content, event.instanceId)} loses its temporary buff.`;
    case 'ItemConsumed': {
      const consumer = characterName(stateBefore, event.characterId);
      const targetName = characterName(stateBefore, event.targetId);
      const item = content.items.get(event.definitionId)?.name ?? event.definitionId;
      const target = event.targetId === event.characterId ? consumer : targetName;
      return `**${consumer}** consumed ${item}${target !== consumer ? ` (on ${target})` : ''}.`;
    }
    case 'ItemUsed': {
      const user = characterName(stateBefore, event.characterId);
      const targetName = characterName(stateBefore, event.targetId);
      const item = content.items.get(event.definitionId)?.name ?? event.definitionId;
      const target = event.targetId === event.characterId ? user : targetName;
      return `**${user}** used ${item}${target !== user ? ` (on ${target})` : ''}.`;
    }
    case 'ItemDestroyed': {
      const owner = characterName(stateBefore, event.characterId);
      const item = content.items.get(event.definitionId)?.name ?? event.definitionId;
      return `${item} crumbles to ashes (degradation roll: ${event.rollResult} on d${event.rollDie}). **${owner}** loses the item.`;
    }
    case 'ItemTimeBudgetConsumed': {
      const user = characterName(stateBefore, event.byCharacterId);
      const item = itemName(stateBefore, content, event.instanceId);
      return `**${user}** uses ${item} for ${event.amountMinutes} minute${event.amountMinutes === 1 ? '' : 's'} (cumulative time budget).`;
    }
    case 'PartyCreated': {
      const members = event.memberIds.length === 0
        ? 'no members'
        : event.memberIds.map((id) => characterName(stateBefore, id)).join(', ');
      return `\n## Party "${event.name}" formed (${members})\n`;
    }
    case 'PartyMembersChanged': {
      const party = stateBefore.parties[event.partyId];
      const partyName = party?.name ?? event.partyId.slice(0, 8);
      const added = event.added.map((id) => characterName(stateBefore, id));
      const removed = event.removed.map((id) => characterName(stateBefore, id));
      const segments: string[] = [];
      if (added.length > 0) segments.push(`+${added.join(', ')}`);
      if (removed.length > 0) segments.push(`-${removed.join(', ')}`);
      return `Party "${partyName}" membership: ${segments.join(', ')}.`;
    }
    case 'CurrencyAcquired': {
      const partyName = stateBefore.parties[event.partyId]?.name ?? event.partyId.slice(0, 8);
      const parts = Object.entries(event.amounts)
        .filter(([, count]) => (count ?? 0) > 0)
        .map(([denomination, count]) => `${count} ${denomination}`);
      const sourceLabel = event.source !== undefined ? ` (${event.source})` : '';
      return `Party "${partyName}" receives ${parts.join(', ')}${sourceLabel}.`;
    }
    case 'CurrencySpent': {
      const partyName = stateBefore.parties[event.partyId]?.name ?? event.partyId.slice(0, 8);
      const parts = Object.entries(event.amounts)
        .filter(([, count]) => (count ?? 0) > 0)
        .map(([denomination, count]) => `${count} ${denomination}`);
      const purposeLabel = event.purpose !== undefined ? ` for ${event.purpose}` : '';
      return `Party "${partyName}" spends ${parts.join(', ')}${purposeLabel}.`;
    }
    case 'ItemDepositedToParty': {
      const partyName = stateBefore.parties[event.partyId]?.name ?? event.partyId.slice(0, 8);
      const item = itemName(stateBefore, content, event.itemInstanceId);
      const sourceLabel = event.sourceCharacterId !== undefined
        ? ` from ${characterName(stateBefore, event.sourceCharacterId)}`
        : '';
      return `${item} deposited to party "${partyName}"${sourceLabel}.`;
    }
    case 'ItemWithdrawnFromParty': {
      const partyName = stateBefore.parties[event.partyId]?.name ?? event.partyId.slice(0, 8);
      const item = itemName(stateBefore, content, event.itemInstanceId);
      const recipientLabel = event.recipientCharacterId !== undefined
        ? ` to ${characterName(stateBefore, event.recipientCharacterId)}`
        : '';
      return `${item} withdrawn from party "${partyName}"${recipientLabel}.`;
    }
    case 'SessionStarted':
      return `\n## Session "${event.name}" begins (${formatInGameTime(stateAfter.sessions[event.sessionId]!.inGameStart)})\n`;
    case 'SessionEnded': {
      const session = stateAfter.sessions[event.sessionId]!;
      const summary = event.summary !== undefined ? `: ${event.summary}` : '';
      return `Session "${session.name}" ends${summary}.`;
    }
    case 'JournalEntryAdded': {
      const author = event.authorKind === 'dm'
        ? 'DM'
        : event.authorCharacterId !== undefined
          ? characterName(stateBefore, event.authorCharacterId)
          : 'Player';
      const visibilityLabel = event.visibility === 'party' ? '' : ` [${event.visibility}]`;
      const stamp = formatInGameTime(stateBefore.inGameTime);
      return `_Journal (${author}, ${stamp})${visibilityLabel}_: **${event.title}**: ${event.body}`;
    }
    case 'InGameTimeAdvanced': {
      const before = formatInGameTime(stateBefore.inGameTime);
      const after = formatInGameTime(stateAfter.inGameTime);
      const reasonLabel = event.reason !== undefined ? ` (${event.reason})` : '';
      return `Time passes: ${before} -> ${after} (+${event.minutes} min)${reasonLabel}.`;
    }
    case 'LocationCreated': {
      const mapLabel = event.map !== undefined
        ? ` (map ${event.map.widthCells}x${event.map.heightCells} cells)`
        : '';
      return `Location "${event.name}" created${mapLabel}.`;
    }
    case 'DoorAdded': {
      const label = event.name ?? `door ${event.doorId.slice(0, 6)}`;
      const location = stateAfter.locations[event.locationId]?.name ?? event.locationId.slice(0, 6);
      return `Door "${label}" added at ${location} (${event.position.x},${event.position.y}), ${event.state}.`;
    }
    case 'DoorStateChanged': {
      const door = stateAfter.doors[event.doorId];
      const label = door?.name ?? `door ${event.doorId.slice(0, 6)}`;
      const by = event.byCharacterId !== undefined
        ? ` by **${characterName(stateBefore, event.byCharacterId)}**`
        : '';
      return `Door "${label}" is now ${event.toState}${by}.`;
    }
    case 'CharacterLocationChanged': {
      const who = characterName(stateBefore, event.characterId);
      if (event.toLocationId === undefined) return `**${who}** leaves their location.`;
      const loc = stateAfter.locations[event.toLocationId]?.name ?? event.toLocationId.slice(0, 6);
      return `**${who}** enters ${loc}.`;
    }
    case 'QuestStarted':
      return `\n## Quest started: "${event.title}"\n`;
    case 'ObjectiveProgressed': {
      const objective = stateAfter.quests[event.questId]?.objectives.find((o) => o.id === event.objectiveId);
      const required = objective?.required;
      const progress = objective?.progress ?? 0;
      const progressLabel = required !== undefined ? ` (${progress}/${required})` : ` (+${event.delta})`;
      return `Objective progressed: ${objective?.description ?? event.objectiveId}${progressLabel}.`;
    }
    case 'ObjectiveCompleted': {
      const objective = stateAfter.quests[event.questId]?.objectives.find((o) => o.id === event.objectiveId);
      return `Objective completed: ${objective?.description ?? event.objectiveId}.`;
    }
    case 'ObjectiveFailed': {
      const objective = stateAfter.quests[event.questId]?.objectives.find((o) => o.id === event.objectiveId);
      return `Objective failed: ${objective?.description ?? event.objectiveId}.`;
    }
    case 'QuestCompleted': {
      const quest = stateAfter.quests[event.questId];
      return `**Quest completed:** "${quest?.title ?? event.questId}".`;
    }
    case 'QuestFailed': {
      const quest = stateAfter.quests[event.questId];
      const reason = event.reason !== undefined ? ` (${event.reason})` : '';
      return `**Quest failed:** "${quest?.title ?? event.questId}"${reason}.`;
    }
    case 'QuestAbandoned': {
      const quest = stateAfter.quests[event.questId];
      const reason = event.reason !== undefined ? ` (${event.reason})` : '';
      return `Quest abandoned: "${quest?.title ?? event.questId}"${reason}.`;
    }
    case 'QuestRewardClaimed': {
      const quest = stateAfter.quests[event.questId];
      const xp = quest?.reward.xpPerCharacter ?? 0;
      const recipients = event.beneficiaryCharacterIds
        .map((id) => characterName(stateAfter, id))
        .join(', ');
      const xpLabel = xp > 0 ? `${xp} XP each` : 'no XP';
      return `Quest reward claimed: "${quest?.title ?? event.questId}" (${xpLabel}${recipients !== '' ? ` to ${recipients}` : ''}).`;
    }
    case 'XPAwarded': {
      const who = characterName(stateAfter, event.characterId);
      const source = event.source !== undefined ? ` from ${event.source}` : '';
      return `**${who}** gains ${event.amount} XP${source}.`;
    }
    case 'MilestoneAwarded':
      return `Milestone (${event.kind}): "${event.title}".`;
    case 'SpellCountered': {
      const counter = characterName(stateBefore, event.counterCasterId);
      const target = characterName(stateBefore, event.targetCasterId);
      const spell = spellName(content, event.spellId);
      return `**${counter}** counterspells **${target}**'s ${spell}: the spell fails.`;
    }
    case 'SpellDispelled': {
      const who = characterName(stateBefore, event.dispelledByCharacterId);
      const effect = stateBefore.effectInstances[event.effectInstanceId];
      const spell = effect !== undefined ? spellName(content, effect.spellId) : 'an effect';
      return `**${who}** dispels ${spell}.`;
    }
    case 'ItemIdentified': {
      const who = characterName(stateBefore, event.identifiedByCharacterId);
      const item = itemName(stateBefore, content, event.itemInstanceId);
      return `**${who}** identifies ${item}.`;
    }
    case 'ShieldCast': {
      const who = characterName(stateBefore, event.casterId);
      const outcome = event.preventedHit ? 'turns the hit into a miss' : 'the attack still lands';
      return `**${who}** casts Shield: +5 AC, ${outcome}.`;
    }
    case 'GuidanceUsed': {
      const who = characterName(stateBefore, event.targetId);
      return `**${who}** spends Guidance: +${event.d4} to the ability check.`;
    }
    case 'AbsorbElementsCast': {
      const who = characterName(stateBefore, event.casterId);
      return `**${who}** casts Absorb Elements: heals ${event.halvedAmount} ${event.damageType}.`;
    }
    case 'SanctuaryProtected': {
      const attacker = characterName(stateBefore, event.attackerId);
      const warded = characterName(stateBefore, event.wardedCharacterId);
      return `**${attacker}** fails the Sanctuary WIS save; the attack on **${warded}** is averted.`;
    }
    case 'MirrorImageDeflected': {
      const attacker = characterName(stateBefore, event.attackerId);
      const bearer = characterName(stateBefore, event.bearerId);
      const outcome = event.duplicateHit
        ? `hits the duplicate (AC ${event.duplicateAC}) — destroyed, ${event.duplicatesAfter} remaining`
        : `misses the duplicate (AC ${event.duplicateAC}) — ${event.duplicatesAfter} remaining`;
      return `**${attacker}**'s attack is deflected to a Mirror Image duplicate of **${bearer}** (d20 ${event.deflectionD20} >= ${event.deflectionThreshold}); attack d20(${event.attackD20}) total ${event.attackTotal} ${outcome}.`;
    }
    case 'ProtectionUsed': {
      const protector = characterName(stateBefore, event.protectorId);
      const attacker = characterName(stateBefore, event.attackerId);
      return `**${protector}** uses their reaction (Protection); **${attacker}**'s attack now has disadvantage (new d20: ${event.newD20}).`;
    }
    case 'UncannyDodgeUsed': {
      const who = characterName(stateBefore, event.characterId);
      return `**${who}** uses their reaction (Uncanny Dodge); halves the attack's damage by ${event.halvedAmount}.`;
    }
    case 'HPMaxBonusChanged': {
      const who = characterName(stateBefore, event.targetId);
      const sign = event.delta >= 0 ? '+' : '';
      return `_(${who} HP max bonus ${sign}${event.delta})_`;
    }
    case 'HeroPointGranted': {
      const who = characterName(stateBefore, event.characterId);
      const sign = event.amount >= 0 ? '+' : '';
      return `_(${who} Hero Points ${sign}${event.amount})_`;
    }
    case 'HeroPointSpent': {
      const who = characterName(stateBefore, event.characterId);
      const ctx = event.appliedTo !== undefined ? ` on ${event.appliedTo}` : '';
      return `**${who}** spends a Hero Point${ctx}: +${event.d6}.`;
    }
    case 'WeaponMasteryActivated': {
      const who = characterName(stateBefore, event.attackerId);
      const targetLabel = event.targetId !== undefined
        ? ` against **${characterName(stateBefore, event.targetId)}**`
        : '';
      return `Mastery: ${event.mastery}${targetLabel} (${who}).`;
    }
    case 'Mounted': {
      const rider = characterName(stateBefore, event.riderId);
      const mount = characterName(stateBefore, event.mountId);
      return `**${rider}** mounts **${mount}**.`;
    }
    case 'Dismounted': {
      const rider = characterName(stateBefore, event.riderId);
      const mount = characterName(stateBefore, event.mountId);
      const how = event.voluntary ? '' : ' (knocked off)';
      return `**${rider}** dismounts ${mount}${how}.`;
    }
    case 'VehicleAcquired':
      return `Vehicle acquired: "${event.name}" (${event.kind}, AC ${event.ac}, ${event.maxHp} HP, ${event.capacity} seats).`;
    case 'VehicleBoarded': {
      const vehicle = stateAfter.vehicles[event.vehicleId];
      return `**${characterName(stateBefore, event.characterId)}** boards ${vehicle?.name ?? event.vehicleId}.`;
    }
    case 'VehicleDeparted': {
      const vehicle = stateAfter.vehicles[event.vehicleId];
      return `**${characterName(stateBefore, event.characterId)}** disembarks ${vehicle?.name ?? event.vehicleId}.`;
    }
    case 'VehicleDamaged': {
      const vehicle = stateAfter.vehicles[event.vehicleId];
      const source = event.source !== undefined ? ` from ${event.source}` : '';
      return `${vehicle?.name ?? event.vehicleId} takes ${event.amount} damage${source}.`;
    }
    case 'VehicleRepaired': {
      const vehicle = stateAfter.vehicles[event.vehicleId];
      return `${vehicle?.name ?? event.vehicleId} repaired for ${event.amount} HP.`;
    }
    case 'TravelLegCompleted': {
      const fromName = event.fromLocationId !== undefined
        ? (stateBefore.locations[event.fromLocationId]?.name ?? event.fromLocationId.slice(0, 6))
        : 'origin';
      const toName = event.toLocationId !== undefined
        ? (stateAfter.locations[event.toLocationId]?.name ?? event.toLocationId.slice(0, 6))
        : 'destination';
      const note = event.notes !== undefined ? ` (${event.notes})` : '';
      return `Travel: ${fromName} -> ${toName}, ${event.miles} mi over ${event.hours}h at ${event.pace} pace${note}.`;
    }
    case 'NavigationCheckRolled': {
      const navigator = characterName(stateBefore, event.navigatorId);
      const verdict = event.success ? 'on course' : 'lost';
      return `Navigation check (${navigator}): d20(${event.d20})+${event.bonus}=${event.total} vs DC ${event.dc} -> ${verdict}.`;
    }
    case 'ForagedFor': {
      const forager = characterName(stateBefore, event.foragerId);
      if (!event.success) {
        return `${forager} forages: d20(${event.d20})+${event.bonus}=${event.total} vs DC ${event.dc} -> nothing found.`;
      }
      return `${forager} forages: d20(${event.d20})+${event.bonus}=${event.total} vs DC ${event.dc} -> ${event.foodPounds} lb food, ${event.waterPounds} lb water.`;
    }
    case 'AttitudeChanged': {
      const who = characterName(stateBefore, event.characterId);
      const cause = event.cause !== undefined ? ` (${event.cause})` : '';
      return `${who} attitude -> ${event.toAttitude}${cause}.`;
    }
    case 'MoraleCheckRolled': {
      const who = characterName(stateBefore, event.characterId);
      return `${who} morale check: d20(${event.d20})+${event.bonus}=${event.total} vs DC ${event.dc} -> ${event.success ? 'holds' : 'shaken'}.`;
    }
    case 'MoraleBroken': {
      const who = characterName(stateBefore, event.characterId);
      return `${who}'s morale breaks: ${event.action}!`;
    }
    case 'DowntimeActivityResolved': {
      const who = characterName(stateBefore, event.characterId);
      const item = event.producedItemDefinitionId !== undefined
        ? `, produces ${content.items.get(event.producedItemDefinitionId)?.name ?? event.producedItemDefinitionId}`
        : '';
      const tool = event.toolProficiencyGained !== undefined ? `, gains tool: ${event.toolProficiencyGained}` : '';
      return `Downtime (${event.kind}): ${who}, ${event.days}d -> ${event.outcome}. ${event.summary}${item}${tool}.`;
    }
    case 'ItemChargeConsumed': {
      const item = itemName(stateBefore, content, event.itemInstanceId);
      const by = event.byCharacterId !== undefined ? ` by **${characterName(stateBefore, event.byCharacterId)}**` : '';
      const forEffect = event.forEffect !== undefined ? ` for ${event.forEffect}` : '';
      return `${item} loses ${event.amount} charge(s)${by}${forEffect}.`;
    }
    case 'ItemRecharged': {
      const item = itemName(stateBefore, content, event.itemInstanceId);
      return `${item} recharges ${event.amount} (${event.cadence}).`;
    }
    case 'SentientItemConflict': {
      const item = itemName(stateBefore, content, event.itemInstanceId);
      const who = characterName(stateBefore, event.wielderId);
      return `${item} vs ${who}: ${event.winner} prevails${event.description !== undefined ? ` (${event.description})` : ''}.`;
    }
    case 'CharacterResurrected': {
      const who = characterName(stateAfter, event.characterId);
      const caster = event.byCharacterId !== undefined
        ? ` by **${characterName(stateBefore, event.byCharacterId)}**`
        : '';
      const viaLabel = event.via === 'scroll'
        ? ' (from a scroll)'
        : event.via === 'special'
          ? ' (special)'
          : '';
      const newSpecies = event.newSpeciesId !== undefined ? `, reborn as ${event.newSpeciesId}` : '';
      return `**${who}** is restored via ${event.spell}${caster}${viaLabel} (now ${event.hpAfter} HP)${newSpecies}.`;
    }
    case 'PolymorphApplied': {
      const who = characterName(stateBefore, event.targetId);
      const caster = event.casterId !== undefined
        ? characterName(stateBefore, event.casterId)
        : undefined;
      const spellName_ = event.kind === 'wild-shape' ? 'Wild Shape' : event.kind === 'true-polymorph' ? 'True Polymorph' : 'Polymorph';
      const casterLabel = caster !== undefined && caster !== who ? `**${caster}** casts ${spellName_} on **${who}**: ` : `**${who}** uses ${spellName_}: `;
      return `${casterLabel}new form is ${event.form.name} (${event.form.hp} HP, AC ${event.form.ac}, speed ${event.form.speedFeet}).`;
    }
    case 'PolymorphReverted': {
      const who = characterName(stateAfter, event.targetId);
      return `**${who}** reverts (${event.reason}).`;
    }
    case 'SimulacrumCreated': {
      const original = characterName(stateBefore, event.originalId);
      return `Simulacrum of **${original}** created (${event.hpMax} HP).`;
    }
    case 'WishGranted': {
      const who = characterName(stateAfter, event.granterId);
      const stress = event.stressApplied ? ' (took the stress)' : '';
      return `**${who}** grants a wish${stress}: ${event.description}`;
    }
    case 'BastionFounded': {
      const owner = characterName(stateBefore, event.ownerCharacterId);
      return `Bastion "${event.name}" founded by **${owner}** at level ${event.level}.`;
    }
    case 'BastionFacilityAdded':
      return `Bastion facility added: "${event.name}" (${event.kind}, ${event.space}).`;
    case 'BastionHirelingAdded':
      return `Bastion hireling hired: ${event.name} (${event.role}).`;
    case 'BastionTurnTaken': {
      const delta = event.treasuryDeltaGp !== 0 ? ` (${event.treasuryDeltaGp >= 0 ? '+' : ''}${event.treasuryDeltaGp} gp)` : '';
      const summary = event.summary !== undefined ? `: ${event.summary}` : '';
      return `Bastion turn (${event.order})${delta}${summary}.`;
    }
    case 'BastionDamaged': {
      const src = event.source !== undefined ? ` from ${event.source}` : '';
      return `Bastion takes ${event.amount} damage${src}.`;
    }
    case 'BastionLevelChanged':
      return `Bastion levels up: ${event.fromLevel} -> ${event.toLevel}.`;
    case 'CampaignSettingsChanged': {
      const toggles: string[] = [];
      if (event.grittyRest !== undefined) toggles.push(`grittyRest=${event.grittyRest}`);
      if (event.heroPoints !== undefined) toggles.push(`heroPoints=${event.heroPoints}`);
      if (event.sanity !== undefined) toggles.push(`sanity=${event.sanity}`);
      if (event.massCombat !== undefined) toggles.push(`massCombat=${event.massCombat}`);
      if (event.feaCharacterFlaws !== undefined) toggles.push(`feaCharacterFlaws=${event.feaCharacterFlaws}`);
      if (event.customHouserulesAdd !== undefined) toggles.push(`+houserules: ${event.customHouserulesAdd.join(', ')}`);
      if (event.customHouserulesRemove !== undefined) toggles.push(`-houserules: ${event.customHouserulesRemove.join(', ')}`);
      return `Campaign settings: ${toggles.join(', ')}.`;
    }
    case 'CompanionSummoned': {
      const owner = characterName(stateBefore, event.controllerId);
      return `${owner} summons **${event.name}** (${event.hp} HP, AC ${event.ac}) via ${event.spellId} at slot ${event.slotLevel}.`;
    }
    case 'CompanionDismissed': {
      const name = characterName(stateBefore, event.companionId);
      return `${name} is dismissed.`;
    }
    case 'TrapArmed': {
      const who = characterName(stateBefore, event.sourceCharacterId);
      return `**${who}** arms ${event.label} (${event.chargesRemaining} ${event.chargesRemaining === 1 ? 'charge' : 'charges'}, ${event.payload.damageDice} ${event.payload.damageType}, DC ${event.payload.saveDC} ${event.payload.saveAbility}).`;
    }
    case 'TrapTriggered': {
      const who = characterName(stateBefore, event.triggeringCharacterId);
      return `**${who}** triggers a trap.`;
    }
    case 'TrapExpired': {
      return `Trap expired (${event.reason}).`;
    }
    case 'RemoteSensorPlaced': {
      const who = characterName(stateBefore, event.casterId);
      return `**${who}** opens a clairvoyant sensor (${event.mode}) over ${event.location}.`;
    }
    case 'RemoteSensorModeChanged': {
      return `Sensor switches to ${event.mode}.`;
    }
    case 'RemoteSensorRemoved': {
      return `Sensor closes (${event.reason}).`;
    }
    case 'RemoteSensorMoved': {
      return `Sensor moves from ${event.fromLocation} to ${event.toLocation}.`;
    }
    case 'IllusionCreated': {
      const who = characterName(stateBefore, event.casterId);
      return `**${who}** conjures ${event.label} (${event.kind} illusion) at ${event.location}.`;
    }
    case 'IllusionInvestigated': {
      const who = characterName(stateBefore, event.investigatorId);
      const outcome = event.success ? 'sees through' : 'is fooled by';
      return `**${who}** ${outcome} the illusion (Investigation ${event.total} vs DC ${event.dc}).`;
    }
    case 'IllusionDismissed': {
      return `Illusion fades (${event.reason}).`;
    }
    case 'BreathWeaponFired': {
      const who = characterName(stateBefore, event.monsterId);
      return `**${who}** unleashes ${event.breathWeaponId}.`;
    }
    case 'BreathWeaponRecharged': {
      const who = characterName(stateBefore, event.monsterId);
      return `**${who}**'s ${event.breathWeaponId} recharges (rolled ${event.roll}).`;
    }
  }
};

export const formatTranscript = (
  events: ReadonlyArray<Event>,
  content: ResolvedContent,
  options: { readonly title?: string } = {},
): string => {
  // Each event formatter emits one or more lines; we treat each non-empty
  // line as its own markdown paragraph. Markdown collapses single-newline-
  // separated lines into a single rendered paragraph, so the snapshot uses
  // blank lines between every action: the rendered preview then shows one
  // action per line as written, which is what a reviewer expects.
  const paragraphs: string[] = [];
  if (options.title !== undefined) {
    paragraphs.push(`# ${options.title}`);
  }
  let state = emptyCampaignState();
  for (const event of events) {
    const next = apply(state, event);
    const chunk = formatEvent(event, { stateBefore: state, stateAfter: next, content });
    for (const line of chunk.split('\n')) {
      if (line === '') continue;
      paragraphs.push(line);
    }
    state = next;
  }
  return paragraphs.join('\n\n') + '\n';
};

export const writeTranscript = formatTranscript;
