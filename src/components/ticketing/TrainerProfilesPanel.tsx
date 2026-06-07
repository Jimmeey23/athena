import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Tag,
  Target,
  TrendingUp,
  User,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  TrainerProfile,
  TrainerReviewRecord,
  buildTrainerProfilesFromReviews,
  loadLocalTrainerReviewRecords,
  trainerReviewRecordsFromTickets,
} from '@/lib/trainer-profiles';
import { Ticket } from '@/lib/ticketing-data';
import { trainerImageUrl, trainerInitials } from '@/lib/trainer-images';
import { useTickets } from './useTickets';

function parseFlexibleDate(value?: string): Date | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;
  const normalizedIso = trimmed.replace(/^(\d{4})\s+(\d{2})\s+(\d{2})T/, '$1-$2-$3T');
  const normalized = new Date(normalizedIso);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function formatDate(value?: string, fallback = 'No reviews yet') {
  const date = parseFlexibleDate(value);
  if (!date) return value?.trim() || fallback;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function formatReviewPeriod(value?: string) {
  const date = parseFlexibleDate(value);
  if (!date) return value?.trim() || 'Review period not captured';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

const scoreTone = (score: number) => {
  if (score >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-100';
  if (score >= 80) return 'text-blue-700 bg-blue-50 border-blue-100';
  if (score >= 70) return 'text-amber-700 bg-amber-50 border-amber-100';
  return 'text-rose-700 bg-rose-50 border-rose-100';
};

const scoreBand = (score: number) => {
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Strong';
  if (score >= 70) return 'Refinement';
  if (score >= 60) return 'Coaching';
  return 'Needs Help';
};

const scoreColor = (score: number) => {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 80) return 'bg-blue-500';
  if (score >= 70) return 'bg-amber-500';
  return 'bg-rose-500';
};

const scoreTextColor = (score: number) => {
  if (score >= 90) return 'text-emerald-700';
  if (score >= 80) return 'text-blue-700';
  if (score >= 70) return 'text-amber-700';
  return 'text-rose-700';
};

function criterionPercent(score: number, weightage: number) {
  return weightage ? Math.max(0, Math.min(100, Math.round((score / weightage) * 100))) : 0;
}

type CriterionRow = TrainerReviewRecord['scores'][number] & { percent: number };

function reviewKey(review: TrainerReviewRecord) {
  return review.sourceRef || review.id;
}

function reviewPeriodLabel(review: TrainerReviewRecord) {
  const periodDate = parseFlexibleDate(review.reviewPeriod);
  if (periodDate) return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(periodDate);
  if (review.reviewPeriod?.trim()) return review.reviewPeriod.trim();
  const createdDate = parseFlexibleDate(review.createdAt);
  return createdDate ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(createdDate) : 'Undated Reviews';
}

function groupReviewsByPeriod(reviews: TrainerReviewRecord[]) {
  return reviews.reduce<Array<{ period: string; reviews: TrainerReviewRecord[] }>>((groups, review) => {
    const period = reviewPeriodLabel(review);
    const existing = groups.find((group) => group.period === period);
    if (existing) existing.reviews.push(review);
    else groups.push({ period, reviews: [review] });
    return groups;
  }, []);
}

const TrainerImage: React.FC<{ name: string; size?: 'sm' | 'lg' }> = ({ name, size = 'sm' }) => {
  const src = trainerImageUrl(name);
  const classes = size === 'lg' ? 'h-32 w-32 text-xl' : 'h-10 w-10 text-xs';
  return (
    <div className={`${classes} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 font-bold text-blue-700 shadow-sm`}>
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : trainerInitials(name)}
    </div>
  );
};

export const TrainerProfilesPanel: React.FC = () => {
  const { tickets } = useTickets();
  const [localReviews, setLocalReviews] = useState<TrainerReviewRecord[]>(() => loadLocalTrainerReviewRecords());
  const [selectedTrainer, setSelectedTrainer] = useState<string>('');
  const [activeReviewKey, setActiveReviewKey] = useState<string>('');
  const profiles = useMemo<TrainerProfile[]>(
    () => buildTrainerProfilesFromReviews([
      ...trainerReviewRecordsFromTickets(tickets),
      ...localReviews,
    ]),
    [localReviews, tickets]
  );

  useEffect(() => {
    const refresh = () => setLocalReviews(loadLocalTrainerReviewRecords());
    window.addEventListener('p57-trainer-profiles-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('p57-trainer-profiles-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!selectedTrainer && profiles[0]) setSelectedTrainer(profiles[0].trainer);
  }, [profiles, selectedTrainer]);

  useEffect(() => {
    setActiveReviewKey('');
  }, [selectedTrainer]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.trainer === selectedTrainer) || profiles[0],
    [profiles, selectedTrainer]
  );
  const reviewedProfiles = profiles.filter((profile) => profile.reviews.length > 0);
  const ticketBySourceRef = useMemo(
    () => new Map(tickets.filter((ticket) => ticket.sourceRef).map((ticket) => [ticket.sourceRef, ticket])),
    [tickets]
  );

  return (
    <div className="h-full overflow-hidden bg-slate-50/70">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-shrink-0 border-b border-slate-200 bg-white/90 px-5 py-4 shadow-[0_10px_36px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <GraduationCap className="h-4 w-4" />
                Instructor Intelligence
              </div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Trainer Profiles</h2>
              <p className="mt-1 max-w-2xl text-xs text-slate-500">Assessment history, score trends, coaching focus, and criterion-level performance by instructor.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Profiles" value={profiles.length} />
              <Metric label="Reviewed" value={reviewedProfiles.length} />
              <Metric
                label="Avg Score"
                value={reviewedProfiles.length ? `${Math.round(reviewedProfiles.reduce((sum, profile) => sum + profile.averageScorePercent, 0) / reviewedProfiles.length)}%` : '0%'}
              />
            </div>
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
              <GraduationCap className="mx-auto h-9 w-9 text-blue-500" />
              <div className="mt-3 text-sm font-semibold text-slate-900">No trainer profiles yet</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Turn on Instructor evaluation in Athena, choose a Barre, PowerCycle, or Strength/Fit template, and create the first evaluation ticket.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
            <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white/72 p-4">
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <button
                    key={profile.trainer}
                    type="button"
                    onClick={() => setSelectedTrainer(profile.trainer)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      selectedProfile?.trainer === profile.trainer
                        ? 'border-blue-200 bg-blue-50 shadow-[0_16px_42px_rgba(37,99,235,0.12)]'
                        : 'border-slate-200 bg-white hover:border-blue-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <TrainerImage name={profile.trainer} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">{profile.trainer}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{profile.reviews.length} review{profile.reviews.length === 1 ? '' : 's'}</div>
                        </div>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${scoreTone(profile.averageScorePercent)}`}>
                        {profile.averageScorePercent}%
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">Latest: {formatDate(profile.latestReviewAt)}</div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="min-h-0 overflow-y-auto p-5">
              {selectedProfile && (
                <TrainerProfileDetail
                  profile={selectedProfile}
                  ticketBySourceRef={ticketBySourceRef}
                  activeReviewKey={activeReviewKey}
                  onSelectReview={setActiveReviewKey}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="min-w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
    <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
  </div>
);

const TrainerProfileDetail: React.FC<{
  profile: TrainerProfile;
  ticketBySourceRef: Map<string, Ticket>;
  activeReviewKey: string;
  onSelectReview: (key: string) => void;
}> = ({ profile, ticketBySourceRef, activeReviewKey, onSelectReview }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(null);
  const latest = profile.reviews[0];
  const activeReview = profile.reviews.find((review) => reviewKey(review) === activeReviewKey) || latest;
  const groupedReviews = groupReviewsByPeriod(profile.reviews);
  const highScore = profile.reviews.length ? Math.max(...profile.reviews.map((review) => review.scorePercent)) : 0;
  const activeRows = activeReview?.scores.map((item) => ({
    ...item,
    percent: criterionPercent(item.score, item.weightage),
  })) || [];
  const chartRows = activeRows.map((item) => ({
    criterion: item.category.length > 18 ? `${item.category.slice(0, 18)}...` : item.category,
    fullCriterion: item.category,
    percent: item.percent,
    score: item.score,
    weightage: item.weightage,
  }));
  const trendRows = profile.reviews
    .slice(0, 10)
    .reverse()
    .map((review, index) => ({
      label: `${index + 1}`,
      score: review.scorePercent,
      date: formatReviewPeriod(review.reviewPeriod || review.createdAt),
    }));

  useEffect(() => {
    setPreviewTicket(null);
  }, [profile.trainer]);

  useEffect(() => {
    if (!previewTicket) return;
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [previewTicket]);

  const selectHistoryItem = (key: string, ticket?: Ticket) => {
    onSelectReview(key);
    if (ticket) setPreviewTicket(ticket);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
        <div className="border-b border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <TrainerImage name={profile.trainer} size="lg" />
              <div className="min-w-0">
                <h3 className="text-2xl font-semibold text-slate-950">{profile.trainer}</h3>
                <p className="mt-1 text-xs text-slate-500">Latest review: {formatDate(profile.latestReviewAt)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ProfilePill icon={<ClipboardList className="h-3.5 w-3.5" />} label={`${profile.reviews.length} assessment${profile.reviews.length === 1 ? '' : 's'}`} />
                  <ProfilePill icon={<Award className="h-3.5 w-3.5" />} label={`Best score ${highScore}%`} />
                  {activeReview?.studio && <ProfilePill icon={<MapPin className="h-3.5 w-3.5" />} label={activeReview.studio} />}
                  {activeReview?.classType && <ProfilePill icon={<Activity className="h-3.5 w-3.5" />} label={activeReview.classType} />}
                </div>
              </div>
            </div>
            <div className={`min-w-36 rounded-2xl border px-4 py-3 text-right ${scoreTone(profile.averageScorePercent)}`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em]">Profile average</div>
              <div className="mt-1 text-3xl font-semibold">{profile.averageScorePercent}%</div>
              <div className="mt-1 text-[11px] font-bold">{scoreBand(profile.averageScorePercent)}</div>
            </div>
          </div>
        </div>

        {activeReview && (
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  {activeReviewKey ? 'Selected Assessment Drilldown' : 'Latest Weighted Review'}
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
                  {formatReviewPeriod(activeReview.reviewPeriod)}
                </div>
            </div>

            <DrilldownAnalytics review={activeReview} profile={profile} rows={activeRows} />

            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  Radar
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={chartRows}>
                      <PolarGrid stroke="#dbeafe" />
                      <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Radar dataKey="percent" stroke="#2563eb" fill="#60a5fa" fillOpacity={0.32} />
                      <Tooltip formatter={(value, _name, props) => [`${value}%`, props.payload.fullCriterion]} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Criterion Breakdown
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} layout="vertical" margin={{ left: 12, right: 18, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
                      <YAxis type="category" dataKey="criterion" width={118} tick={{ fontSize: 10, fill: '#475569' }} />
                      <Tooltip formatter={(value, _name, props) => [`${value}%`, `${props.payload.fullCriterion}: ${props.payload.score}/${props.payload.weightage}`]} />
                      <Bar dataKey="percent" fill="#2563eb" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <EvaluatorFeedbackBrief value={activeReview.feedback} />
              <InsightBlock title="Focus Points" value={activeReview.focusPoints} icon={<Target className="h-4 w-4 text-blue-600" />} />
              <InsightBlock title="Goals" value={activeReview.goals} />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-bold">Criterion</th>
                    <th className="px-3 py-2 text-right font-bold">Score</th>
                    <th className="px-3 py-2 text-right font-bold">% of Max</th>
                    <th className="px-3 py-2 font-bold">Band</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {activeRows.map((item) => {
                    const percent = item.percent;
                    return (
                      <tr key={item.category}>
                        <td className="px-3 py-2 font-medium text-slate-800">{item.category}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{item.score.toFixed(1)} / {item.weightage}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full rounded-full ${scoreColor(percent)}`} style={{ width: `${percent}%` }} />
                            </div>
                            <span className="w-9 text-right font-bold text-slate-700">{percent}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${scoreTone(percent)}`}>{scoreBand(percent)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {trendRows.length > 1 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Recent Assessment Trend</div>
                <div className="flex items-end gap-1">
                  {trendRows.map((row) => (
                    <div key={`${row.label}-${row.date}`} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-20 w-full items-end rounded bg-slate-50">
                        <div className={`w-full rounded-t ${scoreColor(row.score)}`} style={{ height: `${row.score}%` }} />
                      </div>
                      <div className="text-[10px] font-bold text-slate-600">{row.score}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {!latest && (
          <div className="m-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 text-sm text-blue-900">
            No evaluation has been saved for this instructor yet. Their profile is ready and will populate automatically when an Athena instructor evaluation is published.
          </div>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">Assessment History</div>
        <div className="divide-y divide-slate-100">
          {groupedReviews.map((group) => (
            <div key={group.period} className="px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{group.period}</div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                  {group.reviews.length} assessment{group.reviews.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="space-y-3">
                {group.reviews.map((review) => {
                  const ticket = review.sourceRef ? ticketBySourceRef.get(review.sourceRef) : undefined;
                  const key = reviewKey(review);
                  const selected = activeReview ? reviewKey(activeReview) === key : false;
                  return (
                    <div key={key} className={`overflow-hidden rounded-xl border ${selected ? 'border-blue-300 bg-blue-50/70 shadow-[0_10px_30px_rgba(37,99,235,0.10)]' : 'border-slate-100 bg-white'}`}>
                      <button
                        type="button"
                        onClick={() => selectHistoryItem(key, ticket)}
                        className="grid w-full gap-3 px-3 py-3 text-left transition hover:bg-slate-50 lg:grid-cols-[190px_1fr_125px]"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                            <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
                            {ticket?.id || review.template}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">{formatDate(review.createdAt)}</div>
                          <div className="mt-1 text-[11px] text-slate-500">Period: {formatReviewPeriod(review.reviewPeriod)}</div>
                          {review.studio && <div className="mt-1 text-[11px] text-slate-400">{review.studio}</div>}
                          {review.classType && <div className="mt-1 text-[11px] text-slate-400">{review.classType}</div>}
                        </div>
                        <div className="min-w-0">
                          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{review.template} Evaluation</div>
                          <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">{review.feedback}</p>
                          {review.focusPoints && <p className="mt-2 text-[11px] font-medium text-blue-700">Focus: {review.focusPoints}</p>}
                        </div>
                        <div className="flex items-start justify-between gap-2 text-right lg:block">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${scoreTone(review.scorePercent)}`}>
                            {review.scorePercent}%
                          </span>
                          <div className={`mt-2 text-[10px] font-bold uppercase tracking-[0.12em] ${selected ? 'text-blue-600' : 'text-slate-400'}`}>
                            {selected ? 'Viewing' : 'View Drilldown'}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {groupedReviews.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              No review history yet.
            </div>
          )}
        </div>
      </div>

      {previewTicket && (
        <TicketPreviewReport ticket={previewTicket} previewRef={previewRef} />
      )}
    </div>
  );
};

