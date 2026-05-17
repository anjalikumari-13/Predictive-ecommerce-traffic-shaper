$body = @{
  userId = "u-1"
  cartId = "cart-1"
  priority = "normal"
  items = @(
    @{
      sku = "lipstick-01"
      qty = 1
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "http://localhost:3000/checkout" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
