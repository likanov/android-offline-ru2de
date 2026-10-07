import React from 'react';
import { WordCardScreen } from '../../src/features/dictionary/WordCardScreen';
import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
import { AppState, type AppStateStatus } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { AssistantScreen } from '../../src/features/assistant/AssistantScreen';
import { createAssistantHarness } from '../harness';
import { createProfile, setActiveProfile } from '../../src/features/profiles/profileRepository';
import { LlamaRuntime } from '../../src/features/assistant/llamaRuntime';
beforeEach(() => { jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => { } })); });
afterEach(() => { jest.restoreAllMocks(); });
test('four_modes_reference_editor_and_explicit_save', async () => {
    const h = await createAssistantHarness(), p = await createProfile(h.db, 'A'), word = (await h.words.list(p.id))[0];
    const view = render(<AssistantScreen db={h.db} profileId={p.id} wordId={word.id} assistant={h.assistant} onModelSetup={() => { }} onBack={() => { }}/>);
    await screen.findByText('Помоги запомнить');
    for (const title of ['Ассоциация', 'Пример', 'Короткий текст', 'Правило'])
        expect(screen.getByRole('button', { name: title })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Правило' }));
    expect(screen.getByRole('button', { name: 'Род' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Артикли' })).toBeTruthy();
    expect(screen.getByText(/Встроенный справочник: род/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Пример' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Создать подсказку' }));
    const editor = await screen.findByLabelText('Результат помощника');
    await waitFor(() => expect(editor.props.value).toBe('Das ist ein Stuhl. Это стул.'));
    expect(await h.aids.current(p.id, word.id)).toEqual([]);
    fireEvent.changeText(editor, 'Мой пример');
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить в карточку' }));
    await screen.findByText('Подсказка сохранена');
    expect((await h.aids.current(p.id, word.id))[0].text).toBe('Мой пример');
    view.unmount();
    await h.assistant.cancelAndRelease();
    h.close();
});
test('missing_model_keeps_reference_available_and_opens_local_setup', async () => {
    const h = await createAssistantHarness(undefined, { installedPath: async () => null }), p = await createProfile(h.db, 'A'), word = (await h.words.list(p.id))[0];
    const setup = jest.fn();
    const view = render(<AssistantScreen db={h.db} profileId={p.id} wordId={word.id} assistant={h.assistant} onModelSetup={setup} onBack={() => { }}/>);
    fireEvent.press(await screen.findByRole('button', { name: 'Правило' }));
    expect(screen.getByText(/Встроенный справочник: род/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Создать подсказку' }));
    await screen.findByText(/Установите локальную модель/);
    fireEvent.press(screen.getByRole('button', { name: 'Установить локальную модель' }));
    expect(setup).toHaveBeenCalledTimes(1);
    expect(await h.words.get(p.id, word.id)).toMatchObject({ id: word.id });
    view.unmount();
    await h.assistant.cancelAndRelease();
    h.close();
});
test('profile_switch_hides_partial_and_late_output', async () => {
    let finish!: (r: {
        text: string;
    }) => void;
    let emit!: (r: {
        token: string;
    }) => void;
    const runtime = new LlamaRuntime(async () => ({ completion: async (_p, onToken) => { emit = onToken!; return new Promise(resolve => { finish = resolve; }); }, stopCompletion: async () => { finish?.({ text: 'late secret' }); }, release: async () => { } }));
    const h = await createAssistantHarness(runtime), p = await createProfile(h.db, 'A'), other = await createProfile(h.db, 'B'), word = (await h.words.list(p.id))[0], otherWord = (await h.words.list(other.id))[0];
    await setActiveProfile(h.db, p.id);
    const props = { db: h.db, profileId: p.id, wordId: word.id, assistant: h.assistant, onModelSetup: () => { }, onBack: () => { } };
    const view = render(<AssistantScreen {...props}/>);
    fireEvent.press(await screen.findByRole('button', { name: 'Создать подсказку' }));
    await waitFor(() => expect(emit).toBeDefined());
    act(() => emit({ token: 'private partial' }));
    expect(screen.getByLabelText('Результат помощника').props.value).toBe('private partial');
    view.rerender(<AssistantScreen {...props} profileId={other.id} wordId={otherWord.id}/>);
    await act(async () => { emit({ token: 'late secret' }); await Promise.resolve(); });
    expect(screen.queryByDisplayValue(/private partial|late secret/)).toBeNull();
    expect(await h.db.all('SELECT * FROM aids')).toEqual([]);
    view.unmount();
    await h.assistant.cancelAndRelease();
    h.close();
});
test.each(['cancel', 'background', 'dependency'] as const)('%s_cancels_partial_output_without_saving_and_leaves_controls_usable', async (reason) => {
    let finish!: (r: {
        text: string;
    }) => void;
    let emit!: (r: {
        token: string;
    }) => void;
    const runtime = new LlamaRuntime(async () => ({ completion: async (_p, onToken) => { emit = onToken!; return new Promise(resolve => { finish = resolve; }); }, stopCompletion: async () => { finish?.({ text: 'cancelled result' }); }, release: async () => { } }));
    const h = await createAssistantHarness(runtime), p = await createProfile(h.db, 'A'), words = await h.words.list(p.id), word = words[0], second = words[1];
    let background: undefined | ((state: AppStateStatus) => void);
    const listen = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => { background = fn; return { remove: () => { } }; });
    const view = render(<AssistantScreen db={h.db} profileId={p.id} wordId={word.id} assistant={h.assistant} onModelSetup={() => { }} onBack={() => { }}/>);
    fireEvent.press(await screen.findByRole('button', { name: 'Короткий текст' }));
    fireEvent.press(await screen.findByRole('checkbox', { name: new RegExp(second.de) }));
    fireEvent.press(screen.getByRole('button', { name: 'Создать подсказку' }));
    await waitFor(() => expect(emit).toBeDefined());
    act(() => emit({ token: 'partial' }));
    expect(screen.getByRole('button', { name: 'Отменить' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'К карточке' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить в карточку' })).toBeDisabled();
    if (reason === 'cancel')
        fireEvent.press(screen.getByRole('button', { name: 'Отменить' }));
    else if (reason === 'background')
        act(() => background?.('background'));
    else
        await act(async () => { await h.words.update(p.id, second.id, { ...second, ru: 'changed dependency' }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Создать подсказку' })).not.toBeDisabled());
    expect(screen.queryByDisplayValue('partial')).toBeNull();
    expect(await h.aids.current(p.id, word.id)).toEqual([]);
    view.unmount();
    await h.assistant.cancelAndRelease();
    listen.mockRestore();
    h.close();
});
test('word_card_shows_only_current_aids_and_opens_helper', async () => {
    const h = await createAssistantHarness(), p = await createProfile(h.db, 'A'), words = await h.words.list(p.id), word = words[0], second = words[1];
    const draft = await h.assistant.generate({ profileId: p.id, wordId: word.id, mode: 'text', selectedWordIds: [second.id], ruleTopic: null }, new AbortController().signal, () => { });
    await h.assistant.save(draft, 'Сохранённая подсказка');
    const open = jest.fn();
    const view = render(<WordCardScreen db={h.db} profileId={p.id} wordId={word.id} onEdit={() => { }} onBack={() => { }} onAssistant={open}/>);
    await screen.findByText('Сохранённая подсказка');
    fireEvent.press(screen.getByRole('button', { name: 'Помоги запомнить' }));
    expect(open).toHaveBeenCalledTimes(1);
    await act(async () => { await h.words.update(p.id, second.id, { ...second, ru: 'edited' }); });
    await waitFor(() => expect(screen.queryByText('Сохранённая подсказка')).toBeNull());
    view.unmount();
    await h.assistant.cancelAndRelease();
    h.close();
});
test('training_helper_cancels_question_opens_same_word_and_back_returns_to_training', async () => {
    const h = await createAssistantHarness(), p = await createProfile(h.db, 'A');
    const view = render(<AppServicesContext.Provider value={{ db: h.db, assistant: h.assistant }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
    await screen.findByText('Активный профиль: A');
    fireEvent.press(screen.getByRole('button', { name: 'Тренировка' }));
    fireEvent.press(await screen.findByTestId('training-vocabulary-start'));
    await screen.findByRole('button', { name: 'Помощник' });
    const targetId = (await h.sessions.resume(p.id))!.currentQuestion!.wordId;
    const target = await h.words.get(p.id, targetId);
    fireEvent.press(screen.getByRole('button', { name: 'Помощник' }));
    await screen.findByText('Помоги запомнить');
    await screen.findByText(new RegExp(target.de));
    const session = (await h.sessions.resume(p.id))!;
    expect(session.currentQuestion).toBeNull();
    expect((await h.profile(p.id))!.xp).toBe(0);
    fireEvent.press(screen.getByRole('button', { name: 'Вернуться к тренировке' }));
    await screen.findByRole('button', { name: 'Открыть карточку' });
    expect((await h.sessions.resume(p.id))!.currentQuestion).not.toBeNull();
    view.unmount();
    await h.assistant.cancelAndRelease();
    h.close();
});
