import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
import { createAssistantHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import type { GenerationRequest, LanguageRuntime } from '../../src/features/assistant/runtimeTypes';

test('wrong_feedback_opens_explanation_and_returns_unchanged', async () => {
    const requests: GenerationRequest[] = [];
    const runtime: LanguageRuntime = {
        load: async () => {},
        generate: async (request, _signal, onText) => {
            requests.push(request);
            onText('Короткое объяснение.');
            return 'Короткое объяснение.';
        },
        cancel: async () => {},
        release: async () => {},
    };
    const h = await createAssistantHarness(runtime);
    const profile = await createProfile(h.db, 'A');
    const view = render(<AppServicesContext.Provider value={{ db: h.db, assistant: h.assistant }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
    try {
        await screen.findByText('Активный профиль: A');
        fireEvent.press(await screen.findByRole('button', { name: 'Тренировка' }));
        await screen.findByRole('button', { name: 'Открыть карточку' });
        const session = (await h.sessions.resume(profile.id))!;
        const question = session.currentQuestion!;
        const wrong = question.options.find(option => !question.expected.includes(option))!;
        fireEvent.press(screen.getByRole('button', { name: wrong }));
        await screen.findByText('Ошибка. Серия этого слова сброшена.');
        const firstResult = (await h.sessions.resume(profile.id))!.result;

        fireEvent.press(screen.getByRole('button', { name: 'Объяснить ошибку' }));

        await screen.findByText('Разбор ошибки');
        await screen.findByText(`Ваш ответ: ${wrong}`);
        await screen.findByText(`Правильный ответ: ${question.expected.join(' / ')}`);
        await screen.findByText('Короткое объяснение.');
        expect(requests).toHaveLength(1);
        fireEvent.press(screen.getByRole('button', { name: 'К тренировке' }));
        await screen.findByText('Ошибка. Серия этого слова сброшена.');
        expect((await h.sessions.resume(profile.id))!.result).toEqual(firstResult);
    }
    finally {
        view.unmount();
        await h.assistant.cancelAndRelease();
        h.close();
    }
});

test('old_attempt_explains_correct_variant_without_claiming_user_answer', async () => {
    const h = await createAssistantHarness();
    const profile = await createProfile(h.db, 'A');
    const word = (await h.words.list(profile.id)).find(w => w.de === 'Stuhl')!;
    const session = await h.sessions.start(profile.id, { mode: 'study', wordIds: [word.id] }, '2026-10-03');
    const question = (await h.sessions.next(profile.id, session.id, '2026-10-03'))!;
    await h.answers.submit(profile.id, session.id, question.attemptId, 'falsch', '2026-10-03');
    const attempt = await h.db.first<{ result: string }>('SELECT result FROM attempts WHERE attemptId=?', [question.attemptId]);
    const legacy = JSON.stringify({ ...JSON.parse(attempt!.result), submittedAnswer: undefined });
    await h.db.run('UPDATE attempts SET result=? WHERE attemptId=?', [legacy, question.attemptId]);
    await h.db.run('UPDATE sessions SET result=? WHERE id=?', [legacy, session.id]);

    const view = render(<AppServicesContext.Provider value={{ db: h.db, assistant: h.assistant }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
    try {
        await screen.findByText('Активный профиль: A');
        fireEvent.press(await screen.findByRole('button', { name: 'Тренировка' }));
        await screen.findByText('Ошибка. Серия этого слова сброшена.');
        fireEvent.press(screen.getByRole('button', { name: 'Объяснить ошибку' }));
        await screen.findByText('Ваш ответ: Ответ не сохранён');
        await screen.findByText(`Правильный ответ: ${question.expected.join(' / ')}`);
    }
    finally {
        view.unmount();
        await h.assistant.cancelAndRelease();
        h.close();
    }
});
