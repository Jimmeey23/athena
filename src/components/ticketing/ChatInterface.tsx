import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, Sparkles, CheckCircle2, Paperclip, X, Mic, Square, ChevronDown, Check, HelpCircle, ClipboardCheck, Gauge, GraduationCap } from 'lucide-react';
import InteractiveRobotSpline from '@/components/InteractiveRobotSpline';
import { ROBOT_SPLINE_URL } from '@/lib/galleryImages';
import { TicketPreviewCard } from './TicketPreviewCard';
import { ContextPicker, Context } from './ContextPicker';
import { useTickets } from './useTickets';
import { useBackendAuth } from '@/contexts/BackendAuthContext';
import {
  getMomenceMemberMemberships,
  loadMomenceTicketContext,
  MomenceInsightSummary,
  MomenceMemberOption,
  MomenceMembership,
  MomenceSessionOption,
  searchMomenceMembers,
  searchMomenceSessions,
} from '@/lib/momence-api';
import {
  CLIENTS_AFFECTED_OPTIONS,
  captureMemberVoiceFromText,
  getIntakeFieldDefinition,
  getMissingIntakeFields,
  inferIntakeContextFromText,
  isProtectedEntityField,
  isMissingIntakeValue,
  IntakeContext,
} from '@/lib/intake-rules';
import {
  shouldAcceptAiDetailForm,
  shouldAcceptInferredSubCategory,
  shouldHoldDraftForMoreInfo,
  shouldReplaceInferredCategory,
} from '@/lib/intake-response-state';
import {
  CATEGORIES,
  CLASS_TYPES,
  FREEZE_REASONS,
  HOSTED_CLASS_FEEDBACK_AREAS,
  INTAKE_ROUTES,
  MEMBER_SENTIMENT_OPTIONS,
  MEMBERSHIPS,
  PRIORITY_SLA,
  REQUEST_TYPES,
  ROLLOVER_REASONS,
  STUDIOS,
  TRAINERS,
  Ticket,
  resolveTicketAssignee,
  resolveTicketDepartment,
} from '@/lib/ticketing-data';
import { findExistingSubmittedTicket } from '@/lib/ticket-duplicate-matching';
import { invokeTicketingFunction } from '@/lib/ticketing-functions';
import { buildAthenaDraftRequestBody } from '@/lib/ticket-ai-chat-payload';
import { buildTicketReviewInsights } from '@/lib/ticket-review';
import { getGreetingQuickActions, isCasualGreeting } from '@/lib/athena-chat-intent';
import { shouldUseOptionButtons } from '@/lib/intake-option-buttons';
import { trainerImageUrl, trainerInitials } from '@/lib/trainer-images';
import {
  TRAINER_REVIEW_TEMPLATES,
  TrainerEvaluationInput,
  TrainerEvaluationScore,
  TrainerReviewTemplate,
  buildTrainerEvaluationText,
  buildTrainerReviewRecord,
  isTrainerEvaluationProfileOnly,
  parseTrainerEvaluationText,
  saveTrainerReview,
} from '@/lib/trainer-profiles';
import { SlaCountdown } from './SlaCountdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SuggestedChip {
  label: string;
  value: string;
  field: string;
}

type DetailFieldType = 'select' | 'text' | 'textarea' | 'date' | 'datetime-local' | 'number';

interface DetailFormField {
  id: string;
  label: string;
  type: DetailFieldType;
  required?: boolean;
  options?: string[];
  dependsOn?: string;
}

interface DetailForm {
  title: string;
  description?: string;
  fields: DetailFormField[];
  submitLabel?: string;
}

interface DraftTicket {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  assignedTo?: string | null;
  department?: string | null;
  tags: string[];
  sentiment?: string;
  conversationSummary?: string;
  metadata?: Record<string, unknown>;
}

interface PendingAttachment {
  id: string;
  file: File;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type DetailContext = Context & IntakeContext;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  aiGenerated?: boolean;
  ticket?: DraftTicket | null;
  trainerEvaluation?: TrainerEvaluationInput;
  suggestedChips?: SuggestedChip[];
  ticketId?: string;
  published?: boolean;
  detailForm?: DetailForm | null;
  publishedTicket?: Ticket;
}

interface AiIntakeResponse {
  conversationId?: string;
  needsMoreInfo?: boolean;
  reply?: string;
  detailForm?: DetailForm | null;
  ticket?: DraftTicket | null;
  suggestedChips?: SuggestedChip[];
  inferredContext?: Partial<DetailContext>;
  missingFields?: string[];
  publishable?: boolean;
  urgencyReason?: string;
}

const GREETING: Message = {
  id: 'greet',
  role: 'assistant',
  content:
    "Hi, I'm **Athena** 🤖, your ticket intake assistant.\n\nPlease describe the issue, request, feedback, or escalation in as much detail as possible.\n\nFor accurate routing and priority 🎯, please include the member name, location, booking details, staff involved, screenshots 📸, dates 📅, and any other relevant context.",
};

const USER_TONES = [
  {
    avatar: 'border-blue-200 bg-white text-blue-600 shadow-[0_12px_28px_rgba(37,99,235,0.16)]',
    bubble: 'rounded-tr-md border border-l-4 border-blue-200 border-l-blue-500 bg-white text-slate-800 shadow-[0_18px_44px_rgba(37,99,235,0.14)]',
    more: 'text-blue-700 hover:text-blue-900',
  },
  {
    avatar: 'border-cyan-200 bg-white text-cyan-600 shadow-[0_12px_28px_rgba(8,145,178,0.14)]',
    bubble: 'rounded-tr-md border border-l-4 border-cyan-200 border-l-cyan-500 bg-white text-slate-800 shadow-[0_18px_44px_rgba(8,145,178,0.13)]',
    more: 'text-cyan-700 hover:text-cyan-900',
  },
  {
    avatar: 'border-indigo-200 bg-white text-indigo-600 shadow-[0_12px_28px_rgba(79,70,229,0.14)]',
    bubble: 'rounded-tr-md border border-l-4 border-indigo-200 border-l-indigo-500 bg-white text-slate-800 shadow-[0_18px_44px_rgba(79,70,229,0.13)]',
    more: 'text-indigo-700 hover:text-indigo-900',
  },
  {
    avatar: 'border-sky-200 bg-white text-sky-600 shadow-[0_12px_28px_rgba(2,132,199,0.15)]',
    bubble: 'rounded-tr-md border border-l-4 border-sky-200 border-l-sky-500 bg-white text-slate-800 shadow-[0_18px_44px_rgba(2,132,199,0.14)]',
    more: 'text-sky-700 hover:text-sky-900',
  },
];

function getDisplayError(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const parts = [
      typeof value.message === 'string' ? value.message : '',
      typeof value.details === 'string' ? value.details : '',
      typeof value.hint === 'string' ? value.hint : '',
      typeof value.code === 'string' ? `Code: ${value.code}` : '',
    ].filter(Boolean);
    if (parts.length) return parts.join(' ');
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function getReporterName(user: ReturnType<typeof useBackendAuth>['user']): string {
  const metadata = user?.user_metadata || {};
  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  return fullName || name || user?.email || 'Authenticated user';
}

const DETAIL_FORM_FIELD_LIBRARY: Record<string, DetailFormField> = {
  intakeRoute: {
    id: 'intakeRoute',
    label: 'Intake Route',
    type: 'select',
    required: true,
    options: INTAKE_ROUTES,
  },
  requestType: {
    id: 'requestType',
    label: 'Specific Ticket Type',
    type: 'select',
    required: true,
    options: REQUEST_TYPES,
  },
  clientsAffected: {
    id: 'clientsAffected',
    label: 'Were any clients affected?',
    type: 'select',
    required: true,
    options: [...CLIENTS_AFFECTED_OPTIONS],
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    type: 'select',
    required: true,
    options: STUDIOS,
  },
  category: {
    id: 'category',
    label: 'Category',
    type: 'select',
    required: true,
    options: Object.keys(CATEGORIES),
  },
  subCategory: {
    id: 'subCategory',
    label: 'Issue Type',
    type: 'select',
    required: true,
    dependsOn: 'category',
    options: Object.values(CATEGORIES).flat(),
  },
  trainer: {
    id: 'trainer',
    label: 'Instructor',
    type: 'select',
    options: TRAINERS,
  },
  classType: {
    id: 'classType',
    label: 'Class / Session',
    type: 'select',
    required: true,
    options: CLASS_TYPES,
  },
  membership: {
    id: 'membership',
    label: 'Package / Membership',
    type: 'select',
    options: MEMBERSHIPS,
  },
  memberName: {
    id: 'memberName',
    label: 'Member Name',
    type: 'text',
    required: true,
  },
  memberContact: {
    id: 'memberContact',
    label: 'Member Contact',
    type: 'text',
    required: true,
  },
  priority: {
    id: 'priority',
    label: 'Priority',
    type: 'select',
    required: true,
    options: Object.keys(PRIORITY_SLA),
  },
  description: {
    id: 'description',
    label: 'Describe the issue in detail',
    type: 'textarea',
    required: true,
  },
  desiredResolution: {
    id: 'desiredResolution',
    label: 'Requested resolution',
    type: 'textarea',
  },
  incidentDateTime: {
    id: 'incidentDateTime',
    label: 'Approx. Incident Date / Time',
    type: 'datetime-local',
  },
  memberSentiment: {
    id: 'memberSentiment',
    label: 'Member Sentiment',
    type: 'select',
    options: MEMBER_SENTIMENT_OPTIONS,
  },
  freezeStartDate: {
    id: 'freezeStartDate',
    label: 'Requested Freeze Start Date',
    type: 'date',
    required: true,
  },
  freezeEndDate: {
    id: 'freezeEndDate',
    label: 'Requested Freeze End Date',
    type: 'date',
    required: true,
  },
  freezeReason: {
    id: 'freezeReason',
    label: 'Freeze Reason Stated by Member',
    type: 'select',
    required: true,
    options: FREEZE_REASONS,
  },
  classesRemaining: {
    id: 'classesRemaining',
    label: 'Classes / Credits Remaining',
    type: 'number',
  },
  packageExpiryDate: {
    id: 'packageExpiryDate',
    label: 'Current Package Expiry Date',
    type: 'date',
  },
  requestedRolloverDate: {
    id: 'requestedRolloverDate',
    label: 'Requested Roll Over / Extension Date',
    type: 'date',
    required: true,
  },
  rolloverReason: {
    id: 'rolloverReason',
    label: 'Roll Over Reason',
    type: 'select',
    required: true,
    options: ROLLOVER_REASONS,
  },
  partnerName: {
    id: 'partnerName',
    label: 'Hosted Class Partner / Influencer',
    type: 'text',
    required: true,
  },
  hostedFeedbackArea: {
    id: 'hostedFeedbackArea',
    label: 'Hosted Class Feedback Area',
    type: 'select',
    required: true,
    options: HOSTED_CLASS_FEEDBACK_AREAS,
  },
  attendeeCount: {
    id: 'attendeeCount',
    label: 'Approx. Attendee Count',
    type: 'number',
  },
  prospectQuality: {
    id: 'prospectQuality',
    label: 'Prospect Quality / Conversion Signal',
    type: 'select',
    options: ['High Fit', 'Moderate Fit', 'Low Fit', 'Existing Members Mostly', 'Unable to Determine'],
  },
  followUpPreference: {
    id: 'followUpPreference',
    label: 'Follow-up Preference Indicated',
    type: 'select',
    options: ['Phone Call', 'WhatsApp', 'Email', 'Instagram DM', 'In-Person Next Visit', 'No Follow-up Requested'],
  },
};

function getDetailField(id: string): DetailFormField | undefined {
  return DETAIL_FORM_FIELD_LIBRARY[id] || getIntakeFieldDefinition(id);
}

function normalizeDetailForm(input: unknown): DetailForm | null {
  if (!input || typeof input !== 'object') return null;
  const form = input as Partial<DetailForm> & { fields?: Array<Partial<DetailFormField> | string> };
  const seen = new Set<string>();
  const allowedTypes = new Set<DetailFieldType>(['select', 'text', 'textarea', 'date', 'datetime-local', 'number']);
  const fields = (form.fields || [])
    .map((field) => {
      if (typeof field === 'string') {
        const normalizedId = field === 'requestType' ? 'intakeRoute' : field;
        if (seen.has(normalizedId)) return null;
        seen.add(normalizedId);
        return getDetailField(normalizedId);
      }
      const id = field.id ? (String(field.id) === 'requestType' ? 'intakeRoute' : String(field.id)) : '';
      if (id === 'reportedBy') return null;
      const base = getDetailField(id);
      if (seen.has(id)) return null;
      seen.add(id);
      if (base) {
        // AI-provided label and options take priority over library defaults.
        // This lets the AI give contextual, issue-specific labels to known fields
        // (e.g. 'description' can be labelled "What is wrong with the latch?" instead
        // of the generic library label "Member's stated feedback").
        const aiLabel = typeof (field as Partial<DetailFormField>).label === 'string' && (field as Partial<DetailFormField>).label!.trim()
          ? (field as Partial<DetailFormField>).label!.trim()
          : null;
        const rawAiOptions = (field as Partial<DetailFormField>).options;
        const aiOptions = Array.isArray(rawAiOptions) && rawAiOptions.length > 0
          ? rawAiOptions.map(String).filter(Boolean).slice(0, 30)
          : null;
        return {
          ...base,
          ...field,
          id: base.id,
          label: aiLabel || base.label,
          options: aiOptions || base.options,
        } as DetailFormField;
      }

      const label = typeof field.label === 'string' && field.label.trim() ? field.label.trim() : '';
      const type = field.type && allowedTypes.has(field.type) ? field.type : 'text';
      if (!id || !label) return null;
      return {
        id: id.replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 80),
        label,
        type,
        required: field.required !== false,
        options: Array.isArray(field.options) ? field.options.map(String).filter(Boolean).slice(0, 30) : undefined,
        dependsOn: typeof field.dependsOn === 'string' ? field.dependsOn : undefined,
      } as DetailFormField;
    })
    .filter(Boolean) as DetailFormField[];

  if (fields.length === 0) return null;
  return {
    title: form.title || 'Add the missing ticket details',
    description: form.description,
    fields,
    submitLabel: form.submitLabel || 'Continue drafting',
  };
}

