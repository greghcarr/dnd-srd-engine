// Slice 553: missing focus variants per SRD 5.2.1 — Arcane Focus
// (Staff + Wand) and Druidic Focus (Wooden Staff).
//
// RAW (SRD 5.2.1 Equipment):
// - Arcane Focuses: Crystal (10 GP, 1 lb), Orb (20 GP, 3 lb), Rod
//   (10 GP, 2 lb), Staff (5 GP, 4 lb — also a Quarterstaff), Wand
//   (10 GP, 1 lb).
// - Druidic Focuses: Sprig of mistletoe (1 GP), Wooden staff (5 GP,
//   4 lb — also a Quarterstaff), Yew wand (10 GP, 1 lb).
//
// Pre-slice the pack shipped 3 of 5 Arcane variants (Crystal/Orb/Rod)
// and 2 of 3 Druidic variants (Sprig + Yew Wand). This slice closes
// the gap by adding the remaining 3 entries with correct cost+weight,
// plus backfilling cost+weight metadata on the existing 5 entries
// (which previously had only id + name).
//
// RAW deviation (documented): the "Staff (also a Quarterstaff)" /
// "Wooden Staff (also a Quarterstaff)" dual-role is intentional
// narrative-only — the engine doesn't model gear-that-is-also-a-weapon
// directly. To wield as a Quarterstaff, the consumer creates a sibling
// quarterstaff instance.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

const find = (id: string) => PACK.items?.find((i) => i.id === id);

describe('Missing focus variants (slice 553)', () => {
  describe('Arcane Focus (5 RAW variants)', () => {
    it('Crystal: present at 10 GP / 1 lb', () => {
      const item = find('arcane-focus-crystal');
      expect(item).toBeDefined();
      expect(item?.weight).toBe(1);
      expect((item as { cost?: { amount: number } }).cost?.amount).toBe(10);
    });
    it('Orb: present at 20 GP / 3 lb', () => {
      const item = find('arcane-focus-orb');
      expect(item).toBeDefined();
      expect(item?.weight).toBe(3);
      expect((item as { cost?: { amount: number } }).cost?.amount).toBe(20);
    });
    it('Rod: present at 10 GP / 2 lb', () => {
      const item = find('arcane-focus-rod');
      expect(item).toBeDefined();
      expect(item?.weight).toBe(2);
      expect((item as { cost?: { amount: number } }).cost?.amount).toBe(10);
    });
    it('Staff: present at 5 GP / 4 lb (NEW)', () => {
      const item = find('arcane-focus-staff');
      expect(item).toBeDefined();
      expect(item?.weight).toBe(4);
      expect((item as { cost?: { amount: number } }).cost?.amount).toBe(5);
    });
    it('Wand: present at 10 GP / 1 lb (NEW)', () => {
      const item = find('arcane-focus-wand');
      expect(item).toBeDefined();
      expect(item?.weight).toBe(1);
      expect((item as { cost?: { amount: number } }).cost?.amount).toBe(10);
    });
  });

  describe('Druidic Focus (3 RAW variants)', () => {
    it('Sprig of Mistletoe: present at 1 GP', () => {
      const item = find('druidic-focus-sprig-of-mistletoe');
      expect(item).toBeDefined();
      expect((item as { cost?: { amount: number } }).cost?.amount).toBe(1);
    });
    it('Wooden Staff: present at 5 GP / 4 lb (NEW)', () => {
      const item = find('druidic-focus-wooden-staff');
      expect(item).toBeDefined();
      expect(item?.weight).toBe(4);
      expect((item as { cost?: { amount: number } }).cost?.amount).toBe(5);
    });
    it('Yew Wand: present at 10 GP / 1 lb', () => {
      const item = find('druidic-focus-yew-wand');
      expect(item).toBeDefined();
      expect(item?.weight).toBe(1);
      expect((item as { cost?: { amount: number } }).cost?.amount).toBe(10);
    });
  });

  it('all 8 focus variants ship as gear (not weapon/magic/consumable)', () => {
    const ids = [
      'arcane-focus-crystal', 'arcane-focus-orb', 'arcane-focus-rod',
      'arcane-focus-staff', 'arcane-focus-wand',
      'druidic-focus-sprig-of-mistletoe', 'druidic-focus-wooden-staff', 'druidic-focus-yew-wand',
    ];
    for (const id of ids) {
      const item = find(id);
      expect(item, `${id} present`).toBeDefined();
      expect(item?.itemKind, `${id} itemKind`).toBe('gear');
    }
  });
});
