import React, { useState, useEffect, useMemo } from 'react';
import { Text, TextInput, Switch, View } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { Word } from '../learning/learningTypes';
import { WordRepository, type WordFilter } from './wordRepository';
import { displayGerman } from './wordValidation';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
export function DictionaryScreen({ db, profileId, onOpen, onCreate }: {
    db: SqlStore;
    profileId: string;
    onOpen: (id: string) => void;
    onCreate: () => void;
}) {
    const repository = useMemo(() => new WordRepository(db), [db]);
    const [words, setWords] = useState<Word[]>([]), [filter, setFilter] = useState<WordFilter>({ state: 'all' }), [error, setError] = useState('');
    useEffect(() => { let alive = true; void repository.list(profileId, filter).then(w => { if (alive)
        setWords(w); }).catch(e => { if (alive)
        setError(e.message); }); return () => { alive = false; }; }, [repository, profileId, filter]);
    return <Screen><Text style={{ fontSize: 28, fontWeight: '700' }}>Словарь</Text><TextInput accessibilityLabel="Поиск слов" placeholder="Немецкое слово или перевод" value={filter.query ?? ''} onChangeText={query => setFilter({ ...filter, query })} style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}/>
 <Text>Фильтр: {filter.state === 'mastered' ? 'Изученные' : filter.state === 'learning' ? 'В процессе' : 'Все'}</Text>
 {([['all', 'Все'], ['learning', 'В процессе'], ['mastered', 'Изученные']] as const).map(([state, title]) => <Button key={state} title={title} onPress={() => setFilter({ ...filter, state })}/>)}
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text>Только трудные</Text><Switch accessibilityLabel="Только трудные" value={filter.difficult === true} onValueChange={value => setFilter({ ...filter, difficult: value ? true : undefined })}/></View>
 <Button title="Добавить слово" onPress={onCreate}/>{error ? <Text>{error}</Text> : null}<Text>Найдено: {words.length}</Text>{words.map(word => <Button key={word.id} title={`${displayGerman(word)} — ${word.ru}`} onPress={() => onOpen(word.id)}/>)}</Screen>;
}
