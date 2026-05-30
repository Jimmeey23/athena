import { getEmployee } from './ticketing-data';

type AccessRole = 'admin' | 'support' | string;

interface StatusPermissionTicket {
  assignedTo?: string | null;
}

interface VisibilityPermissionTicket {
  createdBy?: string | null;
  assignedTo?: string | null;
  reportedBy?: string | null;
}

interface StatusPermissionInput {
  accessRole: AccessRole;
  identityValues: Iterable<string>;
  ticket: StatusPermissionTicket;
}

interface VisibilityPermissionInput {
  accessRole: AccessRole;
  identityValues: Iterable<string>;
  ticket: VisibilityPermissionTicket;
}

function normalizeIdentity(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function ticketOwnerKeys(assignedTo?: string | null): Set<string> {
  const ownerName = normalizeIdentity(assignedTo);
  const owner = assignedTo ? getEmployee(assignedTo) : undefined;
  return new Set([
    ownerName,
    normalizeIdentity(owner?.email),
  ].filter(Boolean));
}

export function canUpdateTicketStatus({ accessRole, identityValues, ticket }: StatusPermissionInput): boolean {
  if (accessRole === 'admin') return true;

  const ownerKeys = ticketOwnerKeys(ticket.assignedTo);
  if (ownerKeys.size === 0) return false;

  for (const identity of identityValues) {
    if (ownerKeys.has(normalizeIdentity(identity))) return true;
  }

  return false;
}

export function canAccessTicket({ accessRole, identityValues, ticket }: VisibilityPermissionInput): boolean {
  if (accessRole === 'admin') return true;

  const ticketKeys = new Set([
    normalizeIdentity(ticket.createdBy),
    normalizeIdentity(ticket.reportedBy),
    ...ticketOwnerKeys(ticket.assignedTo),
  ].filter(Boolean));

  for (const identity of identityValues) {
    if (ticketKeys.has(normalizeIdentity(identity))) return true;
  }

  return false;
}
