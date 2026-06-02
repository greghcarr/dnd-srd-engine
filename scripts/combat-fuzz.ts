// Combat fuzz simulator (slice 585) — drives random L1 battles to
// completion and writes markdown transcripts to disk for human review.
// Surfaces emergent-interaction bugs the unit + golden tests don't
// cover (condition interactions mid-cast, reaction windows in the wrong
// slot, action-economy edge cases, etc.).
//
// Run: npx tsx scripts/combat-fuzz.ts [--count N] [--seed S] [--out DIR]
//                                     [--level 1..5] [--mode 1v1|2v2]
//                                     [--vs pc|monster]
//                                     [--rest none|short|long]
//
// Slice 600: the simulation core lives in combat-fuzz-core.ts so the
// web demo can re-run any seed in the browser for step-through replay.
// This file is now the CLI front-door: arg parsing, fs writes, and
// markdown summary generation.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadStarterPack, type ContentPack } from '../src/index.js';
import { resolveContent } from '../src/content/pack.js';
import { formatTranscript } from '../tests/transcript.js';
import {
  runBattle,
  FUZZ_MAX_LEVEL,
  MAX_ROUNDS,
  type FuzzBattleResult,
  type FuzzRest,
  type FuzzVs,
} from './combat-fuzz-core.js';

const summarize = (
  pack: ContentPack,
  seed: number,
  result: FuzzBattleResult,
): string => {
  const lines: string[] = [];
  lines.push(`# Combat fuzz seed=${seed}`);
  lines.push('');
  const pcs = Object.values(result.campaign.state.characters);
  for (const pc of pcs) {
    const cls = pc.classes[0]?.classId ?? 'unknown';
    // Slice 604: clamp displayed HP at 0 — RAW minimum is 0, the engine
    // tracks signed values only for the instant-death threshold calc.
    lines.push(`- **${pc.name}** — ${cls} ${pc.speciesId} (${pc.backgroundId}). Final HP: ${Math.max(0, pc.hp.current)}/${pc.hp.max}.`);
  }
  lines.push('');
  if (result.winner !== null) {
    const w = result.campaign.state.characters[result.winner]!;
    lines.push(`**Winner**: ${w.name} (in ${result.rounds} rounds).`);
  } else {
    lines.push(`**No winner** after ${MAX_ROUNDS} rounds.`);
  }
  lines.push('');
  lines.push('## Transcript');
  lines.push('');
  lines.push(formatTranscript(result.campaign.events, resolveContent([pack])));
  return lines.join('\n');
};

const parseArgs = (argv: ReadonlyArray<string>): { count: number; seed: number; out: string; level: number; rest: FuzzRest; teamSize: number; vs: FuzzVs } => {
  let count = 5;
  let seed = 1;
  let out = '/tmp/combat-fuzz';
  let level = 1;
  let rest: FuzzRest = 'none';
  let teamSize = 1;
  let vs: FuzzVs = 'pc';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') count = Number(argv[++i] ?? count);
    else if (a === '--seed') seed = Number(argv[++i] ?? seed);
    else if (a === '--out') out = argv[++i] ?? out;
    else if (a === '--level') level = Math.max(1, Math.min(FUZZ_MAX_LEVEL, Number(argv[++i] ?? level)));
    else if (a === '--rest') {
      const v = (argv[++i] ?? 'none') as FuzzRest;
      rest = v === 'short' || v === 'long' ? v : 'none';
    } else if (a === '--mode') {
      const m = argv[++i] ?? '1v1';
      teamSize = m === '2v2' ? 2 : 1;
    } else if (a === '--vs') {
      const v = argv[++i] ?? 'pc';
      vs = v === 'monster' ? 'monster' : 'pc';
    }
  }
  return { count, seed, out, level, rest, teamSize, vs };
};

const main = (): void => {
  const { count, seed, out, level, rest, teamSize, vs } = parseArgs(process.argv.slice(2));
  mkdirSync(out, { recursive: true });
  const pack = loadStarterPack();
  const indexLines: string[] = [
    `# Combat fuzz run — ${count} battles, seeds ${seed}..${seed + count - 1} (level ${level}${teamSize > 1 ? `, ${teamSize}v${teamSize}` : ''}${vs === 'monster' ? ', vs monster' : ''}${rest !== 'none' ? `, post-battle ${rest} rest` : ''})`,
    '',
  ];
  for (let i = 0; i < count; i++) {
    const s = seed + i;
    try {
      const result = runBattle({ seed: s, pack, level, rest, teamSize, vs });
      const fileName = `seed-${String(s).padStart(4, '0')}.md`;
      const filePath = resolve(out, fileName);
      const summary = summarize(pack, s, result);
      writeFileSync(filePath, summary, 'utf8');
      const winnerName = result.winner !== null
        ? result.campaign.state.characters[result.winner]!.name
        : '(no winner)';
      indexLines.push(`- [${fileName}](./${fileName}) — winner: ${winnerName}, ${result.rounds} rounds`);
      process.stdout.write(`seed=${s} → ${fileName} (winner: ${winnerName}, ${result.rounds} rounds)\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const fileName = `seed-${String(s).padStart(4, '0')}.error.txt`;
      writeFileSync(resolve(out, fileName), `error during battle:\n${msg}\n`, 'utf8');
      indexLines.push(`- [${fileName}](./${fileName}) — **error**: ${msg}`);
      process.stdout.write(`seed=${s} → ERROR: ${msg}\n`);
    }
  }
  writeFileSync(resolve(out, 'index.md'), indexLines.join('\n'), 'utf8');
  process.stdout.write(`\nWrote ${count} transcripts + index.md to ${out}\n`);
};

main();
