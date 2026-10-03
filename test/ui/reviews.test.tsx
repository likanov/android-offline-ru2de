import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { ReviewsScreen } from '../../src/features/reviews/ReviewsScreen';
import { DifficultWordsScreen } from '../../src/features/reviews/DifficultWordsScreen';

test('due_screen_starts_selected_reviews_and_shows_next_date_when_empty',async()=>{
 const h=await createWordHarness();const p=await createProfile(h.db,'A');const [w,future]=await h.words.list(p.id);let started=false;
 try{await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-04' WHERE wordId=?",[w.id]);await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-07' WHERE wordId=?",[future.id]);
 const view=render(<ReviewsScreen db={h.db} profileId={p.id} today="2026-10-04" onStart={()=>{started=true;}}/>);
 fireEvent.press(await screen.findByRole('button',{name:'Начать повторение'}));await waitFor(()=>expect(started).toBe(true));const s=(await h.sessions.resume(p.id))!;expect(s).toMatchObject({mode:'review',wordIds:[w.id]});
 const q=(await h.sessions.next(p.id,s.id,'2026-10-04'))!;await h.answers.submit(p.id,s.id,q.attemptId,q.expected[0],'2026-10-04');view.unmount();
 render(<ReviewsScreen db={h.db} profileId={p.id} today="2026-10-04" onStart={()=>{}}/>);await screen.findByText('На сегодня повторений нет');expect(screen.getByText('Следующее повторение: 2026-10-07')).toBeTruthy();expect(screen.getByRole('button',{name:'Начать повторение'})).toBeDisabled();
 }finally{h.close();}
});

test('difficult_screen_separates_study_from_due_reviews_and_blocks_future_words',async()=>{
 const h=await createWordHarness();const p=await createProfile(h.db,'A');const [study,due,future]=await h.words.list(p.id);let mode='';
 try{await h.db.run('UPDATE word_progress SET difficult=1,totalErrors=3,recoveryErrors=3 WHERE wordId IN (?,?,?)',[study.id,due.id,future.id]);await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-04' WHERE wordId=?",[due.id]);await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-07' WHERE wordId=?",[future.id]);
 const view=render(<DifficultWordsScreen db={h.db} profileId={p.id} today="2026-10-04" onStart={selection=>{mode=selection.mode;}}/>);
 await screen.findByText(`${future.de} — ${future.ru}`);expect(screen.getByText('Следующее повторение: 2026-10-07')).toBeTruthy();
 fireEvent.press(screen.getByRole('button',{name:'Изучать трудные слова'}));await waitFor(()=>expect(mode).toBe('study'));expect(await h.sessions.resume(p.id)).toMatchObject({mode:'study',wordIds:[study.id]});
 fireEvent.press(screen.getByRole('button',{name:'Повторить трудные слова'}));await waitFor(()=>expect(mode).toBe('review'));expect(await h.sessions.resume(p.id)).toMatchObject({mode:'review',wordIds:[due.id]});view.unmount();
 await h.db.run('UPDATE word_progress SET difficult=0 WHERE wordId IN (?,?)',[study.id,due.id]);render(<DifficultWordsScreen db={h.db} profileId={p.id} today="2026-10-04" onStart={()=>{}}/>);
 await screen.findByText(`${future.de} — ${future.ru}`);expect(screen.getByRole('button',{name:'Изучать трудные слова'})).toBeDisabled();expect(screen.getByRole('button',{name:'Повторить трудные слова'})).toBeDisabled();
 }finally{h.close();}
});


test('navigation_opens_difficult_queue_and_trains_only_selected_words', async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id))[10];
 await h.db.run('UPDATE word_progress SET difficult=1,totalErrors=3,recoveryErrors=3 WHERE wordId=?',[w.id]);
 render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation/></ActiveProfileProvider></AppServicesContext.Provider>);
 await screen.findByText('Активный профиль: A');fireEvent.press(screen.getByRole('button',{name:'Трудные'}));
 fireEvent.press(await screen.findByRole('button',{name:'Изучать трудные слова'}));await screen.findByRole('button',{name:'Открыть карточку'});
 expect(await h.sessions.resume(p.id)).toMatchObject({mode:'study',wordIds:[w.id],currentQuestion:{wordId:w.id}});
 }finally{h.close();}
});


for (const refresh of ['midnight', 'foreground'] as const) test(`review_eligibility_refreshes_on_${refresh}`, async () => {
 jest.useFakeTimers();jest.setSystemTime(new Date(2026,9,3,23,59,59));
 let lifecycle: (state: AppStateStatus) => void = () => {};
 const listener=jest.spyOn(AppState,'addEventListener').mockImplementation((_event,handler)=>{lifecycle=handler;return {remove:()=>{}};});
 const h=await createWordHarness();const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id))[0];
 await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-04' WHERE wordId=?",[w.id]);
 const view=render(<ReviewsScreen db={h.db} profileId={p.id} onStart={()=>{}}/>);
 try {
  await screen.findByText('На сегодня повторений нет');
  if(refresh==='midnight') {await act(async()=>{jest.advanceTimersByTime(1100);});}
  else {act(()=>{lifecycle('background');});jest.setSystemTime(new Date(2026,9,4,9));await act(async()=>{lifecycle('active');});}
  await screen.findByText('К повторению: 1');
  expect(screen.getByRole('button',{name:'Начать повторение'})).not.toBeDisabled();
 }finally{view.unmount();h.close();listener.mockRestore();jest.useRealTimers();}
});
