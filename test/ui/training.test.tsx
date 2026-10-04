import React from 'react';
import { AppState, type AppStateStatus, BackHandler } from 'react-native';
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
test('navigation_opens_due_review_training', async () => { const h = await createWordHarness(); const p = await createProfile(h.db, 'A'); await h.db.run("UPDATE word_progress SET streak=20,learned=1,bonusAwarded=1,dueDate='2000-01-01' WHERE profileId=?", [p.id]); render(<AppServicesContext.Provider value={{ db: h.db }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>); await screen.findByText('Активный профиль: A'); fireEvent.press(screen.getByRole('button', { name: 'Ещё' })); fireEvent.press(screen.getByRole('button', { name: 'Повторение' })); fireEvent.press(await screen.findByRole('button', { name: 'Начать повторение' })); await screen.findByRole('button', { name: 'Открыть карточку' }); expect((await h.sessions.resume(p.id))!.mode).toBe('review'); h.close(); });
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


test('answer_after_midnight_uses_submission_day_even_before_calendar_timer_fires', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 3, 23, 59, 59));
    const h = await createWordHarness();
    const p = await createProfile(h.db, 'A');
    const w = (await h.words.list(p.id)).find(x => x.de === 'Stuhl')!;
    await h.db.run('UPDATE word_progress SET streak=19 WHERE profileId=? AND wordId=?', [p.id, w.id]);
    const view = render(<TrainingScreen db={h.db} profileId={p.id} selection={{mode:'study',wordIds:[w.id]}}/>);
    try {
        const answer = await screen.findByRole('button', {name:'der Stuhl'});
        jest.setSystemTime(new Date(2026, 9, 4, 0, 0, 1));
        fireEvent.press(answer);
        await screen.findByText('Верно! +60 XP');
        expect(await h.db.first('SELECT day FROM attempts WHERE profileId=?', [p.id])).toMatchObject({day:'2026-10-04'});
        expect(await h.db.first('SELECT day,xp FROM daily_activity WHERE profileId=?', [p.id])).toMatchObject({day:'2026-10-04',xp:60});
        expect(await h.wordState(p.id,w.id)).toMatchObject({dueDay:'2026-10-05'});
    } finally {view.unmount();h.close();jest.useRealTimers();}
});


for (const refresh of ['midnight', 'foreground'] as const) test(`training_refreshes_empty_review_eligibility_on_${refresh}`, async () => {
    jest.useFakeTimers();jest.setSystemTime(new Date(2026,9,3,23,59,59));
    let lifecycle: (state: AppStateStatus) => void = () => {};
    const listener=jest.spyOn(AppState,'addEventListener').mockImplementation((_event,handler)=>{lifecycle=handler;return {remove:()=>{}};});
    const h=await createWordHarness();const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id)).find(x=>x.de==='Stuhl')!;
    await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-04' WHERE wordId=?",[w.id]);
    const view=render(<TrainingScreen db={h.db} profileId={p.id} selection={{mode:'review',wordIds:[w.id]}}/>);
    try {
        await screen.findByRole('alert');
        if(refresh==='midnight') {await act(async()=>{jest.advanceTimersByTime(1100);});}
        else {act(()=>{lifecycle('background');});jest.setSystemTime(new Date(2026,9,4,9));await act(async()=>{lifecycle('active');});}
        await screen.findByRole('button',{name:'der Stuhl'});
        expect(screen.queryByRole('alert')).toBeNull();
    } finally {view.unmount();h.close();listener.mockRestore();jest.useRealTimers();}
});

test('midnight_refresh_cannot_restore_stale_question_after_answer_commits', async () => {
    const listener=jest.spyOn(AppState,'addEventListener').mockImplementation(()=>({remove:()=>{}}));
    jest.useFakeTimers();jest.setSystemTime(new Date(2026,9,3,23,59,59));
    const h=await createWordHarness();const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id)).find(x=>x.de==='Stuhl')!;
    const view=render(<TrainingScreen db={h.db} profileId={p.id} selection={{mode:'study',wordIds:[w.id]}}/>);
    let releaseRefresh!: () => void;
    let refreshStarted!: () => void;
    const blocked = new Promise<void>(resolve=>{releaseRefresh=resolve;});
    const started = new Promise<void>(resolve=>{refreshStarted=resolve;});
    const originalFirst=h.db.first.bind(h.db);
    try {
        await screen.findByRole('button',{name:'der Stuhl'});
        let delayRefresh=true;
        h.db.first=async <T,>(...args: Parameters<typeof h.db.first>): Promise<T | null> => {
            const value=await originalFirst<T>(...args);
            if(delayRefresh && args[0]==='SELECT * FROM words WHERE profileId=? AND id=?') {
                delayRefresh=false;refreshStarted();await blocked;
            }
            return value;
        };
        await act(async()=>{jest.advanceTimersByTime(1100);});
        await started;
        fireEvent.press(screen.getByRole('button',{name:'der Stuhl'}));
        await screen.findByText('Верно! +10 XP');
        await act(async()=>{releaseRefresh();await blocked;});
        expect(screen.getByText('Верно! +10 XP')).toBeTruthy();
        expect(screen.getByRole('button',{name:'Продолжить'})).toBeTruthy();
        expect(await h.db.first('SELECT day FROM attempts WHERE profileId=?',[p.id])).toMatchObject({day:'2026-10-04'});
    } finally {releaseRefresh();view.unmount();h.close();listener.mockRestore();jest.useRealTimers();}
});

test('midnight_refresh_keeps_answer_locked_until_its_transaction_finishes', async () => {
    const listener=jest.spyOn(AppState,'addEventListener').mockImplementation(()=>({remove:()=>{}}));
    jest.useFakeTimers();jest.setSystemTime(new Date(2026,9,3,23,59,59));
    const h=await createWordHarness();const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id)).find(x=>x.de==='Stuhl')!;
    const view=render(<TrainingScreen db={h.db} profileId={p.id} selection={{mode:'study',wordIds:[w.id]}}/>);
    let finishAnswer!: () => void;
    const blocked=new Promise<void>(resolve=>{finishAnswer=resolve;});
    const transaction=h.db.transaction.bind(h.db);
    try {
        await screen.findByRole('button',{name:'der Stuhl'});
        let delayAnswer=true;
        h.db.transaction=async work=>{
            if(delayAnswer){delayAnswer=false;await blocked;}
            return transaction(work);
        };
        fireEvent.press(screen.getByRole('button',{name:'der Stuhl'}));
        await act(async()=>{jest.advanceTimersByTime(1100);});
        expect(screen.getByRole('button',{name:'der Stuhl'})).toBeDisabled();
        await act(async()=>{finishAnswer();});
        await screen.findByText('Верно! +10 XP');
        expect(await h.profile(p.id)).toMatchObject({xp:10});
    }finally{finishAnswer();view.unmount();h.close();listener.mockRestore();jest.useRealTimers();}
});
