import { describe, it, expect } from 'vitest';
import { validateQuakeId, calculateInitialMagnitudeRanges } from './api';

describe('validateQuakeId', () => {
  it('accepts typical GeoNet IDs', () => {
    expect(validateQuakeId('2022p138188')).toBe(true);
    expect(validateQuakeId('2016p858000')).toBe(true);
    expect(validateQuakeId('ABC123')).toBe(true);
  });

  it('accepts IDs with surrounding whitespace', () => {
    expect(validateQuakeId('  2022p138188  ')).toBe(true);
  });

  it('rejects empty, short, long, or non-alphanumeric input', () => {
    expect(validateQuakeId('')).toBe(false);
    expect(validateQuakeId('abc')).toBe(false);
    expect(validateQuakeId('a'.repeat(21))).toBe(false);
    expect(validateQuakeId('2022p 138188')).toBe(false);
    expect(validateQuakeId('2022p-138188')).toBe(false);
    expect(validateQuakeId('../etc/passwd')).toBe(false);
  });
});

describe('calculateInitialMagnitudeRanges', () => {
  it('rounds down from the mainshock magnitude', () => {
    expect(calculateInitialMagnitudeRanges(7.8)).toEqual({ m1: 7, m2: 6, m3: 5 });
    expect(calculateInitialMagnitudeRanges(5.5)).toEqual({ m1: 5, m2: 4, m3: 3 });
  });

  it('clamps at the bottom for small magnitudes', () => {
    expect(calculateInitialMagnitudeRanges(1.2)).toEqual({ m1: 1, m2: 1, m3: 1 });
  });

  it('clamps M1 at 9 for extreme magnitudes', () => {
    expect(calculateInitialMagnitudeRanges(9.9)).toEqual({ m1: 9, m2: 8, m3: 7 });
  });
});
