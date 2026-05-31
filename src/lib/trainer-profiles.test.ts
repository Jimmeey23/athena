import { describe, expect, it } from 'vitest';
import {
  TRAINER_REVIEW_TEMPLATES,
  buildTrainerEvaluationTicket,
  buildTrainerProfilesFromReviews,
  loadTrainerProfiles,
  parseTrainerEvaluationText,
} from './trainer-profiles';
import { mapFilloutTrainingEvaluation } from './trainer-evaluation-core';
import { TRAINERS } from './ticketing-data';

const sampleReviewText = `
Average for 2023
Avg attendance Kemps 4.58

Client Feedback
Barre classes are promising and precise. Clients love the infectious energy but need a more commanding energy from the trainer.

Internal feedback
Classes are great but command in the room is an area that can be worked upon. More mindful hands on in class.

Focus points
1. Creative choreography sequencing 2. Increasing class avg. 3. Exercises to increase command

Goals
Certification complete by 2nd week of June'23
`;

describe('trainer profile evaluation engine', () => {
  it('loads every trainer profile even when no reviews are saved', () => {
    const profiles = loadTrainerProfiles();

    expect(profiles).toHaveLength(TRAINERS.length);
    expect(profiles.map((profile) => profile.trainer)).toContain(TRAINERS[0]);
    expect(profiles.every((profile) => profile.reviews.length === 0)).toBe(true);
  });

  it('keeps Barre and PowerCycle templates weighted to 100', () => {
    expect(TRAINER_REVIEW_TEMPLATES.Barre.reduce((sum, item) => sum + item.weightage, 0)).toBe(100);
    expect(TRAINER_REVIEW_TEMPLATES.PowerCycle.reduce((sum, item) => sum + item.weightage, 0)).toBe(100);
  });

  it('extracts structured trainer review content from pasted performance text', () => {
    const parsed = parseTrainerEvaluationText(sampleReviewText, 'Pranjali');

    expect(parsed.trainer).toBe('Pranjali');
    expect(parsed.template).toBe('Barre');
    expect(parsed.feedback).toContain('Barre classes are promising');
    expect(parsed.feedback).toContain('command in the room');
    expect(parsed.focusPoints).toContain('Creative choreography');
    expect(parsed.goals).toContain('Certification complete');
    expect(parsed.scores[0].score).toBeGreaterThan(0);
  });

  it('creates a populated trainer feedback ticket from structured evaluation data', () => {
    const parsed = parseTrainerEvaluationText(sampleReviewText, 'Pranjali');
    const ticket = buildTrainerEvaluationTicket(
      {
        ...parsed,
        studio: 'Kemps Corner',
        classType: 'Barre',
        reviewPeriod: '2023 review',
      },
      {
        ...parsed,
        id: 'review-1',
        createdAt: '2026-05-31T00:00:00.000Z',
        totalWeightage: 100,
        totalScore: 78,
        scorePercent: 78,
      }
    );

    expect(ticket.title).toContain('Pranjali');
    expect(ticket.category).toBe('Trainer Feedback');
    expect(ticket.subCategory).toBe('Knowledge and Competence');
    expect(ticket.priority).toBe('Medium');
    expect(ticket.trainer).toBe('Pranjali');
    expect(ticket.studio).toBe('Kemps Corner');
    expect(ticket.description).toContain('Focus points');
    expect(ticket.tags).toContain('trainer-profile');
  });

  it('maps Fillout training evaluation submissions into profile-ready trainer review records', () => {
    const mapped = mapFilloutTrainingEvaluation({
      formId: 'trainer-eval-form',
      submissionId: 'submission-001',
      submission: {
        questions: [
          { label: 'Instructor / Trainer Name', value: 'Pranjali Jain' },
          { label: 'Studio Location', value: 'Kwality House, Kemps Corner' },
          { label: 'Class Format', value: 'Studio Barre 57' },
          { label: 'Review Period', value: 'May 2026' },
          { label: 'Client feedback', value: 'Members appreciate her precise cueing and warm room presence.' },
          { label: 'Energy and vocals score', value: '7' },
          { label: 'Musicality score', value: '6.5' },
          { label: 'Focus points', value: 'Increase command during transitions.' },
          { label: 'Goals', value: 'Own the next hosted class warm-up.' },
        ],
      },
    }, new Date('2026-05-31T00:00:00.000Z'));

    expect(mapped.sourceRef).toBe('fillout:trainer-eval-form:submission-001');
    expect(mapped.input.trainer).toBe('Pranjali Jain');
    expect(mapped.input.template).toBe('Barre');
    expect(mapped.input.studio).toBe('Kwality House, Kemps Corner');
    expect(mapped.input.classType).toBe('Studio Barre 57');
    expect(mapped.record.source).toBe('fillout');
    expect(mapped.record.sourceRef).toBe(mapped.sourceRef);
    expect(mapped.record.scorePercent).toBeGreaterThan(0);
    expect(mapped.record.feedback).toContain('precise cueing');
  });

  it('maps Fillout numbered answer keys through question definitions', () => {
    const mapped = mapFilloutTrainingEvaluation({
      formId: 'ceKTqZnemVus',
      submissionId: '905879176',
      submission: {
        questions: [
          { id: 'trainer_name', name: 'Trainer Name', type: 'ShortAnswer' },
          { id: 'center', name: 'Center', type: 'Dropdown' },
          { id: '3', name: '❖ Studio setup and vibe check: [A/C, sound check, lights, mic check, sound on]', type: 'NumberInput' },
          { id: '10', name: '❖ Client connection | USP integration | Motivation (WHYs)', type: 'NumberInput' },
          { id: '15', name: '❖ Overall energy and Vocals [Physical Energy and Vocal Enunciation/Ebbs flows]', type: 'NumberInput' },
          { id: '7', name: '❖ Musical arc and musicality (Playlist and use of music in choreography)', type: 'NumberInput' },
          { id: 'comments', name: 'Additional Comments', type: 'LongAnswer' },
        ],
        answers: {
          trainer_name: 'Pranjali Jain',
          center: 'Kwality House, Kemps Corner',
          3: 8,
          10: 7,
          15: 6.5,
          7: 7.5,
          comments: 'Strong class presence. Needs sharper post-class sales conversion.',
        },
      },
    }, new Date('2026-05-31T17:38:01.620Z'));

    expect(mapped.sourceRef).toBe('fillout:ceKTqZnemVus:905879176');
    expect(mapped.input.trainer).toBe('Pranjali Jain');
    expect(mapped.input.studio).toBe('Kwality House, Kemps Corner');
    expect(mapped.record.scorePercent).toBeGreaterThan(0);
    expect(mapped.record.rawText).toContain('Overall energy and Vocals');
    expect(mapped.record.rawText).not.toContain('name: Trainer Name');
    expect(mapped.record.feedback).toContain('post class sales');
  });

  it('hydrates trainer profiles from review records while preserving trainers with no feedback', () => {
    const mapped = mapFilloutTrainingEvaluation({
      formId: 'trainer-eval-form',
      submissionId: 'submission-002',
      submission: {
        questions: [
          { label: 'Trainer', value: 'Pranjali Jain' },
          { label: 'Class Format', value: 'Studio PowerCycle' },
          { label: 'Ride programming and sequencing score', value: '6' },
          { label: 'Feedback', value: 'PowerCycle coaching has a stronger rider connection.' },
        ],
      },
    }, new Date('2026-05-31T00:00:00.000Z'));

    const profiles = buildTrainerProfilesFromReviews([mapped.record]);
    const reviewedProfile = profiles.find((profile) => profile.trainer === 'Pranjali Jain');
    const unreviewedProfile = profiles.find((profile) => profile.trainer === TRAINERS.find((trainer) => trainer !== 'Pranjali Jain'));

    expect(profiles).toHaveLength(TRAINERS.length);
    expect(reviewedProfile?.reviews).toHaveLength(1);
    expect(reviewedProfile?.reviews[0].source).toBe('fillout');
    expect(unreviewedProfile?.reviews).toHaveLength(0);
  });
});
