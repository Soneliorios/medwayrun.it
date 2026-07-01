import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function parseDateLocal(date: string | Date): Date {
  if (typeof date !== "string") return date;
  // Date-only strings (YYYY-MM-DD) must be parsed as local midnight, not UTC.
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00") : new Date(date);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = parseDateLocal(date);
  if (isToday(d)) return "Hoje";
  if (isTomorrow(d)) return "Amanhã";
  return format(d, "dd MMM", { locale: ptBR });
}

export function formatDateFull(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = parseDateLocal(date);
  return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

export function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return isPast(parseDateLocal(dueDate));
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Float-based position between two values for drag reordering (O(1), no cascade) */
export function getPositionBetween(
  before: number | null,
  after: number | null
): number {
  if (before === null && after === null) return 1000;
  if (before === null) return (after as number) / 2;
  if (after === null) return before + 1000;
  return (before + after) / 2;
}

export function formatHours(hours: number | null | undefined): string {
  if (!hours || hours < 0) return "0h";
  const h = Math.floor(hours);
  const totalMinutes = Math.round(hours * 60);
  const m = totalMinutes % 60;
  const totalSeconds = Math.round(hours * 3600);
  
  // Less than 1 minute: show seconds
  if (totalSeconds > 0 && totalMinutes === 0) return `${totalSeconds}s`;
  // Less than 1 hour: show minutes
  if (h === 0) return `${m}m`;
  // 1 hour+: show hours and minutes
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export const ORG_ID =
  process.env.NEXT_PUBLIC_ORG_ID ?? "00000000-0000-0000-0000-000000000001";
