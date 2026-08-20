// src/engine/graphEngine.js
class RAMGraphEngine {
  constructor(maxNodes = 2000) {
    this.adjacencyList = new Map();
    this.maxNodes = maxNodes; 
  }

  _getOrCreateNode(nodeId) {
    // Evict oldest nodes if maximum capacity is reached to prevent memory growth leaks
    if (this.adjacencyList.size >= this.maxNodes && !this.adjacencyList.has(nodeId)) {
      const firstKey = this.adjacencyList.keys().next().value;
      this.adjacencyList.delete(firstKey);
    }

    if (!this.adjacencyList.has(nodeId)) {
      this.adjacencyList.set(nodeId, new Set());
    }
    return this.adjacencyList.get(nodeId);
  }

  addEdge(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;

    this._getOrCreateNode(sourceId).add(targetId);
    this._getOrCreateNode(targetId).add(sourceId);
  }

  ingestTransactionEntities({ userId, cardFingerprint, deviceId, ipAddress }) {
    const userNode = userId ? `usr:${userId}` : null;
    const cardNode = cardFingerprint ? `card:${cardFingerprint}` : null;
    const deviceNode = deviceId ? `dev:${deviceId}` : null;
    const ipNode = ipAddress ? `ip:${ipAddress}` : null;

    this.addEdge(userNode, cardNode);
    this.addEdge(userNode, deviceNode);
    this.addEdge(cardNode, deviceNode);
    this.addEdge(cardNode, ipNode);
    this.addEdge(deviceNode, ipNode);
  }

  getDegree(nodeId) {
    const neighbors = this.adjacencyList.get(nodeId);
    return neighbors ? neighbors.size : 0;
  }

  getSubgraphMetrics(rootNodeId) {
    if (!this.adjacencyList.has(rootNodeId)) {
      return { nodeDegree: 0, clusterNodeCount: 0, clusterEdgeCount: 0, clusterDensity: 0 };
    }

    const visited = new Set([rootNodeId]);
    const queue = [{ id: rootNodeId, depth: 0 }];
    const clusterNodes = new Set([rootNodeId]);
    let totalEdges = 0;

    while (queue.length > 0) {
      const { id, depth } = queue.shift();

      if (depth < 2) {
        const neighbors = this.adjacencyList.get(id) || new Set();
        for (const neighbor of neighbors) {
          totalEdges++;
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            clusterNodes.add(neighbor);
            queue.push({ id: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    const nodeCount = clusterNodes.size;
    const rawDensity = nodeCount > 1 ? totalEdges / (nodeCount * (nodeCount - 1)) : 0;
    const clusterDensity = Number(Math.min(1.0, rawDensity).toFixed(4));

    return {
      nodeDegree: this.getDegree(rootNodeId),
      clusterNodeCount: nodeCount,
      clusterEdgeCount: Math.floor(totalEdges / 2),
      clusterDensity
    };
  }

  reset() {
    this.adjacencyList.clear();
  }
}

module.exports = new RAMGraphEngine();