import { addDays } from '../../core/calendar';
import type { DayKey } from '../learning/learningTypes';
export function dayStreak(days: DayKey[], today: DayKey): number {
    const active = new Set(days);
    let day = active.has(today) ? today : addDays(today, -1), count = 0;
    while (active.has(day)) {
        count++;
        day = addDays(day, -1);
    }
    return count;
}
