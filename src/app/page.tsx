'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import QuakeInput from '@/components/QuakeInput';
import Parameters from '@/components/Parameters';
import ModelSelector from '@/components/ModelSelector';
import ResultsTable from '@/components/ResultsTable';
import VisualizationTab from '@/components/VisualizationTab';
import EvaluationTab from '@/components/EvaluationTab';
import AboutTab from '@/components/AboutTab';
import { fetchQuakeData, calculateInitialMagnitudeRanges } from '@/lib/api';
import { calculateDurationForecast, validateModelParameters } from '@/lib/calculations';
import type { ModelType, ModelParameters, CalculationResults } from '@/types';
import { MODEL_PRESETS, MODEL_INFO } from '@/types';

type ResultsViewTab = 'table' | 'visualization' | 'evaluation' | 'about';

interface ParameterWarning {
  message: string;
}

interface ValidationError {
  field: string;
  message: string;
}

// Demo earthquake data - 2016 M7.8 Kaikoura earthquake
// This is a well-known NZ earthquake that makes a good example
const DEMO_EARTHQUAKE = {
  quakeId: '2016p858000',
  magnitude: 7.8,
  // Kaikoura earthquake: 2016-11-13T11:02:56Z
  quakeTime: '2016-11-13T11:02:56.000Z',
  latitude: -42.69,
  longitude: 173.02,
  location: 'Kaikōura, New Zealand',
  description: 'The 2016 Kaikōura earthquake was an M7.8 event in New Zealand\'s South Island. Its long, well-recorded aftershock sequence makes it a good test case for the forecast model.',
};

