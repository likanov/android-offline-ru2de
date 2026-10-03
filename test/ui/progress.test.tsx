import { AppState, type AppStateStatus } from 'react-native';
import { useCurrentDay } from '../../src/app/useCurrentDay';
import React from 'react';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { TodayScreen } from '../../src/features/progress/TodayScreen';
import { ProgressScreen } from '../../src/features/progress/ProgressScreen';
test('today_refreshes_after_answer_and_goal_save_and_starts_existing_queue', async () => {
    const h = await createWordHarness();
    try {
        const p = await createProfile(h.db, 'A');
        let started = false;
        render(<TodayScreen db={h.db} profileId={p.id} today="2026-10-03" onStart={() => { started = true; }} onProgress={() => { }}/>);
        await screen.findByText('Сегодня: 0 / 20');
        fireEvent.changeText(screen.getByLabelText('Дневная цель'), '1');
        fireEvent.press(screen.getByRole('button', { name: 'Сохранить цель' }));
        await screen.findByText('Сегодня: 0 / 1');
        fireEvent.press(screen.getByRole('button', { name: 'Изучать слова' }));
        await waitFor(() => expect(started).toBe(true));
        const s = (await h.sessions.resume(p.id))!, q = (await h.sessions.next(p.id, s.id, '2026-10-03'))!;
        await h.answers.submit(p.id, s.id, q.attemptId, q.expected[0], '2026-10-03');
        await screen.findByText('Сегодня: 1 / 1');
        await screen.findByText('XP: 10');
    }
    finally {
        h.close();
    }
});
test('empty_today_blocks_queues_and_progress_has_month_calendar_and_empty_history', async () => {
    const h = await createWordHarness();
    try {
        await h.db.run("INSERT INTO profiles(id,name,createdAt) VALUES ('empty','Empty','2026-10-03')");
        await h.db.run("INSERT INTO settings(profileId) VALUES ('empty')");
        const view = render(<TodayScreen db={h.db} profileId="empty" today="2026-10-03" onStart={() => { throw Error('unavailable'); }} onProgress={() => { }}/>);
        await screen.findByText('Сегодня: 0 / 20');
        expect(screen.getByRole('button', { name: 'Изучать слова' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Повторить сегодня' })).toBeDisabled();
        view.unmount();
        render(<ProgressScreen db={h.db} profileId="empty" today="2026-10-03"/>);
        await screen.findByText('Ещё нет ответов');
        expect(screen.getByLabelText('2026-10-03: 0 правильных')).toBeTruthy();
        expect(screen.getByLabelText('2026-10-31: 0 правильных')).toBeTruthy();
    }
    finally {
        h.close();
    }
});
test('profile_and_day_change_reload_today_without_reusing_previous_totals', async () => {
    const h = await createWordHarness();
    try {
        const p = await createProfile(h.db, 'A'), other = await createProfile(h.db, 'B');
        const s = (await h.sessions.start(p.id, { mode: 'study' }, '2026-10-03'))!;
        const q = (await h.sessions.next(p.id, s.id, '2026-10-03'))!;
        await h.answers.submit(p.id, s.id, q.attemptId, q.expected[0], '2026-10-03');
        const view = render(<TodayScreen db={h.db} profileId={p.id} today="2026-10-03" onStart={() => { }} onProgress={() => { }}/>);
        await screen.findByText('Сегодня: 1 / 20');
        view.rerender(<TodayScreen db={h.db} profileId={other.id} today="2026-10-03" onStart={() => { }} onProgress={() => { }}/>);
        await screen.findByText('Сегодня: 0 / 20');
        expect(screen.getByText('XP: 0')).toBeTruthy();
        await h.progress.setGoal(p.id, 7);
        expect(screen.getByText('Сегодня: 0 / 20')).toBeTruthy();
        view.rerender(<TodayScreen db={h.db} profileId={p.id} today="2026-10-04" onStart={() => { }} onProgress={() => { }}/>);
        await screen.findByText('Сегодня: 0 / 7');
        expect(screen.getByText('Серия дней: 1')).toBeTruthy();
        expect(screen.getByText('XP: 10')).toBeTruthy();
    }
    finally {
        h.close();
    }
});
test('future_reviews_show_next_date_and_cannot_start', async () => {
    const h = await createWordHarness();
    try {
        const p = await createProfile(h.db, 'A');
        await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-05' WHERE profileId=?", [p.id]);
        render(<TodayScreen db={h.db} profileId={p.id} today="2026-10-03" onStart={() => { throw Error('future queue'); }} onProgress={() => { }}/>);
        await screen.findByText('Следующее повторение: 2026-10-05');
        expect(screen.getByRole('button', { name: 'Повторить сегодня' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Изучать слова' })).toBeDisabled();
        expect(await h.sessions.resume(p.id)).toBeNull();
    }
    finally {
        h.close();
    }
});
test('local_day_updates_at_midnight_and_when_returning_to_app_and_unsubscribes', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 3, 23, 59, 59));
    let listener: (state: AppStateStatus) => void = () => { };
    let removed = false;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => { listener = callback; return { remove: () => { removed = true; } }; });
    try {
        const view = renderHook(() => useCurrentDay());
        expect(view.result.current).toBe('2026-10-03');
        act(() => { jest.advanceTimersByTime(1100); });
        expect(view.result.current).toBe('2026-10-04');
        jest.setSystemTime(new Date(2026, 9, 6, 9));
        act(() => { listener('active'); });
        expect(view.result.current).toBe('2026-10-06');
        view.unmount();
        expect(removed).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
    }
    finally {
        spy.mockRestore();
        jest.useRealTimers();
    }
});
