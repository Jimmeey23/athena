import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('template form dialog layout', () => {
  it('overrides the shared dialog max width cap for template forms', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ticketing/ChatInterface.tsx'), 'utf8');
    const templateDialogMatch = source.match(/<DialogContent className="([^"]*z-\[100\][^"]*)">/);

    expect(templateDialogMatch?.[1]).toContain('!w-[min(1800px,calc(100vw-2rem))]');
    expect(templateDialogMatch?.[1]).toContain('!max-w-[min(1800px,calc(100vw-2rem))]');
  });
});
