import { describe, it, expect } from 'vitest';
import { formatNZDateTime, parseNZDateTime } from './datetime';

describe('parseNZDateTime / formatNZDateTime', () => {
  it('round-trips a dd/mm/yyyy hh:mm string regardless of timezone', () => {
    const iso = parseNZDateTime('13/11/2016 11:02');
    expect(iso).not.toBeNull();
    expect(formatNZDateTime(iso!)).toBe('13/11/2016 11:02');
  });

  it('accepts single-digit day/month and pads on format', () => {
    const iso = parseNZDateTime('5/3/2024 9:07');
    expect(iso).not.toBeNull();
    expect(formatNZDateTime(iso!)).toBe('05/03/2024 09:07');
  });

  it('rejects month-first (American) input where the month is impossible', () => {
    // "11/13/2016" read as day=11 month=13 -> invalid
    expect(parseNZDateTime('11/13/2016 11:02')).toBeNull();
  });

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseNZDateTime('31/02/2020 10:00')).toBeNull();
    expect(parseNZDateTime('29/02/2023 10:00')).toBeNull(); // not a leap year
    expect(parseNZDateTime('29/02/2024 10:00')).not.toBeNull(); // leap year
  });

  it('rejects other formats and out-of-range times', () => {
    expect(parseNZDateTime('2016-11-13 11:02')).toBeNull();
    expect(parseNZDateTime('13/11/2016')).toBeNull();
    expect(parseNZDateTime('13/11/2016 24:00')).toBeNull();
    expect(parseNZDateTime('13/11/2016 10:60')).toBeNull();
    expect(parseNZDateTime('')).toBeNull();
  });

  it('formats invalid or empty ISO input as an empty string', () => {
    expect(formatNZDateTime('')).toBe('');
    expect(formatNZDateTime('not-a-date')).toBe('');
  });
});
