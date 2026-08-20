require('dotenv').config();
const Redis = require('ioredis');
const RedisFeatureStore = require('../src/services/redisFeatureStore');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6380') // Port 6380 for Docker
});

const featureStore = new RedisFeatureStore(redis);

async function runTest() {
  console.log('=== TESTING MODULE B: REDIS FEATURE STORE ===\n');

  const testCard = 'CARD_STOLEN_9901';
  const testDevice1 = 'DEV_PHONE_A';
  const testDevice2 = 'DEV_LAPTOP_B';
  const testIp = '103.22.180.45';

  // 1. Blacklist Test
  console.log('1. Adding card to Bloom Filter Blacklist...');
  await featureStore.addToBlacklist(testCard);

  const blacklistedCheck = await featureStore.isBlacklisted(testCard);
  const cleanCardCheck = await featureStore.isBlacklisted('CARD_CLEAN_1234');

  console.log(` - Stolen Card Blacklisted? ${blacklistedCheck} (Expected: true)`);
  console.log(` - Clean Card Blacklisted? ${cleanCardCheck} (Expected: false)\n`);

  // 2. Feature Extraction Simulation
  console.log('2. Simulating consecutive transactions for velocity & cardinality...');

  for (let i = 1; i <= 3; i++) {
    const dev = i % 2 === 0 ? testDevice2 : testDevice1;
    const features = await featureStore.extractFeatures({
      cardFingerprint: testCard,
      deviceId: dev,
      ipAddress: testIp
    });

    console.log(`Transaction #${i} Extracted Features:`, features);
  }

  await redis.quit();
  console.log('\n=== MODULE B VERIFICATION COMPLETE ===');
}

runTest().catch(console.error);