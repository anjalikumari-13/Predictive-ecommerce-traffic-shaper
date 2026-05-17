const CircuitBreaker = require('opossum');
const { connection } = require('./redis');

const LATENCY_KEY = 'traffic-shaper:dependency:p95-latency-ms';
const threshold = Number(process.env.CIRCUIT_LATENCY_THRESHOLD_MS || 200);

async function dependencyHealthProbe() {
  const rawLatency = await connection.get(LATENCY_KEY);
  const latency = Number(rawLatency || 0);
  if (latency > threshold) {
    throw new Error(`dependency latency ${latency}ms is above ${threshold}ms`);
  }
  return { latency };
}

const breaker = new CircuitBreaker(dependencyHealthProbe, {
  timeout: 300,
  errorThresholdPercentage: 50,
  resetTimeout: 5000,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10
});

breaker.fallback(() => ({
  fallback: true,
  reason: 'checkout dependency circuit is open'
}));

async function assertCheckoutHealthy() {
  const result = await breaker.fire();
  if (result.fallback) {
    const error = new Error(result.reason);
    error.statusCode = 503;
    throw error;
  }
  return result;
}

function getCircuitState() {
  if (breaker.opened) return 'open';
  if (breaker.halfOpen) return 'half-open';
  return 'closed';
}

module.exports = { assertCheckoutHealthy, getCircuitState, LATENCY_KEY };

