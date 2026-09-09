const { transition, isTerminal, InvalidTransitionError } = require('../services/stateMachine');

describe('stateMachine', () => {
  test('initiated + start -> pending', () => {
    expect(transition('initiated', 'start')).toBe('pending');
  });

  test('pending + gatewaySuccess -> success', () => {
    expect(transition('pending', 'gatewaySuccess')).toBe('success');
  });

  test('pending + gatewayFailure -> failed', () => {
    expect(transition('pending', 'gatewayFailure')).toBe('failed');
  });

  test('success + refund -> refunded', () => {
    expect(transition('success', 'refund')).toBe('refunded');
  });

  test('rejects failed -> success', () => {
    expect(() => transition('failed', 'gatewaySuccess')).toThrow(InvalidTransitionError);
  });

  test('rejects refunded -> anything', () => {
    expect(() => transition('refunded', 'refund')).toThrow(InvalidTransitionError);
  });

  test('rejects initiated -> success (skipping pending)', () => {
    expect(() => transition('initiated', 'gatewaySuccess')).toThrow(InvalidTransitionError);
  });

  test('rejects unknown event', () => {
    expect(() => transition('pending', 'bogusEvent')).toThrow(InvalidTransitionError);
  });

  test('isTerminal identifies terminal states correctly', () => {
    expect(isTerminal('success')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('refunded')).toBe(true);
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('initiated')).toBe(false);
  });
});
