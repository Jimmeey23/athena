import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMomenceMemberToSessionForFree,
  addMomenceMemberToWaitlist,
  assignMomenceTag,
  cancelMomenceBooking,
  checkInMomenceBooking,
  freezeMomenceMembership,
  loadMomenceTicketContext,
  MomenceMemberOption,
  MomenceSessionOption,
  MomenceTicketContext,
  removeScheduledMomenceMembershipUnfreeze,
  removeMomenceBookingCheckIn,
  scheduleMomenceMembershipUnfreeze,
  searchMomenceMembers,
  searchMomenceSessions,
  unfreezeMomenceMembership,
  unassignMomenceTag,
} from '@/lib/momence-api';
import {
  BadgeCheck,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
  Tag,
  User,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

const emptyState: MomenceTicketContext = {
  memberships: [],
  memberBookings: [],
  notes: [],
  sessionBookings: [],
  tags: [],
  summary: {
    membershipOverview: { activeCount: 0, frozenCount: 0, memberships: [] },
    bookingOverview: {
      totalLoaded: 0,
      checkedInCount: 0,
      cancelledCount: 0,
      recentBookings: [],
    },
    noteOverview: { count: 0 },
    availableTagCount: 0,
    ticketContextLines: [],
  },
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function toApiDateTime(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

async function confirmed(message: string, action: () => Promise<unknown>) {
  if (!window.confirm(message)) return false;
  await action();
  return true;
}

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; count?: number }> = ({ icon, title, count }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{icon}</span>
    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</span>
    {count != null && (
      <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{count}</span>
    )}
  </div>
);

const FieldRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
    <span className="shrink-0 text-[11px] font-semibold text-slate-400">{label}</span>
    <span className="text-right text-[11px] text-slate-700 break-words">{value || '—'}</span>
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; tone?: 'blue' | 'emerald' | 'amber' | 'red' | 'slate' }> = ({ children, tone = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    red: 'bg-red-50 border-red-100 text-red-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors[tone]}`}>
      {children}
    </span>
  );
};

const ActionBtn: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'danger' | 'neutral';
  size?: 'sm' | 'xs';
}> = ({ children, onClick, disabled = false, loading = false, tone = 'primary', size = 'sm' }) => {
  const colors = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-[0_4px_14px_rgba(37,99,235,0.25)] disabled:opacity-40',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-[0_4px_14px_rgba(239,68,68,0.20)] disabled:opacity-40',
    neutral: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40',
  };
  const sizes = {
    sm: 'h-8 px-3 text-[11px]',
    xs: 'h-7 px-2.5 text-[10px]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition ${colors[tone]} ${sizes[size]} disabled:cursor-not-allowed`}
    >
      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </button>
  );
};

const MemberSearchBox: React.FC<{
  query: string;
  onQueryChange: (q: string) => void;
  options: MomenceMemberOption[];
  selected: MomenceMemberOption | null;
  onSelect: (m: MomenceMemberOption) => void;
  onClear: () => void;
}> = ({ query, onQueryChange, options, selected, onSelect, onClear }) => (
  <div className="relative">
    <div className={`flex items-center gap-2 rounded-xl border ${selected ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'} px-3 py-2 transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100`}>
      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      {selected ? (
        <>
          <span className="flex-1 text-[12px] font-semibold text-emerald-800 truncate">{selected.label}</span>
          <button type="button" onClick={onClear} className="text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search member by name, email, phone…"
          className="flex-1 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
        />
      )}
    </div>
    {!selected && options.length > 0 && (
      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.14)]">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt)}
            className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs last:border-0 hover:bg-blue-50"
          >
            <div className="font-semibold text-slate-800">{opt.label}</div>
            {opt.description && <div className="mt-0.5 text-[11px] text-slate-500">{opt.description}</div>}
          </button>
        ))}
      </div>
    )}
  </div>
);

