import { describe, expect, it } from 'vitest';
import { CONTEXT_TEMPLATES, buildContextTemplateText, buildHostedClassFeedbackText } from './intake-templates';

describe('context intake templates', () => {
  it('includes ready-to-use templates for common studio scenarios', () => {
    const labels = CONTEXT_TEMPLATES.map((template) => template.label);

    expect(labels).toEqual(expect.arrayContaining([
      'Hosted class feedback',
      'Instructor late for class',
      'Class entry denied due to late arrival',
      'Trainer class assessment',
    ]));
  });

  it('builds member-voice prompts with routing context', () => {
    const text = buildContextTemplateText(CONTEXT_TEMPLATES[0]);

    expect(text).toContain('Intake route: Feedback');
    expect(text).toContain('Category: Hosted Class & Partnerships');
    expect(text).toContain('Member/guest verbatim feedback:');
    expect(text).toContain('Follow-up preference indicated:');
  });

  it('defines structured fields for non-hosted operational templates', () => {
    const instructorLate = CONTEXT_TEMPLATES.find((template) => template.id === 'instructor-late-for-class');

    expect(instructorLate?.fields?.map((field) => field.id)).toEqual([
      'sessionContext',
      'instructorName',
      'scheduledStartTime',
      'actualStartTime',
      'delayMinutes',
      'memberFeedback',
      'reportedImpact',
      'recoveryAction',
      'memberResponse',
      'clientsAffected',
      'followUpNeeded',
    ]);
    expect(instructorLate?.fields?.find((field) => field.id === 'delayMinutes')?.type).toBe('number');
    expect(instructorLate?.fields?.find((field) => field.id === 'memberFeedback')?.type).toBe('textarea');
  });

  it('builds hosted-class feedback from session, attendee, host, and late-comer inputs', () => {
    const text = buildHostedClassFeedbackText({
      partnerName: 'Wellness Collective',
      session: {
        id: 'session-123',
        classType: 'Studio Hosted Class',
        trainer: 'Anisha Shah',
        studio: 'Supreme HQ, Bandra',
        startsAt: '2026-06-01T10:00:00+05:30',
      },
      attendees: [
        {
          bookingId: 'booking-1',
          memberName: 'Asha Rao',
          memberContact: 'asha@example.com',
          status: 'Interested in continuing',
          comment: 'Member asked for the newcomer package.',
        },
      ],
      classFeedback: 'Guests liked the Method introduction.',
      hostFeedback: 'Host audience was aligned with P57 positioning.',
      lateComerFeedback: 'Two guests arrived after warm-up.',
      otherFeedback: 'Need more post-class consultation time.',
      followUpPlan: 'WhatsApp all interested guests by tomorrow.',
    });

    expect(text).toContain('Momence session ID: session-123');
    expect(text).toContain('Partner / host name: Wellness Collective');
    expect(text).toContain('Asha Rao');
    expect(text).toContain('Status: Interested in continuing');
    expect(text).toContain('Late-comer feedback: Two guests arrived after warm-up.');
    expect(text).toContain('Follow-up plan: WhatsApp all interested guests by tomorrow.');
  });
});
