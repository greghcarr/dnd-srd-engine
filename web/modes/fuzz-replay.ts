// Fuzz Replay mode (slice 600).
//
// Replaces the prior user-controlled Combat Sandbox. The demo now runs
// a randomized battle from a chosen seed (via the same engine the
// scripts/combat-fuzz CLI uses) and lets the user scrub forward and
// backward through the committed event stream — the map and the event
// inspector follow the cursor.
//
// This panel renders:
//   - per-round / per-step header
//   - transport controls (jump to start, step back, step forward,
//     jump to end, play/pause auto-advance)
//   - the initiative-ordered combatant list with HP, conditions,
//     position, and an "active" marker
//
// All three demo panels share an EngineHost; this panel mutates the
// cursor by calling onSeek(step), which replays the events 0..step and
// calls host.replaceCampaign(). The map + inspector then re-render via
// their existing subscribers.
//
// No engine.plan / commit / dispatch happens here — the events were
// already produced by runBattle(). Scrubbing is pure replay.

import type { Campaign, ContentPack } from 'dnd-srd-engine';
import { resolveContent, type ResolvedContent } from 'dnd-srd-engine';
import type { EngineHost } from '../engine-host.js';

export interface FuzzReplayOptions {
  readonly host: EngineHost;
  /** Total number of events in the underlying battle. Defines the cursor range [0..total]. */
  readonly totalEvents: number;
  /** Current cursor (0..totalEvents). Initial value; main.ts owns the cursor and pushes updates via setCursor(). */
  readonly initialCursor: number;
  readonly encounterId: string;
  readonly seed: number;
  readonly winner: string | null;
  /** Display name for the winner, resolved against the full campaign once at session start. Lets the panel show the actual name even at a cursor where the character snapshot hasn't been committed yet. */
  readonly winnerName: string | null;
  readonly rounds: number;
  /** Slice 607: character ids on each team. Used for the left-border team-color so observers can tell A from B at a glance. */
  readonly teamACharacterIds: ReadonlyArray<string>;
  readonly teamBCharacterIds: ReadonlyArray<string>;
  /** Slice 607: content pack supplies condition display names (so the row reads "Viciously Mocked", not "viciously-mocked"). */
  readonly pack: ContentPack;
  readonly root: HTMLElement;
  readonly onSeek: (nextCursor: number) => void;
  readonly onStatus?: (text: string) => void;
}

export interface FuzzReplay {
  /** main.ts calls this when the cursor changes from outside (URL hash, keyboard shortcuts). */
  readonly setCursor: (cursor: number) => void;
  readonly unmount: () => void;
}

const STEP_DELAY_MS = 350;

interface OrderedCombatant {
  readonly combatantId: string;
  readonly initiative: number;
  readonly initiativeOrder: number;
  readonly position?: { x: number; y: number };
}

const orderedCombatants = (campaign: Campaign, encounterId: string): ReadonlyArray<OrderedCombatant> => {
  const enc = campaign.state.encounters[encounterId];
  if (!enc) return [];
  return enc.combatants
    .map((c) => ({
      combatantId: c.combatantId,
      initiative: c.initiative,
      initiativeOrder: c.initiativeOrder,
      position: c.position,
    }))
    .sort((a, b) => a.initiativeOrder - b.initiativeOrder);
};

const activeCombatantId = (campaign: Campaign, encounterId: string): string | undefined => {
  const enc = campaign.state.encounters[encounterId];
  if (!enc) return undefined;
  return enc.combatants[enc.activeIndex]?.combatantId;
};

