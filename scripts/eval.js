const RAMGraphEngine = require('../src/engine/graphEngine');
const RiskRouter = require('../src/engine/riskRouter');

// Initialize Engines
const graphEngine = new RAMGraphEngine();
const router = new RiskRouter();

// Financial Configuration Settings
const COST_PARAMS = {
  FRICTION_COST_RATIO: 0.15 // False Positive penalty: 15% of transaction value lost to user friction
};

// Generate Synthetic Dataset (1,000 Transactions with Ground Truth)
function generateDataset(sampleSize = 1000) {
  const dataset = [];
  
  for (let i = 0; i < sampleSize; i++) {
    const isFraudGroundTruth = Math.random() < 0.08; // 8% baseline fraud rate
    const amount = Math.floor(Math.random() * 8000) + 500; // ₹500 to ₹8,500
    
    let features;
    let graphMetrics;

    if (isFraudGroundTruth) {
      // Fraudulent Pattern: High velocity, high centrality, multi-device usage
      features = {
        isBlacklisted: Math.random() < 0.2, // 20% blacklisted
        cardVelocity5m: Math.floor(Math.random() * 6) + 3, // Velocity 3 to 8
        ipVelocity5m: Math.floor(Math.random() * 8) + 4,
        uniqueDevices24h: Math.floor(Math.random() * 4) + 2
      };
      graphMetrics = { nodeDegree: Math.floor(Math.random() * 5) + 3, clusterDensity: 0.65 };
    } else {
      // Legitimate Pattern: Clean features
      features = {
        isBlacklisted: false,
        cardVelocity5m: 1,
        ipVelocity5m: 1,
        uniqueDevices24h: 1
      };
      graphMetrics = { nodeDegree: 1, clusterDensity: 0.1 };
    }

    dataset.push({
      id: `BENCH_TX_${i}`,
      amount,
      isFraudGroundTruth,
      features,
      graphMetrics
    });
  }

  return dataset;
}

function runEvaluation() {
  console.log('=== RUNNING MODULE E: HELD-OUT BENCHMARK EVALUATION ===\n');

  const dataset = generateDataset(1000);

  let tp = 0, fp = 0, tn = 0, fn = 0;
  let grossFraudVolume = 0;
  let lossPrevented = 0;
  let frictionLoss = 0;
  let missedFraudLoss = 0;

  const startTime = process.hrtime();

  for (const item of dataset) {
    const evaluation = router.evaluate(item.features, item.graphMetrics);
    const predictedFraud = evaluation.decision === 'BLOCK' || evaluation.decision === 'CHALLENGE_3DS';

    if (item.isFraudGroundTruth) grossFraudVolume += item.amount;

    if (predictedFraud && item.isFraudGroundTruth) {
      // True Positive (Fraud Prevented)
      tp++;
      lossPrevented += item.amount;
    } else if (predictedFraud && !item.isFraudGroundTruth) {
      // False Positive (Legitimate user blocked/challenged)
      fp++;
      frictionLoss += (item.amount * COST_PARAMS.FRICTION_COST_RATIO);
    } else if (!predictedFraud && item.isFraudGroundTruth) {
      // False Negative (Missed Fraud Chargeback)
      fn++;
      missedFraudLoss += item.amount;
    } else {
      // True Negative (Safe transaction approved)
      tn++;
    }
  }

  const diff = process.hrtime(startTime);
  const totalEvalMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);
  const avgLatencyPerTx = (totalEvalMs / dataset.length).toFixed(3);

  // Compute ML Precision, Recall, and F1 Score
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1Score = (2 * precision * recall) / (precision + recall) || 0;
  const netFinancialSaved = lossPrevented - frictionLoss - missedFraudLoss;

  // Render Evaluation Results
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│                    CLASSIFICATION METRICS                   │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log(`│ Total Benchmark Dataset Size : ${dataset.length} transactions             │`);
  console.log(`│ True Positives (TP)          : ${tp}                            │`);
  console.log(`│ False Positives (FP)         : ${fp}                            │`);
  console.log(`│ False Negatives (FN)         : ${fn}                            │`);
  console.log(`│ True Negatives (TN)          : ${tn}                           │`);
  console.log(`│ Precision                    : ${(precision * 100).toFixed(2)}%                         │`);
  console.log(`│ Recall                       : ${(recall * 100).toFixed(2)}%                         │`);
  console.log(`│ F1 Score                     : ${f1Score.toFixed(4)}                        │`);
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│                 FINANCIAL IMPACT ANALYSIS                   │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log(`│ Total Fraud Volume Attempted : ₹${grossFraudVolume.toLocaleString('en-IN')}                 │`);
  console.log(`│ Gross Fraud Blocked (TP)    : ₹${lossPrevented.toLocaleString('en-IN')}                 │`);
  console.log(`│ Friction Cost (FP Penalties) : ₹${Math.round(frictionLoss).toLocaleString('en-IN')}                 │`);
  console.log(`│ Missed Fraud Loss (FN)      : ₹${missedFraudLoss.toLocaleString('en-IN')}                 │`);
  console.log(`│ NET LOSS SAVED               : ₹${Math.round(netFinancialSaved).toLocaleString('en-IN')}                 │`);
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log(`│ Throughput Latency           : ${avgLatencyPerTx} ms / transaction          │`);
  console.log('└─────────────────────────────────────────────────────────────┘\n');
}

runEvaluation();