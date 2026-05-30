import { describe, expect, it } from 'vitest';
import { visibleAppTabValues } from './app-access';

describe('visibleAppTabValues', () => {
  it('shows ticket workspaces but hides admin analytics workspaces from support users', () => {
    expect(visibleAppTabValues('support')).toEqual([
      'chat',
      'queue',
      'notifications',
      'tickets',
    ]);
  });

  it('shows every workspace to admin users', () => {
    expect(visibleAppTabValues('admin')).toEqual([
      'chat',
      'queue',
      'notifications',
      'tickets',
      'reports',
      'insights',
      'momence',
      'settings',
    ]);
  });
});
