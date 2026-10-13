import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
