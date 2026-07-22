import { describe, it, expect } from 'vitest';
import {
  wellsCoppersmithLengthKm,
  evaluationRadiusKm,
  deltaLonDeg,
  haversineKm,
  isInRegion,
  regionBbox,
  regionAreaKm2,
  squareHalfWidthKm,
  poissonCdf,
  nTest,
  brierScore,
  logScore,
  poissonLogLikelihood,
  countMatches,
  expectedCountForBin,
  evaluateBin,
  MIN_RADIUS_KM,
  type EvalRegion,
  type ObservedEvent,
} from './evaluation';
import { calculateOmoriIntegral, calculateExpectedAftershocks } from './calculations';

describe('wellsCoppersmithLengthKm', () => {
  it('reproduces the published relation', () => {
    // log10(L) = -2.44 + 0.59 * 7.8 = 2.162 -> ~145 km
    expect(wellsCoppersmithLengthKm(7.8)).toBeCloseTo(Math.pow(10, 2.162), 1);
    // M6: log10(L) = 1.10 -> ~12.6 km
    expect(wellsCoppersmithLengthKm(6.0)).toBeCloseTo(12.59, 1);
  });

  it('applies the minimum radius floor for small events', () => {
    expect(evaluationRadiusKm(4.0, 1)).toBe(MIN_RADIUS_KM);
    expect(evaluationRadiusKm(7.8, 1)).toBeGreaterThan(100);
  });
});

describe('geometry', () => {
  it('computes minimal longitude differences across the dateline', () => {
    expect(deltaLonDeg(179.5, -179.5)).toBeCloseTo(-1, 6);
    expect(deltaLonDeg(-179.5, 179.5)).toBeCloseTo(1, 6);
    expect(deltaLonDeg(10, 5)).toBeCloseTo(5, 6);
  });

  it('haversine matches known distances, including across the dateline', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 0);
    expect(haversineKm(0, 179.5, 0, -179.5)).toBeCloseTo(111.19, 0);
  });

  it('circle membership uses great-circle distance', () => {
    const region: EvalRegion = { type: 'circle', latitude: -42.69, longitude: 173.02, radiusKm: 100 };
    expect(isInRegion(region, -42.69, 173.02)).toBe(true);
    expect(isInRegion(region, -43.5, 173.02)).toBe(true); // ~90 km south
    expect(isInRegion(region, -44.0, 173.02)).toBe(false); // ~146 km south
  });

  it('square membership uses the equal-area half-width', () => {
    const region: EvalRegion = { type: 'square', latitude: 0, longitude: 0, radiusKm: 100 };
    const halfDeg = ((100 * Math.sqrt(Math.PI)) / 2) / 111.32; // ~0.796 deg
    expect(isInRegion(region, halfDeg - 0.01, 0)).toBe(true);
    expect(isInRegion(region, halfDeg + 0.01, 0)).toBe(false);
  });

  it('circle and equal-area square have the same area', () => {
    const circle: EvalRegion = { type: 'circle', latitude: 0, longitude: 0, radiusKm: 100 };
    expect(regionAreaKm2(circle)).toBeCloseTo(Math.PI * 10000, 6);
    // Square side = 2 * halfWidth; side^2 must equal pi * r^2
    expect((2 * squareHalfWidthKm(100)) ** 2).toBeCloseTo(regionAreaKm2(circle), 6);
  });

  it('bounding box covers the region and normalises longitude', () => {
    const region: EvalRegion = { type: 'circle', latitude: -43.9, longitude: -176.5, radiusKm: 50 };
    const bbox = regionBbox(region);
    expect(bbox.minLon).toBeGreaterThan(180); // Chatham Islands in 0-360 space
    expect(bbox.maxLat - bbox.minLat).toBeCloseTo((2 * 50) / 111.32, 3);
  });
});

describe('poissonCdf', () => {
  it('matches exact values for small lambda', () => {
    // Poisson(1): CDF(0) = e^-1 = 0.3679, CDF(3) = 0.9810
    expect(poissonCdf(0, 1)).toBeCloseTo(0.3679, 3);
    expect(poissonCdf(3, 1)).toBeCloseTo(0.981, 3);
  });

  it('normal approximation is sensible for large lambda', () => {
    expect(poissonCdf(400, 400)).toBeGreaterThan(0.45);
    expect(poissonCdf(400, 400)).toBeLessThan(0.55);
    expect(poissonCdf(460, 400)).toBeGreaterThan(0.99);
  });
});

