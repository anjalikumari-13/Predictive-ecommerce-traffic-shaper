const express = require('express');
const { z } = require('zod');
const { randomUUID } = require('node:crypto');
const { getConfig } = require('../services/config.service');
const { enqueueCheckoutJob } = require('../services/queue.service');
const { checkRateLimit } = require('../services/rateLimiter.service');
const { assertCheckoutHealthy } = require('../services/circuitBreaker.service');
const {
  checkoutAccepted,
  checkoutRejected,
  suspiciousCounter,
  countMinuteMetric
} = require('../services/metrics.service');

const router = express.Router();

const checkoutSchema = z.object({
  userId: z.string().min(1),
  cartId: z.string().min(1),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  items: z.array(z.object({
    sku: z.string().min(1),
    qty: z.number().int().positive()
  })).min(1)
});

router.post('/', async (req, res, next) => {
  try {
    await countMinuteMetric('requests');
    const body = checkoutSchema.parse(req.body);
    const config = await getConfig();
    const rateLimit = await checkRateLimit(req, config);

    if (rateLimit.suspicious) {
      suspiciousCounter.inc();
      await countMinuteMetric('suspicious');
    }

    if (!rateLimit.allowed) {
      checkoutRejected.inc({ reason: 'rate_limit' });
      await countMinuteMetric('errors');
      return res.status(429).json({
        status: 'queued',
        message: config.smartQueueMessage,
        retryAfterSeconds: 30,
        limit: rateLimit.limit
      });
    }

    await assertCheckoutHealthy();

    const requestId = randomUUID();
    const job = await enqueueCheckoutJob({
      requestId,
      ...body,
      sourceIp: req.ip,
      suspicious: rateLimit.suspicious,
      receivedAt: new Date().toISOString()
    });

    checkoutAccepted.inc();

    return res.status(202).json({
      status: 'accepted',
      requestId,
      jobId: job.id,
      message: 'Checkout request accepted into Smart Queue.'
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      checkoutRejected.inc({ reason: 'validation' });
      await countMinuteMetric('errors');
      return res.status(400).json({ status: 'rejected', issues: error.issues });
    }

    if (error.statusCode === 503) {
      checkoutRejected.inc({ reason: 'circuit_open' });
      await countMinuteMetric('errors');
      return res.status(503).json({
        status: 'busy',
        message: "We're busy, hold tight. Checkout is protected while we recover capacity."
      });
    }

    return next(error);
  }
});

module.exports = router;
