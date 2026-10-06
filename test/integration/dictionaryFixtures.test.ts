import { createDictionaryLargeBackup, createDictionaryUxBackup } from '../../scripts/create-dictionary-fixtures';
import { validateBackup } from '../../src/features/transfer/backupValidation';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

test('dictionary_ux_fixture_has_isolated_profiles_and_seed_words', async () => {
  const backup = await createDictionaryUxBackup();
  expect(() => validateBackup(backup)).not.toThrow();
  expect(backup.profiles.map(profile => profile.profile.name)).toEqual(['Регрессия UI', 'Регрессия UI B']);
  expect(backup.profiles.find(profile => profile.profile.name === 'Регрессия UI')!.words).toHaveLength(40);
  expect(backup.profiles.find(profile => profile.profile.name === 'Регрессия UI')!.topics).toHaveLength(6);
  expect(backup.profiles.find(profile => profile.profile.name === 'Регрессия UI B')!.words).toHaveLength(0);
  expect(backup.profiles[0].words.some(word => word.de === 'Buch' && word.ru === 'книга')).toBe(true);
});

test('dictionary_large_fixture_has_exactly_ten_thousand_words', async () => {
  const backup = await createDictionaryLargeBackup();
  expect(() => validateBackup(backup)).not.toThrow();
  const profile = backup.profiles.find(item => item.profile.name === 'Регрессия 10000')!;
  expect(profile.words).toHaveLength(10000);
  expect(profile.words.find(word => word.de === 'Wort-05000')).toMatchObject({ ru: 'слово-05000', pos: 'adjective' });
});

test('write_requested_dictionary_fixtures', async () => {
  const requests: [string | undefined, () => Promise<unknown>][] = [
    [process.env.DICTIONARY_FIXTURE_OUTPUT, createDictionaryUxBackup],
    [process.env.DICTIONARY_LARGE_FIXTURE_OUTPUT, createDictionaryLargeBackup],
  ];
  for (const [output, generator] of requests) {
    if (!output) continue;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(await generator(), null, 2)}\n`);
  }
});
