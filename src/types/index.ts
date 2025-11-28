// Type definitions for Aftershock Calculator

export interface QuakeData {
  quakeId: string;
  magnitude: number;
  quakeTime: string;
}

export interface GeoNetQuakeResponse {
  type: string;
  features: Array<{
    type: string;
    geometry: {
      type: string;
      coordinates: number[];
    };
    properties: {
      publicID: string;
      magnitude: number;
      time: string;
      depth: number;
      locality: string;
      mmi: number;
      quality: string;
    };
  }>;
}

export interface ModelParameters {
  a: number;
  b: number;
  c: number;
  p: number;
}

export interface MagnitudeRanges {
  m1: number;
  m2: number;
  m3: number;
}

export interface ForecastDurations {
  d1: number;
  d2: number;
  d3: number;
}

export interface ForecastResult {
  averageNumber: string;
  range: string;
  probability: string;
}

export interface DurationForecast {
  duration: number;
  m1: ForecastResult; // M1+ (highest magnitude)
  m2: ForecastResult; // M2-M1 range
  m3: ForecastResult; // M3-M2 range (lowest magnitude)
}

export interface CalculationResults {
  quakeId: string;
  rangeLabels: {
    range1: string; // e.g., "M5+"
    range2: string; // e.g., "M4-M5"
    range3: string; // e.g., "M3-M4"
  };
  forecasts: DurationForecast[];
}

export type ModelType = 'nz' | 'sz' | 'california' | 'scr' | 'custom';

/**
 * Model presets based on scientific literature
 *
 * References:
 * - NZ Generic: Earth Sciences New Zealand (ESNZ) calibration
 * - Subduction Zone: ESNZ NZ subduction zone calibration
 * - California (ACR): Reasenberg & Jones (1989, 1994); Hardebeck et al. (2018)
 * - Stable Continental: Page et al. (2016) global SCR parameters
 */
export const MODEL_PRESETS: Record<ModelType, ModelParameters> = {
  // NZ Generic - calibrated for New Zealand active continental region
  nz: { a: -1.59, b: 1.03, c: 0.04, p: 1.07 },

  // Subduction Zone - calibrated for NZ subduction zone sequences
  sz: { a: -1.97, b: 1.0, c: 0.018, p: 0.92 },

  // California/Active Continental Region - Reasenberg & Jones (1989, 1994)
  // These are the classic parameters used by USGS
  california: { a: -1.67, b: 0.91, c: 0.05, p: 1.08 },

  // Stable Continental Region - lower aftershock productivity
  // Based on Page et al. (2016) global analysis
  scr: { a: -2.5, b: 1.0, c: 0.05, p: 1.0 },

  // Custom - user-defined parameters (defaults to NZ Generic)
  custom: { a: -1.59, b: 1.03, c: 0.04, p: 1.07 },
};

/**
 * Human-readable model names and descriptions
 */
export const MODEL_INFO: Record<ModelType, { name: string; description: string }> = {
  nz: {
    name: 'NZ Generic',
    description: 'New Zealand active continental region (ESNZ)'
  },
  sz: {
    name: 'Subduction Zone',
    description: 'NZ Hikurangi/Puysegur subduction zones (ESNZ)'
  },
  california: {
    name: 'California (ACR)',
    description: 'Active Continental Region - Reasenberg & Jones (1989)'
  },
  scr: {
    name: 'Stable Continental',
    description: 'Stable Continental Region - Page et al. (2016)'
  },
  custom: {
    name: 'Custom',
    description: 'User-defined parameters'
  },
};

