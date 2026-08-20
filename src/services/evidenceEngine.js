const CircuitBreaker = require('./circuitBreaker');

class EvidenceEngine {
  constructor(apiClient = null) {
    this.apiClient = apiClient;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 2,
      timeoutMs: 500,
      cooldownMs: 15000
    });
  }

  generateLocalFallback(transaction, evaluation) {
    const { riskScore, primaryFactor, decision } = evaluation;
    const { cardFingerprint, deviceId, ipAddress } = transaction;
    const maskedCard = cardFingerprint ? `${cardFingerprint.slice(0, 8)}...` : 'UNKNOWN_CARD';

    const templates = {
      BLACK_LISTED_CARD_MATCH: `CRITICAL ALERT: Transaction ${transaction.transactionId} blocked instantly. Card fingerprint ${maskedCard} exists on high-priority revocation list.`,
      HIGH_DEVICE_CARDINALITY: `RISK SCORE ${riskScore}/100: ${decision} executed. Card ${maskedCard} was associated with multiple distinct hardware device IDs within 24 hours.`,
      HIGH_GRAPH_CENTRALITY: `RISK SCORE ${riskScore}/100: ${decision} executed. Device ${deviceId} and IP ${ipAddress} exhibit high degree centrality inside in-memory subgraph cluster.`,
      HIGH_CARD_VELOCITY: `RISK SCORE ${riskScore}/100: ${decision} executed. High transaction rate detected on Card ${maskedCard} exceeding sliding window limits.`,
      NORMAL_BEHAVIOR: `RISK SCORE ${riskScore}/100: Transaction approved. No high-risk graph connections, card velocity spikes, or blacklist matches observed.`
    };

    // Return plain text directly
    return templates[primaryFactor] || `RISK SCORE ${riskScore}/100: Transaction flagged with decision ${decision} due to composite risk threshold breach.`;
  }

  async _callRemoteLLM(transaction, evaluation) {
    if (!this.apiClient) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      throw new Error("Simulated LLM Network Latency SLA Breach (>500ms)");
    }

    const prompt = `System: You are an enterprise anti-fraud compliance agent. Output strict JSON with key "summary".
Context: Transaction ${transaction.transactionId}, Risk Score: ${evaluation.riskScore}, Primary Factor: ${evaluation.primaryFactor}.`;

    const response = await this.apiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content).summary;
  }

  async generateEvidence(transaction, evaluation) {
    const primaryFn = () => this._callRemoteLLM(transaction, evaluation);
    const fallbackFn = () => this.generateLocalFallback(transaction, evaluation);

    const result = await this.circuitBreaker.execute(primaryFn, fallbackFn);
    
    // Force unwrapping if the result is an object containing an 'evidence' or 'summary' field
    if (typeof result === 'object' && result !== null) {
      return result.evidence || result.summary || result.text || JSON.stringify(result);
    }

    // If it's a JSON string representation, parse it and grab the text
    if (typeof result === 'string' && result.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(result);
        return parsed.evidence || parsed.summary || parsed.text || result;
      } catch (e) {
        return result;
      }
    }

    return String(result);
  }
}

module.exports = new EvidenceEngine();