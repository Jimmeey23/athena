// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketPreviewCard } from './TicketPreviewCard';

type DraftProp = React.ComponentProps<typeof TicketPreviewCard>['draft'];

describe('TicketPreviewCard', () => {
  it('renders AI drafts when the provider omits optional tags', () => {
    const draftWithoutTags = {
      title: 'Member reported billing concern',
      description: 'Member reported an unexpected package charge.',
      category: 'Billing',
      subCategory: 'Payment Issue',
      priority: 'Medium',
      studio: 'Bandra',
    } as unknown as DraftProp;

    expect(() => {
      render(
        <TicketPreviewCard
          draft={draftWithoutTags}
          onConfirm={vi.fn()}
          onEdit={vi.fn()}
        />
      );
    }).not.toThrow();

    expect(screen.getByText('Member reported billing concern')).toBeTruthy();
  });
});