function chipsForSingleField(field: DetailFormField, ctx: DetailContext): SuggestedChip[] {
  if (ctx[field.id]) return [];
  if (field.type !== 'select') return [];
  const options = field.id === 'subCategory' && ctx.category ? CATEGORIES[ctx.category] || [] : field.options || [];
  if (field.id === 'membership' || options.length === 0) return [];
  return options.slice(0, 10).map((option) => ({
    label: option,
    value: option,
    field: field.id,
  }));
}

function applyDetailValue(ctx: DetailContext, field: string, value: string): DetailContext {
  const next = { ...ctx };
  if (field === 'studio') next.studio = value;
  else if (field === 'trainer') next.trainer = value;
  else if (field === 'classType') next.classType = value;
  else if (field === 'memberName') next.memberName = value;
  else if (field === 'memberContact') next.memberContact = value;
  else if (field === 'category') {
    next.category = value;
    next.subCategory = undefined;
  } else if (field === 'subCategory') next.subCategory = value;
  else if (field === 'reportedBy') next.reportedBy = value;
  else if (field === 'assignedTo' || field === 'owner') next.assignedTo = value;
  else if (field === 'department' || field === 'team') next.department = value;
  else next[field] = value;
  return next;
}

function normalizeInferredContext(input: unknown): Partial<DetailContext> {
  if (!input || typeof input !== 'object') return {};
  const value = input as Record<string, unknown>;
  const next: Partial<DetailContext> = {};
  const assignString = (key: keyof DetailContext) => {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) next[key] = candidate.trim();
  };

  assignString('intakeRoute');
  assignString('requestType');
  assignString('category');
  assignString('subCategory');
  assignString('priority');
  assignString('memberSentiment');
  assignString('desiredResolution');
  assignString('urgencyReason');
  assignString('clientsAffected');
  assignString('membership');

  return next;
}

function mergeInferredContext(ctx: DetailContext, inferred: Partial<DetailContext>, fallbackUrgency?: string): DetailContext {
  const next: DetailContext = { ...ctx };
  for (const [key, value] of Object.entries(inferred)) {
    if (!value) continue;
    if (
      (key === 'category' || key === 'subCategory') &&
      next.category === 'Hosted Class & Partnerships' &&
      (value === 'General Feedback' || value === 'Other')
    ) {
      continue;
    }
    if (key === 'category' && next.category !== value) {
      if (!shouldReplaceInferredCategory(next.category, value)) continue;
      next.category = value;
      next.subCategory = undefined;
      continue;
    }
    if (key === 'subCategory' && !shouldAcceptInferredSubCategory(next.category, value, CATEGORIES[next.category || ''])) {
      continue;
    }
    next[key] = value;
  }
  if (fallbackUrgency && !next.urgencyReason) next.urgencyReason = fallbackUrgency;
  return next;
}

function fieldHasContextValue(field: DetailFormField, ctx: DetailContext): boolean {
  const value = ctx[field.id];
  const hasAnyIntakeValue = (...values: unknown[]) => values.some((candidate) => !isMissingIntakeValue(candidate));
  if (field.id === 'memberName') return hasAnyIntakeValue(ctx.memberId, ctx.memberName);
  if (field.id === 'memberContact') return hasAnyIntakeValue(ctx.memberContact, ctx.memberId);
  if (field.id === 'classType') return hasAnyIntakeValue(ctx.sessionId, ctx.classType);
  if (field.id === 'membership') return hasAnyIntakeValue(ctx.membership);
  return !isMissingIntakeValue(value);
}

function pruneDetailForm(form: DetailForm | null, ctx: DetailContext): DetailForm | null {
  if (!form) return null;
  const fields = form.fields.filter((field) => !fieldHasContextValue(field, ctx));
  if (fields.length === 0) return null;
  return { ...form, fields };
}

function filterAiDetailForm(form: DetailForm | null, ctx: DetailContext, requiredFields: Set<string>): DetailForm | null {
  if (!form) return null;
  const fields = form.fields.filter((field) => {
    if (field.id === 'reportedBy') return false;
    if (field.id === 'description' && requiredFields.size > 0 && !requiredFields.has('description')) return false;
    if (!isProtectedEntityField(field.id)) return true;
    return requiredFields.has(field.id);
  });

  if (fields.length === 0) return null;
  return { ...form, fields };
}

function mergeDetailForms(primary: DetailForm | null, secondary: DetailForm | null): DetailForm | null {
  if (!primary) return secondary;
  if (!secondary) return primary;
  const seen = new Set<string>();
  const fields = [...primary.fields, ...secondary.fields].filter((field) => {
    if (seen.has(field.id)) return false;
    seen.add(field.id);
    return true;
  });

  return {
    ...primary,
    description: primary.description || secondary.description,
    fields,
    submitLabel: primary.submitLabel || secondary.submitLabel,
  };
}

function detailFormFromQuestionText(text: string, ctx: DetailContext): DetailForm | null {
  const questionLines = text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[).\s-]*/, '').replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.endsWith('?') || /which|what|when|where|issue|experience|report|happen|date|time|resolution|refund|apology|investigation|member|contact|studio|request|category|reported|priority|freeze|roll|hosted|partner/i.test(line));

  if (questionLines.length < 2) {
    return null;
  }

  const fieldIds = new Set<string>();
  const add = (id: string, present?: string) => {
    if (!present) fieldIds.add(id);
  };

  for (const line of questionLines) {
    const lower = line.toLowerCase();
    if (lower.includes('studio')) add('studio', ctx.studio);
    if (/client|member|community member|affected|impact/.test(lower)) add('clientsAffected', ctx.clientsAffected);
    if (lower.includes('member') || lower.includes('name')) add('memberName', ctx.memberName);
    if (lower.includes('contact') || lower.includes('phone') || lower.includes('email')) add('memberContact', ctx.memberContact);
    if (lower.includes('issue') || lower.includes('experience') || lower.includes('report') || lower.includes('what happened') || lower.includes('what did')) add('description', ctx.description);
    if (lower.includes('when') || lower.includes('date') || lower.includes('time') || lower.includes('happen') || lower.includes('incident')) add('incidentDateTime', ctx.incidentDateTime);
    if (lower.includes('resolution') || lower.includes('looking for') || lower.includes('refund') || lower.includes('apology') || lower.includes('investigation') || lower.includes('something else')) add('desiredResolution', ctx.desiredResolution);
    if (lower.includes('specific') || lower.includes('type')) add('requestType', ctx.requestType);
    if (lower.includes('reported') || lower.includes('documented')) add('reportedBy', ctx.reportedBy);
    if (lower.includes('priority') || lower.includes('urgent')) add('priority', ctx.priority);
    if (lower.includes('freeze')) {
      add('membership', ctx.membership);
      add('freezeStartDate', ctx.freezeStartDate);
      add('freezeEndDate', ctx.freezeEndDate);
      add('freezeReason', ctx.freezeReason);
    }
    if (lower.includes('roll') || lower.includes('extension')) {
      add('membership', ctx.membership);
      add('classesRemaining', ctx.classesRemaining);
      add('packageExpiryDate', ctx.packageExpiryDate);
      add('requestedRolloverDate', ctx.requestedRolloverDate);
      add('rolloverReason', ctx.rolloverReason);
    }
    if (lower.includes('hosted') || lower.includes('partner') || lower.includes('influencer')) {
      add('partnerName', ctx.partnerName);
      add('hostedFeedbackArea', ctx.hostedFeedbackArea);
      add('prospectQuality', ctx.prospectQuality);
      add('followUpPreference', ctx.followUpPreference);
    }
  }

  return normalizeDetailForm({
    title: 'Complete the ticket details',
    description: 'Athena grouped the missing operational details into a structured intake form using the Physique 57 master data lists.',
    fields: Array.from(fieldIds),
    submitLabel: 'Continue drafting ticket',
  });
}

function mergeDraftWithContext(draft: DraftTicket, ctx: DetailContext): DraftTicket {
  const resolvedOwner = ctx.assignedTo || ctx.owner || draft.assignedTo || resolveTicketAssignee(ctx.category || draft.category, ctx.studio || draft.studio);
  const resolvedDepartment = ctx.department || ctx.team || draft.department || resolveTicketDepartment(ctx.category || draft.category, resolvedOwner);
  return {
    ...draft,
    category: ctx.category || draft.category,
    subCategory: ctx.subCategory || draft.subCategory,
    priority: (ctx.priority as DraftTicket['priority']) || draft.priority,
    studio: ctx.studio || draft.studio,
    trainer: draft.trainer || null,
    classType: draft.classType || null,
    classDateTime: draft.classDateTime || null,
    memberName: draft.memberName || null,
    memberContact: draft.memberContact || null,
    reportedBy: ctx.reportedBy || draft.reportedBy,
    assignedTo: resolvedOwner,
    department: resolvedDepartment,
    sentiment: ctx.memberSentiment || draft.sentiment,
    conversationSummary: ctx.description || draft.conversationSummary,
  };
}

function contextFromDraft(draft: DraftTicket, ctx: DetailContext): DetailContext {
  return {
    ...ctx,
    category: draft.category || ctx.category,
    subCategory: draft.subCategory || ctx.subCategory,
    priority: draft.priority || ctx.priority,
    studio: draft.studio || ctx.studio,
    trainer: draft.trainer || undefined,
    classType: draft.classType || undefined,
    classDateTime: draft.classDateTime || undefined,
    memberName: draft.memberName || undefined,
    memberContact: draft.memberContact || undefined,
    reportedBy: ctx.reportedBy || draft.reportedBy,
    assignedTo: draft.assignedTo || ctx.assignedTo || ctx.owner,
    department: draft.department || ctx.department || ctx.team,
    memberSentiment: draft.sentiment || ctx.memberSentiment,
  };
}

function requiredFieldsForIssue(ctx: DetailContext, draft?: DraftTicket | null): string[] {
  const mergedContext: DetailContext = draft
    ? {
        ...ctx,
        category: ctx.category || draft.category,
        subCategory: ctx.subCategory || draft.subCategory,
      }
    : ctx;
  return getMissingIntakeFields(mergedContext, { includeClientImpact: Boolean(draft) });
}

const MEMBER_ENTITY_KEYS = ['memberId', 'memberName', 'memberContact', 'membership'] as const;
const SESSION_ENTITY_KEYS = ['sessionId', 'classType', 'classDateTime', 'trainer'] as const;

function hasConfirmedAffectedClients(value?: string): boolean {
  return /^yes\b/i.test(value || '');
}

function shouldCarryMemberContext(issueText: string, ctx: DetailContext): boolean {
  const value = [
    issueText,
    ctx.initialReport,
    ctx.category,
    ctx.subCategory,
    ctx.requestType,
    ctx.clientsAffected,
  ].filter(Boolean).join(' ').toLowerCase();

  if (hasConfirmedAffectedClients(ctx.clientsAffected)) return true;
  return /member|client|customer|guest|prospect|profile|contact|phone|email|membership|package|billing|payment|refund|freeze|roll\s?over|extension|renewal|follow-up/.test(value);
}

