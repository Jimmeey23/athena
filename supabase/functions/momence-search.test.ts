import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('momence-search edge function allowlist', () => {
  it('allows host checkout endpoints needed to book sessions with purchased memberships', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/momence-search/index.ts'), 'utf8');

    expect(source).toContain('/^\\/host\\/checkout\\/compatible-memberships$/');
    expect(source).toContain('/^\\/host\\/checkout\\/prices$/');
    expect(source).toContain('/^\\/host\\/checkout$/');
  });
});