export default function Home() {
  // State for quake data
  const [quakeId, setQuakeId] = useState('2022p138188');
  const [magnitude, setMagnitude] = useState('');
  const [quakeTime, setQuakeTime] = useState('');
  const [startTime, setStartTime] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadedQuakeInfo, setLoadedQuakeInfo] = useState<{ magnitude: number; time: string } | null>(null);
  const [epicenter, setEpicenter] = useState<{ latitude: number; longitude: number } | null>(null);

  // State for demo mode
  const [isDemoMode, setIsDemoMode] = useState(false);

  // State for model parameters
  const [modelType, setModelType] = useState<ModelType>('nz');
  const [customParams, setCustomParams] = useState<ModelParameters>(MODEL_PRESETS.nz);

  // State for forecast configuration
  const [durations, setDurations] = useState<number[]>([1, 7, 30]);
  const [magnitudeRanges, setMagnitudeRanges] = useState({ m1: 5, m2: 4, m3: 3 });

  // State for results and errors
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Track when the forecast was last generated (for print footer)
  const [forecastGeneratedAt, setForecastGeneratedAt] = useState<string>('');

  // State for results view tab
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsViewTab>('table');

  // Initialize start time to current time on mount (client-side only)
  useEffect(() => {
    // Only set if not already populated (e.g., from GeoNet load)
    if (!startTime) {
      setStartTime(new Date().toISOString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Derived state: can we calculate?
  const canCalculate = useMemo(() => {
    return magnitude !== '' && quakeTime !== '' && startTime !== '';
  }, [magnitude, quakeTime, startTime]);

  // Parameter warnings (non-blocking, just informational)
  const parameterWarnings = useMemo((): ParameterWarning[] => {
    const params = modelType === 'custom' ? customParams : MODEL_PRESETS[modelType];
    return validateModelParameters(params).map(msg => ({ message: msg }));
  }, [modelType, customParams]);

  const handleLoadQuake = useCallback(async () => {
    setIsLoading(true);
    setResults(null);
    setValidationErrors([]);
    setLoadedQuakeInfo(null);
    setEpicenter(null);
    setIsDemoMode(false);

    try {
      const data = await fetchQuakeData(quakeId);
      setMagnitude(data.magnitude.toString());
      setQuakeTime(data.quakeTime);
      setStartTime(new Date().toISOString());

      const ranges = calculateInitialMagnitudeRanges(data.magnitude);
      setMagnitudeRanges(ranges);
      setLoadedQuakeInfo({ magnitude: data.magnitude, time: data.quakeTime });
      if (data.latitude !== undefined && data.longitude !== undefined) {
        setEpicenter({ latitude: data.latitude, longitude: data.longitude });
      }
    } finally {
      setIsLoading(false);
    }
  }, [quakeId]);

  // Demo mode: Pre-populate with the Kaikoura earthquake and auto-calculate
  const handleTryDemo = useCallback(() => {
    setResults(null);
    setValidationErrors([]);
    setIsDemoMode(true);

    // Set demo earthquake data
    setQuakeId(DEMO_EARTHQUAKE.quakeId);
    setMagnitude(DEMO_EARTHQUAKE.magnitude.toString());
    setQuakeTime(DEMO_EARTHQUAKE.quakeTime);

    // Set start time to 1 hour after the earthquake (realistic scenario)
    const quakeDate = new Date(DEMO_EARTHQUAKE.quakeTime);
    const forecastStart = new Date(quakeDate.getTime() + 60 * 60 * 1000); // 1 hour later
    setStartTime(forecastStart.toISOString());

    // Set appropriate magnitude ranges for a M7.8 earthquake
    const ranges = calculateInitialMagnitudeRanges(DEMO_EARTHQUAKE.magnitude);
    setMagnitudeRanges(ranges);

    // Set loaded quake info to show the info banner
    setLoadedQuakeInfo({
      magnitude: DEMO_EARTHQUAKE.magnitude,
      time: DEMO_EARTHQUAKE.quakeTime,
    });
    setEpicenter({ latitude: DEMO_EARTHQUAKE.latitude, longitude: DEMO_EARTHQUAKE.longitude });
  }, []);

  const handleModelChange = useCallback((type: ModelType) => {
    setModelType(type);
    if (type !== 'custom') {
      setCustomParams(MODEL_PRESETS[type]);
    }
    setResults(null);
  }, []);

  const handleDurationChange = useCallback((index: number, value: number) => {
    setDurations(prev => {
      const next = [...prev];
      next[index] = Math.max(1, Math.min(730, value));
      return next;
    });
    setResults(null);
  }, []);

  const handleAddDuration = useCallback(() => {
    setDurations(prev => {
      // Suggest a value larger than the current maximum
      const max = prev.length > 0 ? Math.max(...prev) : 30;
      const next = max < 365 ? 365 : max + 365;
      return [...prev, Math.min(next, 730)];
    });
    setResults(null);
  }, []);

  const handleRemoveDuration = useCallback((index: number) => {
    setDurations(prev => {
      if (prev.length <= 1) return prev; // keep at least one
      return prev.filter((_, i) => i !== index);
    });
    setResults(null);
  }, []);

  const handleMagnitudeRangesChange = useCallback((key: 'm1' | 'm2' | 'm3', value: number) => {
    setMagnitudeRanges(prev => ({ ...prev, [key]: value }));
    setResults(null);
  }, []);

  const validateInputs = useCallback((): ValidationError[] => {
    const errors: ValidationError[] = [];
    const mag = parseFloat(magnitude);
    const { m1, m2, m3 } = magnitudeRanges;

    // Magnitude validation
    if (isNaN(mag) || mag <= 0) {
      errors.push({ field: 'magnitude', message: 'Please enter a valid magnitude greater than 0' });
    } else if (mag >= 10) {
      errors.push({ field: 'magnitude', message: 'Magnitude must be less than 10' });
    }

    // Magnitude ranges validation
    if (m1 > 9) {
      errors.push({ field: 'magnitudeRanges', message: 'M1 must be 9 or less' });
    }
    if (m2 >= m1) {
      errors.push({ field: 'magnitudeRanges', message: 'M2 must be less than M1' });
    }
    if (m3 >= m2) {
      errors.push({ field: 'magnitudeRanges', message: 'M3 must be less than M2' });
    }
    if (m3 < 1) {
      errors.push({ field: 'magnitudeRanges', message: 'M3 must be at least 1' });
    }

    // Time validation
    const quakeDate = new Date(quakeTime);
    const startDate = new Date(startTime);

    if (isNaN(quakeDate.getTime())) {
      errors.push({ field: 'quakeTime', message: 'Please enter a valid quake time' });
    }
    if (isNaN(startDate.getTime())) {
      errors.push({ field: 'startTime', message: 'Please enter a valid start time' });
    }
    if (!isNaN(quakeDate.getTime()) && !isNaN(startDate.getTime()) && quakeDate.getTime() > startDate.getTime()) {
      errors.push({ field: 'startTime', message: 'Forecast start time must be after quake time' });
    }

    // Duration validation
    for (let i = 0; i < durations.length; i++) {
      if (durations[i] <= 0) {
        errors.push({ field: 'duration', message: `Forecast duration ${i + 1} must be positive` });
      }
    }
    if (new Set(durations).size !== durations.length) {
      errors.push({ field: 'duration', message: 'Forecast durations must be unique' });
    }

    // Hard model-parameter validation: values that make the maths undefined
    // (soft literature-bound checks are shown separately as warnings)
    const params = modelType === 'custom' ? customParams : MODEL_PRESETS[modelType];
    if (!Number.isFinite(params.a)) {
      errors.push({ field: 'params', message: "Parameter 'a' must be a finite number" });
    }
    if (!Number.isFinite(params.b) || params.b <= 0) {
      errors.push({ field: 'params', message: "Parameter 'b' must be greater than 0" });
    }
    if (!Number.isFinite(params.c) || params.c <= 0) {
      errors.push({ field: 'params', message: "Parameter 'c' must be greater than 0" });
    }
    if (!Number.isFinite(params.p) || params.p <= 0) {
      errors.push({ field: 'params', message: "Parameter 'p' must be greater than 0" });
    }

    return errors;
  }, [magnitude, magnitudeRanges, quakeTime, startTime, durations, modelType, customParams]);

  const handleCalculate = useCallback(() => {
    const errors = validateInputs();
    setValidationErrors(errors);

    if (errors.length > 0) {
      return;
    }

    const mag = parseFloat(magnitude);
    const { m1, m2, m3 } = magnitudeRanges;
    const params = modelType === 'custom' ? customParams : MODEL_PRESETS[modelType];

    const quakeDate = new Date(quakeTime);
    const startDate = new Date(startTime);
    const rangeStartFromQuakeTime = (startDate.valueOf() - quakeDate.valueOf()) / (1000 * 60 * 60 * 24);

    let forecasts;
    try {
      forecasts = durations.map(duration =>
        calculateDurationForecast(duration, mag, m1, m2, m3, rangeStartFromQuakeTime, params)
      );
    } catch (err) {
      setValidationErrors([{
        field: 'calculation',
        message: err instanceof Error ? err.message : 'Calculation failed. Please check your inputs.',
      }]);
      return;
    }

    setResults({
      quakeId,
      rangeLabels: {
        range1: `M${m1}+`,
        range2: `M${m2}-M${m1}`,
        range3: `M${m3}-M${m2}`,
      },
      forecasts,
      mainshockMagnitude: mag,
      modelParams: params,
      rangeStartDays: rangeStartFromQuakeTime,
      quakeTimeISO: quakeDate.toISOString(),
      epicenter: epicenter ?? undefined,
    });
    setForecastGeneratedAt(new Date().toISOString());
  }, [magnitude, magnitudeRanges, quakeTime, startTime, modelType, customParams, durations, quakeId, epicenter, validateInputs]);

  const handleExportCSV = useCallback(() => {
    if (!results) return;

    const headers = [
      'Duration',
      `${results.rangeLabels.range3} Avg`, `${results.rangeLabels.range3} Range`, `${results.rangeLabels.range3} Prob`,
      `${results.rangeLabels.range2} Avg`, `${results.rangeLabels.range2} Range`, `${results.rangeLabels.range2} Prob`,
      `${results.rangeLabels.range1} Avg`, `${results.rangeLabels.range1} Range`, `${results.rangeLabels.range1} Prob`,
    ];

    const rows = results.forecasts.map(f => [
      `${f.duration} ${f.duration === 1 ? 'day' : 'days'}`,
      f.m3.averageNumber, f.m3.range, f.m3.probability,
      f.m2.averageNumber, f.m2.range, f.m2.probability,
      f.m1.averageNumber, f.m1.range, f.m1.probability,
    ]);

    const csvContent = [
      `# Aftershock forecast for ${results.quakeId}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Model: ${modelType.toUpperCase()}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `aftershock-forecast-${results.quakeId}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [results, modelType]);

  const handleParameterChange = useCallback((setter: (v: string) => void) => {
    return (v: string) => {
      setter(v);
      setResults(null);
      setValidationErrors([]);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 transition-colors">
      <main className="max-w-6xl mx-auto px-4">
        {/* Demo Mode Banner - shown when demo is active */}
        {isDemoMode && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30
                          border border-blue-200 dark:border-blue-800 rounded-lg print:hidden">
            <div className="flex items-start gap-3">
              <span className="text-2xl" role="img" aria-label="Demo">🎯</span>
              <div className="flex-1">
                <h2 className="text-blue-800 dark:text-blue-300 font-semibold mb-1">
                  Demo Mode: {DEMO_EARTHQUAKE.location}
                </h2>
                <p className="text-blue-700 dark:text-blue-400 text-sm mb-2">
                  {DEMO_EARTHQUAKE.description}
                </p>
                <p className="text-blue-600 dark:text-blue-500 text-xs">
                  Click <strong>Calculate Forecast</strong> below to see example results,
                  or change any parameter first.
                </p>
              </div>
              <button
                onClick={() => setIsDemoMode(false)}
                className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
                aria-label="Dismiss demo banner"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Getting Started Card - shown when no data is loaded */}
        {!magnitude && !isDemoMode && !loadedQuakeInfo && (
          <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700
                          shadow-sm print:hidden">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Aftershock Calculator
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This tool forecasts the expected number and probability of aftershocks following an
              earthquake, using the Reasenberg&ndash;Jones model. To start:
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleTryDemo}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md
                           hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2
                           focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                🎯 Try Demo
              </button>
              <span className="self-center text-gray-400 dark:text-gray-500">or</span>
              <span className="self-center text-gray-600 dark:text-gray-400 text-sm">
                Enter a GeoNet Quake ID below and click <strong>Load Quake Info</strong>
              </span>
            </div>
          </div>
        )}

        <QuakeInput
          quakeId={quakeId}
          onQuakeIdChange={setQuakeId}
          onLoadQuake={handleLoadQuake}
          isLoading={isLoading}
          loadedQuakeInfo={loadedQuakeInfo}
        />

        <Parameters
          magnitude={magnitude}
          quakeTime={quakeTime}
          startTime={startTime}
          durations={durations}
          magnitudeRanges={magnitudeRanges}
          onMagnitudeChange={handleParameterChange(setMagnitude)}
          onQuakeTimeChange={handleParameterChange(setQuakeTime)}
          onStartTimeChange={handleParameterChange(setStartTime)}
          onDurationsChange={handleDurationChange}
          onAddDuration={handleAddDuration}
          onRemoveDuration={handleRemoveDuration}
          onMagnitudeRangesChange={handleMagnitudeRangesChange}
        />

        <ModelSelector
          modelType={modelType}
          customParams={customParams}
          onModelChange={handleModelChange}
          onCustomParamsChange={(p) => { setCustomParams(p); setResults(null); }}
        />

        {/* Parameter warnings (non-blocking, informational) */}
        {parameterWarnings.length > 0 && (
          <div
            role="status"
            className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg print:hidden"
          >
            <h3 className="text-amber-800 dark:text-amber-300 font-semibold mb-2">
              ⚠️ Parameter Warning
            </h3>
            <ul className="list-disc list-inside text-amber-700 dark:text-amber-400 text-sm space-y-1">
              {parameterWarnings.map((warning, i) => (
                <li key={i}>{warning.message}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
              Calculations will proceed, but results may be unreliable with these parameter values.
            </p>
          </div>
        )}

        {validationErrors.length > 0 && (
          <div
            role="alert"
            className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg print:hidden"
          >
            <h3 className="text-red-800 dark:text-red-300 font-semibold mb-2">
              Please fix the following errors:
            </h3>
            <ul className="list-disc list-inside text-red-700 dark:text-red-400 text-sm space-y-1">
              {validationErrors.map((error, i) => (
                <li key={i}>{error.message}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={handleCalculate}
          disabled={!canCalculate}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md
                     hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                     transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2
                     dark:focus:ring-offset-gray-900 print:hidden"
          aria-describedby={!canCalculate ? 'calculate-hint' : undefined}
        >
          Calculate Forecast
        </button>
        {!canCalculate && (
          <p id="calculate-hint" className="mt-2 text-sm text-gray-600 dark:text-gray-400 print:hidden">
            Load quake data or enter parameters manually to enable calculation
          </p>
        )}

        {/* Results Section with Tabs (About is always available) */}
        {(
          <div className="mt-6">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700 print:hidden">
              <nav className="-mb-px flex space-x-8" aria-label="Results view tabs">
                <button
                  onClick={() => setActiveResultsTab('table')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeResultsTab === 'table'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                  aria-current={activeResultsTab === 'table' ? 'page' : undefined}
                >
                  📊 Table View
                </button>
                <button
                  onClick={() => setActiveResultsTab('visualization')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeResultsTab === 'visualization'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                  aria-current={activeResultsTab === 'visualization' ? 'page' : undefined}
                >
                  📈 Visualization
                </button>
                <button
                  onClick={() => setActiveResultsTab('evaluation')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeResultsTab === 'evaluation'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                  aria-current={activeResultsTab === 'evaluation' ? 'page' : undefined}
                >
                  🧪 Evaluation
                </button>
                <button
                  onClick={() => setActiveResultsTab('about')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeResultsTab === 'about'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                  aria-current={activeResultsTab === 'about' ? 'page' : undefined}
                >
                  ℹ️ About
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            {activeResultsTab === 'about' ? (
              <AboutTab />
            ) : activeResultsTab === 'table' ? (
              results ? (
                <ResultsTable
                  results={results}
                  onExportCSV={handleExportCSV}
                  modelName={MODEL_INFO[modelType].name}
                  startTime={startTime}
                  forecastGeneratedAt={forecastGeneratedAt}
                  modelParams={modelType === 'custom' ? customParams : MODEL_PRESETS[modelType]}
                />
              ) : (
                <div className="mt-6 p-8 text-center text-gray-500 dark:text-gray-400 print:hidden">
                  <p>Calculate a forecast to see the results table</p>
                </div>
              )
            ) : activeResultsTab === 'visualization' ? (
              <VisualizationTab
                results={results}
                modelName={MODEL_INFO[modelType].name}
              />
            ) : (
              <EvaluationTab
                key={results?.quakeId ?? 'no-results'}
                results={results}
                modelName={MODEL_INFO[modelType].name}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
