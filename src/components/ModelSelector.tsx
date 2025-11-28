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
        <strong>Productivity (a)</strong>
        <p className="mt-1">
          Controls how many aftershocks occur. More negative values mean fewer aftershocks.
          Typical range: -4 to 0.
        </p>
      </>
    ),
  },
  b: {
    label: 'b',
    description: 'Magnitude scaling',
    tooltip: (
      <>
        <strong>Gutenberg-Richter b-value</strong>
        <p className="mt-1">
          Controls the ratio of small to large earthquakes. A b-value of 1.0 means there are
          ~10 times more M3 than M4 earthquakes. Typical range: 0.5 to 1.5.
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
          A small time offset that prevents the rate from going to infinity at t=0.
          Smaller values mean higher initial rates. Typical range: 0.001 to 1.0 days.
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
          Controls how fast aftershock rates decay. p=1 is standard Omori decay.
          p&gt;1 means faster decay; p&lt;1 means slower decay. Typical range: 0.5 to 2.0.
        </p>
      </>
    ),
  },
};

const SEISMIC_MODEL_TOOLTIP = (
  <>
    <strong>Seismic Model Selection</strong>
    <p className="mt-1">
      Different tectonic regions have different aftershock characteristics.
      Choose the model that best matches your earthquake&apos;s location:
    </p>
    <ul className="mt-1 ml-3 text-xs list-disc">
      <li><strong>NZ Generic</strong> - New Zealand crustal earthquakes</li>
      <li><strong>Subduction Zone</strong> - Hikurangi/plate interface events</li>
      <li><strong>California (ACR)</strong> - Classic USGS parameters</li>
      <li><strong>Stable Continental</strong> - Low-seismicity regions</li>
    </ul>
  </>
);

const STORAGE_KEY = 'aftershock-model-expanded';

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

/** Chevron icon component for expand/collapse indicator */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
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

  // Initialize collapsed state from localStorage (lazy initializer avoids hydration issues)
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate client-side state after mount
  // This is a legitimate use of setState in useEffect for client-side hydration
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsExpanded(getInitialExpandedState());
    setIsHydrated(true);
  }, []);

  // Persist state to localStorage when it changes
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(newValue));
      } catch {
        // Ignore localStorage errors
      }
      return newValue;
    });
  }, []);

  const handleParamChange = (key: keyof ModelParameters, value: string) => {
    const numValue = parseFloat(value);
    onCustomParamsChange({
      ...customParams,
      [key]: isNaN(numValue) ? 0 : numValue
    });
  };

  // Get current model label for summary display
  const currentModelLabel = MODEL_OPTIONS.find(m => m.type === modelType)?.label ?? 'Unknown';

  return (
    <div className="mb-6 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 print:hidden">
      {/* Disclosure Header - Split into label area and expand button */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Seismic Model
          </span>
          <InfoTooltip content={SEISMIC_MODEL_TOOLTIP} />
          <span className="text-sm px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
            {currentModelLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-controls={`${baseId}-content`}
          className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     transition-colors"
          aria-label={isExpanded ? 'Collapse model options' : 'Expand model options'}
        >
          <ChevronIcon expanded={isExpanded} />
        </button>
      </div>

      {/* Collapsible Content */}
      <div
        id={`${baseId}-content`}
        role="region"
        aria-labelledby={`${baseId}-heading`}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isHydrated
            ? isExpanded
              ? 'max-h-[600px] opacity-100'
              : 'max-h-0 opacity-0'
            : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 pt-2">
          {/* Model Selection Radio Group */}
          <div
            className="space-y-2 mb-4"
            role="radiogroup"
            aria-label="Select seismic model"
          >
            {MODEL_OPTIONS.map(({ type, label, description }) => (
              <label
                key={type}
                className={`flex items-start gap-3 cursor-pointer p-2 rounded-md transition-colors
                           ${modelType === type
                             ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                             : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'}`}
              >
                <input
                  type="radio"
                  name={`${baseId}-model`}
                  checked={modelType === type}
                  onChange={() => onModelChange(type)}
                  className="w-4 h-4 mt-0.5 accent-blue-500"
                  aria-describedby={`${baseId}-${type}-desc`}
                />
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
                  <p
                    id={`${baseId}-${type}-desc`}
                    className="text-sm text-gray-500 dark:text-gray-400"
                  >
                    {description}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* Model Parameters */}
          <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Model Parameters {!isCustom && <span className="text-gray-500">(read-only)</span>}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    value={isCustom ? customParams[param] : MODEL_PRESETS[modelType][param]}
                    onChange={(e) => handleParamChange(param, e.target.value)}
                    disabled={!isCustom}
                    aria-describedby={`${baseId}-${param}-desc`}
                    tabIndex={isExpanded ? 0 : -1}
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
          </div>
        </div>
      </div>
    </div>
  );
}

