const { connection } = require('./redis');

function identityFromRequest(req) {
  return req.headers['x-user-id'] || req.body?.userId || req.ip || 'anonymous';
}

function isSuspicious(req) {
  const agent = String(req.headers['user-agent'] || '').toLowerCase();
  const suspiciousHeader = String(req.headers['x-traffic-class'] || '').toLowerCase() === 'bot';
  return suspiciousHeader || agent.includes('bot') || agent.includes('crawler') || agent.includes('scrapy');
}

async function checkRateLimit(req, config) {
  const suspicious = isSuspicious(req);
  const limit = suspicious ? config.botThrottlePerMinute : config.checkoutRatePerMinute;
  const identity = identityFromRequest(req);
  const now = Math.floor(Date.now() / 60000);
  const key = `traffic-shaper:rate:${suspicious ? 'bot' : 'checkout'}:${identity}:${now}`;
  const count = await connection.incr(key);
  if (count === 1) {
    await connection.expire(key, 70);
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(limit - count, 0),
    suspicious
  };
}

module.exports = { checkRateLimit, isSuspicious };

