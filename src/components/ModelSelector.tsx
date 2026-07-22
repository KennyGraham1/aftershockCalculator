'use client';

import { useId, useState, useCallback, useEffect } from 'react';
import type { ModelType, ModelParameters } from '@/types';
import { MODEL_PRESETS, MODEL_INFO } from '@/types';
import InfoTooltip from './InfoTooltip';

interface ModelSelectorProps {
  modelType: ModelType;
  customParams: ModelParameters;
  onModelChange: (type: ModelType) => void;
  onCustomParamsChange: (params: ModelParameters) => void;
}

// Build model options from the MODEL_INFO constant
const MODEL_OPTIONS: { type: ModelType; label: string; description: string }[] = (
  Object.entries(MODEL_INFO) as [ModelType, { name: string; description: string }][]
).map(([type, info]) => ({
  type,
  label: info.name,
  description: info.description,
}));

const PARAM_INFO: Record<keyof ModelParameters, { label: string; description: string; tooltip: React.ReactNode }> = {
  a: {
    label: 'a',
    description: 'Productivity parameter',
    tooltip: (
      <>
        <strong>Productivity Parameter (a)</strong>
        <p className="mt-1">
          Sets the overall rate of aftershock occurrence for a sequence. More
          negative values correspond to lower aftershock productivity. Published
          regional calibrations generally fall between &minus;4 and 0.
        </p>
      </>
    ),
  },
  b: {
    label: 'b',
    description: 'Magnitude scaling',
    tooltip: (
      <>
        <strong>Gutenberg&ndash;Richter b-value</strong>
        <p className="mt-1">
          Governs the relative frequency of small versus large events. A value
          of 1.0 implies a tenfold increase in event frequency for each unit
          decrease in magnitude. Published values generally fall between 0.5
          and 1.5.
        </p>
      </>
    ),
  },
  c: {
    label: 'c',
    description: 'Omori c-value',
    tooltip: (
      <>
        <strong>Omori c-value (days)</strong>
        <p className="mt-1">
          A short time constant that regularises the aftershock rate in the
          period immediately following the mainshock. Smaller values imply
          higher initial rates. Published values generally fall between 0.001
          and 1.0 days.
        </p>
      </>
    ),
  },
  p: {
    label: 'p',
    description: 'Omori p-value',
    tooltip: (
      <>
        <strong>Omori p-value (decay exponent)</strong>
        <p className="mt-1">
          The exponent governing the temporal decay of aftershock rates.
          A value of 1 corresponds to classical Omori decay; values above 1
          indicate faster decay and values below 1 slower decay. Published
          values generally fall between 0.5 and 2.0.
        </p>
      </>
    ),
  },
};

const MODEL_TOOLTIP = (
  <>
    <strong>Forecast Model Selection</strong>
    <p className="mt-1">
      Aftershock behaviour varies between tectonic settings. Select the
      parameter set calibrated for the region most representative of the
      mainshock:
    </p>
    <ul className="mt-1 ml-3 text-xs list-disc">
      <li><strong>NZ Generic:</strong> New Zealand crustal earthquakes (ESNZ calibration)</li>
      <li><strong>Subduction Zone:</strong> Hikurangi/Puysegur plate-interface events</li>
      <li><strong>California (ACR):</strong> Reasenberg &amp; Jones (1989) generic parameters</li>
      <li><strong>Stable Continental:</strong> low-seismicity intraplate regions</li>
      <li><strong>Custom:</strong> enter your own parameter values</li>
    </ul>
  </>
);

const STORAGE_KEY = 'aftershock-params-expanded';

/**
 * Read initial expanded state from localStorage (client-side only)
 */
function getInitialExpandedState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

function persistExpandedState(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore localStorage errors
  }
}

/** Chevron icon component for expand/collapse indicator */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function ModelSelector({
  modelType,
  customParams,
  onModelChange,
  onCustomParamsChange,
}: ModelSelectorProps) {
  const baseId = useId();
  const isCustom = modelType === 'custom';
  const activeParams = isCustom ? customParams : MODEL_PRESETS[modelType];

  // Parameter-details disclosure, persisted across visits
  const [isExpanded, setIsExpanded] = useState(false);

  // Hydrate the persisted state after mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsExpanded(getInitialExpandedState());
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      persistExpandedState(next);
      return next;
    });
  }, []);

  const handleModelSelect = (type: ModelType) => {
    onModelChange(type);
    // Editing parameters is the point of Custom, so open them automatically
    if (type === 'custom' && !isExpanded) {
      setIsExpanded(true);
      persistExpandedState(true);
    }
  };

  const handleParamChange = (key: keyof ModelParameters, value: string) => {
    const numValue = parseFloat(value);
    onCustomParamsChange({
      ...customParams,
      [key]: isNaN(numValue) ? 0 : numValue
    });
  };

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 print:hidden">
      <div className="flex items-center gap-2 mb-3">
        <span id={`${baseId}-heading`} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Set Forecast Model &amp; Parameters
        </span>
        <InfoTooltip content={MODEL_TOOLTIP} />
      </div>

      {/* Model choices, always visible */}
      <div
        role="radiogroup"
        aria-labelledby={`${baseId}-heading`}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2"
      >
        {MODEL_OPTIONS.map(({ type, label, description }) => {
          const selected = modelType === type;
          return (
            <label
              key={type}
              className={`cursor-pointer rounded-lg border p-3 transition-colors
                          focus-within:ring-2 focus-within:ring-blue-500
                          ${selected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-600'}`}
            >
              <input
                type="radio"
                name={`${baseId}-model`}
                checked={selected}
                onChange={() => handleModelSelect(type)}
                className="sr-only"
              />
              <span className={`block text-sm font-semibold ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
                {label}
              </span>
              <span className="block mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {description}
              </span>
            </label>
          );
        })}
      </div>

      {/* Parameter values: summary always visible, inputs behind a disclosure */}
      <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-controls={`${baseId}-params`}
          className="w-full flex items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-300
                     rounded-md px-1 py-1 hover:text-gray-900 dark:hover:text-gray-100
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span className="font-medium text-left">
            Model parameters{' '}
            <span className="font-mono font-normal text-gray-500 dark:text-gray-400">
              a = {activeParams.a} · b = {activeParams.b} · c = {activeParams.c} · p = {activeParams.p}
            </span>
            {!isCustom && <span className="font-normal text-gray-500 dark:text-gray-400"> (read-only)</span>}
          </span>
          <ChevronIcon expanded={isExpanded} />
        </button>

        {isExpanded && (
          <div id={`${baseId}-params`} className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            {(Object.keys(PARAM_INFO) as (keyof ModelParameters)[]).map((param) => (
              <div key={param}>
                <label
                  htmlFor={`${baseId}-${param}`}
                  className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  {PARAM_INFO[param].label}
                  <InfoTooltip content={PARAM_INFO[param].tooltip} />
                </label>
                <input
                  id={`${baseId}-${param}`}
                  type="number"
                  step="0.001"
                  value={activeParams[param]}
                  onChange={(e) => handleParamChange(param, e.target.value)}
                  disabled={!isCustom}
                  aria-describedby={`${baseId}-${param}-desc`}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                             focus:outline-none focus:ring-2 focus:ring-blue-500
                             disabled:bg-gray-100 dark:disabled:bg-gray-700
                             disabled:text-gray-600 dark:disabled:text-gray-400
                             dark:bg-gray-800 dark:text-gray-100"
                />
                <p
                  id={`${baseId}-${param}-desc`}
                  className="mt-1 text-xs text-gray-500 dark:text-gray-400"
                >
                  {PARAM_INFO[param].description}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
