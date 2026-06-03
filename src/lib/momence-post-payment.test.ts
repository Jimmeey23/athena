import { describe, expect, it } from 'vitest';
import { postPaymentBookingRequestFromUrl } from './momence-post-payment';

describe('postPaymentBookingRequestFromUrl', () => {
  it('extracts Momence booking context from a successful Stripe redirect URL', () => {
    const request = postPaymentBookingRequestFromUrl(
      'https://app.example.com/?payment_status=success&memberId=42&sessionId=202&boughtMembershipId=11&stripe_session_id=cs_test_123'
    );

    expect(request).toEqual({
      memberId: '42',
      sessionId: '202',
      boughtMembershipId: '11',
      source: 'stripe',
      idempotencyKey: 'stripe:cs_test_123:42:202:11',
    });
  });

  it('can finalize booking from member and session ids when the bought membership id is absent', () => {
    const request = postPaymentBookingRequestFromUrl(
      'https://app.example.com/?redirect_status=succeeded&momenceMemberId=42&momenceSessionId=202'
    );

    expect(request).toMatchObject({
      memberId: '42',
      sessionId: '202',
      source: 'stripe',
      idempotencyKey: 'stripe:no-session:42:202:auto',
    });
    expect(request?.boughtMembershipId).toBeUndefined();
  });

  it('treats a Stripe checkout session id on a return URL as a success signal', () => {
    const request = postPaymentBookingRequestFromUrl(
      'https://app.example.com/?session_id=cs_test_456&memberId=42&sessionId=202&membershipId=999'
    );

    expect(request).toMatchObject({
      memberId: '42',
      sessionId: '202',
      source: 'stripe',
      idempotencyKey: 'stripe:cs_test_456:42:202:auto',
    });
    expect(request?.boughtMembershipId).toBeUndefined();
  });

  it('ignores unsuccessful redirects and incomplete booking context', () => {
    expect(postPaymentBookingRequestFromUrl('https://app.example.com/?payment_status=failed&memberId=42&sessionId=202')).toBeNull();
    expect(postPaymentBookingRequestFromUrl('https://app.example.com/?payment_status=success&memberId=42')).toBeNull();
  });
});
