const { z } = require('zod');

// Regex pattern for IPv4 validation
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const transactionSchema = z.object({
  transactionId: z.string().min(5, "Invalid Transaction ID"),
  userId: z.string().min(3, "Invalid User ID"),
  amount: z.number().positive("Amount must be greater than 0"),
  currency: z.string().length(3, "Currency must be 3-letter ISO code").default("INR"),
  deviceId: z.string().min(4, "Invalid Device Identifier"),
  ipAddress: z.string().regex(ipv4Regex, { message: "Invalid IPv4 address" }),
  cardFingerprint: z.string().min(8, "Invalid Card Fingerprint Hash"),
  timestamp: z.string().datetime().optional().default(() => new Date().toISOString())
});

module.exports = { transactionSchema };