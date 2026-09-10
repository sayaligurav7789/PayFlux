/**
 * Guarded finite-state-machine for the transaction lifecycle.
 *
 *   initiated --start--> pending --gatewaySuccess--> success --refund--> refunded
 *                            \--gatewayFailure--> failed
 *
 *   success --partialRefund--> partially_refunded --refund--> refunded
 *                                    \--partialRefund--> partially_refunded (further partial refunds)
 *
 * Only the transitions listed below are legal. Anything else (e.g.
 * failed -> success) throws InvalidTransitionError instead of silently
 * mutating state — this is what "guarded" means and it's the thing to
 * point at in an interview, not just the enum column.
 *
 * 'refund' always means "this refund fully settles the remaining
 * balance" (-> refunded); 'partialRefund' means "some balance remains"
 * (-> partially_refunded). Which event applies is decided by amount
 * math in transactionService.refundTransaction, not here -- this module
 * only guards which status transitions are legal once that decision is
 * made.
 */

class InvalidTransitionError extends Error {
  constructor(currentStatus, event) {
    super(`Cannot apply event "${event}" from status "${currentStatus}"`);
    this.name = 'InvalidTransitionError';
    this.currentStatus = currentStatus;
    this.event = event;
    this.statusCode = 409;
  }
}

const TRANSITIONS = {
  initiated: { start: 'pending' },
  pending: { gatewaySuccess: 'success', gatewayFailure: 'failed' },
  success: { refund: 'refunded', partialRefund: 'partially_refunded' },
  partially_refunded: { refund: 'refunded', partialRefund: 'partially_refunded' },
  failed: {},
  refunded: {},
};

/**
 * @param {string} currentStatus - current transaction status
 * @param {string} event - the event being applied
 * @returns {string} the resulting status
 * @throws {InvalidTransitionError} if the transition isn't legal
 */
function transition(currentStatus, event) {
  const next = TRANSITIONS[currentStatus]?.[event];
  if (!next) {
    throw new InvalidTransitionError(currentStatus, event);
  }
  return next;
}

function isTerminal(status) {
  return status === 'success' || status === 'failed' || status === 'refunded';
}

module.exports = { transition, isTerminal, InvalidTransitionError, TRANSITIONS };
