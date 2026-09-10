/**
 * Covers the transitions added for partial refunds. Kept in its own
 * file rather than editing stateMachine.test.js, so the original test
 * file -- and the guarantee that it still passes unmodified -- stays
 * untouched.
 */
const { transition, InvalidTransitionError } = require('../services/stateMachine');

describe('stateMachine (partial refunds)', () => {
  test('success + partialRefund -> partially_refunded', () => {
    expect(transition('success', 'partialRefund')).toBe('partially_refunded');
  });

  test('partially_refunded + partialRefund -> partially_refunded (further partial refund)', () => {
    expect(transition('partially_refunded', 'partialRefund')).toBe('partially_refunded');
  });

  test('partially_refunded + refund -> refunded (final settlement)', () => {
    expect(transition('partially_refunded', 'refund')).toBe('refunded');
  });

  test('rejects refunded -> partialRefund (fully refunded is terminal)', () => {
    expect(() => transition('refunded', 'partialRefund')).toThrow(InvalidTransitionError);
  });

  test('rejects pending -> partialRefund (can only refund a settled charge)', () => {
    expect(() => transition('pending', 'partialRefund')).toThrow(InvalidTransitionError);
  });

  test('original success -> refund transition is unchanged', () => {
    expect(transition('success', 'refund')).toBe('refunded');
  });
});
