// src/engine/riskRouter.js
class RiskRouter {
  constructor(weights = {}) {
    this.weights = {
      cardVelocity: weights.cardVelocity || 3.0,
      ipVelocity: weights.ipVelocity || 2.0,
      graphDegree: weights.graphDegree || 3.0, // Reduced weight so normal clustering doesn't force a block
      hllDevices: weights.hllDevices || 5.0,
      clusterDensity: weights.clusterDensity || 5.0
    };

    this.THRESHOLDS = {
      APPROVE_MAX: 40,  
      CHALLENGE_MAX: 75 
    };
  }

  calculateRiskScore(features = {}, graphMetrics = {}) {
    if (features.isBlacklisted) {
      return { score: 100, primaryFactor: 'BLACK_LISTED_CARD_MATCH' };
    }

    let score = 5; // Low baseline

    const cardVel = Number(features.cardVelocity5m) || 1;
    const ipVel = Number(features.ipVelocity5m) || 1;
    const nodeDeg = Number(graphMetrics.nodeDegree) || 0;
    const density = Number(graphMetrics.clusterDensity) || 0;
    const devices = Number(features.uniqueDevices24h) || 1;

    score += Math.max(0, cardVel - 1) * this.weights.cardVelocity;
    score += Math.max(0, ipVel - 1) * this.weights.ipVelocity;
    score += Math.min(nodeDeg, 10) * this.weights.graphDegree; // Cap degree contribution
    score += density * this.weights.clusterDensity;
    score += Math.max(0, devices - 1) * this.weights.hllDevices;

    const finalScore = Math.min(100, Math.max(0, Math.round(score)));

    let primaryFactor = 'NORMAL_BEHAVIOR';
    if (devices > 3) {
      primaryFactor = 'HIGH_DEVICE_CARDINALITY';
    } else if (nodeDeg > 5) {
      primaryFactor = 'HIGH_GRAPH_CENTRALITY';
    } else if (cardVel > 3) {
      primaryFactor = 'HIGH_CARD_VELOCITY';
    }

    return { score: finalScore, primaryFactor };
  }

  evaluate(features, graphMetrics) {
    const { score, primaryFactor } = this.calculateRiskScore(features, graphMetrics);

    let decision = 'APPROVE';
    let frictionTier = 'TIER_1_LOW_FRICTION';

    if (score > this.THRESHOLDS.CHALLENGE_MAX) {
      decision = 'BLOCK';
      frictionTier = 'TIER_3_HARD_BLOCK';
    } else if (score > this.THRESHOLDS.APPROVE_MAX) {
      decision = 'CHALLENGE_3DS';
      frictionTier = 'TIER_2_STEP_UP_AUTH';
    }

    return { decision, frictionTier, riskScore: score, primaryFactor };
  }
}

module.exports = new RiskRouter();