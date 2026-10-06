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
