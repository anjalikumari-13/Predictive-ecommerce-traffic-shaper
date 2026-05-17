import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: Number(__ENV.VUS || 500),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    http_req_failed: ['rate<0.60']
  }
};

export default function () {
  const payload = JSON.stringify({
    userId: `bot-${__VU}`,
    cartId: `bot-cart-${__ITER}`,
    priority: 'low',
    items: [{ sku: 'serum-02', qty: 1 }]
  });

  const res = http.post(`${baseUrl}/checkout`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ScrapyBot/1.0',
      'X-Traffic-Class': 'bot'
    }
  });

  check(res, {
    'bot traffic is shaped': (r) => [202, 429, 503].includes(r.status)
  });

  sleep(0.05);
}

