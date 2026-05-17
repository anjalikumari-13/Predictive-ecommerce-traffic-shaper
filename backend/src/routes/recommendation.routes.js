const express = require('express');
const { getConfig } = require('../services/config.service');

const router = express.Router();

const staticRecommendations = [
  { sku: 'lipstick-01', name: 'Matte Lip Color', source: 'static-cache' },
  { sku: 'serum-02', name: 'Vitamin C Serum', source: 'static-cache' },
  { sku: 'kajal-03', name: 'Smudge Proof Kajal', source: 'static-cache' }
];

router.get('/', async (req, res) => {
  const config = await getConfig();

  if (config.recommendationsDegraded) {
    return res.json({
      mode: 'degraded',
      reason: config.reason,
      recommendations: staticRecommendations
    });
  }

  return res.json({
    mode: 'live',
    recommendations: staticRecommendations.map((item) => ({
      ...item,
      source: 'live-personalization'
    }))
  });
});

module.exports = router;

