/**
 * Oracle AI — Entry Point
 *
 * Prediction & Forecasting service for the Trancendos mesh.
 * Provides deterministic forecasting using rule-based algorithms.
 * Zero-cost compliant — no LLM calls.
 *
 * Port: 3018
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { app, oracle } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3018);
const HOST = process.env.HOST ?? '0.0.0.0';

// ── Startup ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('Oracle AI starting up...');

  const server = app.listen(PORT, HOST, () => {
    logger.info(
      { port: PORT, host: HOST, env: process.env.NODE_ENV ?? 'development' },
      '🔮 Oracle AI is online — predictions ready',
    );
  });

  // ── Periodic Insight Refresh (every 10 minutes) ──────────────────────────
  const INSIGHT_INTERVAL = Number(process.env.INSIGHT_INTERVAL_MS ?? 10 * 60 * 1000);
  const insightTimer = setInterval(() => {
    try {
      const stats = oracle.getStats();
      logger.info(
        {
          totalForecasts: stats.totalForecasts,
          completedForecasts: stats.completedForecasts,
          totalInsights: stats.totalInsights,
          averageConfidence: stats.averageConfidence.toFixed(3),
        },
        '🔮 Oracle periodic stats',
      );
    } catch (err) {
      logger.error({ err }, 'Periodic insight refresh failed');
    }
  }, INSIGHT_INTERVAL);

  // ── Graceful Shutdown ────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(insightTimer);
    server.close(() => {
      logger.info('Oracle AI shut down cleanly');
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Bootstrap failed');
  process.exit(1);
});