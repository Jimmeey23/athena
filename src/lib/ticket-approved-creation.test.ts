import { describe, expect, it } from 'vitest';
import { buildApprovedTicketCreateRequest } from './ticket-approved-creation';

describe('approved ticket creation payload', () => {
  it('targets the ticket AI edge function create path with the approved draft and context', () => {
    const draft = {
      title: 'AC not cooling in Bandra studio',
      description: 'The AC was reported as not cooling before the evening session.',
      category: 'Repair and Maintenance',
      subCategory: 'AC and HVAC Issues',
      priority: 'High' as const,
      studio: 'Supreme HQ, Bandra',
      reportedBy: 'Ops User',
      assignedTo: 'Zahur Shaikh',
      department: 'Operations',
      tags: ['ai-draft'],
    };

    expect(buildApprovedTicketCreateRequest({
      draft,
      conversationId: 'conversation-1',
      context: { clientsAffected: 'No clients affected' },
    })).toEqual({
      action: 'createTicket',
      approved: true,
      draft,
      conversationId: 'conversation-1',
      context: { clientsAffected: 'No clients affected' },
    });
  });
});
