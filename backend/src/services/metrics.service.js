const client = require('prom-client');
const { getQueueStats } = require('./queue.service');
const { getCircuitState } = require('./circuitBreaker.service');
const { connection } = require('./redis');

client.collectDefaultMetrics({ prefix: 'traffic_shaper_' });

const httpDuration = new client.Histogram({
  name: 'traffic_shaper_http_request_duration_seconds',
  help: 'HTTP request duration by route and status',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
});

const checkoutAccepted = new client.Counter({
  name: 'traffic_shaper_checkout_accepted_total',
  help: 'Checkout requests accepted into the queue'
});

const checkoutRejected = new client.Counter({
  name: 'traffic_shaper_checkout_rejected_total',
  help: 'Checkout requests rejected by rate limiter or circuit breaker',
  labelNames: ['reason']
});

const queueDepthGauge = new client.Gauge({
  name: 'traffic_shaper_checkout_queue_depth',
  help: 'Checkout queue depth'
});

const dependencyLatencyGauge = new client.Gauge({
  name: 'traffic_shaper_dependency_p95_latency_ms',
  help: 'Worker-observed downstream dependency p95 latency in milliseconds'
});

const configModeGauge = new client.Gauge({
  name: 'traffic_shaper_mode',
  help: 'Traffic shaper mode as numeric value: normal=0, surge=1, critical=2, bot_attack=3'
});

const suspiciousCounter = new client.Counter({
  name: 'traffic_shaper_suspicious_requests_total',
  help: 'Suspicious requests seen by classifier'
});

function modeToNumber(mode) {
  return { normal: 0, surge: 1, critical: 2, bot_attack: 3 }[mode] ?? 0;
}

function observeRequest(req, res, next) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: req.route?.path || req.path || 'unknown',
      status: String(res.statusCode)
    });
  });
  next();
}

async function refreshOperationalGauges(config) {
  const stats = await getQueueStats();
  queueDepthGauge.set(stats.depth);
  configModeGauge.set(modeToNumber(config.mode));

  const latency = Number(await connection.get('traffic-shaper:dependency:p95-latency-ms') || 0);
  dependencyLatencyGauge.set(latency);
}

async function metricsPayload(config) {
  await refreshOperationalGauges(config);
  return client.register.metrics();
}

async function healthSnapshot(config) {
  const stats = await getQueueStats();
  const dependencyLatencyMs = Number(await connection.get('traffic-shaper:dependency:p95-latency-ms') || 0);
  const requestsLastMinute = Number(await connection.get('traffic-shaper:requests:last-minute') || 0);
  const errorsLastMinute = Number(await connection.get('traffic-shaper:errors:last-minute') || 0);
  const suspiciousLastMinute = Number(await connection.get('traffic-shaper:suspicious:last-minute') || 0);

  return {
    service: 'predictive-ecommerce-traffic-shaper',
    now: new Date().toISOString(),
    config,
    circuitState: getCircuitState(),
    queue: stats,
    dependencyLatencyMs,
    requestsLastMinute,
    errorsLastMinute,
    suspiciousLastMinute,
    errorRate: requestsLastMinute === 0 ? 0 : errorsLastMinute / requestsLastMinute,
    suspiciousRatio: requestsLastMinute === 0 ? 0 : suspiciousLastMinute / requestsLastMinute
  };
}

async function countMinuteMetric(name, incrementBy = 1) {
  const key = `traffic-shaper:${name}:last-minute`;
  await connection.incrby(key, incrementBy);
  await connection.expire(key, 65);
}

module.exports = {
  client,
  observeRequest,
  metricsPayload,
  healthSnapshot,
  checkoutAccepted,
  checkoutRejected,
  suspiciousCounter,
  countMinuteMetric
};

