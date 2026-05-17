const express = require('express');
const { getConfig, setConfig } = require('../services/config.service');
const { healthSnapshot } = require('../services/metrics.service');

const router = express.Router();

router.get('/config', async (req, res) => {
  res.json(await getConfig());
});

router.put('/config', async (req, res) => {
  const current = await getConfig();
  const next = await setConfig({ ...current, ...req.body });
  res.json(next);
});

router.get('/health', async (req, res) => {
  const config = await getConfig();
  res.json(await healthSnapshot(config));
});

module.exports = router;

