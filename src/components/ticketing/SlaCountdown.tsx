import React, { useEffect, useMemo, useState } from 'react';
import { Clock, TimerReset } from 'lucide-react';

type SlaTone = 'breached' | 'urgent' | 'warning' | 'healthy' | 'closed' | 'unknown';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toneFor(diffMs: number, closed: boolean): SlaTone {
  if (closed) return 'closed';
  if (!Number.isFinite(diffMs)) return 'unknown';
  if (diffMs < 0) return 'breached';
  if (diffMs <= 60 * 60 * 1000) return 'urgent';
  if (diffMs <= 2 * 60 * 60 * 1000) return 'warning';
  return 'healthy';
}

const toneClass: Record<SlaTone, string> = {
  breached: 'border-red-200 bg-red-50 text-red-700 ring-red-100',
  urgent: 'border-amber-200 bg-amber-50 text-amber-700 ring-amber-100',
  warning: 'border-blue-200 bg-blue-50 text-blue-700 ring-blue-100',
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-100',
  closed: 'border-slate-200 bg-slate-50 text-slate-600 ring-slate-100',
  unknown: 'border-slate-200 bg-white text-slate-500 ring-slate-100',
};

export const SlaCountdown: React.FC<{
  slaDueAt?: string | null;
  status?: string;
  label?: string;
  compact?: boolean;
  className?: string;
}> = ({ slaDueAt, status, label = 'SLA countdown', compact = false, className = '' }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  const dueAt = slaDueAt ? new Date(slaDueAt).getTime() : Number.NaN;
  const closed = status === 'Resolved' || status === 'Closed';
  const diffMs = dueAt - now;
  const tone = toneFor(diffMs, closed);
  const dueLabel = useMemo(() => {
    if (!slaDueAt || Number.isNaN(dueAt)) return 'No SLA target';
    return new Date(slaDueAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }, [dueAt, slaDueAt]);
  const value = closed
    ? 'Closed'
    : tone === 'unknown'
      ? '--:--:--'
      : `${diffMs < 0 ? '+' : '-'}${formatDuration(diffMs)}`;
  const caption = closed
    ? 'SLA no longer counting'
    : diffMs < 0
      ? 'Past target'
      : 'Remaining';

  return (
    <div
      className={`inline-flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2 ring-4 ${toneClass[tone]} ${className}`}
      title={`${label}: ${caption}. Target ${dueLabel}`}
      aria-label={`${label}: ${caption} ${value}. Target ${dueLabel}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/75">
        {diffMs < 0 && !closed ? <TimerReset className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0">
        {!compact && <span className="block text-[9px] font-bold uppercase tracking-[0.16em] opacity-70">{caption}</span>}
        <span className={`${compact ? 'text-[11px]' : 'text-sm'} block font-mono font-bold tabular-nums`}>{value}</span>
      </span>
    </div>
  );
};
