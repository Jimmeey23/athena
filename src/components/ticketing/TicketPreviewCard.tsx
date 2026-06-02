import React, { useState } from 'react';
import { CATEGORIES, PRIORITY_SLA, STUDIOS, Ticket } from '@/lib/ticketing-data';
import { Sparkles, Check, Pencil, MapPin, User, Calendar, Tag, Clock, ShieldCheck, AlertTriangle, Brain, Route, Layers3, Loader2 } from 'lucide-react';
import { SlaCountdown } from './SlaCountdown';
import { TicketReviewInsights } from '@/lib/ticket-review';

interface DraftTicket {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  assignedTo?: string | null;
  department?: string | null;
  tags: string[];
  sentiment?: string;
  conversationSummary?: string;
}

interface Props {
  draft: DraftTicket;
  onConfirm: () => void;
  onEdit: () => void;
  onDiscard?: () => void;
  onSaveEdit?: (draft: DraftTicket) => void;
  confirmed?: boolean;
  ticketId?: string;
  confirmedTicket?: Pick<Ticket, 'slaDueAt' | 'status'>;
  publishing?: boolean;
  reviewInsights?: TicketReviewInsights;
  momenceLoading?: boolean;
  momenceError?: string | null;
}

export const TicketPreviewCard: React.FC<Props> = ({ draft, onConfirm, onEdit, onDiscard, onSaveEdit, confirmed, ticketId, confirmedTicket, publishing = false, reviewInsights, momenceLoading = false, momenceError }) => {
  const priorityMeta = PRIORITY_SLA[draft.priority];
  const slaHours = PRIORITY_SLA[draft.priority]?.hours ?? PRIORITY_SLA.Medium.hours;
  const tags = Array.isArray(draft.tags) ? draft.tags : [];
  const [editing, setEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState<DraftTicket>(draft);

  React.useEffect(() => {
    setEditedDraft(draft);
  }, [draft]);

  const updateEditedDraft = (field: keyof DraftTicket, value: string) => {
    setEditedDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="relative my-3 overflow-hidden rounded-3xl border border-slate-200 bg-white/96 p-5 shadow-[0_26px_80px_rgba(15,23,42,0.14)] backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1 bg-blue-600" />
      <div className="mb-3 flex items-center justify-between gap-3 pt-1">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
          <Sparkles className="h-3 w-3" />
          Athena draft
        </div>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase text-white ${priorityMeta.color}`}>
          {draft.priority} priority
        </span>
      </div>

      <div className="mb-3">
        {editing ? (
          <input
            value={editedDraft.title}
            onChange={(event) => updateEditedDraft('title', event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-stone-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
        ) : (
          <h4 className="text-lg font-semibold leading-snug text-stone-950">{draft.title}</h4>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
          <span>{draft.category}</span>
          <span className="text-blue-600">/</span>
          <span>{draft.subCategory}</span>
          {draft.sentiment && (
            <>
              <span className="text-blue-600">/</span>
              <span>{draft.sentiment}</span>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mb-4 space-y-3">
          <textarea
            value={editedDraft.description}
            onChange={(event) => updateEditedDraft('description', event.target.value)}
            rows={8}
            className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-stone-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <EditSelect
              label="Priority"
              value={editedDraft.priority}
              options={Object.keys(PRIORITY_SLA)}
              onChange={(value) => updateEditedDraft('priority', value as DraftTicket['priority'])}
            />
            <EditSelect
              label="Category"
              value={editedDraft.category}
              options={Object.keys(CATEGORIES)}
              onChange={(value) => {
                setEditedDraft((current) => ({
                  ...current,
                  category: value,
                  subCategory: CATEGORIES[value]?.includes(current.subCategory) ? current.subCategory : CATEGORIES[value]?.[0] || 'Other',
                }));
              }}
            />
            <EditSelect
              label="Subcategory"
              value={editedDraft.subCategory}
              options={CATEGORIES[editedDraft.category] || []}
              onChange={(value) => updateEditedDraft('subCategory', value)}
            />
            <EditSelect
              label="Studio"
              value={editedDraft.studio}
              options={STUDIOS}
              onChange={(value) => updateEditedDraft('studio', value)}
            />
            <EditInput label="Instructor" value={editedDraft.trainer || ''} onChange={(value) => updateEditedDraft('trainer', value)} />
            <EditInput label="Class / Session" value={editedDraft.classType || ''} onChange={(value) => updateEditedDraft('classType', value)} />
            <EditInput label="Session time" type="datetime-local" value={editedDraft.classDateTime || ''} onChange={(value) => updateEditedDraft('classDateTime', value)} />
            <EditInput label="Member" value={editedDraft.memberName || ''} onChange={(value) => updateEditedDraft('memberName', value)} />
            <EditInput label="Member contact" value={editedDraft.memberContact || ''} onChange={(value) => updateEditedDraft('memberContact', value)} />
            <EditInput label="Documented by" value={editedDraft.reportedBy || ''} onChange={(value) => updateEditedDraft('reportedBy', value)} />
            <EditInput label="Owner" value={editedDraft.assignedTo || ''} onChange={(value) => updateEditedDraft('assignedTo', value)} />
            <EditInput label="Department" value={editedDraft.department || ''} onChange={(value) => updateEditedDraft('department', value)} />
          </div>
        </div>
      ) : (
        <FormattedDescription text={draft.description} />
      )}

      <div className="mb-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
        <Row icon={<Tag className="h-3 w-3" />} label="Classification" value={`${draft.category} / ${draft.subCategory}`} />
        <Row icon={<MapPin className="h-3 w-3" />} label="Studio" value={draft.studio} />
        {draft.memberName && <Row icon={<User className="h-3 w-3" />} label="Member" value={draft.memberName} />}
        {draft.memberContact && <Row icon={<User className="h-3 w-3" />} label="Member contact" value={draft.memberContact} />}
        {draft.trainer && <Row icon={<User className="h-3 w-3" />} label="Instructor" value={draft.trainer} />}
        {draft.classType && <Row icon={<Calendar className="h-3 w-3" />} label="Class / Session" value={draft.classType} />}
        {draft.classDateTime && <Row icon={<Clock className="h-3 w-3" />} label="Session time" value={new Date(draft.classDateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} />}
        <Row icon={<ShieldCheck className="h-3 w-3" />} label="Documented by" value={draft.reportedBy || 'Auto-assigned'} />
        <Row icon={<User className="h-3 w-3" />} label="Owner" value={draft.assignedTo || 'Auto-routed'} />
        <Row icon={<Tag className="h-3 w-3" />} label="Department" value={draft.department || 'Auto-routed'} />
        <Row icon={<Clock className="h-3 w-3" />} label="SLA target" value={`${slaHours} hour${slaHours === 1 ? '' : 's'} from publish`} />
      </div>

      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
              #{t}
            </span>
          ))}
        </div>
      )}

      {!confirmed && reviewInsights && !editing && (
        <TicketReviewPanel insights={reviewInsights} momenceLoading={momenceLoading} momenceError={momenceError} />
      )}

      {confirmed ? (
        <div className="grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-2 font-semibold">
            <Check className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">Ticket {ticketId} published to dashboard</span>
          </div>
          {confirmedTicket ? (
            <SlaCountdown
              slaDueAt={confirmedTicket.slaDueAt}
              status={confirmedTicket.status}
              compact
              className="w-full justify-start ring-0 sm:w-auto"
            />
          ) : (
            <span className="rounded-xl border border-emerald-200 bg-white/75 px-3 py-2 font-semibold text-emerald-700">
              SLA clock syncing
            </span>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => {
                  onSaveEdit?.(editedDraft);
                  setEditing(false);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-950 py-2.5 text-xs font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-stone-800"
              >
                <Check className="w-3.5 h-3.5" /> Save edited draft
              </button>
              <button
                onClick={() => {
                  setEditedDraft(draft);
                  setEditing(false);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition duration-200 hover:border-blue-200 hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onConfirm}
                disabled={publishing}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-950 py-2.5 text-xs font-semibold text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-0.5 hover:bg-stone-800 hover:shadow-[0_20px_42px_rgba(15,23,42,0.22)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:bg-stone-950 disabled:hover:shadow-[0_16px_34px_rgba(15,23,42,0.18)]"
              >
                <Check className="w-3.5 h-3.5" /> {publishing ? 'Publishing...' : 'Publish ticket'}
              </button>
              <button
                onClick={onDiscard}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                Discard draft
              </button>
              <button
                onClick={() => {
                  onEdit();
                  setEditing(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
              >
                <Route className="w-3.5 h-3.5" /> Fix routing
              </button>
              <button
                onClick={() => {
                  onEdit();
                  setEditing(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-slate-50"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit draft
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const cleanInlineMarkdown = (value: string) =>
  value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^[-*]\s+/, '')
    .trim();

const FormattedDescription: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="my-2 list-disc space-y-1 pl-5">
        {bullets.map((line, index) => <li key={index}>{cleanInlineMarkdown(line)}</li>)}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || /^(\*{3,}|-{3,})$/.test(line)) {
      flushBullets();
      elements.push(<div key={`space-${index}`} className="h-2" />);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line);
      return;
    }
    flushBullets();
    elements.push(<p key={`p-${index}`} className="mb-1">{cleanInlineMarkdown(line)}</p>);
  });
  flushBullets();

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-relaxed text-stone-700 shadow-inner shadow-stone-200/60">
      {elements}
    </div>
  );
};

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex min-w-0 items-start gap-2 rounded-xl border border-stone-200 bg-white/80 px-2.5 py-2 dark:border-stone-800 dark:bg-stone-950/60">
    <div className="mt-0.5 text-blue-600">{icon}</div>
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-400">{label}</div>
      <div className="truncate text-stone-700">{value}</div>
    </div>
  </div>
);

const TicketReviewPanel: React.FC<{
  insights: TicketReviewInsights;
  momenceLoading: boolean;
  momenceError?: string | null;
}> = ({ insights, momenceLoading, momenceError }) => (
  <div className="mb-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
    {insights.duplicateWarning && (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" />
          Exact duplicate: {insights.duplicateWarning.ticketId}
        </div>
        <div className="leading-relaxed">
          {insights.duplicateWarning.title} · {insights.duplicateWarning.status}
        </div>
      </div>
    )}

    <div className="grid gap-2 sm:grid-cols-5">
      {insights.confidence.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</span>
            <span className={`font-mono text-[11px] font-bold ${confidenceTone(item.score)}`}>{item.score}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${confidenceBar(item.score)}`} style={{ width: `${item.score}%` }} />
          </div>
        </div>
      ))}
    </div>

    <div className="grid gap-2 lg:grid-cols-2">
      <ReviewBlock icon={<Route className="h-3.5 w-3.5" />} title="Why Athena routed this">
        {insights.routingRationale.map((line) => (
          <div key={line} className="rounded-lg bg-white px-2 py-1.5 text-[11px] leading-relaxed text-slate-600">
            {line}
          </div>
        ))}
      </ReviewBlock>
      <ReviewBlock icon={<Brain className="h-3.5 w-3.5" />} title="Momence context">
        {momenceLoading && (
          <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-[11px] font-medium text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading live Momence context...
          </div>
        )}
        {momenceError && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
            {momenceError}
          </div>
        )}
        {insights.momenceChips.length ? (
          <div className="flex flex-wrap gap-1">
            {insights.momenceChips.map((chip) => (
              <span key={chip} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                {chip}
              </span>
            ))}
          </div>
        ) : !momenceLoading && (
          <div className="rounded-lg bg-white px-2 py-1.5 text-[11px] text-slate-500">
            No live Momence member/session context selected yet.
          </div>
        )}
      </ReviewBlock>
    </div>

    {insights.riskSignals.length > 0 && (
      <ReviewBlock icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Smart risk flags">
        {insights.riskSignals.map((line) => (
          <div key={line} className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800">
            {line}
          </div>
        ))}
      </ReviewBlock>
    )}

    <ReviewBlock icon={<Layers3 className="h-3.5 w-3.5" />} title="Review before publish">
      <div className="grid gap-2 md:grid-cols-2">
        {insights.sections.map((section) => (
          <div key={section.title} className="rounded-xl border border-slate-200 bg-white p-2">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{section.title}</div>
            <div className="space-y-1">
              {section.items.slice(0, 4).map((item) => (
                <div key={item} className="truncate text-[11px] text-slate-700" title={item}>{item}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ReviewBlock>
  </div>
);

const ReviewBlock: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white/70 p-2">
    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
      {icon}
      {title}
    </div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

function confidenceTone(score: number): string {
  if (score >= 85) return 'text-emerald-700';
  if (score >= 65) return 'text-blue-700';
  if (score >= 45) return 'text-amber-700';
  return 'text-red-700';
}

function confidenceBar(score: number): string {
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 65) return 'bg-blue-500';
  if (score >= 45) return 'bg-amber-500';
  return 'bg-red-500';
}

const EditInput: React.FC<{ label: string; value: string; type?: string; onChange: (value: string) => void }> = ({ label, value, type = 'text', onChange }) => (
  <label className="block rounded-xl border border-slate-200 bg-white p-2">
    <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-stone-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
    />
  </label>
);

const EditSelect: React.FC<{ label: string; value: string; options: string[]; onChange: (value: string) => void }> = ({ label, value, options, onChange }) => (
  <label className="block rounded-xl border border-slate-200 bg-white p-2">
    <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-stone-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
    >
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
);
