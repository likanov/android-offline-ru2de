import { dayStreak } from '../../src/features/progress/dailyStreak';
test.each([
    [['2026-10-02', '2026-10-03'], 2],
    [['2026-10-02'], 1],
    [['2026-10-01'], 0],
    [[], 0],
    [['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-02', '2026-10-04'], 3],
] as [
    string[],
    number
][])('counts consecutive correct days %j', (days, want) => expect(dayStreak(days, '2026-10-03')).toBe(want));
