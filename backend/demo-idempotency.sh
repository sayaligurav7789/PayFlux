#!/bin/bash
# Fires 10 concurrent identical requests THROUGH THE LOAD BALANCER and shows:
#   1. Only one transaction gets created (idempotency, across instances)
#   2. Requests actually landed on different API containers (via X-Instance-Id)
#
# Run this after `docker-compose up` (all 6 services: postgres, redis,
# api1, api2, api3, nginx).
#
# Usage: ./demo-idempotency.sh

API_KEY="dev_test_key_123"
IDEMPOTENCY_KEY="demo-$(date +%s)"
URL="http://localhost:8080/transactions"   # :8080 = Nginx, not a single API instance

echo "Firing 10 concurrent requests through the load balancer (Idempotency-Key: $IDEMPOTENCY_KEY)"
echo ""

for i in $(seq 1 10); do
  curl -s -D /tmp/headers_$i.txt -o /tmp/resp_$i.json -w "Request $i -> HTTP %{http_code}\n" \
    -X POST "$URL" \
    -H "X-API-Key: $API_KEY" \
    -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
    -H "Content-Type: application/json" \
    -d '{"amount": 5000, "currency": "INR"}' &
done

wait

echo ""
echo "Which API instance handled each request (proves the load balancer is spreading requests):"
for i in $(seq 1 10); do
  instance=$(grep -i "x-instance-id" /tmp/headers_$i.txt | awk '{print $2}' | tr -d '\r')
  echo "  Request $i -> handled by ${instance:-unknown}"
done

echo ""
echo "Distinct transaction IDs created across all 10 requests (should be exactly 1):"
grep -oh '"id":"[^"]*"' /tmp/resp_*.json | sort -u

rm -f /tmp/resp_*.json /tmp/headers_*.txt