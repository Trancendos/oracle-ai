// ============================================================
// Football Analytics Framework — Oracle AI
// Advanced Predictive Modeling, Generative AI & Tactical Intelligence
// ============================================================
// Reference: "The Analytics Vanguard" — Football Data Analytics
// and Prediction Framework
//
// Grand Unified Algorithmic Framework:
// Bayesian Prior (Dixon-Coles/Elo) → Micro-simulation (ACWR fatigue)
// → Real-time non-linear updates (XGBoost) → Generative tactical
// optimization (TacticAI principles)
// ============================================================

// ─── Core Metrics Types ───────────────────────────────────────

export interface PlayerMetrics {
  playerId: string;
  name: string;
  position: string;
  minutesPlayed: number;

  // Expected Goals Framework
  xG: number;           // Expected Goals
  npxG: number;         // Non-Penalty Expected Goals
  xGoT: number;         // Expected Goals on Target
  xA: number;           // Expected Assists
  xPTS: number;         // Expected Points contribution

  // Per-90 normalized (mandatory for all comparisons)
  xGPer90: number;
  npxGPer90: number;
  xAPer90: number;

  // Sports Science
  acuteWorkload7d: number;   // 7-day acute load
  chronicWorkload28d: number; // 28-day chronic load
  acwr: number;               // Acute:Chronic Workload Ratio
  injuryRisk: 'low' | 'medium' | 'high' | 'critical';
}

export interface TeamStrength {
  teamId: string;
  name: string;
  offensiveStrength: number;  // O — attack rating
  defensiveVulnerability: number; // V — defense rating
  eloRating: number;
  bradleyTerryScore: number;
  recentFormDecay: number;    // Time-decay weight for recent matches
}

export interface MatchPrediction {
  homeTeamId: string;
  awayTeamId: string;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  confidence: number;
  modelUsed: 'dixon-coles' | 'xgboost' | 'ensemble';
  timestamp: string;
}

export interface TacticalRecommendation {
  scenario: string;
  currentFormation: string;
  recommendedAdjustment: string;
  expectedImpact: string;
  cornerKickReceiver?: string;  // TacticAI prediction
  repositioningMap?: Record<string, { x: number; y: number }>;
  confidence: number;
}

// ─── Dixon-Coles Double Poisson Model ────────────────────────

export class DixonColesModel {
  private readonly RHO = -0.13; // Dixon-Coles correction factor

  /**
   * Calculate goal probability using Double Poisson Regression
   * with Dixon-Coles adjustment for low-score dependency
   */
  calculateGoalProbability(
    homeStrength: TeamStrength,
    awayStrength: TeamStrength,
    homeGoals: number,
    awayGoals: number
  ): number {
    const lambdaHome = homeStrength.offensiveStrength * awayStrength.defensiveVulnerability;
    const lambdaAway = awayStrength.offensiveStrength * homeStrength.defensiveVulnerability;

    const poissonHome = this.poisson(homeGoals, lambdaHome);
    const poissonAway = this.poisson(awayGoals, lambdaAway);

    // Dixon-Coles correction for 0-0, 1-0, 0-1, 1-1 scorelines
    const tau = this.dixonColesTau(homeGoals, awayGoals, lambdaHome, lambdaAway);

    return poissonHome * poissonAway * tau;
  }

  /**
   * Predict match outcome probabilities
   */
  predictMatch(home: TeamStrength, away: TeamStrength): MatchPrediction {
    let homeWin = 0, draw = 0, awayWin = 0;
    let expectedHomeGoals = 0, expectedAwayGoals = 0;

    // Sum over goal combinations (0-10 goals each)
    for (let h = 0; h <= 10; h++) {
      for (let a = 0; a <= 10; a++) {
        const prob = this.calculateGoalProbability(home, away, h, a);
        if (h > a) homeWin += prob;
        else if (h === a) draw += prob;
        else awayWin += prob;
        expectedHomeGoals += h * prob;
        expectedAwayGoals += a * prob;
      }
    }

    return {
      homeTeamId: home.teamId,
      awayTeamId: away.teamId,
      homeWinProbability: homeWin,
      drawProbability: draw,
      awayWinProbability: awayWin,
      expectedHomeGoals,
      expectedAwayGoals,
      confidence: 0.72, // Dixon-Coles baseline confidence
      modelUsed: 'dixon-coles',
      timestamp: new Date().toISOString(),
    };
  }

  private poisson(k: number, lambda: number): number {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
  }

  private factorial(n: number): number {
    if (n <= 1) return 1;
    return n * this.factorial(n - 1);
  }

  private dixonColesTau(h: number, a: number, lh: number, la: number): number {
    if (h === 0 && a === 0) return 1 - lh * la * this.RHO;
    if (h === 1 && a === 0) return 1 + la * this.RHO;
    if (h === 0 && a === 1) return 1 + lh * this.RHO;
    if (h === 1 && a === 1) return 1 - this.RHO;
    return 1;
  }
}

