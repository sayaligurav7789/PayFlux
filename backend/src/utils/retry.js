/**
 * Simple exponential-backoff retry wrapper.
 *
 * v1 of this project runs this synchronously inside the request/worker
 * flow. If you later move to BullMQ, this same backoff math is what
 * you'd hand to the queue's `backoff` option -- the concept doesn't
 * change, just where it executes.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {() => Promise<any>} fn - the operation to retry
 * @param {object} opts
 * @param {number} opts.maxAttempts
 * @param {number} opts.baseDelayMs
 * @param {(err: Error) => boolean} opts.isRetryable - decides whether a given error should trigger a retry
 * @param {(attempt: number, err: Error) => void} [opts.onRetry] - callback fired before each retry
 */
async function retryWithBackoff(fn, { maxAttempts = 5, baseDelayMs = 500, isRetryable, onRetry }) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const retryable = isRetryable ? isRetryable(err) : true;
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }

      const delay = baseDelayMs * 2 ** (attempt - 1); // 500, 1000, 2000, 4000...
      if (onRetry) onRetry(attempt, err);
      await sleep(delay);
    }
  }

  throw lastError;
}

module.exports = { retryWithBackoff };
