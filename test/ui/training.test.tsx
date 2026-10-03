import React from 'react';
import { BackHandler } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { TrainingScreen } from '../../src/features/learning/TrainingScreen';
import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
test('answer_feedback_is_committed_and_survives_remount', async () => { const h = await createWordHarness(); const p = await createProfile(h.db, 'A'); const w = (await h.words.list(p.id)).find(x => x.de === 'Stuhl')!; const props = { db: h.db, profileId: p.id, today: '2026-10-03', selection: { mode: 'study' as const, wordIds: [w.id] } }; const view = render(<TrainingScreen {...props}/>); fireEvent.press(await screen.findByRole('button', { name: 'der Stuhl' })); await screen.findByText('Верно! +10 XP'); expect(await h.profile(p.id)).toMatchObject({ xp: 10 }); view.unmount(); render(<TrainingScreen {...props}/>); await screen.findByText('Верно! +10 XP'); fireEvent.press(screen.getByRole('button', { name: 'Продолжить' })); await screen.findByText('der Stuhl'); h.close(); });
test('navigation_starts_training_with_local_calendar_day', async () => { const h = await createWordHarness(); await createProfile(h.db, 'A'); render(<AppServicesContext.Provider value={{ db: h.db }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>); await screen.findByText('Активный профиль: A'); fireEvent.press(screen.getByRole('button', { name: 'Тренировка' })); expect(screen.getAllByText('Тренировка').length).toBeGreaterThan(0); await screen.findByRole('button', { name: 'Открыть карточку' }); h.close(); });
test('typed_german_keyboard_and_failed_commit_allow_same_attempt_retry', async () => { const h = await createWordHarness(); const p = await createProfile(h.db, 'A'); const w = (await h.words.list(p.id)).find(x => x.de === 'Stuhl')!; const s = await h.sessions.start(p.id, { mode: 'study', wordIds: [w.id] }, '2026-10-03'); for (let i = 0; i < 2; i++) {
    await h.sessions.next(p.id, s.id, '2026-10-03');
    await h.sessions.cancelQuestion(p.id, s.id);
} const q = (await h.sessions.next(p.id, s.id, '2026-10-03'))!; await h.db.exec("CREATE TRIGGER fail_xp BEFORE UPDATE OF xp ON profiles BEGIN SELECT RAISE(ABORT,'injected'); END;"); render(<TrainingScreen db={h.db} profileId={p.id} today="2026-10-03"/>); await screen.findByLabelText('Ответ на немецком'); fireEvent.press(screen.getByRole('button', { name: 'ä' })); fireEvent.press(screen.getByRole('button', { name: 'ö' })); fireEvent.press(screen.getByRole('button', { name: 'ü' })); fireEvent.press(screen.getByRole('button', { name: 'ß' })); expect(screen.getByLabelText('Ответ на немецком').props.value).toBe('äöüß'); fireEvent.changeText(screen.getByLabelText('Ответ на немецком'), 'der Stuhl'); fireEvent.press(screen.getByRole('button', { name: 'Проверить' })); await screen.findByRole('alert'); expect(screen.queryByText('Верно! +10 XP')).toBeNull(); expect(await h.attemptCount(q.attemptId)).toBe(0); await h.db.exec('DROP TRIGGER fail_xp'); fireEvent.press(screen.getByRole('button', { name: 'Проверить' })); fireEvent.press(screen.getByRole('button', { name: 'Проверить' })); await screen.findByText('Верно! +10 XP'); await waitFor(async () => expect(await h.attemptCount(q.attemptId)).toBe(1)); h.close(); });
test('revealing_card_cancels_without_penalty_and_return_creates_fresh_question', async () => { const h = await createWordHarness(); const p = await createProfile(h.db, 'A'); const w = (await h.words.list(p.id)).find(x => x.de === 'Stuhl')!; const props = { db: h.db, profileId: p.id, today: '2026-10-03', selection: { mode: 'study' as const, wordIds: [w.id] } }; let revealed = ''; const view = render(<TrainingScreen {...props} onReveal={id => { revealed = id; }}/>); await screen.findByRole('button', { name: 'Открыть карточку' }); const q = (await h.sessions.resume(p.id))!.currentQuestion!; fireEvent.press(screen.getByRole('button', { name: 'Открыть карточку' })); await waitFor(() => expect(revealed).toBe(w.id)); expect(await h.wordState(p.id, w.id)).toMatchObject({ streak: 0, totalErrors: 0 }); view.unmount(); render(<TrainingScreen {...props}/>); await screen.findByRole('button', { name: 'Открыть карточку' }); expect((await h.sessions.resume(p.id))!.currentQuestion!.attemptId).not.toBe(q.attemptId); expect(await h.profile(p.id)).toMatchObject({ xp: 0 }); h.close(); });
test('navigation_opens_due_review_training', async () => { const h = await createWordHarness(); const p = await createProfile(h.db, 'A'); await h.db.run("UPDATE word_progress SET streak=20,learned=1,bonusAwarded=1,dueDate='2000-01-01' WHERE profileId=?", [p.id]); render(<AppServicesContext.Provider value={{ db: h.db }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>); await screen.findByText('Активный профиль: A'); fireEvent.press(screen.getByRole('button', { name: 'Повторение' })); await screen.findByRole('button', { name: 'Открыть карточку' }); expect((await h.sessions.resume(p.id))!.mode).toBe('review'); h.close(); });
test('dictionary_navigation_cancels_question_before_revealing_words', async () => { const h = await createWordHarness(); const p = await createProfile(h.db, 'A'); render(<AppServicesContext.Provider value={{ db: h.db }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>); await screen.findByText('Активный профиль: A'); fireEvent.press(screen.getByRole('button', { name: 'Тренировка' })); await screen.findByRole('button', { name: 'Открыть карточку' }); const s = (await h.sessions.resume(p.id))!, q = s.currentQuestion!; fireEvent.press(screen.getByRole('button', { name: 'Словарь' })); await screen.findByRole('button', { name: 'Добавить слово' }); await expect(h.answers.submit(p.id, s.id, q.attemptId, q.expected[0], '2026-10-03')).rejects.toMatchObject({ code: 'STALE_QUESTION' }); h.close(); });
test('helper_cancels_without_opening_unrelated_card', async()=>{
 const h=await createWordHarness();const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id)).find(x=>x.de==='Stuhl')!;let revealed='';
 render(<TrainingScreen db={h.db} profileId={p.id} today="2026-10-03" selection={{mode:'study',wordIds:[w.id]}} onReveal={id=>{revealed=id;}}/>);
 fireEvent.press(await screen.findByRole('button',{name:'Помощник'}));await screen.findByText('Помощник пока недоступен');expect(revealed).toBe('');expect(await h.wordState(p.id,w.id)).toMatchObject({streak:0,totalErrors:0});h.close();
});

test('hardware_back_leaves_training_after_card_return_and_cancels_question', async () => {
    const h = await createWordHarness();
    const p = await createProfile(h.db, 'A');
    let pressBack: (() => boolean | null | undefined) | undefined;
    const subscription = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
        pressBack = handler;
        return { remove: () => { if (pressBack === handler) pressBack = undefined; } };
    });
    const view = render(<AppServicesContext.Provider value={{ db: h.db }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
    try {
        await screen.findByText('Активный профиль: A');
        fireEvent.press(screen.getByRole('button', { name: 'Тренировка' }));
        fireEvent.press(await screen.findByRole('button', { name: 'Открыть карточку' }));
        fireEvent.press(await screen.findByRole('button', { name: 'Назад в словарь' }));
        await screen.findByRole('button', { name: 'Открыть карточку' });
        const session = (await h.sessions.resume(p.id))!;
        const q = session.currentQuestion!;
        await act(async () => { expect(pressBack?.()).toBe(true); });
        await screen.findByRole('button', { name: 'Добавить слово' });
        await expect(h.answers.submit(p.id, session.id, q.attemptId, q.expected[0], '2026-10-03')).rejects.toMatchObject({ code: 'STALE_QUESTION' });
        expect(await h.profile(p.id)).toMatchObject({ xp: 0 });
    } finally {
        view.unmount();
        subscription.mockRestore();
        h.close();
    }
});
