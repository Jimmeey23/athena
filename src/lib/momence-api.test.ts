import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backendSupabase } from './backend-supabase';
import {
  buildMomenceInsightSummary,
  freezeMomenceMembership,
  listMomenceHostMembershipOptions,
  loadMomenceTicketContext,
  scheduleMomenceMembershipUnfreeze,
  searchMomenceSessions,
  unfreezeMomenceMembership,
} from './momence-api';

vi.mock('./backend-supabase', () => ({
  backendSupabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('buildMomenceInsightSummary', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('summarizes member, memberships, bookings, notes, and tags for ticket context', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T00:00:00.000Z'));

    const summary = buildMomenceInsightSummary({
      member: {
        id: 42,
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha@example.com',
        phoneNumber: '+919900000000',
        firstSeen: '2025-01-01T10:00:00.000Z',
        lastSeen: '2026-05-29T07:30:00.000Z',
        customerTags: [{ id: 7, name: 'VIP' }, { id: 8, name: 'Retention Risk' }],
      },
      memberships: [
        {
          id: 11,
          type: 'package-events',
          membership: { id: 1, name: 'Unlimited Monthly' },
          isFrozen: true,
          eventCreditsLeft: 8,
          eventCreditsTotal: 12,
          moneyCreditsLeft: 5000,
          moneyCreditsTotal: 10000,
          usageLimitStartDate: '2026-05-01T00:00:00.000Z',
          usageLimitEndDate: '2026-05-31T23:59:59.000Z',
          freeze: {
            freezedAt: '2026-05-15T00:00:00.000Z',
            unfreezedScheduledAt: '2026-05-25T00:00:00.000Z',
            unfrozenAt: null,
            remainingFreezedMinutes: 1440,
            scheduledFreezeAt: null,
          },
          startDate: '2026-05-01T00:00:00.000Z',
          endDate: '2026-05-31T23:59:59.000Z',
        },
      ],
      memberBookings: [
        {
          id: 101,
          checkedIn: true,
          session: {
            id: 201,
            name: 'Signature Barre',
            startsAt: '2026-05-28T04:30:00.000Z',
            teacher: { firstName: 'Nina', lastName: 'Shah' },
            inPersonLocation: { name: 'Bandra' },
          },
        },
        {
          id: 102,
          checkedIn: false,
          session: {
            id: 202,
            name: 'Power Sculpt',
            startsAt: '2026-06-01T04:30:00.000Z',
            teacher: { firstName: 'Mira', lastName: 'Kapoor' },
            inPersonLocation: { name: 'Bandra' },
          },
        },
      ],
      notes: [{ id: 501, note: '<p>Prefers WhatsApp follow-up.</p>', modifiedAt: '2026-05-20T09:00:00.000Z' }],
      session: {
        id: 202,
        name: 'Power Sculpt',
        startsAt: '2026-06-01T04:30:00.000Z',
        endsAt: '2026-06-01T05:30:00.000Z',
        capacity: 20,
        bookingCount: 18,
        waitlistBookingCount: 2,
        teacher: { firstName: 'Mira', lastName: 'Kapoor' },
        inPersonLocation: { name: 'Bandra' },
      },
      sessionBookings: [
        { id: 301, member: { id: 42, firstName: 'Asha', lastName: 'Rao' }, checkedIn: false },
        { id: 302, member: { id: 99, firstName: 'Priya', lastName: 'Mehta' }, checkedIn: true },
      ],
      tags: [],
    });

    expect(summary.member?.name).toBe('Asha Rao');
    expect(summary.member?.tags).toEqual(['VIP', 'Retention Risk']);
    expect(summary.membershipOverview.activeCount).toBe(0);
    expect(summary.membershipOverview.frozenCount).toBe(1);
    expect(summary.membershipOverview.memberships[0]).toMatchObject({
      id: '11',
      type: 'package-events',
      status: 'Frozen',
      moneyCreditsLabel: '5000/10000 money credits left',
      freezeLabel: 'Frozen now',
      scheduledUnfreezeAt: '2026-05-25T00:00:00.000Z',
      usagePeriodLabel: 'Usage window 2026-05-01T00:00:00.000Z to 2026-05-31T23:59:59.000Z',
    });
    expect(summary.bookingOverview.totalLoaded).toBe(2);
    expect(summary.bookingOverview.lastVisit?.classType).toBe('Signature Barre');
    expect(summary.bookingOverview.nextBooking?.classType).toBe('Power Sculpt');
    expect(summary.noteOverview.latestNote).toBe('Prefers WhatsApp follow-up.');
    expect(summary.session?.fillRateLabel).toBe('18/20 booked');
    expect(summary.session?.matchingMemberBookingId).toBe('301');
    expect(summary.ticketContextLines).toContain('Momence member: Asha Rao');
  });
});

describe('Momence membership freeze actions', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MOMENCE_FUNCTION_URL', 'http://localhost/momence-search');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('freezes bought memberships through the host membership-freeze endpoint', async () => {
    await freezeMomenceMembership('42', '11', {
      freezeAt: '2026-06-01T00:00:00.000Z',
      unfreezeAt: '2026-06-10T00:00:00.000Z',
      reason: 'Medical travel',
    });

    expect(fetch).toHaveBeenCalledWith('http://localhost/momence-search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        path: '/host/members/42/bought-memberships/11/membership-freeze',
        method: 'PUT',
        params: {},
        body: {
          freezeType: 'scheduled',
          freezeAt: '2026-06-01T00:00:00.000Z',
          unfreezeType: 'scheduled',
          unfreezeAt: '2026-06-10T00:00:00.000Z',
          reason: 'Medical travel',
        },
      }),
    }));
  });

  it('unfreezes bought memberships by deleting membership-schedule-freeze', async () => {
    await unfreezeMomenceMembership('42', '11');

    expect(fetch).toHaveBeenCalledWith('http://localhost/momence-search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        path: '/host/members/42/bought-memberships/11/membership-schedule-freeze',
        method: 'DELETE',
        params: {},
        body: undefined,
      }),
    }));
  });

  it('schedules membership unfreezes through membership-schedule-unfreeze', async () => {
    await scheduleMomenceMembershipUnfreeze('42', '11', '2026-06-15T00:00:00.000Z');

    expect(fetch).toHaveBeenCalledWith('http://localhost/momence-search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        path: '/host/members/42/bought-memberships/11/membership-schedule-unfreeze',
        method: 'PUT',
        params: {},
        body: {
          unfreezeType: 'scheduled',
          unfreezeAt: '2026-06-15T00:00:00.000Z',
        },
      }),
    }));
  });
});

