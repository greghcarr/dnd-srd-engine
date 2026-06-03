import { createEngine, replay, applyAll, type Campaign, type ContentPack } from 'dnd-srd-engine';
import { createEngineHost, type EngineHost } from './engine-host.js';
import { mountFuzzReplay, type FuzzReplay } from './modes/fuzz-replay.js';
import { mountEventInspector, type EventInspector } from './modes/event-inspector.js';
import { mountPendingChoiceResolver, type PendingChoiceResolver } from './ui/pending-choice.js';
import { runBattle, type FuzzBattleResult, type FuzzRest, type FuzzVs } from '../scripts/combat-fuzz-core.js';

// Slice 600: the demo no longer dispatches user-chosen actions.
// Instead it runs the same randomized battle the combat-fuzz CLI
// produces, then lets the user scrub forward and back through the
// committed event log. Every panel — the fuzz-replay header, the map,
// the event inspector — re-renders against the slice of events
// `0..cursor` whenever the cursor moves.

const DEFAULT_SEED = 42;
const DEFAULT_LEVEL = 1;
const DEFAULT_MODE = '1v1';
const DEFAULT_VS: FuzzVs = 'pc';
const DEFAULT_REST: FuzzRest = 'none';

const status = document.getElementById('status');
const setStatus = (text: string): void => {
  if (status) status.textContent = text;
};

const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement | null;
const seedInput = document.getElementById('seed-input') as HTMLInputElement | null;
const modeSelect = document.getElementById('mode-select') as HTMLSelectElement | null;
const vsSelect = document.getElementById('vs-select') as HTMLSelectElement | null;
const levelInput = document.getElementById('level-input') as HTMLInputElement | null;
const restSelect = document.getElementById('rest-select') as HTMLSelectElement | null;
const fuzzRoot = document.getElementById('fuzz-replay-root');
const inspectorRoot = document.getElementById('event-inspector-root');
const choiceRoot = document.getElementById('pending-choice-root');

interface FuzzConfig {
  readonly seed: number;
  readonly mode: '1v1' | '2v2';
  readonly vs: FuzzVs;
  readonly level: number;
  readonly rest: FuzzRest;
}

const readHashParams = (): URLSearchParams => {
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  return new URLSearchParams(raw);
};

const parseIntOr = (raw: string | null, fallback: number, min?: number, max?: number): number => {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
};

const readConfigFromHash = (): FuzzConfig => {
  const p = readHashParams();
  const modeRaw = p.get('mode');
  const vsRaw = p.get('vs');
  const restRaw = p.get('rest');
  return {
    seed: parseIntOr(p.get('seed'), DEFAULT_SEED, 0),
    mode: modeRaw === '2v2' ? '2v2' : '1v1',
    vs: vsRaw === 'monster' ? 'monster' : 'pc',
    level: parseIntOr(p.get('level'), DEFAULT_LEVEL, 1, 5),
    rest: restRaw === 'short' || restRaw === 'long' ? restRaw : 'none',
  };
};

const readCursorFromHash = (totalEvents: number): number => {
  const raw = readHashParams().get('step');
  if (raw === null) return totalEvents;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return totalEvents;
  if (n < 0) return 0;
  if (n > totalEvents) return totalEvents;
  return n;
};

const writeHash = (cfg: FuzzConfig, cursor: number, totalEvents: number): void => {
  const params = new URLSearchParams();
  params.set('seed', String(cfg.seed));
  params.set('mode', cfg.mode);
  params.set('vs', cfg.vs);
  params.set('level', String(cfg.level));
  params.set('rest', cfg.rest);
  // Only emit `step` when the user has scrubbed off the end — keeps
  // the URL clean during normal viewing.
  if (cursor !== totalEvents) params.set('step', String(cursor));
  const next = `#${params.toString()}`;
  if (location.hash !== next) {
    history.replaceState(null, '', next);
  }
};

const findEncounterId = (campaign: Campaign): string => {
  const active = campaign.state.activeEncounterId;
  if (active) return active;
  // Pre-encounter slice (cursor=0). Pick the first encounter that
  // *will* be created — runBattle commits createEncounter ~early, but
  // the cursor may be earlier than that. Fall back to scanning the
  // full campaign's keys to find the eventual id.
  const keys = Object.keys(campaign.state.encounters);
  if (keys.length > 0) return keys[0]!;
  return '';
};

// Slice 610: per-session cache of `cursor → Campaign` so scrubbing
// doesn't re-replay-from-genesis every step. Forward steps reuse the
// prior cursor's state and apply just the new events; backward jumps
// reuse the nearest cached prefix ≤ target, only replaying the gap.
//
// Slice 616: LRU eviction. JS Map preserves insertion order, so
// "least recently used" = first non-pinned key in iteration order. On
// every cache hit we delete + re-insert to move the key to the most-
// recently-used end. The cursor=0 and cursor=totalEvents anchors are
// pinned (never evicted) so the from-genesis and from-end paths stay
// instant. Cap defaults to SCRUB_CACHE_MAX_SLOTS = 128 which bounds
// memory at ~1-2 MB for typical L1 battles even with exhaustive
// scrubbing; small battles never hit the cap.
const SCRUB_CACHE_MAX_SLOTS = 128;

