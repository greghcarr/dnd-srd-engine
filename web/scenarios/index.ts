// Scenario registry.
//
// Each entry: { id, title, description, hint, build(opts?) → DemoSession }.
// The CI replay test (tests/integration/web-scenarios.test.ts) loops
// over this list. Slice 600 retired the demo's scenario-picker (the
// demo now shows fuzz-generated battles instead), so these scenarios
// are now test fixtures only — kept here so the integration test still
// exercises the hand-authored regression cases (Frightened source
// tracking, Misty Step destination occupancy, concentration auto-clear
// on 0 HP).

import type { Campaign, ContentPack, Engine } from 'dnd-srd-engine';
import { loadStarterPack } from 'dnd-srd-engine/starter-pack';
import { buildGoblinSkirmish } from './goblin-skirmish.js';
import { buildFrightenedHalfling } from './frightened-halfling.js';
import { buildMistyStepOccupied } from './misty-step-occupied.js';
import { buildDownedWizard } from './downed-wizard.js';

export interface DemoSession {
  readonly engine: Engine;
  readonly campaign: Campaign;
  readonly encounterId: string;
  /** logical-name → character-id, used by tests to look up combatants by role. */
  readonly combatants: Readonly<Record<string, string>>;
  readonly seed: number;
}

export interface DemoScenario {
  readonly id: string;
  readonly title: string;
  /** One-line summary, shown in the picker. */
  readonly description: string;
  /** Optional "what to try" text shown in the demo when this scenario is active. */
  readonly hint?: string;
  readonly build: (opts?: { seed?: number }) => DemoSession;
}

export const SCENARIOS: ReadonlyArray<DemoScenario> = [
  {
    id: 'goblin-skirmish',
    title: 'Goblin Skirmish',
    description: 'A 2-vs-2 starter fight: Alyx (Fighter) + Brindle (Wizard) vs two goblins.',
    hint: 'Try the full Combat Sandbox toolbar — Attack, Move, Dash, Dodge, End Turn.',
    build: (opts) => buildGoblinSkirmish(loadStarter(), opts),
  },
  {
    id: 'frightened-halfling',
    title: 'Frightened Halfling',
    description: 'A Small halfling fighter, Frightened by a goblin. Tests source-tracking and move restriction.',
    hint: 'On the halfling\'s turn, click → (move east, toward the goblin). The engine rejects: "Frightened by Goblin and cannot move closer." Try ← instead — moving away is allowed.',
    build: (opts) => buildFrightenedHalfling(loadStarter(), opts),
  },
  {
    id: 'misty-step-occupied',
    title: 'Misty Step into Occupied Space',
    description: 'A wizard who knows Misty Step, flanked by two goblins. Tests spell-level destination occupancy.',
    hint: 'On the wizard\'s turn, the action toolbar has `Misty Step → Goblin Left` and `Misty Step → Goblin Right` buttons. Each one tries to teleport into that goblin\'s square. The engine rejects: "Misty Step destination is occupied by Goblin Left." Watch the status line.',
    build: (opts) => buildMistyStepOccupied(loadStarter(), opts),
  },
  {
    id: 'downed-wizard',
    title: 'Concentrating Wizard at 1 HP',
    description: 'A wizard concentrating on Bless is at 1 HP and Prone (the goblin staggered her on a previous swing). The goblin attacks with advantage from prone-within-5-ft, so the first hit reliably lands across seeds. Tests concentration auto-clear, action-block on 0 HP, and death-save rotation — all in real time after the first attack lands.',
    hint: 'The goblin goes first. Click "Attack Brindle" — Prone gives the goblin Advantage, so the dagger reliably hits and drops her to 0. Watch the Event Inspector: the same commit clears her concentration. When her turn comes up, only End Turn is available (sandbox detects HP=0), and a DeathSaveRolled fires at turn start.',
    build: (opts) => buildDownedWizard(loadStarter(), opts),
  },
];

let cachedStarter: ContentPack | undefined;
const loadStarter = (): ContentPack => {
  if (cachedStarter === undefined) cachedStarter = loadStarterPack();
  return cachedStarter;
};
