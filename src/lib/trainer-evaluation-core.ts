import { CLASS_TYPES, STUDIOS, TRAINERS } from './ticketing-data.ts';

export type TrainerReviewTemplate = 'Barre' | 'PowerCycle';

export interface TrainerEvaluationScore {
  category: string;
  weightage: number;
  score: number;
}

export interface TrainerEvaluationInput {
  trainer: string;
  template: TrainerReviewTemplate;
  studio?: string;
  classType?: string;
  reviewPeriod?: string;
  scores: TrainerEvaluationScore[];
  feedback: string;
  focusPoints?: string;
  goals?: string;
  rawText?: string;
}

export interface TrainerReviewRecord extends TrainerEvaluationInput {
  id: string;
  createdAt: string;
  totalWeightage: number;
  totalScore: number;
  scorePercent: number;
  source?: string;
  sourceRef?: string;
}

export interface FilloutTrainingEvaluationMapping {
  input: TrainerEvaluationInput;
  record: TrainerReviewRecord;
  sourceRef: string;
  submissionId?: string;
  formId?: string;
  receivedAt: string;
  answers: Array<{ label: string; value: string }>;
}

export const TRAINER_REVIEW_TEMPLATES: Record<TrainerReviewTemplate, Array<{ category: string; weightage: number }>> = {
  Barre: [
    { category: 'Client attendance', weightage: 12.5 },
    { category: 'Client retention', weightage: 12.5 },
    { category: 'Client outreach, communication and connection', weightage: 12.5 },
    { category: 'Client feedback', weightage: 12.5 },
    { category: 'Mindful moment / USP integration / Motivation', weightage: 8 },
    { category: 'Musicality', weightage: 8 },
    { category: 'Energy and vocals', weightage: 8 },
    { category: 'Choreography and sequencing', weightage: 8 },
    { category: 'Learning styles and use of names', weightage: 8 },
    { category: 'Classes, workshops, meetings and core values', weightage: 10 },
  ],
  PowerCycle: [
    { category: 'Class attendance and bike fill rate', weightage: 12.5 },
    { category: 'Client retention and repeat riders', weightage: 12.5 },
    { category: 'Client outreach, communication and connection', weightage: 12.5 },
    { category: 'Client feedback', weightage: 12.5 },
    { category: 'Ride motivation / USP integration', weightage: 8 },
    { category: 'Musicality and beat matching', weightage: 10 },
    { category: 'Energy, vocals and command', weightage: 10 },
    { category: 'Ride programming and sequencing', weightage: 8 },
    { category: 'Safety, setup and form corrections', weightage: 8 },
    { category: 'Work ethics, meetings and core values', weightage: 6 },
  ],
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keyText(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function slug(value: unknown): string {
  return keyText(value).replace(/[^a-z0-9]+/g, '');
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function firstIdentifier(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return normalizeText(value);
  if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).join(' | ');
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return firstString(
      object.value,
      object.label,
      object.name,
      object.text,
      object.answer,
      object.email,
      object.phone
    ) || JSON.stringify(value);
  }
  return '';
}

function collectAnswerPairs(input: unknown, pairs: Array<{ label: string; value: string }> = [], path: string[] = []): Array<{ label: string; value: string }> {
  if (!input || typeof input !== 'object') return pairs;
  if (Array.isArray(input)) {
    input.forEach((item, index) => collectAnswerPairs(item, pairs, [...path, String(index)]));
    return pairs;
  }

  const object = input as Record<string, unknown>;
  const label = firstString(object.name, object.label, object.title, object.question, object.key, object.id);
  const rawValue = object.value ?? object.answer ?? object.answers ?? object.text;
  const value = stringifyValue(rawValue);
  if (label && value && !/questions|answers|submission/i.test(label)) {
    pairs.push({ label, value });
  }

  for (const [key, child] of Object.entries(object)) {
    if (['value', 'answer', 'text'].includes(key)) continue;
    if (child && typeof child === 'object') {
      collectAnswerPairs(child, pairs, [...path, key]);
    } else {
      const primitiveValue = stringifyValue(child);
      if (primitiveValue && !/id|created|submitted|url|token|signature/i.test(key)) {
        pairs.push({ label: key, value: primitiveValue });
      }
    }
  }
  return pairs;
}

function collectFieldDefinitions(input: unknown, definitions: Map<string, string> = new Map()): Map<string, string> {
  if (!input || typeof input !== 'object') return definitions;
  if (Array.isArray(input)) {
    input.forEach((item) => collectFieldDefinitions(item, definitions));
    return definitions;
  }

  const object = input as Record<string, unknown>;
  const label = firstString(object.name, object.label, object.title, object.question);
  const id = firstIdentifier(object.id, object.key, object.fieldId, object.field_id, object.questionId, object.question_id);
  if (id && label && keyText(id) !== keyText(label) && !/^(name|label|title|question|type)$/i.test(label)) {
    definitions.set(id, label);
  }

  Object.values(object).forEach((child) => collectFieldDefinitions(child, definitions));
  return definitions;
}

function normalizeFilloutPairs(payload: unknown, pairs: Array<{ label: string; value: string }>): Array<{ label: string; value: string }> {
  const definitions = collectFieldDefinitions(payload);
  return pairs
    .map((pair) => ({
      label: definitions.get(pair.label) || pair.label,
      value: pair.value,
    }))
    .filter((pair) => {
      const label = keyText(pair.label);
      if (/^(name|type|id|key|field id|question id)$/.test(label)) return false;
      if (/^(date time picker|dropdown|number input|long answer|short answer|file upload|audio recording|switch|number)$/.test(keyText(pair.value))) return false;
      return true;
    });
}

function uniquePairs(pairs: Array<{ label: string; value: string }>) {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = `${slug(pair.label)}:${pair.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findValue(pairs: Array<{ label: string; value: string }>, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const pair = pairs.find((candidate) => pattern.test(candidate.label));
    if (pair?.value) return pair.value;
  }
  return '';
}

function findKnownValue(raw: string, values: string[]): string {
  const rawKey = keyText(raw);
  if (!rawKey) return '';
  return values.find((value) => keyText(value) === rawKey)
    || values.find((value) => rawKey.includes(keyText(value)) || keyText(value).includes(rawKey))
    || '';
}

function parseNumber(value: string): number {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function normalizeScore(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

export function scoreTrainerEvaluation(scores: TrainerEvaluationScore[]) {
  const normalizedScores = scores.map((item) => ({
    ...item,
    score: normalizeScore(item.score, item.weightage),
  }));
  const totalWeightage = normalizedScores.reduce((sum, item) => sum + item.weightage, 0);
  const totalScore = normalizedScores.reduce((sum, item) => sum + item.score, 0);
  return {
    scores: normalizedScores,
    totalWeightage,
    totalScore,
    scorePercent: totalWeightage ? Math.round((totalScore / totalWeightage) * 100) : 0,
  };
}

export function buildTrainerReviewRecord(
  input: TrainerEvaluationInput,
  options: { id?: string; createdAt?: string; source?: string; sourceRef?: string } = {}
): TrainerReviewRecord {
  const scored = scoreTrainerEvaluation(input.scores);
  return {
    ...input,
    scores: scored.scores,
    id: options.id || `trainer-review-${Date.now()}`,
    createdAt: options.createdAt || new Date().toISOString(),
    totalWeightage: scored.totalWeightage,
    totalScore: scored.totalScore,
    scorePercent: scored.scorePercent,
    source: options.source,
    sourceRef: options.sourceRef,
  };
}

export function buildTrainerEvaluationText(input: TrainerEvaluationInput): string {
  const scoreLines = input.scores
    .filter((item) => item.score > 0)
    .map((item) => `- ${item.category}: ${item.score}/${item.weightage}`);
  return [
    'Instructor evaluation feedback',
    `Instructor: ${input.trainer}`,
    `Template: ${input.template}`,
    input.studio ? `Studio: ${input.studio}` : '',
    input.classType ? `Class / format observed: ${input.classType}` : '',
    input.reviewPeriod ? `Review period / class date: ${input.reviewPeriod}` : '',
    scoreLines.length ? `Scores:\n${scoreLines.join('\n')}` : '',
    `Evaluator comments: ${input.feedback}`,
    input.focusPoints ? `Focus points: ${input.focusPoints}` : '',
    input.goals ? `Goals: ${input.goals}` : '',
  ].filter(Boolean).join('\n');
}

export function parseTrainerEvaluationText(text: string, trainer = 'Unspecified Instructor'): TrainerEvaluationInput {
  const lower = text.toLowerCase();
  const template: TrainerReviewTemplate = /power\s?cycle|bike|ride|rider/.test(lower) ? 'PowerCycle' : 'Barre';
  const avgAttendance = Number(text.match(/average for 2023\s*\n?.*?(\d+(?:\.\d+)?)/i)?.[1] || 0);
  const feedback = [
    text.match(/Client Feedback\s+([\s\S]*?)(?:Internal feedback|Focus points|Goals|$)/i)?.[1],
    text.match(/Internal feedback\s+([\s\S]*?)(?:Focus points|Goals|$)/i)?.[1],
  ].filter(Boolean).join('\n\n').trim() || text.slice(0, 1600);
  const focusPoints = text.match(/Focus points\s+([\s\S]*?)(?:Goals|$)/i)?.[1]?.trim();
  const goals = text.match(/Goals\s+([\s\S]*?)$/i)?.[1]?.trim();
  const templateRows = TRAINER_REVIEW_TEMPLATES[template];
  const scores = templateRows.map((row, index) => ({
    ...row,
    score: index === 0 && avgAttendance ? Math.min(row.weightage, Math.round((avgAttendance / 6) * row.weightage * 10) / 10) : 0,
  }));
  return {
    trainer,
    template,
    scores,
    feedback,
    focusPoints,
    goals,
    rawText: text,
  };
}

function scoreFromAnswers(category: string, weightage: number, pairs: Array<{ label: string; value: string }>): number {
  const categorySlug = slug(category);
  const categoryWords = keyText(category).split(' ').filter((word) => word.length > 3);
  const pair = pairs.find((candidate) => {
    const labelSlug = slug(candidate.label);
    const labelText = keyText(candidate.label);
    return labelSlug.includes(categorySlug)
      || categorySlug.includes(labelSlug)
      || categoryWords.some((word) => labelText.includes(word));
  });
  if (!pair) return 0;
  return normalizeScore(parseNumber(pair.value), weightage);
}

export function mapFilloutTrainingEvaluation(payload: unknown, now = new Date()): FilloutTrainingEvaluationMapping {
  const object = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const submission = (object.submission && typeof object.submission === 'object' ? object.submission : object) as Record<string, unknown>;
  const answers = uniquePairs(normalizeFilloutPairs(submission, collectAnswerPairs(submission)));
  const allText = answers.map((answer) => `${answer.label}: ${answer.value}`).join('\n');

  const trainerRaw = findValue(answers, [/trainer/i, /instructor/i, /coach/i]);
  const trainer = findKnownValue(trainerRaw, TRAINERS) || trainerRaw || 'Unspecified Instructor';
  const templateRaw = findValue(answers, [/template/i, /format/i, /class\s*type/i, /discipline/i]);
  const template: TrainerReviewTemplate = /power\s?cycle|bike|ride|rider/i.test(`${templateRaw}\n${allText}`) ? 'PowerCycle' : 'Barre';
  const studioRaw = findValue(answers, [/^center$/i, /^studio$/i, /^location$/i, /^branch$/i, /studio/i, /location/i, /branch/i, /center/i]);
  const classRaw = findValue(answers, [/class/i, /session/i, /format/i]);
  const reviewPeriod = findValue(answers, [/review\s*period/i, /period/i, /month/i, /date/i]);
  const feedback = findValue(answers, [/feedback/i, /comments?/i, /observation/i, /evaluation/i, /internal/i])
    || allText.slice(0, 1600)
    || 'Fillout training evaluation submitted without evaluator comments.';
  const focusPoints = findValue(answers, [/focus/i, /improvement/i, /work\s*on/i]);
  const goals = findValue(answers, [/goal/i, /next\s*step/i, /target/i]);
  const scores = TRAINER_REVIEW_TEMPLATES[template].map((row) => ({
    ...row,
    score: scoreFromAnswers(row.category, row.weightage, answers),
  }));

  const submissionId = firstIdentifier(object.submissionId, object.submission_id, submission.submissionId, submission.submission_id, submission.id);
  const formId = firstIdentifier(object.formId, object.form_id, submission.formId, submission.form_id);
  const receivedAt = now.toISOString();
  const sourceRef = `fillout:${formId || 'unknown-form'}:${submissionId || String(Math.abs(allText.split('').reduce((hash, char) => ((hash * 31 + char.charCodeAt(0)) | 0), 0))).toString(36)}`;
  const input: TrainerEvaluationInput = {
    trainer,
    template,
    studio: findKnownValue(studioRaw, STUDIOS) || studioRaw || undefined,
    classType: findKnownValue(classRaw, CLASS_TYPES) || classRaw || undefined,
    reviewPeriod: reviewPeriod || undefined,
    scores,
    feedback,
    focusPoints: focusPoints || undefined,
    goals: goals || undefined,
    rawText: allText || JSON.stringify(payload),
  };

  return {
    input,
    record: buildTrainerReviewRecord(input, {
      id: `fillout-trainer-review-${submissionId || Date.now()}`,
      createdAt: receivedAt,
      source: 'fillout',
      sourceRef,
    }),
    sourceRef,
    submissionId: submissionId || undefined,
    formId: formId || undefined,
    receivedAt,
    answers,
  };
}