const ProfilePill: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">
    <span className="shrink-0 text-blue-600">{icon}</span>
    <span className="truncate">{label}</span>
  </span>
);

const TicketPreviewReport: React.FC<{ ticket: Ticket; previewRef: React.RefObject<HTMLDivElement> }> = ({ ticket, previewRef }) => (
  <div ref={previewRef} className="mt-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[0_18px_54px_rgba(37,99,235,0.10)]">
    <div className="border-b border-blue-100 bg-blue-50/80 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            <FileText className="h-4 w-4" />
            Ticket Preview Report
          </div>
          <h4 className="mt-1 text-lg font-semibold leading-snug text-slate-950">{ticket.title}</h4>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700">Ticket ID: {ticket.id}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">{ticket.status}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">{ticket.priority}</span>
        </div>
      </div>
    </div>
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Ticket narrative</div>
          <FormattedTrainerTicketText text={ticket.description} />
        </div>
        {ticket.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ticket.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">#{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="grid content-start gap-2">
        <TicketPreviewFact icon={<Tag className="h-3.5 w-3.5" />} label="Classification" value={`${ticket.category} / ${ticket.subCategory}`} />
        <TicketPreviewFact icon={<MapPin className="h-3.5 w-3.5" />} label="Studio" value={ticket.studio} />
        <TicketPreviewFact icon={<User className="h-3.5 w-3.5" />} label="Owner" value={ticket.assignedTo} />
        <TicketPreviewFact icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Team" value={ticket.team} />
        {ticket.trainer && <TicketPreviewFact icon={<GraduationCap className="h-3.5 w-3.5" />} label="Instructor" value={ticket.trainer} />}
        {ticket.classType && <TicketPreviewFact icon={<Activity className="h-3.5 w-3.5" />} label="Session" value={ticket.classType} />}
        {ticket.classDateTime && <TicketPreviewFact icon={<CalendarDays className="h-3.5 w-3.5" />} label="Session time" value={formatDate(ticket.classDateTime, 'Not captured')} />}
        {ticket.memberName && <TicketPreviewFact icon={<User className="h-3.5 w-3.5" />} label="Member" value={ticket.memberName} />}
        {ticket.sentiment && <TicketPreviewFact icon={<MessageSquare className="h-3.5 w-3.5" />} label="Sentiment" value={ticket.sentiment} />}
        <TicketPreviewFact icon={<Clock className="h-3.5 w-3.5" />} label="Created" value={formatDate(ticket.createdAt, 'Not captured')} />
      </div>
    </div>
  </div>
);

const TicketPreviewFact: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex min-w-0 gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
    <span className="mt-0.5 shrink-0 text-blue-600">{icon}</span>
    <span className="min-w-0">
      <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <span className="mt-0.5 block truncate font-semibold text-slate-800" title={value}>{value}</span>
    </span>
  </div>
);

