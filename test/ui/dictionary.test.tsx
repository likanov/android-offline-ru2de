import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { DictionaryScreen } from '../../src/features/dictionary/DictionaryScreen';
import { initialDictionaryViewState } from '../../src/features/dictionary/dictionaryViewState';

test('extra_filters_are_collapsed_and_chips_expose_selected_state', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  render(<DictionaryScreen db={h.db} profileId={profile.id} onOpen={() => {}} onCreate={() => {}}/>);
  try {
    expect((await screen.findByRole('button', { name: 'Все' })).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText('Темы')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Фильтры' }));
    expect(screen.getByText('Темы')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Не изучены' }));
    expect(screen.getByRole('button', { name: 'Не изучены' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getAllByText('Новое').length).toBeGreaterThan(0);
  } finally { h.close(); }
});

test('search_clear_preserves_filter_and_empty_state_has_reset_actions', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  render(<DictionaryScreen db={h.db} profileId={profile.id} onOpen={() => {}} onCreate={() => {}}/>);
  try {
    await screen.findByTestId('dictionary-search');
    fireEvent.press(screen.getByRole('button', { name: 'Не изучены' }));
    fireEvent.changeText(screen.getByTestId('dictionary-search'), 'несуществующее');
    await screen.findByText('По вашему запросу ничего не найдено.');
    fireEvent.press(screen.getAllByRole('button', { name: 'Очистить поиск' })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Не изучены' }).props.accessibilityState.selected).toBe(true));
    expect(screen.getByText('Найдено: 40')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(screen.getByRole('button', { name: 'Все' }).props.accessibilityState.selected).toBe(true);
  } finally { h.close(); }
});

test('list_rows_show_learning_status_and_open_callback', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  let opened = '';
  render(<DictionaryScreen db={h.db} profileId={profile.id} onOpen={id => { opened = id; }} onCreate={() => {}}/>);
  try {
    const row = (await screen.findAllByTestId(/dictionary-row-/))[0];
    expect(screen.getAllByText('Новое').length).toBeGreaterThan(0);
    fireEvent.press(row);
    expect(opened).not.toBe('');
  } finally { h.close(); }
});

test('large_dictionary_search_keeps_the_same_input_while_results_shrink', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  for (let index = 0; index < 70; index++) {
    await h.words.create(profile.id, { de: `Suchwort${index}`, ru: `поисковое ${index}`, pos: 'noun', gender: 'n' });
  }
  const baseState = initialDictionaryViewState();
  const { rerender } = render(<DictionaryScreen db={h.db} profileId={profile.id} viewState={baseState} onViewStateChange={() => {}} onOpen={() => {}} onCreate={() => {}}/>);
  try {
    await screen.findByText('Найдено: 110');
    const search = screen.getByTestId('dictionary-search');
    rerender(<DictionaryScreen db={h.db} profileId={profile.id} viewState={{ ...baseState, filter: { ...baseState.filter, query: 'Suchwort69' } }} onViewStateChange={() => {}} onOpen={() => {}} onCreate={() => {}}/>);
    await screen.findByText('Найдено: 1');
    expect(screen.getByTestId('dictionary-search')).toBe(search);
    expect(screen.getByTestId('dictionary-search').props.value).toBe('Suchwort69');
  } finally { h.close(); }
});
