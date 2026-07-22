import { describe, it, expect } from 'vitest';
import {
  qpois,
  formatValue,
  formatPercentage,
  calculateOmoriIntegral,
  calculateExpectedAftershocks,
  calculateDurationForecast,
  validateModelParameters,
} from './calculations';
import { MODEL_PRESETS } from '@/types';

describe('qpois', () => {
  it('returns 0 for non-positive lambda or probability', () => {
    expect(qpois(0.5, 0)).toBe(0);
    expect(qpois(0.5, -1)).toBe(0);
    expect(qpois(0, 5)).toBe(0);
    expect(qpois(-0.1, 5)).toBe(0);
  });

  it('returns Infinity for p >= 1', () => {
    expect(qpois(1, 5)).toBe(Infinity);
  });

  it('matches known Poisson quantiles for small lambda', () => {
    // Poisson(1): CDF(0)=0.368, CDF(2)=0.920, CDF(3)=0.981
    expect(qpois(0.025, 1)).toBe(0);
    expect(qpois(0.975, 1)).toBe(3);
    // Poisson(5): CDF(1)=0.040, CDF(9)=0.968, CDF(10)=0.986
    expect(qpois(0.025, 5)).toBe(1);
    expect(qpois(0.975, 5)).toBe(10);
  });

  it('uses a sensible normal approximation for large lambda', () => {
    // Poisson(400) ~ Normal(400, 20): median ≈ 400, 97.5th ≈ 400 + 1.96·20 ≈ 439
    expect(qpois(0.5, 400)).toBeGreaterThanOrEqual(398);
    expect(qpois(0.5, 400)).toBeLessThanOrEqual(402);
    expect(qpois(0.975, 400)).toBeGreaterThanOrEqual(435);
    expect(qpois(0.975, 400)).toBeLessThanOrEqual(443);
    expect(qpois(0.025, 400)).toBeGreaterThanOrEqual(357);
    expect(qpois(0.025, 400)).toBeLessThanOrEqual(365);
  });
});

describe('calculateOmoriIntegral', () => {
  it('is continuous across the p = 1 special case', () => {
    const atOne = calculateOmoriIntegral(0, 30, 0.04, 1);
    const nearOne = calculateOmoriIntegral(0, 30, 0.04, 1 + 1e-9);
    expect(atOne).toBeCloseTo(nearOne, 5);
  });

  it('uses the logarithmic form at p = 1', () => {
    const expected = Math.log(30 + 0.04) - Math.log(0 + 0.04);
    expect(calculateOmoriIntegral(0, 30, 0.04, 1)).toBeCloseTo(expected, 10);
  });

  it('is positive and decreasing for later windows (aftershock decay)', () => {
    const early = calculateOmoriIntegral(0, 7, 0.04, 1.07);
    const late = calculateOmoriIntegral(30, 37, 0.04, 1.07);
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(0);
    expect(early).toBeGreaterThan(late);
  });
});

describe('calculateExpectedAftershocks', () => {
  it('computes the Reasenberg-Jones productivity term', () => {
    const integral = 2.5;
    const expected = Math.pow(10, -1.59 + 1.03 * (7.8 - (5 - 0.05))) * integral;
    expect(calculateExpectedAftershocks(-1.59, 1.03, 7.8, 5, integral)).toBeCloseTo(expected, 10);
  });

  it('predicts more aftershocks above lower magnitude thresholds', () => {
    const aboveM5 = calculateExpectedAftershocks(-1.59, 1.03, 7.8, 5, 1);
    const aboveM4 = calculateExpectedAftershocks(-1.59, 1.03, 7.8, 4, 1);
    expect(aboveM4).toBeGreaterThan(aboveM5);
  });
});

describe('calculateDurationForecast', () => {
  const params = MODEL_PRESETS.nz;

  it('throws for non-positive duration', () => {
    expect(() => calculateDurationForecast(0, 7.8, 5, 4, 3, 0, params)).toThrow();
    expect(() => calculateDurationForecast(-1, 7.8, 5, 4, 3, 0, params)).toThrow();
  });

  it('throws when the forecast starts before the earthquake', () => {
    expect(() => calculateDurationForecast(30, 7.8, 5, 4, 3, -0.5, params)).toThrow();
  });

  it('throws for degenerate model parameters instead of returning Infinity', () => {
    expect(() => calculateDurationForecast(30, 7.8, 5, 4, 3, 0, { a: -1.59, b: 1.03, c: 0, p: 1.07 })).toThrow();
    expect(() => calculateDurationForecast(30, 7.8, 5, 4, 3, 0, { a: NaN, b: 1.03, c: 0.04, p: 1.07 })).toThrow();
    expect(() => calculateDurationForecast(30, 7.8, 5, 4, 3, 0, { a: -1.59, b: 0, c: 0.04, p: 1.07 })).toThrow();
  });

  it('produces well-formed results for a realistic M7.8 scenario', () => {
    const forecast = calculateDurationForecast(30, 7.8, 6, 5, 4, 0.04, params);
    expect(forecast.duration).toBe(30);
    for (const range of [forecast.m1, forecast.m2, forecast.m3]) {
      expect(Number.isFinite(parseFloat(range.averageNumber))).toBe(true);
      expect(range.range).toMatch(/^\d+-\d+$/);
      expect(range.probability).toMatch(/^[<>]?\d+%$/);
    }
  });

  it('gives higher expected counts for longer durations', () => {
    const week = calculateDurationForecast(7, 7.8, 6, 5, 4, 0, params);
    const month = calculateDurationForecast(30, 7.8, 6, 5, 4, 0, params);
    expect(parseFloat(month.m3.averageNumber)).toBeGreaterThanOrEqual(parseFloat(week.m3.averageNumber));
  });
});

describe('validateModelParameters', () => {
  it('accepts every model preset', () => {
    for (const preset of Object.values(MODEL_PRESETS)) {
      expect(validateModelParameters(preset)).toEqual([]);
    }
  });

  it('reports out-of-bounds parameters', () => {
    const errors = validateModelParameters({ a: 1, b: 3, c: 5, p: 0 });
    expect(errors).toHaveLength(4);
  });
});

describe('formatValue', () => {
  it('rounds large values to integers', () => {
    expect(formatValue(123.4)).toBe('123');
  });

  it('keeps one significant figure below 1', () => {
    expect(formatValue(0.234)).toBe('0.2');
  });

  it('keeps two significant figures between 1 and 100', () => {
    expect(formatValue(5.67)).toBe('5.7');
  });
});

describe('formatPercentage', () => {
  it('caps the displayed range at <1% and >99%', () => {
    expect(formatPercentage(0.4)).toBe('<1%');
    expect(formatPercentage(99.6)).toBe('>99%');
  });

  it('rounds mid-range values', () => {
    expect(formatPercentage(55.4)).toBe('55%');
  });
});
