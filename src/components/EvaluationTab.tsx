'use client';

import React, { useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import type { CalculationResults } from '@/types';
import { qpois, formatValue } from '@/lib/calculations';
import { fetchObservedCatalog, ApiError, CATALOG_TRUNCATION_WARNING_COUNT } from '@/lib/api';
import InfoTooltip from './InfoTooltip';
import {
  evaluationRadiusKm,
  wellsCoppersmithLengthKm,
  regionAreaKm2,
  regionBbox,
  countMatches,
  expectedCountForBin,
  evaluateBin,
  type EvalRegion,
  type RegionType,
  type ObservedEvent,
  type BinTarget,
  type BinEvaluation,
} from '@/lib/evaluation';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer]);

// Leaflet accesses `window` at import time, so the map must be client-only
const EvaluationMap = dynamic(() => import('./EvaluationMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
      Loading map…
    </div>
  ),
});

const AXIS_LABEL_COLOR = '#6b7280';
const GRID_LINE_COLOR = '#9ca3af40';
const MODEL_COLOR = '#6b7280'; // forecast (model) series: neutral gray
const OBSERVED_COLOR = '#2563eb'; // observed (data) series: blue

const MS_PER_DAY = 86_400_000;

type BinKey = 'm1' | 'm2' | 'm3';

// Tooltips for the score columns in the summary table
const SCORE_TOOLTIPS = {
  brier: (
    <>
      <strong>Brier Score</strong>
      <p className="mt-1">
        How accurate the &ldquo;chance of one or more aftershocks&rdquo; forecast turned out to be.
        0 is a perfect forecast and 1 is the worst; below 0.25 is better than guessing.
      </p>
    </>
  ),
  logScore: (
    <>
      <strong>Log Score</strong>
      <p className="mt-1">
        How well the forecast probability matched what actually happened, punishing confident
        wrong forecasts hardest. 0 is perfect; lower is better. Best judged over many forecasts,
        not a single window.
      </p>
    </>
  ),
  nTest: (
    <>
      <strong>N-test</strong>
      <p className="mt-1">
        Whether the number of observed aftershocks is consistent with the number forecast.
        &ldquo;Overprediction&rdquo; means fewer occurred than forecast; &ldquo;underprediction&rdquo;
        means more occurred than forecast.
      </p>
    </>
  ),
};

interface EvalRow {
  duration: number;
  binKey: BinKey;
  binLabel: string;
  status: 'complete' | 'partial' | 'future';
  /** Days of the window actually evaluated (equals duration when complete) */
  evaluatedDays: number;
  scores: BinEvaluation | null;
}

