import React from 'react';
import { AppState } from 'react-native';
import * as appServices from '../../src/app/AppServices';
import { deferred, resultAudioDevice } from '../helpers/resultAudioDevice';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
import { createGrammarHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
test('nav_training_opens_compact_training_hub', async () => {
  const h = await createGrammarHarness();
  await createProfile(h.db, 'A');
  const view = render(<AppServicesContext.Provider value={{ db: h.db }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
  await screen.findByText('Активный профиль: A');
  fireEvent.press(screen.getByTestId('nav-training'));
  expect(await screen.findByTestId('training-vocabulary-start')).toBeTruthy();
  expect(screen.getByTestId('training-grammar-start')).toBeTruthy();
  view.unmount(); h.close();
});

test('help_return_preserves_sentence_input', async () => {
 const h=await createGrammarHarness(); await createProfile(h.db,'A');
 const view=render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
 try {
  await screen.findByText('Активный профиль: A'); fireEvent.press(screen.getByTestId('nav-training'));
  fireEvent.press(await screen.findByTestId('training-lektion2-toggle'));
  fireEvent.press(screen.getByTestId('training-lektion2-yesno-transform'));
  const input=await screen.findByTestId('grammar-answer-input'); fireEvent.changeText(input,'Bist du Ärztin?');
  fireEvent.press(screen.getByTestId('grammar-reference-open'));
  await screen.findByTestId('grammar-reference-yesno-word-order');
  fireEvent.press(screen.getByRole('button',{name:'Назад к заданию'}));
  expect(await screen.findByTestId('grammar-answer-input')).toHaveProp('value','Bist du Ärztin?');
  fireEvent.press(screen.getByTestId('grammar-submit')); await screen.findByTestId('grammar-result');
  fireEvent.press(screen.getByTestId('grammar-error-open')); await screen.findByTestId('grammar-error-reference-text');
  fireEvent.press(screen.getByRole('button',{name:'К тренировке'})); expect(await screen.findByTestId('grammar-result')).toBeTruthy();
 } finally {view.unmount();h.close();}
});

test.each(['noun-plural','plural-invariant'] as const)('reference_return_preserves_selection_and_typed_input: %s',async lesson=>{
 const h=await createGrammarHarness();await createProfile(h.db,'Lektion3');
 const view=render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
 try {
  await screen.findByText('Активный профиль: Lektion3');fireEvent.press(screen.getByTestId('nav-training'));
  fireEvent.press(await screen.findByTestId('training-lektion3-toggle'));
  fireEvent.press(screen.getByTestId(`training-lektion3-${lesson}`));
  if(lesson==='noun-plural') fireEvent.changeText(await screen.findByTestId('grammar-answer-input'),'die Bücher');
  else fireEvent.press(await screen.findByTestId('grammar-multi-option-lehrer'));
  fireEvent.press(screen.getByTestId('grammar-reference-open'));
  await screen.findByTestId('grammar-reference-diminutives-chen-lein');
  fireEvent.press(screen.getByRole('button',{name:'Назад к заданию'}));
  if(lesson==='noun-plural') expect(await screen.findByTestId('grammar-answer-input')).toHaveProp('value','die Bücher');
  else expect(await screen.findByTestId('grammar-multi-option-lehrer')).toHaveProp('accessibilityState',expect.objectContaining({checked:true}));
 } finally {view.unmount();h.close();}
});



// Hiding the mounted grammar screen without passing visibility would permit hidden Repeat.
test.each(['reference','explanation'] as const)('opening %s stops pending audio and returning retains the saved result without replay', async help => {
 const h=await createGrammarHarness();const p=await createProfile(h.db,'Navigation audio');const device=resultAudioDevice();const pending=deferred<void>();device.completions.push(pending.promise);
 const oldState=AppState.currentState;AppState.currentState='active';
 const getAudio=jest.spyOn(appServices,'getAudioService').mockReturnValue(device.audio);
 const view=render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
 try {
  await screen.findByText('Активный профиль: Navigation audio');fireEvent.press(screen.getByTestId('nav-training'));
  fireEvent.press(await screen.findByTestId('training-lektion2-toggle'));fireEvent.press(screen.getByTestId('training-lektion2-yesno-transform'));
  fireEvent.changeText(await screen.findByTestId('grammar-answer-input'),'Incorrect');fireEvent.press(screen.getByTestId('grammar-submit'));
  await screen.findByTestId('grammar-result');await waitFor(()=>expect(device.spoken).toEqual(['Ist er Arbeiter?']));
  const saved=(await h.grammarSessions.resume(p.id))!;const attempts=await h.db.all('SELECT * FROM grammar_attempts WHERE profileId=?',[p.id]);
  const progress=await h.db.all('SELECT * FROM grammar_progress WHERE profileId=?',[p.id]);const profile=await h.profile(p.id);const stops=device.stops();
  fireEvent.press(screen.getByTestId(help==='reference'?'grammar-reference-open':'grammar-error-open'));
  await screen.findByTestId(help==='reference'?'grammar-reference-yesno-word-order':'grammar-error-reference-text');
  expect(device.stops().speechStops).toBeGreaterThan(stops.speechStops);expect(device.stops().playerStops).toBeGreaterThan(stops.playerStops);
  expect(screen.queryByTestId('grammar-result')).toBeNull();
  // The saved result remains mounted, and even a directly dispatched hidden control stays silent.
  expect(screen.getByTestId('grammar-result',{includeHiddenElements:true})).toBeTruthy();
  fireEvent.press(screen.getByTestId('grammar-result-audio-repeat',{includeHiddenElements:true}));
  await act(async()=>pending.reject(new Error('Old speech rejected after help')));
  expect(device.spoken).toEqual(['Ist er Arbeiter?']);
  fireEvent.press(screen.getByRole('button',{name:help==='reference'?'Назад к заданию':'К тренировке'}));
  await screen.findByTestId('grammar-result');await act(async()=>{});
  expect(device.spoken).toEqual(['Ist er Arbeiter?']);expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
  expect(await h.grammarSessions.resume(p.id)).toEqual(saved);expect(await h.db.all('SELECT * FROM grammar_attempts WHERE profileId=?',[p.id])).toEqual(attempts);
  expect(await h.db.all('SELECT * FROM grammar_progress WHERE profileId=?',[p.id])).toEqual(progress);expect(await h.profile(p.id)).toEqual(profile);
  fireEvent.press(screen.getByTestId('grammar-result-audio-repeat'));await waitFor(()=>expect(device.spoken).toEqual(['Ist er Arbeiter?','Ist er Arbeiter?']));
 } finally {view.unmount();getAudio.mockRestore();AppState.currentState=oldState;h.close();}
});
