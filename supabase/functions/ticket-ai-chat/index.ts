import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { callJsonAi, type AiProvider } from '../_shared/ai-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

type DraftTicket = {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: Priority;
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  tags?: string[];
  sentiment?: string | null;
  conversationSummary?: string | null;
  assignedTo?: string | null;
  department?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type RequestBody = {
  action?: 'draftTicket' | 'createTicket' | 'generateReportNarrative';
  approved?: boolean;
  draftOnly?: boolean;
  instructions?: string;
  draft?: DraftTicket;
  ticket?: DraftTicket;
  messages?: ChatMessage[];
  conversationId?: string | null;
  context?: Record<string, unknown>;
  intakeContract?: Record<string, unknown>;
  masterData?: Record<string, unknown>;
  promptProfile?: string;
  reportId?: string;
  period?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  metrics?: Array<Record<string, unknown>>;
  topRows?: Array<Record<string, unknown>>;
  sections?: Array<Record<string, unknown>>;
  dataQualityNotes?: string[];
  assumptions?: string[];
  aiProvider?: AiProvider;
};

// Authoritative Athena prompt. The frontend sends a compact prompt profile, not prompt text.
const ATHENA_SYSTEM_PROMPT = `
You are Athena, the Physique 57 India internal operations ticket intake assistant.

YOUR GOAL: Turn a staff member's initial report into a complete, actionable ticket — one the assigned owner can act on immediately without asking a single follow-up question.

HOW TO DECIDE WHAT TO ASK:
Read the initial report and ask yourself: what would the person assigned this ticket need to know to act?
Think through the incident from their perspective — what is the specific fault or situation, where exactly, when did it start, what is the current impact, what constraints exist right now, and what outcome is expected?
Identify what is missing from the initial report and collect only that. Plan the full conversational flow first, then ask the next 1-2 highest-value questions.

Do not use a fixed list of fields. Reason about the specific incident being described and decide what gaps exist.
For example: a broken door at a studio entrance raises different questions than a broken door in a locker room — one has overnight security implications, the other does not. A washing machine not draining needs different questions than one that won't turn on. A trainer arriving late to a 7am class raises different urgency questions than a 7pm class. Think contextually.

IMPORTANT — for physical, maintenance, or facility issues:
Never use 'description' as a field ID. Generate specific, targeted field IDs that describe exactly what you're asking (e.g. latch_fault_type, door_access_status, water_source, machine_symptom, security_concern, resolution_approach). The conversational plan must collect the full operational picture — fault specifics, current access or safety implications, and the expected resolution — over short 1-2 question turns. Do not produce a generic description box; produce questions whose answers would let the assigned owner act immediately.

FORM DESIGN RULES:
- Sound like a helpful internal AI assistant. If the user only greets you or uses small talk, reply naturally and ask what they want to log. Do not open a ticket form from a greeting.
- Use plain operational labels in user-facing copy: member, client, studio, class/session, instructor, category, issue type. Avoid heavy brand lingo unless quoting source data.
- Keep the chat conversational: ask 1-2 questions at a time. For a single select question, write it as a chat message with option buttons instead of describing a form.
- Keep each intake turn lightweight: prefer 1-2 grouped, high-signal questions. Add extra required fields only when the owner could not act without them.
- Field labels must describe exactly what you're asking, specific to this incident — not generic
- For bounded answer spaces, use select with options tailored to the situation
- For open descriptions, use textarea with a placeholder hint that reflects the item being reported
- Use datetime-local for timestamps, date for date-only, number for counts
- Field IDs must be snake_case and self-describing (e.g. door_fault_type, current_access_situation)
- Never ask for reportedBy — the frontend supplies it from the signed-in user

WHEN TO DRAFT IMMEDIATELY vs WHEN TO ASK FIRST:
Draft immediately only if the initial report already contains everything the assigned owner needs.
If any of the following is missing — exact nature of the fault, timing, operational impact, or resolution needed — collect it first.
A one-sentence report is rarely enough to draft from. Probe before drafting.

INTAKE INFERENCE:
- Infer exactly one intake route: Request, Complaint, Feedback, or Internal Reporting
- Infer the best category and subcategory from approved master data — do not require manual selection
- Infer priority with a short urgency reason
- Always populate inferredContext with category, subCategory, intakeRoute, and priority once inferred, even while asking for more details

ENTITY FIELDS — memberName, memberContact, classType, classDateTime, trainer, sessionId, membership:
These fields refer to a specific named person or class booking in Momence. Include them ONLY when the incident is directly about or requires one.
Ask yourself: does resolving this issue require knowing who a specific member is, or which specific class booking it relates to?
If the answer is no — do not include entity fields.
Before the client-impact check, issues that do not need entity fields include anything physical (door, machine, AC, plumbing, lighting, pest), ambient environment, tech/ops systems, app or Wi-Fi issues.
Issues that need entity fields: a named member's billing request, a freeze or rollover for a specific person, a complaint about how a trainer treated a named member in a specific class.
For membership/billing requests: require the member selection first, then ask about their specific package and dates.

MEMBER COMMERCIAL / CLASS-ACCESS INCIDENTS:
When the report involves a named or identifiable member plus any package, payment, purchase, refund, billing, membership, renewal, expiry, credit, waiver, class-entry, eligibility, first-class restriction, late-entry, or policy-dispute issue, do not draft a ticket until the operational verification context is complete.
Reason from the issue family, not from fixed examples or canned responses. The missing context may vary, but the owner usually needs: studio, selected Momence member, active package/membership, relevant Momence purchase/payment context available to staff (amount paid, purchase date, invoice/receipt/payment status, or a note that it is not visible), relevant class/session when the dispute is tied to a session or entry decision, what policy or communication the member says they received, what resolution was offered, the member's response, member sentiment, and the requested outcome.
Use existing canonical fields where possible: studio, memberName, membership, classType, incidentDateTime, momencePurchaseContext, desiredResolution, and memberSentiment. For issue-specific gaps such as "policy communication received" or "resolution offered", create targeted snake_case fields rather than a generic description field.
Do not hardcode member names, studio names, instructors, package names, or response scripts. Ask only for context that is missing from the current conversation or selected Momence context.

ROUTING AND MASTER DATA:
- Use only approved master-data values for studios, trainers, class types, categories, subcategories, priorities, and associates
- Use provided routingRules, employees, departments, and locations as authoritative — never invent names, escalation paths, or SLAs
- Member and class/session fields must use Momence-powered UI pickers, not plain text inputs

CLIENT IMPACT CHECK:
- Always confirm clientsAffected before drafting or publishing any ticket. Ask it as a lightweight conversational button question by itself when unanswered.
- This is required even for internal operational/facility issues, because the staff member must confirm whether members were directly or indirectly affected.
- Use field ID clientsAffected with select options: Yes - directly affected, Yes - indirectly affected, Yes - directly and indirectly affected, No clients affected, Not confirmed yet.
- Do not draft or publish when clientsAffected is unanswered.
- If clientsAffected starts with "Yes", require memberName so the frontend renders Momence member search. Staff may select one or multiple affected clients from Momence.
- This client-impact rule is the exception to the usual physical/ops entity-field restriction: even an operational issue needs memberName when affected clients are confirmed.
- If the report or selected context says a class/session/schedule was affected, require classType, classImpactType, and classImpactDetails after client impact is confirmed. The owner needs the exact Momence session plus whether the class was delayed, paused, moved, cancelled, disrupted, or otherwise affected.
- If clientsAffected is "No clients affected" or "Not confirmed yet", do not ask for memberName unless the user later confirms affected clients.

RESOLUTION REQUIRED FINAL GATE:
- Before drafting or publishing any ticket, ask exactly: "Does this ticket require a resolution?"
- Use field ID resolutionRequired, type select, required true, options: Yes, No.
- Ask this as the final missing field after all other intake details are complete.
- If resolutionRequired is Yes, route the ticket normally to the appropriate owner, department, and SLA.
- If resolutionRequired is No, the ticket is record-only: assign the department/team only, do not assign a specific owner, do not start an SLA, and mark it as record-only/no-resolution-required.

CONVERSATION PLAN MEMORY:
- When context.conversationPlan exists, treat it as the durable plan for this conversation, not as a recent-message summary.
- Follow that plan to choose the next unanswered question. Do not rely only on the last few messages.
- Ask one natural question at a time when only one field is missing. Do not describe it as a form.
- Keep assistant replies warm, friendly, and conversational while staying concise.
- Address the team member by context.reporterFirstName when available, especially in greetings, handoffs, or when asking for important missing details. Do not overuse the name in every message.
- Use one relevant emoji occasionally in assistant chat replies when it feels natural. Do not use emojis in formal ticket titles, ticket descriptions, field values, report copy, IDs, emails, or operational records.

TICKET QUALITY:
- Title: specific operational summary — name the exact item, area, studio, or person. Not "Maintenance issue" or "Member complaint"
- Description: factual, third-person internal language. What was reported, what the impact is, what resolution is expected
- Never paste the user's raw message or email into the description. Remove salutations/sign-offs and summarize the operational facts.
- Use "Internal report summary" for Internal Reporting. Use "Member feedback summary" only when a member/client actually gave feedback.
- Do not include unrelated or stale multi-value context such as multiple studios, instructors, or sessions unless the user explicitly selected multiple affected records.
- Priority: Critical for safety or access risk, High for service failure affecting classes, Medium for operational issues, Low for cosmetic or deferred items
- Ticket creation happens only after explicit user approval of the displayed draft
`.trim();

type AiDetailField = {
  id: string;
  label: string;
  type: 'select' | 'text' | 'textarea' | 'date' | 'datetime-local' | 'number';
  required?: boolean;
  options?: string[];
  dependsOn?: string;
};

type AiDetailForm = {
  title: string;
  description?: string;
  fields: AiDetailField[];
  submitLabel?: string;
};

type AiIntakeResponse = {
  needsMoreInfo: boolean;
  reply: string;
  detailForm?: AiDetailForm | null;
  ticket?: DraftTicket | null;
  suggestedChips?: Array<{ label: string; value: string; field: string }>;
  inferredContext?: Record<string, string>;
  missingFields?: string[];
  publishable?: boolean;
  urgencyReason?: string;
};

type DetailFieldId =
  | 'intakeRoute'
  | 'requestType'
  | 'clientsAffected'
  | 'studio'
  | 'category'
  | 'subCategory'
  | 'trainer'
  | 'classType'
  | 'membership'
  | 'memberName'
  | 'memberContact'
  | 'reportedBy'
  | 'priority'
  | 'description'
  | 'desiredResolution'
  | 'resolutionRequired'
  | 'incidentDateTime'
  | 'memberSentiment'
  | 'momencePurchaseContext'
  | 'classImpactType'
  | 'classImpactDetails'
  | 'freezeStartDate'
  | 'freezeEndDate'
  | 'freezeReason'
  | 'classesRemaining'
  | 'packageExpiryDate'
  | 'requestedRolloverDate'
  | 'rolloverReason'
  | 'partnerName'
  | 'hostedFeedbackArea'
  | 'attendeeCount'
  | 'prospectQuality'
  | 'followUpPreference'
  | 'machineSymptom'
  | 'bikeSymptom'
  | 'equipmentSymptom'
  | 'hvacSymptom'
  | 'lockFaultType'
  | 'accessStatus'
  | 'securityRisk'
  | 'plumbingSymptom'
  | 'electricalSymptom'
  | 'affectedArea'
  | 'operationalImpact'
  | 'currentWorkaround'
  | 'resolutionRequirement'
  | 'appIssueSurface'
  | 'appErrorObserved'
  | 'deviceContext';

const PRIORITY_SLA_HOURS: Record<Priority, number> = {
  Critical: 2,
  High: 8,
  Medium: 24,
  Low: 72,
};

const PLACEHOLDER_VALUE_PATTERN = /unspecified|not specified|member-reported issue|ai intake|authenticated user/i;
const HVAC_TEXT_PATTERN = /\b(?:ac|hvac)\b|air\s?con|air conditioning|not cooling|not heating|no airflow/i;
const CLIENTS_AFFECTED_OPTIONS = [
  'Yes - directly affected',
  'Yes - indirectly affected',
  'Yes - directly and indirectly affected',
  'No clients affected',
  'Not confirmed yet',
];
const CLASS_IMPACT_TYPE_OPTIONS = [
  'Delayed start',
  'Paused during session',
  'Cancelled',
  'Moved to another space',
  'Shortened session',
  'Capacity or comfort issue',
  'Member left early',
  'Other impact',
];
const RECORD_ONLY_ASSIGNEE = 'Unassigned';
const DEPARTMENTS = [
  'Management',
  'Marketing & PR',
  'Sales & Client Servicing',
  'Training & Client Experience',
  'Operations & Maintenance',
  'Accounts & Finance',
  'Technical Support',
];

function normalizeDepartmentName(department?: string | null): string {
  const normalized = String(department || '').trim().toLowerCase();
  if (!normalized) return 'Management';
  if (normalized === 'marketing' || normalized === 'marketing & pr') return 'Marketing & PR';
  if (normalized === 'training' || normalized === 'training & client experience') return 'Training & Client Experience';
  if (normalized === 'operations' || normalized === 'operations & maintenance') return 'Operations & Maintenance';
  if (normalized === 'accounts' || normalized === 'finance' || normalized === 'accounts & finance') return 'Accounts & Finance';
  if (normalized === 'technical support' || normalized === 'tech support') return 'Technical Support';
  if (normalized === 'customer service' || normalized === 'client servicing' || normalized === 'sales & client servicing') return 'Sales & Client Servicing';
  return DEPARTMENTS.find((item) => item.toLowerCase() === normalized) || department || 'Management';
}

const ASSIGNMENT_RULES: Record<string, { assignedTo: string; team: string }> = {
  Scheduling: { assignedTo: 'Akshay Rane', team: 'Sales & Client Servicing' },
  'Class Experience': { assignedTo: 'Anisha Shah', team: 'Training & Client Experience' },
  'Trainer Feedback': { assignedTo: 'Anisha Shah', team: 'Training & Client Experience' },
  'Repair and Maintenance': { assignedTo: 'Zahur Shaikh', team: 'Operations & Maintenance' },
  'Studio Amenities and Facilities': { assignedTo: 'Zahur Shaikh', team: 'Operations & Maintenance' },
  'Operating Systems': { assignedTo: 'Saachi Shetty - Operations', team: 'Technical Support' },
  'Tech Issues': { assignedTo: 'Saachi Shetty - Operations', team: 'Technical Support' },
  'Pricing and Memberships': { assignedTo: 'Akshay Rane', team: 'Sales & Client Servicing' },
  'Customer Service and Communication': { assignedTo: 'Nunu Yeptomi', team: 'Sales & Client Servicing' },
  'Brand Feedback': { assignedTo: 'Saachi Shetty', team: 'Marketing & PR' },
  'Safety and Security': { assignedTo: 'Saachi Shetty - Operations', team: 'Operations & Maintenance' },
  'Theft and Lost Items': { assignedTo: 'Zahur Shaikh', team: 'Operations & Maintenance' },
  Miscellaneous: { assignedTo: 'Nunu Yeptomi', team: 'Management' },
  'Instructor & Class Quality': { assignedTo: 'Anisha Shah', team: 'Training & Client Experience' },
  'Booking & Schedule': { assignedTo: 'Akshay Rane', team: 'Sales & Client Servicing' },
  'Facility & Equipment': { assignedTo: 'Zahur Shaikh', team: 'Operations & Maintenance' },
  'Billing & Membership': { assignedTo: 'Akshay Rane', team: 'Sales & Client Servicing' },
  'Safety & Medical': { assignedTo: 'Saachi Shetty - Operations', team: 'Operations & Maintenance' },
  'Front Desk & Service': { assignedTo: 'Nunu Yeptomi', team: 'Sales & Client Servicing' },
  'App & Digital': { assignedTo: 'Saachi Shetty - Operations', team: 'Technical Support' },
  'Hosted Class & Partnerships': { assignedTo: 'Saachi Shetty', team: 'Marketing & PR' },
  'Member Progress & Transformation': { assignedTo: 'Anisha Shah', team: 'Training & Client Experience' },
  'Sales & Consultation': { assignedTo: 'Jimmeey Gondaa', team: 'Sales & Client Servicing' },
  'General Feedback': { assignedTo: 'Nunu Yeptomi', team: 'Management' },
};
const REFUND_CATEGORIES = ['Billing & Membership', 'Pricing and Memberships'];
const SERVER_MASTER_DATA = {
  routes: ['Request', 'Complaint', 'Feedback', 'Internal Reporting'],
  studios: [
    'Kwality House, Kemps Corner',
    'Supreme HQ, Bandra',
    'Kenkere House, Bengaluru',
    'Courtside, Mumbai',
    'the Studio by Copper & Cloves, Bengaluru',
  ],
  categories: Object.keys(ASSIGNMENT_RULES),
  departments: DEPARTMENTS,
  priorities: Object.keys(PRIORITY_SLA_HOURS),
  clientsAffectedOptions: CLIENTS_AFFECTED_OPTIONS,
  classImpactTypeOptions: CLASS_IMPACT_TYPE_OPTIONS,
};

function isBengaluruStudio(studio?: string | null): boolean {
  return /bengaluru|bangalore|copper/i.test(studio || '');
}

function isBandraStudio(studio?: string | null): boolean {
  return /bandra|supreme/i.test(studio || '');
}

function isRefundRouting(category: string, subCategory?: string | null): boolean {
  return REFUND_CATEGORIES.includes(category) && /refund/i.test(subCategory || '');
}

function resolveSalesAssignment(studio?: string | null): { assignedTo: string; team: string } {
  if (isBengaluruStudio(studio)) return { assignedTo: 'Yashas K', team: 'Sales & Client Servicing' };
  if (isBandraStudio(studio)) return { assignedTo: 'Imran Shaikh', team: 'Sales & Client Servicing' };
  return { assignedTo: 'Akshay Rane', team: 'Sales & Client Servicing' };
}

function resolveAssignment(category: string, studio?: string | null, subCategory?: string | null): { assignedTo: string; team: string } {
  if (isRefundRouting(category, subCategory)) return resolveSalesAssignment(studio);

  if (['Scheduling', 'Booking & Schedule', 'Front Desk & Service', 'Customer Service and Communication', 'Sales & Consultation', 'Billing & Membership', 'Pricing and Memberships'].includes(category)) {
    return resolveSalesAssignment(studio);
  }

  if (['Facility & Equipment', 'Repair and Maintenance', 'Studio Amenities and Facilities', 'Safety and Security', 'Safety & Medical', 'Theft and Lost Items', 'Operating Systems', 'Tech Issues', 'App & Digital'].includes(category)) {
    if (['Operating Systems', 'Tech Issues', 'App & Digital'].includes(category)) {
      return { assignedTo: 'Saachi Shetty - Operations', team: 'Technical Support' };
    }
    return isBengaluruStudio(studio)
      ? { assignedTo: 'Shifa Ali', team: 'Operations & Maintenance' }
      : { assignedTo: 'Zahur Shaikh', team: 'Operations & Maintenance' };
  }

  return ASSIGNMENT_RULES[category] || ASSIGNMENT_RULES['General Feedback'];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function bearerToken(authorization: string): string {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function authenticateRequest(request: Request): Promise<Response | { user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } }> {
  const supabaseUrl = Deno.env.get('TICKETING_SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('TICKETING_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Missing Supabase auth configuration' }, 500);

  const token = bearerToken(request.headers.get('authorization') || '');
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return json({ error: 'Unauthorized' }, 401);

  return { user: data.user };
}

function cleanString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isCasualGreeting(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  const greetingPattern = /^(hi|hello|hey|heya|hiya|good\s+(morning|afternoon|evening)|namaste|yo)(\s+athena)?[.!?\s]*$/i;
  const issueSignalPattern = /\b(ac|hvac|broken|not working|issue|problem|complaint|member|client|refund|billing|payment|class|session|trainer|instructor|studio|booking|schedule|maintenance|repair|leak|dirty|urgent)\b/i;
  if (issueSignalPattern.test(value) && !greetingPattern.test(value)) return false;
  return greetingPattern.test(value);
}

function normalizePriority(value: unknown): Priority {
  if (value === 'Critical' || value === 'High' || value === 'Medium' || value === 'Low') return value;
  return 'Medium';
}

function hasConfirmedAffectedClients(value: unknown): boolean {
  return /^yes\b/i.test(cleanString(value));
}

function shouldRequireNamedMemberContext(
  text: string,
  context: Record<string, unknown>,
  category: string,
): boolean {
  if (cleanString(context.memberId) || cleanString(context.memberName)) return false;
  if (['Repair and Maintenance', 'Studio Amenities and Facilities', 'Facility & Equipment', 'Operating Systems', 'Tech Issues', 'App & Digital'].includes(category)) {
    return false;
  }

  const lower = [
    text,
    cleanString(context.initialReport),
    cleanString(context.requestType),
    cleanString(context.category),
    cleanString(context.subCategory),
    cleanString(context.description),
  ].filter(Boolean).join(' ').toLowerCase();

  const entityText = [
    text,
    cleanString(context.initialReport),
    cleanString(context.description),
    cleanString(context.requestType),
  ].filter(Boolean).join(' ').toLowerCase();

  return /\b(member|client|customer|guest|prospect)\b/.test(entityText)
    && /refund|billing|payment|membership|package|freeze|roll\s?over|extension|renewal|cancel|complain|complaint|follow-up|follow up|contact|whatsapp|email|phone|profile|account/.test(lower);
}

function shouldRequireCommercialVerificationContext(
  text: string,
  context: Record<string, unknown>,
  category: string,
): boolean {
  if (['Repair and Maintenance', 'Studio Amenities and Facilities', 'Facility & Equipment', 'Operating Systems', 'Tech Issues', 'App & Digital'].includes(category)) {
    return false;
  }

  const lower = [
    text,
    cleanString(context.initialReport),
    cleanString(context.description),
    cleanString(context.requestType),
    cleanString(context.category),
    cleanString(context.subCategory),
  ].filter(Boolean).join(' ').toLowerCase();

  const memberReference =
    /\b(member|client|customer|guest|prospect)\b/.test(lower) ||
    Boolean(cleanString(context.memberId)) ||
    Boolean(cleanString(context.memberName));
  if (!memberReference) return false;

  const commercialConcern =
    /refund|billing|payment|paid|amount|charge|charged|invoice|receipt|purchase|membership|package|renewal|expiry|credit|waiver|freeze|pause|roll\s?over|extension|pricing|price/.test(lower) ||
    ['Pricing and Memberships', 'Billing & Membership'].includes(category);

  const mentionsClassContext = /(class|session|booking|barre|cycle|power\s?cycle|late entry)/.test(lower);
  const classAccessConcern =
    mentionsClassContext &&
    (
      /(denied|not allowed|unable to join|could not join|cannot join|would not be able|restriction|protocol|policy)/.test(lower) ||
      /\blate\s+(entry|arrival|cancellation|cancel|policy)\b/.test(lower) ||
      /\barrived\s+late\b.{0,60}\b(denied|not allowed|unable|could not|cannot|entry|policy|restriction)\b/.test(lower) ||
      /\bfirst\s+(class|barre|power\s?cycle|cycle|session)\b/.test(lower)
    );

  return commercialConcern || classAccessConcern;
}

function shouldRequireClassAccessVerification(
  text: string,
  context: Record<string, unknown>,
  category: string,
): boolean {
  if (!shouldRequireCommercialVerificationContext(text, context, category)) return false;

  const lower = [
    text,
    cleanString(context.initialReport),
    cleanString(context.description),
    cleanString(context.requestType),
    cleanString(context.category),
    cleanString(context.subCategory),
  ].filter(Boolean).join(' ').toLowerCase();

  return /(class|session|booking|barre|cycle|power\s?cycle|late entry)/.test(lower) &&
    /(denied|not allowed|unable to join|could not join|cannot join|would not be able|first|late|restriction|protocol|policy)/.test(lower);
}

function hasAffectedClassSignal(text: string, context: Record<string, unknown>): boolean {
  const lower = [
    text,
    cleanString(context.initialReport),
    cleanString(context.description),
    cleanString(context.operationalImpact),
    cleanString(context.currentWorkaround),
    cleanString(context.classImpactType),
    cleanString(context.classImpactDetails),
  ].filter(Boolean).join(' ').toLowerCase();

  return /\b(?:classes?|sessions?|schedule)\b.{0,36}\b(?:affected|impacted|delayed|paused|cancelled|canceled|moved|disrupted)\b/.test(lower) ||
    /\b(?:affected|impacted|delayed|paused|cancelled|canceled|moved|disrupted)\b.{0,36}\b(?:classes?|sessions?|schedule)\b/.test(lower) ||
    /\bclass flow\b|\bfull class\b|\bhad to pause\b|\bmembers?\s+stepped out\b|\bwalked out\b/.test(lower);
}

function shouldRequireComplaintResolution(
  text: string,
  context: Record<string, unknown>,
  category: string,
): boolean {
  if (cleanString(context.desiredResolution)) return false;
  if (!shouldRequireNamedMemberContext(text, { ...context, memberId: '', memberName: '' }, category)) return false;

  const lower = [
    text,
    cleanString(context.initialReport),
    cleanString(context.description),
    cleanString(context.requestType),
    cleanString(context.category),
    cleanString(context.subCategory),
  ].filter(Boolean).join(' ').toLowerCase();

  if (/wants?\s+(a\s+)?(follow-?up|call|email|whatsapp|refund|waiver|extension|credit)|requested\s+(a\s+)?(follow-?up|call|email|whatsapp|refund|waiver|extension|credit)/.test(lower)) {
    return false;
  }

  return /complain|complaint|refund|billing|payment|delay|not resolved|follow-?up/.test(lower);
}

function shouldRequireFullIssueSummary(
  text: string,
  context: Record<string, unknown>,
  category: string,
): boolean {
  const description = cleanString(context.description);
  if (!description) return true;
  if (!shouldRequireNamedMemberContext(text, { ...context, memberId: '', memberName: '' }, category)) return false;

  const lower = [
    text,
    cleanString(context.initialReport),
    description,
  ].filter(Boolean).join(' ').toLowerCase();

  return description.length < 60 && /complain|complaint|refund|billing|payment|delay|not resolved/.test(lower);
}

function computeSlaDueAt(priority: Priority): string {
  const dueAt = new Date();
  dueAt.setHours(dueAt.getHours() + PRIORITY_SLA_HOURS[priority]);
  return dueAt.toISOString();
}

function ticketRequiresResolution(context: Record<string, unknown>): boolean {
  return cleanString(context.resolutionRequired).toLowerCase() !== 'no';
}

function ticketSlug(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function shouldUseMemberContext(issueText: string, context: Record<string, unknown>, category = '', subCategory = ''): boolean {
  const value = [
    issueText,
    category,
    subCategory,
    cleanString(context.requestType),
    cleanString(context.clientsAffected),
  ].filter(Boolean).join(' ').toLowerCase();

  if (hasConfirmedAffectedClients(context.clientsAffected)) return true;
  return /member|client|customer|guest|prospect|profile|contact|phone|email|membership|package|billing|payment|refund|freeze|roll\s?over|extension|renewal|follow-up/.test(value);
}

function shouldUseSessionContext(issueText: string, context: Record<string, unknown>, category = '', subCategory = ''): boolean {
  const value = [
    issueText,
    category,
    subCategory,
    cleanString(context.requestType),
  ].filter(Boolean).join(' ').toLowerCase();

  return /class|session|booking|schedul|waitlist|attendance|attendee|trainer|instructor|barre|cycle|powercycle|strength|late cancellation|no-show/.test(value);
}

function professionalDescription(text: string, context: Record<string, unknown>, category: string, subCategory: string): string {
  const route = cleanString(context.intakeRoute, 'Unclassified');
  const includeMemberContext = shouldUseMemberContext(text, context, category, subCategory);
  const includeSessionContext = shouldUseSessionContext(text, context, category, subCategory);
  const member = includeMemberContext ? cleanString(context.memberName) : '';
  const studio = cleanString(context.studio);
  const trainer = includeSessionContext ? cleanString(context.trainer) : '';
  const classType = includeSessionContext ? cleanString(context.classType) : '';
  const membership = includeMemberContext ? cleanString(context.membership) : '';
  const clientsAffected = cleanString(context.clientsAffected);
  const resolution = cleanString(context.desiredResolution);
  const incidentDateTime = cleanString(context.incidentDateTime);

  return [
    `Summary: ${text || 'The report requires internal follow-up.'}`,
    '',
    'Operational context:',
    `- Intake route: ${route}`,
    `- Category: ${category} / ${subCategory}`,
    clientsAffected ? `- Client impact check: ${clientsAffected}` : null,
    member ? `- Member: ${member}` : null,
    studio ? `- Studio: ${studio}` : null,
    trainer ? `- Instructor: ${trainer}` : null,
    classType ? `- Class/session: ${classType}` : null,
    incidentDateTime ? `- Approx. incident date/time: ${incidentDateTime}` : null,
    membership ? `- Active package/membership: ${membership}` : null,
    '',
    `Requested resolution: ${resolution || 'Resolution pathway to be confirmed by the assigned owner after review.'}`,
    '',
    'Athena review note: Ticket was drafted from internal intake details and should be validated before operational action.',
  ].filter((line) => line !== null).join('\n');
}

function fallbackDraft(messages: ChatMessage[] = [], context: Record<string, unknown> = {}): DraftTicket {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const text = cleanString(context.description) || latestUserMessage.replace(/\[Context[^\n]*\]\n?/i, '').trim();
  const lower = text.toLowerCase();
  let inferredCategory = 'General Feedback';
  if (/billing|refund|payment|freeze|roll over|rollover|extension|membership|package/.test(lower)) {
    inferredCategory = 'Pricing and Memberships';
  } else if (/hosted|partner|influencer/.test(lower)) {
    inferredCategory = 'Hosted Class & Partnerships';
  } else if (/injury|safety|medical|security|theft|stolen|missing cash|harass/.test(lower)) {
    inferredCategory = 'Safety and Security';
  } else if (/repair|maintenance|broken|not working|not closing|not opening|stopped working|won't close|won't open|malfunction|faulty|damaged|leak|leaking|plumbing|drain|clog|flush|machine|washing|dryer|pump|electrical|socket|bulb|pest|mold|mould|crack|\bdoor\b|\block\b|handle|hinge/.test(lower) || HVAC_TEXT_PATTERN.test(lower)) {
    inferredCategory = 'Repair and Maintenance';
  } else if (/odour|odor|smell|ventilation|air quality|locker|shower|washroom|steam|clean|dirty|hygiene|temperature|too hot|too cold|air\s?con|amenity/.test(lower)) {
    inferredCategory = 'Studio Amenities and Facilities';
  } else if (/trainer|instructor|class/.test(lower)) {
    inferredCategory = 'Class Experience';
  }
  const category = cleanString(context.category, inferredCategory);

  const priority: Priority =
    normalizePriority(context.priority || (category === 'Safety and Security' || category === 'Safety & Medical' ? 'Critical' : lower.includes('angry') || lower.includes('urgent') ? 'High' : 'Medium'));

  const subCategory = cleanString(context.subCategory, category === 'General Feedback' ? 'Other' : 'Member-reported issue');
  const includeMemberContext = shouldUseMemberContext(text, context, category, subCategory);
  const includeSessionContext = shouldUseSessionContext(text, context, category, subCategory);
  const titleParts = [
    cleanString(context.intakeRoute, 'Ticket'),
    subCategory,
    includeMemberContext ? cleanString(context.memberName) : '',
  ].filter(Boolean);

  return {
    title: titleParts.join(' · ').slice(0, 96) || 'Issue requiring follow-up',
    description: professionalDescription(text, context, category, subCategory),
    category,
    subCategory,
    priority,
    studio: cleanString(context.studio, 'Unspecified Studio'),
    trainer: includeSessionContext ? cleanString(context.trainer) || null : null,
    classType: includeSessionContext ? cleanString(context.classType) || null : null,
    classDateTime: includeSessionContext ? cleanString(context.classDateTime) || null : null,
    memberName: includeMemberContext ? cleanString(context.memberName) || null : null,
    memberContact: includeMemberContext ? cleanString(context.memberContact) || null : null,
    reportedBy: cleanString(context.reportedBy, 'AI Intake') || null,
    tags: [
      'ai-draft',
      ticketSlug(context.intakeRoute),
      ticketSlug(category),
      ticketSlug(subCategory),
      ticketSlug(context.requestType),
    ].filter(Boolean),
    sentiment: lower.includes('angry') || lower.includes('frustrated') ? 'Negative' : 'Neutral',
    conversationSummary: text,
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

function normalizeAiDetailForm(value: unknown): AiDetailForm | null {
  if (!value || typeof value !== 'object') return null;
  const form = value as Partial<AiDetailForm> & { fields?: unknown[] };
  const allowedTypes = new Set(['select', 'text', 'textarea', 'date', 'datetime-local', 'number']);
  const fields = (Array.isArray(form.fields) ? form.fields : [])
    .map((field) => {
      if (!field || typeof field !== 'object') return null;
      const raw = field as Partial<AiDetailField>;
      const id = cleanString(raw.id).replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 80);
      const label = cleanString(raw.label);
      const type = allowedTypes.has(cleanString(raw.type)) ? raw.type as AiDetailField['type'] : 'text';
      if (!id || !label) return null;
      return {
        id,
        label,
        type,
        required: raw.required !== false,
        options: Array.isArray(raw.options) ? raw.options.map(String).filter(Boolean).slice(0, 30) : undefined,
        dependsOn: cleanString(raw.dependsOn) || undefined,
      };
    })
    .filter(Boolean) as AiDetailField[];

  if (!fields.length) return null;
  return {
    title: cleanString(form.title, 'Complete ticket intake details'),
    description: cleanString(form.description),
    fields,
    submitLabel: cleanString(form.submitLabel, 'Continue drafting ticket'),
  };
}

function normalizeAiIntakeResponse(value: Record<string, unknown> | null): AiIntakeResponse | null {
  if (!value) return null;
  const detailForm = normalizeAiDetailForm(value.detailForm);
  const ticket = value.ticket && typeof value.ticket === 'object' ? value.ticket as DraftTicket : null;
  return {
    needsMoreInfo: Boolean(value.needsMoreInfo || detailForm),
    reply: cleanString(value.reply, detailForm ? 'Please complete the structured intake form below.' : 'I drafted the ticket below. Please review it before publishing.'),
    detailForm,
    ticket,
    suggestedChips: Array.isArray(value.suggestedChips) ? value.suggestedChips as AiIntakeResponse['suggestedChips'] : [],
    inferredContext: value.inferredContext && typeof value.inferredContext === 'object'
      ? value.inferredContext as Record<string, string>
      : {},
    missingFields: Array.isArray(value.missingFields) ? value.missingFields.map(String) : [],
    publishable: typeof value.publishable === 'boolean' ? value.publishable : !(value.needsMoreInfo || detailForm),
    urgencyReason: cleanString(value.urgencyReason),
  };
}

/**
 * Entity fields that should only appear in a detailForm when the business-logic guard
 * (requiredFieldsForIssue) also says they are needed.
 * This prevents the AI from hallucinating member/class fields for facility issues.
 */
const PROTECTED_ENTITY_FIELD_IDS = new Set([
  'memberName',
  'memberContact',
  'memberId',
  'classType',
  'classDateTime',
  'trainer',
  'sessionId',
  'membership',
]);

const KNOWN_DETAIL_FIELD_IDS = new Set([
  'intakeRoute',
  'requestType',
  'clientsAffected',
  'studio',
  'category',
  'subCategory',
  'trainer',
  'classType',
  'membership',
  'memberName',
  'memberContact',
  'reportedBy',
  'priority',
  'description',
  'desiredResolution',
  'resolutionRequired',
  'incidentDateTime',
  'memberSentiment',
  'momencePurchaseContext',
  'classImpactType',
  'classImpactDetails',
  'freezeStartDate',
  'freezeEndDate',
  'freezeReason',
  'classesRemaining',
  'packageExpiryDate',
  'requestedRolloverDate',
  'rolloverReason',
  'partnerName',
  'hostedFeedbackArea',
  'attendeeCount',
  'prospectQuality',
  'followUpPreference',
  'machineSymptom',
  'bikeSymptom',
  'equipmentSymptom',
  'hvacSymptom',
  'lockFaultType',
  'accessStatus',
  'securityRisk',
  'plumbingSymptom',
  'electricalSymptom',
  'affectedArea',
  'operationalImpact',
  'currentWorkaround',
  'resolutionRequirement',
  'appIssueSurface',
  'appErrorObserved',
  'deviceContext',
]);

/**
 * Removes protected entity fields from the AI's proposed detailForm unless the business
 * rules guard also flagged them as required. Non-entity (issue-specific) fields from
 * the AI are always kept so the AI can still ask its own contextual questions.
 */
function filterAiDetailFormFields(
  form: AiDetailForm | null | undefined,
  guardedFields: DetailFieldId[],
): AiDetailForm | null {
  if (!form) return null;
  const guardedSet = new Set<string>(guardedFields);
  const filteredFields = form.fields.map((field) => {
    if (field.id === 'reportedBy') return false;
    if (field.id === 'description' && guardedSet.size > 0 && !guardedSet.has('description')) return false;
    if (KNOWN_DETAIL_FIELD_IDS.has(field.id) && !guardedSet.has(field.id)) return false;
    if (PROTECTED_ENTITY_FIELD_IDS.has(field.id) && !guardedSet.has(field.id)) return false;
    return guardedSet.has(field.id) ? { ...field, required: true } : field;
  }).filter(Boolean) as AiDetailField[];
  if (filteredFields.length === 0) return null;
  return { ...form, fields: filteredFields };
}

async function askAiForIntake(body: RequestBody, instructions: string): Promise<AiIntakeResponse | null> {
  const result = await callJsonAi((name) => Deno.env.get(name) || undefined, fetch, {
    provider: body.aiProvider,
    temperature: 0.2,
    systemContent: [
      instructions,
      '',
      'Return JSON only using this schema:',
      '{"needsMoreInfo": boolean, "reply": string, "inferredContext": {"intakeRoute": string, "category": string, "subCategory": string, "priority": string, "clientsAffected": string, "classImpactType": string, "memberSentiment": string, "desiredResolution": string, "membership": string}, "urgencyReason": string, "missingFields": string[], "publishable": boolean, "detailForm": {"title": string, "description": string, "fields": [{"id": string, "label": string, "type": "select|text|textarea|date|datetime-local|number", "required": boolean, "options": string[]}], "submitLabel": string}, "ticket": DraftTicket|null, "suggestedChips": []}',
      '',
      'Master-data fields must use these exact IDs when needed: intakeRoute, category, subCategory, clientsAffected, studio, trainer, classType, membership, memberName, memberContact, priority, description, desiredResolution, incidentDateTime, memberSentiment, momencePurchaseContext, classImpactType, classImpactDetails.',
      'Do not ask for reportedBy; the frontend supplies it from the signed-in user.',
      'For issue-specific fields, create clear snake_case IDs prefixed by the category or subcategory, and include options for select fields.',
      'Infer category and subCategory from the report whenever possible. Ask for category or subCategory only when the text is genuinely ambiguous after using the approved master data.',
      `Always use clientsAffected as a required select before drafting or publishing; valid values are: ${CLIENTS_AFFECTED_OPTIONS.join(', ')}.`,
      'If clientsAffected starts with "Yes", require memberName so the frontend renders Momence member search for the affected clients.',
      `If a class/session/schedule was affected, require classType, classImpactType, and classImpactDetails. classImpactType options: ${CLASS_IMPACT_TYPE_OPTIONS.join(', ')}.`,
      'If memberName/memberContact is needed, use memberName so the frontend renders Momence member search.',
      'If class/session details are needed, use classType so the frontend renders Momence session search.',
      'Do not include memberName, memberContact, classType, sessionId, classDateTime, or trainer in detailForm or ticket unless those fields are necessary for the described incident.',
    ].join('\n'),
    userContent: JSON.stringify({
      context: body.context || {},
      intakeContract: body.intakeContract || {},
      masterData: SERVER_MASTER_DATA,
      messages: body.messages || [],
    }),
  });
  if (!result) return null;
  return normalizeAiIntakeResponse(parseJsonObject(result.content));
}

type AiReportNarrative = {
  summary: string;
  findings: string[];
  risks: string[];
  recommendedActions: string[];
  dataQualityNotes: string[];
  generatedByAi: boolean;
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean).slice(0, 8);
}

function normalizeRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => (
    Boolean(item) &&
    typeof item === 'object' &&
    !Array.isArray(item)
  ));
}

function cleanReportValue(value: unknown, fallback = '0'): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function fallbackReportNarrative(body: RequestBody): AiReportNarrative {
  const metrics = normalizeRecordArray(body.metrics);
  const dataQualityNotes = normalizeStringArray(body.dataQualityNotes);
  const ticketCount = metrics.find((metric) => metric.id === 'ticket_count')?.value;
  const breached = metrics.find((metric) => metric.id === 'sla_breached')?.value;
  const highPriority = metrics.find((metric) => metric.id === 'high_priority')?.value;
  return {
    summary: `Report ${cleanString(body.reportId, 'selected report')} covers ${cleanReportValue(ticketCount, 'the filtered')} tickets for the requested period.`,
    findings: metrics.slice(0, 5).map((metric) => `${cleanReportValue(metric.label, cleanReportValue(metric.id, 'Metric'))}: ${cleanReportValue(metric.value)}`),
    risks: [
      `SLA breached tickets: ${cleanReportValue(breached)}.`,
      `Critical or High priority tickets: ${cleanReportValue(highPriority)}.`,
    ],
    recommendedActions: [
      'Review the highest-risk source rows before sharing the report.',
      'Use the recurring category and owner workload signals to assign follow-up owners.',
      'Improve intake fields called out in the data-quality notes.',
    ],
    dataQualityNotes,
    generatedByAi: false,
  };
}

function normalizeReportNarrative(value: Record<string, unknown> | null, body: RequestBody): AiReportNarrative {
  const fallback = fallbackReportNarrative(body);
  if (!value) return fallback;
  const dataQualityNotes = normalizeStringArray(value.dataQualityNotes);
  return {
    summary: cleanString(value.summary, fallback.summary),
    findings: normalizeStringArray(value.findings).length ? normalizeStringArray(value.findings) : fallback.findings,
    risks: normalizeStringArray(value.risks).length ? normalizeStringArray(value.risks) : fallback.risks,
    recommendedActions: normalizeStringArray(value.recommendedActions).length
      ? normalizeStringArray(value.recommendedActions)
      : fallback.recommendedActions,
    dataQualityNotes: dataQualityNotes.length ? dataQualityNotes : fallback.dataQualityNotes,
    generatedByAi: typeof value.generatedByAi === 'boolean' ? value.generatedByAi : true,
  };
}

async function askAiForReportNarrative(body: RequestBody): Promise<AiReportNarrative> {
  const result = await callJsonAi((name) => Deno.env.get(name) || undefined, fetch, {
    provider: body.aiProvider,
    temperature: 0.2,
    systemContent: [
      'You are Athena, the Physique 57 India internal operations reporting assistant.',
      'Write concise executive reporting prose from computed metrics only.',
      'Do not invent counts, rates, tickets, members, owners, departments, or financial impact.',
      'Do not expose member contact details. Refer to source rows only by ticket ID/title/category when needed.',
      'Use third-person internal operations language.',
      'Return JSON only with this schema:',
      '{"summary": string, "findings": string[], "risks": string[], "recommendedActions": string[], "dataQualityNotes": string[]}',
    ].join('\n'),
    userContent: JSON.stringify({
      reportId: body.reportId,
      period: body.period,
      filters: body.filters,
      metrics: body.metrics,
      sections: body.sections,
      topRows: body.topRows,
      dataQualityNotes: body.dataQualityNotes,
      assumptions: body.assumptions,
    }),
  });
  if (!result) return fallbackReportNarrative(body);
  return normalizeReportNarrative(parseJsonObject(result.content), body);
}

function inferContextFromText(text: string, context: Record<string, unknown> = {}): Record<string, string> {
  const lower = [
    text,
    cleanString(context.initialReport),
    cleanString(context.requestType),
    cleanString(context.category),
    cleanString(context.subCategory),
    cleanString(context.description),
  ].filter(Boolean).join(' ').toLowerCase();
  const inferred: Record<string, string> = {};

  if (!cleanString(context.intakeRoute)) {
    if (/hosted class|host class|post-class feedback|attendees|lead tracking|lead feedback/.test(lower)) inferred.intakeRoute = 'Feedback';
    else if (/refund|freeze|roll\s?over|extension|reschedule|request|need|asked|wants|would like|approval|waiver|upgrade|remove her name|share details/.test(lower)) inferred.intakeRoute = 'Request';
    else if (/complain|angry|frustrated|unhappy|not resolved|delay|issue|problem|concern|denied|walked out|missing|stolen|harass|poach/.test(lower)) inferred.intakeRoute = 'Complaint';
    else if (/reported|feedback|suggested|said|shared|mentioned|compliment|liked|loved|lead|hosted class|post-class/.test(lower)) inferred.intakeRoute = 'Feedback';
    else inferred.intakeRoute = 'Internal Reporting';
  }

  if (!cleanString(context.category)) {
    if (/momence|crm|zoho|data accuracy|handover|sop|standard operating|process|workflow|payroll|performance review|finance|reconciliation|upi|marketing|campaign|collateral|partnership approval|internal operations|internal memo/.test(lower)) {
      inferred.category = 'Operating Systems';
      inferred.subCategory = /momence|crm|data/.test(lower) ? 'Momence Issues' : /payment|upi|reconciliation|finance/.test(lower) ? 'Payment Gateway Issue' : 'Technical Assistance';
    } else if (/hosted|host class|influencer|partner|lead tracking|lead feedback|guestlist|collaboration/.test(lower)) {
      inferred.category = 'Hosted Class & Partnerships';
      inferred.subCategory = /lead|sales|conversion|prospect|drop-in|share details|requested/.test(lower) ? 'Prospect Conversion Opportunity' : /swap|instructor/.test(lower) ? 'Partner Instructor Feedback' : 'Hosted Class Feedback';
    } else if (/billing|refund|payment|freeze|roll over|rollover|extension|membership|package|renewal|expiry|credit|late cancellation|waiver|upgrade/.test(lower)) {
      inferred.category = 'Pricing and Memberships';
      inferred.subCategory = /freeze|pause/.test(lower) ? 'Membership Pause and Freeze Policy' : /refund|waiver/.test(lower) ? 'Refund and Cancellation Policy Issue' : /upgrade|downgrade/.test(lower) ? 'Membership Upgrade/Downgrade' : 'Class Pack Expiry Confusion';
    } else if (/injury|safety|medical|harassment|security|theft|stolen|missing cash|cash envelope|unsafe|faint|cramp|conflict/.test(lower)) {
      inferred.category = 'Safety and Security';
      inferred.subCategory = /theft|stolen|missing cash|cash envelope/.test(lower) ? 'Theft Prevention Measures' : /harass|conflict/.test(lower) ? 'Harassment Reports' : 'Personal Safety Concerns';
    } else if (
      /repair|maintenance|broken|not working|not closing|not opening|stopped working|isn't working|isnt working|won't close|won't open|malfunction|faulty|damaged|damage|crack|cracked|leak|leaking|overflow|plumbing|drain|clog|clogged|flush|sewage|socket|electrical|wiring|bulb|fused|flickering|lights not|light not|machine|washing machine|dryer|washing|pump|generator|pest|pest control|mold|mould|damp|seepage|\bdoor\b|\block\b|latch|handle|hinge/.test(lower) ||
      HVAC_TEXT_PATTERN.test(lower)
    ) {
      inferred.category = 'Repair and Maintenance';
      inferred.subCategory = HVAC_TEXT_PATTERN.test(lower) ? 'AC and HVAC Issues'
        : /light|bulb|fused|flickering/.test(lower) ? 'Lighting Issues'
        : /audio|speaker|mic|sound/.test(lower) ? 'Audio System Malfunction'
        : /leak|plumbing|drain|flush|sewage|overflow|clog|pipe/.test(lower) ? 'Plumbing Leaks'
        : /pest|cockroach|rat|rodent|insect|ant/.test(lower) ? 'Pest Control Needed'
        : /door|lock|handle|hinge/.test(lower) ? 'Door Lock Issues'
        : /machine|washing|dryer|equipment|broken|not working|malfunction|faulty/.test(lower) ? 'Broken Equipment'
        : 'General Maintenance Delays';
    } else if (/odour|odor|smell|stench|ventilation|air quality|locker|shower|washroom|toilet|steam room|valet|parking|wi-fi|wifi|boutique|retail|amenity|amenities|cleanliness|hygiene|clean|dirty/.test(lower)) {
      inferred.category = 'Studio Amenities and Facilities';
      inferred.subCategory = /temperature|too hot|too cold|cold|hot/.test(lower) ? 'Air Quality Poor'
        : /ventilation|air quality/.test(lower) ? 'Ventilation Poor'
        : /clean|hygiene|dirty/.test(lower) ? 'Cleanliness and Hygiene'
        : /locker/.test(lower) ? 'Locker Availability'
        : /boutique|retail/.test(lower) ? 'Boutique Availability Issues'
        : /steam/.test(lower) ? 'Steam Room Not Working'
        : 'Studio Odour and Aroma';
    } else if (/temperature|too hot|too cold|air\s?con|air quality/.test(lower)) {
      // Temperature/AC complaints that didn't match maintenance (i.e. comfort complaints, not breakdowns)
      inferred.category = 'Studio Amenities and Facilities';
      inferred.subCategory = 'Air Quality Poor';
    } else if (/trainer|instructor|class|music|cue|correction|adjustment|overcrowded/.test(lower)) {
      inferred.category = /trainer|instructor|correction|adjustment|punctual|engagement|no-show/.test(lower) ? 'Trainer Feedback' : 'Class Experience';
      inferred.subCategory = /overcrowd|capacity/.test(lower) ? 'Overcrowding in Class' : /audio|music|loud/.test(lower) ? 'Audio Issues' : /punctual|late|no-show/.test(lower) ? 'Trainer Punctuality Issues' : /intensity/.test(lower) ? 'Class Intensity Too High/Low' : 'Class Flow and Pacing';
    } else if (/app crash|app not|app freezing|login issue|login error|password reset|push notification|booking confirmation missing|payment gateway|momence account|sync issue|profile issue|website glitch|website not|website down|qr code|ipad not|ipad issue/.test(lower)) {
      inferred.category = 'App & Digital';
      inferred.subCategory = /crash|freeze|not responding/.test(lower) ? 'App Crash'
        : /login|password/.test(lower) ? 'Login Issue'
        : /notification/.test(lower) ? 'Push Notifications'
        : /payment|gateway/.test(lower) ? 'Payment Gateway Issue'
        : /momence|sync/.test(lower) ? 'Momence Account Sync'
        : /booking confirm/.test(lower) ? 'Booking Confirmation Missing'
        : /website/.test(lower) ? 'Website Chat / Lead Form Issue'
        : 'App Crash';
    } else if (/booking|schedule|class availability|late entry|waitlist|cancelled|reschedule|timing|variety/.test(lower)) {
      inferred.category = 'Scheduling';
      inferred.subCategory = /late entry/.test(lower) ? 'Late Arrival Policy' : /availability|variety/.test(lower) ? 'Additional Classes' : /cancel/.test(lower) ? 'Last-minute Cancellations' : 'Class Capacity Issues';
    } else if (/whatsapp|call|email|response|follow-up|front desk|communication/.test(lower)) {
      inferred.category = 'Customer Service and Communication';
      inferred.subCategory = 'Delay in Response';
    } else if (/sales|lead|trial|conversion|competitor|price|drop-in|location too far|prospect/.test(lower)) {
      inferred.category = 'Sales & Consultation';
      inferred.subCategory = /competitor/.test(lower) ? 'Competitor Mentioned' : /price|drop-in/.test(lower) ? 'Prospect Price Concern' : 'Lead Quality Note';
    } else {
      inferred.category = 'General Feedback';
      inferred.subCategory = 'Other';
    }
  }

  if (!cleanString(context.priority)) {
    if (/injury|medical|harassment|security|theft|stolen|unsafe|emergency|missing cash|40,000/.test(lower)) inferred.priority = 'Critical';
    else if (/angry|frustrated|urgent|refund|not resolved|escalat|renewal|cancel|walked out|denied|poach|high-value/.test(lower)) inferred.priority = 'High';
    else if (/complain|issue|concern|delay|request|follow-up|hosted|lead/.test(lower)) inferred.priority = 'Medium';
    else inferred.priority = 'Low';
  }

  if (!cleanString(context.studio)) {
    if (/bandra|supreme hq/.test(lower)) inferred.studio = 'Supreme HQ, Bandra';
    else if (/kemps|kwality/.test(lower)) inferred.studio = 'Kwality House, Kemps Corner';
    else if (/kenkere/.test(lower)) inferred.studio = 'Kenkere House, Bengaluru';
    else if (/copper|cloves/.test(lower)) inferred.studio = 'the Studio by Copper & Cloves, Bengaluru';
    else if (/courtside/.test(lower)) inferred.studio = 'Courtside, Mumbai';
  }

  return inferred;
}

function requiredFieldsForIssue(
  text: string,
  context: Record<string, unknown>,
  options: { includeClientImpact?: boolean } = {},
): DetailFieldId[] {
  const lower = [
    text,
    cleanString(context.initialReport),
    cleanString(context.requestType),
    cleanString(context.category),
    cleanString(context.subCategory),
    cleanString(context.description),
  ].filter(Boolean).join(' ').toLowerCase();
  const intakeRoute = cleanString(context.intakeRoute);
  const route = intakeRoute.toLowerCase();
  const category = cleanString(context.category);
  const subCategory = cleanString(context.subCategory);
  const fields: DetailFieldId[] = [];
  const add = (field: DetailFieldId, value?: unknown) => {
    const cleaned = cleanString(value);
    if (!cleaned || PLACEHOLDER_VALUE_PATTERN.test(cleaned)) fields.push(field);
  };

  add('intakeRoute', context.intakeRoute);
  if (!intakeRoute) return Array.from(new Set(fields));

  add('category', context.category);
  add('subCategory', context.subCategory);
  if (!category || !subCategory) return Array.from(new Set(fields));

  const physicalStudioCategories = new Set([
    'Scheduling',
    'Class Experience',
    'Trainer Feedback',
    'Repair and Maintenance',
    'Studio Amenities and Facilities',
    'Safety and Security',
    'Theft and Lost Items',
    'Miscellaneous',
    'Instructor & Class Quality',
    'Booking & Schedule',
    'Facility & Equipment',
    'Front Desk & Service',
  ]);
  // Categories that are strictly facility/ops — a specific member is never required
  const physicalOnlyCategories = new Set([
    'Repair and Maintenance',
    'Studio Amenities and Facilities',
    'Facility & Equipment',
    'Operating Systems',
    'Tech Issues',
    'App & Digital',
  ]);
  const classContextCategories = new Set(['Scheduling', 'Class Experience', 'Trainer Feedback', 'Instructor & Class Quality', 'Booking & Schedule']);
  const membershipSpecific = /freeze|pause|roll|extension|membership|package|renewal|upgrade|downgrade|auto-renew|refund|expiry|credit|class pack|billing|payment/.test(lower);
  const commercialVerification = shouldRequireCommercialVerificationContext(text, context, category);
  const classAccessVerification = shouldRequireClassAccessVerification(text, context, category);
  const hostedSpecific = /hosted|partner|influencer|partnership/.test(lower) || category === 'Hosted Class & Partnerships';
  const prioritySpecific = route !== 'feedback' || /safety|security|theft|repair|maintenance|tech|operating|pricing|membership|customer service|complaint|urgent|injury|hazard/.test(`${category} ${subCategory} ${lower}`.toLowerCase());
  const includeClientImpact = options.includeClientImpact ?? true;

  if (includeClientImpact) {
    add('clientsAffected', context.clientsAffected);
  }

  // Always require studio for any physical in-studio category — no keyword guard needed
  if (physicalStudioCategories.has(category)) add('studio', context.studio);

  // For physical/maintenance/amenity issues, always require when it was first noticed.
  // This is a structural guard — the AI decides everything else about what to ask.
  const isPhysicalCategory = physicalOnlyCategories.has(category);
  if (isPhysicalCategory) {
    add('incidentDateTime', context.incidentDateTime);
    const bikeIssue = /\b(?:bike|spin bike|cycle bike|powercycle bike|power cycle bike)\b|\bbike\s*(?:no|number|#)?\s*\d+\b/.test(lower);
    if (bikeIssue) {
      add('bikeSymptom', context.bikeSymptom);
      add('operationalImpact', context.operationalImpact);
      add('currentWorkaround', context.currentWorkaround);
      add('resolutionRequirement', context.resolutionRequirement);
    } else if (/washing|washer|laundry|dryer|machine/.test(lower)) {
      add('machineSymptom', context.machineSymptom);
      add('operationalImpact', context.operationalImpact);
      add('currentWorkaround', context.currentWorkaround);
      add('resolutionRequirement', context.resolutionRequirement);
    } else if (/^Broken Equipment(?: Not Repaired)?$/i.test(subCategory) || /equipment|studio tool|method tool|tool|prop|mat|weights?|ball|barre|station/.test(lower)) {
      add('equipmentSymptom', context.equipmentSymptom);
      add('operationalImpact', context.operationalImpact);
      add('currentWorkaround', context.currentWorkaround);
      add('resolutionRequirement', context.resolutionRequirement);
    } else if (/door|lock|latch|handle|hinge|access|closing|opening/.test(lower) || subCategory === 'Door Lock Issues') {
      add('lockFaultType', context.lockFaultType);
      add('accessStatus', context.accessStatus);
      add('securityRisk', context.securityRisk);
      add('resolutionRequirement', context.resolutionRequirement);
    } else if (HVAC_TEXT_PATTERN.test(lower) || subCategory === 'AC and HVAC Issues') {
      add('hvacSymptom', context.hvacSymptom);
      add('affectedArea', context.affectedArea);
      add('operationalImpact', context.operationalImpact);
      add('currentWorkaround', context.currentWorkaround);
      add('resolutionRequirement', context.resolutionRequirement);
    } else if (/plumbing|leak|drain|clog|flush|sewage|overflow|pipe|water/.test(lower) || subCategory === 'Plumbing Leaks') {
      add('plumbingSymptom', context.plumbingSymptom);
      add('affectedArea', context.affectedArea);
      add('operationalImpact', context.operationalImpact);
      add('currentWorkaround', context.currentWorkaround);
      add('resolutionRequirement', context.resolutionRequirement);
    } else if (/light|lighting|bulb|fused|flickering|electrical|socket|wiring|power|trip/.test(lower) || subCategory === 'Lighting Issues') {
      add('electricalSymptom', context.electricalSymptom);
      add('affectedArea', context.affectedArea);
      add('operationalImpact', context.operationalImpact);
      add('currentWorkaround', context.currentWorkaround);
      add('resolutionRequirement', context.resolutionRequirement);
    } else if (/app|website|login|password|payment gateway|momence|sync|qr|ipad|wi-?fi|wifi|router/.test(lower) || category === 'App & Digital' || category === 'Tech Issues') {
      add('appIssueSurface', context.appIssueSurface);
      add('appErrorObserved', context.appErrorObserved);
      add('deviceContext', context.deviceContext);
      add('operationalImpact', context.operationalImpact);
      add('currentWorkaround', context.currentWorkaround);
    }
  }
  if (shouldRequireNamedMemberContext(text, context, category)) {
    add('memberName', context.memberId || context.memberName);
  }
  if (commercialVerification) {
    add('studio', context.studio);
    add('memberName', context.memberId || context.memberName);
    add('membership', context.membership);
    add('incidentDateTime', context.incidentDateTime);
    add('momencePurchaseContext', context.momencePurchaseContext);
    add('desiredResolution', context.desiredResolution);
    add('memberSentiment', context.memberSentiment);
    if (classAccessVerification) {
      add('classType', context.sessionId || context.classType);
    }
  }
  if (hasConfirmedAffectedClients(context.clientsAffected)) {
    add('memberName', context.memberId || context.memberName);
    if (hasAffectedClassSignal(text, context)) {
      add('classType', context.sessionId || context.classType);
      add('classImpactType', context.classImpactType);
      add('classImpactDetails', context.classImpactDetails);
    }
  }
  if (membershipSpecific && /select active membership|which membership|membership record|package record/.test(lower)) {
    add('membership', context.membership);
    if (/freeze start date|freeze end date|exact freeze dates/.test(lower)) {
      add('freezeStartDate', context.freezeStartDate);
      add('freezeEndDate', context.freezeEndDate);
      add('freezeReason', context.freezeReason);
    }
    if (/classes remaining|package expiry date|requested rollover date|exact extension date/.test(lower)) {
      add('classesRemaining', context.classesRemaining);
      add('packageExpiryDate', context.packageExpiryDate);
      add('requestedRolloverDate', context.requestedRolloverDate);
      add('rolloverReason', context.rolloverReason);
    }
  }
  if ((classContextCategories.has(category) || hostedSpecific) && /class|session|hosted|barre|cycle|strength|trainer|instructor|late cancellation|injury during class/.test(lower)) add('classType', context.sessionId || context.classType);
  if (category === 'Trainer Feedback' && /which trainer|specific trainer|trainer name/.test(lower)) add('trainer', context.trainer);
  if (hostedSpecific) {
    if (/which partner|partner name|influencer name|host name/.test(lower)) add('partnerName', context.partnerName);
    if (/feedback area|prospect quality|follow-up preference/.test(lower)) {
      add('hostedFeedbackArea', context.hostedFeedbackArea);
      add('prospectQuality', context.prospectQuality);
      add('followUpPreference', context.followUpPreference);
    }
  }
  // desiredResolution: ask for the requested outcome on brief personal complaints so the
  // owner can act without a follow-up.
  if (shouldRequireComplaintResolution(text, context, category) || (route === 'request' && !physicalOnlyCategories.has(category) && /desired resolution|requested resolution|what resolution/.test(lower))) {
    add('desiredResolution', context.desiredResolution);
  }
  if ((route === 'feedback' || route === 'complaint') && /sentiment unclear|member sentiment|how upset|frustration level/.test(lower)) add('memberSentiment', context.memberSentiment);

  add('reportedBy', context.reportedBy);
  if (prioritySpecific) add('priority', context.priority);
  // For physical/maintenance/facility categories the AI captures operational detail through
  // custom field IDs (e.g. latch_fault_type, door_access_status) — NOT the generic 'description'
  // field. Requiring 'description' for physical issues causes the form to show the generic
  // "Describe the issue" placeholder instead of the AI's contextual, targeted questions.
  // For all other categories, require description if not yet captured.
  if (!isPhysicalCategory) {
    add('description', shouldRequireFullIssueSummary(text, context, category) ? '' : context.description);
  }
  add('resolutionRequired', context.resolutionRequired);

  return Array.from(new Set(fields));
}

function buildSourceRef(draft: DraftTicket, context: Record<string, unknown> = {}, conversationId?: string | null): string {
  const explicitConversationId =
    conversationId ||
    (typeof context.conversationId === 'string' ? context.conversationId : null);
  if (explicitConversationId) return `approved-draft:${explicitConversationId}`;

  const seed = [
    draft.title,
    draft.category,
    draft.subCategory,
    draft.memberName || '',
    draft.memberContact || '',
    draft.studio || '',
    draft.description.slice(0, 180),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `approved-draft:${Math.abs(hash).toString(36)}`;
}

function toTicketRow(
  draft: DraftTicket,
  context: Record<string, unknown> = {},
  conversationId?: string | null,
  createdBy?: string | null,
) {
  const profileOnly = draft.metadata?.profileOnly === true || draft.tags?.includes('profile-only');
  const recordOnly = !profileOnly && !ticketRequiresResolution(context);
  const priority = normalizePriority(draft.priority);
  const fallbackAssignment = resolveAssignment(draft.category, draft.studio, draft.subCategory);
  const assignedTo = profileOnly ? 'Trainer Profile' : recordOnly ? RECORD_ONLY_ASSIGNEE : cleanString(draft.assignedTo)
    || cleanString(context.assignedTo)
    || cleanString(context.owner)
    || fallbackAssignment.assignedTo;
  const team = profileOnly ? 'Training & Client Experience' : normalizeDepartmentName(cleanString(draft.department)
    || cleanString(context.department)
    || cleanString(context.team)
    || fallbackAssignment.team);
  const effectivePriority = profileOnly ? 'Low' : priority;
  const sourceRef = buildSourceRef(draft, context, conversationId);
  const status = profileOnly || recordOnly ? 'Closed' : 'New';
  const slaDueAt = profileOnly
    ? cleanString(draft.classDateTime, new Date().toISOString())
    : recordOnly
      ? new Date().toISOString()
      : computeSlaDueAt(effectivePriority);

  return {
    source_ref: sourceRef,
    title: cleanString(draft.title, 'Member support ticket'),
    description: cleanString(draft.description, 'No description provided.'),
    category: cleanString(draft.category, 'General Feedback'),
    sub_category: cleanString(draft.subCategory, 'Other'),
    priority: effectivePriority,
    status,
    studio: cleanString(draft.studio, 'Unspecified Studio'),
    trainer: draft.trainer || null,
    class_type: draft.classType || null,
    class_date_time: draft.classDateTime || null,
    member_name: draft.memberName || null,
    member_contact: draft.memberContact || null,
    reported_by: draft.reportedBy || 'AI Intake',
    assigned_to: assignedTo,
    team,
    tags: Array.from(new Set([
      ...(draft.tags || []),
      'ai-approved',
      profileOnly ? 'profile-only' : recordOnly ? 'record-only' : '',
      recordOnly ? 'no-resolution-required' : '',
    ])).filter(Boolean),
    sentiment: draft.sentiment || null,
    conversation_summary: draft.conversationSummary || draft.description,
    metadata: {
      ...(draft.metadata || {}),
      source_ref: sourceRef,
      profileOnly,
      resolution_required: !recordOnly,
      no_sla: recordOnly,
      intake_context: context,
      routing: {
        department: team,
        assigned_to: assignedTo,
        owner_pool: recordOnly ? [] : [assignedTo],
        next_escalation: recordOnly ? null : undefined,
        status,
        priority: effectivePriority,
        profile_only: profileOnly,
        resolution_required: !recordOnly,
        sla_due_at: recordOnly ? null : slaDueAt,
        routing_source: profileOnly ? 'trainer_profile_record' : recordOnly ? 'record_only' : assignedTo === fallbackAssignment.assignedTo ? 'athena_employee_directory' : 'approved_context',
      },
    },
    created_by: createdBy || null,
    sla_due_at: slaDueAt,
  };
}

function getMissingColumnName(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as Record<string, unknown>;
  if (value.code !== '42703') return null;
  const message = typeof value.message === 'string' ? value.message : '';
  const details = typeof value.details === 'string' ? value.details : '';
  const match = `${message} ${details}`.match(/column "([^"]+)"/i);
  return match?.[1] || null;
}

function removeUnsupportedTicketColumn<T extends Record<string, unknown>>(row: T, column: string): T {
  if (!(column in row)) return row;
  const next = { ...row };
  delete next[column];
  return next as T;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json() as RequestBody;
    const authResult = await authenticateRequest(request);
    if (authResult instanceof Response) return authResult;
    const authUser = authResult.user;

    if (body.action === 'generateReportNarrative') {
      const narrative = await askAiForReportNarrative(body);
      return json({
        narrative,
        summary: narrative.summary,
        findings: narrative.findings,
        risks: narrative.risks,
        recommendedActions: narrative.recommendedActions,
        dataQualityNotes: narrative.dataQualityNotes,
      });
    }

    if (body.action === 'createTicket' || body.approved === true) {
      const draft = body.draft || body.ticket;
      if (!draft) return json({ error: 'Approved ticket creation requires a draft' }, 400);

      const supabaseUrl = Deno.env.get('TICKETING_SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('TICKETING_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Missing Supabase service role configuration' }, 500);
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const sourceRef = buildSourceRef(draft, body.context || {}, body.conversationId);
      const findExistingTicket = async () => {
        const byMetadata = await supabase
          .from('tickets')
          .select('*')
          .contains('metadata', { source_ref: sourceRef })
          .maybeSingle();
        if (!byMetadata.error || byMetadata.data) return byMetadata;

        const bySourceRef = await supabase
          .from('tickets')
          .select('*')
          .eq('source_ref', sourceRef)
          .maybeSingle();
        if (bySourceRef.error?.code === '42703') return byMetadata;
        return bySourceRef;
      };

      const { data: existing } = await findExistingTicket();

      if (existing) {
        return json({
          reply: `Ticket ${existing.id} was already created from this approved draft.`,
          createdTicket: existing,
        });
      }

      let rowForInsert = toTicketRow(draft, body.context || {}, body.conversationId, authUser.id);
      let data: Record<string, unknown> | null = null;
      let createError: { code?: string; message?: string } | null = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await supabase
          .from('tickets')
          .insert(rowForInsert)
          .select('*')
          .single();

        if (!result.error) {
          data = result.data;
          createError = null;
          break;
        }

        createError = result.error;
        const missingColumn = getMissingColumnName(result.error);
        if (!missingColumn || !(missingColumn in rowForInsert)) break;
        rowForInsert = removeUnsupportedTicketColumn(rowForInsert, missingColumn);
      }

      if (createError || !data) {
        if (createError?.code === '23505') {
          const { data: duplicated } = await findExistingTicket();
          if (duplicated) {
            return json({
              reply: `Ticket ${duplicated.id} was already created from this approved draft.`,
              createdTicket: duplicated,
            });
          }
        }
        return json({ error: createError?.message || 'Ticket creation failed' }, 500);
      }

      const ticketId = cleanString(data.id);
      const { error: eventError } = await supabase.from('ticket_events').insert({
        ticket_id: ticketId,
        event_type: 'ticket_created',
        actor: draft.reportedBy || authUser.email || 'Authenticated user',
        to_value: 'New',
        metadata: {
          conversationId: body.conversationId,
          source: 'approved_draft',
        },
        created_by: authUser.id,
      });
      if (eventError) {
        console.warn('Ticket event logging failed:', eventError.message);
      }

      return json({
        reply: `Ticket ${ticketId} has been created from the approved draft.`,
        createdTicket: data,
      });
    }

    const messages = body.messages || [];
    const promptProfile = cleanString(body.promptProfile, 'athena-intake-v1');
    const instructions = ATHENA_SYSTEM_PROMPT;
    const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';

    // Strip context preamble the frontend prepends to get the raw issue text
    const rawIssueText = latestUserMessage.replace(/^\[Context[^\]]*\]\s*/i, '').trim();

    if (isCasualGreeting(rawIssueText)) {
      return json({
        conversationId: body.conversationId || crypto.randomUUID(),
        promptProfile: `${promptProfile}:greeting`,
        needsMoreInfo: false,
        reply: "Hi, I'm Athena. What are we logging?",
        detailForm: null,
        ticket: null,
        suggestedChips: [
          { label: 'Complaint', value: 'Complaint', field: 'intakeRoute' },
          { label: 'Request', value: 'Request', field: 'intakeRoute' },
          { label: 'Feedback', value: 'Feedback', field: 'intakeRoute' },
        ],
        inferredContext: {},
        missingFields: [],
        publishable: false,
        urgencyReason: '',
      });
    }

    const isFormSubmission = /^here are the missing details/i.test(rawIssueText);
    const bodyContext = body.context || {};
    const effectiveBodyContext: Record<string, unknown> = { ...bodyContext };
    if (!isFormSubmission && !cleanString(effectiveBodyContext.initialReport) && rawIssueText) {
      effectiveBodyContext.initialReport = rawIssueText;
    }

    // Detect whether this is a physical/facility/maintenance issue from the text or the already-
    // inferred category. Physical issues need full operational detail — a brief one-liner must NOT
    // be treated as a complete description, because that would skip asking for fault detail,
    // operational impact, incident time, and resolution approach.
    const rawLower = rawIssueText.toLowerCase();
    const physicalIssueKeywords = /repair|maintenance|broken|not working|not closing|not opening|stopped working|isn't working|won't close|won't open|not cooling|not heating|too hot|too cold|very hot|very cold|temperature|malfunction|faulty|damaged|leak|leaking|overflow|plumbing|drain|clog|flush|sewage|socket|electrical|bulb|fused|flickering|lights not|machine|washing|dryer|pump|pest|mold|mould|damp|door\b|lock\b|handle\b|hinge|ceiling|crack|cracked|loose|falling|fell|odour|odor|smell|stench|ventilation|locker|shower|washroom|toilet|steam|\bac\b|app crash|login issue|website down/;
    const existingCategory = cleanString(effectiveBodyContext.category);
    const physicalOnlyCategoryNames = new Set([
      'Repair and Maintenance', 'Studio Amenities and Facilities', 'Facility & Equipment',
      'Operating Systems', 'Tech Issues', 'App & Digital',
    ]);
    const isPhysicalIssue = physicalIssueKeywords.test(rawLower) || physicalOnlyCategoryNames.has(existingCategory);

    // For physical issues: a short initial report is NOT a complete description.
    // Clear it so the AI is forced to ask for proper operational detail.
    // A "complete" description for a physical issue is multi-sentence (>80 chars with punctuation,
    // or >120 chars, or contains a newline indicating structured detail).
    if (isPhysicalIssue && cleanString(effectiveBodyContext.description) && !isFormSubmission) {
      const existingDesc = cleanString(effectiveBodyContext.description);
      const isBriefReport = existingDesc.length < 80 && !/[.!?]\s/.test(existingDesc) && !existingDesc.includes('\n');
      if (isBriefReport) {
        effectiveBodyContext.description = '';
      }
    }

    // For non-physical issues (or physical with no description yet), auto-populate from the
    // user's message if the context doesn't have one. This prevents the description field from
    // appearing as required when the user already stated their issue in text.
    if (!cleanString(effectiveBodyContext.description) && rawIssueText.length > 8 && !isFormSubmission) {
      // For physical issues: only auto-populate if the message is already detailed (>100 chars
      // with sentence structure), otherwise leave blank so the AI collects proper detail.
      const isDetailedReport = rawIssueText.length > 100 || (/[.!?]\s/.test(rawIssueText) && rawIssueText.length > 60);
      if (!isPhysicalIssue || isDetailedReport) {
        effectiveBodyContext.description = rawIssueText;
      }
    }

    const bodyWithEffectiveContext = { ...body, context: effectiveBodyContext };
    const aiResponse = await askAiForIntake(bodyWithEffectiveContext, instructions);

    if (aiResponse) {
      const aiContext = { ...effectiveBodyContext, ...(aiResponse.inferredContext || {}) };
      const guardedMissingFields = requiredFieldsForIssue(latestUserMessage, aiContext);

      // Filter the AI's proposed form: remove entity fields (member/class) that the
      // business-logic guard did not flag as required for this specific incident.
      const filteredAiForm = filterAiDetailFormFields(aiResponse.detailForm, guardedMissingFields);

      const needsMoreInfo = aiResponse.needsMoreInfo || filteredAiForm !== null || guardedMissingFields.length > 0;
      const aiTicket = needsMoreInfo ? null : aiResponse.ticket || fallbackDraft(messages, aiContext);
      return json({
        conversationId: body.conversationId || crypto.randomUUID(),
        promptProfile: `${promptProfile}:ai-dynamic`,
        needsMoreInfo,
        reply: needsMoreInfo && !filteredAiForm
          ? 'I need a few details before drafting this ticket. Please complete the form below.'
          : aiResponse.reply,
        detailForm: filteredAiForm || (guardedMissingFields.length > 0
          ? {
              title: 'Complete ticket intake details',
              description: 'Athena inferred the classification and needs these details before drafting.',
              fields: Array.from(new Set(guardedMissingFields)),
              submitLabel: 'Continue drafting ticket',
            }
          : null),
        ticket: aiTicket,
        suggestedChips: aiResponse.suggestedChips || [],
        inferredContext: aiResponse.inferredContext || {},
        missingFields: guardedMissingFields.length > 0 ? guardedMissingFields : aiResponse.missingFields || [],
        publishable: !needsMoreInfo && aiResponse.publishable === true,
        urgencyReason: aiResponse.urgencyReason || '',
      });
    }

    const inferredContext = inferContextFromText(latestUserMessage, effectiveBodyContext);
    const effectiveContext = { ...effectiveBodyContext, ...inferredContext };
    const missingFields = requiredFieldsForIssue(latestUserMessage, effectiveContext);
    if (missingFields.length > 0) {
      return json({
        conversationId: body.conversationId || crypto.randomUUID(),
        promptProfile: `${promptProfile}:fallback`,
        needsMoreInfo: true,
        reply: 'I need a few details before drafting this ticket. Please complete the form below.',
        detailForm: {
          title: 'Complete ticket intake details',
          description: 'The options use the Physique 57 master data lists so the ticket routes correctly.',
          fields: Array.from(new Set(missingFields)),
          submitLabel: 'Continue drafting ticket',
        },
        suggestedChips: [],
        inferredContext,
        missingFields,
        publishable: false,
        urgencyReason: inferredContext.priority
          ? `Fallback priority inferred as ${inferredContext.priority} from the report.`
          : '',
      });
    }

    const draft = fallbackDraft(messages, effectiveContext);
    const draftMissingFields = requiredFieldsForIssue(latestUserMessage, {
      ...effectiveContext,
      ...draft,
      category: draft.category,
      subCategory: draft.subCategory,
      studio: draft.studio,
      description: draft.description || (effectiveContext as Record<string, unknown>).description,
    });
    if (draftMissingFields.length > 0) {
      return json({
        conversationId: body.conversationId || crypto.randomUUID(),
        promptProfile: `${promptProfile}:incomplete`,
        needsMoreInfo: true,
        reply: 'Almost there — I need a couple more details before drafting this ticket.',
        detailForm: {
          title: 'Complete ticket intake details',
          description: 'Athena inferred the classification and needs these remaining details.',
          fields: Array.from(new Set(draftMissingFields)),
          submitLabel: 'Continue drafting ticket',
        },
        suggestedChips: [],
        inferredContext,
        missingFields: draftMissingFields,
        publishable: false,
        urgencyReason: inferredContext.priority
          ? `Fallback priority inferred as ${inferredContext.priority} from the report.`
          : '',
      });
    }
    return json({
      conversationId: body.conversationId || crypto.randomUUID(),
      promptProfile: `${promptProfile}:drafted`,
      needsMoreInfo: false,
      reply: 'I drafted the ticket below. Please review it before publishing.',
      ticket: draft,
      suggestedChips: [],
      inferredContext,
      missingFields: [],
      publishable: true,
      urgencyReason: inferredContext.priority
        ? `Fallback priority inferred as ${inferredContext.priority} from the report.`
        : '',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Ticket AI chat failed' }, 500);
  }
});
