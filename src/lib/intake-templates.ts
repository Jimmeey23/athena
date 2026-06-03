export type ContextTemplateFieldType = 'text' | 'textarea' | 'select' | 'datetime-local' | 'number';

export interface ContextTemplateField {
  id: string;
  label: string;
  type: ContextTemplateFieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ContextTemplate {
  id: string;
  label: string;
  description: string;
  intakeRoute: string;
  category: string;
  subCategory: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  prompts: string[];
  fields?: ContextTemplateField[];
}

export interface HostedClassSessionSummary {
  id: string;
  classType: string;
  trainer?: string;
  studio?: string;
  startsAt?: string;
  bookingRateLabel?: string;
}

export interface HostedClassAttendeeFeedback {
  bookingId: string;
  memberName: string;
  memberContact?: string;
  status: string;
  comment?: string;
  followUpPreference?: string;
  conversionSignal?: string;
}

export interface HostedClassFeedbackInput {
  partnerName?: string;
  partnerType?: string;
  acquisitionSource?: string;
  audienceFit?: string;
  session: HostedClassSessionSummary;
  attendees: HostedClassAttendeeFeedback[];
  classFeedback: string;
  hostFeedback?: string;
  lateComerFeedback?: string;
  otherFeedback?: string;
  conversionSummary?: string;
  socialAmplification?: string;
  followUpPlan?: string;
}

export const CONTEXT_TEMPLATES: ContextTemplate[] = [
  {
    id: 'hosted-class-feedback',
    label: 'Hosted class feedback',
    description: 'Partner audience insight, attendee response, and conversion follow-up.',
    intakeRoute: 'Feedback',
    category: 'Hosted Class & Partnerships',
    subCategory: 'Hosted Class Feedback',
    priority: 'Medium',
    prompts: [
      'Partner / host name:',
      'Signature Partnership Experience date and studio space:',
      'Member/guest verbatim feedback:',
      'Stated reason for attending:',
      'Interest in continuing the Method:',
      'Prospect quality or conversion signal mentioned:',
      'Social/content opportunity noted:',
      'Follow-up preference indicated:',
    ],
  },
  {
    id: 'instructor-late-for-class',
    label: 'Instructor late for class',
    description: 'Member-reported class delay, instructor punctuality concern, and recovery action.',
    intakeRoute: 'Complaint',
    category: 'Trainer Feedback',
    subCategory: 'Trainer Punctuality Issues',
    priority: 'High',
    prompts: [
      'Studio session and scheduled start time:',
      'Instructor name:',
      'Actual start time / delay duration:',
      'Member verbatim concern:',
      'Impact member reported on their practice experience:',
      'Recovery action offered:',
      'Member response to resolution:',
      'Other community members affected:',
    ],
    fields: [
      { id: 'sessionContext', label: 'Studio session', type: 'text', required: true, placeholder: 'Class name, studio, and date/time' },
      { id: 'instructorName', label: 'Instructor name', type: 'text', required: true },
      { id: 'scheduledStartTime', label: 'Scheduled start time', type: 'datetime-local', required: true },
      { id: 'actualStartTime', label: 'Actual start time', type: 'datetime-local', required: true },
      { id: 'delayMinutes', label: 'Delay in minutes', type: 'number', required: true },
      { id: 'memberFeedback', label: 'Member verbatim concern', type: 'textarea', required: true },
      { id: 'reportedImpact', label: 'Member-reported impact on practice', type: 'textarea', required: true },
      { id: 'recoveryAction', label: 'Recovery action offered', type: 'textarea', required: true },
      { id: 'memberResponse', label: 'Member response to resolution', type: 'select', required: true, options: ['Member Satisfied with Resolution', 'Member Accepted but Not Fully Satisfied', 'Member Requested Escalation', 'Member Declined Offered Solution', 'Follow-up Pending'] },
      { id: 'clientsAffected', label: 'Community members affected', type: 'select', required: true, options: ['Single member', '2-5 members', '6+ members', 'Full class', 'Unknown'] },
      { id: 'followUpNeeded', label: 'Follow-up needed', type: 'select', required: true, options: ['No follow-up needed', 'Instructor follow-up', 'Studio manager follow-up', 'Client success follow-up', 'Training team review'] },
    ],
  },
  {
    id: 'late-arrival-entry-denied',
    label: 'Class entry denied due to late arrival',
    description: 'Late-arrival policy concern, front-desk handling, and requested resolution.',
    intakeRoute: 'Complaint',
    category: 'Booking & Schedule',
    subCategory: 'Late Arrival Policy',
    priority: 'Medium',
    prompts: [
      'Studio session and booking time:',
      'Member arrival time:',
      'Policy explanation given to member:',
      'Member verbatim feedback / concern:',
      'Member stated reason for late arrival:',
      'Alternative solution offered:',
      'Member response to alternative:',
      'Requested resolution or follow-up:',
    ],
    fields: [
      { id: 'sessionContext', label: 'Booked studio session', type: 'text', required: true, placeholder: 'Class name, studio, and date/time' },
      { id: 'memberArrivalTime', label: 'Member arrival time', type: 'datetime-local', required: true },
      { id: 'policyExplanation', label: 'Policy explanation given', type: 'textarea', required: true },
      { id: 'memberFeedback', label: 'Member verbatim feedback / concern', type: 'textarea', required: true },
      { id: 'lateArrivalReason', label: 'Member stated reason for late arrival', type: 'textarea' },
      { id: 'alternativeSolution', label: 'Alternative solution offered', type: 'textarea', required: true },
      { id: 'memberResponse', label: 'Member response to alternative', type: 'select', required: true, options: ['Member Satisfied with Resolution', 'Member Accepted but Not Fully Satisfied', 'Member Requested Escalation', 'Member Declined Offered Solution', 'Follow-up Pending'] },
      { id: 'requestedResolution', label: 'Requested resolution or follow-up', type: 'textarea' },
    ],
  },
  {
    id: 'trainer-class-assessment',
    label: 'Trainer class assessment',
    description: 'Structured internal assessment for instructor delivery and coaching profile.',
    intakeRoute: 'Internal Reporting',
    category: 'Trainer Feedback',
    subCategory: 'Knowledge and Competence',
    priority: 'Low',
    prompts: [
      'Instructor assessed:',
      'Studio session observed:',
      'Template type: Barre / PowerCycle',
      'Attendance and retention notes:',
      'Member voice or class feedback heard:',
      'Method delivery strengths:',
      'Coaching focus areas:',
      'Recommended development action:',
    ],
    fields: [
      { id: 'instructorName', label: 'Instructor assessed', type: 'text', required: true },
      { id: 'sessionContext', label: 'Studio session observed', type: 'text', required: true },
      { id: 'templateType', label: 'Assessment template', type: 'select', required: true, options: ['Barre', 'PowerCycle'] },
      { id: 'attendanceNotes', label: 'Attendance and retention notes', type: 'textarea', required: true },
      { id: 'memberVoice', label: 'Member voice or class feedback heard', type: 'textarea' },
      { id: 'methodStrengths', label: 'Method delivery strengths', type: 'textarea', required: true },
      { id: 'coachingFocus', label: 'Coaching focus areas', type: 'textarea', required: true },
      { id: 'developmentAction', label: 'Recommended development action', type: 'textarea', required: true },
    ],
  },
  {
    id: 'member-class-experience-feedback',
    label: 'Member class experience feedback',
    description: 'General member voice after a studio session.',
    intakeRoute: 'Feedback',
    category: 'Class Experience',
    subCategory: 'Class Format Satisfaction',
    priority: 'Medium',
    prompts: [
      'Studio session attended:',
      'Member verbatim feedback:',
      'What part of the practice did member mention:',
      'Instructor / music / environment feedback:',
      'Member-indicated satisfaction or concern:',
      'Requested change or follow-up:',
    ],
    fields: [
      { id: 'sessionContext', label: 'Studio session attended', type: 'text', required: true },
      { id: 'memberFeedback', label: 'Member verbatim feedback', type: 'textarea', required: true },
      { id: 'practiceElement', label: 'Practice element mentioned', type: 'select', required: true, options: ['Class format', 'Instructor', 'Music / audio', 'Pacing', 'Intensity', 'Modifications', 'Studio environment', 'Other'] },
      { id: 'sessionFeedback', label: 'Instructor / music / environment feedback', type: 'textarea' },
      { id: 'memberSentiment', label: 'Member-indicated sentiment', type: 'select', required: true, options: ['Member Expressed Satisfaction', 'Member Expressed Neutral/Mixed Feelings', 'Member Expressed Dissatisfaction', 'Member Expressed Frustration/Anger', 'Member Expressed Delight/Enthusiasm'] },
      { id: 'requestedChange', label: 'Requested change or follow-up', type: 'textarea' },
    ],
  },
  {
    id: 'studio-environment-feedback',
    label: 'Studio environment feedback',
    description: 'Member-reported ambiance, cleanliness, amenities, or practice-space issue.',
    intakeRoute: 'Feedback',
    category: 'Studio Amenities and Facilities',
    subCategory: 'Cleanliness and Hygiene',
    priority: 'Medium',
    prompts: [
      'Studio space / area mentioned:',
      'Member verbatim feedback:',
      'Environmental element raised:',
      'Reported impact on member journey:',
      'Immediate action taken:',
      'Follow-up preference indicated:',
    ],
    fields: [
      { id: 'studioArea', label: 'Studio space / area mentioned', type: 'text', required: true },
      { id: 'memberFeedback', label: 'Member verbatim feedback', type: 'textarea', required: true },
      { id: 'environmentElement', label: 'Environmental element raised', type: 'select', required: true, options: ['Temperature', 'Lighting', 'Sound / music volume', 'Cleanliness', 'Odour / aroma', 'Amenities', 'Locker / shower area', 'Waiting area', 'Other'] },
      { id: 'reportedImpact', label: 'Reported impact on member journey', type: 'textarea', required: true },
      { id: 'immediateAction', label: 'Immediate action taken', type: 'textarea' },
      { id: 'followUpPreference', label: 'Follow-up preference indicated', type: 'select', options: ['Phone Call', 'Email', 'WhatsApp', 'In-Person (Next Visit)', 'No Follow-up Needed', 'Member Will Reach Out'] },
    ],
  },
];

export function buildContextTemplateText(template: ContextTemplate, values: Record<string, string> = {}): string {
  const fields = template.fields?.length
    ? template.fields.map((field) => `${field.label}: ${values[field.id] || ''}`.trimEnd())
    : template.prompts.map((prompt) => `${prompt} ${values[prompt] || ''}`.trimEnd());

  return [
    `Intake route: ${template.intakeRoute}`,
    `Category: ${template.category}`,
    `Sub-category: ${template.subCategory}`,
    `Priority: ${template.priority}`,
    '',
    ...fields,
  ].join('\n');
}

export function buildHostedClassFeedbackText(input: HostedClassFeedbackInput): string {
  const attendeeLines = input.attendees.length
    ? input.attendees.map((attendee, index) => [
        `${index + 1}. ${attendee.memberName}`,
        attendee.memberContact ? `Contact: ${attendee.memberContact}` : '',
        attendee.status ? `Status: ${attendee.status}` : '',
        attendee.followUpPreference ? `Follow-up preference: ${attendee.followUpPreference}` : '',
        attendee.conversionSignal ? `Conversion signal: ${attendee.conversionSignal}` : '',
        attendee.comment ? `Comment: ${attendee.comment}` : '',
      ].filter(Boolean).join(' | '))
    : ['No attendee-level feedback captured.'];

  return [
    'Intake route: Feedback',
    'Category: Hosted Class & Partnerships',
    'Sub-category: Hosted Class Feedback',
    'Priority: Medium',
    '',
    `Momence session ID: ${input.session.id}`,
    `Signature Partnership Experience: ${input.session.classType}`,
    input.session.startsAt ? `Session date/time: ${input.session.startsAt}` : '',
    input.session.studio ? `Studio space: ${input.session.studio}` : '',
    input.session.trainer ? `Instructor: ${input.session.trainer}` : '',
    input.session.bookingRateLabel ? `Booking rate: ${input.session.bookingRateLabel}` : '',
    input.partnerName ? `Partner / host name: ${input.partnerName}` : '',
    input.partnerType ? `Partner type: ${input.partnerType}` : '',
    input.acquisitionSource ? `Attendance source: ${input.acquisitionSource}` : '',
    input.audienceFit ? `Audience alignment: ${input.audienceFit}` : '',
    '',
    'Attendee intelligence:',
    ...attendeeLines,
    '',
    `Class feedback: ${input.classFeedback}`,
    input.hostFeedback ? `Host feedback: ${input.hostFeedback}` : '',
    input.lateComerFeedback ? `Late-comer feedback: ${input.lateComerFeedback}` : '',
    input.conversionSummary ? `Conversion summary: ${input.conversionSummary}` : '',
    input.socialAmplification ? `Social/content amplification: ${input.socialAmplification}` : '',
    input.otherFeedback ? `Other feedback: ${input.otherFeedback}` : '',
    input.followUpPlan ? `Follow-up plan: ${input.followUpPlan}` : '',
  ].filter((line) => line !== '').join('\n');
}
