const http = require('http');

// Configuration
const TARGET_URL = 'http://localhost:3000/api/v1/webhooks/transaction';
const INTERVAL_MS = 500; // Fire a transaction every 500ms

// Entity Pools for Realistic Fraud Ring Simulation
const LEGIT_USERS = ['usr_alice', 'usr_bob', 'usr_charlie', 'usr_david', 'usr_eva'];
const FRAUD_RING_USERS = ['usr_ring_1', 'usr_ring_2', 'usr_ring_3', 'usr_ring_4'];

const CLEAN_CARDS = ['CARD_CLEAN_1001', 'CARD_CLEAN_1002', 'CARD_CLEAN_1003'];
const STOLEN_CARDS = ['CARD_STOLEN_9901', 'CARD_STOLEN_8802', 'CARD_RING_7703'];

const HUB_DEVICES = ['DEV_DESKTOP_HOME', 'DEV_PHONE_MOBILE'];
const FRAUD_HUB_DEVICE = 'DEV_FRAUD_HUB_X99'; // Shared device used by multiple ring accounts

const CLEAN_IPS = ['103.22.180.12', '103.22.180.15', '49.207.50.11'];
const FRAUD_IP = '185.220.101.5'; // High-density proxy/VPN IP

// Utility to Pick Random Element
const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Generate Transaction Payload
function generatePayload() {
  const isFraudPattern = Math.random() < 0.25; // 25% chance of simulating fraud pattern

  let userId, cardFingerprint, deviceId, ipAddress, amount;

  if (isFraudPattern) {
    // Fraud Pattern: Shared fraud hub device, high-risk IP, stolen card pool
    userId = getRandom(FRAUD_RING_USERS);
    cardFingerprint = getRandom(STOLEN_CARDS);
    deviceId = FRAUD_HUB_DEVICE;
    ipAddress = FRAUD_IP;
    amount = Math.floor(Math.random() * 15000) + 5000; // Larger suspicious amounts
  } else {
    // Normal Pattern: Distinct user, clean card, individual device
    userId = getRandom(LEGIT_USERS);
    cardFingerprint = getRandom(CLEAN_CARDS);
    deviceId = `${getRandom(HUB_DEVICES)}_${userId}`;
    ipAddress = getRandom(CLEAN_IPS);
    amount = Math.floor(Math.random() * 3000) + 200; // Normal daily spend
  }

  return {
    transactionId: `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    userId,
    amount,
    currency: 'INR',
    deviceId,
    ipAddress,
    cardFingerprint,
    timestamp: new Date().toISOString()
  };
}

// POST HTTP Request Handler
function sendTransaction(payload) {
  const data = JSON.stringify(payload);

  const req = http.request(
    TARGET_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`[SENT 200 OK] ${payload.transactionId} | Amount: ₹${payload.amount} | Device: ${payload.deviceId}`);
        } else {
          console.error(`[ERROR ${res.statusCode}]`, body);
        }
      });
    }
  );

  req.on('error', (err) => {
    console.error('[Connection Error] Ensure Express server is running on port 3000:', err.message);
  });

  req.write(data);
  req.end();
}

// Start Stream
console.log('=== STARTING CONTINUOUS MOCK TRANSACTION GENERATOR ===');
console.log(`Targeting: ${TARGET_URL}`);
console.log(`Pacing   : 1 transaction every ${INTERVAL_MS}ms\n`);

setInterval(() => {
  const payload = generatePayload();
  sendTransaction(payload);
}, INTERVAL_MS);