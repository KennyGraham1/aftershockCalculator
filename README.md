# Aftershock Calculator

A web application for generating and evaluating earthquake aftershock forecasts with the Reasenberg–Jones model (Omori–Utsu decay with Poisson statistics). Built for Earth Sciences New Zealand (ESNZ).

## Features

- **GeoNet Integration**: Fetch earthquake data directly from the GeoNet API using quake IDs
- **Multiple Seismicity Models**: Pre-configured parameters for different tectonic settings:
  - NZ Generic (New Zealand active continental region)
  - Subduction Zone (Hikurangi/Puysegur)
  - California/ACR (Reasenberg & Jones, 1989)
  - Stable Continental Region (Page et al., 2016)
  - Custom user-defined parameters
- **Configurable Forecasts**: Adjustable forecast durations and magnitude thresholds
- **Statistical Output**: Expected aftershock counts, 95% confidence intervals, and probability of occurrence
- **Visualizations**: Interactive Apache ECharts plots — outcome distributions, Omori–Utsu rate decay,
  probability growth over time, cumulative expected counts, and the Gutenberg–Richter magnitude–frequency relation
- **Forecast Evaluation**: Retrospective testing against the observed GeoNet catalogue — Wells & Coppersmith
  spatial regions, CSEP-style N-test, Brier and log scores, an interactive Leaflet map of the evaluation region,
  and PDF/CSV report export
- **About**: In-app documentation of the model, parameters, presets, and evaluation methodology with typeset equations
- **CSV Export**: Download forecast results for further analysis

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Charts**: Apache ECharts (via echarts-for-react)
- **Maps**: Leaflet 2 (pinned alpha; local type declarations in `src/types/leaflet.d.ts`)
- **Equations**: KaTeX
- **Testing**: Vitest
- **Font**: Inter (Google Fonts)

## Project Structure

```
src/
├── app/
│   ├── layout.tsx      # Root layout with metadata
│   ├── page.tsx        # Main calculator page
│   └── globals.css     # Global styles
├── components/
│   ├── QuakeInput.tsx        # Earthquake ID input and data fetching
│   ├── Parameters.tsx        # Magnitude and duration configuration
│   ├── ModelSelector.tsx     # Seismicity model selection
│   ├── ResultsTable.tsx      # Forecast results display
│   ├── VisualizationTab.tsx  # ECharts forecast visualizations
│   ├── EvaluationTab.tsx     # Forecast evaluation against observed seismicity
│   ├── EvaluationMap.tsx     # Leaflet map of the evaluation region and events
│   ├── AboutTab.tsx          # Model, parameter, and methodology documentation
│   └── InfoTooltip.tsx       # Accessible tooltip component
├── lib/
│   ├── api.ts              # GeoNet API client (quake lookup + QuakeSearch catalogue)
│   ├── calculations.ts     # Aftershock calculation logic (Reasenberg-Jones)
│   ├── evaluation.ts       # Evaluation: spatial regions, scores, N-test
│   ├── datetime.ts         # dd/mm/yyyy date-time parsing and formatting
│   └── *.test.ts           # Vitest unit tests for each module
└── types/
    ├── index.ts        # TypeScript type definitions and model presets
    └── leaflet.d.ts    # Local declarations for Leaflet 2 (no official types yet)
```

## Getting Started

### Prerequisites

- Node.js >= 18.17.0

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing

```bash
npm test
```

### Build

```bash
npm run build
npm start
```

## Scientific References

- Reasenberg, P.A. & Jones, L.M. (1989, 1994): California aftershock parameters
- Page, M. et al. (2016): Global tectonic regime parameters
- Hardebeck, J.L. et al. (2019): Updated California parameters
