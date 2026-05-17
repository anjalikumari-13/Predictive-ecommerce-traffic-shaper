const { connection } = require('./redis');

const CONFIG_KEY = 'traffic-shaper:dynamic-config';

const defaults = {
  mode: 'normal',
  checkoutRatePerMinute: 600,
  botThrottlePerMinute: 20,
  recommendationsDegraded: false,
  smartQueueMessage: "We're busy, hold tight. Your checkout is safely queued.",
  reason: 'boot defaults'
};

function normalizeConfig(config) {
  return {
    ...defaults,
    ...config,
    checkoutRatePerMinute: Number(config.checkoutRatePerMinute ?? defaults.checkoutRatePerMinute),
    botThrottlePerMinute: Number(config.botThrottlePerMinute ?? defaults.botThrottlePerMinute),
    recommendationsDegraded: String(config.recommendationsDegraded) === 'true' || config.recommendationsDegraded === true
  };
}

async function getConfig() {
  const stored = await connection.hgetall(CONFIG_KEY);
  if (!stored || Object.keys(stored).length === 0) {
    await setConfig(defaults);
    return defaults;
  }
  return normalizeConfig(stored);
}

async function setConfig(update) {
  const next = normalizeConfig(update);
  await connection.hset(CONFIG_KEY, {
    ...next,
    recommendationsDegraded: String(next.recommendationsDegraded),
    updatedAt: new Date().toISOString()
  });
  return next;
}

module.exports = { getConfig, setConfig, defaults };

