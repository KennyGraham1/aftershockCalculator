'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import type { CalculationResults } from '@/types';
import { qpois, calculateOmoriIntegral, calculateExpectedAftershocks } from '@/lib/calculations';

// Register only the ECharts modules we use (keeps the bundle small)
echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  CanvasRenderer,
]);

// Magnitude bins are ordered severity classes, so they are encoded with an
// ordinal single-hue ramp (light -> dark = low -> high magnitude) rather than
// unrelated hues. Both ramps are validated for colour-vision-deficiency
// separation and surface contrast in their respective modes.
const LIGHT_RAMP = { m1: '#7f1d1d', m2: '#dc2626', m3: '#f87171' } as const;
const DARK_RAMP = { m1: '#991b1b', m2: '#ef4444', m3: '#fca5a5' } as const;

const AXIS_LABEL_COLOR = '#6b7280'; // mid-gray, readable in light and dark mode
const GRID_LINE_COLOR = '#9ca3af40';

const SAVE_AS_IMAGE_TOOLBOX = {
  feature: {
    saveAsImage: { title: 'Save as image' },
  },
  iconStyle: { borderColor: AXIS_LABEL_COLOR },
} as const;

/** Subscribe to the OS colour-scheme so chart ramps match the page theme */
function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false
  );
}

/** Shared value-axis settings for percentage (0-100%) axes */
function percentAxis(name: string) {
  return {
    type: 'value' as const,
    min: 0,
    max: 100,
    name,
    nameLocation: 'middle' as const,
    nameGap: 40,
    nameTextStyle: { color: AXIS_LABEL_COLOR },
    axisLabel: { formatter: '{value}%', color: AXIS_LABEL_COLOR },
    splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
  };
}

/** Shared linear count axis */
function countAxis(name: string) {
  return {
    type: 'value' as const,
    min: 0,
    name,
    nameLocation: 'middle' as const,
    nameGap: 45,
    nameTextStyle: { color: AXIS_LABEL_COLOR },
    axisLabel: { color: AXIS_LABEL_COLOR },
    splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
  };
}

/** Shared category-axis settings */
function categoryAxis(categories: string[], name?: string) {
  return {
    type: 'category' as const,
    data: categories,
    name,
    nameLocation: 'middle' as const,
    nameGap: 30,
    nameTextStyle: { color: AXIS_LABEL_COLOR },
    axisLabel: { color: AXIS_LABEL_COLOR },
  };
}

/** Shared numeric time axis (days) */
function dayAxis(name: string, max?: number) {
  return {
    type: 'value' as const,
    min: 0,
    max,
    name,
    nameLocation: 'middle' as const,
    nameGap: 30,
    nameTextStyle: { color: AXIS_LABEL_COLOR },
    axisLabel: { color: AXIS_LABEL_COLOR },
    splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
  };
}

const CHART_TITLE_STYLE = {
  textStyle: { fontSize: 15, fontWeight: 'bold' as const, color: AXIS_LABEL_COLOR },
  subtextStyle: { color: AXIS_LABEL_COLOR },
  left: 'center' as const,
};

/** Minimal shape of ECharts axis-tooltip callback params we rely on */
interface TooltipParam {
  seriesName?: string;
  marker?: string;
  name?: string;
  dataIndex?: number;
  value: number | [number, number];
}

/** Format an expected count with appropriate precision (never shows a
 *  misleading "0.0" for small but non-zero expectations) */
function formatCount(v: number): string {
  if (!Number.isFinite(v)) return '–';
  if (v >= 100) return v.toFixed(0);
  if (v >= 0.095) return v.toFixed(1);
  return v.toPrecision(1);
}

function pairY(p: TooltipParam): number {
  return Array.isArray(p.value) ? p.value[1] : Number(p.value);
}

function pairX(p: TooltipParam): number {
  return Array.isArray(p.value) ? p.value[0] : NaN;
}

interface VisualizationTabProps {
  results: CalculationResults | null;
  modelName?: string;
}

