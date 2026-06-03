// Event Inspector mode.
//
// Right-hand panel showing the live event stream from the campaign.
// Each commit appends new rows below the previously-rendered ones (we
// only DOM-render the last `MAX_VISIBLE` events; older ones are
// represented by a single "+N earlier events" summary line at the top
// that fully replays only when the user clicks it). Color-coded by
// category. Click any row to expand the full JSON payload.

import { loadCampaign, replay, serializeCampaign, type Campaign, type Event } from 'dnd-srd-engine';
import type { EngineHost } from '../engine-host.js';
import { createEventRow } from '../ui/event-row.js';
import { firstDivergence } from '../ui/deep-equal.js';

export interface EventInspectorOptions {
  readonly host: EngineHost;
  readonly root: HTMLElement;
  readonly onStatus?: (text: string) => void;
}

export interface EventInspector {
  readonly unmount: () => void;
}

// Cap the number of DOM rows we keep around to avoid jank past a few
// hundred events. The plan calls for virtualization at ~200; we
// implement the simplest version: render the most recent N, leave
// older events behind a single "show earlier" affordance.
const MAX_VISIBLE = 200;

export const mountEventInspector = (opts: EventInspectorOptions): EventInspector => {
  const { host, root, onStatus } = opts;

  root.classList.add('event-inspector');
  // Slice 608: developer tools (Verify replay / Export / Import) moved
  // into a <details> block so they don't dominate the panel header for
  // observers who just want to read the event stream. Engine devs can
  // expand the block; observers ignore it.
  root.innerHTML = `
    <header class="inspector-header">
      <h2>Event Log</h2>
      <p class="inspector-meta"></p>
      <details class="inspector-devtools">
        <summary>Developer tools</summary>
        <div class="inspector-toolbar">
          <button type="button" class="btn-verify">Verify replay</button>
          <button type="button" class="btn-export">Export</button>
          <button type="button" class="btn-import">Import</button>
          <input type="file" class="file-import" accept="application/json,.json" hidden />
          <span class="verify-result"></span>
        </div>
      </details>
    </header>
    <div class="inspector-scroll">
      <button id="show-earlier" type="button" class="show-earlier" hidden>Show earlier events</button>
      <ol class="event-list" aria-label="Event log"></ol>
    </div>
  `;

  const meta = root.querySelector<HTMLParagraphElement>('.inspector-meta');
  const list = root.querySelector<HTMLOListElement>('.event-list');
  const scroller = root.querySelector<HTMLDivElement>('.inspector-scroll');
  const showEarlier = root.querySelector<HTMLButtonElement>('#show-earlier');
  const verifyBtn = root.querySelector<HTMLButtonElement>('.btn-verify');
  const exportBtn = root.querySelector<HTMLButtonElement>('.btn-export');
  const importBtn = root.querySelector<HTMLButtonElement>('.btn-import');
  const fileInput = root.querySelector<HTMLInputElement>('.file-import');
  const verifyResult = root.querySelector<HTMLSpanElement>('.verify-result');
  if (!meta || !list || !scroller || !showEarlier || !verifyBtn || !exportBtn || !importBtn || !fileInput || !verifyResult) {
    throw new Error('event-inspector: failed to mount root template');
  }

  const setVerifyResult = (state: 'ok' | 'fail' | 'idle', text: string): void => {
    verifyResult.className = `verify-result verify-${state}`;
    verifyResult.textContent = text;
  };

  // Headline correctness check: rebuild state from the event log via
  // `replay()` and compare against the live state. The plan/commit
  // split means RNG is baked into the events, so a successful replay
  // is the architectural invariant of the whole engine. Returns true
  // on match.
  const runVerify = (): boolean => {
    const campaign = host.getCampaign();
    const rebuilt = replay(campaign.events);
    const diff = firstDivergence(campaign.state, rebuilt);
    if (diff === undefined) {
      setVerifyResult('ok', `✓ replay matches (${campaign.events.length} events)`);
      return true;
    }
    setVerifyResult('fail', `✗ diverges at ${diff.path}`);
    console.warn('[demo] replay divergence', diff);
    return false;
  };

  verifyBtn.addEventListener('pointerdown', () => runVerify());

  exportBtn.addEventListener('pointerdown', () => {
    const ok = runVerify();
    if (!ok) {
      onStatus?.('Export aborted: replay verification failed (see console).');
      return;
    }
    const campaign = host.getCampaign();
    const json = serializeCampaign(campaign);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaign.name.replace(/\s+/g, '-')}-${campaign.events.length}events.json`;
    a.click();
    URL.revokeObjectURL(url);
    onStatus?.(`Exported ${campaign.events.length} events (${json.length} bytes).`);
  });

  importBtn.addEventListener('pointerdown', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const loaded = loadCampaign(text);
      host.replaceCampaign(loaded);
      // Run verify on the freshly loaded campaign — proves the
      // imported JSON is internally consistent. `loadCampaign`
      // already replays internally, so a divergence here would mean
      // the engine isn't deterministic — which would be a real bug.
      const ok = runVerify();
      onStatus?.(
        ok
          ? `Imported ${loaded.events.length} events. Replay verified.`
          : `Imported ${loaded.events.length} events. Replay diverged — check console.`,
      );
    } catch (err) {
      console.error('[demo] import failed', err);
      onStatus?.(`Import failed: ${(err as Error).message}`);
      setVerifyResult('fail', `✗ import: ${(err as Error).message}`);
    } finally {
      fileInput.value = '';
    }
  });

  // Track how many of the earliest events have been "expanded" by the
  // user. Default is 0 — only the last MAX_VISIBLE render. Click the
  // affordance to bump to Infinity (render all).
  let showAll = false;

  showEarlier.addEventListener('pointerdown', () => {
    showAll = true;
    render(host.getCampaign());
  });

  let lastRenderedFirstIndex = -1;
  let lastRenderedCount = 0;

  const renderFullRange = (events: ReadonlyArray<Event>, firstIndex: number): void => {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < events.length; i++) {
      frag.appendChild(createEventRow(events[i]!, firstIndex + i));
    }
    list.replaceChildren(frag);
    lastRenderedFirstIndex = firstIndex;
    lastRenderedCount = events.length;
  };

  // Track whether the user is "following the tail" — i.e. is currently
  // pinned within 64px of the bottom of the scroller. While following,
  // every commit snaps to the new bottom. When the user scrolls up out
  // of that band, following turns off and stays off until they scroll
  // back down. This avoids the buggy alternative of measuring atBottom
  // *after* appending new rows (which has just changed scrollHeight,
  // so the measurement is against the wrong window).
  let followTail = true;
  const FOLLOW_TAIL_TOLERANCE = 64;
  const refreshFollowState = (): void => {
    followTail =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < FOLLOW_TAIL_TOLERANCE;
  };
  scroller.addEventListener('scroll', refreshFollowState, { passive: true });

  const render = (campaign: Campaign): void => {
    const total = campaign.events.length;
    const firstIndex = showAll ? 0 : Math.max(0, total - MAX_VISIBLE);
    const hidden = firstIndex;

    showEarlier.hidden = hidden === 0;
    showEarlier.textContent = `Show ${hidden} earlier event${hidden === 1 ? '' : 's'}`;
    // Slice 608: speak the same vocabulary as the Random Battle panel —
    // "step N" everywhere; "event" only when counting the underlying
    // log entries (an event IS one step).
    meta.textContent =
      `step ${campaign.cursor} of ${total}  ·  ` +
      (hidden === 0 ? 'all events visible' : `${total - hidden} of ${total} rendered`);

    // Fast path: when we're appending new events to the same window we
    // last rendered, only build rows for the newcomers.
    const canAppend =
      lastRenderedFirstIndex === firstIndex &&
      total >= lastRenderedFirstIndex + lastRenderedCount;
    if (canAppend) {
      const appendStart = lastRenderedFirstIndex + lastRenderedCount;
      for (let i = appendStart; i < total; i++) {
        list.appendChild(createEventRow(campaign.events[i]!, i));
      }
      lastRenderedCount = total - lastRenderedFirstIndex;
    } else {
      renderFullRange(campaign.events.slice(firstIndex), firstIndex);
    }

    // Snap to the newest row whenever the user is following the tail.
    // The `followTail` flag is maintained by the scroll listener; here
    // we only need to honor it after the DOM has settled.
    if (followTail) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  };

  render(host.getCampaign());
  // Initial mount: snap to the bottom so the user sees the most recent
  // events without scrolling. `render` already does this, but the
  // scroll-listener-driven `followTail` defaults to true so this is a
  // no-op safety net for environments where the listener fires async.
  scroller.scrollTop = scroller.scrollHeight;
  const unsubscribe = host.subscribe(render);

  return {
    unmount: () => {
      unsubscribe();
      root.classList.remove('event-inspector');
      root.replaceChildren();
    },
  };
};
