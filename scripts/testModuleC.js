const RAMGraphEngine = require('../src/engine/graphEngine');
const RiskRouter = require('../src/engine/riskRouter');

const graphEngine = new RAMGraphEngine();
const router = new RiskRouter();

console.log('=== TESTING MODULE C: RAM GRAPH ENGINE & 3-TIER ROUTER ===\n');

// 1. Ingest clean isolated transaction
const cleanTx = { userId: 'usr_101', cardFingerprint: 'card_clean', deviceId: 'dev_1', ipAddress: '192.168.1.1' };
graphEngine.ingestTransactionEntities(cleanTx);

const cleanGraphMetrics = graphEngine.getSubgraphMetrics('card:card_clean');
const cleanFeatures = { isBlacklisted: false, cardVelocity5m: 1, ipVelocity5m: 1, uniqueDevices24h: 1 };
const cleanDecision = router.evaluate(cleanFeatures, cleanGraphMetrics);

console.log('1. Normal Transaction Evaluation:');
console.log(' - Graph Metrics:', cleanGraphMetrics);
console.log(' - Router Decision:', cleanDecision, '\n');

// 2. Simulate Fraud Ring: Connect multiple cards and users to the same device & IP
console.log('2. Simulating Fraud Ring (Connecting 4 users & 4 cards to dev_fraud_hub)...');

for (let i = 1; i <= 4; i++) {
  graphEngine.ingestTransactionEntities({
    userId: `usr_ring_${i}`,
    cardFingerprint: `card_ring_${i}`,
    deviceId: 'dev_fraud_hub',
    ipAddress: '103.45.210.99'
  });
}

const ringGraphMetrics = graphEngine.getSubgraphMetrics('dev:dev_fraud_hub');
const ringFeatures = { isBlacklisted: false, cardVelocity5m: 4, ipVelocity5m: 6, uniqueDevices24h: 3 };
const ringDecision = router.evaluate(ringFeatures, ringGraphMetrics);

console.log('3. Fraud Ring Node Evaluation (dev_fraud_hub):');
console.log(' - Graph Metrics:', ringGraphMetrics);
console.log(' - Router Decision:', ringDecision);

console.log('\n=== MODULE C VERIFICATION COMPLETE ===');