const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function formatDateHeader(date: Date): string {
  const day = DAYS[date.getDay()];
  const month = date.getMonth() + 1;
  const dayNum = date.getDate();
  const year = date.getFullYear();
  return `${day}, ${month}/${dayNum}/${year}`;
}

export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromDateStr(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dailyNotePath(dateStr: string): string {
  return `Daily Notes/${dateStr}.md`;
}

export function dailyNotesFolderPath(): string {
  return "Daily Notes";
}

export function meetingsFolderPath(dateStr: string): string {
  return `meetings/${dateStr}`;
}

export function recurringFolderPath(): string {
  return "meetings/recurring";
}

export function imageFolderPath(dateStr: string): string {
  return `images/${dateStr}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function getMonthName(month: number): string {
  return MONTHS[month];
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Format a Date into the h1 format used in recurring notes: M/D/YYYY */
export function formatH1Date(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/** Parse an h1 date string like "4/15/2027" back to a Date */
export function parseH1Date(str: string): Date | null {
  const match = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, m, d, y] = match.map(Number);
  return new Date(y, m - 1, d);
}
