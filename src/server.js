require('dotenv').config();
const http = require('http');
const path = require('path'); // Added path module
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { Queue } = require('bullmq');
const Redis = require('ioredis');
const { startWorker } = require('./worker');

const { transactionSchema } = require('./schemas/transaction.schema');
const { ObservabilityService } = require('./services/observability');

// 1. App & Core Middleware
const app = express();
app.use(express.json());
app.use(cors());

// --- DASHBOARD STATIC SERVING ---
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});
// --------------------------------

// 2. HTTP Server & WebSocket Setup
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const observability = new ObservabilityService(io);

// 3. Safety Net: Rate Limiter
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'REJECTED_RATE_LIMIT', message: 'Too many requests, slow down.' }
});

// 4. Redis Connection
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
});

redisConnection.on('connect', () => console.log('[Redis] Connected successfully.'));
redisConnection.on('error', (err) => console.error('[Redis Error]', err));

// 5. Ingestion Queue
const transactionQueue = new Queue('transaction-ingest-stream', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000
  }
});

// 6. Webhook Ingestion Endpoint
app.post('/api/v1/webhooks/transaction', webhookLimiter, async (req, res) => {
  const startTime = process.hrtime();

  const validation = transactionSchema.safeParse(req.body);

  if (!validation.success) {
    const issues = validation.error?.issues || [];
    
    return res.status(400).json({
      status: 'REJECTED_BAD_SCHEMA',
      errors: issues.map(issue => ({
        field: Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') : 'payload',
        message: issue.message || 'Invalid field'
      }))
    });
  }

  const validatedPayload = validation.data;

  try {
    const job = await transactionQueue.add('process-risk', validatedPayload, {
      jobId: validatedPayload.transactionId
    });

    const diff = process.hrtime(startTime);
    const latencyMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

    return res.status(200).json({
      status: 'QUEUED',
      trackingId: job.id,
      ingestLatencyMs: `${latencyMs}ms`
    });

  } catch (error) {
    console.error('[Ingest Error]', error);
    return res.status(500).json({ status: 'INTERNAL_INGEST_FAILURE', error: error.message });
  }
});

// 7. Health Check
app.get('/health', async (req, res) => {
  const redisState = redisConnection.status === 'ready' ? 'UP' : 'DOWN';
  res.status(200).json({ status: 'HEALTHY', redis: redisState, timestamp: new Date() });
});

// 8. Server Boot

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Ingestion & WebSockets] Running on http://localhost:${PORT}`);
  
  // Start consuming jobs from Redis queue
  startWorker(observability);
  console.log('[BullMQ Worker] Listening for transaction-ingest-stream jobs...');
});

// Export observability service to use inside BullMQ workers/processors
module.exports = { app, server, observability };