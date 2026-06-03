
import React, { useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { AppProvider } from '@/contexts/AppContext';
import { bookMomenceSessionWithMembership } from '@/lib/momence-api';
import { postPaymentBookingRequestFromUrl } from '@/lib/momence-post-payment';

const Index: React.FC = () => {
  useEffect(() => {
    const request = postPaymentBookingRequestFromUrl(window.location.href);
    if (!request) return;

    const storageKey = `momence-post-payment-booking:${request.idempotencyKey}`;
    try {
      const existingStatus = window.sessionStorage.getItem(storageKey);
      if (existingStatus === 'pending' || existingStatus === 'done') return;
      window.sessionStorage.setItem(storageKey, 'pending');
    } catch {
      // Session storage is only a dedupe guard; booking should still run if it is unavailable.
    }

    bookMomenceSessionWithMembership(request)
      .then((result) => {
        try {
          window.sessionStorage.setItem(storageKey, 'done');
          if (result.sessionBookingId != null) {
            window.sessionStorage.setItem(`${storageKey}:sessionBookingId`, String(result.sessionBookingId));
          }
        } catch {
          // No-op.
        }
      })
      .catch((error) => {
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // No-op.
        }
        console.error('Momence post-payment booking failed', error);
      });
  }, []);

  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
};

export default Index;
