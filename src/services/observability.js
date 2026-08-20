const mongoose = require('mongoose');

// Mongoose Schema for Permanent Fraud Audit Records
const transactionAuditSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  cardFingerprint: { type: String, required: true },
  deviceId: { type: String, required: true },
  ipAddress: { type: String, required: true },
  
  // Pipeline Results
  riskScore: { type: Number, required: true },
  decision: { type: String, required: true, enum: ['APPROVE', 'CHALLENGE_3DS', 'BLOCK'] },
  frictionTier: { type: String, required: true },
  primaryFactor: { type: String, required: true },
  
  // Feature Vectors
  features: {
    isBlacklisted: Boolean,
    cardVelocity5m: Number,
    ipVelocity5m: Number,
    uniqueDevices24h: Number
  },
  
  // Evidence & Circuit Breaker Metadata
  evidenceSummary: String,
  evidenceSource: String,
  processingLatencyMs: Number,
  timestamp: { type: Date, default: Date.now, index: true }
});

const TransactionAudit = mongoose.model('TransactionAudit', transactionAuditSchema);

class ObservabilityService {
  constructor(ioInstance = null) {
    this.io = ioInstance;
    this.isMongoConnected = false;
  }

  // Connect to MongoDB
  async connectMongo(mongoUri) {
    try {
      await mongoose.connect(mongoUri || 'mongodb://127.0.0.1:27017/fraud_sentinel');
      this.isMongoConnected = true;
      console.log('[MongoDB] Audit database connected successfully.');
    } catch (err) {
      console.warn('[MongoDB Warning] Could not connect to MongoDB. Running in-memory mode.', err.message);
    }
  }

  // Emit WebSocket Real-Time Alert
  broadcastTransactionResult(transaction, result) {
    if (!this.io) return;

    const payload = {
      transactionId: transaction.transactionId,
      amount: transaction.amount,
      riskScore: result.riskScore,
      decision: result.decision,
      primaryFactor: result.primaryFactor,
      timestamp: new Date().toISOString()
    };

    // Broadcast to general transaction stream
    this.io.emit('transaction:processed', payload);

    // If High Risk / Blocked, emit to dedicated High Priority Security Channel
    if (result.decision === 'BLOCK' || result.riskScore > 70) {
      this.io.emit('alert:high_risk_fraud', payload);
    }
  }

  // Non-Blocking Asynchronous Persistence
  async persistAuditRecord(transaction, features, evaluation, evidenceResult, latencyMs) {
    // 1. Instant WebSocket Dispatch
    this.broadcastTransactionResult(transaction, evaluation);

    if (!this.isMongoConnected) return;

    // 2. Asynchronous Background Write
    try {
      await TransactionAudit.create({
        transactionId: transaction.transactionId,
        userId: transaction.userId,
        amount: transaction.amount,
        currency: transaction.currency || 'INR',
        cardFingerprint: transaction.cardFingerprint,
        deviceId: transaction.deviceId,
        ipAddress: transaction.ipAddress,
        riskScore: evaluation.riskScore,
        decision: evaluation.decision,
        frictionTier: evaluation.frictionTier,
        primaryFactor: evaluation.primaryFactor,
        features: {
          isBlacklisted: features.isBlacklisted,
          cardVelocity5m: features.cardVelocity5m,
          ipVelocity5m: features.ipVelocity5m,
          uniqueDevices24h: features.uniqueDevices24h
        },
        evidenceSummary: evidenceResult.evidence,
        evidenceSource: evidenceResult.source,
        processingLatencyMs: parseFloat(latencyMs)
      });
    } catch (err) {
      console.error('[MongoDB Audit Error] Failed to persist record:', err.message);
    }
  }
}

module.exports = { ObservabilityService, TransactionAudit };