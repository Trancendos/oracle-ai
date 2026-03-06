# Oracle AI 🔮

> Prediction & Forecasting service for the Trancendos mesh.
> Zero-cost compliant — all algorithms are deterministic, no LLM calls.

**Port:** `3018`
**Architecture:** Trancendos Industry 6.0 / 2060 Standard

---

## Overview

Oracle AI provides deterministic time-series forecasting, trend analysis, and predictive insights for the Trancendos agent mesh. It supports four forecasting algorithms and auto-generates insights from completed forecasts.

---

## Forecasting Algorithms

| Method | Description |
|--------|-------------|
| `linear_regression` | Least-squares linear fit with R² confidence scoring |
| `moving_average` | Window-based moving average (default window: 3) |
| `exponential_smoothing` | Exponentially weighted smoothing (α = 0.3) |
| `seasonal` | Autocorrelation-based period detection with seasonal decomposition |

---

## API Reference

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| GET | `/metrics` | Runtime metrics + oracle stats |

### Forecasts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/forecasts` | Create & run a new forecast |
| GET | `/forecasts` | List all forecasts |
| GET | `/forecasts/:id` | Get forecast + result |
| POST | `/forecasts/:id/run` | Re-run an existing forecast |

### Trend Analysis

| Method | Path | Description |
|--------|------|-------------|
| POST | `/trends/analyze` | Analyze trend from raw data points |

### Insights

| Method | Path | Description |
|--------|------|-------------|
| GET | `/insights` | List insights (filterable by category, severity) |
| POST | `/insights` | Add a manual insight |

### Stats

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Oracle engine statistics |

---

## Usage Examples

### Create a Forecast

```bash
curl -X POST http://localhost:3018/forecasts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Revenue Q1 Forecast",
    "dataPoints": [
      { "timestamp": "2024-01-01T00:00:00Z", "value": 1000 },
      { "timestamp": "2024-02-01T00:00:00Z", "value": 1200 },
      { "timestamp": "2024-03-01T00:00:00Z", "value": 1150 }
    ],
    "method": "linear_regression",
    "horizonPeriods": 3,
    "requestedBy": "cornelius-ai"
  }'
```

### Analyze a Trend

```bash
curl -X POST http://localhost:3018/trends/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "dataPoints": [
      { "timestamp": "2024-01-01T00:00:00Z", "value": 100 },
      { "timestamp": "2024-02-01T00:00:00Z", "value": 120 },
      { "timestamp": "2024-03-01T00:00:00Z", "value": 140 }
    ]
  }'
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3018` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |
| `LOG_LEVEL` | `info` | Pino log level |
| `INSIGHT_INTERVAL_MS` | `600000` | Periodic stats interval (ms) |

---

## Development

```bash
npm install
npm run dev       # tsx watch mode
npm run build     # compile TypeScript
npm start         # run compiled output
```

---

## Mesh Integration

Oracle AI is consumed by:
- **Cornelius AI** — orchestration forecasting
- **The Observatory** — analytics trend analysis
- **The Treasury** — financial forecasting
- **Dorris AI** — financial prediction

---

*Part of the Trancendos Industry 6.0 mesh — 2060 Standard*