const FormattedTrainerTicketText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-700">
      {(lines.length ? lines : ['No ticket description captured.']).map((line, index) => (
        <p key={`${line}-${index}`}>{line.replace(/^[-*]\s+/, '')}</p>
      ))}
    </div>
  );
};

const DrilldownAnalytics: React.FC<{ review: TrainerReviewRecord; profile: TrainerProfile; rows: CriterionRow[] }> = ({ review, profile, rows }) => {
  const sortedRows = [...rows].sort((a, b) => b.percent - a.percent);
  const strengths = sortedRows.filter((item) => item.percent >= 80).slice(0, 4);
  const attention = [...rows].sort((a, b) => a.percent - b.percent).slice(0, 4);
  const delta = review.scorePercent - profile.averageScorePercent;
  const weightedRisk = rows
    .filter((item) => item.percent < 70)
    .reduce((sum, item) => sum + item.weightage, 0);
  const scoreDensity = review.totalWeightage ? Math.round((review.totalScore / review.totalWeightage) * 100) : review.scorePercent;

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid items-start gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <DrillMetric label="Selected Score" value={`${review.scorePercent}%`} helper={scoreBand(review.scorePercent)} accent={scoreTextColor(review.scorePercent)} />
        <DrillMetric
          label="Vs Profile Avg"
          value={`${delta > 0 ? '+' : ''}${delta}%`}
          helper={`${profile.averageScorePercent}% profile mean`}
          accent={delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}
        />
        <DrillMetric label="Weighted Yield" value={`${scoreDensity}%`} helper={`${review.totalScore.toFixed(1)} / ${review.totalWeightage}`} accent="text-blue-700" />
        <DrillMetric label="Risk Weight" value={`${weightedRisk}`} helper="points below 70%" accent={weightedRisk ? 'text-amber-700' : 'text-emerald-700'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <TechnicalList title="Strongest Signals" items={strengths.map((item) => `${item.category}: ${item.percent}% (${item.score.toFixed(1)}/${item.weightage})`)} fallback="No criterion reached the strength threshold." />
        <TechnicalList title="Coaching Attention" items={attention.map((item) => `${item.category}: ${item.percent}% (${item.score.toFixed(1)}/${item.weightage})`)} fallback="No attention areas captured." />
      </div>
    </div>
  );
};

