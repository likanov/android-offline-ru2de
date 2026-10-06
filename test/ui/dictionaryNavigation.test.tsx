import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppServicesContext } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { createWordHarness } from '../harness';

test('card_and_editor_return_preserve_query_and_filters', async () => {
  const h = await createWordHarness();
  await createProfile(h.db, 'A');
  const view = render(<AppServicesContext.Provider value={{ db: h.db }}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
  try {
    await screen.findByText('Активный профиль: A');
    fireEvent.press(screen.getByRole('button', { name: 'Словарь' }));
    fireEvent.changeText(await screen.findByLabelText('Поиск слов'), 'Buch');
    await screen.findByRole('button', { name: 'das Buch — книга' });
    fireEvent.press(screen.getByRole('button', { name: 'das Buch — книга' }));
    await screen.findByRole('button', { name: 'Редактировать' });
    fireEvent.press(screen.getByRole('button', { name: 'Редактировать' }));
    await screen.findByRole('button', { name: 'Отмена' });
    fireEvent.press(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Назад в словарь' }));
    await waitFor(() => expect(screen.getByLabelText('Поиск слов').props.value).toBe('Buch'));
  } finally {
    view.unmount();
    h.close();
  }
});
