import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { WordCardScreen } from '../../src/features/dictionary/WordCardScreen';

const silentAudio = { available: async () => false, play: async () => {}, stop: async () => {} } as any;

test('card_shows_new_started_mastered_difficult_and_next_review', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  const word = (await h.words.list(profile.id))[0];
  await h.db.run('UPDATE word_progress SET streak=20,learned=1,dueDate=?,difficult=1 WHERE wordId=?', ['2026-10-07', word.id]);
  render(<WordCardScreen db={h.db} profileId={profile.id} profileName={profile.name} wordId={word.id} audio={silentAudio} onEdit={() => {}} onBack={() => {}}/>);
  expect(await screen.findByText('Профиль: A')).toBeTruthy();
  expect(await screen.findByText('Изучено · Трудное')).toBeTruthy();
  expect(screen.getByText('Следующее повторение: 07.10.2026')).toBeTruthy();
  h.close();
});

test('mastered_word_without_due_day_has_explicit_unscheduled_state', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  const word = (await h.words.list(profile.id))[0];
  await h.db.run('UPDATE word_progress SET streak=20,learned=1,dueDate=NULL WHERE wordId=?', [word.id]);
  render(<WordCardScreen db={h.db} profileId={profile.id} wordId={word.id} audio={silentAudio} onEdit={() => {}} onBack={() => {}}/>);
  expect(await screen.findByText('Повторение пока не назначено')).toBeTruthy();
  h.close();
});