// ─── Elo Rating System (Bradley-Terry adapted) ───────────────

export class EloRatingSystem {
  private readonly K_FACTOR = 32;
  private readonly BASE_RATING = 1500;

  updateRatings(
    homeRating: number,
    awayRating: number,
    homeGoals: number,
    awayGoals: number
  ): { newHomeRating: number; newAwayRating: number } {
    const expectedHome = 1 / (1 + Math.pow(10, (awayRating - homeRating) / 400));
    const expectedAway = 1 - expectedHome;

    const actualHome = homeGoals > awayGoals ? 1 : homeGoals === awayGoals ? 0.5 : 0;
    const actualAway = 1 - actualHome;

    return {
      newHomeRating: homeRating + this.K_FACTOR * (actualHome - expectedHome),
      newAwayRating: awayRating + this.K_FACTOR * (actualAway - expectedAway),
    };
  }

  getWinProbability(homeRating: number, awayRating: number): number {
    return 1 / (1 + Math.pow(10, (awayRating - homeRating) / 400));
  }
}

// ─── ACWR Injury Risk Calculator ─────────────────────────────

export class ACWRCalculator {
  /**
   * Acute:Chronic Workload Ratio
   * ACWR > 1.5 = high injury risk
   * ACWR 0.8-1.3 = sweet spot
   * ACWR < 0.8 = undertraining risk
   */
  calculateACWR(acute7d: number, chronic28d: number): number {
    if (chronic28d === 0) return 0;
    return acute7d / (chronic28d / 4); // Normalize chronic to weekly average
  }

  assessInjuryRisk(acwr: number): PlayerMetrics['injuryRisk'] {
    if (acwr > 1.5) return 'critical';
    if (acwr > 1.3) return 'high';
    if (acwr > 1.0) return 'medium';
    return 'low';
  }

  /**
   * Zero-Inflated Poisson (ZIP) regression stub
   * Predicts time-loss injury probability
   */
  predictInjuryProbability(
    acwr: number,
    previousInjuries: number,
    ageYears: number
  ): number {
    // Simplified ZIP model
    const baseRate = 0.05; // 5% base injury rate per match
    const acwrMultiplier = acwr > 1.5 ? 3.0 : acwr > 1.3 ? 1.8 : acwr > 1.0 ? 1.2 : 0.8;
    const ageMultiplier = ageYears > 30 ? 1.4 : ageYears > 28 ? 1.2 : 1.0;
    const historyMultiplier = 1 + (previousInjuries * 0.15);

    return Math.min(0.95, baseRate * acwrMultiplier * ageMultiplier * historyMultiplier);
  }
}

// ─── XGBoost Live Match State Engine (Stub) ──────────────────

export class XGBoostMatchEngine {
  /**
   * Real-time win probability recalibration
   * Handles non-linear variables: score differential, time remaining,
   * red cards, momentum shifts
   */
  recalibrateWinProbability(
    baselinePrediction: MatchPrediction,
    liveState: {
      homeGoals: number;
      awayGoals: number;
      minutesPlayed: number;
      homeRedCards: number;
      awayRedCards: number;
      homeMomentum: number; // -1 to 1
    }
  ): MatchPrediction {
    const { homeGoals, awayGoals, minutesPlayed, homeRedCards, awayRedCards, homeMomentum } = liveState;
    const timeRemaining = 90 - minutesPlayed;
    const scoreDiff = homeGoals - awayGoals;

    // Score differential impact (asymmetric — late deficit is harder to overcome)
    const timeDecay = timeRemaining / 90;
    const scoreFactor = scoreDiff * (1 + (1 - timeDecay) * 0.5);

    // Red card penalty
    const cardPenalty = (homeRedCards - awayRedCards) * 0.12;

    // Momentum factor
    const momentumFactor = homeMomentum * 0.08;

    // Recalibrate
    let homeWin = baselinePrediction.homeWinProbability;
    homeWin += scoreFactor * 0.15 - cardPenalty + momentumFactor;
    homeWin = Math.max(0.01, Math.min(0.98, homeWin));

    const remaining = 1 - homeWin;
    const drawRatio = baselinePrediction.drawProbability / (baselinePrediction.drawProbability + baselinePrediction.awayWinProbability);

    return {
      ...baselinePrediction,
      homeWinProbability: homeWin,
      drawProbability: remaining * drawRatio,
      awayWinProbability: remaining * (1 - drawRatio),
      confidence: baselinePrediction.confidence * (0.8 + timeDecay * 0.2),
      modelUsed: 'xgboost',
      timestamp: new Date().toISOString(),
    };
  }
}

