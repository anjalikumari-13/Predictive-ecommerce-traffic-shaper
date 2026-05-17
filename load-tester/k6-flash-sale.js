import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const vus = Number(__ENV.VUS || 1000);

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'ramping-vus',
      stages: [
        { duration: '20s', target: Math.min(vus, 500) },
        { duration: '40s', target: vus },
        { duration: '30s', target: vus },
        { duration: '20s', target: 0 }
      ]
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.40'],
    http_req_duration: ['p(95)<1200']
  }
};

export default function () {
  const payload = JSON.stringify({
    userId: `user-${__VU}`,
    cartId: `cart-${__VU}-${__ITER}`,
    priority: __ITER % 20 === 0 ? 'high' : 'normal',
    items: [{ sku: 'lipstick-01', qty: 1 }]
  });

  const res = http.post(`${baseUrl}/checkout`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': `user-${__VU}`
    }
  });

  check(res, {
    'accepted or shaped safely': (r) => [202, 429, 503].includes(r.status)
  });

  sleep(0.1);
}

