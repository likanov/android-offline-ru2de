import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { CSV_MAX_BYTES } from './csvParser';
import { filePicker, type FilePicker } from './filePicker';
import { CsvImportService, type CsvPreview } from './csvImportService';
import { BackupService } from './backupService';
import { BACKUP_MAX_BYTES, type RestorePreview } from './backupTypes';
type Props = {
    profileId?: string;
    csv: CsvImportService;
    backup?: BackupService;
    picker?: FilePicker;
};
export function TransferScreen(props: Props) { return <ProfileTransferScreen key={props.profileId} {...props}/>; }
function ProfileTransferScreen({ profileId, csv, backup, picker = filePicker }: Props) {
    const [preview, setPreview] = useState<CsvPreview | null>(null), [name, setName] = useState(''), [error, setError] = useState(''), [result, setResult] = useState(''), [busy, setBusy] = useState(false);
    const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
    const generation = useRef(0), lifetime = useRef({ alive: true });
    useEffect(() => { const state = lifetime.current; state.alive = true; return () => { state.alive = false; }; }, []);
    async function pick() {
        if (!profileId) return;
        const token = ++generation.current;
        setBusy(true);
        setRestorePreview(null);
        setPreview(null);
        setError('');
        setResult('');
        setName('');
        try {
            const file = await picker.readText('csv', CSV_MAX_BYTES);
            if (!file)
                return;
            const next = await csv.preview(profileId, file.text);
            if (lifetime.current.alive && token === generation.current) {
                setPreview(next);
                setName(file.name);
            }
        }
        catch (e) {
            if (lifetime.current.alive && token === generation.current)
                setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            if (lifetime.current.alive && token === generation.current)
                setBusy(false);
        }
    }
    async function commit() { if (!preview)
        return; const exact = preview, token = generation.current; setBusy(true); setError(''); try {
        const counts = await csv.commit(exact);
        if (lifetime.current.alive && token === generation.current) {
            setResult(`Добавлено: ${counts.added} · Дубли: ${counts.duplicates} · Ошибки: ${counts.invalid}`);
            setPreview(null);
        }
    }
    catch (e) {
        if (lifetime.current.alive && token === generation.current)
            setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        if (lifetime.current.alive && token === generation.current)
            setBusy(false);
    } }
    async function backupAction(action: 'save' | 'pick' | 'restore') {
        if (!backup)
            return;
        const token = ++generation.current;
        setBusy(true);
        setError('');
        setResult('');
        setPreview(null);
        try {
            if (action === 'save') {
                setRestorePreview(null);
                const data = await backup.exportAll();
                const saved = await picker.saveText(`german-vocabulary-${data.createdAt.slice(0, 10)}.json`, JSON.stringify(data, null, 2));
                if (saved && lifetime.current.alive && token === generation.current)
                    setResult('Резервная копия сохранена');
            }
            else if (action === 'pick') {
                setRestorePreview(null);
                const file = await picker.readText('json', BACKUP_MAX_BYTES);
                if (file) {
                    const next = backup.preview(file.text);
                    if (lifetime.current.alive && token === generation.current) {
                        setRestorePreview(next);
                        setName(file.name);
                    }
                }
            }
            else if (restorePreview) {
                const restored = await backup.restore(restorePreview);
                if (lifetime.current.alive && token === generation.current) {
                    setRestorePreview(null);
                    setResult(`Восстановлено профилей: ${restored.profileIds.length}`);
                }
            }
        }
        catch (e) {
            if (lifetime.current.alive && token === generation.current)
                setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            if (lifetime.current.alive && token === generation.current)
                setBusy(false);
        }
    }
    return <Screen><Text>Импорт CSV</Text>{!profileId ? <Text>Для импорта CSV выберите профиль.</Text> : null}<Text>UTF-8, до 10 МиБ. Обязательные столбцы: de, ru. pos: noun (по умолчанию) или adjective; для noun — gender (m/f/n). Дополнительно: plural, example_de, example_ru, note, icon, topic.</Text><Button title="Выбрать CSV" disabled={busy || !profileId} onPress={() => void pick()}/>{name ? <Text>{name}</Text> : null}{preview ? <><Text>{`Новые: ${preview.valid.length} · Дубли: ${preview.duplicates.length} · Ошибки: ${preview.errors.length}`}</Text>{preview.errors.map(item => <Text key={item.line}>{`Строка ${item.line}: ${item.message}`}</Text>)}<Button title="Импортировать" disabled={busy || !preview.valid.length} onPress={() => void commit()}/></> : null}{backup ? <><Text>Полная резервная копия JSON</Text><Text>Все профили и история занятий, до 50 МиБ. Восстановление создаёт новые профили; переключиться на них можно в разделе «Профили».</Text><Button title="Сохранить резервную копию" disabled={busy} onPress={() => void backupAction('save')}/><Button title="Выбрать резервную копию" disabled={busy} onPress={() => void backupAction('pick')}/>{restorePreview ? <><Text>{`Профилей: ${restorePreview.profileCount} · Слов: ${restorePreview.wordCount}`}</Text><Button title="Восстановить новые профили" disabled={busy || !restorePreview.profileCount} onPress={() => void backupAction('restore')}/><Button title="Отменить восстановление" disabled={busy} onPress={() => setRestorePreview(null)}/></> : null}</> : null}{result ? <Text>{result}</Text> : null}{error ? <Text accessibilityRole="alert">{error}</Text> : null}</Screen>;
}
