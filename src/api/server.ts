/**
 * Oracle AI — REST API Server
 *
 * Exposes forecasting, trend analysis, and predictive insight
 * endpoints for the Trancendos mesh.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { OracleEngine, ForecastMethod, Insight } from '../oracle/oracle-engine';
import { logger } from '../utils/logger';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const app = express();
export const oracle = new OracleEngine();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

function fail(res: Response, message: string, status = 400): void {
  res.status(status).json({ success: false, error: message, timestamp: new Date().toISOString() });
}

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

// ── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  ok(res, { status: 'healthy', service: 'oracle-ai', uptime: process.uptime() });
});

app.get('/metrics', (_req, res) => {
  ok(res, {
    ...oracle.getStats(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
});

// ── Forecasts ──────────────────────────────────────────────────────────────

// POST /forecasts — create & run a forecast
app.post('/forecasts', wrap(async (req, res) => {
  const { name, description, dataPoints, method, horizonPeriods, requestedBy } = req.body;

  if (!name || !dataPoints || !requestedBy) {
    return fail(res, 'name, dataPoints, requestedBy are required');
  }

  const validMethods: ForecastMethod[] = ['linear_regression', 'moving_average', 'exponential_smoothing', 'seasonal'];
  if (method && !validMethods.includes(method)) {
    return fail(res, `method must be one of: ${validMethods.join(', ')}`);
  }

  if (!Array.isArray(dataPoints) || dataPoints.length < 3) {
    return fail(res, 'dataPoints must be an array with at least 3 entries');
  }

  const parsedPoints = dataPoints.map((dp: { timestamp: string; value: number; label?: string }) => ({
    timestamp: new Date(dp.timestamp),
    value: Number(dp.value),
    label: dp.label,
  }));

  const request = oracle.createForecast({
    name,
    description,
    dataPoints: parsedPoints,
    method: method as ForecastMethod | undefined,
    horizonPeriods: horizonPeriods ? Number(horizonPeriods) : undefined,
    requestedBy,
  });

  const result = oracle.runForecast(request.id);
  ok(res, { request, result }, 201);
}));

// GET /forecasts — list all forecast requests
app.get('/forecasts', (req, res) => {
  const { requestedBy } = req.query;
  const forecasts = oracle.getForecasts(requestedBy as string | undefined);
  ok(res, { forecasts, count: forecasts.length });
});

// GET /forecasts/:id — get a specific forecast + result
app.get('/forecasts/:id', (req, res) => {
  const forecast = oracle.getForecast(req.params.id);
  if (!forecast) return fail(res, 'Forecast not found', 404);
  const result = oracle.getResult(req.params.id);
  ok(res, { forecast, result: result ?? null });
});

// POST /forecasts/:id/run — re-run an existing forecast
app.post('/forecasts/:id/run', (req, res) => {
  const forecast = oracle.getForecast(req.params.id);
  if (!forecast) return fail(res, 'Forecast not found', 404);
  try {
    const result = oracle.runForecast(req.params.id);
    ok(res, { forecast, result });
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

// ── Trend Analysis ─────────────────────────────────────────────────────────

// POST /trends/analyze — analyze trend from raw data points
app.post('/trends/analyze', (req, res) => {
  const { dataPoints } = req.body;
  if (!Array.isArray(dataPoints) || dataPoints.length < 3) {
    return fail(res, 'dataPoints must be an array with at least 3 entries');
  }

  const parsed = dataPoints.map((dp: { timestamp: string; value: number }) => ({
    timestamp: new Date(dp.timestamp),
    value: Number(dp.value),
  }));

  try {
    const trend = oracle.analyzeTrend(parsed);
    ok(res, trend);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

// ── Insights ───────────────────────────────────────────────────────────────

// GET /insights — list insights with optional filters
app.get('/insights', (req, res) => {
  const { category, severity, limit } = req.query;
  const insights = oracle.getInsights({
    category: category as Insight['category'] | undefined,
    severity: severity as Insight['severity'] | undefined,
    limit: limit ? Number(limit) : undefined,
  });
  ok(res, { insights, count: insights.length });
});

// POST /insights — add a manual insight
app.post('/insights', (req, res) => {
  const { title, description, category, severity, metric, value } = req.body;
  if (!title || !description || !category || !severity) {
    return fail(res, 'title, description, category, severity are required');
  }
  try {
    const insight = oracle.addInsight({ title, description, category, severity, metric, value });
    ok(res, insight, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

// ── Stats ──────────────────────────────────────────────────────────────────

app.get('/stats', (_req, res) => {
  ok(res, oracle.getStats());
});

// ── Error Handler ──────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  fail(res, err.message || 'Internal server error', 500);
});

export { app };