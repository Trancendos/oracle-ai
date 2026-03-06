/**
 * Oracle AI — Prediction & Forecasting Engine
 *
 * Provides deterministic forecasting, trend analysis, and predictive
 * insights for the Trancendos mesh. All predictions are rule-based
 * (no LLM calls) — zero-cost compliant.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────

export type ForecastMethod = 'linear_regression' | 'moving_average' | 'exponential_smoothing' | 'seasonal';
export type ForecastStatus = 'pending' | 'running' | 'complete' | 'failed';
export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high';
export type TrendDirection = 'up' | 'down' | 'stable' | 'volatile';

export interface DataPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface ForecastRequest {
  id: string;
  name: string;
  description?: string;
  dataPoints: DataPoint[];
  method: ForecastMethod;
  horizonPeriods: number;   // how many future periods to forecast
  requestedBy: string;
  createdAt: Date;
}

export interface ForecastResult {
  requestId: string;
  predictions: DataPoint[];
  confidence: ConfidenceLevel;
  confidenceScore: number;   // 0–1
  trend: TrendDirection;
  trendStrength: number;     // 0–1
  seasonality?: SeasonalPattern;
  summary: string;
  completedAt: Date;
}

export interface SeasonalPattern {
  detected: boolean;
  period?: number;
  amplitude?: number;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  category: 'trend' | 'anomaly' | 'forecast' | 'recommendation';
  severity: 'info' | 'warning' | 'critical';
  metric?: string;
  value?: number;
  createdAt: Date;
}

export interface OracleStats {
  totalForecasts: number;
  completedForecasts: number;
  failedForecasts: number;
  totalInsights: number;
  averageConfidence: number;
  methodUsage: Record<ForecastMethod, number>;
}

// ── Oracle Engine ─────────────────────────────────────────────────────────

export class OracleEngine {
  private forecasts: Map<string, ForecastRequest> = new Map();
  private results: Map<string, ForecastResult> = new Map();
  private insights: Insight[] = [];

  constructor() {
    logger.info('OracleEngine initialized');
  }

  // ── Forecast Management ─────────────────────────────────────────────────

  createForecast(params: {
    name: string;
    description?: string;
    dataPoints: DataPoint[];
    method?: ForecastMethod;
    horizonPeriods?: number;
    requestedBy: string;
  }): ForecastRequest {
    if (params.dataPoints.length < 3) {
      throw new Error('At least 3 data points required for forecasting');
    }

    const request: ForecastRequest = {
      id: uuidv4(),
      name: params.name,
      description: params.description,
      dataPoints: params.dataPoints,
      method: params.method || 'linear_regression',
      horizonPeriods: params.horizonPeriods || 5,
      requestedBy: params.requestedBy,
      createdAt: new Date(),
    };

    this.forecasts.set(request.id, request);
    logger.info({ forecastId: request.id, name: request.name, method: request.method }, 'Forecast created');
    return request;
  }

  runForecast(forecastId: string): ForecastResult {
    const request = this.forecasts.get(forecastId);
    if (!request) throw new Error(`Forecast ${forecastId} not found`);

    logger.info({ forecastId, method: request.method }, 'Running forecast');

    let result: ForecastResult;
    switch (request.method) {
      case 'linear_regression':
        result = this.linearRegressionForecast(request);
        break;
      case 'moving_average':
        result = this.movingAverageForecast(request);
        break;
      case 'exponential_smoothing':
        result = this.exponentialSmoothingForecast(request);
        break;
      case 'seasonal':
        result = this.seasonalForecast(request);
        break;
      default:
        result = this.linearRegressionForecast(request);
    }

    this.results.set(forecastId, result);

    // Auto-generate insights from result
    this.generateInsightsFromForecast(request, result);

    logger.info(
      { forecastId, confidence: result.confidence, trend: result.trend },
      'Forecast complete'
    );
    return result;
  }

  getForecast(forecastId: string): ForecastRequest | undefined {
    return this.forecasts.get(forecastId);
  }

  getForecasts(requestedBy?: string): ForecastRequest[] {
    let forecasts = Array.from(this.forecasts.values());
    if (requestedBy) forecasts = forecasts.filter(f => f.requestedBy === requestedBy);
    return forecasts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getResult(forecastId: string): ForecastResult | undefined {
    return this.results.get(forecastId);
  }

  // ── Insights ────────────────────────────────────────────────────────────

  addInsight(params: {
    title: string;
    description: string;
    category: Insight['category'];
    severity: Insight['severity'];
    metric?: string;
    value?: number;
  }): Insight {
    const insight: Insight = {
      id: uuidv4(),
      ...params,
      createdAt: new Date(),
    };
    this.insights.push(insight);
    logger.info({ insightId: insight.id, category: insight.category, severity: insight.severity }, 'Insight added');
    return insight;
  }

  getInsights(filters?: {
    category?: Insight['category'];
    severity?: Insight['severity'];
    limit?: number;
  }): Insight[] {
    let insights = [...this.insights];
    if (filters?.category) insights = insights.filter(i => i.category === filters.category);
    if (filters?.severity) insights = insights.filter(i => i.severity === filters.severity);
    insights.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filters?.limit) insights = insights.slice(0, filters.limit);
    return insights;
  }

  // ── Quick Analysis ──────────────────────────────────────────────────────

  analyzeTrend(dataPoints: DataPoint[]): {
    direction: TrendDirection;
    strength: number;
    changePercent: number;
  } {
    if (dataPoints.length < 2) return { direction: 'stable', strength: 0, changePercent: 0 };

    const values = dataPoints.map(d => d.value);
    const first = values[0];
    const last = values[values.length - 1];
    const changePercent = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;

    // Calculate volatility (coefficient of variation)
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean !== 0 ? stdDev / Math.abs(mean) : 0;

    let direction: TrendDirection;
    if (cv > 0.3) {
      direction = 'volatile';
    } else if (Math.abs(changePercent) < 5) {
      direction = 'stable';
    } else {
      direction = changePercent > 0 ? 'up' : 'down';
    }

    const strength = Math.min(1, Math.abs(changePercent) / 100);
    return { direction, strength, changePercent };
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  getStats(): OracleStats {
    const results = Array.from(this.results.values());
    const methodUsage = {} as Record<ForecastMethod, number>;
    const methods: ForecastMethod[] = ['linear_regression', 'moving_average', 'exponential_smoothing', 'seasonal'];
    for (const m of methods) methodUsage[m] = 0;

    for (const [id] of this.forecasts) {
      const req = this.forecasts.get(id)!;
      methodUsage[req.method]++;
    }

    const avgConfidence = results.length > 0
      ? results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.length
      : 0;

    return {
      totalForecasts: this.forecasts.size,
      completedForecasts: this.results.size,
      failedForecasts: this.forecasts.size - this.results.size,
      totalInsights: this.insights.length,
      averageConfidence: avgConfidence,
      methodUsage,
    };
  }

  // ── Forecasting Algorithms ──────────────────────────────────────────────

  private linearRegressionForecast(request: ForecastRequest): ForecastResult {
    const values = request.dataPoints.map(d => d.value);
    const n = values.length;

    // Calculate linear regression coefficients
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    // Calculate R² for confidence
    const ssRes = values.reduce((sum, v, i) => sum + Math.pow(v - (slope * i + intercept), 2), 0);
    const ssTot = values.reduce((sum, v) => sum + Math.pow(v - yMean, 2), 0);
    const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 1;

    // Generate predictions
    const lastTimestamp = request.dataPoints[request.dataPoints.length - 1].timestamp;
    const avgInterval = n > 1
      ? (lastTimestamp.getTime() - request.dataPoints[0].timestamp.getTime()) / (n - 1)
      : 86400000; // default 1 day

    const predictions: DataPoint[] = [];
    for (let i = 1; i <= request.horizonPeriods; i++) {
      predictions.push({
        timestamp: new Date(lastTimestamp.getTime() + i * avgInterval),
        value: slope * (n + i - 1) + intercept,
        label: `forecast_${i}`,
      });
    }

    const trend = this.analyzeTrend(request.dataPoints);
    const confidence = this.scoreToConfidence(rSquared);

    return {
      requestId: request.id,
      predictions,
      confidence,
      confidenceScore: Math.max(0, rSquared),
      trend: trend.direction,
      trendStrength: trend.strength,
      summary: `Linear regression forecast: ${trend.direction} trend (${trend.changePercent.toFixed(1)}% change), R²=${rSquared.toFixed(3)}`,
      completedAt: new Date(),
    };
  }

  private movingAverageForecast(request: ForecastRequest): ForecastResult {
    const values = request.dataPoints.map(d => d.value);
    const window = Math.min(5, Math.floor(values.length / 2));

    // Calculate moving averages
    const mas: number[] = [];
    for (let i = window - 1; i < values.length; i++) {
      const slice = values.slice(i - window + 1, i + 1);
      mas.push(slice.reduce((a, b) => a + b, 0) / window);
    }

    const lastMA = mas[mas.length - 1];
    const lastTimestamp = request.dataPoints[request.dataPoints.length - 1].timestamp;
    const avgInterval = values.length > 1
      ? (lastTimestamp.getTime() - request.dataPoints[0].timestamp.getTime()) / (values.length - 1)
      : 86400000;

    const predictions: DataPoint[] = [];
    for (let i = 1; i <= request.horizonPeriods; i++) {
      predictions.push({
        timestamp: new Date(lastTimestamp.getTime() + i * avgInterval),
        value: lastMA,
        label: `forecast_${i}`,
      });
    }

    const trend = this.analyzeTrend(request.dataPoints);
    return {
      requestId: request.id,
      predictions,
      confidence: 'medium',
      confidenceScore: 0.65,
      trend: trend.direction,
      trendStrength: trend.strength,
      summary: `Moving average (window=${window}) forecast: ${trend.direction} trend, predicted value=${lastMA.toFixed(2)}`,
      completedAt: new Date(),
    };
  }

  private exponentialSmoothingForecast(request: ForecastRequest): ForecastResult {
    const values = request.dataPoints.map(d => d.value);
    const alpha = 0.3; // smoothing factor

    let smoothed = values[0];
    for (let i = 1; i < values.length; i++) {
      smoothed = alpha * values[i] + (1 - alpha) * smoothed;
    }

    const lastTimestamp = request.dataPoints[request.dataPoints.length - 1].timestamp;
    const avgInterval = values.length > 1
      ? (lastTimestamp.getTime() - request.dataPoints[0].timestamp.getTime()) / (values.length - 1)
      : 86400000;

    const predictions: DataPoint[] = [];
    for (let i = 1; i <= request.horizonPeriods; i++) {
      predictions.push({
        timestamp: new Date(lastTimestamp.getTime() + i * avgInterval),
        value: smoothed,
        label: `forecast_${i}`,
      });
    }

    const trend = this.analyzeTrend(request.dataPoints);
    return {
      requestId: request.id,
      predictions,
      confidence: 'medium',
      confidenceScore: 0.70,
      trend: trend.direction,
      trendStrength: trend.strength,
      summary: `Exponential smoothing (alpha=${alpha}) forecast: smoothed value=${smoothed.toFixed(2)}`,
      completedAt: new Date(),
    };
  }

  private seasonalForecast(request: ForecastRequest): ForecastResult {
    const values = request.dataPoints.map(d => d.value);
    const n = values.length;

    // Detect seasonality by checking autocorrelation at different lags
    let bestPeriod = 0;
    let bestCorr = 0;
    for (let lag = 2; lag <= Math.floor(n / 2); lag++) {
      let corr = 0;
      for (let i = lag; i < n; i++) {
        corr += values[i] * values[i - lag];
      }
      corr /= (n - lag);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestPeriod = lag;
      }
    }

    const lastTimestamp = request.dataPoints[request.dataPoints.length - 1].timestamp;
    const avgInterval = n > 1
      ? (lastTimestamp.getTime() - request.dataPoints[0].timestamp.getTime()) / (n - 1)
      : 86400000;

    const predictions: DataPoint[] = [];
    for (let i = 1; i <= request.horizonPeriods; i++) {
      const seasonalIdx = bestPeriod > 0 ? (n - bestPeriod + (i % bestPeriod)) % bestPeriod : 0;
      const baseValue = values[Math.max(0, n - bestPeriod + seasonalIdx)] || values[n - 1];
      predictions.push({
        timestamp: new Date(lastTimestamp.getTime() + i * avgInterval),
        value: baseValue,
        label: `forecast_${i}`,
      });
    }

    const trend = this.analyzeTrend(request.dataPoints);
    return {
      requestId: request.id,
      predictions,
      confidence: bestPeriod > 0 ? 'medium' : 'low',
      confidenceScore: bestPeriod > 0 ? 0.60 : 0.40,
      trend: trend.direction,
      trendStrength: trend.strength,
      seasonality: { detected: bestPeriod > 0, period: bestPeriod },
      summary: `Seasonal forecast: ${bestPeriod > 0 ? `period=${bestPeriod} detected` : 'no seasonality detected'}`,
      completedAt: new Date(),
    };
  }

  private scoreToConfidence(score: number): ConfidenceLevel {
    if (score >= 0.85) return 'very_high';
    if (score >= 0.70) return 'high';
    if (score >= 0.50) return 'medium';
    return 'low';
  }

  private generateInsightsFromForecast(request: ForecastRequest, result: ForecastResult): void {
    // Trend insight
    if (result.trend === 'up' && result.trendStrength > 0.5) {
      this.addInsight({
        title: `Strong upward trend in ${request.name}`,
        description: `${request.name} shows a strong upward trend (strength: ${(result.trendStrength * 100).toFixed(0)}%). Forecast confidence: ${result.confidence}.`,
        category: 'trend',
        severity: 'info',
        metric: request.name,
      });
    } else if (result.trend === 'down' && result.trendStrength > 0.5) {
      this.addInsight({
        title: `Declining trend in ${request.name}`,
        description: `${request.name} shows a declining trend (strength: ${(result.trendStrength * 100).toFixed(0)}%). Investigate root cause.`,
        category: 'trend',
        severity: 'warning',
        metric: request.name,
      });
    } else if (result.trend === 'volatile') {
      this.addInsight({
        title: `High volatility in ${request.name}`,
        description: `${request.name} exhibits high volatility. Forecasts may be less reliable.`,
        category: 'anomaly',
        severity: 'warning',
        metric: request.name,
      });
    }
  }
}