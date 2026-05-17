const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const checkoutRoutes = require('./routes/checkout.routes');
const recommendationRoutes = require('./routes/recommendation.routes');
const internalRoutes = require('./routes/internal.routes');
const { getConfig } = require('./services/config.service');
const { metricsPayload, observeRequest } = require('./services/metrics.service');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));
app.use(observeRequest);

app.get('/', (req, res) => {
  res.json({
    name: 'Predictive E-commerce Traffic Shaper',
    status: 'ok',
    docs: '/internal/health'
  });
});

app.use('/checkout', checkoutRoutes);
app.use('/recommendations', recommendationRoutes);
app.use('/internal', internalRoutes);

app.get('/metrics', async (req, res, next) => {
  try {
    const config = await getConfig();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.end(await metricsPayload(config));
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      status: 'rejected',
      message: 'Malformed JSON body. Check request quoting or use scripts/test-checkout.ps1.'
    });
  }

  res.status(500).json({
    status: 'error',
    message: 'Unexpected service error'
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Traffic shaper API listening on ${port}`);
  });
}

module.exports = app;
