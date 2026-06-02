// Slice 587: transcripts for SaveRolled and AbilityCheckRolled now
// surface advantage/disadvantage the same way AttackRolled has since
// forever — both d20 rolls shown as `X/Y` and an `[advantage]` /
// `[disadvantage]` label after the roll name. Pre-slice the formatters
// dropped the second die and the `event.used` field entirely, which
// made an advantage save look like a math bug in fuzz transcripts
// ("d20(2) + 4 = 23" — the 19 was on the second die the formatter
// hid). Surfaced by the slice 585 combat-fuzz second run (seed 200
// Gnomish Cunning save vs Vicious Mockery).

import { describe, expect, it } from 'vitest';
import { formatTranscript } from '../transcript.js';
import { TEST_CONTENT, eventId, isoTimestamp } from '../fixtures/index.js';
import type { Event } from '../../src/schemas/events/index.js';
import type { SaveRolledEvent, AbilityCheckRolledEvent } from '../../src/schemas/events/checks.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import { CharacterSchema } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';

const buildAlyx = () =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alyx',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

describe('Transcript advantage display (slice 587)', () => {
  it('SaveRolled with advantage shows both d20 rolls and [advantage] label', () => {
    const alyx = buildAlyx();
    const created: CharacterCreatedEvent = {
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx,
    };
    const save: SaveRolledEvent = {
      id: eventId(), at: isoTimestamp(), type: 'SaveRolled',
      targetId: alyx.id, ability: 'WIS', dc: 12, d20: [2, 19], used: 'advantage',
      bonus: 4, total: 23, success: true,
      breakdown: [{ source: 'WIS-mod', value: 1 }, { source: 'proficiency', value: 2 }],
    };
    const transcript = formatTranscript([created, save] satisfies Event[], TEST_CONTENT);
    expect(transcript).toContain('d20(2/19)');
    expect(transcript).toContain('save [advantage]');
    expect(transcript).toContain('= 23');
  });

  it('SaveRolled with disadvantage shows both rolls and [disadvantage] label', () => {
    const alyx = buildAlyx();
    const created: CharacterCreatedEvent = {
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx,
    };
    const save: SaveRolledEvent = {
      id: eventId(), at: isoTimestamp(), type: 'SaveRolled',
      targetId: alyx.id, ability: 'DEX', dc: 15, d20: [18, 4], used: 'disadvantage',
      bonus: 2, total: 6, success: false,
    };
    const transcript = formatTranscript([created, save] satisfies Event[], TEST_CONTENT);
    expect(transcript).toContain('d20(18/4)');
    expect(transcript).toContain('save [disadvantage]');
    expect(transcript).toContain('failure');
  });

  it('SaveRolled without advantage stays single-die (unchanged)', () => {
    const alyx = buildAlyx();
    const created: CharacterCreatedEvent = {
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx,
    };
    const save: SaveRolledEvent = {
      id: eventId(), at: isoTimestamp(), type: 'SaveRolled',
      targetId: alyx.id, ability: 'STR', dc: 10, d20: [12], used: 'none',
      bonus: 2, total: 14, success: true,
    };
    const transcript = formatTranscript([created, save] satisfies Event[], TEST_CONTENT);
    expect(transcript).toContain('d20(12)');
    expect(transcript).not.toContain('[advantage]');
    expect(transcript).not.toContain('[disadvantage]');
    expect(transcript).not.toMatch(/d20\(\d+\/\d+\)/);
  });

  it('AbilityCheckRolled with advantage shows both rolls and [advantage] label', () => {
    const alyx = buildAlyx();
    const created: CharacterCreatedEvent = {
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx,
    };
    const check: AbilityCheckRolledEvent = {
      id: eventId(), at: isoTimestamp(), type: 'AbilityCheckRolled',
      characterId: alyx.id, ability: 'STR', skill: 'athletics', dc: 15,
      d20: [3, 17], used: 'advantage', bonus: 4, total: 21, success: true,
    };
    const transcript = formatTranscript([created, check] satisfies Event[], TEST_CONTENT);
    expect(transcript).toContain('d20(3/17)');
    expect(transcript).toContain('athletics [advantage]');
    expect(transcript).toContain('= 21');
  });

  it('AbilityCheckRolled without skill uses "ABILITY check" label before [advantage]', () => {
    const alyx = buildAlyx();
    const created: CharacterCreatedEvent = {
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx,
    };
    const check: AbilityCheckRolledEvent = {
      id: eventId(), at: isoTimestamp(), type: 'AbilityCheckRolled',
      characterId: alyx.id, ability: 'INT',
      d20: [8, 14], used: 'advantage', bonus: 0, total: 14,
    };
    const transcript = formatTranscript([created, check] satisfies Event[], TEST_CONTENT);
    expect(transcript).toContain('d20(8/14)');
    expect(transcript).toContain('INT check [advantage]');
  });
});