// Helper to parse percentage string to number
function parsePercentage(str: string): number {
  const match = str.match(/([0-9.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

// Helper to parse average number string to number
function parseAverage(str: string): number {
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Helper to extract magnitude value from label string (e.g. "M5+" -> 5, "M4-M5" -> 4)
function getMagValue(label: string): number {
  const match = label.match(/M([0-9.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

// Helper to compute factorial
function factorial(n: number): number {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

// Helper to compute Poisson probability distribution
function calculatePoissonDistribution(lambda: number): Array<{ name: string; y: number }> {
  if (lambda <= 0) {
    return [
      { name: '0', y: 100 },
      { name: '1', y: 0 },
      { name: '2', y: 0 },
      { name: '3', y: 0 },
      { name: '4', y: 0 },
      { name: '5+', y: 0 },
    ];
  }
  if (lambda > 50) {
    return [
      { name: '0', y: 0 },
      { name: '1', y: 0 },
      { name: '2', y: 0 },
      { name: '3', y: 0 },
      { name: '4', y: 0 },
      { name: '5+', y: 100 },
    ];
  }

  const distribution = [];
  let sum = 0;
  for (let k = 0; k <= 4; k++) {
    const p = (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
    const percentage = p * 100;
    distribution.push({
      name: k.toString(),
      y: Number(percentage.toFixed(1)),
    });
    sum += percentage;
  }
  const pGe5 = Math.max(0, 100 - sum);
  distribution.push({
    name: '5+',
    y: Number(pGe5.toFixed(1)),
  });

  return distribution;
}

export default function VisualizationTab({ results, modelName = 'NZ Generic' }: VisualizationTabProps) {
  const prefersDark = usePrefersDark();
  const RAMP = prefersDark ? DARK_RAMP : LIGHT_RAMP;

  // Tab state: 'overview' (USGS Style) or 'charts' (Detailed analysis)
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'charts'>('overview');

  // Selected duration for the USGS Overview
  const availableDurations = useMemo(() => {
    if (!results) return [];
    return results.forecasts.map(f => f.duration);
  }, [results]);

  const [selectedDuration, setSelectedDuration] = useState<number>(30);

  // Derive the duration actually shown: fall back to 30 days if available,
  // otherwise the longest duration (avoids syncing state in an effect)
  const effectiveDuration = useMemo(() => {
    if (availableDurations.length === 0) return selectedDuration;
    if (availableDurations.includes(selectedDuration)) return selectedDuration;
    return availableDurations.includes(30)
      ? 30
      : availableDurations[availableDurations.length - 1];
  }, [availableDurations, selectedDuration]);

  // Selected magnitude threshold key ('m1', 'm2', 'm3') for Forecast Overview
  const [selectedMagKey, setSelectedMagKey] = useState<'m1' | 'm2' | 'm3'>('m1');

  // Extract magnitude threshold values dynamically
  const magVals = useMemo(() => {
    if (!results) return { m1: 5, m2: 4, m3: 3 };
    return {
      m1: getMagValue(results.rangeLabels.range1),
      m2: getMagValue(results.rangeLabels.range2),
      m3: getMagValue(results.rangeLabels.range3),
    };
  }, [results]);

  // Exact expected counts N(>= M) for the selected window, evaluated from the
  // model itself rather than by summing the rounded table values
  const exactLambdas = useMemo(() => {
    if (!results) return null;
    const { modelParams: mp, mainshockMagnitude: Mm, rangeStartDays: t0 } = results;
    const N = (m: number) =>
      calculateExpectedAftershocks(
        mp.a, mp.b, Mm, m,
        calculateOmoriIntegral(t0, t0 + effectiveDuration, mp.c, mp.p)
      );
    return { m1: N(magVals.m1), m2: N(magVals.m2), m3: N(magVals.m3) };
  }, [results, effectiveDuration, magVals]);

  // Compute selected threshold OAF statistics
  const selectedOafData = useMemo(() => {
    if (!results || !exactLambdas) return null;

    const lambda = exactLambdas[selectedMagKey];
    const magThreshold = magVals[selectedMagKey];
    const low = qpois(0.025, lambda);
    const high = qpois(0.975, lambda);

    return {
      lambda,
      magThreshold,
      label: `M${magThreshold.toFixed(1)}+`,
      probability: 100 * (1 - Math.exp(-lambda)),
      range: `${Math.round(low)}-${Math.round(high)}`,
    };
  }, [results, exactLambdas, selectedMagKey, magVals]);

  // Compute list of all magnitudes for the selected duration
  const summaryList = useMemo(() => {
    if (!results || !exactLambdas) return [];

    return (['m3', 'm2', 'm1'] as const).map((key) => {
      const lambda = exactLambdas[key];
      return {
        key,
        label: `M${magVals[key].toFixed(1)}+`,
        probability: 100 * (1 - Math.exp(-lambda)),
        avg: lambda,
        range: `${Math.round(qpois(0.025, lambda))}-${Math.round(qpois(0.975, lambda))}`,
      };
    });
  }, [results, exactLambdas, magVals]);

  // Prepare per-bin data mirroring the results table (charts 1-2)
  const chartData = useMemo(() => {
    if (!results) return null;

    const durations = results.forecasts.map(f => `${f.duration} ${f.duration === 1 ? 'day' : 'days'}`);

    const probM1 = results.forecasts.map(f => parsePercentage(f.m1.probability));
    const probM2 = results.forecasts.map(f => parsePercentage(f.m2.probability));
    const probM3 = results.forecasts.map(f => parsePercentage(f.m3.probability));

    const avgM1 = results.forecasts.map(f => parseAverage(f.m1.averageNumber));
    const avgM2 = results.forecasts.map(f => parseAverage(f.m2.averageNumber));
    const avgM3 = results.forecasts.map(f => parseAverage(f.m3.averageNumber));

    return { durations, probM1, probM2, probM3, avgM1, avgM2, avgM3, rangeLabels: results.rangeLabels };
  }, [results]);

  // Continuous model curves (charts 3-6): evaluated from the fitted model so
  // the plots show the actual Omori decay / Gutenberg-Richter structure
  const modelCurves = useMemo(() => {
    if (!results) return null;
    const { modelParams: mp, mainshockMagnitude: Mm, rangeStartDays: t0 } = results;
    const maxDur = Math.max(...results.forecasts.map(f => f.duration));
    const thresholds = [
      { key: 'm1' as const, m: magVals.m1 },
      { key: 'm2' as const, m: magVals.m2 },
      { key: 'm3' as const, m: magVals.m3 },
    ];

    const N = (m: number, ts: number, te: number) =>
      calculateExpectedAftershocks(mp.a, mp.b, Mm, m, calculateOmoriIntegral(ts, te, mp.c, mp.p));
    const rate = (m: number, tau: number) =>
      Math.pow(10, mp.a + mp.b * (Mm - (m - 0.05))) * Math.pow(tau + mp.c, -mp.p);

    const STEPS = 60;

    // P(>=1) as a function of elapsed forecast duration
    const probVsTime = thresholds.map(({ key, m }) => ({
      key,
      label: `M${m}+`,
      data: Array.from({ length: STEPS }, (_, i) => {
        const t = (maxDur * (i + 1)) / STEPS;
        return [t, 100 * (1 - Math.exp(-N(m, t0, t0 + t)))] as [number, number];
      }),
    }));

    // Daily aftershock rate vs time since mainshock (log-log), covering the
    // full decay history so the forecast window's position is visible
    const tauMin = Math.max(0.01, mp.c);
    // Keep at least one decade of x-range even if a large custom c-value
    // exceeds the forecast horizon (otherwise the log sampling runs backwards)
    const tauMax = Math.max(t0 + maxDur, tauMin * 10);
    const rateVsTime = thresholds.map(({ key, m }) => ({
      key,
      label: `M${m}+`,
      data: Array.from({ length: STEPS + 1 }, (_, i) => {
        const tau = tauMin * Math.pow(tauMax / tauMin, i / STEPS);
        return [tau, rate(m, tau)] as [number, number];
      }),
    }));

    // Cumulative expected count within the forecast window, per magnitude bin
    const binDefs = [
      { key: 'm3' as const, label: results.rangeLabels.range3, lo: magVals.m3, hi: magVals.m2 },
      { key: 'm2' as const, label: results.rangeLabels.range2, lo: magVals.m2, hi: magVals.m1 },
      { key: 'm1' as const, label: results.rangeLabels.range1, lo: magVals.m1, hi: null },
    ];
    const cumulative = binDefs.map(({ key, label, lo, hi }) => ({
      key,
      label,
      data: Array.from({ length: STEPS }, (_, i) => {
        const t = (maxDur * (i + 1)) / STEPS;
        const n = N(lo, t0, t0 + t) - (hi !== null ? N(hi, t0, t0 + t) : 0);
        return [t, n] as [number, number];
      }),
    }));

    // Magnitude-frequency (Gutenberg-Richter) relation over the longest window
    const mMax = Math.max(Mm, magVals.m1 + 0.5);
    const grCurve: Array<[number, number]> = [];
    for (let i = 0; i <= 40; i++) {
      const m = magVals.m3 + ((mMax - magVals.m3) * i) / 40;
      const n = N(m, t0, t0 + maxDur);
      if (n > 1e-9) grCurve.push([m, n]);
    }
    const grThresholdPoints = thresholds.map(({ key, m }) => ({
      key,
      value: [m, N(m, t0, t0 + maxDur)] as [number, number],
    }));

    return { maxDur, t0, tauMin, tauMax, probVsTime, rateVsTime, cumulative, grCurve, grThresholdPoints };
  }, [results, magVals]);

  if (!results || !chartData || !selectedOafData || !modelCurves) {
    return (
      <div className="mt-6 p-8 text-center text-gray-500 dark:text-gray-400">
        <p>Calculate a forecast to see visualizations</p>
      </div>
    );
  }

  // ---- Overview: Poisson outcome distribution ----
  // The headline metric is P(>=1 event), so the zero-outcome bar is omitted:
  // the bars shown sum to the reported probability of one or more events.
  const poissonData = calculatePoissonDistribution(selectedOafData.lambda).slice(1);
  const selectedProb = selectedOafData.probability;
  const isHighProb = selectedProb >= 75;
  const isMidProb = selectedProb >= 25 && selectedProb < 75;
  const themeColor = isHighProb
    ? (prefersDark ? '#ef4444' : '#dc2626')
    : isMidProb
      ? (prefersDark ? '#fbbf24' : '#d97706')
      : (prefersDark ? '#60a5fa' : '#2563eb');

  const likelyNumberOptions: EChartsCoreOption = {
    backgroundColor: 'transparent',
    title: {
      ...CHART_TITLE_STYLE,
      text: `Likely Number of ${selectedOafData.label} Aftershocks`,
      subtext: `Within ${effectiveDuration} ${effectiveDuration === 1 ? 'day' : 'days'}; the bars sum to the reported ${selectedProb < 1 ? '<1' : selectedProb > 99 ? '>99' : Math.round(selectedProb)}% probability of one or more events`,
    },
    grid: { top: 85, bottom: 55, left: 65, right: 25 },
    xAxis: categoryAxis(poissonData.map(d => d.name), 'Number of Aftershocks'),
    yAxis: { ...percentAxis('Probability (%)'), max: undefined },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: TooltipParam[]) => {
        const pt = params[0];
        const label = pt.name === '1' ? 'Exactly 1 aftershock' : pt.name === '5+' ? '5 or more aftershocks' : `Exactly ${pt.name} aftershocks`;
        return `${label} within ${effectiveDuration} ${effectiveDuration === 1 ? 'day' : 'days'}<br/>Probability: <b>${pairY(pt).toFixed(1)}%</b>`;
      },
    },
    series: [
      {
        name: 'Probability',
        type: 'bar',
        data: poissonData.map(d => d.y),
        itemStyle: { color: themeColor, borderRadius: [4, 4, 0, 0] },
        label: {
          show: true,
          position: 'top',
          formatter: (params: { value: number }) => `${params.value.toFixed(1)}%`,
          fontSize: 11,
          fontWeight: 'bold',
          color: AXIS_LABEL_COLOR,
        },
      },
    ],
  };

  // ---- Detailed chart 1: probability of >=1 event per bin and window ----
  const probabilityBarOptions: EChartsCoreOption = {
    backgroundColor: 'transparent',
    title: {
      ...CHART_TITLE_STYLE,
      text: 'Probability of One or More Aftershocks',
      subtext: `Per magnitude bin and forecast window (model: ${modelName})`,
    },
    grid: { top: 80, bottom: 80, left: 65, right: 25 },
    legend: { bottom: 0, textStyle: { color: AXIS_LABEL_COLOR } },
    toolbox: SAVE_AS_IMAGE_TOOLBOX,
    xAxis: categoryAxis(chartData.durations, 'Forecast Window'),
    yAxis: percentAxis('Probability (%)'),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      // Quote the table's exact probability strings (e.g. "<1%", ">99%") so
      // the chart can never disagree with the reported values
      formatter: (params: TooltipParam[]) =>
        `${params[0].name}<br/>` +
        params.map(p => {
          const bin = p.seriesName === results.rangeLabels.range1 ? 'm1' : p.seriesName === results.rangeLabels.range2 ? 'm2' : 'm3';
          const exact = p.dataIndex !== undefined ? results.forecasts[p.dataIndex][bin].probability : `${pairY(p).toFixed(0)}%`;
          return `${p.marker ?? ''}${p.seriesName}: <b>${exact}</b>`;
        }).join('<br/>'),
    },
    series: [
      { name: chartData.rangeLabels.range1, type: 'bar', data: chartData.probM1, itemStyle: { color: RAMP.m1, borderRadius: [4, 4, 0, 0] } },
      { name: chartData.rangeLabels.range2, type: 'bar', data: chartData.probM2, itemStyle: { color: RAMP.m2, borderRadius: [4, 4, 0, 0] } },
      { name: chartData.rangeLabels.range3, type: 'bar', data: chartData.probM3, itemStyle: { color: RAMP.m3, borderRadius: [4, 4, 0, 0] } },
    ],
  };

  // ---- Detailed chart 2: expected counts per bin and window ----
  const expectedBarOptions: EChartsCoreOption = {
    backgroundColor: 'transparent',
    title: {
      ...CHART_TITLE_STYLE,
      text: 'Expected Number of Aftershocks',
      subtext: `Per magnitude bin and forecast window (model: ${modelName})`,
    },
    grid: { top: 80, bottom: 80, left: 65, right: 25 },
    legend: { bottom: 0, textStyle: { color: AXIS_LABEL_COLOR } },
    toolbox: SAVE_AS_IMAGE_TOOLBOX,
    xAxis: categoryAxis(chartData.durations, 'Forecast Window'),
    yAxis: countAxis('Expected Count'),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      // Quote the table's exact expected-count strings for consistency
      formatter: (params: TooltipParam[]) =>
        `${params[0].name}<br/>` +
        params.map(p => {
          const bin = p.seriesName === results.rangeLabels.range1 ? 'm1' : p.seriesName === results.rangeLabels.range2 ? 'm2' : 'm3';
          const exact = p.dataIndex !== undefined ? results.forecasts[p.dataIndex][bin].averageNumber : formatCount(pairY(p));
          return `${p.marker ?? ''}${p.seriesName}: <b>${exact}</b> expected`;
        }).join('<br/>'),
    },
    series: [
      { name: chartData.rangeLabels.range1, type: 'bar', data: chartData.avgM1, itemStyle: { color: RAMP.m1, borderRadius: [4, 4, 0, 0] } },
      { name: chartData.rangeLabels.range2, type: 'bar', data: chartData.avgM2, itemStyle: { color: RAMP.m2, borderRadius: [4, 4, 0, 0] } },
      { name: chartData.rangeLabels.range3, type: 'bar', data: chartData.avgM3, itemStyle: { color: RAMP.m3, borderRadius: [4, 4, 0, 0] } },
    ],
  };

  // ---- Detailed chart 3: P(>=1) as a continuous function of duration ----
  const probTimeOptions: EChartsCoreOption = {
    backgroundColor: 'transparent',
    title: {
      ...CHART_TITLE_STYLE,
      text: 'Probability Growth with Forecast Duration',
      subtext: 'P(≥1 event) saturates as the window lengthens, computed continuously from the model',
    },
    grid: { top: 80, bottom: 80, left: 65, right: 25 },
    legend: { bottom: 0, textStyle: { color: AXIS_LABEL_COLOR } },
    toolbox: SAVE_AS_IMAGE_TOOLBOX,
    xAxis: dayAxis('Days from forecast start', modelCurves.maxDur),
    yAxis: percentAxis('Probability of ≥1 event (%)'),
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParam[]) =>
        `Day ${pairX(params[0]).toFixed(1)}<br/>` +
        params.map(p => `${p.marker ?? ''}${p.seriesName}: <b>${pairY(p).toFixed(1)}%</b>`).join('<br/>'),
    },
    series: modelCurves.probVsTime.map(s => ({
      name: s.label,
      type: 'line',
      data: s.data,
      showSymbol: false,
      lineStyle: { width: 2, color: RAMP[s.key] },
      itemStyle: { color: RAMP[s.key] },
    })),
  };

  // ---- Detailed chart 4: Omori rate decay (log-log) ----
  const rateDecayOptions: EChartsCoreOption = {
    backgroundColor: 'transparent',
    title: {
      ...CHART_TITLE_STYLE,
      text: 'Aftershock Rate Decay (Omori–Utsu Law)',
      subtext: 'Daily rate vs time since mainshock, log–log; the shaded band is the forecast window',
    },
    grid: { top: 80, bottom: 80, left: 70, right: 30 },
    legend: { bottom: 0, textStyle: { color: AXIS_LABEL_COLOR } },
    toolbox: SAVE_AS_IMAGE_TOOLBOX,
    xAxis: {
      type: 'log',
      name: 'Days since mainshock (log scale)',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: AXIS_LABEL_COLOR },
      axisLabel: { color: AXIS_LABEL_COLOR },
      splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
    },
    yAxis: {
      type: 'log',
      name: 'Events per day (log scale)',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: { color: AXIS_LABEL_COLOR },
      axisLabel: {
        color: AXIS_LABEL_COLOR,
        formatter: (value: number) => (value >= 1 ? String(value) : value.toExponential(0)),
      },
      splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParam[]) =>
        `Day ${pairX(params[0]).toPrecision(3)} after mainshock<br/>` +
        params.map(p => `${p.marker ?? ''}${p.seriesName}: <b>${pairY(p).toPrecision(3)}</b> events/day`).join('<br/>'),
    },
    series: modelCurves.rateVsTime.map((s, i) => ({
      name: s.label,
      type: 'line',
      data: s.data,
      showSymbol: false,
      lineStyle: { width: 2, color: RAMP[s.key] },
      itemStyle: { color: RAMP[s.key] },
      ...(i === 0
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: 'rgba(107, 114, 128, 0.12)' },
              label: { color: AXIS_LABEL_COLOR, fontSize: 11 },
              data: [[
                { name: 'Forecast window', xAxis: Math.max(modelCurves.t0, modelCurves.tauMin) },
                { xAxis: modelCurves.tauMax },
              ]],
            },
          }
        : {}),
    })),
  };

  // ---- Detailed chart 5: cumulative expected count over the window ----
  const cumulativeOptions: EChartsCoreOption = {
    backgroundColor: 'transparent',
    title: {
      ...CHART_TITLE_STYLE,
      text: 'Cumulative Expected Aftershocks',
      subtext: 'Stacked by magnitude bin; growth slows as the sequence decays',
    },
    grid: { top: 80, bottom: 80, left: 65, right: 25 },
    legend: { bottom: 0, textStyle: { color: AXIS_LABEL_COLOR } },
    toolbox: SAVE_AS_IMAGE_TOOLBOX,
    xAxis: dayAxis('Days from forecast start', modelCurves.maxDur),
    yAxis: countAxis('Cumulative Expected Count'),
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParam[]) =>
        `Day ${pairX(params[0]).toFixed(1)}<br/>` +
        params.map(p => `${p.marker ?? ''}${p.seriesName}: <b>${formatCount(pairY(p))}</b> expected`).join('<br/>'),
    },
    series: modelCurves.cumulative.map(s => ({
      name: s.label,
      type: 'line',
      stack: 'total',
      areaStyle: { opacity: 0.35 },
      showSymbol: false,
      data: s.data,
      lineStyle: { width: 2, color: RAMP[s.key] },
      itemStyle: { color: RAMP[s.key] },
    })),
  };

  // ---- Detailed chart 6: magnitude-frequency (Gutenberg-Richter) relation ----
  const grOptions: EChartsCoreOption = {
    backgroundColor: 'transparent',
    title: {
      ...CHART_TITLE_STYLE,
      text: 'Magnitude–Frequency Relation (Gutenberg–Richter)',
      subtext: `Expected count of events ≥ M in the ${modelCurves.maxDur}-day window; the straight line reflects the b-value`,
    },
    grid: { top: 80, bottom: 80, left: 70, right: 30 },
    legend: { bottom: 0, textStyle: { color: AXIS_LABEL_COLOR } },
    toolbox: SAVE_AS_IMAGE_TOOLBOX,
    xAxis: {
      type: 'value',
      min: magVals.m3,
      name: 'Magnitude threshold M',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: AXIS_LABEL_COLOR },
      axisLabel: { color: AXIS_LABEL_COLOR },
      splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
    },
    yAxis: {
      type: 'log',
      name: 'Expected count ≥ M (log scale)',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: { color: AXIS_LABEL_COLOR },
      axisLabel: {
        color: AXIS_LABEL_COLOR,
        formatter: (value: number) => (value >= 1 ? String(value) : value.toExponential(0)),
      },
      splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParam[]) =>
        `M ≥ ${pairX(params[0]).toFixed(2)}<br/>` +
        params.map(p => `${p.marker ?? ''}${p.seriesName}: <b>${pairY(p).toPrecision(3)}</b> expected`).join('<br/>'),
    },
    series: [
      {
        name: 'Expected count ≥ M',
        type: 'line',
        data: modelCurves.grCurve,
        showSymbol: false,
        lineStyle: { width: 2, color: RAMP.m2 },
        itemStyle: { color: RAMP.m2 },
      },
      {
        name: 'Report thresholds',
        type: 'line',
        data: modelCurves.grThresholdPoints.map(p => ({
          value: p.value,
          itemStyle: { color: RAMP[p.key] },
        })),
        lineStyle: { opacity: 0 },
        symbol: 'circle',
        symbolSize: 10,
      },
    ],
  };

  // Dynamic Gauge parameters
  const radius = 64;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (selectedProb / 100) * circumference;

  return (
    <div className="mt-6 space-y-6" role="region" aria-label="Aftershock forecast visualizations">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Forecast Visualizations
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Aftershock probability forecasts for event {results.quakeId}
          </p>
        </div>

        {/* Sub-Tab Navigation */}
        <div className="flex mt-4 sm:mt-0 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 ${
              activeSubTab === 'overview'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
           Forecast Overview
          </button>
          <button
            onClick={() => setActiveSubTab('charts')}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 ${
              activeSubTab === 'charts'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            More Charts
          </button>
        </div>
      </div>

      {activeSubTab === 'overview' ? (
        <div className="space-y-6">
          {/* Main Controls & Summary Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Box: Controls & Gauge */}
            <div className="lg:col-span-5 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
                  Interactive Forecast Selector
                </h3>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  {/* Magnitude Selector */}
                  <div>
                    <label htmlFor="oaf-magnitude" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Magnitude Threshold
                    </label>
                    <select
                      id="oaf-magnitude"
                      value={selectedMagKey}
                      onChange={(e) => setSelectedMagKey(e.target.value as 'm1' | 'm2' | 'm3')}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="m3">M{magVals.m3.toFixed(1)}+</option>
                      <option value="m2">M{magVals.m2.toFixed(1)}+</option>
                      <option value="m1">M{magVals.m1.toFixed(1)}+</option>
                    </select>
                  </div>

                  {/* Duration Selector */}
                  <div>
                    <label htmlFor="oaf-duration" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Forecast Period
                    </label>
                    <select
                      id="oaf-duration"
                      value={effectiveDuration}
                      onChange={(e) => setSelectedDuration(parseInt(e.target.value))}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {availableDurations.map(dur => (
                        <option key={dur} value={dur}>
                          {dur === 1 ? '1 Day' : dur === 7 ? '1 Week' : dur === 30 ? '1 Month' : `${dur} Days`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Animated SVG Gauge Chart */}
              <div className="flex flex-col items-center justify-center py-4">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <defs>
                      <linearGradient id="lowMedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                      <linearGradient id="highGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#dc2626" />
                      </linearGradient>
                    </defs>
                    {/* Background Ring */}
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      className="stroke-gray-100 dark:stroke-gray-700"
                      strokeWidth={strokeWidth}
                      fill="transparent"
                    />
                    {/* Progress Ring */}
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      stroke={`url(#${selectedProb >= 75 ? 'highGradient' : 'lowMedGradient'})`}
                      strokeWidth={strokeWidth}
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      className="transition-all duration-700 ease-out"
                    />
                  </svg>

                  {/* Text Center */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-extrabold text-gray-800 dark:text-gray-100">
                      {selectedProb < 1 ? '<1%' : selectedProb > 99 ? '>99%' : `${Math.round(selectedProb)}%`}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5">
                      Probability
                    </span>
                  </div>
                </div>

                <div className="mt-4 text-center">
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Probability of 1 or more aftershocks
                  </p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5">
                    {selectedOafData.label} within {effectiveDuration === 1 ? '1 day' : effectiveDuration === 7 ? '1 week' : effectiveDuration === 30 ? '1 month' : `${effectiveDuration} days`}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Box: Dynamic Commentary & Summary Probabilities Table */}
            <div className="lg:col-span-7 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">
                  Forecast Commentary
                </h3>

                {/* Natural Language Statement */}
                <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    According to the current statistical model parameters (<strong>{modelName}</strong>), there is a{' '}
                    <span className="font-extrabold text-blue-600 dark:text-blue-400">
                      {selectedProb < 1 ? 'less than 1%' : selectedProb > 99 ? 'greater than 99%' : `${Math.round(selectedProb)}%`} chance
                    </span>{' '}
                    of one or more aftershocks of magnitude{' '}
                    <span className="font-bold text-gray-900 dark:text-white">{selectedOafData.label}</span> occurring within the next{' '}
                    <span className="font-bold text-gray-900 dark:text-white">
                      {effectiveDuration === 1 ? '1 day' : effectiveDuration === 7 ? '1 week' : effectiveDuration === 30 ? '1 month' : `${effectiveDuration} days`}
                    </span>
                    .
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2.5">
                    The expected number of aftershocks of this magnitude is{' '}
                    <span className="font-bold text-gray-900 dark:text-white">
                      {selectedOafData.lambda < 0.1 ? selectedOafData.lambda.toPrecision(1) : selectedOafData.lambda.toFixed(1)}
                    </span>{' '}
                    (95% confidence range:{' '}
                    <span className="font-mono bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-xs font-semibold text-gray-800 dark:text-gray-200">
                      {selectedOafData.range}
                    </span>
                    ).
                    {selectedOafData.magThreshold >= 5.0 && (
                      <span className="block mt-2.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        ⚠️ Aftershocks of magnitude 5.0 or larger are strong enough to be widely felt and can cause localized minor damage.
                      </span>
                    )}
                    {selectedOafData.magThreshold >= 6.0 && (
                      <span className="block mt-2.5 text-xs text-red-600 dark:text-red-400 font-medium">
                        ⚠️ Aftershocks of magnitude 6.0 or larger are major events that can cause significant damage and present a hazard.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Summary of all Magnitude Thresholds */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                  All Thresholds (within {effectiveDuration === 1 ? '1 day' : effectiveDuration === 7 ? '1 week' : effectiveDuration === 30 ? '1 month' : `${effectiveDuration} days`})
                </h4>
                <div className="overflow-hidden border border-gray-150 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Magnitude
                        </th>
                        <th scope="col" className="px-4 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Probability of ≥1
                        </th>
                        <th scope="col" className="px-4 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Expected number
                        </th>
                        <th scope="col" className="px-4 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          95% Confidence Range
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-150 dark:divide-gray-700">
                      {summaryList.map((item) => (
                        <tr
                          key={item.key}
                          onClick={() => setSelectedMagKey(item.key)}
                          className={`cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/5 transition-colors ${
                            selectedMagKey === item.key ? 'bg-blue-50/30 dark:bg-blue-900/10 font-medium' : ''
                          }`}
                        >
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-white font-semibold">
                            {item.label}
                          </td>
                          <td className="px-4 py-2 text-sm text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                item.probability >= 75
                                  ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                                  : item.probability >= 25
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400'
                              }`}
                            >
                              {item.probability < 1 ? '<1%' : item.probability > 99 ? '>99%' : `${Math.round(item.probability)}%`}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-center text-gray-600 dark:text-gray-300 font-mono">
                            {item.avg < 0.1 ? item.avg.toPrecision(1) : item.avg.toFixed(1)}
                          </td>
                          <td className="px-4 py-2 text-sm text-center text-gray-500 dark:text-gray-400 font-mono">
                            {item.range}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Likely Number of Aftershocks Bar Chart */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <ReactEChartsCore echarts={echarts} option={likelyNumberOptions} notMerge style={{ height: 320, width: '100%' }} />
          </div>
        </div>
      ) : (
        /* Detailed grid of 6 charts */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Probability by bin and window */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <ReactEChartsCore echarts={echarts} option={probabilityBarOptions} notMerge style={{ height: 350, width: '100%' }} />
          </div>

          {/* Expected counts by bin and window */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <ReactEChartsCore echarts={echarts} option={expectedBarOptions} notMerge style={{ height: 350, width: '100%' }} />
          </div>

          {/* Probability growth with duration (continuous) */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <ReactEChartsCore echarts={echarts} option={probTimeOptions} notMerge style={{ height: 350, width: '100%' }} />
          </div>

          {/* Omori rate decay (log-log) */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <ReactEChartsCore echarts={echarts} option={rateDecayOptions} notMerge style={{ height: 350, width: '100%' }} />
          </div>

          {/* Cumulative expected count */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <ReactEChartsCore echarts={echarts} option={cumulativeOptions} notMerge style={{ height: 350, width: '100%' }} />
          </div>

          {/* Gutenberg-Richter magnitude-frequency relation */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <ReactEChartsCore echarts={echarts} option={grOptions} notMerge style={{ height: 350, width: '100%' }} />
          </div>
        </div>
      )}

      {/* Legend / Explanation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Understanding the Charts</h3>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li><strong>Probability:</strong> The likelihood of at least one aftershock of the selected size or larger, computed as 1&nbsp;&minus;&nbsp;e<sup>&minus;N</sup> under Poisson statistics.</li>
          <li><strong>Expected count:</strong> The mean number of aftershocks (N) predicted by the Reasenberg&ndash;Jones model.</li>
          <li><strong>Rate decay:</strong> The Omori&ndash;Utsu law, a straight line on log&ndash;log axes with slope &minus;p, showing where the forecast window sits on the sequence&rsquo;s decay history.</li>
          <li><strong>Magnitude&ndash;frequency:</strong> The Gutenberg&ndash;Richter relation, a straight line on the log axis whose slope is the b-value; each unit decrease in magnitude multiplies expected counts by ~10<sup>b</sup>.</li>
          <li><strong>Darker red = larger magnitude</strong> in all multi-series charts; the exact values behind every chart are available in the Table View.</li>
        </ul>
      </div>
    </div>
  );
}
