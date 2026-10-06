import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { useDictionaryData } from '../../src/features/dictionary/useDictionaryData';

function Probe({ db, profileId }: { db: any; profileId: string }) {
  const { snapshot, status, error, reload } = useDictionaryData(db, profileId);
  return status === 'error' ? <Text>{error}</Text> : <><Text testID="status">{status}</Text><Text>{snapshot?.entries.length ?? 0}</Text><Pressable testID="reload" onPress={reload}><Text>reload</Text></Pressable></>;
}

test('typing_four_characters_does_not_reload_sqlite_snapshot', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  const all = h.db.all.bind(h.db) as typeof h.db.all;
  let reads = 0;
  h.db.all = async (sql, params = []) => { reads += 1; return all(sql, params); };
  render(<Probe db={h.db} profileId={profile.id} />);
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
  const afterLoad = reads;
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
  expect(reads).toBe(afterLoad);
  h.close();
});

test('load_error_is_not_an_empty_dictionary', async () => {
  const h = await createWordHarness();
  render(<Probe db={h.db} profileId="missing" />);
  await waitFor(() => expect(screen.getByText('Профиль не найден')).toBeTruthy());
  h.close();
});
