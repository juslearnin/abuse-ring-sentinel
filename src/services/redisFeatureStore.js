const Redis = require('ioredis');

class RedisFeatureStore {
  constructor(redisClient) {
    this.redis = redisClient;
    // Bloom Filter Parameters: m = 1,000,000 bits (~122 KB), k = 3 hash functions
    this.bloomBitsSize = 1000000;
    this.bloomKey = 'bf:blacklist:cards';

    // Lua Script for Atomic Increment + Expire
    this.redis.defineCommand('incrWithExpire', {
      numberOfKeys: 1,
      lua: `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return current
      `
    });
  }

  // Multi-Hash Function for Bloom Filter (FNV-1a Variant)
  _hash(str, seed) {
    let hash = 0x811c9dc5 ^ seed;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash % this.bloomBitsSize);
  }

  // 1. Bloom Filter: Add Item to Blacklist
  async addToBlacklist(cardFingerprint) {
    const pipeline = this.redis.pipeline();
    const seeds = [0x1234, 0x5678, 0x9abc];

    for (const seed of seeds) {
      const bitIndex = this._hash(cardFingerprint, seed);
      pipeline.setbit(this.bloomKey, bitIndex, 1);
    }

    await pipeline.exec();
  }

  // 1. Bloom Filter: Check if Item is Blacklisted O(1)
  async isBlacklisted(cardFingerprint) {
    const pipeline = this.redis.pipeline();
    const seeds = [0x1234, 0x5678, 0x9abc];

    for (const seed of seeds) {
      const bitIndex = this._hash(cardFingerprint, seed);
      pipeline.getbit(this.bloomKey, bitIndex);
    }

    const results = await pipeline.exec();
    // If ALL bits are 1, it's blacklisted (or a rare false positive)
    return results.every(([err, bitVal]) => bitVal === 1);
  }

  // 2. Atomic Sliding-Window Velocity Counter (Atomic Lua Script)
  async recordAndGetVelocity(entityKey, windowSeconds = 300) {
    const redisKey = `velocity:${entityKey}`;
    // Runs atomic INCR + conditional EXPIRE in 1 network hop
    const count = await this.redis.incrWithExpire(redisKey, windowSeconds);
    return count;
  }

  // 3. HyperLogLog: Record and Count Unique Devices per Card
  async recordAndGetDeviceCardinality(cardFingerprint, deviceId) {
    const hllKey = `hll:card_devices:${cardFingerprint}`;

    const pipeline = this.redis.pipeline();
    pipeline.pfadd(hllKey, deviceId);
    pipeline.expire(hllKey, 86400); // 24 hours TTL
    pipeline.pfcount(hllKey);

    const results = await pipeline.exec();
    const uniqueDevicesCount = results[2][1]; // Extract pfcount result
    return uniqueDevicesCount;
  }

  // 4. Master Feature Aggregator Function
  async extractFeatures(transaction) {
    const startTime = process.hrtime();

    const { cardFingerprint, deviceId, ipAddress } = transaction;

    // Run parallel async Redis queries using Promise.all for sub-2ms speed
    const [isBlacklisted, cardVelocity5m, ipVelocity5m, uniqueDevices24h] = await Promise.all([
      this.isBlacklisted(cardFingerprint),
      this.recordAndGetVelocity(`card:${cardFingerprint}`, 300), // 5-minute window
      this.recordAndGetVelocity(`ip:${ipAddress}`, 300),         // 5-minute window
      this.recordAndGetDeviceCardinality(cardFingerprint, deviceId)
    ]);

    const diff = process.hrtime(startTime);
    const featureLatencyMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

    return {
      isBlacklisted,
      cardVelocity5m,
      ipVelocity5m,
      uniqueDevices24h,
      featureLatencyMs: `${featureLatencyMs}ms`
    };
  }
}

module.exports = RedisFeatureStore;