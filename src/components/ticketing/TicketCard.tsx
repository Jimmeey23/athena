import React from 'react';
import { Ticket, PRIORITY_SLA, getEscalationTarget, isRecordOnlyTicket } from '@/lib/ticketing-data';
import { MapPin, Tag, AlertCircle, CheckCircle2, Circle, Loader2, ArrowUpRight, ShieldCheck, Clock3 } from 'lucide-react';
import { SlaCountdown } from './SlaCountdown';

const STATUS_ICON: Record<string, React.ReactNode> = {
  'New': <Circle className="w-3.5 h-3.5" />,
  'In Progress': <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  'Awaiting Member': <AlertCircle className="w-3.5 h-3.5" />,
  'Resolved': <CheckCircle2 className="w-3.5 h-3.5" />,
  'Closed': <CheckCircle2 className="w-3.5 h-3.5" />,
};

const STATUS_COLOR: Record<string, string> = {
  'New': 'bg-stone-50 text-stone-700 border-stone-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  'In Progress': 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  'Awaiting Member': 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900',
  'Resolved': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  'Closed': 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-stone-700 to-stone-950',
  'from-sky-700 to-stone-950',
  'from-emerald-700 to-stone-950',
  'from-indigo-700 to-stone-950',
  'from-amber-700 to-stone-950',
  'from-zinc-600 to-neutral-950',
];

function gradientFor(name: string) {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

const PRIORITY_BORDER_COLOR: Record<Ticket['priority'], string> = {
  Critical: 'border-l-red-600 hover:border-l-red-700 focus-visible:ring-red-100',
  High: 'border-l-amber-500 hover:border-l-amber-600 focus-visible:ring-amber-100',
  Medium: 'border-l-sky-400 hover:border-l-sky-600 focus-visible:ring-sky-100',
  Low: 'border-l-emerald-400 hover:border-l-emerald-600 focus-visible:ring-emerald-100',
};

interface Props {
  ticket: Ticket;
  onClick?: () => void;
}

export const TicketCard: React.FC<Props> = ({ ticket, onClick }) => {
  const priorityMeta = PRIORITY_SLA[ticket.priority];
  const primaryPerson = ticket.memberName || ticket.reportedBy || 'No member linked';
  const primaryPersonLabel = ticket.memberName ? 'Member' : ticket.reportedBy ? 'Reported by' : 'Member context';
  const escalation = getEscalationTarget(ticket.assignedTo);
  const created = new Date(ticket.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  return (
    <button
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl border-y-0 border-r-0 border-l-4 bg-white/96 p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.07)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_26px_80px_rgba(15,23,42,0.14)] focus-visible:outline-none focus-visible:ring-4 ${PRIORITY_BORDER_COLOR[ticket.priority]}`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase text-white ${priorityMeta.color}`}>
            <AlertCircle className="w-3 h-3" />
            {ticket.priority}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${STATUS_COLOR[ticket.status]}`}>
            {STATUS_ICON[ticket.status]}
            {ticket.status}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-mono text-stone-500">{ticket.id}</span>
      </div>

      <h3 className="mb-1 line-clamp-1 text-base font-semibold leading-snug text-stone-950 transition group-hover:line-clamp-2 group-hover:text-blue-700">
        {ticket.title}
      </h3>

      <div className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs text-stone-500">
        <span className="truncate">{primaryPerson}</span>
        <span className="shrink-0">{created}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
          {ticket.category}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] text-stone-700">
          {ticket.subCategory}
        </span>
      </div>

      <div className="grid max-h-0 gap-2 overflow-hidden rounded-2xl border-0 border-slate-200 bg-slate-50/70 p-0 text-xs text-stone-600 opacity-0 shadow-inner shadow-stone-200/60 transition-all duration-300 group-hover:mt-3 group-hover:max-h-[520px] group-hover:border group-hover:p-3 group-hover:opacity-100 group-focus-visible:mt-3 group-focus-visible:max-h-[520px] group-focus-visible:border group-focus-visible:p-3 group-focus-visible:opacity-100">
        <DescriptionPreview text={ticket.description} />
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3 flex-shrink-0 text-blue-600" />
          <span className="truncate">{ticket.studio}</span>
        </div>
        {(ticket.trainer || ticket.classType || ticket.classDateTime) && (
          <div className="flex items-center gap-1.5">
            <Clock3 className="w-3 h-3 flex-shrink-0 text-blue-600" />
            <span className="truncate">
              {[ticket.trainer, ticket.classType, ticket.classDateTime ? new Date(ticket.classDateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <SlaCountdown slaDueAt={ticket.slaDueAt} status={ticket.status} noSla={isRecordOnlyTicket(ticket)} compact className="w-full ring-0" />
          <div className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white/80 px-2 py-1.5 font-medium text-stone-700">
            <ShieldCheck className="w-3 h-3 flex-shrink-0 text-blue-600" />
            <span className="truncate">{ticket.team}</span>
          </div>
        </div>
      </div>

      <div className="grid max-h-0 gap-2 overflow-hidden border-t-0 border-stone-100 opacity-0 transition-all duration-300 group-hover:mt-3 group-hover:max-h-[260px] group-hover:border-t group-hover:pt-3 group-hover:opacity-100 group-focus-visible:mt-3 group-focus-visible:max-h-[260px] group-focus-visible:border-t group-focus-visible:pt-3 group-focus-visible:opacity-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradientFor(primaryPerson)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
            {initials(primaryPerson)}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-stone-900 truncate">{primaryPerson}</div>
            <div className="text-[10px] text-stone-500 truncate">{primaryPersonLabel} · Owner: {ticket.assignedTo}</div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2">
          <div className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Next escalation
            <div className="mt-0.5 truncate text-xs normal-case tracking-normal text-slate-700">{escalation}</div>
          </div>
          <div className="flex items-center gap-2 text-stone-400">
            {ticket.tags.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px]">
                <Tag className="w-3 h-3" />
                {ticket.tags.length}
              </span>
            )}
            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-blue-600" />
          </div>
        </div>
      </div>
    </button>
  );
};

const DescriptionPreview: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line)).slice(0, 3);
  if (bulletLines.length > 0) {
    return (
      <ul className="mb-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-stone-600">
        {bulletLines.map((line, index) => (
          <li key={index} className="line-clamp-1">{line.replace(/^[-*]\s+/, '')}</li>
        ))}
      </ul>
    );
  }

  return <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-stone-600">{text}</p>;
};
