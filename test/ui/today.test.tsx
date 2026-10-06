import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createGrammarHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { TodayScreen } from '../../src/features/progress/TodayScreen';
test('today_exposes_grammar_training_entry', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  const onGrammar = jest.fn();
  const view = render(<TodayScreen db={h.db} profileId={profile.id} today="2026-10-03" onStart={jest.fn()} onProgress={jest.fn()} onGrammar={onGrammar} />);
  fireEvent.press(await screen.findByTestId('today-grammar-start'));
  expect(onGrammar).toHaveBeenCalledWith({ mode: 'study', lesson: 'mixed' });
  view.unmount(); h.close();
});
