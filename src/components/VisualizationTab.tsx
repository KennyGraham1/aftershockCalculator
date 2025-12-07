'use client';

import React, { useMemo, useState, useEffect } from 'react';
import type { CalculationResults } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HighchartsInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartComponentType = React.ComponentType<{ highcharts: any; options: unknown }>;

// Component that handles client-side only Highcharts loading
function useHighcharts() {
  const [modules, setModules] = useState<{
    Highcharts: HighchartsInstance | null;
    Chart: ChartComponentType | null;
  }>({ Highcharts: null, Chart: null });

  useEffect(() => {
    // Only load on client side
    async function loadHighcharts() {
      // Import Highcharts core first
      const Highcharts = (await import('highcharts')).default;

      // Load and initialize exporting module
      const exportingModule = await import('highcharts/modules/exporting');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exportingInit = exportingModule.default as any;
      if (typeof exportingInit === 'function') {
        exportingInit(Highcharts);
      }

      // Load react wrapper
      const hcReact = await import('@highcharts/react');

      setModules({
        Highcharts,
        Chart: hcReact.Chart as unknown as ChartComponentType,
      });
    }

    loadHighcharts();
  }, []);

  return modules;
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

export default function VisualizationTab({ results, modelName = 'NZ Generic' }: VisualizationTabProps) {
  const { Highcharts, Chart } = useHighcharts();

  // Prepare chart data from results
  const chartData = useMemo(() => {
    if (!results) return null;

    const durations = results.forecasts.map(f => `${f.duration} days`);
    const durationValues = results.forecasts.map(f => f.duration);

    // Probability data for each magnitude range
    const probM1 = results.forecasts.map(f => parsePercentage(f.m1.probability));
    const probM2 = results.forecasts.map(f => parsePercentage(f.m2.probability));
    const probM3 = results.forecasts.map(f => parsePercentage(f.m3.probability));

    // Average number data for each magnitude range
    const avgM1 = results.forecasts.map(f => parseAverage(f.m1.averageNumber));
    const avgM2 = results.forecasts.map(f => parseAverage(f.m2.averageNumber));
    const avgM3 = results.forecasts.map(f => parseAverage(f.m3.averageNumber));

    // For pie chart - use the longest duration's data
    const lastForecast = results.forecasts[results.forecasts.length - 1];
    const pieData = [
      { name: results.rangeLabels.range1, y: parseAverage(lastForecast.m1.averageNumber), color: '#dc2626' },
      { name: results.rangeLabels.range2, y: parseAverage(lastForecast.m2.averageNumber), color: '#f59e0b' },
      { name: results.rangeLabels.range3, y: parseAverage(lastForecast.m3.averageNumber), color: '#22c55e' },
    ];

    return {
      durations,
      durationValues,
      probM1,
      probM2,
      probM3,
      avgM1,
      avgM2,
      avgM3,
      pieData,
      rangeLabels: results.rangeLabels,
    };
  }, [results]);

  // Show loading state while Highcharts is loading
  if (!Highcharts || !Chart) {
    return (
      <div className="mt-6 p-8 text-center text-gray-500 dark:text-gray-400">
        <p>Loading charts...</p>
      </div>
    );
  }

  if (!results || !chartData) {
    return (
      <div className="mt-6 p-8 text-center text-gray-500 dark:text-gray-400">
        <p>Calculate a forecast to see visualizations</p>
      </div>
    );
  }

  // Chart 1: Probability Bar Chart
  const probabilityBarOptions = {
    chart: { type: 'column', height: 350 },
    title: { text: 'Probability of 1+ Aftershocks by Magnitude Range' },
    subtitle: { text: `Model: ${modelName}` },
    xAxis: { categories: chartData.durations, title: { text: 'Forecast Duration' } },
    yAxis: { min: 0, max: 100, title: { text: 'Probability (%)' } },
    tooltip: { valueSuffix: '%' },
    plotOptions: { column: { dataLabels: { enabled: true, format: '{y:.1f}%' } } },
    series: [
      { type: 'column', name: chartData.rangeLabels.range1, data: chartData.probM1, color: '#dc2626' },
      { type: 'column', name: chartData.rangeLabels.range2, data: chartData.probM2, color: '#f59e0b' },
      { type: 'column', name: chartData.rangeLabels.range3, data: chartData.probM3, color: '#22c55e' },
    ],
    credits: { enabled: false },
    exporting: { enabled: true },
  };

  // Chart 2: Expected Aftershocks Bar Chart
  const expectedBarOptions = {
    chart: { type: 'column', height: 350 },
    title: { text: 'Expected Number of Aftershocks' },
    subtitle: { text: `Model: ${modelName}` },
    xAxis: { categories: chartData.durations, title: { text: 'Forecast Duration' } },
    yAxis: { min: 0, title: { text: 'Expected Count' } },
    tooltip: { valueDecimals: 1 },
    plotOptions: { column: { dataLabels: { enabled: true, format: '{y:.1f}' } } },
    series: [
      { type: 'column', name: chartData.rangeLabels.range1, data: chartData.avgM1, color: '#dc2626' },
      { type: 'column', name: chartData.rangeLabels.range2, data: chartData.avgM2, color: '#f59e0b' },
      { type: 'column', name: chartData.rangeLabels.range3, data: chartData.avgM3, color: '#22c55e' },
    ],
    credits: { enabled: false },
    exporting: { enabled: true },
  };

  // Chart 3: Time-Probability Line Chart
  const timeLineOptions = {
    chart: { type: 'line', height: 350 },
    title: { text: 'Probability Over Time' },
    subtitle: { text: 'How aftershock probability changes with forecast duration' },
    xAxis: { categories: chartData.durations, title: { text: 'Duration' } },
    yAxis: { min: 0, max: 100, title: { text: 'Probability (%)' } },
    tooltip: { valueSuffix: '%', shared: true },
    plotOptions: { line: { marker: { enabled: true, radius: 5 } } },
    series: [
      { type: 'line', name: chartData.rangeLabels.range1, data: chartData.probM1, color: '#dc2626' },
      { type: 'line', name: chartData.rangeLabels.range2, data: chartData.probM2, color: '#f59e0b' },
      { type: 'line', name: chartData.rangeLabels.range3, data: chartData.probM3, color: '#22c55e' },
    ],
    credits: { enabled: false },
    exporting: { enabled: true },
  };

  // Chart 4: Pie Chart - Distribution of Expected Aftershocks
  const pieOptions = {
    chart: { type: 'pie', height: 350 },
    title: { text: 'Expected Aftershock Distribution' },
    subtitle: { text: `For ${chartData.durations[chartData.durations.length - 1]} forecast period` },
    tooltip: { pointFormat: '<b>{point.y:.1f}</b> expected ({point.percentage:.1f}%)' },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.y:.1f}' },
        showInLegend: true,
      },
    },
    series: [{ type: 'pie', name: 'Expected', data: chartData.pieData }],
    credits: { enabled: false },
    exporting: { enabled: true },
  };

  // Chart 5: Stacked Area Chart - Cumulative Expected Aftershocks
  const stackedAreaOptions = {
    chart: { type: 'area', height: 350 },
    title: { text: 'Cumulative Expected Aftershocks by Magnitude' },
    subtitle: { text: 'Stacked view showing contribution of each magnitude range' },
    xAxis: { categories: chartData.durations, title: { text: 'Duration' } },
    yAxis: { min: 0, title: { text: 'Expected Count' } },
    tooltip: { shared: true, valueDecimals: 1 },
    plotOptions: { area: { stacking: 'normal', marker: { enabled: false } } },
    series: [
      { type: 'area', name: chartData.rangeLabels.range3, data: chartData.avgM3, color: '#22c55e' },
      { type: 'area', name: chartData.rangeLabels.range2, data: chartData.avgM2, color: '#f59e0b' },
      { type: 'area', name: chartData.rangeLabels.range1, data: chartData.avgM1, color: '#dc2626' },
    ],
    credits: { enabled: false },
    exporting: { enabled: true },
  };

  // Chart 6: Heatmap-style data (using column chart with color coding)
  const heatmapData: Array<{ name: string; data: number[]; color: string }> = [];
  const magnitudeRanges = [
    { label: chartData.rangeLabels.range1, probs: chartData.probM1 },
    { label: chartData.rangeLabels.range2, probs: chartData.probM2 },
    { label: chartData.rangeLabels.range3, probs: chartData.probM3 },
  ];

  magnitudeRanges.forEach((range, idx) => {
    const colors = ['#dc2626', '#f59e0b', '#22c55e'];
    heatmapData.push({
      name: range.label,
      data: range.probs,
      color: colors[idx],
    });
  });

  const heatmapBarOptions = {
    chart: { type: 'bar', height: 300 },
    title: { text: 'Probability Comparison (Horizontal View)' },
    xAxis: { categories: chartData.durations, title: { text: '' } },
    yAxis: { min: 0, max: 100, title: { text: 'Probability (%)' } },
    tooltip: { valueSuffix: '%' },
    plotOptions: { bar: { dataLabels: { enabled: true, format: '{y:.0f}%' } } },
    series: heatmapData.map(d => ({ type: 'bar' as const, ...d })),
    credits: { enabled: false },
    exporting: { enabled: true },
  };

  return (
    <div className="mt-6 space-y-8" role="region" aria-label="Aftershock forecast visualizations">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
            Forecast Visualizations
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Visual representations of the aftershock probability forecast for {results.quakeId}
          </p>
        </div>
      </div>

      {/* Grid of charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Probability Bar Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <Chart highcharts={Highcharts} options={probabilityBarOptions} />
        </div>

        {/* Expected Aftershocks Bar Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <Chart highcharts={Highcharts} options={expectedBarOptions} />
        </div>

        {/* Time-Probability Line Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <Chart highcharts={Highcharts} options={timeLineOptions} />
        </div>

        {/* Pie Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <Chart highcharts={Highcharts} options={pieOptions} />
        </div>

        {/* Stacked Area Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <Chart highcharts={Highcharts} options={stackedAreaOptions} />
        </div>

        {/* Horizontal Bar Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <Chart highcharts={Highcharts} options={heatmapBarOptions} />
        </div>
      </div>

      {/* Legend / Explanation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Understanding the Charts</h3>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li><strong>Probability charts</strong> show the likelihood of at least one aftershock occurring</li>
          <li><strong>Expected count charts</strong> show the average number of aftershocks predicted</li>
          <li><strong>Color coding:</strong> Red = highest magnitude, Orange = medium, Green = lowest magnitude range</li>
          <li>Forecasts are based on the Omori-Utsu law using the {modelName} model parameters</li>
        </ul>
      </div>
    </div>
  );
}