interface ScrubCache {
  readonly entries: Map<number, Campaign>;
  readonly pinned: ReadonlySet<number>;
  readonly maxSlots: number;
}

const createScrubCache = (pinnedCursors: ReadonlyArray<number>, maxSlots = SCRUB_CACHE_MAX_SLOTS): ScrubCache => ({
  entries: new Map(),
  pinned: new Set(pinnedCursors),
  maxSlots,
});

const cacheSet = (cache: ScrubCache, cursor: number, campaign: Campaign): void => {
  cache.entries.set(cursor, campaign);
  // Evict LRU non-pinned keys until under the cap.
  while (cache.entries.size > cache.maxSlots) {
    let evicted = false;
    for (const key of cache.entries.keys()) {
      if (cache.pinned.has(key)) continue;
      cache.entries.delete(key);
      evicted = true;
      break;
    }
    // If every remaining entry is pinned, the cap is smaller than the
    // pin set — stop trying to evict (would loop forever).
    if (!evicted) break;
  }
};

const cacheGet = (cache: ScrubCache, cursor: number): Campaign | undefined => {
  const hit = cache.entries.get(cursor);
  if (hit === undefined) return undefined;
  // Touch: move to MRU end. Pinned entries don't need touching since
  // they never evict, but the move is harmless.
  cache.entries.delete(cursor);
  cache.entries.set(cursor, hit);
  return hit;
};

const buildScrubbed = (full: Campaign, cursor: number, cache: ScrubCache): Campaign => {
  const hit = cacheGet(cache, cursor);
  if (hit !== undefined) return hit;

  // Find the largest cached prefix ≤ cursor.
  let bestKey = -1;
  for (const key of cache.entries.keys()) {
    if (key <= cursor && key > bestKey) bestKey = key;
  }

  let state;
  if (bestKey >= 0) {
    const base = cache.entries.get(bestKey)!;
    // applyAll on the prior state + just the gap of new events. For a
    // single-step forward (bestKey = cursor - 1) this is one event.
    state = applyAll(base.state, full.events.slice(bestKey, cursor));
  } else {
    state = replay(full.events.slice(0, cursor));
  }

  const scrubbed: Campaign = {
    ...full,
    events: full.events.slice(0, cursor),
    state,
    cursor,
  };
  cacheSet(cache, cursor, scrubbed);
  return scrubbed;
};

interface DemoSession {
  readonly host: EngineHost;
  readonly fullCampaign: Campaign;
  readonly encounterId: string;
  readonly result: FuzzBattleResult;
  /** Slice 610: per-session scrub cache; reset on each session start. */
  readonly scrubCache: ScrubCache;
}

const startSession = (pack: ContentPack, cfg: FuzzConfig, cursor: number): DemoSession => {
  const result = runBattle({
    seed: cfg.seed,
    pack,
    level: cfg.level,
    rest: cfg.rest,
    teamSize: cfg.mode === '2v2' ? 2 : 1,
    vs: cfg.vs,
  });
  const fullCampaign = result.campaign;
  const encounterId = findEncounterId(fullCampaign);
  const engine = createEngine({ contentPacks: [pack] });
  // Slice 616: pin cursor=0 (genesis) and cursor=totalEvents (end). These
  // are the natural anchors for scrub navigation and stay free of LRU
  // eviction so the from-start and from-end paths never re-replay.
  const totalEvents = fullCampaign.events.length;
  const scrubCache = createScrubCache([0, totalEvents]);
  // Seed both pinned anchors so the pin promise actually holds (a pin
  // marks an entry as eviction-immune IF it's in the cache; it doesn't
  // auto-populate). Cursor 0 is the empty-state replay; cursor=total is
  // the full campaign.
  cacheSet(scrubCache, totalEvents, fullCampaign);
  // Compute + cache the genesis (cursor=0) entry. buildScrubbed sets
  // it internally on the miss path.
  buildScrubbed(fullCampaign, 0, scrubCache);
  const initialCampaign = cursor === fullCampaign.events.length
    ? fullCampaign
    : buildScrubbed(fullCampaign, cursor, scrubCache);
  const host = createEngineHost(engine, initialCampaign);
  return { host, fullCampaign, encounterId, result, scrubCache };
};

