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


// ============================================================================
// IAM MIDDLEWARE — Trancendos 2060 Standard (TRN-PROD-001)
// ============================================================================
import { createHash, createHmac } from 'crypto';

const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const IAM_ALGORITHM = process.env.JWT_ALGORITHM || 'HS512';
const SERVICE_ID = 'oracle';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'oracle.agent.local';

function sha512Audit(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64 + '='.repeat((4 - b64.length % 4) % 4), 'base64').toString('utf8');
}

interface JWTClaims {
  sub: string; email?: string; role?: string;
  active_role_level?: number; permissions?: string[];
  exp?: number; jti?: string;
}

function verifyIAMToken(token: string): JWTClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const header = JSON.parse(b64urlDecode(h));
    const alg = header.alg === 'HS512' ? 'sha512' : 'sha256';
    const expected = createHmac(alg, IAM_JWT_SECRET)
      .update(`${h}.${p}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (expected !== sig) return null;
    const claims = JSON.parse(b64urlDecode(p)) as JWTClaims;
    if (claims.exp && Date.now() / 1000 > claims.exp) return null;
    return claims;
  } catch { return null; }
}

function requireIAMLevel(maxLevel: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Authentication required', service: SERVICE_ID }); return; }
    const claims = verifyIAMToken(token);
    if (!claims) { res.status(401).json({ error: 'Invalid or expired token', service: SERVICE_ID }); return; }
    const level = claims.active_role_level ?? 6;
    if (level > maxLevel) {
      console.log(JSON.stringify({ level: 'audit', decision: 'DENY', service: SERVICE_ID,
        principal: claims.sub, requiredLevel: maxLevel, actualLevel: level, path: req.path,
        integrityHash: sha512Audit(`DENY:${claims.sub}:${req.path}:${Date.now()}`),
        timestamp: new Date().toISOString() }));
      res.status(403).json({ error: 'Insufficient privilege level', required: maxLevel, actual: level });
      return;
    }
    (req as any).principal = claims;
    next();
  };
}

function iamRequestMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Service-Id', SERVICE_ID);
  res.setHeader('X-Mesh-Address', MESH_ADDRESS);
  res.setHeader('X-IAM-Version', '1.0');
  next();
}

function iamHealthStatus() {
  return {
    iam: {
      version: '1.0', algorithm: IAM_ALGORITHM,
      status: IAM_JWT_SECRET ? 'configured' : 'unconfigured',
      meshAddress: MESH_ADDRESS,
      routingProtocol: process.env.MESH_ROUTING_PROTOCOL || 'static_port',
      cryptoMigrationPath: 'hmac_sha512 → ml_kem (2030) → hybrid_pqc (2040) → slh_dsa (2060)',
    },
  };
}
// ============================================================================
// END IAM MIDDLEWARE
// ============================================================================

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