const DrillMetric: React.FC<{ label: string; value: string; helper: string; accent: string }> = ({ label, value, helper, accent }) => (
  <div className="h-fit rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
    <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className={`mt-2 text-2xl font-semibold leading-none ${accent}`}>{value}</div>
    <div className="mt-2 text-[11px] font-semibold text-slate-500">{helper}</div>
  </div>
);

const TechnicalList: React.FC<{ title: string; items: string[]; fallback: string }> = ({ title, items, fallback }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
    <div className="mb-2 text-xs font-semibold text-slate-900">{title}</div>
    <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
      {(items.length ? items : [fallback]).map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

function richFeedbackItems(value?: string): Array<{ label?: string; text: string }> {
  const raw = value?.trim();
  if (!raw) return [{ text: 'No detail captured.' }];
  return raw
    .split(/\n+|(?<=\.)\s+(?=[A-Z])/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]{3,42}):\s*(.+)$/);
      return match ? { label: match[1].trim(), text: match[2].trim() } : { text: line };
    });
}

const RichFeedbackList: React.FC<{ value?: string }> = ({ value }) => (
  <ul className="space-y-2 text-xs leading-relaxed text-slate-600">
    {richFeedbackItems(value).map((item, index) => (
      <li key={`${item.label || item.text}-${index}`} className="flex gap-2">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
        <span>
          {item.label && <span className="font-semibold text-slate-900">{item.label}: </span>}
          {item.text}
        </span>
      </li>
    ))}
  </ul>
);

