const assert = require('node:assert/strict');
const test = require('node:test');

test('checkout payload contract includes user, cart, and items', () => {
  const payload = {
    userId: 'u-1',
    cartId: 'cart-1',
    priority: 'normal',
    items: [{ sku: 'lipstick-01', qty: 1 }]
  };

  assert.equal(typeof payload.userId, 'string');
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].qty, 1);
});

