class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 2; // Consecutive failures to trip
    this.timeoutMs = options.timeoutMs || 500;             // SLA max latency (500ms)
    this.cooldownMs = options.cooldownMs || 15000;         // Time before retry in OPEN state (15s)

    this.state = 'CLOSED'; // 'CLOSED', 'OPEN', 'HALF_OPEN'
    this.failureCount = 0;
    this.nextAttemptTime = Date.now();
  }

  async execute(primaryFn, fallbackFn) {
    // Check if Circuit is OPEN and cooling down
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        console.log('[CircuitBreaker] State transition: OPEN -> HALF_OPEN (Probing LLM Service)');
      } else {
        // Fast-failover directly to deterministic template
        return {
          evidence: fallbackFn(),
          source: 'LOCAL_DETERMINISTIC_FALLBACK',
          circuitState: 'OPEN'
        };
      }
    }

    try {
      // Wrap primary API function in a strict SLA Timeout Promise
      const result = await this._executeWithTimeout(primaryFn(), this.timeoutMs);
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        console.log('[CircuitBreaker] State transition: HALF_OPEN -> CLOSED (Primary Service Recovered)');
      }

      return {
        evidence: result,
        source: 'LIVE_LLM_API',
        circuitState: this.state
      };

    } catch (error) {
      this.failureCount++;
      console.warn(`[CircuitBreaker] Execution failed (${error.message}). Consecutive Failure Count: ${this.failureCount}`);

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttemptTime = Date.now() + this.cooldownMs;
        console.error(`[CircuitBreaker] State transition: CLOSED -> OPEN (Cooling down for ${this.cooldownMs}ms)`);
      }

      return {
        evidence: fallbackFn(),
        source: 'LOCAL_DETERMINISTIC_FALLBACK',
        circuitState: this.state,
        fallbackReason: error.message
      };
    }
  }

  _executeWithTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`SLA Timeout Exceeded (> ${ms}ms)`));
      }, ms);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

module.exports = CircuitBreaker;