export const mountFuzzReplay = (opts: FuzzReplayOptions): FuzzReplay => {
  const {
    host,
    totalEvents,
    initialCursor,
    encounterId,
    seed,
    winner,
    winnerName,
    rounds,
    teamACharacterIds,
    teamBCharacterIds,
    pack,
    root,
    onSeek,
    onStatus,
  } = opts;

  let cursor = initialCursor;
  let playTimer: ReturnType<typeof setInterval> | undefined;

  // Slice 607: resolve content once so condition-id → "display name"
  // lookups don't re-resolve on every render.
  const content: ResolvedContent = resolveContent([pack]);
  const conditionName = (id: string): string => content.conditions.get(id)?.name ?? id;
  const teamAIds = new Set(teamACharacterIds);
  const teamBIds = new Set(teamBCharacterIds);
  const teamLabel = (combatantId: string): 'team-a' | 'team-b' | '' => {
    if (teamAIds.has(combatantId)) return 'team-a';
    if (teamBIds.has(combatantId)) return 'team-b';
    return '';
  };

  root.classList.add('fuzz-replay');
  root.innerHTML = `
    <header class="fuzz-header">
      <h2>Random Battle</h2>
      <p class="fuzz-meta"></p>
    </header>
    <div class="fuzz-transport">
      <button type="button" class="t-first" title="Jump to start">⏮</button>
      <button type="button" class="t-prev"  title="Step back">⏪</button>
      <button type="button" class="t-play"  title="Play / Pause">▶</button>
      <button type="button" class="t-next"  title="Step forward">⏩</button>
      <button type="button" class="t-last"  title="Jump to end">⏭</button>
      <span class="fuzz-cursor"></span>
    </div>
    <p class="fuzz-outcome"></p>
    <ol class="combatant-list" aria-label="Initiative order"></ol>
  `;

  const meta = root.querySelector<HTMLParagraphElement>('.fuzz-meta');
  const cursorEl = root.querySelector<HTMLSpanElement>('.fuzz-cursor');
  const outcomeEl = root.querySelector<HTMLParagraphElement>('.fuzz-outcome');
  const list = root.querySelector<HTMLOListElement>('.combatant-list');
  const btnFirst = root.querySelector<HTMLButtonElement>('.t-first');
  const btnPrev = root.querySelector<HTMLButtonElement>('.t-prev');
  const btnPlay = root.querySelector<HTMLButtonElement>('.t-play');
  const btnNext = root.querySelector<HTMLButtonElement>('.t-next');
  const btnLast = root.querySelector<HTMLButtonElement>('.t-last');
  if (!meta || !cursorEl || !outcomeEl || !list || !btnFirst || !btnPrev || !btnPlay || !btnNext || !btnLast) {
    throw new Error('fuzz-replay: failed to mount root template');
  }

  const renderOutcome = (_campaign: Campaign): void => {
    // The outcome banner describes the END of the battle. Hide it while
    // the user is scrubbing through the middle — surfacing the winner
    // mid-stream spoils the playback. The transport's "step N / total"
    // already conveys "how far in are we".
    if (cursor < totalEvents) {
      outcomeEl.textContent = '';
      outcomeEl.className = 'fuzz-outcome fuzz-outcome-inprogress';
      outcomeEl.hidden = true;
      return;
    }
    outcomeEl.hidden = false;
    if (winner === null) {
      outcomeEl.textContent = `No winner after ${rounds} rounds — drag the cursor to inspect any moment.`;
      outcomeEl.className = 'fuzz-outcome fuzz-outcome-draw';
      return;
    }
    // Use the name we resolved against the full campaign at session
    // start, NOT the scrubbed campaign — at early cursors the winner's
    // CharacterCreated event hasn't been committed yet, so a lookup
    // against state.characters would dead-end at the raw character ULID.
    outcomeEl.textContent = `Winner: ${winnerName ?? winner} in ${rounds} rounds.`;
    outcomeEl.className = 'fuzz-outcome fuzz-outcome-win';
  };

  const renderTransport = (): void => {
    btnFirst.disabled = cursor === 0;
    btnPrev.disabled = cursor === 0;
    btnNext.disabled = cursor >= totalEvents;
    btnLast.disabled = cursor >= totalEvents;
    cursorEl.textContent = `step ${cursor} / ${totalEvents}`;
    btnPlay.textContent = playTimer !== undefined ? '⏸' : '▶';
    btnPlay.title = playTimer !== undefined ? 'Pause' : 'Play';
  };

  const renderCombatants = (campaign: Campaign): void => {
    const enc = campaign.state.encounters[encounterId];
    if (!enc) {
      list.replaceChildren();
      return;
    }
    const active = activeCombatantId(campaign, encounterId);
    const order = orderedCombatants(campaign, encounterId);
    const items = order.map((entry) => {
      const ch = campaign.state.characters[entry.combatantId];
      const li = document.createElement('li');
      const teamClass = teamLabel(entry.combatantId);
      li.className = `combatant${teamClass ? ` ${teamClass}` : ''}`;
      if (entry.combatantId === active) li.classList.add('active');
      if (ch && ch.hp.current <= 0) li.classList.add('downed');

      // Slice 607: condition display names via content lookup; raw ids
      // (`viciously-mocked`) read like internal slugs.
      const conds = ch ? ch.appliedConditions.map((a) => conditionName(a.conditionId)) : [];
      // Slice 607: brief class/species blurb beside the name so a
      // reader scanning the initiative list can tell "Aria (bard elf)"
      // from "Aria (rogue tiefling)" at a glance.
      const classBits: string[] = [];
      if (ch) {
        const primaryClass = ch.classes[0]?.classId;
        if (primaryClass && primaryClass !== 'companion') classBits.push(primaryClass);
        if (ch.speciesId && ch.speciesId !== 'companion') classBits.push(ch.speciesId);
      }
      const subtitle = classBits.length > 0 ? ` (${classBits.join(' ')})` : '';

      li.innerHTML = `
        <div class="combatant-line">
          <span class="combatant-name"></span>
          <span class="combatant-hp"></span>
          <span class="combatant-initiative"></span>
        </div>
        <div class="combatant-conditions"></div>
      `;
      li.querySelector('.combatant-name')!.textContent = `${ch?.name ?? entry.combatantId}${subtitle}`;
      li.querySelector('.combatant-hp')!.textContent = ch
        ? `${Math.max(0, ch.hp.current)}/${ch.hp.max}${ch.hp.temp > 0 ? ` (+${ch.hp.temp})` : ''} HP`
        : '? HP';
      li.querySelector('.combatant-initiative')!.textContent = `init ${entry.initiative}`;
      li.querySelector('.combatant-conditions')!.textContent =
        conds.length === 0 ? '' : conds.join(', ');
      return li;
    });
    list.replaceChildren(...items);
  };

  const render = (campaign: Campaign): void => {
    const enc = campaign.state.encounters[encounterId];
    const round = enc?.round ?? '?';
    const statusLabel = enc?.status ?? 'pre-encounter';
    meta.textContent =
      `Round ${round}  ·  seed ${seed}  ·  ` +
      `${campaign.events.length} events shown  ·  ` +
      `status: ${statusLabel}`;
    renderOutcome(campaign);
    renderTransport();
    renderCombatants(campaign);
  };

  const stopPlay = (): void => {
    if (playTimer !== undefined) {
      clearInterval(playTimer);
      playTimer = undefined;
    }
  };

  const seek = (next: number): void => {
    const clamped = Math.max(0, Math.min(totalEvents, next));
    if (clamped === cursor) return;
    cursor = clamped;
    onSeek(cursor);
  };

  btnFirst.addEventListener('pointerdown', () => {
    stopPlay();
    seek(0);
  });
  btnPrev.addEventListener('pointerdown', () => {
    stopPlay();
    seek(cursor - 1);
  });
  btnNext.addEventListener('pointerdown', () => {
    stopPlay();
    seek(cursor + 1);
  });
  btnLast.addEventListener('pointerdown', () => {
    stopPlay();
    seek(totalEvents);
  });
  btnPlay.addEventListener('pointerdown', () => {
    if (playTimer !== undefined) {
      stopPlay();
      renderTransport();
      return;
    }
    if (cursor >= totalEvents) {
      onStatus?.('At end — nothing to play.');
      return;
    }
    playTimer = setInterval(() => {
      if (cursor >= totalEvents) {
        stopPlay();
        renderTransport();
        return;
      }
      seek(cursor + 1);
    }, STEP_DELAY_MS);
    renderTransport();
  });

  render(host.getCampaign());
  const unsubscribe = host.subscribe(render);

  return {
    setCursor: (next: number) => {
      const clamped = Math.max(0, Math.min(totalEvents, next));
      cursor = clamped;
      renderTransport();
    },
    unmount: () => {
      stopPlay();
      unsubscribe();
      root.classList.remove('fuzz-replay');
      root.replaceChildren();
    },
  };
};
