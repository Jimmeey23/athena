import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('momence-session-search edge function', () => {
  it('fetches member-facing sessions so booking rate fields are available', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/momence-session-search/index.ts'), 'utf8');

    expect(source).toContain('/member/host/sessions');
    expect(source).not.toContain('`${MOMENCE_BASE_URL}/host/sessions`');
  });
});