const EvaluatorFeedbackBrief: React.FC<{ value?: string }> = ({ value }) => {
  const items = richFeedbackItems(value);
  const summary = items[0]?.text || 'No detail captured.';
  const detailItems = items.length > 1 ? items.slice(1) : items;
  const splitIndex = Math.ceil(detailItems.length / 2);
  const columns = [detailItems.slice(0, splitIndex), detailItems.slice(splitIndex)].filter((column) => column.length > 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Evaluator Feedback</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">Qualitative coaching readout</div>
        </div>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
          {items.length} note{items.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Narrative Summary</div>
          <p className="text-sm leading-relaxed text-slate-700">{summary}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {columns.map((column, columnIndex) => (
            <ul key={columnIndex} className="space-y-2">
              {column.map((item, index) => (
                <li key={`${item.label || item.text}-${columnIndex}-${index}`} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="flex gap-2 text-xs leading-relaxed text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>
                      {item.label && <span className="font-semibold text-slate-950">{item.label}: </span>}
                      {item.text}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
};

const InsightBlock: React.FC<{ title: string; value?: string; icon?: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-900">
      {icon}
      {title}
    </div>
    {title.toLowerCase().includes('feedback') || title.toLowerCase().includes('evaluation')
      ? <RichFeedbackList value={value} />
      : <p className="text-xs leading-relaxed text-slate-600">{value || 'No detail captured.'}</p>}
  </div>
);
