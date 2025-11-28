# AfterShock Calculator

A web application for generating earthquake aftershock forecasts based on the Omori-Utsu law and Poisson distribution. Built for Earth Sciences New Zealand (ESNZ).

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
- **CSV Export**: Download forecast results for further analysis

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Font**: Inter (Google Fonts)

## Project Structure

```
src/
├── app/
│   ├── layout.tsx      # Root layout with metadata
│   ├── page.tsx        # Main calculator page
│   └── globals.css     # Global styles
├── components/
│   ├── QuakeInput.tsx      # Earthquake ID input and data fetching
│   ├── Parameters.tsx      # Magnitude and duration configuration
│   ├── ModelSelector.tsx   # Seismicity model selection
│   └── ResultsTable.tsx    # Forecast results display
├── lib/
│   ├── api.ts          # GeoNet API client
│   └── calculations.ts # Aftershock calculation logic (Omori-Utsu)
└── types/
    └── index.ts        # TypeScript type definitions and model presets
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

### Build

```bash
npm run build
npm start
```

## Scientific References

- Reasenberg, P.A. & Jones, L.M. (1989, 1994): California aftershock parameters
- Page, M. et al. (2016): Global tectonic regime parameters
- Hardebeck, J.L. et al. (2018): Updated California parameters
