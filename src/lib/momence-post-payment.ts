export interface MomencePostPaymentBookingRequest {
  memberId: string;
  sessionId: string;
  boughtMembershipId?: string;
  source: 'stripe';
  idempotencyKey: string;
}

const SUCCESS_VALUES = new Set(['1', 'true', 'success', 'succeeded', 'paid', 'complete', 'completed']);
const FAILURE_VALUES = new Set(['0', 'false', 'fail', 'failed', 'cancel', 'cancelled', 'canceled', 'incomplete']);

function firstParam(params: URLSearchParams, names: string[]): string | undefined {
  for (const name of names) {
    const value = params.get(name);
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function hasSuccessfulPaymentSignal(params: URLSearchParams, stripeSessionId?: string): boolean {
  const explicitStatus = firstParam(params, [
    'payment_status',
    'redirect_status',
    'stripe_status',
    'checkout_status',
    'status',
  ]);
  if (explicitStatus) {
    const normalized = explicitStatus.toLowerCase();
    if (FAILURE_VALUES.has(normalized)) return false;
    if (SUCCESS_VALUES.has(normalized)) return true;
  }

  const explicitSuccess = firstParam(params, ['stripe_success', 'checkout_success', 'success']);
  if (explicitSuccess) {
    const normalized = explicitSuccess.toLowerCase();
    if (FAILURE_VALUES.has(normalized)) return false;
    if (SUCCESS_VALUES.has(normalized)) return true;
  }

  return Boolean(stripeSessionId?.startsWith('cs_'));
}

export function postPaymentBookingRequestFromUrl(url: string | URL): MomencePostPaymentBookingRequest | null {
  const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const parsedUrl = typeof url === 'string' ? new URL(url, baseUrl) : url;
  const params = parsedUrl.searchParams;
  const memberId = firstParam(params, ['memberId', 'momenceMemberId', 'momence_member_id', 'member_id']);
  const sessionId = firstParam(params, ['sessionId', 'momenceSessionId', 'momence_session_id', 'classSessionId', 'class_session_id']);
  const boughtMembershipId = firstParam(params, [
    'boughtMembershipId',
    'momenceBoughtMembershipId',
    'momence_bought_membership_id',
    'bought_membership_id',
  ]);
  const stripeSessionId = firstParam(params, [
    'stripe_session_id',
    'stripeSessionId',
    'checkout_session_id',
    'checkoutSessionId',
    'session_id',
  ]);

  if (!memberId || !sessionId || !hasSuccessfulPaymentSignal(params, stripeSessionId)) {
    return null;
  }

  return {
    memberId,
    sessionId,
    ...(boughtMembershipId ? { boughtMembershipId } : {}),
    source: 'stripe',
    idempotencyKey: `stripe:${stripeSessionId || 'no-session'}:${memberId}:${sessionId}:${boughtMembershipId || 'auto'}`,
  };
}