async function boot(): Promise<void> {
  setStatus('Loading starter pack...');
  const { loadStarterPack } = await import('dnd-srd-engine/starter-pack');
  const pack = loadStarterPack();

  let cfg = readConfigFromHash();

  setStatus(`Running fuzz battle seed=${cfg.seed}...`);
  let session = startSession(pack, cfg, Number.POSITIVE_INFINITY);
  let cursor = readCursorFromHash(session.fullCampaign.events.length);
  if (cursor !== session.fullCampaign.events.length) {
    session.host.replaceCampaign(buildScrubbed(session.fullCampaign, cursor, session.scrubCache));
  }

  // Reflect parsed config back into the toolbar inputs so the user
  // sees the resolved values, even when the URL was minimal.
  if (seedInput) seedInput.value = String(cfg.seed);
  if (modeSelect) modeSelect.value = cfg.mode;
  if (vsSelect) vsSelect.value = cfg.vs;
  if (levelInput) levelInput.value = String(cfg.level);
  if (restSelect) restSelect.value = cfg.rest;

  writeHash(cfg, cursor, session.fullCampaign.events.length);

  let fuzz: FuzzReplay | undefined;
  let inspector: EventInspector | undefined;
  let resolver: PendingChoiceResolver | undefined;

  const onSeek = (next: number): void => {
    cursor = next;
    // Sync the panel's internal cursor BEFORE notifying subscribers — its
    // render() reads cursor from its closure, so a stale value would make
    // the outcome banner flash the wrong state for one frame on hash-
    // driven seeks.
    fuzz?.setCursor(cursor);
    session.host.replaceCampaign(buildScrubbed(session.fullCampaign, cursor, session.scrubCache));
    writeHash(cfg, cursor, session.fullCampaign.events.length);
  };

  const renderReady = (): void => {
    const winnerName = session.result.winner !== null
      ? session.fullCampaign.state.characters[session.result.winner]?.name ?? '(unknown)'
      : '(no winner)';
    setStatus(
      `seed ${cfg.seed}  ·  ${cfg.mode}${cfg.vs === 'monster' ? ' vs monster' : ''}  ·  L${cfg.level}  ·  ` +
      `${session.fullCampaign.events.length} events  ·  ` +
      `${session.result.rounds} rounds  ·  winner: ${winnerName}`,
    );
  };

  const mountPanels = (): void => {
    if (fuzzRoot) {
      const resolvedWinnerName = session.result.winner !== null
        ? session.fullCampaign.state.characters[session.result.winner]?.name ?? null
        : null;
      fuzz = mountFuzzReplay({
        host: session.host,
        totalEvents: session.fullCampaign.events.length,
        initialCursor: cursor,
        encounterId: session.encounterId,
        seed: cfg.seed,
        winner: session.result.winner,
        winnerName: resolvedWinnerName,
        rounds: session.result.rounds,
        teamACharacterIds: session.result.teamACharacterIds,
        teamBCharacterIds: session.result.teamBCharacterIds,
        pack,
        root: fuzzRoot,
        onSeek,
        onStatus: setStatus,
      });
    }
    if (inspectorRoot) {
      inspector = mountEventInspector({ host: session.host, root: inspectorRoot, onStatus: setStatus });
    }
    if (choiceRoot) {
      resolver = mountPendingChoiceResolver({ host: session.host, root: choiceRoot, onStatus: setStatus });
    }
  };

  mountPanels();
  renderReady();

  const restart = (): void => {
    fuzz?.unmount();
    inspector?.unmount();
    resolver?.unmount();
    session = startSession(pack, cfg, Number.POSITIVE_INFINITY);
    cursor = session.fullCampaign.events.length;
    writeHash(cfg, cursor, session.fullCampaign.events.length);
    mountPanels();
    renderReady();
  };

  if (resetBtn) {
    resetBtn.disabled = false;
    resetBtn.addEventListener('pointerdown', () => {
      const nextSeed = seedInput
        ? parseIntOr(seedInput.value, cfg.seed, 0)
        : cfg.seed;
      const nextMode: '1v1' | '2v2' = modeSelect?.value === '2v2' ? '2v2' : '1v1';
      const nextVs: FuzzVs = vsSelect?.value === 'monster' ? 'monster' : 'pc';
      const nextLevel = levelInput
        ? parseIntOr(levelInput.value, cfg.level, 1, 5)
        : cfg.level;
      const restRaw = restSelect?.value;
      const nextRest: FuzzRest = restRaw === 'short' || restRaw === 'long' ? restRaw : 'none';
      cfg = { seed: nextSeed, mode: nextMode, vs: nextVs, level: nextLevel, rest: nextRest };
      if (seedInput) seedInput.value = String(cfg.seed);
      setStatus(`Running fuzz battle seed=${cfg.seed}...`);
      restart();
    });
  }

  // React to manual URL hash edits (back/forward, paste).
  window.addEventListener('hashchange', () => {
    const nextCfg = readConfigFromHash();
    const cfgChanged =
      nextCfg.seed !== cfg.seed ||
      nextCfg.mode !== cfg.mode ||
      nextCfg.vs !== cfg.vs ||
      nextCfg.level !== cfg.level ||
      nextCfg.rest !== cfg.rest;
    if (cfgChanged) {
      cfg = nextCfg;
      if (seedInput) seedInput.value = String(cfg.seed);
      if (modeSelect) modeSelect.value = cfg.mode;
      if (vsSelect) vsSelect.value = cfg.vs;
      if (levelInput) levelInput.value = String(cfg.level);
      if (restSelect) restSelect.value = cfg.rest;
      restart();
      return;
    }
    const nextCursor = readCursorFromHash(session.fullCampaign.events.length);
    if (nextCursor !== cursor) {
      onSeek(nextCursor);
    }
  });
}

boot().catch((err) => {
  console.error('[demo] boot failed', err);
  setStatus(`Boot failed: ${(err as Error).message}`);
});
