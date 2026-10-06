import { TopicRepository, type Topic } from '../topics/topicRepository';
import { TopicPicker } from '../topics/TopicPicker';
import React, { useState, useEffect, useMemo } from 'react';
import { Text, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { WordDraft } from '../learning/learningTypes';
import { WordRepository } from './wordRepository';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { IconPicker } from '../../ui/IconPicker';
import { theme } from '../../ui/theme';
export function WordEditorScreen({ db, profileId, wordId, onSaved, onCancel }: {
    db: SqlStore;
    profileId: string;
    wordId?: string;
    onSaved: (id: string) => void;
    onCancel: () => void;
}) {
    const words = useMemo(() => new WordRepository(db), [db]);
    const topics = useMemo(() => new TopicRepository(db), [db]);
    const [topicRows,setTopicRows] = useState<Topic[]>([]), [topicIds,setTopicIds] = useState<string[]>([]);
    const [draft, setDraft] = useState<WordDraft>({ de: '', ru: '', pos: 'noun', gender: null, plural: '', exampleDe: '', exampleRu: '', note: '', icon: null });
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(!wordId);
    useEffect(()=>{let alive=true;void topics.list(profileId).then(rows=>{if(alive)setTopicRows(rows);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[topics,profileId]);
    useEffect(() => { let alive = true; if (wordId)
        void Promise.all([words.get(profileId, wordId),topics.wordTopics(profileId,wordId)]).then(([w,membership]) => { if (alive) {
            setTopicIds(membership.map(t=>t.id));
            setDraft(w);
            setLoaded(true);
        } }).catch(e => { if (alive)
            setError(e.message); }); return () => { alive = false; }; }, [words, topics, profileId, wordId]);
    const save = async () => { setBusy(true); setError(''); try {
        const word = await words.saveWordWithTopics(profileId,draft,topicIds,wordId);
        onSaved(word.id);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const fields: [
        keyof WordDraft,
        string
    ][] = [['de', 'Немецкое слово'], ['ru', 'Перевод'], ['plural', 'Множественное число'], ['exampleDe', 'Пример на немецком'], ['exampleRu', 'Перевод примера'], ['note', 'Заметка']];
    return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Screen>
 <Text style={{ fontSize: 26, fontWeight: '700' }}>Редактор карточки</Text>
 {error ? <Text accessibilityRole="alert" style={{ color: theme.error }}>{error}</Text> : null}
 {fields.map(([field, label]) => <React.Fragment key={field}><Text>{label}</Text><TextInput testID={`word-${field}`} accessibilityLabel={label} value={String(draft[field] ?? '')} onChangeText={value => setDraft({ ...draft, [field]: value })} editable={loaded && !busy} multiline={field === 'note' || field === 'exampleDe' || field === 'exampleRu'} autoCorrect={false} autoCapitalize={field === 'de' ? 'none' : 'sentences'} style={{ borderWidth: 1, borderColor: theme.muted, borderRadius: 10, padding: 12, color: theme.foreground }}/></React.Fragment>)}
 <Text>Часть речи: {draft.pos === 'noun' ? 'существительное' : 'прилагательное'}</Text>
 <Button title="Существительное" onPress={() => setDraft({ ...draft, pos: 'noun' })}/>
 <Button title="Прилагательное" onPress={() => setDraft({ ...draft, pos: 'adjective', gender: null })}/>
 {draft.pos === 'noun' && <><Text>Выбранный род: {draft.gender ?? 'не выбран'}</Text>{([['m', 'der — мужской род'], ['f', 'die — женский род'], ['n', 'das — средний род']] as const).map(([gender, title]) => <Button key={gender} title={title} onPress={() => setDraft({ ...draft, gender })}/>)}</>}
 <IconPicker value={draft.icon ?? null} onChange={icon => setDraft({ ...draft, icon })}/>
 <TopicPicker topics={topicRows} value={topicIds} onChange={setTopicIds} disabled={busy || !loaded}/>
 <Text>Изменение слова, перевода, части речи или рода сбрасывает обучение этого слова. Заметка, пример, множественное число и иконка сохраняют прогресс.</Text>
 <Button testID="word-save" title="Сохранить слово" disabled={busy || !loaded} onPress={() => void save()}/>
 <Button title="Отмена" onPress={onCancel}/>
 </Screen></KeyboardAvoidingView>;
}