// ─── TacticAI Tactical Recommendation Engine (Stub) ──────────

export class TacticAIEngine {
  /**
   * Based on Google DeepMind's TacticAI (developed with Liverpool FC)
   * Uses Graph Attention Networks to model pitch as a complex graph
   * Generates counterfactual tactical recommendations
   */
  analyzeCornerKick(
    attackingPlayers: Array<{ id: string; position: { x: number; y: number } }>,
    defendingPlayers: Array<{ id: string; position: { x: number; y: number } }>
  ): {
    predictedReceiver: string;
    confidence: number;
    repositioningRecommendations: Record<string, { x: number; y: number }>;
  } {
    // Simplified graph attention — in production, use actual GNN
    // Find player closest to optimal receiving zone (penalty spot area)
    const optimalZone = { x: 11, y: 0 }; // Penalty spot relative to corner

    let closestPlayer = attackingPlayers[0];
    let minDist = Infinity;

    for (const player of attackingPlayers) {
      const dist = Math.sqrt(
        Math.pow(player.position.x - optimalZone.x, 2) +
        Math.pow(player.position.y - optimalZone.y, 2)
      );
      if (dist < minDist) {
        minDist = dist;
        closestPlayer = player;
      }
    }

    // Generate repositioning recommendations to minimize defensive coverage
    const repositioning: Record<string, { x: number; y: number }> = {};
    attackingPlayers.forEach((player, i) => {
      if (player.id !== closestPlayer.id) {
        // Spread to create defensive gaps
        repositioning[player.id] = {
          x: player.position.x + (i % 2 === 0 ? 2 : -2),
          y: player.position.y + (i % 3 === 0 ? 1 : -1),
        };
      }
    });

    return {
      predictedReceiver: closestPlayer.id,
      confidence: 0.68,
      repositioningRecommendations: repositioning,
    };
  }

  generateTacticalReport(
    team: TeamStrength,
    opponent: TeamStrength,
    prediction: MatchPrediction
  ): TacticalRecommendation {
    const isUnderdog = team.eloRating < opponent.eloRating - 100;
    const isStrong = team.offensiveStrength > 1.5;

    let formation = '4-3-3';
    let adjustment = 'Maintain shape';
    let impact = 'Neutral';

    if (isUnderdog) {
      formation = '5-4-1';
      adjustment = 'Deep defensive block, exploit counter-attacks';
      impact = 'Reduce expected goals conceded by ~0.4 xG';
    } else if (isStrong) {
      formation = '4-2-3-1';
      adjustment = 'High press, compress opponent build-up';
      impact = 'Increase expected goals created by ~0.3 xG';
    }

    return {
      scenario: `${team.name} vs ${opponent.name}`,
      currentFormation: formation,
      recommendedAdjustment: adjustment,
      expectedImpact: impact,
      confidence: 0.71,
    };
  }
}

// ─── Grand Unified Algorithmic Framework ─────────────────────

export class FootballAnalyticsEngine {
  private dixonColes = new DixonColesModel();
  private elo = new EloRatingSystem();
  private acwr = new ACWRCalculator();
  private xgboost = new XGBoostMatchEngine();
  private tacticAI = new TacticAIEngine();

  /**
   * Full prediction pipeline:
   * Bayesian Prior → Micro-simulation → Real-time → Tactical
   */
  async fullPrediction(
    home: TeamStrength,
    away: TeamStrength,
    playerMetrics?: PlayerMetrics[]
  ): Promise<{
    prediction: MatchPrediction;
    tacticalReport: TacticalRecommendation;
    injuryRisks: Array<{ player: string; risk: string; acwr: number }>;
  }> {
    // Step 1: Bayesian Prior (Dixon-Coles)
    const basePrediction = this.dixonColes.predictMatch(home, away);

    // Step 2: Micro-simulation (ACWR fatigue coefficients)
    const injuryRisks: Array<{ player: string; risk: string; acwr: number }> = [];
    if (playerMetrics) {
      for (const player of playerMetrics) {
        const acwrScore = this.acwr.calculateACWR(player.acuteWorkload7d, player.chronicWorkload28d);
        const risk = this.acwr.assessInjuryRisk(acwrScore);
        if (risk !== 'low') {
          injuryRisks.push({ player: player.name, risk, acwr: acwrScore });
        }
      }
    }

    // Step 3: Tactical optimization (TacticAI)
    const tacticalReport = this.tacticAI.generateTacticalReport(home, away, basePrediction);

    return {
      prediction: basePrediction,
      tacticalReport,
      injuryRisks,
    };
  }

  getEloSystem() { return this.elo; }
  getACWRCalculator() { return this.acwr; }
  getXGBoostEngine() { return this.xgboost; }
  getTacticAIEngine() { return this.tacticAI; }
}