function shouldCarrySessionContext(issueText: string, ctx: DetailContext): boolean {
  const value = [
    issueText,
    ctx.initialReport,
    ctx.category,
    ctx.subCategory,
    ctx.requestType,
  ].filter(Boolean).join(' ').toLowerCase();

  return /class|session|booking|schedul|waitlist|attendance|attendee|trainer|instructor|barre|cycle|powercycle|strength|late cancellation|no-show/.test(value);
}

function pruneEntityContextForIssue(
  ctx: DetailContext,
  issueText: string,
  explicitlyRequestedFields = new Set<string>()
): DetailContext {
  const next: DetailContext = { ...ctx };
  const keepMemberContext = shouldCarryMemberContext(issueText, ctx)
    || MEMBER_ENTITY_KEYS.some((key) => explicitlyRequestedFields.has(key));
  const keepSessionContext = shouldCarrySessionContext(issueText, ctx)
    || SESSION_ENTITY_KEYS.some((key) => explicitlyRequestedFields.has(key));

  if (!keepMemberContext) {
    MEMBER_ENTITY_KEYS.forEach((key) => {
      delete (next as Record<string, unknown>)[key];
    });
  }

  if (!keepSessionContext) {
    SESSION_ENTITY_KEYS.forEach((key) => {
      delete (next as Record<string, unknown>)[key];
    });
  }

  return next;
}

function detailFormForContext(ctx: DetailContext): DetailForm | null {
  const fields = requiredFieldsForIssue(ctx);
  if (fields.length === 0) return null;
  return normalizeDetailForm({
    title: 'Complete the ticket details',
    description: 'Athena needs these required fields before a ticket draft can be reviewed.',
    fields,
    submitLabel: 'Continue drafting ticket',
  });
}

function detailFormForIncompleteDraft(draft: DraftTicket | null | undefined, ctx: DetailContext): DetailForm | null {
  if (!draft) return null;
  const fields = requiredFieldsForIssue(ctx, mergeDraftWithContext(draft, ctx));

  if (fields.length === 0) return null;
  return normalizeDetailForm({
    title: 'Complete the ticket details',
    description: 'Athena needs these required fields before the ticket can be published.',
    fields,
    submitLabel: 'Submit required details',
  });
}

function buildClientDraft(ctx: DetailContext, text: string): DraftTicket {
  const category = ctx.category || 'General Feedback';
  const subCategory = ctx.subCategory || 'Other';
  const includeMemberContext = shouldCarryMemberContext(text, ctx);
  const includeSessionContext = shouldCarrySessionContext(text, ctx);
  const description = [
    `Issue summary: ${ctx.description || text}`,
    '',
    'Operational context:',
    ctx.intakeRoute ? `- Intake route: ${ctx.intakeRoute}` : null,
    `- Category: ${category} / ${subCategory}`,
    includeMemberContext && ctx.memberName ? `- Member: ${ctx.memberName}` : null,
    ctx.studio ? `- Studio: ${ctx.studio}` : null,
    includeSessionContext && ctx.trainer ? `- Instructor: ${ctx.trainer}` : null,
    includeSessionContext && ctx.classType ? `- Class/session: ${ctx.classType}` : null,
    ctx.incidentDateTime ? `- Approx. incident date/time: ${ctx.incidentDateTime}` : null,
    ctx.desiredResolution ? `- Requested resolution: ${ctx.desiredResolution}` : null,
    ...Object.entries(ctx)
      .filter(([key, value]) => (
        value &&
        ![
          'intakeRoute',
          'requestType',
          'memberId',
          'memberName',
          'memberContact',
          'sessionId',
          'studio',
          'trainer',
          'classType',
          'classDateTime',
          'membership',
          'category',
          'subCategory',
          'reportedBy',
          'priority',
          'description',
          'incidentDateTime',
          'desiredResolution',
          'memberSentiment',
          'urgencyReason',
        ].includes(key)
      ))
      .map(([key, value]) => `- ${getDetailField(key)?.label || key}: ${value}`),
  ].filter(Boolean).join('\n');

  return {
    title: [ctx.intakeRoute || 'Ticket', subCategory, includeMemberContext ? ctx.memberName : null].filter(Boolean).join(' · ').slice(0, 96),
    description,
    category,
    subCategory,
    priority: (ctx.priority as DraftTicket['priority']) || 'Medium',
    studio: ctx.studio || 'Unspecified Studio',
    trainer: includeSessionContext ? ctx.trainer || null : null,
    classType: includeSessionContext ? ctx.classType || null : null,
    classDateTime: includeSessionContext ? ctx.classDateTime || null : null,
    memberName: includeMemberContext ? ctx.memberName || null : null,
    memberContact: includeMemberContext ? ctx.memberContact || null : null,
    reportedBy: ctx.reportedBy || null,
    assignedTo: ctx.assignedTo || ctx.owner || null,
    department: ctx.department || ctx.team || null,
    tags: ['ai-draft', ctx.intakeRoute, category, subCategory].filter(Boolean).map((value) =>
      String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    ),
    sentiment: ctx.memberSentiment || 'Neutral',
    conversationSummary: ctx.description || text,
  };
}

function scorePercentFromEvaluation(input: TrainerEvaluationInput): number {
  const totalWeightage = input.scores.reduce((sum, item) => sum + item.weightage, 0);
  const totalScore = input.scores.reduce((sum, item) => sum + Math.max(0, Math.min(item.weightage, item.score)), 0);
  return totalWeightage ? Math.round((totalScore / totalWeightage) * 100) : 0;
}

function trainerEvaluationBand(scorePercent: number): string {
  if (scorePercent < 65) return 'High coaching priority';
  if (scorePercent < 80) return 'Development watch';
  return 'On-track performance';
}

function buildTrainerEvaluationDraft(input: TrainerEvaluationInput): DraftTicket {
  const scorePercent = scorePercentFromEvaluation(input);
  const structuredDescription = buildTrainerEvaluationText({ ...input, rawText: undefined });
  const trainerReview = buildTrainerReviewRecord(input, {
    source: 'athena',
    sourceRef: `athena-trainer-review:${input.trainer}:${input.template}:${input.reviewPeriod || Date.now()}`,
  });
  return {
    title: `Instructor evaluation · ${input.trainer} · ${input.template}`,
    description: structuredDescription,
    category: 'Trainer Feedback',
    subCategory: 'Knowledge and Competence',
    priority: 'Low',
    studio: input.studio || STUDIOS[0],
    trainer: input.trainer,
    classType: input.classType || null,
    classDateTime: input.reviewPeriod || null,
    memberName: null,
    memberContact: null,
    reportedBy: null,
    assignedTo: 'Trainer Profile',
    department: 'Training',
    tags: ['trainer-profile', 'instructor-evaluation', 'profile-only', input.template.toLowerCase()],
    sentiment: scorePercent >= 80 ? 'Positive' : scorePercent >= 65 ? 'Neutral' : 'Concern',
    conversationSummary: [
      `Instructor evaluation drafted for ${input.trainer} (${input.template}).`,
      `Weighted score: ${scorePercent}% · ${trainerEvaluationBand(scorePercent)}.`,
      input.focusPoints ? `Primary focus: ${input.focusPoints}` : '',
      input.goals ? `Target goal: ${input.goals}` : '',
      'Recorded under Trainer Profiles only. No operational owner or SLA follow-up required.',
    ].filter(Boolean).join('\n'),
    metadata: {
      profileOnly: true,
      trainerReview,
      routing: {
        department: 'Training',
        assigned_to: 'Trainer Profile',
        status: 'Closed',
        priority: 'Low',
        profile_only: true,
        routing_source: 'trainer_profile_record',
      },
    },
  };
}

