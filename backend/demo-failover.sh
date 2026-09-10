#!/bin/bash
# Demonstrates the most important flow in the routing/failover feature set:
#
#   Gateway A fails -> retries -> still failing -> automatic failover to
#   Gateway B -> success
#
# Uses the /routing/simulate/:gatewayId/force-failure endpoint (Redis-backed,
# so it applies no matter which of the three API instances behind Nginx
# handles the actual charge) to make Gateway A's failure deterministic
# instead of waiting on its ~15% random failure rate.
#
# Run this after `docker-compose up` (all 6 services: postgres, redis,
# api1, api2, api3, nginx).
#
# Usage: ./demo-failover.sh

API_KEY="dev_test_key_123"
BASE_URL="http://localhost:8080"   # :8080 = Nginx, not a single API instance
IDEMPOTENCY_KEY="failover-demo-$(date +%s)"

echo "1. Forcing Gateway A to fail on every attempt..."
curl -s -X POST "$BASE_URL/routing/simulate/gateway_a/force-failure" \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"enabled": true}'
echo ""

echo "2. Pinning routing to Gateway A (weighted 100/0) so the demo doesn't"
echo "   depend on which gateway round robin happens to pick first..."
curl -s -X PUT "$BASE_URL/routing/config" \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"strategy": "weighted", "weightGatewayA": 100, "weightGatewayB": 0}'
echo ""
echo ""

echo "3. Creating a transaction (Idempotency-Key: $IDEMPOTENCY_KEY)..."
RESPONSE=$(curl -s -X POST "$BASE_URL/transactions" \
  -H "X-API-Key: $API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "currency": "INR"}')

echo "$RESPONSE" | python3 -m json.tool
TXN_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['transaction']['id'])")

echo ""
echo "4. Orchestration timeline for $TXN_ID (retry -> failover -> success):"
curl -s "$BASE_URL/transactions/$TXN_ID/events" -H "X-API-Key: $API_KEY" \
  | python3 -c "
import json, sys
events = json.load(sys.stdin)['events']
for e in events:
    frm = e['from_status'] or '-'
    print(f\"   {frm:>18} -> {e['to_status']:<18} {e['reason']}\")
"

echo ""
echo "5. Gateway health after the demo:"
curl -s "$BASE_URL/routing/health" -H "X-API-Key: $API_KEY" | python3 -m json.tool

echo ""
echo "6. Cleaning up: turning Gateway A's forced failure back off, and"
echo "   restoring round-robin routing..."
curl -s -X POST "$BASE_URL/routing/simulate/gateway_a/force-failure" \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"enabled": false}' > /dev/null
curl -s -X PUT "$BASE_URL/routing/config" \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"strategy": "round_robin", "weightGatewayA": 50, "weightGatewayB": 50}' > /dev/null
echo "   done."
