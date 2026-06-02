import { describe, expect, it } from 'vitest';
import { appSidebarClassName } from './app-layout-sidebar';

describe('AppLayout sidebar layout', () => {
  it('allows vertical scrolling while preserving the collapsed and expanded widths', () => {
    expect(appSidebarClassName(false)).toContain('overflow-y-auto');
    expect(appSidebarClassName(false)).toContain('overflow-x-hidden');
    expect(appSidebarClassName(false)).toContain('w-[72px]');

    expect(appSidebarClassName(true)).toContain('overflow-y-auto');
    expect(appSidebarClassName(true)).toContain('w-56');
  });
});
