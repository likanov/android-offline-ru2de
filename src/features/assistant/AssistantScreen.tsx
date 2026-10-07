import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, TextInput } from 'react-native';
import type { SqlStore } from '../../core/sql';
import { reference } from '../../data/reference';
import { WordRepository } from '../dictionary/wordRepository';
import { GenderCard } from '../dictionary/GenderCard';
import type { Word } from '../learning/learningTypes';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import type { AssistantService } from './assistantService';
import type { HelpMode, HelperDraft, RuleTopic } from './assistantTypes';
export type AssistantScreenProps = {
    db: SqlStore;
    profileId: string;
    wordId: string;
    assistant: AssistantService;
    onModelSetup(): void;
    onBack(): void;
    backLabel?: string;
};
const modes: [
    HelpMode,
    string
][] = [['association', 'Ассоциация'], ['example', 'Пример'], ['text', 'Короткий текст'], ['rule', 'Правило']];
export function AssistantScreen(props: AssistantScreenProps) { return <Workspace key={`${props.profileId}:${props.wordId}`} {...props}/>; }
function Workspace({ db, profileId, wordId, assistant, onModelSetup, onBack, backLabel = 'К карточке' }: AssistantScreenProps) {
    const repository = useMemo(() => new WordRepository(db), [db]);
    const [words, setWords] = useState<Word[]>([]), [mode, setMode] = useState<HelpMode>('association'), [topic, setTopic] = useState<RuleTopic>('gender');
    const [selected, setSelected] = useState<string[]>([wordId]), [draft, setDraft] = useState<HelperDraft | null>(null), [text, setText] = useState('');
    const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [status, setStatus] = useState(''), [modelError, setModelError] = useState(false);
    const alive = useRef(true), abort = useRef<AbortController | null>(null);
    const word = words.find(w => w.id === wordId);
    useEffect(() => {
        alive.current = true;
        void repository.list(profileId).then(value => { if (alive.current)
            setWords(value); }).catch(() => { if (alive.current)
            setStatus('Не удалось открыть словарь'); });
        const background = AppState.addEventListener('change', state => { if (state !== 'active') {
            abort.current?.abort();
            setDraft(null);
            setText('');
            void assistant.cancelAndRelease().catch(() => { if (alive.current)
                setStatus('Не удалось освободить модель'); });
        } });
        return () => { alive.current = false; abort.current?.abort(); background.remove(); void assistant.cancelAndRelease().catch(() => { }); };
    }, [repository, profileId, assistant]);
    function reset() { setDraft(null); setText(''); setSaved(false); setStatus(''); setModelError(false); }
    async function generate() {
        const controller = new AbortController();
        abort.current = controller;
        reset();
        setBusy(true);
        setStatus('Загрузка модели и создание подсказки…');
        try {
            const result = await assistant.generate({ profileId, wordId, mode, selectedWordIds: mode === 'text' ? selected : [], ruleTopic: mode === 'rule' ? topic : null }, controller.signal, token => { if (alive.current && abort.current === controller && !controller.signal.aborted)
                setText(previous => previous + token); });
            if (alive.current && abort.current === controller && !controller.signal.aborted) {
                setDraft(result);
                setText(result.text);
                setStatus('Проверьте подсказку перед сохранением');
            }
        }
        catch (error) {
            if (alive.current && abort.current === controller) {
                setDraft(null);
                setText('');
                const code = (error as {
                    code?: string;
                })?.code;
                setModelError(code === 'MODEL');
                setStatus(code === 'CANCELLED' ? 'Генерация отменена' : error instanceof Error ? error.message : 'Не удалось создать подсказку');
            }
        }
        finally {
            if (alive.current && abort.current === controller) {
                setBusy(false);
                abort.current = null;
            }
        }
    }
    async function save() { if (!draft)
        return; setBusy(true); try {
        await assistant.save(draft, text);
        if (alive.current) {
            setSaved(true);
            setStatus('Подсказка сохранена');
        }
    }
    catch (error) {
        if (alive.current)
            setStatus(error instanceof Error ? error.message : 'Не удалось сохранить подсказку');
    }
    finally {
        if (alive.current)
            setBusy(false);
    } }
    function cancel() { abort.current?.abort(); setDraft(null); setText(''); void assistant.cancelAndRelease().catch(() => { if (alive.current)
        setStatus('Не удалось освободить модель'); }); }
    return <Screen>
  <Text accessibilityRole="header">Помоги запомнить</Text>
  {word ? <GenderCard word={word}/> : <Text>Загрузка карточки…</Text>}
  <Text>Выберите функцию. Результат можно отредактировать и сохранить в карточку.</Text>
  {modes.map(([value, title]) => <Button key={value} title={title} disabled={busy} onPress={() => { reset(); setMode(value); }}/>)}
  {mode === 'text' ? <><Text>Выбрано {selected.length} из 10. Открытая карточка входит в текст.</Text>{words.map(w => <Pressable key={w.id} accessibilityRole="checkbox" accessibilityLabel={`${w.de} — ${w.ru}`} accessibilityState={{ checked: selected.includes(w.id), disabled: busy || w.id === wordId || (!selected.includes(w.id) && selected.length === 10) }} disabled={busy || w.id === wordId || (!selected.includes(w.id) && selected.length === 10)} onPress={() => { reset(); setSelected(previous => previous.includes(w.id) ? previous.filter(id => id !== w.id) : [...previous, w.id]); }} style={{ padding: 12 }}><Text>{selected.includes(w.id) ? '☑' : '☐'} {w.de} — {w.ru}</Text></Pressable>)}</> : null}
  {mode === 'rule' ? <><Button title="Род" disabled={busy} onPress={() => { reset(); setTopic('gender'); }}/><Button title="Артикли" disabled={busy} onPress={() => { reset(); setTopic('articles'); }}/><Text accessibilityRole="header">{reference[topic].title}</Text><Text>{reference[topic].text}</Text></> : null}
  <Button title="Создать подсказку" disabled={busy || !word} onPress={() => void generate()}/>
  {busy ? <><ActivityIndicator accessibilityLabel="Помощник работает"/><Button title="Отменить" onPress={cancel}/></> : null}
  <Text testID="assistant-status" accessibilityLiveRegion="polite">{status}</Text>
  {modelError ? <Button title="Установить локальную модель" onPress={onModelSetup}/> : null}
  <TextInput testID="assistant-result" accessibilityLabel="Результат помощника" multiline value={text} editable={!!draft && !busy && !saved} onChangeText={setText} style={{ minHeight: 140, borderWidth: 1, borderColor: '#667085', borderRadius: 12, padding: 16, fontSize: 18, color: '#182230' }}/>
  <Button title="Сохранить в карточку" disabled={busy || !draft || !text.trim() || saved} onPress={() => void save()}/>
  <Button title={backLabel} variant="ghost" onPress={onBack}/>
 </Screen>;
}
