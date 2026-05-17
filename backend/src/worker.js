const { Worker } = require('bullmq');
const { connection } = require('./services/redis');

const concurrency = Number(process.env.WORKER_CONCURRENCY || 10);
const dbLatencyMs = Number(process.env.SIMULATED_DB_LATENCY_MS || 80);
const paymentLatencyMs = Number(process.env.SIMULATED_PAYMENT_LATENCY_MS || 60);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(base) {
  const spread = Math.max(base * 0.4, 20);
  return Math.round(base + (Math.random() * spread) - (spread / 2));
}

async function recordLatency(latencyMs) {
  const key = 'traffic-shaper:dependency:p95-latency-ms';
  const previous = Number(await connection.get(key) || 0);
  const approximateP95 = Math.max(latencyMs, Math.round(previous * 0.85));
  await connection.set(key, approximateP95, 'EX', 30);
}

async function processCheckout(job) {
  const inventoryLatency = jitter(dbLatencyMs);
  const orderLatency = jitter(dbLatencyMs);
  const paymentLatency = jitter(paymentLatencyMs);
  const totalDependencyLatency = inventoryLatency + orderLatency;

  await sleep(inventoryLatency);
  await sleep(orderLatency);
  await sleep(paymentLatency);
  await recordLatency(totalDependencyLatency);

  const paymentFailure = Math.random() < 0.01;
  if (paymentFailure) {
    throw new Error(`payment failed for request ${job.data.requestId}`);
  }

  await connection.hset(`traffic-shaper:order:${job.data.requestId}`, {
    status: 'confirmed',
    userId: job.data.userId,
    cartId: job.data.cartId,
    completedAt: new Date().toISOString()
  });

  return {
    requestId: job.data.requestId,
    status: 'confirmed',
    totalDependencyLatency
  };
}

const worker = new Worker('checkout', processCheckout, {
  connection,
  concurrency
});

worker.on('completed', (job, result) => {
  console.log(`completed checkout job ${job.id}`, result);
});

worker.on('failed', async (job, err) => {
  await connection.incr('traffic-shaper:worker-failures');
  console.error(`failed checkout job ${job?.id}`, err);
});

console.log(`Checkout worker started with concurrency=${concurrency}`);