describe('Momence host membership options', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MOMENCE_FUNCTION_URL', 'http://localhost/momence-search');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads available membership names from the host memberships endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      payload: [
        { id: 1, name: 'Studio 8 Class Package', disabled: false },
        { id: 2, name: 'Studio 8 Class Package', disabled: false },
        { id: 3, name: 'Disabled Legacy Package', disabled: true },
        { id: 4, name: 'Studio Annual Unlimited Membership', disabled: false },
      ],
    }), { status: 200 })));

    await expect(listMomenceHostMembershipOptions()).resolves.toEqual([
      'Studio 8 Class Package',
      'Studio Annual Unlimited Membership',
    ]);

    expect(fetch).toHaveBeenCalledWith('http://localhost/momence-search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        path: '/host/memberships',
        method: 'GET',
        params: {
          page: 0,
          pageSize: 200,
          sortBy: 'name',
          sortOrder: 'ASC',
          includeDisabled: false,
        },
        body: undefined,
      }),
    }));
  });
});

describe('Momence session search', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MOMENCE_SESSION_FUNCTION_URL', 'http://localhost/momence-session-search');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('requests private Momence sessions for hosted class session options', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      payload: [{
        id: 501,
        name: 'Studio Hosted Class',
        startsAt: '2026-06-02T05:00:00.000Z',
        teacher: { firstName: 'Anisha', lastName: 'Shah' },
        inPersonLocation: { name: 'Kwality House, Kemps Corner' },
        bookingCount: 12,
        capacity: 20,
      }],
    }), { status: 200 })));

    const sessions = await searchMomenceSessions('');

    expect(sessions[0]).toMatchObject({
      id: '501',
      classType: 'Studio Hosted Class',
      trainer: 'Anisha Shah',
      studio: 'Kwality House, Kemps Corner',
    });
    expect(fetch).toHaveBeenCalledWith('http://localhost/momence-session-search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        query: '',
        pastDays: 180,
        futureDays: 45,
        pageSize: 200,
        includeCancelled: false,
        types: ['private'],
      }),
    }));
  });
});

describe('loadMomenceTicketContext', () => {
  it('returns an empty summary when no Momence member or session is selected', async () => {
    const context = await loadMomenceTicketContext({});

    expect(context.summary.member).toBeUndefined();
    expect(context.summary.ticketContextLines).toEqual([]);
  });
});
