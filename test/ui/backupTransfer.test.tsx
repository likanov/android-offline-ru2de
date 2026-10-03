import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { BackupService } from '../../src/features/transfer/backupService';
import { TransferScreen } from '../../src/features/transfer/TransferScreen';
test('export_real_json_and_require_restore_confirmation', async () => { const h = await createWordHarness(); try {
    const p = await createProfile(h.db, 'A'), backup = new BackupService(h.db);
    let saved = '';
    const picker = { readText: async () => ({ name: 'backup.json', text: saved }), saveText: async (_name: string, text: string) => { saved = text; return true; } };
    render(<TransferScreen profileId={p.id} csv={h.csv} backup={backup} picker={picker}/>);
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить резервную копию' }));
    await screen.findByText('Резервная копия сохранена');
    expect(JSON.parse(saved).profiles).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'Выбрать резервную копию' }));
    await screen.findByText(/Профилей: 1 · Слов:/);
    expect(await h.db.first('SELECT count(*) AS n FROM profiles')).toEqual({ n: 1 });
    fireEvent.press(screen.getByRole('button', { name: 'Восстановить новые профили' }));
    await screen.findByText('Восстановлено профилей: 1');
    expect(await h.db.first('SELECT count(*) AS n FROM profiles')).toEqual({ n: 2 });
}
finally {
    h.close();
} });
test('save_cancel_is_quiet_and_disk_failure_is_visible', async () => { const h = await createWordHarness(); try {
    const p = await createProfile(h.db, 'A');
    let fail = false;
    const picker = { readText: async () => null, saveText: async () => { if (fail)
            throw new Error('Недостаточно места'); return false; } };
    render(<TransferScreen profileId={p.id} csv={h.csv} backup={new BackupService(h.db)} picker={picker}/>);
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить резервную копию' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить резервную копию' })).not.toBeDisabled());
    expect(screen.queryByRole('alert')).toBeNull();
    fail = true;
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить резервную копию' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Недостаточно места');
}
finally {
    h.close();
} });
