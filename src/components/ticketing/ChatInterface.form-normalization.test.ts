import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('chat detail form normalization', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/ticketing/ChatInterface.tsx'), 'utf8');

  it('keeps assistant message rendering outside the detail form container', () => {
    expect(source).toContain('{renderContent(previewContent)}');
    expect(source).toContain('{message.detailForm && !message.ticket && (');
    expect(source.indexOf('{renderContent(previewContent)}')).toBeLessThan(source.indexOf('{message.detailForm && !message.ticket && ('));
  });

  it('prefers app constants over AI-provided options for known detail fields', () => {
    expect(source).toContain('const standardOptions = base.options?.length ? base.options : null');
    expect(source).toContain('options: standardOptions || aiOptions || base.options');
  });
});
