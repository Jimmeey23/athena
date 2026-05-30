import { describe, expect, it } from 'vitest';
import { ticketingFunctionHeaders } from './ticketing-function-auth';

describe('ticketing function invocation', () => {
  it('forwards the authenticated user token when invoking ticketing functions', () => {
    expect(ticketingFunctionHeaders('session-token')).toEqual({
      Authorization: 'Bearer session-token',
    });
  });

  it('omits auth headers when no user token is available', () => {
    expect(ticketingFunctionHeaders('')).toEqual(undefined);
    expect(ticketingFunctionHeaders(undefined)).toEqual(undefined);
  });
});
