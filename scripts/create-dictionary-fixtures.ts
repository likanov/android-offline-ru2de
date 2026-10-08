import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { openTestDb } from '../test/sqlite';
import { migrate } from '../src/core/migrations';
import { createProfile } from '../src/features/profiles/profileRepository';
import { wordKey } from '../src/features/dictionary/wordValidation';
import { BackupService } from '../src/features/transfer/backupService';
import { validateBackup } from '../src/features/transfer/backupValidation';
import type { BackupV3 } from '../src/features/transfer/backupTypes';
import type { DayKey } from '../src/features/learning/learningTypes';

/** Host-only fixtures for the dictionary UX acceptance flows. */
export async function createDictionaryUxBackup(_day: DayKey = '2026-10-06'): Promise<BackupV3> {
  const source = openTestDb();
  try {
    await migrate(source.db);
    await createProfile(source.db, 'Регрессия UI');
    const empty = await createProfile(source.db, 'Регрессия UI B');
    await source.db.transaction(async tx => {
      await tx.run('DELETE FROM word_topics WHERE profileId=?', [empty.id]);
      await tx.run('DELETE FROM word_progress WHERE profileId=?', [empty.id]);
      await tx.run('DELETE FROM words WHERE profileId=?', [empty.id]);
      await tx.run('DELETE FROM topics WHERE profileId=?', [empty.id]);
    });
    return validateBackup(await new BackupService(source.db).exportAll());
  } finally {
    source.close();
  }
}

/** A deterministic ten-thousand-word profile used for search timing checks. */
export async function createDictionaryLargeBackup(_day: DayKey = '2026-10-06'): Promise<BackupV3> {
  const source = openTestDb();
  try {
    await migrate(source.db);
    const profile = await createProfile(source.db, 'Регрессия 10000');
    await source.db.transaction(async tx => {
      for (let index = 40; index < 10000; index += 1) {
        const de = `Wort-${String(index).padStart(5, '0')}`;
        const ru = `слово-${String(index).padStart(5, '0')}`;
        const id = randomUUID();
        await tx.run(
          'INSERT INTO words(id,profileId,de,ru,pos,gender,plural,exampleDe,exampleRu,note,icon,canonicalKey) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [id, profile.id, de, ru, 'adjective', null, null, null, null, '', null, wordKey({ de, ru, pos: 'adjective', gender: null })],
        );
        await tx.run('INSERT INTO word_progress(profileId,wordId) VALUES (?,?)', [profile.id, id]);
      }
    });
    return validateBackup(await new BackupService(source.db).exportAll());
  } finally {
    source.close();
  }
}

async function writeRequestedFixtures() {
  const outputs: [string | undefined, () => Promise<BackupV3>][] = [
    [process.env.DICTIONARY_FIXTURE_OUTPUT, createDictionaryUxBackup],
    [process.env.DICTIONARY_LARGE_FIXTURE_OUTPUT, createDictionaryLargeBackup],
  ];
  for (const [output, generator] of outputs) {
    if (!output) continue;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(await generator(), null, 2)}\n`);
  }
}

if (process.env.DICTIONARY_FIXTURE_OUTPUT || process.env.DICTIONARY_LARGE_FIXTURE_OUTPUT) {
  void writeRequestedFixtures().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
