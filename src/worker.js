// src/worker.js
require('dotenv').config();
const { Worker } = require('bullmq');
const Redis = require('ioredis');

const graphEngine = require('./engine/graphEngine');
const riskRouter = require('./engine/riskRouter');
const evidenceEngine = require('./services/evidenceEngine');

const redisConnection = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
});

// Shorter 3-second sliding window so traffic clears out quickly and doesn't get stuck
const velocityTracker = new Map();

function trackAndGetVelocity(key, windowMs = 3000) {
  const now = Date.now();
  if (!velocityTracker.has(key)) {
    velocityTracker.set(key, []);
  }
  
  const timestamps = velocityTracker.get(key);
  const recent = timestamps.filter(t => now - t < windowMs);
  recent.push(now);
  
  if (recent.length > 50) recent.shift();
  
  velocityTracker.set(key, recent);
  return recent.length;
}

function startWorker(observability) {
  const worker = new Worker(
    'transaction-ingest-stream',
    async (job) => {
      const transaction = job.data;

      graphEngine.ingestTransactionEntities({
        userId: transaction.userId,
        cardFingerprint: transaction.cardFingerprint,
        deviceId: transaction.deviceId,
        ipAddress: transaction.ipAddress
      });

      const rootNode = transaction.deviceId 
        ? `dev:${transaction.deviceId}` 
        : `usr:${transaction.userId}`;

      const graphMetrics = graphEngine.getSubgraphMetrics(rootNode) || {};

      const isStolenCard = typeof transaction.cardFingerprint === 'string' && 
                           transaction.cardFingerprint.toUpperCase().includes('STOLEN');

      // Check velocities over a fast 3-second rolling window
      const cardVel = trackAndGetVelocity(`card:${transaction.cardFingerprint}`, 3000);
      const ipVel = trackAndGetVelocity(`ip:${transaction.ipAddress}`, 3000);
      const deviceVel = trackAndGetVelocity(`dev:${transaction.deviceId}`, 3000);

      const features = {
        isBlacklisted: isStolenCard || transaction.isBlacklisted || false,
        cardVelocity5m: cardVel,
        ipVelocity5m: ipVel,
        uniqueDevices24h: deviceVel
      };

      const evaluation = riskRouter.evaluate(features, graphMetrics);
      const evidenceExplanation = await evidenceEngine.generateEvidence(transaction, evaluation);

      const eventPayload = {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        riskScore: evaluation.riskScore,
        decision: evaluation.decision, 
        primaryFactor: evaluation.primaryFactor,
        timestamp: transaction.timestamp || new Date().toISOString(),
        graphMetrics: graphMetrics,
        evidenceExplanation: evidenceExplanation
      };

      if (observability && observability.io) {
        observability.io.emit('transaction:processed', eventPayload);
      }

      return eventPayload;
    },
    { connection: redisConnection }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} processed successfully.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker Error] Job ${job?.id} failed:`, err.message);
  });
}

module.exports = { startWorker };