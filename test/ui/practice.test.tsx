import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
import { createAssistantHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import type { LanguageRuntime } from '../../src/features/assistant/runtimeTypes';

test('practice_reveals_sentence_only_after_submit', async () => {
    let targetId = '';
    const runtime: LanguageRuntime = {
        load: async () => {},
        generate: async () => JSON.stringify({ exercises: [{ wordId: targetId, before: 'Der ', after: ' ist klein.', translationRu: 'Стул маленький.' }] }),
        cancel: async () => {},
        release: async () => {},
    };
    const h = await createAssistantHarness(runtime);
    const profile = await createProfile(h.db, 'A');
    const word = (await h.words.list(profile.id)).find(w => w.de === 'Stuhl')!;
    targetId = word.id;
    const view = render(<AppServicesContext.Provider value={{ db: h.db, assistant: h.assistant }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
    try {
        await screen.findByText('Активный профиль: A');
        fireEvent.press(screen.getByRole('button', { name: 'Словарь' }));
        fireEvent.press(await screen.findByRole('button', { name: 'der Stuhl — стул' }));
        fireEvent.press(await screen.findByRole('button', { name: 'Практика с пропуском' }));

        await screen.findByText('Практика без XP и изменения серии');
        await screen.findByText('Вставьте немецкое слово');
        await screen.findByText('Der ___ ist klein.');
        expect(screen.queryByText('Der Stuhl ist klein.')).toBeNull();
        expect(screen.queryByText('Стул маленький.')).toBeNull();

        fireEvent.changeText(screen.getByLabelText('Ответ на немецком'), 'Stuhl');
        fireEvent.press(screen.getByRole('button', { name: 'Проверить' }));

        await screen.findByText('Верно');
        await screen.findByText('Der Stuhl ist klein.');
        await screen.findByText('Стул маленький.');
        expect(await h.wordState(profile.id, word.id)).toMatchObject({ streak: 0 });
        expect(await h.profile(profile.id)).toMatchObject({ xp: 0 });
    }
    finally {
        view.unmount();
        await h.assistant.cancelAndRelease();
        h.close();
    }
});