export const ChatInterface: React.FC<{ onOpenExistingTicket?: (ticket: Ticket) => void; resetVersion?: number }> = ({ onOpenExistingTicket, resetVersion = 0 }) => {
  const { createApprovedTicket, tickets, setSelectedTicket } = useTickets();
  const { user } = useBackendAuth();
  const reporterName = getReporterName(user);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [context, setContext] = useState<DetailContext>({});
  const [pendingSingleField, setPendingSingleField] = useState<DetailFormField | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLiveText, setVoiceLiveText] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeDraftReviewMessageId, setActiveDraftReviewMessageId] = useState<string | null>(null);
  const [instructorEvaluationMode, setInstructorEvaluationMode] = useState(false);
  const [textToTicketOpen, setTextToTicketOpen] = useState(false);
  const [textToTicketText, setTextToTicketText] = useState('');
  const [now, setNow] = useState<Date>(new Date());
  const publishingRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalVoiceTranscriptRef = useRef('');
  const voiceSessionActiveRef = useRef(false);
  const voiceManualStopRef = useRef(false);
  const voiceSilenceTimerRef = useRef<number | null>(null);
  const requestNonceRef = useRef(0);
  const activeChatEpochRef = useRef(0);
  const lastResetVersionRef = useRef(resetVersion);
  const recentTickets = useMemo(
    () => tickets
      .filter((ticket) => !isTrainerEvaluationProfileOnly(ticket))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 2),
    [tickets]
  );
  const activeDraftReviewMessage = useMemo(
    () => messages.find((message) => message.id === activeDraftReviewMessageId && message.ticket) || null,
    [activeDraftReviewMessageId, messages]
  );

  useEffect(() => {
    setContext((current) => {
      if (current.reportedBy === reporterName) return current;
      return { ...current, reportedBy: reporterName };
    });
  }, [reporterName]);

  useEffect(() => {
    const mode = instructorEvaluationMode ? 'trainer' : 'ticket';
    document.documentElement.dataset.athenaMode = mode;
    window.dispatchEvent(new CustomEvent('athena-mode-change', { detail: { mode } }));
    return () => {
      document.documentElement.dataset.athenaMode = 'ticket';
      window.dispatchEvent(new CustomEvent('athena-mode-change', { detail: { mode: 'ticket' } }));
    };
  }, [instructorEvaluationMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    const maybeCtor = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    setVoiceSupported(Boolean(maybeCtor));
  }, []);

  useEffect(() => () => {
    voiceSessionActiveRef.current = false;
    speechRecognitionRef.current?.stop();
    if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
  }, []);

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    setPendingAttachments((current) => {
      const next = [...current];
      Array.from(files).forEach((file) => {
        const exists = next.some((entry) => (
          entry.file.name === file.name &&
          entry.file.size === file.size &&
          entry.file.lastModified === file.lastModified
        ));
        if (!exists) next.push({ id: `${file.name}-${file.size}-${file.lastModified}`, file });
      });
      return next.slice(0, 8);
    });
  };

  const normalizeVoiceText = (value: string) =>
    value
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim();

  const armVoiceSilenceTimer = () => {
    if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
    voiceSilenceTimerRef.current = window.setTimeout(() => {
      if (voiceSessionActiveRef.current && speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
    }, 2500);
  };

  const startVoiceCapture = () => {
    if (loading || listening) return;
    const maybeCtor = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!maybeCtor) return;

    finalVoiceTranscriptRef.current = '';
    voiceManualStopRef.current = false;
    voiceSessionActiveRef.current = true;
    setVoiceLiveText('');
    setVoiceHint('Listening… speak naturally.');
    const recognition = new maybeCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 3;
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const fragment = event.results[i][0]?.transcript || '';
        const cleanedFragment = normalizeVoiceText(fragment);
        if (!cleanedFragment || cleanedFragment.length < 2) continue;
        if (event.results[i].isFinal) {
          finalVoiceTranscriptRef.current = normalizeVoiceText(`${finalVoiceTranscriptRef.current} ${cleanedFragment}`);
        } else {
          interim += ` ${cleanedFragment}`;
        }
      }
      const composed = normalizeVoiceText(`${finalVoiceTranscriptRef.current} ${interim}`);
      setVoiceLiveText(composed);
      setInput(composed);
      armVoiceSilenceTimer();
    };
    recognition.onerror = (event) => {
      const reason = event?.error ? `Microphone issue: ${event.error}` : 'Microphone issue detected.';
      setVoiceHint(reason);
      setListening(false);
      voiceSessionActiveRef.current = false;
      speechRecognitionRef.current = null;
      if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
    };
    recognition.onend = () => {
      if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
      const finalTranscript = normalizeVoiceText(finalVoiceTranscriptRef.current);
      if (voiceSessionActiveRef.current && !voiceManualStopRef.current) {
        try {
          recognition.start();
          setVoiceHint('Listening…');
          return;
        } catch {
          // fall through to finalize
        }
      }
      setListening(false);
      voiceSessionActiveRef.current = false;
      speechRecognitionRef.current = null;
      setVoiceLiveText('');
      setVoiceHint('');
      if (finalTranscript && !loading) {
        sendMessage(finalTranscript);
      }
    };
    speechRecognitionRef.current = recognition;
    setListening(true);
    armVoiceSilenceTimer();
    recognition.start();
  };

  const stopVoiceCapture = () => {
    voiceManualStopRef.current = true;
    voiceSessionActiveRef.current = false;
    if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
    setVoiceHint('Finalizing transcript…');
    speechRecognitionRef.current?.stop();
  };

  const buildContextPreamble = (ctx: DetailContext) => {
    const parts: string[] = [];
    if (ctx.memberName) parts.push(`Member: ${ctx.memberName}`);
    if (ctx.intakeRoute) parts.push(`Intake route: ${ctx.intakeRoute}`);
    if (ctx.requestType) parts.push(`Specific ticket type: ${ctx.requestType}`);
    if (ctx.clientsAffected) parts.push(`Client impact check: ${ctx.clientsAffected}`);
    if (ctx.memberId) parts.push(`Momence member ID: ${ctx.memberId}`);
    if (ctx.memberContact) parts.push(`Member contact: ${ctx.memberContact}`);
    if (ctx.sessionId) parts.push(`Momence session ID: ${ctx.sessionId}`);
    if (ctx.studio) parts.push(`Studio: ${ctx.studio}`);
    if (ctx.trainer) parts.push(`Trainer: ${ctx.trainer}`);
    if (ctx.classType) parts.push(`Class: ${ctx.classType}`);
    if (ctx.classDateTime) parts.push(`Class date/time: ${ctx.classDateTime}`);
    if (ctx.membership) parts.push(`Membership: ${ctx.membership}`);
    if (ctx.category) parts.push(`Category: ${ctx.category}`);
    if (ctx.subCategory) parts.push(`Sub-category: ${ctx.subCategory}`);
    if (ctx.reportedBy) parts.push(`Reported by: ${ctx.reportedBy}`);
    if (ctx.priority) parts.push(`Priority: ${ctx.priority}`);
    if (ctx.description) parts.push(`Issue summary: ${ctx.description}`);
    if (ctx.incidentDateTime) parts.push(`Incident date/time: ${ctx.incidentDateTime}`);
    if (ctx.desiredResolution) parts.push(`Requested resolution: ${ctx.desiredResolution}`);
    Object.entries(ctx).forEach(([key, value]) => {
      if (
        value &&
        !['memberName', 'intakeRoute', 'requestType', 'clientsAffected', 'memberId', 'memberContact', 'sessionId', 'studio', 'trainer', 'classType', 'classDateTime', 'membership', 'category', 'subCategory', 'reportedBy', 'priority', 'description', 'incidentDateTime', 'desiredResolution'].includes(key)
      ) {
        parts.push(`${getDetailField(key)?.label || key}: ${value}`);
      }
    });
    return parts.length ? `[Context — ${parts.join(' | ')}]\n` : '';
  };

  const sendMessage = async (text: string, contextOverride?: DetailContext) => {
    if (!text.trim() || loading) return;
    if (!contextOverride && !pendingSingleField && isCasualGreeting(text)) {
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
      };
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          aiGenerated: true,
          content: "Hi, I'm Athena. What are we logging?",
          suggestedChips: getGreetingQuickActions(),
        },
      ]);
      setInput('');
      return;
    }
    let activeContext: DetailContext = { ...(contextOverride || context), reportedBy: reporterName };
    if (!contextOverride && pendingSingleField && pendingSingleField.type !== 'select') {
      activeContext = applyDetailValue(context, pendingSingleField.id, text.trim());
      activeContext.reportedBy = reporterName;
      setContext(activeContext);
      setPendingSingleField(null);
    }
    const capturedVoice = !contextOverride && !pendingSingleField
      ? captureMemberVoiceFromText(text, activeContext)
      : null;

    if (capturedVoice) {
      activeContext = applyDetailValue(activeContext, 'description', capturedVoice);
      activeContext.reportedBy = reporterName;
      setContext(activeContext);
    }
    const issueText = capturedVoice || text;
    if (!activeContext.initialReport && !/^here are the missing details:/i.test(text.trim())) {
      activeContext = { ...activeContext, initialReport: issueText };
    }
    const localInference = inferIntakeContextFromText(issueText, activeContext);
    if (Object.keys(localInference).length > 0) {
      activeContext = { ...activeContext, ...localInference, reportedBy: reporterName };
      setContext(activeContext);
    }
    activeContext.reportedBy = reporterName;
    activeContext = pruneEntityContextForIssue(activeContext, issueText);
    activeContext.reportedBy = reporterName;
    setContext(activeContext);
    const preamble = buildContextPreamble(activeContext);
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    const requestNonce = ++requestNonceRef.current;
    const requestEpoch = activeChatEpochRef.current;
    try {
      setLoading(true);
      const existingTicket = findExistingSubmittedTicket(capturedVoice || text, activeContext, tickets.filter((ticket) => !isTrainerEvaluationProfileOnly(ticket)));
      if (existingTicket) {
        setSelectedTicket(existingTicket);
        onOpenExistingTicket?.(existingTicket);
        setMessages((prev) => [
          ...prev,
          {
            id: `duplicate-${Date.now()}`,
            role: 'assistant',
            content: `Possible existing ticket: **${existingTicket.id}** — ${existingTicket.title}. I opened it for reference, but I will still draft a new ticket below so you can proceed if this is a separate issue.`,
          },
        ]);
      }

      const missingFields = requiredFieldsForIssue(activeContext);

      const { data, error } = await invokeTicketingFunction<AiIntakeResponse>('ticket-ai-chat', {
        body: buildAthenaDraftRequestBody({
          aiProvider: import.meta.env.VITE_AI_PROVIDER || 'deepseek',
          messages: newMessages,
          preamble,
          conversationId,
          context: activeContext,
          intakeContract: {
            missingFields,
            fields: missingFields
              .map((id) => getDetailField(id))
              .filter(Boolean),
          },
        }),
      });

      if (error) throw error;
      if (requestEpoch !== activeChatEpochRef.current || requestNonce !== requestNonceRef.current) return;

      if (data?.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      const inferredContext = normalizeInferredContext(data?.inferredContext);
      let responseContext = mergeInferredContext(activeContext, inferredContext, data?.urgencyReason);
      if (Object.keys(inferredContext).length > 0 || data?.urgencyReason) {
        responseContext = { ...responseContext, reportedBy: reporterName };
        activeContext = responseContext;
        setContext(responseContext);
      }

      const remainingMissingFields = requiredFieldsForIssue(responseContext, data?.ticket || undefined);
      const requiredFieldSet = new Set(remainingMissingFields);
      const incompleteDraftForm = pruneDetailForm(detailFormForIncompleteDraft(data?.ticket, responseContext), responseContext);
      const localMissingForm = pruneDetailForm(detailFormForContext(responseContext), responseContext);
      const deterministicForm = incompleteDraftForm || localMissingForm;
      const acceptsAiDetailForm = shouldAcceptAiDetailForm({
        remainingMissingFieldCount: remainingMissingFields.length,
      });
      const normalizedForm = acceptsAiDetailForm
        ? pruneDetailForm(
            filterAiDetailForm(normalizeDetailForm(data?.detailForm), responseContext, requiredFieldSet),
            responseContext
          )
        : null;
      const detailForm = mergeDetailForms(deterministicForm, normalizedForm);
      const parsedQuestionForm = acceptsAiDetailForm && !detailForm && !data?.ticket
        ? pruneDetailForm(
            filterAiDetailForm(detailFormFromQuestionText(data?.reply || '', responseContext), responseContext, requiredFieldSet),
            responseContext
          )
        : null;
      const finalDetailForm = detailForm || parsedQuestionForm;
      const holdDraftForMoreInfo = shouldHoldDraftForMoreInfo({
        hasDetailForm: Boolean(finalDetailForm),
        remainingMissingFieldCount: remainingMissingFields.length,
        aiNeedsMoreInfo: data?.needsMoreInfo,
      });
      let ticket = holdDraftForMoreInfo
        ? null
        : data?.ticket || buildClientDraft(responseContext, text);
      if (
        ticket &&
        responseContext.category === 'Hosted Class & Partnerships' &&
        (ticket.category === 'General Feedback' || ticket.subCategory === 'Other')
      ) {
        ticket = {
          ...ticket,
          category: 'Hosted Class & Partnerships',
          subCategory: responseContext.subCategory || 'Hosted Class Feedback',
          tags: Array.from(new Set([...(ticket.tags || []), 'hosted-class', 'partnership-feedback'])),
        };
      }
      if (ticket) {
        const syncedContext = contextFromDraft(ticket, responseContext);
        activeContext = { ...syncedContext, reportedBy: reporterName };
        setContext(activeContext);
      }
      const singleField = finalDetailForm?.fields.length === 1 ? finalDetailForm.fields[0] : null;
      const singleFieldNeedsPicker = singleField
        ? ['memberName', 'memberContact', 'classType', 'sessionId', 'membership'].includes(singleField.id)
        : false;
      setPendingSingleField(singleField && !singleFieldNeedsPicker && singleField.type !== 'select' ? singleField : null);
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        aiGenerated: true,
        content: singleField
          ? singleFieldNeedsPicker
            ? `Select ${singleField.label.toLowerCase()}:`
            : `Please submit ${singleField.label.toLowerCase()} below.`
          : finalDetailForm
            ? 'Please complete the required intake fields below.'
            : ticket
              ? 'I drafted the ticket below. Please review it before publishing.'
              : data?.reply || "Hmm, I didn't catch that. Could you rephrase?",
        ticket,
        suggestedChips: [],
        detailForm: finalDetailForm,
        published: false,
        ticketId: undefined,
      };
      setMessages((prev) => [
        ...prev,
        assistantMsg,
      ]);
      if (ticket) {
        setActiveDraftReviewMessageId(assistantMsg.id);
      }

    } catch (e: unknown) {
      if (requestEpoch !== activeChatEpochRef.current || requestNonce !== requestNonceRef.current) return;
      const message = getDisplayError(e, 'Ticket AI chat failed');
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I hit an error: ${message}. Please try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (chip: SuggestedChip) => {
    if (context[chip.field]) return;
    const next = applyDetailValue(context, chip.field, chip.value);
    setPendingSingleField(null);
    setContext(next);
    sendMessage(`${getDetailField(chip.field)?.label || chip.field}: ${chip.value}`, next);
  };

  const resetChat = useCallback(() => {
    activeChatEpochRef.current += 1;
    requestNonceRef.current += 1;
    voiceSessionActiveRef.current = false;
    voiceManualStopRef.current = true;
    speechRecognitionRef.current?.stop();
    if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
    setListening(false);
    setVoiceLiveText('');
    setVoiceHint('');
    setMessages([GREETING]);
    setContext({ reportedBy: reporterName });
    setPendingSingleField(null);
    setPendingAttachments([]);
    setConversationId(null);
    setActiveDraftReviewMessageId(null);
    setInstructorEvaluationMode(false);
    setLoading(false);
  }, [reporterName]);

  useEffect(() => {
    if (resetVersion === lastResetVersionRef.current) return;
    lastResetVersionRef.current = resetVersion;
    resetChat();
  }, [resetVersion, resetChat]);

  const submitDetailForm = (values: Record<string, string>, form?: DetailForm) => {
    const formFieldIds = new Set((form?.fields || []).map((field) => String(field.id)));
    const formIncludesMember = ['memberId', 'memberName', 'memberContact', 'membership']
      .some((field) => formFieldIds.has(field));
    const formIncludesSession = ['sessionId', 'classType', 'classDateTime', 'trainer']
      .some((field) => formFieldIds.has(field));
    const allowedValueKeys = new Set(formFieldIds);
    if (formIncludesMember) MEMBER_ENTITY_KEYS.forEach((field) => allowedValueKeys.add(field));
    if (formIncludesSession) {
      SESSION_ENTITY_KEYS.forEach((field) => allowedValueKeys.add(field));
      allowedValueKeys.add('studio');
    }

    let nextContext: DetailContext = { ...context, reportedBy: reporterName };
    for (const [key, value] of Object.entries(values)) {
      if (form && !allowedValueKeys.has(key)) continue;
      if (!value) continue;
      nextContext = applyDetailValue(nextContext, key, value);
    }

    const fieldLabels = new Map((form?.fields || []).map((field) => [field.id, field.label]));
    const detailLines = Object.entries(values)
      .filter(([key, value]) => (!form || allowedValueKeys.has(key)) && value.trim())
      .map(([key, value]) => `${getDetailField(key)?.label || fieldLabels.get(key) || key}: ${value}`);
    nextContext = pruneEntityContextForIssue(nextContext, detailLines.join('\n'), allowedValueKeys);
    nextContext.reportedBy = reporterName;
    setContext(nextContext);
    setPendingSingleField(null);
    sendMessage(`Here are the missing details:\n${detailLines.join('\n')}`, nextContext);
  };

  const publishDraft = async (messageId: string, draft: DraftTicket, trainerEvaluation?: TrainerEvaluationInput) => {
    if (loading || publishingRef.current.has(messageId)) return;
    const publishableDraft = mergeDraftWithContext(draft, context);
    const explicitlyUsedFields = new Set<string>();
    if (publishableDraft.memberName || publishableDraft.memberContact) MEMBER_ENTITY_KEYS.forEach((field) => explicitlyUsedFields.add(field));
    if (publishableDraft.classType || publishableDraft.classDateTime || publishableDraft.trainer) SESSION_ENTITY_KEYS.forEach((field) => explicitlyUsedFields.add(field));
    const publishContext = pruneEntityContextForIssue(
      contextFromDraft(publishableDraft, context),
      `${publishableDraft.title}\n${publishableDraft.description}`,
      explicitlyUsedFields
    );
    const missingDetailsForm = detailFormForIncompleteDraft(publishableDraft, publishContext);
    if (missingDetailsForm) {
      setPendingSingleField(null);
      setActiveDraftReviewMessageId(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `publish-required-${Date.now()}`,
          role: 'assistant',
          content: 'This ticket is not ready to publish. Submit the required details below first.',
          detailForm: missingDetailsForm,
          published: false,
        },
      ]);
      return;
    }
    publishingRef.current.add(messageId);
    setLoading(true);
    try {
      const created = await createApprovedTicket(
        publishableDraft,
        conversationId,
        publishContext as Record<string, unknown>,
        pendingAttachments.map((entry) => entry.file)
      );
      if (trainerEvaluation && !publishableDraft.metadata?.trainerReview) {
        saveTrainerReview(trainerEvaluation);
      }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? { ...message, published: true, ticketId: created.id, publishedTicket: created }
            : message
        )
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `published-${Date.now()}`,
          role: 'assistant',
          content: `Approved. Ticket **${created.id}** has been published to Submitted Tickets.`,
          published: true,
          ticketId: created.id,
          publishedTicket: created,
        },
      ]);
      setPendingAttachments([]);
      setActiveDraftReviewMessageId(null);
    } catch (e: unknown) {
      const message = getDisplayError(e, 'Ticket creation failed');
      setMessages((prev) => [
        ...prev,
        {
          id: `publish-error-${Date.now()}`,
          role: 'assistant',
          content: `I could not publish that ticket yet: ${message}. The draft is still available for approval.`,
        },
      ]);
    } finally {
      publishingRef.current.delete(messageId);
      setLoading(false);
    }
  };

  const refineDraft = () => {
    // TicketPreviewCard owns the edit UI; this callback keeps the existing prop contract.
  };

  const saveEditedDraft = (messageId: string, draft: DraftTicket) => {
    const syncedContext = { ...contextFromDraft(draft, context), reportedBy: reporterName };
    setContext(syncedContext);
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              ticket: {
                ...draft,
                conversationSummary: draft.conversationSummary || draft.description,
              },
              published: false,
              ticketId: undefined,
            }
          : message
      )
    );
  };

  const discardDraft = (messageId: string) => {
    setActiveDraftReviewMessageId((current) => current === messageId ? null : current);
    setMessages((prev) =>
      prev.map((message) => (
        message.id === messageId
          ? { ...message, ticket: null, detailForm: null, published: false, ticketId: undefined, content: 'Draft discarded.' }
          : message
      ))
    );
  };

  const onConfirmDraftFromMessage = (message: Message) => {
    if (!message.ticket) return;
    publishDraft(message.id, mergeDraftWithContext(message.ticket, context), message.trainerEvaluation);
  };

  const createTrainerEvaluationDraft = (evaluation: TrainerEvaluationInput, source: 'form' | 'text' = 'form') => {
    const draft = buildTrainerEvaluationDraft(evaluation);
    const messageId = `trainer-eval-draft-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        role: 'assistant',
        aiGenerated: true,
        content: source === 'text'
          ? `I extracted the pasted review into a structured instructor evaluation draft for **${evaluation.trainer}**. Please review before publishing.`
          : `Instructor evaluation draft prepared for **${evaluation.trainer}**. Please review before publishing.`,
        ticket: draft,
        trainerEvaluation: evaluation,
        published: false,
      },
    ]);
    setContext((current) => ({
      ...current,
      studio: evaluation.studio || current.studio,
      trainer: evaluation.trainer || current.trainer,
      classType: evaluation.classType || current.classType,
      category: 'Trainer Feedback',
      subCategory: 'Knowledge and Competence',
      reportedBy: reporterName,
    }));
    setActiveDraftReviewMessageId(messageId);
  };

  const submitInstructorEvaluation = async (evaluation: TrainerEvaluationInput) => {
    createTrainerEvaluationDraft(evaluation, 'form');
    setInstructorEvaluationMode(false);
  };

  const submitTextToTicket = async () => {
    const sourceText = textToTicketText.trim();
    if (!sourceText) return;
    setLoading(true);
    try {
      const aiInstruction = [
        'TEXT_TO_TICKET_CLASSIFICATION_TASK',
        'Classify the pasted text as either trainer_evaluation or ticket_submission.',
        'If it is trainer_evaluation, return a Trainer Feedback draft only; do not treat it as a member complaint.',
        'If it is ticket_submission, return the normal support ticket draft.',
        'Use structured fields instead of placing all pasted text into description.',
        '',
        sourceText,
      ].join('\n');
      const { data } = await invokeTicketingFunction<AiIntakeResponse>('ticket-ai-chat', {
        body: buildAthenaDraftRequestBody({
          aiProvider: import.meta.env.VITE_AI_PROVIDER || 'deepseek',
          messages: [{ id: `text-to-ticket-${Date.now()}`, role: 'user', content: aiInstruction }],
          preamble: buildContextPreamble({ ...context, reportedBy: reporterName }),
          conversationId,
          context: {
            ...context,
            reportedBy: reporterName,
            textToTicketMode: true,
            classificationOptions: ['trainer_evaluation', 'ticket_submission'],
          },
        }),
      });

      const aiTicket = data?.ticket || null;
      const aiSaysTrainer = aiTicket?.category === 'Trainer Feedback' ||
        /trainer[_\s-]?evaluation|instructor evaluation|performance review|weighted scoring|focus points/i.test(`${data?.reply || ''}\n${aiTicket?.title || ''}\n${aiTicket?.description || ''}`);
      const localTrainerSignal = /client feedback|internal feedback|focus points|avg attendance|conversion rate|certification|trainer|instructor|barre classes|power\s?cycle/i.test(sourceText);

      if (aiSaysTrainer || (!aiTicket && localTrainerSignal)) {
        const evaluation = parseTrainerEvaluationText(sourceText, context.trainer || 'Unspecified Instructor');
        createTrainerEvaluationDraft({
          ...evaluation,
          studio: context.studio || evaluation.studio,
          classType: context.classType || evaluation.classType,
          reviewPeriod: context.classDateTime || evaluation.reviewPeriod,
        }, 'text');
      } else {
        const inferredContext = normalizeInferredContext(data?.inferredContext);
        const draft = aiTicket || buildClientDraft(mergeInferredContext({ ...context, reportedBy: reporterName }, inferredContext), sourceText);
        const messageId = `text-ticket-draft-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: messageId,
            role: 'assistant',
            aiGenerated: true,
            content: 'I classified the pasted text as a support ticket and prepared a draft for review.',
            ticket: draft,
            published: false,
          },
        ]);
        setActiveDraftReviewMessageId(messageId);
      }
      setTextToTicketText('');
      setTextToTicketOpen(false);
    } catch (error) {
      const localTrainerSignal = /client feedback|internal feedback|focus points|avg attendance|conversion rate|certification|trainer|instructor|barre classes|power\s?cycle/i.test(sourceText);
      if (localTrainerSignal) {
        const evaluation = parseTrainerEvaluationText(sourceText, context.trainer || 'Unspecified Instructor');
        createTrainerEvaluationDraft({
          ...evaluation,
          studio: context.studio || evaluation.studio,
          classType: context.classType || evaluation.classType,
          reviewPeriod: context.classDateTime || evaluation.reviewPeriod,
        }, 'text');
      } else {
        const messageId = `text-ticket-draft-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: messageId,
            role: 'assistant',
            aiGenerated: true,
            content: 'AI classification was unavailable, so I prepared a support-ticket draft using the pasted text.',
            ticket: buildClientDraft({ ...context, reportedBy: reporterName }, sourceText),
            published: false,
          },
        ]);
        setActiveDraftReviewMessageId(messageId);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-200/60 font-['Plus_Jakarta_Sans',Inter,sans-serif]">
      <div className="relative hidden h-full w-[32%] overflow-hidden border-r border-slate-200 bg-gradient-to-br from-slate-100 via-white to-blue-50 lg:block">
        <div className="absolute -left-12 top-16 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute -right-12 bottom-10 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(100,116,139,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(100,116,139,0.08)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_78%_56%_at_50%_50%,#000_68%,transparent_110%)]" />
        <InteractiveRobotSpline
          key={instructorEvaluationMode ? 'athena-trainer-blue' : 'athena-ticket-blue'}
          scene={ROBOT_SPLINE_URL}
          className="athena-bot-tint-blue absolute inset-0 h-full w-full transition duration-500"
          smile
        />
        <div className="absolute left-3 right-3 top-3 z-10">
          <div className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/40 px-3 py-2 shadow-[0_18px_54px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Athena mode</div>
              <div className="truncate text-xs font-semibold text-blue-950">
                {instructorEvaluationMode ? 'Instructor evaluation' : 'Ticket intake'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={instructorEvaluationMode}
              onClick={() => setInstructorEvaluationMode((current) => !current)}
              className={`relative h-7 w-12 rounded-full border transition ${
                instructorEvaluationMode
                  ? 'border-blue-500 bg-blue-600'
                  : 'border-blue-200 bg-blue-100'
              }`}
              title="Toggle instructor evaluation mode"
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition ${
                  instructorEvaluationMode ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
        <div className="absolute bottom-2 left-2 right-2">
          <div className="rounded-2xl border border-white/50 bg-white/30 p-2 shadow-[0_24px_80px_-30px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black">
              Recent tickets
            </div>
            <div className="flex flex-wrap gap-2">
              {recentTickets.length > 0 ? recentTickets.map((ticket, index) => {
                const compactLabel = ticket.title.length > 36
                  ? `${ticket.title.slice(0, 33).replace(/\s+\S*$/, '').trimEnd()}...`
                  : ticket.title;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      setSelectedTicket(ticket);
                      onOpenExistingTicket?.(ticket);
                    }}
                    className="animate-ticket-chip-in max-w-[220px] rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-slate-900"
                    style={{ animationDelay: `${index * 90}ms` }}
                    title={`${ticket.id} - ${ticket.title}`}
                  >
                    <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{compactLabel}</span>
                  </button>
                );
              }) : (
                <span className="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">
                  No recent tickets
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex h-full w-full flex-col bg-background lg:w-[68%]">
        <div className={`animate-chat-header-in flex items-center justify-between border-b px-4 py-2.5 shadow-sm ${
          instructorEvaluationMode
            ? 'border-blue-100 bg-blue-50/70'
            : 'border-blue-100 bg-blue-50/70'
        }`}>
          <div className="flex min-w-0 items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 shadow-sm ${
              instructorEvaluationMode
                ? 'border-blue-300/80 bg-gradient-to-br from-blue-100 to-cyan-100'
                : 'border-blue-300/80 bg-gradient-to-br from-blue-100 to-cyan-100'
            }`}>
              <img
                src="/download-1.png"
                alt="Athena"
                className="-scale-x-100 h-10 w-10 rounded-full object-cover transition duration-500"
                style={{ filter: 'hue-rotate(225deg) saturate(1.45) contrast(1.08)' }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-slate-950">Athena</h1>
                <span className={`inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold shadow-sm ${
                  instructorEvaluationMode ? 'text-blue-700' : 'text-blue-700'
                }`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Online
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">Support, Smarter.</p>
            </div>
          </div>
          <div />
        </div>

        {instructorEvaluationMode ? (
          <div className="chat-scrollbar flex-1 overflow-y-auto bg-blue-50/60 px-4 py-4 shadow-inner sm:px-6">
            <div className="mx-auto flex min-h-full max-w-7xl items-stretch">
              <InstructorEvaluationChatbox
                onSubmit={submitInstructorEvaluation}
                disabled={loading}
              />
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="chat-scrollbar mx-auto w-full max-w-7xl flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 lg:py-5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='180' height='180' viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Ctext x='24' y='42' font-size='11' font-family='Inter,Arial,sans-serif' fill='%231e293b' fill-opacity='0.05'%3EP57%3C/text%3E%3Ccircle cx='124' cy='54' r='9' stroke='%231e293b' stroke-opacity='0.045' stroke-width='1.2'/%3E%3Cpath d='M35 122h22M46 111v22' stroke='%231e293b' stroke-opacity='0.045' stroke-width='1.8' stroke-linecap='round'/%3E%3C/g%3E%3C/svg%3E")`,
              backgroundColor: '#f3f4f6',
            }}
          >
            {messages.map((m, index) => (
              <MessageBubble
                key={m.id}
                message={m}
                index={index}
                onChipClick={handleChipClick}
                onDetailFormSubmit={submitDetailForm}
                onOpenDraftReview={(messageId) => setActiveDraftReviewMessageId(messageId)}
                context={context}
              />
            ))}
            {loading && <TypingIndicator />}
          </div>
        )}

        <Dialog
          open={Boolean(activeDraftReviewMessage)}
          onOpenChange={(open) => {
            if (!open) setActiveDraftReviewMessageId(null);
          }}
        >
          <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-slate-200 bg-slate-50/95 p-4 shadow-[0_30px_100px_rgba(15,23,42,0.28)] data-[state=open]:zoom-in-90 sm:rounded-3xl sm:p-5">
            <DialogHeader className="pr-8">
              <DialogTitle className="text-base text-slate-950">Review Athena ticket draft</DialogTitle>
              <DialogDescription>
                Check the context, routing, and Momence signals before publishing.
              </DialogDescription>
            </DialogHeader>
            {activeDraftReviewMessage?.ticket && (
              <DraftTicketReviewPreview
                draft={mergeDraftWithContext(activeDraftReviewMessage.ticket, context)}
                context={context}
                tickets={tickets}
                onConfirm={() => onConfirmDraftFromMessage(activeDraftReviewMessage)}
                onEdit={() => refineDraft()}
                onDiscard={() => discardDraft(activeDraftReviewMessage.id)}
                onSaveEdit={(draft) => saveEditedDraft(activeDraftReviewMessage.id, draft)}
                confirmed={activeDraftReviewMessage.published}
                ticketId={activeDraftReviewMessage.ticketId}
                confirmedTicket={activeDraftReviewMessage.publishedTicket}
                publishing={publishingRef.current.has(activeDraftReviewMessage.id)}
              />
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={textToTicketOpen} onOpenChange={setTextToTicketOpen}>
          <DialogContent className="max-w-2xl border-slate-200 bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.25)] sm:rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base text-slate-950">Text to ticket</DialogTitle>
              <DialogDescription>
                Paste review notes or performance text. Athena will extract a structured ticket draft for review.
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={textToTicketText}
              onChange={(event) => setTextToTicketText(event.target.value)}
              rows={9}
              placeholder="Paste the source text here..."
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTextToTicketOpen(false)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTextToTicket}
                disabled={!textToTicketText.trim()}
                className="h-9 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white shadow-[0_12px_26px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Generate draft
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {!instructorEvaluationMode && (
        <>
        <div className="z-10 flex-shrink-0 border-t border-border/50 bg-[#f0f2f5] px-4 py-2 shadow-[0_-12px_30px_rgba(15,23,42,0.04)] sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-700">
                Context
              </span>
              <div className="hidden h-5 w-px bg-slate-200 sm:block" />
            </div>
            <button
              type="button"
              onClick={() => setTextToTicketOpen(true)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-sm transition ${
                instructorEvaluationMode
                  ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Text to ticket
            </button>
            <div className="min-w-0 flex-1 overflow-x-auto pb-0.5">
              <ContextPicker
                context={context}
                attachmentCount={pendingAttachments.length}
                accent="blue"
                onChange={(next) => setContext((current) => ({ ...current, ...next }))}
              />
            </div>
          </div>
        </div>

        <div className="z-10 flex-shrink-0 border-t border-border/50 bg-[#f0f2f5] px-4 py-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-7xl items-end gap-3">
            <div className="flex-1 relative">
              {pendingAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pendingAttachments.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-700"
                      title={`${entry.file.name} (${Math.max(1, Math.round(entry.file.size / 1024))} KB)`}
                    >
                      <Paperclip className="h-3 w-3 shrink-0 text-blue-600" />
                      <span className="truncate">{entry.file.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((current) => current.filter((item) => item.id !== entry.id))}
                        className="rounded-full p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={`Remove ${entry.file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="Describe the incident, feedback or complaint…"
              className={`max-h-28 w-full resize-none rounded-full border border-slate-200 bg-white px-4 py-3 pr-4 text-sm text-slate-950 shadow-[0_12px_34px_rgba(15,23,42,0.07)] outline-none transition duration-200 placeholder:text-slate-400 focus:ring-4 ${
                instructorEvaluationMode ? 'focus:border-blue-400 focus:ring-blue-500/15' : 'focus:border-blue-400 focus:ring-blue-500/15'
              }`}
                style={{ minHeight: '48px' }}
              />
              {listening && (
                <div className="mt-1 text-[10px] font-medium text-blue-700">
                  {voiceHint || (voiceLiveText ? 'Listening… capturing your description' : 'Listening… start speaking')}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx"
              onChange={(event) => {
                addAttachments(event.target.files);
                event.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
                className={`flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 ${
                  instructorEvaluationMode ? 'hover:border-blue-200 hover:text-blue-700' : 'hover:border-blue-200 hover:text-blue-700'
                }`}
              title="Attach files"
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {voiceSupported && (
              <button
                type="button"
                onClick={listening ? stopVoiceCapture : startVoiceCapture}
                disabled={loading}
                className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition ${
                  listening
                    ? instructorEvaluationMode
                      ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                      : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    : `border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 ${instructorEvaluationMode ? 'hover:border-blue-200 hover:text-blue-700' : 'hover:border-blue-200 hover:text-blue-700'}`
                } disabled:cursor-not-allowed disabled:opacity-45`}
                title={listening ? 'Stop voice input' : 'Start voice input'}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
              >
                {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35 ${
                instructorEvaluationMode
                  ? 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'
                  : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="mx-auto mt-1 w-full max-w-7xl px-1 text-[10px] font-medium text-stone-400">
            Enter to send · Shift+Enter for new line · Attachments are optional and can help with faster resolution
          </p>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{
  message: Message;
  index: number;
  onChipClick: (chip: SuggestedChip) => void;
  onDetailFormSubmit: (values: Record<string, string>, form?: DetailForm) => void;
  onOpenDraftReview: (messageId: string) => void;
  context: DetailContext;
}> = ({ message, index, onChipClick, onDetailFormSubmit, onOpenDraftReview, context }) => {
  const isUser = message.role === 'user';
  const userTone = USER_TONES[index % USER_TONES.length];
  const visibleChips = (message.suggestedChips || []).filter((chip) => !context[chip.field]);
  const [expanded, setExpanded] = useState(false);

  const renderContent = (text: string) => {
    const renderInline = (value: string) =>
      value.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={j}>{part.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={j}>{part}</React.Fragment>
        )
      );

    const blocks = text.split('\n\n').map((block) => block.trim()).filter(Boolean);
    return blocks.map((block, index) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const isList = lines.every((line) => /^-\s+/.test(line));
      if (isList) {
        return (
          <ul key={`b-${index}`} className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
            {lines.map((line, itemIndex) => (
              <li key={`li-${itemIndex}`}>{renderInline(line.replace(/^-\s+/, ''))}</li>
            ))}
          </ul>
        );
      }
      return (
        <p key={`b-${index}`} className={index === 0 ? '' : 'mt-2'}>
          {lines.map((line, lineIndex) => (
            <React.Fragment key={`l-${lineIndex}`}>
              {renderInline(line)}
              {lineIndex < lines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      );
    });
  };
  const contentLines = message.content.split('\n');
  const shouldCollapse =
    isUser &&
    !message.ticket &&
    !message.detailForm &&
    (contentLines.length > 3 || message.content.length > 260);
  const previewContent = (() => {
    if (!shouldCollapse || expanded) return message.content;
    const firstLines = contentLines.slice(0, 3).join('\n');
    return firstLines.length > 260 ? `${firstLines.slice(0, 260).trimEnd()}...` : `${firstLines.trimEnd()}...`;
  })();

  return (
    <div
      className={`animate-chat-message-in flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
      style={{ animationDelay: `${Math.min(index * 28, 240)}ms` }}
    >
      {!isUser && message.aiGenerated && (
        <div
          className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700"
          title="AI generated"
          aria-label="AI generated"
        >
          <Sparkles className="h-2.5 w-2.5" />
        </div>
      )}
      <div className={`flex w-full items-end gap-2 ${isUser ? 'flex-row-reverse justify-end' : ''}`}>
        {!isUser && (
          <div className="h-6 w-6 rounded-full overflow-hidden bg-card border border-border/30 flex-shrink-0 p-0.5 mb-0.5">
            <img src="/download-1.png" alt="Athena" className="-scale-x-100 w-full h-full rounded-full object-cover" />
          </div>
        )}
        <div className={`${isUser ? 'ml-auto w-[52%] pl-12' : 'w-full pr-6'}`}>
          <div
            className={`relative inline-block w-full rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
              isUser
                ? 'rounded-br-sm border border-gray-200 bg-gray-100 text-slate-900'
                : 'rounded-bl-sm border border-[#e6e6e6] bg-white text-slate-900'
            }`}
          >
            {renderContent(previewContent)}
            <span
              className={`absolute bottom-0 h-3 w-3 rotate-45 ${
                isUser
                  ? '-right-1.5 bg-gray-100 border-r border-b border-gray-200'
                  : '-left-1.5 bg-white border-l border-b border-[#e6e6e6]'
              }`}
            />
            {shouldCollapse && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className={`mt-2 block text-xs font-semibold underline-offset-4 hover:underline ${
                  isUser ? userTone.more : 'text-blue-700 hover:text-blue-900'
                }`}
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      </div>

      {visibleChips.length > 0 && !message.ticket && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleChips.map((c, i) => (
            <button
              key={i}
              onClick={() => onChipClick(c)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-slate-950"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {message.detailForm && !message.ticket && (
        <DetailCaptureForm form={message.detailForm} initialContext={context} onSubmit={onDetailFormSubmit} />
      )}

      {message.ticket && (
        <div className="mt-2 w-full">
          {message.published && message.ticketId ? (
            <PublishedTicketSummary ticketId={message.ticketId} ticket={message.publishedTicket} />
          ) : (
            <button
              type="button"
              onClick={() => onOpenDraftReview(message.id)}
              className="animate-draft-popout-cue flex w-full max-w-md items-center gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-left shadow-[0_18px_48px_rgba(37,99,235,0.12)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-950">Ticket draft ready for review</span>
                <span className="block truncate text-xs text-slate-500">{message.ticket.title}</span>
              </span>
              <span className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white">
                Open
              </span>
            </button>
          )}
        </div>
      )}
      {message.published && !message.ticket && message.ticketId && (
        <PublishedTicketSummary ticketId={message.ticketId} ticket={message.publishedTicket} />
      )}
    </div>
  );
};

function firstContextValue(value?: string | null): string | undefined {
  return value
    ?.split('|')
    .map((item) => item.trim())
    .find(Boolean);
}

const DraftTicketReviewPreview: React.FC<{
  draft: DraftTicket;
  context: DetailContext;
  tickets: Ticket[];
  onConfirm: () => void;
  onEdit: () => void;
  onDiscard: () => void;
  onSaveEdit: (draft: DraftTicket) => void;
  confirmed?: boolean;
  ticketId?: string;
  confirmedTicket?: Ticket;
  publishing?: boolean;
}> = ({ draft, context, tickets, onConfirm, onEdit, onDiscard, onSaveEdit, confirmed, ticketId, confirmedTicket, publishing }) => {
  const [momenceSummary, setMomenceSummary] = useState<MomenceInsightSummary | undefined>();
  const [momenceLoading, setMomenceLoading] = useState(false);
  const [momenceError, setMomenceError] = useState<string | null>(null);
  const memberId = firstContextValue(context.memberId);
  const sessionId = firstContextValue(context.sessionId);

  useEffect(() => {
    if (!memberId && !sessionId) {
      setMomenceSummary(undefined);
      setMomenceError(null);
      setMomenceLoading(false);
      return;
    }

    let cancelled = false;
    setMomenceLoading(true);
    setMomenceError(null);
    loadMomenceTicketContext({ memberId, sessionId })
      .then((momenceContext) => {
        if (!cancelled) setMomenceSummary(momenceContext.summary);
      })
      .catch((error) => {
        if (!cancelled) {
          setMomenceSummary(undefined);
          setMomenceError(error instanceof Error ? error.message : 'Momence context unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setMomenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [memberId, sessionId]);

  const reviewContext = useMemo(() => contextFromDraft(draft, context), [context, draft]);
  const duplicateTicket = useMemo(
    () => findExistingSubmittedTicket(`${draft.title}\n${draft.description}`, reviewContext, tickets.filter((ticket) => !isTrainerEvaluationProfileOnly(ticket))),
    [draft.description, draft.title, reviewContext, tickets]
  );
  const reviewInsights = useMemo(
    () => buildTicketReviewInsights({ draft, context: reviewContext, momenceSummary, duplicateTicket }),
    [draft, duplicateTicket, momenceSummary, reviewContext]
  );

  return (
    <TicketPreviewCard
      draft={draft}
      onConfirm={onConfirm}
      onEdit={onEdit}
      onDiscard={onDiscard}
      onSaveEdit={onSaveEdit}
      confirmed={confirmed}
      ticketId={ticketId}
      confirmedTicket={confirmedTicket}
      publishing={publishing}
      reviewInsights={reviewInsights}
      momenceLoading={momenceLoading}
      momenceError={momenceError}
    />
  );
};

const TypingIndicator: React.FC = () => (
  <div className="animate-p57-fade-up flex items-end gap-2">
    <div className="h-7 w-7 rounded-full overflow-hidden bg-card border border-border/30 flex-shrink-0 p-0.5">
      <img src="/download-1.png" alt="Athena" className="-scale-x-100 w-full h-full rounded-full object-cover" />
    </div>
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-[#e6e6e6] bg-white px-3.5 py-2.5 shadow-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/30 animate-typing" style={{ animationDelay: '0s' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/30 animate-typing" style={{ animationDelay: '0.2s' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/30 animate-typing" style={{ animationDelay: '0.4s' }} />
    </div>
  </div>
);

const TrainerAvatar: React.FC<{ name: string; src?: string; size?: 'sm' | 'lg' }> = ({ name, src, size = 'sm' }) => {
  const dimension = size === 'lg' ? 'h-16 w-16 text-sm' : 'h-6 w-6 text-[9px]';
  return (
    <span className={`${dimension} flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-100 bg-blue-50 font-bold text-blue-700`}>
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        trainerInitials(name)
      )}
    </span>
  );
};

const InstructorEvaluationChatbox: React.FC<{
  onSubmit: (evaluation: TrainerEvaluationInput) => void | Promise<void>;
  disabled?: boolean;
}> = ({ onSubmit, disabled }) => {
  const [template, setTemplate] = useState<TrainerReviewTemplate>('Barre');
  const [instructor, setInstructor] = useState('');
  const [studio, setStudio] = useState('');
  const [classType, setClassType] = useState('');
  const [reviewPeriod, setReviewPeriod] = useState('');
  const [scores, setScores] = useState<TrainerEvaluationScore[]>(
    TRAINER_REVIEW_TEMPLATES.Barre.map((item) => ({ ...item, score: 0 }))
  );
  const [feedback, setFeedback] = useState('');
  const [focusPoints, setFocusPoints] = useState('');
  const [goals, setGoals] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [trainerMenuOpen, setTrainerMenuOpen] = useState(false);
  const selectedTrainerImage = trainerImageUrl(instructor);

  const classOptions = useMemo(() => {
    const matcher = template === 'PowerCycle'
      ? /cycle|power/i
      : /barre|mat|amped|signature|foundations|sculpt|stretch|recovery/i;
    const filtered = CLASS_TYPES.filter((item) => matcher.test(item));
    return filtered.length ? filtered : CLASS_TYPES;
  }, [template]);

  const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
  const totalWeightage = scores.reduce((sum, item) => sum + item.weightage, 0);
  const scorePercent = totalWeightage ? Math.round((totalScore / totalWeightage) * 100) : 0;

  const athenaPrompts = [
    !instructor ? 'Instructor name helps Athena update the right profile.' : '',
    !studio ? 'Studio context improves trend reporting.' : '',
    !scores.some((item) => item.score > 0) ? 'Use sliders when score weightage is available.' : '',
    !feedback.trim() ? 'Evaluator comments will make the ticket richer.' : '',
  ].filter(Boolean);

  const applyTemplate = (nextTemplate: TrainerReviewTemplate) => {
    setTemplate(nextTemplate);
    setScores(TRAINER_REVIEW_TEMPLATES[nextTemplate].map((item) => ({ ...item, score: 0 })));
    setClassType('');
  };

  const setScore = (category: string, score: number) => {
    setScores((current) => current.map((item) => (
      item.category === category
        ? { ...item, score: Math.max(0, Math.min(item.weightage, score)) }
        : item
    )));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({
        trainer: instructor.trim() || 'Unspecified Instructor',
        template,
        studio,
        classType,
        reviewPeriod,
        scores,
        feedback: feedback.trim() || 'Instructor evaluation submitted without evaluator notes.',
        focusPoints,
        goals,
      });
      setFeedback('');
      setFocusPoints('');
      setGoals('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-blue-100 bg-white/95 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
          <GraduationCap className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950">Instructor evaluation</div>
          <div className="truncate text-[11px] text-slate-500">Optional fields · preview draft before publishing.</div>
        </div>
        </div>
        <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">
          {scorePercent}% · {totalScore.toFixed(1)}/{totalWeightage}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {(['Barre', 'PowerCycle'] as TrainerReviewTemplate[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => applyTemplate(item)}
            className={`h-9 rounded-lg text-[11px] font-semibold transition ${
              template === item
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setTrainerMenuOpen((current) => !current)}
            className="flex h-9 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-left text-[11px] font-semibold text-slate-900 outline-none transition hover:border-blue-200 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          >
            <TrainerAvatar name={instructor || 'Instructor'} src={selectedTrainerImage} size="sm" />
            <span className="min-w-0 flex-1 truncate">{instructor || 'Instructor'}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition ${trainerMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {trainerMenuOpen && (
            <div className="absolute left-0 right-0 top-10 z-30 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
              <button
                type="button"
                onClick={() => {
                  setInstructor('');
                  setTrainerMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
              >
                <TrainerAvatar name="Instructor" size="sm" />
                <span>Instructor</span>
              </button>
              {TRAINERS.map((trainer) => (
                <button
                  key={trainer}
                  type="button"
                  onClick={() => {
                    setInstructor(trainer);
                    setTrainerMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold transition ${
                    instructor === trainer ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <TrainerAvatar name={trainer} src={trainerImageUrl(trainer)} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{trainer}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          value={studio}
          onChange={(event) => setStudio(event.target.value)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
        >
          <option value="">Studio</option>
          {STUDIOS.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select
          value={classType}
          onChange={(event) => setClassType(event.target.value)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 md:col-span-1"
        >
          <option value="">Class / format</option>
          {classOptions.map((item) => <option key={item}>{item}</option>)}
        </select>
        <input
          value={reviewPeriod}
          onChange={(event) => setReviewPeriod(event.target.value)}
          placeholder="Review period or class date"
          className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
        />
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <button
          type="button"
          onClick={() => setShowScoring((current) => !current)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Weighted scoring</span>
            <span className="mt-0.5 block text-[10px] text-slate-500">{showScoring ? 'Hide scales' : 'Show scales and weightage'}</span>
          </span>
          <span className="rounded-full border border-blue-100 bg-white px-2 py-1 text-[10px] font-semibold text-blue-700">
            {scorePercent}% · {totalScore.toFixed(1)}/{totalWeightage}
          </span>
        </button>
        {showScoring && (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {scores.map((item) => (
              <label key={item.category} className="block rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold leading-snug text-slate-700">{item.category}</span>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{item.score.toFixed(1)} / {item.weightage}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={item.weightage}
                  step={0.5}
                  value={item.score}
                  onChange={(event) => setScore(item.category, Number(event.target.value))}
                  className="h-2 w-full accent-blue-600"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="Evaluator comments: client connection, cues, musicality, energy, choreography, hands-on corrections..."
          rows={4}
          className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
        />
        <div className="grid gap-2">
          <textarea
            value={focusPoints}
            onChange={(event) => setFocusPoints(event.target.value)}
            placeholder="Focus points"
            rows={2}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
          <textarea
            value={goals}
            onChange={(event) => setGoals(event.target.value)}
            placeholder="Goals or next commitments"
            rows={2}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      </div>

      {athenaPrompts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {athenaPrompts.slice(0, 3).map((question) => (
            <span key={question} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500">
              {question}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={disabled || submitting}
        className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-xs font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)] transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
      >
        <Send className="h-3.5 w-3.5" />
        {submitting ? 'Preparing draft...' : 'Preview evaluation draft'}
      </button>
    </div>
  );
};

const PublishedTicketSummary: React.FC<{ ticketId: string; ticket?: Ticket }> = ({ ticketId, ticket }) => (
  <div className="mt-2 w-full max-w-xl overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.1)]">
    <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
      <CheckCircle2 className="h-4 w-4" />
      Ticket {ticketId} published
    </div>
    <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Live SLA clock</div>
        <p className="mt-1 text-xs text-slate-500">
          The countdown is now active in Submitted Tickets and every dashboard queue view.
        </p>
      </div>
      {ticket ? (
        <SlaCountdown slaDueAt={ticket.slaDueAt} status={ticket.status} className="justify-start" />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
          Syncing SLA target
        </div>
      )}
    </div>
  </div>
);

const fieldHelpText = (field: DetailFormField): string => {
  const id = String(field.id);
  if (id === 'clientsAffected') return 'Confirm whether clients were impacted before publishing the ticket.';
  if (id === 'memberName' || id === 'memberContact') return 'Use Momence search where possible so the member record and contact stay consistent.';
  if (id === 'membership') return 'Choose the active package from Momence results when available, or from the standard membership list.';
  if (id === 'classType' || id === 'sessionId' || id === 'classDateTime' || id === 'trainer') return 'Choose the relevant class/session context for the member issue.';
  if (id === 'priority') return 'Choose the operational urgency. Safety, access and retention-risk issues should be High or Critical.';
  if (id === 'description') return 'Capture the concrete facts and what happened without adding subjective interpretation.';
  if (id === 'desiredResolution') return 'Document what the member asked Physique 57 to do next, including their preferred follow-up channel.';
  if (id === 'incidentDateTime') return 'Use the earliest known time the issue was noticed, reported, or experienced.';
  if (id === 'category' || id === 'subCategory') return 'Pick the closest routing category so ownership, analytics and SLA handling stay accurate.';
  if (id === 'intakeRoute') return 'Select the workflow this feedback belongs to; Athena uses this to shape the next ticket draft.';
  return field.required
    ? 'Required for clean routing and resolution without extra follow-up.'
    : 'Optional context that can help the owner resolve the ticket faster.';
};

const DetailCaptureForm: React.FC<{
  form: DetailForm;
  initialContext: DetailContext;
  onSubmit: (values: Record<string, string>, form?: DetailForm) => void;
}> = ({ form, initialContext, onSubmit }) => {
  const toCsvList = (value?: string) =>
    (value || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
  const appendCsvUnique = (current: string | undefined, next: string) => {
    const existing = toCsvList(current);
    if (existing.some((item) => item.toLowerCase() === next.trim().toLowerCase())) return current || '';
    return [...existing, next.trim()].join(' | ');
  };
  const removeCsvItem = (current: string | undefined, target: string) =>
    toCsvList(current)
      .filter((item) => item.toLowerCase() !== target.toLowerCase())
      .join(' | ');
  const removeSelectedMember = (current: Record<string, string>, memberName: string) => {
    const names = toCsvList(current.memberName);
    const index = names.findIndex((item) => item.toLowerCase() === memberName.toLowerCase());
    if (index < 0) {
      return {
        ...current,
        memberName: removeCsvItem(current.memberName, memberName),
      };
    }
    const removeAtIndex = (value?: string) =>
      toCsvList(value)
        .filter((_, itemIndex) => itemIndex !== index)
        .join(' | ');
    return {
      ...current,
      memberId: removeAtIndex(current.memberId),
      memberName: removeAtIndex(current.memberName),
      memberContact: removeAtIndex(current.memberContact),
      membership: '',
    };
  };

  const initialValues = form.fields.reduce<Record<string, string>>((acc, field) => {
    const id = String(field.id);
    acc[id] = initialContext[id] || '';
    return acc;
  }, {});
  const fieldIds = new Set(form.fields.map((field) => String(field.id)));
  const shouldSeedMemberValues = MEMBER_ENTITY_KEYS.some((field) => fieldIds.has(field));
  const shouldSeedSessionValues = SESSION_ENTITY_KEYS.some((field) => fieldIds.has(field));
  const hiddenSeedKeys = [
    ...(shouldSeedMemberValues ? MEMBER_ENTITY_KEYS : []),
    ...(shouldSeedSessionValues ? [...SESSION_ENTITY_KEYS, 'studio'] : []),
  ];
  for (const key of hiddenSeedKeys) {
    if (initialContext[key]) initialValues[key] = initialContext[key] || '';
  }
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [membershipOptions, setMembershipOptions] = useState<string[]>(MEMBERSHIPS);
  const hasMemberFields = form.fields.some((field) => field.id === 'memberName' || field.id === 'memberContact');
  const hasSessionFields = form.fields.some((field) => field.id === 'classType' || field.id === 'classDateTime' || field.id === 'sessionId');

  useEffect(() => {
    if (!values.memberId) {
      setMembershipOptions(MEMBERSHIPS);
      return;
    }
    let cancelled = false;
    loadActiveMembershipOptions(values.memberId)
      .then((options) => {
        if (!cancelled) setMembershipOptions(options);
      })
      .catch(() => {
        if (!cancelled) setMembershipOptions(MEMBERSHIPS);
      });
    return () => {
      cancelled = true;
    };
  }, [values.memberId]);

  const setValue = (id: string, value: string) => {
    setValues((current) => {
      const next = { ...current, [id]: value };
      if (id === 'category' && current.category !== value) next.subCategory = '';
      return next;
    });
  };

  const canSubmit = form.fields.every((field) => !field.required || values[String(field.id)]?.trim());
  const requiredFields = form.fields.filter((field) => field.required);
  const completedRequired = requiredFields.filter((field) => values[String(field.id)]?.trim()).length;
  const completionPercent = requiredFields.length ? Math.round((completedRequired / requiredFields.length) * 100) : 100;

  return (
    <form
      className="mt-3 w-full overflow-visible rounded-3xl border border-slate-200 bg-white/95 shadow-[0_26px_80px_rgba(15,23,42,0.12)] backdrop-blur"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit(values, form);
      }}
    >
      <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/45 px-5 py-4">
        <div className="grid gap-4 md:grid-cols-[1fr_220px] md:items-center">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-stone-950">{form.title}</h3>
              {form.description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-stone-500">{form.description}</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-blue-700" />
                Required complete
              </span>
              <span className="font-mono tabular-nums text-slate-900">{completedRequired}/{requiredFields.length || 0}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-700 transition-all duration-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2">
        {hasMemberFields && (
          <MomenceMemberFormField
            values={values}
            onSelect={async (member) => {
              setValues((current) => ({
                ...current,
                memberId: appendCsvUnique(current.memberId, member.id),
                memberName: appendCsvUnique(current.memberName, member.name),
                memberContact: appendCsvUnique(current.memberContact, member.email || member.phoneNumber || member.description || ''),
                membership: current.membership || '',
              }));
            }}
            onRemove={(memberName) => {
              setValues((current) => removeSelectedMember(current, memberName));
            }}
          />
        )}
        {hasSessionFields && (
          <MomenceSessionFormField
            values={values}
            onSelect={(session) => {
              setValues((current) => ({
                ...current,
                sessionId: appendCsvUnique(current.sessionId, session.id),
                classType: appendCsvUnique(current.classType, session.classType),
                classDateTime: appendCsvUnique(current.classDateTime, session.startsAt || ''),
                trainer: appendCsvUnique(current.trainer, session.trainer || current.trainer || ''),
                studio: appendCsvUnique(current.studio, session.studio || current.studio || ''),
              }));
            }}
            onRemove={(sessionName) => {
              setValues((current) => ({
                ...current,
                sessionId: '',
                classType: removeCsvItem(current.classType, sessionName),
                classDateTime: '',
              }));
            }}
          />
        )}
        {form.fields.map((field, fieldIndex) => {
          const id = String(field.id);
          if (hasMemberFields && (id === 'memberName' || id === 'memberContact')) return null;
          if (hasSessionFields && (id === 'classType' || id === 'classDateTime' || id === 'sessionId')) return null;
          const helpText = fieldHelpText(field);
          const complete = !field.required || Boolean(values[id]?.trim());
          const category = values.category;
          const options =
            field.id === 'subCategory' && category
              ? CATEGORIES[category] || []
              : field.id === 'subCategory'
                ? []
              : field.id === 'membership' && values.memberId
                ? membershipOptions
                : field.id === 'membership'
                  ? MEMBERSHIPS
                  : field.options || [];

          return (
            <div
              key={id}
              className={`group relative rounded-2xl border bg-white p-3 shadow-sm transition duration-200 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 ${
                complete ? 'border-slate-200' : 'border-blue-200'
              } ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <label htmlFor={`detail-${id}`} className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] ${
                    complete ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  }`}>
                    {fieldIndex + 1}
                  </span>
                  <span className="min-w-0 truncate">
                    {field.label}
                    {field.required ? <span className="text-blue-600"> *</span> : ''}
                  </span>
                </label>
                <span className="group/help relative inline-flex shrink-0">
                  <HelpCircle className="h-4 w-4 text-slate-400 transition group-hover/help:text-blue-700" />
                  <span className="pointer-events-none absolute right-0 top-6 z-20 w-64 rounded-2xl border border-slate-200 bg-stone-950 px-3 py-2 text-[11px] font-medium leading-relaxed text-white opacity-0 shadow-2xl transition group-hover/help:opacity-100">
                    {helpText}
                  </span>
                </span>
              </div>
              {field.type === 'select' ? (
                (() => {
                  const forceSingle = new Set(['intakeRoute', 'category', 'subCategory', 'priority', 'studio', 'memberSentiment', 'clientsAffected', 'membership']);
                  const isMulti = !forceSingle.has(field.id);
                  const disabledSelect = field.id === 'subCategory' && !values.category;
                  const useButtons = !isMulti && !disabledSelect && shouldUseOptionButtons({ id, optionCount: options.length });
                  return isMulti ? (
                    <MultiSelectDropdown
                      value={values[id] || ''}
                      options={options}
                      placeholder={
                        `Select ${field.label.toLowerCase()}`
                      }
                      disabled={disabledSelect}
                      onChange={(nextValue) => setValue(id, nextValue)}
                    />
                  ) : useButtons ? (
                    <OptionButtonGroup
                      id={`detail-${id}`}
                      label={field.label}
                      value={values[id] || ''}
                      options={options}
                      onChange={(nextValue) => setValue(id, nextValue)}
                    />
                  ) : (
                <select
                  id={`detail-${id}`}
                  value={values[id] || ''}
                  onChange={(event) => setValue(id, event.target.value)}
                  disabled={disabledSelect}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-stone-900 outline-none transition hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                >
                  <option value="">
                    {field.id === 'subCategory' && !values.category
                        ? 'Select category first'
                      : `Select ${field.label.toLowerCase()}`}
                  </option>
                  {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                  );
                })()
              ) : field.type === 'textarea' ? (
                <textarea
                  id={`detail-${id}`}
                  value={values[id] || ''}
                  onChange={(event) => setValue(id, event.target.value)}
                  rows={4}
                  className="min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-stone-900 outline-none transition hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Describe the issue and relevant details..."
                />
              ) : (
                <input
                  id={`detail-${id}`}
                  type={field.type === 'date' || field.type === 'datetime-local' || field.type === 'number' ? field.type : 'text'}
                  value={values[id] || ''}
                  onChange={(event) => setValue(id, event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-stone-900 outline-none transition hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  placeholder={field.label}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/90 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] text-stone-500">
          {completedRequired} of {requiredFields.length} required fields complete
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {form.submitLabel || 'Continue'}
        </button>
      </div>
    </form>
  );
};

const OptionButtonGroup: React.FC<{
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}> = ({ id, label, value, options, onChange }) => (
  <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((option) => {
      const selected = value === option;
      return (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`min-h-10 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition focus:outline-none focus:ring-4 focus:ring-blue-500/15 ${
            selected
              ? 'border-blue-700 bg-blue-700 text-white shadow-sm'
              : 'border-slate-200 bg-slate-50 text-stone-700 hover:border-blue-200 hover:bg-white'
          }`}
          aria-pressed={selected}
        >
          {option}
        </button>
      );
    })}
  </div>
);

const MultiSelectDropdown: React.FC<{
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ value, options, placeholder, disabled = false, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedValues = useMemo(
    () => value.split('|').map((item) => item.trim()).filter(Boolean),
    [value]
  );
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const updateValues = (nextValues: string[]) => {
    onChange(nextValues.join(' | '));
  };

  const toggleOption = (option: string) => {
    if (selectedSet.has(option)) {
      updateValues(selectedValues.filter((item) => item !== option));
      return;
    }
    updateValues([...selectedValues, option]);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-stone-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedValues.length ? selectedValues.slice(0, 3).map((item) => (
            <span
              key={item}
              className="max-w-[180px] truncate rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800"
            >
              {item}
            </span>
          )) : (
            <span className="truncate text-slate-400">{placeholder}</span>
          )}
          {selectedValues.length > 3 && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              +{selectedValues.length - 3}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
          {options.length ? options.map((option) => {
            const selected = selectedSet.has(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleOption(option)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                  selected ? 'bg-blue-50 text-blue-900' : 'text-stone-700 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1 break-words">{option}</span>
              </button>
            );
          }) : (
            <div className="px-2.5 py-2 text-xs text-slate-400">No options available</div>
          )}
        </div>
      )}
    </div>
  );
};

function formatMembershipOption(membership: MomenceMembership): string {
  const name = membership.membership?.name || membership.type || `Membership #${membership.id}`;
  const credits =
    membership.eventCreditsLeft != null
      ? `${membership.eventCreditsLeft} credits left`
      : membership.usedSessions != null && membership.usageLimitForSessions != null
        ? `${Math.max(membership.usageLimitForSessions - membership.usedSessions, 0)} sessions left`
        : '';
  const endDate = membership.endDate
    ? `ends ${new Date(membership.endDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`
    : '';
  return [name, credits, endDate].filter(Boolean).join(' · ');
}

async function loadActiveMembershipOptions(memberId: string): Promise<string[]> {
  const memberships = await getMomenceMemberMemberships(memberId);
  const activeMembershipOptions = memberships
    .filter((membership) => !membership.isFrozen)
    .map(formatMembershipOption);
  return Array.from(new Set([...activeMembershipOptions, ...MEMBERSHIPS]));
}

const MomenceMemberFormField: React.FC<{
  values: Record<string, string>;
  onSelect: (member: MomenceMemberOption) => void | Promise<void>;
  onRemove: (memberName: string) => void;
}> = ({ values, onSelect, onRemove }) => {
  const [query, setQuery] = useState(values.memberName || values.memberContact || '');
  const [options, setOptions] = useState<MomenceMemberOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState(values.memberId || '');
  const isAffectedClientSelection = hasConfirmedAffectedClients(values.clientsAffected);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (selectedMemberId && query === values.memberName) {
        setOptions([]);
        return;
      }
      if (query.trim().length < 2) {
        setOptions([]);
        return;
      }
      try {
        setError(null);
        setOptions(await searchMomenceMembers(query));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Member search failed');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, selectedMemberId, values.memberName]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 md:col-span-2">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        {isAffectedClientSelection ? 'Affected Momence Clients' : 'Momence Member'} *
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        placeholder="Search Momence by client name, email, or phone"
      />
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      {values.memberName && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.memberName.split('|').map((member) => member.trim()).filter(Boolean).map((member) => (
            <button
              key={member}
              type="button"
              onClick={() => onRemove(member)}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800"
              title="Remove member"
            >
              {member}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.1)]">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={async () => {
                setSelectedMemberId(option.id);
                setOptions([]);
                setQuery(option.label);
                await onSelect(option);
                setOptions([]);
              }}
              className="block w-full border-b border-stone-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-50"
            >
              <div className="font-semibold text-stone-900">{option.label}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">{option.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const MomenceSessionFormField: React.FC<{
  values: Record<string, string>;
  onSelect: (session: MomenceSessionOption) => void;
  onRemove: (sessionName: string) => void;
}> = ({ values, onSelect, onRemove }) => {
  const [query, setQuery] = useState(values.classType || '');
  const [options, setOptions] = useState<MomenceSessionOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const selectedSessions = (values.classType || '')
        .split('|')
        .map((sessionName) => sessionName.trim().toLowerCase())
        .filter(Boolean);
      if (selectedSessions.includes(query.trim().toLowerCase()) || query.trim().length < 2) {
        setOptions([]);
        return;
      }
      try {
        setError(null);
        setOptions(await searchMomenceSessions(query));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Session search failed');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, values.classType]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 md:col-span-2">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Momence Class / Session *
      </span>
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (values.classType && event.target.value !== values.classType) setOptions([]);
        }}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        placeholder="Search Momence sessions by class, instructor, studio, or date"
      />
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      {values.classType && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.classType.split('|').map((sessionName) => sessionName.trim()).filter(Boolean).map((sessionName) => (
            <button
              key={sessionName}
              type="button"
              onClick={() => {
                setQuery('');
                setOptions([]);
                onRemove(sessionName);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800"
              title="Remove session"
            >
              {sessionName}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.1)]">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onSelect(option);
                setQuery(option.classType);
                setOptions([]);
              }}
              className="block w-full border-b border-stone-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-50"
            >
              <div className="font-semibold text-stone-900">{option.label}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">{option.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
