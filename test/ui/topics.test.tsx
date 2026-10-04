import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { WordEditorScreen } from '../../src/features/dictionary/WordEditorScreen';
import { DictionaryScreen } from '../../src/features/dictionary/DictionaryScreen';
import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';

function collectText(node: unknown, result: string[] = []): string[] {
 if (typeof node === 'string') { result.push(node); return result; }
 if (!node || typeof node !== 'object') return result;
 if (Array.isArray(node)) { for (const child of node) collectText(child, result); return result; }
 const typed = node as { children?: unknown[] };
 if (typed.children) collectText(typed.children, result);
 return result;
}


test('dictionary_count_has_stable_target_before_long_filter_and_word_lists',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A');
 const view=render(<DictionaryScreen db={h.db} profileId={p.id} onOpen={()=>{}} onCreate={()=>{}}/>);
 expect(await screen.findByTestId('dictionary-count')).toHaveTextContent('Найдено: 40');
 expect(await screen.findByTestId('dictionary-search')).toBeTruthy();
 const text=collectText(view.toJSON());
 expect(text.indexOf('Найдено: ')).toBeLessThan(text.indexOf('Тема: '));
 }finally{h.close();}
});

test('editor_assigns_multiple_topics_and_dictionary_filters_them',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A');let saved='';
 const view=render(<WordEditorScreen db={h.db} profileId={p.id} onSaved={id=>{saved=id;}} onCancel={()=>{}}/>);
 expect(await screen.findByRole('checkbox',{name:'Предметы и комната'})).toBeTruthy();
 fireEvent.press(screen.getByRole('checkbox',{name:'Предметы и комната'}));fireEvent.press(screen.getByRole('checkbox',{name:'Транспорт'}));
 fireEvent.changeText(screen.getByLabelText('Немецкое слово'),'Kissen');fireEvent.changeText(screen.getByLabelText('Перевод'),'подушка');fireEvent.press(screen.getByRole('button',{name:'das — средний род'}));fireEvent.press(screen.getByRole('button',{name:'Сохранить слово'}));
 await waitFor(()=>expect(saved).not.toBe(''));expect((await h.topics.wordTopics(p.id,saved)).map((t)=>t.name).sort()).toEqual(['Предметы и комната','Транспорт']);view.unmount();
 render(<DictionaryScreen db={h.db} profileId={p.id} onOpen={()=>{}} onCreate={()=>{}}/>);
 fireEvent.press(await screen.findByRole('button',{name:'Тема: Транспорт'}));await screen.findByText('Найдено: 3');expect(screen.queryByRole('button',{name:'der Stuhl — стул'})).toBeNull();expect(screen.getByRole('button',{name:'das Kissen — подушка'})).toBeTruthy();
 }finally{h.close();}
});

test('topics_navigation_creates_renames_and_trains_selected_set',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A');
 render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation/></ActiveProfileProvider></AppServicesContext.Provider>);
 await screen.findByText('Активный профиль: A');fireEvent.press(screen.getByRole('button', { name: 'Ещё' })); fireEvent.press(screen.getByRole('button',{name:'Наборы'}));
 fireEvent.changeText(await screen.findByLabelText('Название нового набора'),'Мой набор');fireEvent.press(screen.getByRole('button',{name:'Создать набор'}));fireEvent.press(await screen.findByRole('button',{name:'Выбрать набор: Мой набор'}));
 fireEvent.changeText(screen.getByLabelText('Название набора'),'Новое имя');fireEvent.press(screen.getByRole('button',{name:'Переименовать набор'}));await screen.findByRole('button',{name:'Выбрать набор: Новое имя'});
 fireEvent.press(screen.getByRole('button',{name:'Выбрать набор: Предметы и комната'}));fireEvent.press(await screen.findByRole('button',{name:'Изучать набор'}));await screen.findByRole('button',{name:'Открыть карточку'});
 const session=(await h.sessions.resume(p.id))!;expect(session.wordIds).toHaveLength(5);const topic=(await h.topics.list(p.id)).find((t)=>t.name==='Предметы и комната');const ids=(await h.words.list(p.id,{topicId:topic!.id})).map(w=>w.id);expect(session.wordIds.every(id=>ids.includes(id))).toBe(true);
 }finally{h.close();}
});

test('future_mastered_topic_disables_study_and_due_topic_starts_review',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A');const transport=await h.words.list(p.id,{query:'Zug'});
 await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='9999-01-01' WHERE profileId=? AND wordId IN (SELECT id FROM words WHERE de IN ('Zug','Straße'))",[p.id]);
 render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation/></ActiveProfileProvider></AppServicesContext.Provider>);
 await screen.findByText('Активный профиль: A');fireEvent.press(screen.getByRole('button', { name: 'Ещё' })); fireEvent.press(screen.getByRole('button',{name:'Наборы'}));fireEvent.press(await screen.findByRole('button',{name:'Выбрать набор: Транспорт'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Изучать набор'})).toBeDisabled());expect(screen.getByRole('button',{name:'Повторить набор'})).toBeDisabled();expect(await h.sessions.resume(p.id)).toBeNull();
 await h.db.run("UPDATE word_progress SET dueDate='2026-01-01' WHERE wordId=?",[transport[0].id]);
 fireEvent.press(screen.getByRole('button',{name:'Выбрать набор: Люди'}));fireEvent.press(screen.getByRole('button',{name:'Выбрать набор: Транспорт'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Повторить набор'})).not.toBeDisabled());fireEvent.press(screen.getByRole('button',{name:'Повторить набор'}));await screen.findByRole('button',{name:'Открыть карточку'});expect(await h.sessions.resume(p.id)).toMatchObject({mode:'review',wordIds:[transport[0].id]});
 }finally{h.close();}
});

test('selecting_current_topic_again_keeps_available_training_actions',async()=>{
 const h=await createWordHarness();try{
 await createProfile(h.db,'A');render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation/></ActiveProfileProvider></AppServicesContext.Provider>);
 await screen.findByText('Активный профиль: A');fireEvent.press(screen.getByRole('button', { name: 'Ещё' })); fireEvent.press(screen.getByRole('button',{name:'Наборы'}));fireEvent.press(await screen.findByRole('button',{name:'Выбрать набор: Транспорт'}));await screen.findByText('Доступно для изучения: 2');
 fireEvent.press(screen.getByRole('button',{name:'Выбрать набор: Транспорт'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Изучать набор'})).not.toBeDisabled());
 }finally{h.close();}
});
