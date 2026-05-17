const { Queue } = require('bullmq');
const { connection } = require('./redis');

const checkoutQueue = new Queue('checkout', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 300 },
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail: { age: 86400, count: 10000 }
  }
});

async function enqueueCheckoutJob(payload) {
  const priority = payload.priority === 'high' ? 1 : payload.priority === 'low' ? 10 : 5;
  return checkoutQueue.add('checkout', payload, { priority });
}

async function getQueueStats() {
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    checkoutQueue.getWaitingCount(),
    checkoutQueue.getActiveCount(),
    checkoutQueue.getDelayedCount(),
    checkoutQueue.getFailedCount(),
    checkoutQueue.getCompletedCount()
  ]);

  return {
    waiting,
    active,
    delayed,
    failed,
    completed,
    depth: waiting + active + delayed
  };
}

module.exports = { checkoutQueue, enqueueCheckoutJob, getQueueStats };

