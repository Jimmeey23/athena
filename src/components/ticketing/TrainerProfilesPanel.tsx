import React, { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Target, TrendingUp } from 'lucide-react';
import {
  TrainerProfile,
  TrainerReviewRecord,
  buildTrainerProfilesFromReviews,
  loadLocalTrainerReviewRecords,
  trainerReviewRecordsFromTickets,
} from '@/lib/trainer-profiles';
import { trainerImageUrl, trainerInitials } from '@/lib/trainer-images';
import { useTickets } from './useTickets';

function formatDate(value?: string) {
  if (!value) return 'No reviews yet';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const scoreTone = (score: number) => {
  if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-100';
  if (score >= 65) return 'text-blue-700 bg-blue-50 border-blue-100';
  return 'text-amber-700 bg-amber-50 border-amber-100';
};

function reviewPeriodLabel(review: TrainerReviewRecord) {
  if (review.reviewPeriod?.trim()) return review.reviewPeriod.trim();
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(review.createdAt));
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

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.trainer === selectedTrainer) || profiles[0],
    [profiles, selectedTrainer]
  );
  const reviewedProfiles = profiles.filter((profile) => profile.reviews.length > 0);

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
              <p className="mt-1 max-w-2xl text-xs text-slate-500">
                Athena appends each submitted Barre or PowerCycle evaluation to the instructor profile and keeps the latest review history here.
              </p>
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
                Turn on Instructor evaluation in Athena, choose a Barre or PowerCycle template, and create the first evaluation ticket.
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
              {selectedProfile && <TrainerProfileDetail profile={selectedProfile} />}
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

const TrainerProfileDetail: React.FC<{ profile: TrainerProfile }> = ({ profile }) => {
  const latest = profile.reviews[0];
  const groupedReviews = groupReviewsByPeriod(profile.reviews);
  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <TrainerImage name={profile.trainer} size="lg" />
            <div className="min-w-0">
              <h3 className="text-2xl font-semibold text-slate-950">{profile.trainer}</h3>
              <p className="mt-1 text-xs text-slate-500">Latest review: {formatDate(profile.latestReviewAt)}</p>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-500">
                Reviews are kept as separate tickets and grouped by review period where a period is available.
              </p>
            </div>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-right ${scoreTone(profile.averageScorePercent)}`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em]">Profile average</div>
            <div className="mt-1 text-3xl font-semibold">{profile.averageScorePercent}%</div>
          </div>
        </div>

        {latest && (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                Latest Weighted Review
              </div>
              <div className="space-y-2">
                {latest.scores.map((item) => (
                  <div key={item.category} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-700">{item.category}</span>
                      <span className="text-xs font-bold text-blue-700">{item.score.toFixed(1)} / {item.weightage}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${item.weightage ? Math.round((item.score / item.weightage) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <InsightBlock title="Evaluator Feedback" value={latest.feedback} />
              <InsightBlock title="Focus Points" value={latest.focusPoints} icon={<Target className="h-4 w-4 text-blue-600" />} />
              <InsightBlock title="Goals" value={latest.goals} />
            </div>
          </div>
        )}
        {!latest && (
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 text-sm text-blue-900">
            No evaluation has been saved for this instructor yet. Their profile is ready and will populate automatically when an Athena instructor evaluation is published.
          </div>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">Review History</div>
        <div className="divide-y divide-slate-100">
          {groupedReviews.map((group) => (
            <div key={group.period} className="px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{group.period}</div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                  {group.reviews.length} ticket{group.reviews.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="space-y-3">
                {group.reviews.map((review) => (
                  <div key={review.id} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 lg:grid-cols-[180px_1fr_110px]">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{review.template}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{formatDate(review.createdAt)}</div>
                      {review.studio && <div className="mt-1 text-[11px] text-slate-400">{review.studio}</div>}
                      {review.classType && <div className="mt-1 text-[11px] text-slate-400">{review.classType}</div>}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">{review.feedback}</p>
                      {review.focusPoints && <p className="mt-2 text-[11px] font-medium text-blue-700">Focus: {review.focusPoints}</p>}
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${scoreTone(review.scorePercent)}`}>
                        {review.scorePercent}%
                      </span>
                    </div>
                  </div>
                ))}
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
    </div>
  );
};

const InsightBlock: React.FC<{ title: string; value?: string; icon?: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-900">
      {icon}
      {title}
    </div>
    <p className="text-xs leading-relaxed text-slate-600">{value || 'No detail captured.'}</p>
  </div>
);
