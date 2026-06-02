# dnd-srd-engine examples

Small runnable examples showing how to consume the engine. Each example is a single TypeScript file you can run with `tsx`:

```sh
npx tsx examples/00-quickstart/index.ts
npx tsx examples/01-character-sheet/index.ts
npx tsx examples/02-combat-encounter/index.ts
npx tsx examples/03-save-and-load/index.ts
```

The examples import from `../../src/index.js` because they live inside this repo. In a downstream consumer you would import from `'dnd-srd-engine'` instead; everything else is identical.

## Index

- **[00-quickstart](00-quickstart/)**: the README "Quick start" snippet, verbatim. Smallest possible "engine works" demo: load the starter pack, build a Fighter via `createPC()`, derive their sheet.
- **[01-character-sheet](01-character-sheet/)**: load the starter pack, instantiate a Fighter manually, print their derived sheet (AC, attack bonus, saving throws, spell slots).
- **[02-combat-encounter](02-combat-encounter/)**: build a two-versus-one encounter, roll initiative, take a turn, apply damage, end the encounter, and replay the event log to prove byte-equivalent state.
- **[03-save-and-load](03-save-and-load/)**: serialize a campaign to JSON, reconstitute it, and verify the rebuilt state replays equivalently.
