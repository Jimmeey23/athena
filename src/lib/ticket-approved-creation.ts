export interface ApprovedTicketCreateRequestInput<TDraft extends Record<string, unknown>> {
  draft: TDraft;
  conversationId?: string | null;
  context?: Record<string, unknown>;
}

export function buildApprovedTicketCreateRequest<TDraft extends Record<string, unknown>>({
  draft,
  conversationId,
  context = {},
}: ApprovedTicketCreateRequestInput<TDraft>) {
  return {
    action: 'createTicket' as const,
    approved: true,
    draft,
    conversationId,
    context,
  };
}
