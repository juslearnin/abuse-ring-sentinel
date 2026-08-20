const EvidenceEngine = require('../src/services/evidenceEngine');

const evidenceEngine = new EvidenceEngine(); // Instantiated without API client to simulate SLA breaches

async function runTest() {
  console.log('=== TESTING MODULE D: RESILIENT LLM EVIDENCE & CIRCUIT BREAKER ===\n');

  const sampleTx = {
    transactionId: 'TXN_RISK_9912',
    cardFingerprint: 'CARD_RING_HASH_88',
    deviceId: 'DEV_HUB_99',
    ipAddress: '103.22.180.45'
  };

  const sampleEvaluation = {
    riskScore: 85,
    decision: 'BLOCK',
    primaryFactor: 'HIGH_GRAPH_CENTRALITY'
  };

  console.log('1. Call #1: Remote LLM takes >500ms (SLA Breach)...');
  const res1 = await evidenceEngine.generateEvidence(sampleTx, sampleEvaluation);
  console.log('Result #1:', res1, '\n');

  console.log('2. Call #2: Second SLA Breach (Triggers Circuit Breaker: CLOSED -> OPEN)...');
  const res2 = await evidenceEngine.generateEvidence(sampleTx, sampleEvaluation);
  console.log('Result #2:', res2, '\n');

  console.log('3. Call #3: Circuit Breaker is OPEN (Instant local fallback, 0ms network time)...');
  const startTime = process.hrtime();
  const res3 = await evidenceEngine.generateEvidence(sampleTx, sampleEvaluation);
  const diff = process.hrtime(startTime);
  const executionMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

  console.log('Result #3:', res3);
  console.log(` - Execution Time in OPEN state: ${executionMs}ms (Expected < 1ms)\n`);

  console.log('=== MODULE D VERIFICATION COMPLETE ===');
}

runTest().catch(console.error);