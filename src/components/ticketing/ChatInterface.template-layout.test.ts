import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('template form dialog layout', () => {
  it('overrides the shared dialog max width cap for template forms', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ticketing/ChatInterface.tsx'), 'utf8');
    const templateDialogMatch = source.match(/<DialogContent className="([^"]*z-\[100\][^"]*)">/);

    expect(templateDialogMatch?.[1]).toContain('!w-[min(1440px,calc(100vw-2rem))]');
    expect(templateDialogMatch?.[1]).toContain('!max-w-[min(1440px,calc(100vw-2rem))]');
  });

  it('uses a short warm personalized first message', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ticketing/ChatInterface.tsx'), 'utf8');

    expect(source).toContain('`Hi ${firstName}, happy to help. What should we log today?`');
    expect(source).toContain('"Hi, happy to help. What should we log today?"');
    expect(source).not.toContain('your ticket intake assistant.\\n\\nTell me what happened');
  });

  it('uses a dropdown multi-select for Momence sessions instead of a search input', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ticketing/ChatInterface.tsx'), 'utf8');

    expect(source).toContain('const MomenceSessionDropdownField: React.FC');
    expect(source).toContain('<MultiSelectDropdown');
    expect(source).not.toContain('placeholder="Search Momence sessions by class, instructor, studio, or date"');
  });

  it('passes private Momence session type explicitly from the hosted class template', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ticketing/ChatInterface.tsx'), 'utf8');

    expect(source).toContain("const HOSTED_CLASS_SESSION_TYPES = ['private']");
    expect(source).toContain('sessionTypes={HOSTED_CLASS_SESSION_TYPES}');
    expect(source).toContain("searchMomenceSessions('', { types: sessionTypes })");
    expect(source).toContain('momenceSessionDropdownCacheKey(sessionTypes)');
  });

  it('keeps the hosted class form arranged as a polished operational template', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ticketing/ChatInterface.tsx'), 'utf8');

    expect(source).toContain('Hosted template progress');
    expect(source).toContain('Selected session');
    expect(source).toContain('Booking rate');
    expect(source).toContain('Partnership context');
    expect(source).toContain('Feedback and follow-up');
    expect(source).toContain('grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]');
    expect(source).toContain('Session required');
    expect(source).toContain('Member voice required');
  });
});
