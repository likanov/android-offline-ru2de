import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { openTestDb } from '../sqlite';
import { migrate } from '../../src/core/migrations';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { WordEditorScreen } from '../../src/features/dictionary/WordEditorScreen';
import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
test('editor_validates_then_saves_all_fields_and_returns_to_card', async () => {
    const { db, close } = openTestDb();
    await migrate(db);
    const p = await createProfile(db, 'A');
    let saved = '';
    render(<WordEditorScreen db={db} profileId={p.id} onSaved={(id: string) => { saved = id; }} onCancel={() => { }}/>);
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить слово' }));
    await screen.findByText('Введите немецкое слово');
    fireEvent.changeText(screen.getByLabelText('Немецкое слово'), ' kissen ');
    fireEvent.changeText(screen.getByLabelText('Перевод'), 'подушка');
    fireEvent.press(screen.getByRole('button', { name: 'das — средний род' }));
    fireEvent.changeText(screen.getByLabelText('Множественное число'), 'Kissen');
    fireEvent.changeText(screen.getByLabelText('Пример на немецком'), 'Das Kissen ist weich.');
    fireEvent.changeText(screen.getByLabelText('Перевод примера'), 'Подушка мягкая.');
    fireEvent.changeText(screen.getByLabelText('Заметка'), 'на диване');
    fireEvent.press(screen.getByRole('button', { name: 'Иконка: дом' }));
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить слово' }));
    await waitFor(() => expect(saved).not.toBe(''));
    expect(await db.first('SELECT de,ru,gender,plural,exampleDe,exampleRu,note,icon FROM words WHERE id=?', [saved])).toEqual({ de: 'Kissen', ru: 'подушка', gender: 'n', plural: 'Kissen', exampleDe: 'Das Kissen ist weich.', exampleRu: 'Подушка мягкая.', note: 'на диване', icon: 'home' });
    close();
});
test('editing_metadata_preserves_learning_on_real_sqlite', async () => {
    const { db, close } = openTestDb();
    await migrate(db);
    const p = await createProfile(db, 'A');
    const word = await db.first<{
        id: string;
    }>('SELECT id FROM words WHERE profileId=? AND de=?', [p.id, 'Stuhl']);
    await db.run('UPDATE word_progress SET streak=8,bonusAwarded=1 WHERE wordId=?', [word!.id]);
    let saved = '';
    render(<WordEditorScreen db={db} profileId={p.id} wordId={word!.id} onSaved={(id: string) => { saved = id; }} onCancel={() => { }}/>);
    await waitFor(() => expect(screen.getByLabelText('Немецкое слово').props.value).toBe('Stuhl'));
    fireEvent.changeText(screen.getByLabelText('Заметка'), 'мой стул');
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить слово' }));
    await waitFor(() => expect(saved).toBe(word!.id));
    expect(await db.first('SELECT streak,bonusAwarded FROM word_progress WHERE wordId=?', [word!.id])).toEqual({ streak: 8, bonusAwarded: 1 });
    close();
});

test('editor_exposes_stable_save_button_for_android_regression', async () => {
    const { db, close } = openTestDb();
    await migrate(db);
    const p = await createProfile(db, 'A');
    render(<WordEditorScreen db={db} profileId={p.id} onSaved={() => { }} onCancel={() => { }}/>);
    expect(await screen.findByTestId('word-save')).toBeTruthy();
    close();
});

test('navigation_returns_to_saved_card_and_searches_new_word',async()=>{
 const {db,close}=openTestDb();await migrate(db);await createProfile(db,'A');
 render(<AppServicesContext.Provider value={{db}}><ActiveProfileProvider><Navigation/></ActiveProfileProvider></AppServicesContext.Provider>);
 await screen.findByText('Активный профиль: A');
 fireEvent.press(screen.getByRole('button',{name:'Словарь'}));
 fireEvent.press(await screen.findByRole('button',{name:'Добавить слово'}));
 fireEvent.changeText(screen.getByLabelText('Немецкое слово'),'Beere');
 fireEvent.changeText(screen.getByLabelText('Перевод'),'ягода');
 fireEvent.press(screen.getByRole('button',{name:'die — женский род'}));
 fireEvent.press(screen.getByRole('button',{name:'Сохранить слово'}));
 await screen.findByText('die Beere');await screen.findByText('ягода');
 fireEvent.press(screen.getByRole('button',{name:'Назад в словарь'}));
 fireEvent.changeText(await screen.findByLabelText('Поиск слов'),'ЯГОДА');
 await screen.findByText('Найдено: 1');
 expect(screen.getByRole('button',{name:'die Beere — ягода'})).toBeTruthy();close();
});