describe('nTest', () => {
  it('flags underprediction when far more events occur than forecast', () => {
    expect(nTest(100, 5).verdict).toBe('underprediction');
  });

  it('flags overprediction when far fewer events occur than forecast', () => {
    expect(nTest(0, 10).verdict).toBe('overprediction');
  });

  it('accepts counts consistent with the forecast', () => {
    expect(nTest(5, 5).verdict).toBe('consistent');
    expect(nTest(0, 1).verdict).toBe('consistent'); // P(X<=0)=0.37, fine
  });
});

describe('scores', () => {
  it('Brier score is 0 for a perfect forecast and 1 for a certain miss', () => {
    expect(brierScore(1, true)).toBe(0);
    expect(brierScore(0, true)).toBe(1);
    expect(brierScore(0.5, false)).toBeCloseTo(0.25, 10);
  });

  it('log score penalises confident wrong forecasts and clamps p', () => {
    expect(logScore(0.9, true)).toBeCloseTo(-Math.log(0.9), 10);
    expect(Number.isFinite(logScore(0, true))).toBe(true);
    expect(logScore(0.01, true)).toBeGreaterThan(logScore(0.99, true));
  });

  it('Poisson log-likelihood matches hand-computed values', () => {
    expect(poissonLogLikelihood(0, 2)).toBeCloseTo(-2, 10);
    // n=2, lambda=2: 2 ln2 - 2 - ln2 = ln2 - 2
    expect(poissonLogLikelihood(2, 2)).toBeCloseTo(Math.log(2) - 2, 10);
  });
});

describe('countMatches', () => {
  const region: EvalRegion = { type: 'circle', latitude: 0, longitude: 0, radiusKm: 200 };
  const ev = (over: Partial<ObservedEvent>): ObservedEvent => ({
    publicId: 'x', timeMs: 1000, magnitude: 4.5, latitude: 0, longitude: 0, depthKm: 10, ...over,
  });

  it('filters by time, magnitude bin, region, and mainshock ID', () => {
    const events = [
      ev({ publicId: 'keep' }),
      ev({ publicId: 'mainshock' }),
      ev({ publicId: 'early', timeMs: 10 }),
      ev({ publicId: 'late', timeMs: 999999 }),
      ev({ publicId: 'small', magnitude: 3.9 }),
      ev({ publicId: 'too-big-for-bin', magnitude: 5.2 }),
      ev({ publicId: 'far', latitude: 5 }),
    ];
    const matched = countMatches(events, 500, 2000, { minMag: 4, maxMag: 5 }, region, 'mainshock');
    expect(matched.map(e => e.publicId)).toEqual(['keep']);
  });

  it('treats a null upper bound as open-ended', () => {
    const events = [ev({ magnitude: 7.9 })];
    expect(countMatches(events, 0, 2000, { minMag: 5, maxMag: null }, region).length).toBe(1);
  });
});

describe('expectedCountForBin', () => {
  const params = { a: -1.59, b: 1.03, c: 0.04, p: 1.07 };

  it('matches the forecast-table computation exactly', () => {
    const I = calculateOmoriIntegral(0.04, 30.04, params.c, params.p);
    const nLo = calculateExpectedAftershocks(params.a, params.b, 7.8, 4, I);
    const nHi = calculateExpectedAftershocks(params.a, params.b, 7.8, 5, I);
    expect(expectedCountForBin(params, 7.8, { minMag: 4, maxMag: 5 }, 0.04, 30.04)).toBeCloseTo(nLo - nHi, 10);
  });

  it('is consistent between a bin pair and the cumulative threshold', () => {
    const bin1 = expectedCountForBin(params, 7.8, { minMag: 4, maxMag: 5 }, 0, 30);
    const bin2 = expectedCountForBin(params, 7.8, { minMag: 5, maxMag: null }, 0, 30);
    const cumulative = expectedCountForBin(params, 7.8, { minMag: 4, maxMag: null }, 0, 30);
    expect(bin1 + bin2).toBeCloseTo(cumulative, 10);
  });
});

describe('evaluateBin', () => {
  it('produces coherent scores for a well-matched forecast', () => {
    const r = evaluateBin(5, 5, 1, 10);
    expect(r.withinCi).toBe(true);
    expect(r.verdict).toBe('consistent');
    expect(r.occurred).toBe(true);
    expect(r.probability).toBeCloseTo(1 - Math.exp(-5), 10);
  });

  it('flags an observation outside the confidence range', () => {
    const r = evaluateBin(50, 5, 1, 10);
    expect(r.withinCi).toBe(false);
    expect(r.verdict).toBe('underprediction');
  });
});
