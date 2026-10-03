import type { DayKey } from "../features/learning/learningTypes";
import { AppError } from "./errors";

function formatDay(year: number, month: number, day: number): DayKey {
  if (year < 1 || year > 9999)
    throw new AppError("VALIDATION", "Day is outside the supported calendar");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(day: DayKey, count: number): DayKey {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isSafeInteger(count)) {
    throw new AppError("VALIDATION", "Invalid day or calendar offset");
  }
  const [year, month, date] = day.split("-").map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, date);
  if (
    year < 1 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== date
  ) {
    throw new AppError("VALIDATION", "Invalid calendar day");
  }
  // UTC is only a stable container for calendar components; no elapsed-time arithmetic.
  calendar.setUTCDate(calendar.getUTCDate() + count);
  if (!Number.isFinite(calendar.getTime()))
    throw new AppError("VALIDATION", "Calendar offset is out of range");
  return formatDay(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1,
    calendar.getUTCDate(),
  );
}

export function localDay(now: Date): DayKey {
  if (!Number.isFinite(now.getTime()))
    throw new AppError("VALIDATION", "Invalid clock date");
  return formatDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
