/**
 * Lightweight in-memory metrics per instance -- no new npm dependency.
 * Resets on restart, which is fine: it's meant to show live behavior
 * during a demo session, not to be a durable metrics store (that's what
 * Prometheus/Datadog are for in a real system).
 */
const state = {
  startTime: Date.now(),
  totalRequests: 0,
  totalErrors: 0,
  recentLatencies: [], // rolling window for p95
  gateway: { totalCalls: 0, successes: 0 },
};

const MAX_LATENCY_SAMPLES = 200;

function metricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    state.totalRequests += 1;
    if (res.statusCode >= 500) state.totalErrors += 1;

    state.recentLatencies.push(duration);
    if (state.recentLatencies.length > MAX_LATENCY_SAMPLES) {
      state.recentLatencies.shift();
    }
  });
  next();
}

function recordGatewayCall(success) {
  state.gateway.totalCalls += 1;
  if (success) state.gateway.successes += 1;
}

function getSnapshot() {
  const uptimeSeconds = (Date.now() - state.startTime) / 1000;
  const sorted = [...state.recentLatencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95LatencyMs = sorted.length ? sorted[Math.min(p95Index, sorted.length - 1)] : 0;

  return {
    instance: process.env.INSTANCE_ID || 'unknown',
    uptimeSeconds: Math.round(uptimeSeconds),
    totalRequests: state.totalRequests,
    requestsPerSecond: uptimeSeconds > 0 ? Number((state.totalRequests / uptimeSeconds).toFixed(2)) : 0,
    p95LatencyMs,
    errorRatePercent: state.totalRequests > 0 ? Number(((state.totalErrors / state.totalRequests) * 100).toFixed(2)) : 0,
    // "Success rate" -- the honest stand-in for uptime %, since we don't
    // track historical downtime, just observed request outcomes.
    successRatePercent:
      state.totalRequests > 0
        ? Number((((state.totalRequests - state.totalErrors) / state.totalRequests) * 100).toFixed(2))
        : 100,
    gateway: {
      totalCalls: state.gateway.totalCalls,
      successRatePercent:
        state.gateway.totalCalls > 0
          ? Number(((state.gateway.successes / state.gateway.totalCalls) * 100).toFixed(2))
          : 100,
    },
  };
}

module.exports = { metricsMiddleware, recordGatewayCall, getSnapshot };