function getMagValue(label: string): number {
  const match = label.match(/M([0-9.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

function formatScore(v: number): string {
  return Number.isFinite(v) ? v.toFixed(3) : '–';
}

interface EvaluationTabProps {
  results: CalculationResults | null;
  modelName?: string;
}

export default function EvaluationTab({ results, modelName = 'NZ Generic' }: EvaluationTabProps) {
  // Region configuration (assumptions are user-visible and adjustable)
  const [regionType, setRegionType] = useState<RegionType>('circle');
  const [multiplier, setMultiplier] = useState<number>(1);
  const [latInput, setLatInput] = useState<string>(results?.epicenter ? String(results.epicenter.latitude) : '');
  const [lonInput, setLonInput] = useState<string>(results?.epicenter ? String(results.epicenter.longitude) : '');

  // Evaluation state
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ObservedEvent[] | null>(null);
  const [evaluatedRegion, setEvaluatedRegion] = useState<EvalRegion | null>(null);
  // The forecast snapshot the catalogue was fetched for: a recalculated
  // forecast (new thresholds, windows, or model) invalidates the catalogue,
  // since the query envelope and magnitude floor may no longer match
  const [catalogFor, setCatalogFor] = useState<CalculationResults | null>(null);
  const [selectedBin, setSelectedBin] = useState<BinKey>('m3');
  // While true, the diagnostic charts render at print dimensions so they fit
  // side by side on a landscape page (CSS cannot resize a canvas chart)
  const [printMode, setPrintMode] = useState(false);

  const handleExportPdf = useCallback(() => {
    setPrintMode(true);
    // Give React and ECharts a moment to re-render at print size, then open
    // the dialog; restore the screen size once it closes
    setTimeout(() => {
      window.print();
      setPrintMode(false);
    }, 350);
  }, []);

  const magVals = useMemo(() => {
    if (!results) return null;
    return {
      m1: getMagValue(results.rangeLabels.range1),
      m2: getMagValue(results.rangeLabels.range2),
      m3: getMagValue(results.rangeLabels.range3),
    };
  }, [results]);

  const bins = useMemo((): Record<BinKey, { target: BinTarget; label: string }> | null => {
    if (!results || !magVals) return null;
    return {
      m3: { target: { minMag: magVals.m3, maxMag: magVals.m2 }, label: results.rangeLabels.range3 },
      m2: { target: { minMag: magVals.m2, maxMag: magVals.m1 }, label: results.rangeLabels.range2 },
      m1: { target: { minMag: magVals.m1, maxMag: null }, label: results.rangeLabels.range1 },
    };
  }, [results, magVals]);

  const radiusKm = useMemo(
    () => (results ? evaluationRadiusKm(results.mainshockMagnitude, multiplier) : 0),
    [results, multiplier]
  );

  const runEvaluation = useCallback(async () => {
    if (!results || !magVals) return;
    setEvalError(null);
    setCatalog(null);
    setEvaluatedRegion(null);

    const latitude = parseFloat(latInput);
    const longitude = parseFloat(lonInput);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -360 || longitude > 360) {
      setEvalError('Please enter a valid epicentre latitude and longitude (load the quake from GeoNet, or type them manually).');
      return;
    }

    const region: EvalRegion = { type: regionType, latitude, longitude, radiusKm };
    const quakeTimeMs = new Date(results.quakeTimeISO).getTime();
    const maxDur = Math.max(...results.forecasts.map(f => f.duration));
    const windowStartMs = quakeTimeMs + results.rangeStartDays * MS_PER_DAY;
    const windowEndMs = windowStartMs + maxDur * MS_PER_DAY;
    const nowMs = Date.now();

    if (windowStartMs >= nowMs) {
      setEvalError('The forecast window is entirely in the future; there are no observations to evaluate yet.');
      return;
    }

    setIsEvaluating(true);
    try {
      const events = await fetchObservedCatalog(
        regionBbox(region),
        new Date(windowStartMs),
        new Date(Math.min(windowEndMs, nowMs)),
        magVals.m3
      );
      setCatalog(events);
      setEvaluatedRegion(region);
      setCatalogFor(results);
    } catch (err) {
      setEvalError(err instanceof ApiError ? err.message : 'Failed to fetch the observed catalogue.');
    } finally {
      setIsEvaluating(false);
    }
  }, [results, magVals, latInput, lonInput, regionType, radiusKm]);

  // Score every forecast window x magnitude bin against the catalogue
  const evaluation = useMemo(() => {
    // catalogFor !== results: the forecast was recalculated after the fetch,
    // so the catalogue may not cover the new thresholds or windows — require a
    // fresh fetch rather than scoring against mismatched data
    if (!results || !bins || !catalog || !evaluatedRegion || catalogFor !== results) return null;

    const quakeTimeMs = new Date(results.quakeTimeISO).getTime();
    const t0 = results.rangeStartDays;
    const windowStartMs = quakeTimeMs + t0 * MS_PER_DAY;
    const nowMs = Date.now();

    const rows: EvalRow[] = [];
    for (const forecast of results.forecasts) {
      const endMs = windowStartMs + forecast.duration * MS_PER_DAY;
      const clampedEndMs = Math.min(endMs, nowMs);
      const status: EvalRow['status'] =
        windowStartMs >= nowMs ? 'future' : endMs <= nowMs ? 'complete' : 'partial';
      const evaluatedDays = Math.max(0, (clampedEndMs - windowStartMs) / MS_PER_DAY);

      for (const binKey of ['m3', 'm2', 'm1'] as const) {
        const bin = bins[binKey];
        if (status === 'future' || evaluatedDays <= 0) {
          rows.push({ duration: forecast.duration, binKey, binLabel: bin.label, status: 'future', evaluatedDays: 0, scores: null });
          continue;
        }
        // Expected count over the evaluated (possibly partial) window,
        // recomputed exactly from the model
        const expected = expectedCountForBin(
          results.modelParams, results.mainshockMagnitude, bin.target, t0, t0 + evaluatedDays
        );
        const observed = countMatches(
          catalog, windowStartMs, clampedEndMs, bin.target, evaluatedRegion, results.quakeId
        ).length;
        const ciLow = Math.round(qpois(0.025, expected));
        const ciHigh = Math.round(qpois(0.975, expected));
        rows.push({
          duration: forecast.duration,
          binKey,
          binLabel: bin.label,
          status,
          evaluatedDays,
          scores: evaluateBin(observed, expected, ciLow, ciHigh),
        });
      }
    }
    return { rows, windowStartMs, nowMs };
  }, [results, bins, catalog, evaluatedRegion, catalogFor]);

  const warnings = useMemo(() => {
    if (!results || !magVals) return [];
    const list: string[] = [];
    if (catalog && catalog.length >= CATALOG_TRUNCATION_WARNING_COUNT) {
      list.push(`The catalogue returned ${catalog.length} events, which may indicate the query hit a server limit, so counts could be incomplete. Consider a higher magnitude threshold or shorter windows.`);
    }
    if (magVals.m3 < 3) {
      list.push(`The lowest threshold (M${magVals.m3}) is near or below the typical GeoNet completeness magnitude; observed counts may under-report small events, especially in the hours after a large mainshock (short-term incompleteness).`);
    }
    if (evaluation?.rows.some(r => r.status === 'partial')) {
      list.push('Some windows are still in progress; they are evaluated over the elapsed portion only, with the expected count scaled accordingly.');
    }
    list.push('GeoNet magnitudes are a mix of magnitude types (mostly local magnitude), whereas the forecast assumes a consistent scale; small systematic differences are possible.');
    return list;
  }, [results, magVals, catalog, evaluation]);

  // ---- Chart 1: observed vs expected per window, selected bin ----
  const obsVsExpOptions = useMemo((): EChartsCoreOption | null => {
    if (!evaluation || !bins) return null;
    const rows = evaluation.rows.filter(r => r.binKey === selectedBin && r.scores);
    if (rows.length === 0) return null;
    return {
      backgroundColor: 'transparent',
      title: {
        text: `Observed vs Expected: ${bins[selectedBin].label}`,
        subtext: 'Tooltip shows the 95% Poisson range for each window',
        textStyle: { fontSize: 15, fontWeight: 'bold', color: AXIS_LABEL_COLOR },
        subtextStyle: { color: AXIS_LABEL_COLOR },
        left: 'center',
      },
      grid: { top: 80, bottom: 70, left: 65, right: 25 },
      legend: { bottom: 0, textStyle: { color: AXIS_LABEL_COLOR } },
      xAxis: {
        type: 'category',
        data: rows.map(r => `${r.duration} ${r.duration === 1 ? 'day' : 'days'}${r.status === 'partial' ? '*' : ''}`),
        axisLabel: { color: AXIS_LABEL_COLOR },
      },
      yAxis: {
        type: 'value',
        min: 0,
        name: 'Event count',
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { color: AXIS_LABEL_COLOR },
        axisLabel: { color: AXIS_LABEL_COLOR },
        splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: Array<{ name: string; seriesName?: string; marker?: string; value: number; dataIndex: number }>) => {
          const row = rows[params[0].dataIndex];
          const s = row.scores!;
          return `${params[0].name}<br/>` +
            params.map(p => `${p.marker ?? ''}${p.seriesName}: <b>${formatValue(Number(p.value))}</b>`).join('<br/>') +
            `<br/>95% range: <b>${s.ciLow}–${s.ciHigh}</b>` +
            (row.status === 'partial' ? `<br/><i>window in progress (${row.evaluatedDays.toFixed(1)} of ${row.duration} days)</i>` : '');
        },
      },
      series: [
        { name: 'Expected (model)', type: 'bar', data: rows.map(r => Number(r.scores!.expected.toFixed(3))), itemStyle: { color: MODEL_COLOR, borderRadius: [4, 4, 0, 0] } },
        { name: 'Observed (GeoNet)', type: 'bar', data: rows.map(r => r.scores!.observed), itemStyle: { color: OBSERVED_COLOR, borderRadius: [4, 4, 0, 0] } },
      ],
    };
  }, [evaluation, bins, selectedBin]);

  // ---- Chart 2: cumulative observed vs model expectation over time ----
  const cumulativeOptions = useMemo((): EChartsCoreOption | null => {
    if (!results || !bins || !catalog || !evaluatedRegion || !evaluation) return null;
    const bin = bins[selectedBin];
    const t0 = results.rangeStartDays;
    const { windowStartMs, nowMs } = evaluation;
    const maxDur = Math.max(...results.forecasts.map(f => f.duration));
    const elapsedDays = Math.min(maxDur, (nowMs - windowStartMs) / MS_PER_DAY);
    if (elapsedDays <= 0) return null;

    // Model expectation N(t)
    const STEPS = 80;
    const modelData: Array<[number, number]> = Array.from({ length: STEPS }, (_, i) => {
      const t = (elapsedDays * (i + 1)) / STEPS;
      return [t, expectedCountForBin(results.modelParams, results.mainshockMagnitude, bin.target, t0, t0 + t)];
    });

    // Observed cumulative step function
    const matches = countMatches(
      catalog, windowStartMs, windowStartMs + elapsedDays * MS_PER_DAY, bin.target, evaluatedRegion, results.quakeId
    );
    const observedData: Array<[number, number]> = [[0, 0]];
    matches.forEach((e, i) => {
      observedData.push([(e.timeMs - windowStartMs) / MS_PER_DAY, i + 1]);
    });
    observedData.push([elapsedDays, matches.length]);

    return {
      backgroundColor: 'transparent',
      title: {
        text: `Cumulative Events Over Time: ${bin.label}`,
        subtext: 'Observed events (step) against the model expectation N(t)',
        textStyle: { fontSize: 15, fontWeight: 'bold', color: AXIS_LABEL_COLOR },
        subtextStyle: { color: AXIS_LABEL_COLOR },
        left: 'center',
      },
      grid: { top: 80, bottom: 70, left: 65, right: 25 },
      legend: { bottom: 0, textStyle: { color: AXIS_LABEL_COLOR } },
      xAxis: {
        type: 'value',
        min: 0,
        max: Number(elapsedDays.toFixed(2)),
        name: 'Days from forecast start',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { color: AXIS_LABEL_COLOR },
        axisLabel: { color: AXIS_LABEL_COLOR },
        splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        name: 'Cumulative count',
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { color: AXIS_LABEL_COLOR },
        axisLabel: { color: AXIS_LABEL_COLOR },
        splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: Array<{ seriesName?: string; marker?: string; value: [number, number] }>) =>
          `Day ${Number(params[0].value[0]).toFixed(1)}<br/>` +
          params.map(p => `${p.marker ?? ''}${p.seriesName}: <b>${formatValue(Number(p.value[1]))}</b>`).join('<br/>'),
      },
      series: [
        { name: 'Expected (model)', type: 'line', data: modelData, showSymbol: false, lineStyle: { width: 2, color: MODEL_COLOR, type: 'dashed' }, itemStyle: { color: MODEL_COLOR } },
        { name: 'Observed (GeoNet)', type: 'line', step: 'end', data: observedData, showSymbol: false, lineStyle: { width: 2, color: OBSERVED_COLOR }, itemStyle: { color: OBSERVED_COLOR } },
      ],
    };
  }, [results, bins, catalog, evaluatedRegion, evaluation, selectedBin]);

  // Export the complete evaluation as CSV
  const handleExportCsv = useCallback(() => {
    if (!results || !evaluation || !evaluatedRegion || !catalog) return;
    const mp = results.modelParams;
    const lines = [
      `# Aftershock Forecast Evaluation for ${results.quakeId}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Model: ${modelName} (a=${mp.a}, b=${mp.b}, c=${mp.c}, p=${mp.p}); mainshock M${results.mainshockMagnitude}`,
      `# Region: ${evaluatedRegion.type}, radius ${evaluatedRegion.radiusKm.toFixed(1)} km, area ${Math.round(regionAreaKm2(evaluatedRegion))} km2, centre ${evaluatedRegion.latitude.toFixed(3)}, ${evaluatedRegion.longitude.toFixed(3)} (Wells & Coppersmith 1994, k=${multiplier})`,
      `# Catalogue: ${catalog.length} events from GeoNet QuakeSearch; mainshock excluded`,
      '',
      'Window (days),Status,Evaluated days,Bin,Observed,Expected,CI low,CI high,Within CI,P(>=1),Occurred,Brier,Log score,Poisson logL,N-test verdict,P(X<=n),P(X>=n)',
      ...evaluation.rows.map(r => {
        const s = r.scores;
        if (!s) return `${r.duration},future,0,${r.binLabel},,,,,,,,,,,,,`;
        return [
          r.duration, r.status, r.evaluatedDays.toFixed(2), r.binLabel,
          s.observed, s.expected.toPrecision(4), s.ciLow, s.ciHigh, s.withinCi,
          s.probability.toPrecision(4), s.occurred, s.brier.toPrecision(4),
          s.logScoreBinary.toPrecision(4), s.poissonLL.toPrecision(4),
          s.verdict, s.nTestPAtMost.toPrecision(4), s.nTestPAtLeast.toPrecision(4),
        ].join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `evaluation-${results.quakeId}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [results, evaluation, evaluatedRegion, catalog, modelName, multiplier]);

  if (!results || !bins || !magVals) {
    return (
      <div className="mt-6 p-8 text-center text-gray-500 dark:text-gray-400">
        <p>Calculate a forecast to evaluate it against observed seismicity</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6" role="region" aria-label="Forecast evaluation">
      <div className="print:hidden">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Forecast Evaluation</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Tests the {modelName} forecast for event {results.quakeId} against the observed GeoNet catalogue
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm print:hidden">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
          Spatial Evaluation Region
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="eval-region-type" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Region shape
            </label>
            <select
              id="eval-region-type"
              value={regionType}
              onChange={(e) => setRegionType(e.target.value as RegionType)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="circle">Circle (radius r)</option>
              <option value="square">Square (equal area)</option>
            </select>
          </div>
          <div>
            <label htmlFor="eval-multiplier" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Radius = <em>k</em> × rupture length
            </label>
            <select
              id="eval-multiplier"
              value={multiplier}
              onChange={(e) => setMultiplier(parseFloat(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0.5}>k = 0.5</option>
              <option value={1}>k = 1 (default)</option>
              <option value={2}>k = 2</option>
              <option value={3}>k = 3</option>
            </select>
          </div>
          <div>
            <label htmlFor="eval-lat" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Epicentre latitude
            </label>
            <input
              id="eval-lat"
              type="number"
              step="0.01"
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              placeholder="-42.69"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="eval-lon" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Epicentre longitude
            </label>
            <input
              id="eval-lon"
              type="number"
              step="0.01"
              value={lonInput}
              onChange={(e) => setLonInput(e.target.value)}
              placeholder="173.02"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Wells &amp; Coppersmith (1994) subsurface rupture length for M{results.mainshockMagnitude.toFixed(1)}:{' '}
          <strong>{wellsCoppersmithLengthKm(results.mainshockMagnitude).toFixed(1)} km</strong>
          {' '}→ evaluation radius <strong>{radiusKm.toFixed(1)} km</strong>,
          {' '}area <strong>{Math.round(regionAreaKm2({ type: regionType, latitude: 0, longitude: 0, radiusKm })).toLocaleString('en-NZ')} km²</strong>
          {' '}({regionType === 'circle' ? 'circular region' : 'equal-area square'}; minimum radius 10 km).
        </p>
        <button
          onClick={runEvaluation}
          disabled={isEvaluating}
          className="mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md
                     hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-busy={isEvaluating}
        >
          {isEvaluating ? 'Fetching observed catalogue…' : 'Fetch observations & evaluate'}
        </button>
        {evalError && (
          <div role="alert" className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-red-600 dark:text-red-400 text-sm">⚠️ {evalError}</p>
          </div>
        )}
      </div>

      {evaluation && catalog && (
        <>
          {/* Print-only report header (used by the PDF export via the browser's print pipeline) */}
          {evaluatedRegion && (
            <div className="hidden print:block print-header">
              <h1>Aftershock Forecast Evaluation Report</h1>
              <div className="metadata">
                <span><strong>Event ID:</strong> {results.quakeId} (M{results.mainshockMagnitude.toFixed(1)})</span>
                <span><strong>Model:</strong> {modelName}: <em>a</em>={results.modelParams.a}, <em>b</em>={results.modelParams.b}, <em>c</em>={results.modelParams.c}, <em>p</em>={results.modelParams.p}</span>
                <span>
                  <strong>Region:</strong> {evaluatedRegion.type === 'circle' ? 'circle' : 'equal-area square'},
                  radius {evaluatedRegion.radiusKm.toFixed(1)} km,
                  area {Math.round(regionAreaKm2(evaluatedRegion)).toLocaleString('en-NZ')} km²,
                  centre {evaluatedRegion.latitude.toFixed(3)}, {evaluatedRegion.longitude.toFixed(3)} (W&amp;C 1994, k={multiplier})
                </span>
                <span><strong>Catalogue:</strong> {catalog.length} GeoNet events; mainshock excluded</span>
                <span><strong>Generated:</strong> {new Date().toLocaleString('en-NZ', { dateStyle: 'long', timeStyle: 'short' })}</span>
              </div>
            </div>
          )}

          {/* Summary table */}
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm eval-print-card">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
              Evaluation Summary
              <span className="ml-2 font-normal normal-case text-gray-500 dark:text-gray-400">
                ({catalog.length} catalogue events retrieved; mainshock excluded)
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse print-eval-table">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <th scope="col" className="px-3 py-2 text-left">Window</th>
                    <th scope="col" className="px-3 py-2 text-left">Bin</th>
                    <th scope="col" className="px-3 py-2 text-center">Observed</th>
                    <th scope="col" className="px-3 py-2 text-center">Expected</th>
                    <th scope="col" className="px-3 py-2 text-center">95% range</th>
                    <th scope="col" className="px-3 py-2 text-center">P(≥1)</th>
                    <th scope="col" className="px-3 py-2 text-center">
                      <span className="flex items-center justify-center gap-1">
                        Brier
                        <span className="normal-case print:hidden"><InfoTooltip content={SCORE_TOOLTIPS.brier} /></span>
                      </span>
                    </th>
                    <th scope="col" className="px-3 py-2 text-center">
                      <span className="flex items-center justify-center gap-1">
                        Log score
                        <span className="normal-case print:hidden"><InfoTooltip content={SCORE_TOOLTIPS.logScore} /></span>
                      </span>
                    </th>
                    <th scope="col" className="px-3 py-2 text-center">
                      <span className="flex items-center justify-center gap-1">
                        N-test
                        <span className="normal-case print:hidden"><InfoTooltip content={SCORE_TOOLTIPS.nTest} /></span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {evaluation.rows.map((row, i) => (
                    <tr key={i} className="text-gray-700 dark:text-gray-300">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.duration} {row.duration === 1 ? 'day' : 'days'}
                        {row.status === 'partial' && (
                          <span className="ml-1 text-xs text-amber-600 dark:text-amber-400" title={`Evaluated over the elapsed ${row.evaluatedDays.toFixed(1)} days`}>
                            (in progress)
                          </span>
                        )}
                        {row.status === 'future' && (
                          <span className="ml-1 text-xs text-gray-400">(future)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">{row.binLabel}</td>
                      {row.scores ? (
                        <>
                          <td className="px-3 py-2 text-center font-mono">{row.scores.observed}</td>
                          <td className="px-3 py-2 text-center font-mono">{formatValue(row.scores.expected)}</td>
                          <td className="px-3 py-2 text-center font-mono">
                            <span className={row.scores.withinCi ? '' : 'text-red-600 dark:text-red-400 font-semibold'}>
                              {row.scores.ciLow}–{row.scores.ciHigh}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center font-mono">
                            {row.scores.probability < 0.01 ? '<1%' : row.scores.probability > 0.99 ? '>99%' : `${Math.round(row.scores.probability * 100)}%`}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">{formatScore(row.scores.brier)}</td>
                          <td className="px-3 py-2 text-center font-mono">{formatScore(row.scores.logScoreBinary)}</td>
                          <td className="px-3 py-2 text-center">
                            {row.scores.verdict === 'consistent' ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400">consistent</span>
                            ) : (
                              <span
                                className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400"
                                title={`P(X ≤ n) = ${row.scores.nTestPAtMost.toExponential(2)}, P(X ≥ n) = ${row.scores.nTestPAtLeast.toExponential(2)}`}
                              >
                                {row.scores.verdict}
                              </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={7} className="px-3 py-2 text-center text-gray-400">not yet observable</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              N-test: two-sided Poisson consistency at 5% (Zechar 2010). Brier and log scores refer to the binary
              &ldquo;one or more events&rdquo; forecast; lower is better. Windows in progress are scored over the elapsed
              time only, with the expected count computed for the same elapsed period.
            </p>
            {/* Export actions */}
            <div className="mt-4 flex gap-2 flex-wrap print:hidden">
              <button
                onClick={handleExportPdf}
                className="px-4 py-2 bg-gray-500 text-white text-sm rounded-md hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
                aria-label="Export the evaluation report as PDF via the print dialog"
                title="Opens the print dialog; choose 'Save as PDF' as the destination"
              >
                🖨️ Export PDF report
              </button>
              <button
                onClick={handleExportCsv}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
                aria-label="Export the full evaluation as CSV"
              >
                📥 Export CSV
              </button>
            </div>
          </div>

          {/* Map of the evaluation region and observed events */}
          {evaluatedRegion && (
            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm eval-print-card">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Evaluation Region &amp; Observed Events
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {evaluatedRegion.type === 'circle' ? 'Circular' : 'Equal-area square'} region, radius{' '}
                {evaluatedRegion.radiusKm.toFixed(1)} km, area{' '}
                {Math.round(regionAreaKm2(evaluatedRegion)).toLocaleString('en-NZ')} km². Grey events fall inside
                the catalogue search box but outside the region, and are excluded from all counts.
              </p>
              <EvaluationMap
                region={evaluatedRegion}
                events={catalog}
                mainshock={{
                  latitude: evaluatedRegion.latitude,
                  longitude: evaluatedRegion.longitude,
                  magnitude: results.mainshockMagnitude,
                  quakeId: results.quakeId,
                }}
                thresholds={magVals}
              />
            </div>
          )}

          {/* Charts with bin selector */}
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm eval-print-card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Diagnostic Plots</h3>
              <div className="print:hidden">
                <label htmlFor="eval-bin" className="mr-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Magnitude bin
                </label>
                <select
                  id="eval-bin"
                  value={selectedBin}
                  onChange={(e) => setSelectedBin(e.target.value as BinKey)}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="m3">{bins.m3.label}</option>
                  <option value="m2">{bins.m2.label}</option>
                  <option value="m1">{bins.m1.label}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 eval-charts-grid">
              {obsVsExpOptions && (
                <ReactEChartsCore echarts={echarts} option={obsVsExpOptions} notMerge style={printMode ? { height: 280, width: 430 } : { height: 340, width: '100%' }} />
              )}
              {cumulativeOptions && (
                <ReactEChartsCore echarts={echarts} option={cumulativeOptions} notMerge style={printMode ? { height: 280, width: 430 } : { height: 340, width: '100%' }} />
              )}
            </div>
          </div>
        </>
      )}

      {/* Assumptions & caveats */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 eval-print-card">
        <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Assumptions &amp; Caveats</h3>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>Spatial scaling: Wells &amp; Coppersmith (1994) subsurface rupture length, log₁₀L = −2.44 + 0.59M (all slip types), radius = k × L, floored at 10 km.</li>
          <li>Observed data: GeoNet QuakeSearch, earthquakes only; the mainshock is excluded from all counts.</li>
          <li>Counts are assumed Poisson; confidence ranges and N-test quantiles ignore model-parameter uncertainty.</li>
          <li>The square region is the equal-area square of the circular region, centred on the epicentre.</li>
          {warnings.map((w, i) => (
            <li key={i} className="text-amber-700 dark:text-amber-400">{w}</li>
          ))}
        </ul>
      </div>

      {/* Print-only report footer */}
      {evaluation && catalog && (
        <div className="hidden print:block print-footer">
          <p>
            Generated by the Aftershock Calculator • Earth Sciences New Zealand (ESNZ) •
            Forecast model: Reasenberg&ndash;Jones • Observed data: GeoNet QuakeSearch •
            Basemap: &copy; OpenStreetMap contributors, &copy; CARTO
          </p>
        </div>
      )}
    </div>
  );
}