const SessionSearchBox: React.FC<{
  query: string;
  onQueryChange: (q: string) => void;
  options: MomenceSessionOption[];
  selected: MomenceSessionOption | null;
  onSelect: (s: MomenceSessionOption) => void;
  onClear: () => void;
}> = ({ query, onQueryChange, options, selected, onSelect, onClear }) => (
  <div className="relative">
    <div className={`flex items-center gap-2 rounded-xl border ${selected ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'} px-3 py-2 transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100`}>
      <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      {selected ? (
        <>
          <span className="flex-1 text-[12px] font-semibold text-emerald-800 truncate">{selected.label}</span>
          <button type="button" onClick={onClear} className="text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search session / class…"
          className="flex-1 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
        />
      )}
    </div>
    {!selected && options.length > 0 && (
      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.14)]">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt)}
            className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs last:border-0 hover:bg-blue-50"
          >
            <div className="font-semibold text-slate-800">{opt.label}</div>
            {opt.description && <div className="mt-0.5 text-[11px] text-slate-500">{opt.description}</div>}
          </button>
        ))}
      </div>
    )}
  </div>
);

export const StandaloneMomencePanel: React.FC = () => {
  const [memberQuery, setMemberQuery] = useState('');
  const [sessionQuery, setSessionQuery] = useState('');
  const [memberOptions, setMemberOptions] = useState<MomenceMemberOption[]>([]);
  const [sessionOptions, setSessionOptions] = useState<MomenceSessionOption[]>([]);
  const [selectedMember, setSelectedMember] = useState<MomenceMemberOption | null>(null);
  const [selectedSession, setSelectedSession] = useState<MomenceSessionOption | null>(null);
  const [data, setData] = useState<MomenceTicketContext>(emptyState);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [freezeAt, setFreezeAt] = useState('');
  const [unfreezeAt, setUnfreezeAt] = useState('');
  const [freezeReason, setFreezeReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'member' | 'session' | 'tags'>('member');

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (memberQuery.trim().length < 2) { setMemberOptions([]); return; }
      try {
        setMemberOptions(await searchMomenceMembers(memberQuery));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Member search failed');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [memberQuery]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      try {
        setSessionOptions(await searchMomenceSessions(sessionQuery));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Session search failed');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [sessionQuery]);

  const loadContext = useCallback(async () => {
    if (!selectedMember && !selectedSession) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      setData(await loadMomenceTicketContext({
        memberId: selectedMember?.id,
        sessionId: selectedSession?.id,
        includeTags: true,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Momence context');
    } finally {
      setLoading(false);
    }
  }, [selectedMember, selectedSession]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const runAction = async (key: string, message: string, action: () => Promise<unknown>) => {
    setActionLoading(key);
    setError(null);
    setNotice(null);
    try {
      const didRun = await confirmed(message, action);
      if (didRun) {
        setNotice('Action completed successfully.');
        await loadContext();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Momence action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const selectedMemberTagIds = useMemo(
    () => new Set((data.member?.customerTags || []).map((tag) => String(tag.id))),
    [data.member?.customerTags]
  );

  const matchingSessionBooking = useMemo(() => {
    if (!selectedMember) return undefined;
    return data.sessionBookings.find((b) => String(b.member?.id) === selectedMember.id && !b.cancelledAt);
  }, [data.sessionBookings, selectedMember]);

  const clearMember = () => {
    setSelectedMember(null);
    setMemberQuery('');
    setMemberOptions([]);
    setData(emptyState);
  };

  const clearSession = () => {
    setSelectedSession(null);
    setSessionQuery('');
    setSessionOptions([]);
  };

  const hasContext = Boolean(selectedMember || selectedSession);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-white via-blue-50/30 to-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_6px_20px_rgba(37,99,235,0.28)]">
            <Zap className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Momence Ops</div>
            <div className="text-sm font-semibold text-slate-900">Operational Console</div>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Search any Momence member or session to load live data and run direct operations — no ticket required.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0 text-red-500 hover:text-red-700"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {notice && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="ml-auto shrink-0 text-emerald-600 hover:text-emerald-800"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
            <SectionHeader icon={<Search className="h-3.5 w-3.5" />} title="Search" />
            <div className="space-y-2.5">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Member</label>
                <MemberSearchBox
                  query={memberQuery}
                  onQueryChange={setMemberQuery}
                  options={memberOptions}
                  selected={selectedMember}
                  onSelect={(m) => { setSelectedMember(m); setMemberOptions([]); setMemberQuery(''); }}
                  onClear={clearMember}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Session</label>
                <SessionSearchBox
                  query={sessionQuery}
                  onQueryChange={setSessionQuery}
                  options={sessionOptions}
                  selected={selectedSession}
                  onSelect={(s) => { setSelectedSession(s); setSessionOptions([]); setSessionQuery(''); }}
                  onClear={clearSession}
                />
              </div>
              {hasContext && (
                <button
                  type="button"
                  onClick={loadContext}
                  disabled={loading}
                  className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              )}
            </div>
          </div>

          {hasContext && (
            <>
              {loading && (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white py-8 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  Loading Momence data…
                </div>
              )}

              {!loading && (
                <>
                  <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    {(['member', 'session', 'tags'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveSection(tab)}
                        className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold capitalize transition ${
                          activeSection === tab
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {activeSection === 'member' && (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
                        <SectionHeader icon={<User className="h-3.5 w-3.5" />} title="Member Profile" />
                        {data.summary.member ? (
                          <div className="space-y-0.5">
                            <FieldRow label="Name" value={data.summary.member.name} />
                            <FieldRow label="Email" value={data.summary.member.email} />
                            <FieldRow label="Phone" value={data.summary.member.phoneNumber} />
                            <FieldRow label="First seen" value={formatDate(data.summary.member.firstSeen)} />
                            <FieldRow label="Last seen" value={formatDate(data.summary.member.lastSeen)} />
                            {data.summary.member.tags.length > 0 && (
                              <div className="pt-2 flex flex-wrap gap-1">
                                {data.summary.member.tags.map((tag) => (
                                  <Pill key={tag} tone="blue">{tag}</Pill>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400">No member selected or not found in Momence.</p>
                        )}
                      </div>

                      {data.summary.membershipOverview.memberships.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
                          <SectionHeader
                            icon={<BadgeCheck className="h-3.5 w-3.5" />}
                            title="Active Memberships"
                            count={data.summary.membershipOverview.memberships.length}
                          />
                          <div className="mb-3 grid grid-cols-3 gap-2">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-center">
                              <div className="text-base font-bold text-slate-800">{data.summary.membershipOverview.activeCount}</div>
                              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Active</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-center">
                              <div className="text-base font-bold text-slate-800">{data.summary.membershipOverview.frozenCount}</div>
                              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Frozen</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-center">
                              <div className="text-base font-bold text-slate-800">{data.summary.membershipOverview.memberships.length}</div>
                              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Total</div>
                            </div>
                          </div>

                          <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                            <label className="block">
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Freeze from</span>
                              <input
                                type="datetime-local"
                                value={freezeAt}
                                onChange={(e) => setFreezeAt(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 outline-none focus:border-blue-300"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Unfreeze at</span>
                              <input
                                type="datetime-local"
                                value={unfreezeAt}
                                onChange={(e) => setUnfreezeAt(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 outline-none focus:border-blue-300"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reason</span>
                              <input
                                value={freezeReason}
                                onChange={(e) => setFreezeReason(e.target.value)}
                                placeholder="Medical, travel…"
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 outline-none focus:border-blue-300"
                              />
                            </label>
                          </div>

                          <div className="space-y-2">
                            {data.summary.membershipOverview.memberships.slice(0, 5).map((ms) => (
                              <div key={ms.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="text-[12px] font-semibold text-slate-800 truncate">{ms.name}</span>
                                  <Pill tone={ms.status === 'Frozen' ? 'amber' : ms.status === 'Active' ? 'emerald' : 'slate'}>
                                    {ms.status}
                                  </Pill>
                                </div>
                                <div className="text-[11px] text-slate-500 mb-2">
                                  {ms.type || 'Membership'} · Valid until {formatDate(ms.validUntil)}
                                </div>
                                {ms.creditsLabel && <div className="text-[11px] text-slate-500">{ms.creditsLabel}</div>}
                                {ms.freezeLabel && <div className="text-[11px] text-amber-600">{ms.freezeLabel}</div>}
                                {ms.scheduledUnfreezeAt && <div className="text-[11px] text-blue-600">Scheduled unfreeze: {formatDate(ms.scheduledUnfreezeAt)}</div>}
                                {selectedMember && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {ms.status !== 'Frozen' ? (
                                      <>
                                        <ActionBtn
                                          size="xs"
                                          loading={actionLoading === `freeze-now-${ms.id}`}
                                          onClick={() => runAction(
                                            `freeze-now-${ms.id}`,
                                            `Freeze ${ms.name} for ${selectedMember.label} now?`,
                                            () => freezeMomenceMembership(selectedMember.id, ms.id, { freezeReason: freezeReason || undefined })
                                          )}
                                        >
                                          Freeze Now
                                        </ActionBtn>
                                        {freezeAt && unfreezeAt && (
                                          <ActionBtn
                                            size="xs"
                                            tone="neutral"
                                            loading={actionLoading === `schedule-freeze-${ms.id}`}
                                            onClick={() => runAction(
                                              `schedule-freeze-${ms.id}`,
                                              `Schedule freeze for ${selectedMember.label} from ${freezeAt} to ${unfreezeAt}?`,
                                              () => scheduleMomenceMembershipUnfreeze(selectedMember.id, ms.id, {
                                                scheduledUnfreezeAt: toApiDateTime(unfreezeAt)!,
                                              })
                                            )}
                                          >
                                            Schedule Freeze
                                          </ActionBtn>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <ActionBtn
                                          size="xs"
                                          tone="neutral"
                                          loading={actionLoading === `unfreeze-${ms.id}`}
                                          onClick={() => runAction(
                                            `unfreeze-${ms.id}`,
                                            `Unfreeze ${ms.name} for ${selectedMember.label} now?`,
                                            () => unfreezeMomenceMembership(selectedMember.id, ms.id)
                                          )}
                                        >
                                          Unfreeze Now
                                        </ActionBtn>
                                        {ms.scheduledUnfreezeAt && (
                                          <ActionBtn
                                            size="xs"
                                            tone="danger"
                                            loading={actionLoading === `remove-scheduled-unfreeze-${ms.id}`}
                                            onClick={() => runAction(
                                              `remove-scheduled-unfreeze-${ms.id}`,
                                              `Remove the scheduled unfreeze for ${ms.name}?`,
                                              () => removeScheduledMomenceMembershipUnfreeze(selectedMember.id, ms.id)
                                            )}
                                          >
                                            Cancel Scheduled
                                          </ActionBtn>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {data.summary.bookingOverview.recentBookings.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
                          <SectionHeader icon={<Calendar className="h-3.5 w-3.5" />} title="Recent Bookings" count={data.summary.bookingOverview.totalLoaded} />
                          <div className="space-y-1.5">
                            {data.summary.bookingOverview.recentBookings.slice(0, 6).map((booking) => (
                              <div key={booking.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] font-semibold text-slate-700">{booking.classType}</div>
                                  <div className="text-[10px] text-slate-500">{formatDate(booking.startsAt)}</div>
                                </div>
                                <Pill tone={booking.checkedIn ? 'emerald' : booking.cancelled ? 'red' : 'slate'}>
                                  {booking.checkedIn ? 'Checked in' : booking.cancelled ? 'Cancelled' : 'Booked'}
                                </Pill>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeSection === 'session' && (
                    <div className="space-y-3">
                      {selectedSession ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
                          <SectionHeader icon={<Calendar className="h-3.5 w-3.5" />} title="Session Details" />
                          <div className="space-y-0.5 mb-3">
                            <FieldRow label="Class" value={selectedSession.classType} />
                            <FieldRow label="Starts" value={selectedSession.description} />
                            <FieldRow label="Studio" value={selectedSession.studio} />
                            <FieldRow label="Trainer" value={selectedSession.trainer} />
                          </div>
                          {selectedMember && (
                            <div className="border-t border-slate-100 pt-3">
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Booking Actions for {selectedMember.label}</div>
                              <div className="flex flex-wrap gap-2">
                                <ActionBtn
                                  size="xs"
                                  loading={actionLoading === 'free'}
                                  onClick={() => runAction(
                                    'free',
                                    `Add ${selectedMember.label} to ${selectedSession.classType || 'this session'} for free?`,
                                    () => addMomenceMemberToSessionForFree(selectedMember.id, selectedSession.id)
                                  )}
                                >
                                  Free Booking
                                </ActionBtn>
                                <ActionBtn
                                  size="xs"
                                  tone="neutral"
                                  loading={actionLoading === 'waitlist'}
                                  onClick={() => runAction(
                                    'waitlist',
                                    `Add ${selectedMember.label} to the waitlist for ${selectedSession.classType || 'this session'}?`,
                                    () => addMomenceMemberToWaitlist(selectedMember.id, selectedSession.id)
                                  )}
                                >
                                  Waitlist
                                </ActionBtn>
                                {matchingSessionBooking && (
                                  <>
                                    <ActionBtn
                                      size="xs"
                                      tone="neutral"
                                      loading={actionLoading === 'checkin'}
                                      onClick={() => runAction(
                                        'checkin',
                                        `${matchingSessionBooking.checkedIn ? 'Remove check-in for' : 'Check in'} ${selectedMember.label}?`,
                                        () => matchingSessionBooking.checkedIn
                                          ? removeMomenceBookingCheckIn(matchingSessionBooking.id)
                                          : checkInMomenceBooking(matchingSessionBooking.id)
                                      )}
                                    >
                                      {matchingSessionBooking.checkedIn ? 'Undo Check-in' : 'Check In'}
                                    </ActionBtn>
                                    <ActionBtn
                                      size="xs"
                                      tone="danger"
                                      loading={actionLoading === 'cancel'}
                                      onClick={() => runAction(
                                        'cancel',
                                        `Cancel booking for ${selectedMember.label}? This will not refund automatically.`,
                                        () => cancelMomenceBooking(matchingSessionBooking.id)
                                      )}
                                    >
                                      Cancel Booking
                                    </ActionBtn>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-[12px] text-slate-400">
                          Search for a session above to see details.
                        </div>
                      )}

                      {data.sessionBookings.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
                          <SectionHeader icon={<User className="h-3.5 w-3.5" />} title="Session Bookings" count={data.sessionBookings.length} />
                          <div className="max-h-56 space-y-1.5 overflow-y-auto">
                            {data.sessionBookings.filter((b) => !b.cancelledAt).map((booking) => (
                              <div key={booking.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] font-semibold text-slate-700">
                                    {[booking.member?.firstName, booking.member?.lastName].filter(Boolean).join(' ') || 'Unknown'}
                                  </div>
                                  <div className="text-[10px] text-slate-500">{booking.member?.email || booking.member?.phoneNumber || ''}</div>
                                </div>
                                <Pill tone={booking.checkedIn ? 'emerald' : 'slate'}>
                                  {booking.checkedIn ? 'In' : 'Booked'}
                                </Pill>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeSection === 'tags' && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
                      <SectionHeader icon={<Tag className="h-3.5 w-3.5" />} title="Tags" count={data.tags.length} />
                      {data.tags.length === 0 ? (
                        <p className="text-[11px] text-slate-400">No tags available or no member selected.</p>
                      ) : (
                        <>
                          <div className="mb-3">
                            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Select tag to assign / remove</label>
                            <div className="relative">
                              <select
                                value={selectedTagId}
                                onChange={(e) => setSelectedTagId(e.target.value)}
                                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-[12px] text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                              >
                                <option value="">Select a tag…</option>
                                {data.tags.map((tag) => (
                                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                            </div>
                          </div>
                          {selectedTagId && selectedMember && (
                            <div className="flex gap-2">
                              <ActionBtn
                                size="xs"
                                loading={actionLoading === `assign-tag-${selectedTagId}`}
                                disabled={selectedMemberTagIds.has(selectedTagId)}
                                onClick={() => runAction(
                                  `assign-tag-${selectedTagId}`,
                                  `Assign tag to ${selectedMember.label}?`,
                                  () => assignMomenceTag(selectedMember.id, selectedTagId)
                                )}
                              >
                                {selectedMemberTagIds.has(selectedTagId) ? 'Already assigned' : 'Assign Tag'}
                              </ActionBtn>
                              <ActionBtn
                                size="xs"
                                tone="danger"
                                loading={actionLoading === `remove-tag-${selectedTagId}`}
                                disabled={!selectedMemberTagIds.has(selectedTagId)}
                                onClick={() => runAction(
                                  `remove-tag-${selectedTagId}`,
                                  `Remove tag from ${selectedMember.label}?`,
                                  () => unassignMomenceTag(selectedMember.id, selectedTagId)
                                )}
                              >
                                Remove Tag
                              </ActionBtn>
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {(data.member?.customerTags || []).map((tag) => (
                              <Pill key={tag.id} tone="blue">{tag.name}</Pill>
                            ))}
                            {(data.member?.customerTags || []).length === 0 && (
                              <span className="text-[11px] text-slate-400">No tags currently assigned to this member.</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {!hasContext && (
            <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center">
              <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-[12px] font-semibold text-slate-400">Search a member or session to begin</p>
              <p className="mt-1 text-[11px] text-slate-400">All Momence operations will become available once context is loaded.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
