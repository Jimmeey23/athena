import type { ManualTicketInput } from '@/components/ticketing/TicketContext';
import { STUDIOS, TRAINERS, Ticket } from '@/lib/ticketing-data';
import {
  TRAINER_REVIEW_TEMPLATES,
  TrainerEvaluationInput,
  TrainerEvaluationScore,
  TrainerReviewRecord,
  TrainerReviewTemplate,
  buildTrainerEvaluationText,
  buildTrainerReviewRecord,
  parseTrainerEvaluationText,
} from './trainer-evaluation-core';

export {
  TRAINER_REVIEW_TEMPLATES,
  buildTrainerEvaluationText,
  buildTrainerReviewRecord,
  parseTrainerEvaluationText,
};
export type { TrainerEvaluationInput, TrainerEvaluationScore, TrainerReviewRecord, TrainerReviewTemplate };

export interface TrainerProfile {
  trainer: string;
  reviews: TrainerReviewRecord[];
  latestReviewAt?: string;
  averageScorePercent: number;
  focusPoints: string[];
  goals: string[];
}

const STORAGE_KEY = 'p57_trainer_profiles_v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function summarizeProfile(trainer: string, reviews: TrainerReviewRecord[]): TrainerProfile {
  const averageScorePercent = reviews.length
    ? Math.round(reviews.reduce((sum, review) => sum + review.scorePercent, 0) / reviews.length)
    : 0;
  return {
    trainer,
    reviews,
    latestReviewAt: reviews[0]?.createdAt,
    averageScorePercent,
    focusPoints: reviews.flatMap((review) => review.focusPoints ? [review.focusPoints] : []).slice(0, 8),
    goals: reviews.flatMap((review) => review.goals ? [review.goals] : []).slice(0, 8),
  };
}

export function loadTrainerProfiles(): TrainerProfile[] {
  const storage = getStorage();
  if (!storage) return TRAINERS.map((trainer) => summarizeProfile(trainer, []));
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const records = raw ? JSON.parse(raw) as TrainerReviewRecord[] : [];
    const grouped = records.reduce<Record<string, TrainerReviewRecord[]>>((acc, review) => {
      acc[review.trainer] = acc[review.trainer] || [];
      acc[review.trainer].push(review);
      return acc;
    }, {});
    const trainerNames = Array.from(new Set([...TRAINERS, ...Object.keys(grouped)]));
    return trainerNames
      .map((trainer) => summarizeProfile(
        trainer,
        (grouped[trainer] || []).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      ))
      .sort((a, b) => {
        const latestDelta = Date.parse(b.latestReviewAt || '') - Date.parse(a.latestReviewAt || '');
        if (Number.isFinite(latestDelta) && latestDelta !== 0) return latestDelta;
        return a.trainer.localeCompare(b.trainer);
      });
  } catch {
    return TRAINERS.map((trainer) => summarizeProfile(trainer, []));
  }
}

export function loadLocalTrainerReviewRecords(): TrainerReviewRecord[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || '[]') as TrainerReviewRecord[];
  } catch {
    return [];
  }
}

export function trainerReviewRecordsFromTickets(tickets: Ticket[]): TrainerReviewRecord[] {
  return tickets.flatMap((ticket) => {
    const review = ticket.metadata?.trainerReview;
    if (!review || typeof review !== 'object') return [];
    const record = review as Partial<TrainerReviewRecord>;
    if (!record.trainer || !record.template || !Array.isArray(record.scores)) return [];
    return [{
      ...record,
      id: record.id || `ticket-${ticket.id}-trainer-review`,
      createdAt: record.createdAt || ticket.createdAt,
      trainer: record.trainer,
      template: record.template,
      studio: record.studio || ticket.studio,
      classType: record.classType || ticket.classType,
      reviewPeriod: record.reviewPeriod || ticket.classDateTime,
      scores: record.scores,
      feedback: record.feedback || ticket.description,
      focusPoints: record.focusPoints,
      goals: record.goals,
      rawText: record.rawText || ticket.description,
      totalWeightage: record.totalWeightage || record.scores.reduce((sum, item) => sum + item.weightage, 0),
      totalScore: record.totalScore || record.scores.reduce((sum, item) => sum + item.score, 0),
      scorePercent: record.scorePercent || 0,
      source: record.source || 'ticket',
      sourceRef: record.sourceRef || ticket.sourceRef,
    }];
  });
}

export function isTrainerEvaluationProfileOnly(ticket: Pick<Ticket, 'category' | 'tags' | 'metadata'>): boolean {
  const metadata = ticket.metadata || {};
  return Boolean(
    metadata.profileOnly === true ||
    ticket.tags.includes('profile-only') ||
    (
      ticket.category === 'Trainer Feedback' &&
      ticket.tags.includes('trainer-profile') &&
      Boolean(metadata.trainerReview)
    )
  );
}

export function buildTrainerProfilesFromReviews(records: TrainerReviewRecord[]): TrainerProfile[] {
  const uniqueRecords = Array.from(records.reduce<Map<string, TrainerReviewRecord>>((acc, record) => {
    const key = record.sourceRef || record.id;
    if (!acc.has(key)) acc.set(key, record);
    return acc;
  }, new Map()).values());
  const grouped = uniqueRecords.reduce<Record<string, TrainerReviewRecord[]>>((acc, review) => {
    acc[review.trainer] = acc[review.trainer] || [];
    acc[review.trainer].push(review);
    return acc;
  }, {});
  const trainerNames = Array.from(new Set([...TRAINERS, ...Object.keys(grouped)]));
  return trainerNames
    .map((trainer) => summarizeProfile(
      trainer,
      (grouped[trainer] || []).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    ))
    .sort((a, b) => {
      const latestDelta = Date.parse(b.latestReviewAt || '') - Date.parse(a.latestReviewAt || '');
      if (Number.isFinite(latestDelta) && latestDelta !== 0) return latestDelta;
      return a.trainer.localeCompare(b.trainer);
    });
}

export function saveTrainerReview(input: TrainerEvaluationInput): TrainerReviewRecord {
  const storage = getStorage();
  const record = buildTrainerReviewRecord(input);
  if (storage) {
    const existing = JSON.parse(storage.getItem(STORAGE_KEY) || '[]') as TrainerReviewRecord[];
    storage.setItem(STORAGE_KEY, JSON.stringify([record, ...existing]));
    window.dispatchEvent(new CustomEvent('p57-trainer-profiles-updated'));
  }
  return record;
}

export function buildTrainerEvaluationTicket(input: TrainerEvaluationInput, record?: TrainerReviewRecord): ManualTicketInput {
  const review = record || saveTrainerReview(input);
  return {
    title: `Instructor evaluation · ${input.trainer} · ${input.template}`,
    description: buildTrainerEvaluationText(input),
    category: 'Trainer Feedback',
    subCategory: 'Knowledge and Competence',
    priority: review.scorePercent < 65 ? 'High' : review.scorePercent < 80 ? 'Medium' : 'Low',
    studio: input.studio || STUDIOS[0],
    trainer: input.trainer,
    classType: input.classType || null,
    assignedTo: 'Trainer Profile',
    tags: ['trainer-profile', 'instructor-evaluation', 'profile-only', input.template.toLowerCase()],
    sentiment: review.scorePercent >= 80 ? 'Positive' : review.scorePercent >= 65 ? 'Neutral' : 'Concern',
  };
}
