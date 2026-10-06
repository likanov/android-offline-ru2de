import { TopicRepository, type Topic } from '../topics/topicRepository';
import React, { useState, useEffect, useMemo } from 'react';
import { Text, TextInput, Switch, View } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { Word } from '../learning/learningTypes';
import { WordRepository, type WordFilter } from './wordRepository';
import { displayGerman } from './wordValidation';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import type { DictionaryViewState } from './dictionaryViewState';
export function DictionaryScreen({ db, profileId, profileName, viewState, onViewStateChange, onOpen, onCreate }: {
    db: SqlStore;
    profileId: string;
    profileName: string;
    viewState: DictionaryViewState;
    onViewStateChange: (value: DictionaryViewState) => void;
    onOpen: (id: string) => void;
    onCreate: () => void;
}) {
    const repository = useMemo(() => new WordRepository(db), [db]);
    const topics=useMemo(()=>new TopicRepository(db),[db]);
    const [topicRows,setTopicRows]=useState<Topic[]>([]);
    const [words, setWords] = useState<Word[]>([]), [error, setError] = useState('');
    const filter = viewState.filter;
    const setFilter = (next: WordFilter) => onViewStateChange({ ...viewState, filter: next, scrollOffset: 0 });
    useEffect(()=>{let alive=true;void topics.list(profileId).then(rows=>{if(alive)setTopicRows(rows);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[topics,profileId]);
    useEffect(() => { let alive = true; void repository.list(profileId, filter).then(w => { if (alive)
        setWords(w); }).catch(e => { if (alive)
        setError(e.message); }); return () => { alive = false; }; }, [repository, profileId, filter]);
    return <Screen><Text style={{ fontSize: 28, fontWeight: '700' }}>Словарь</Text><Text>Профиль: {profileName}</Text><TextInput testID="dictionary-search" accessibilityLabel="Поиск слов" placeholder="Немецкое слово или перевод" value={filter.query ?? ''} onChangeText={query => setFilter({ ...filter, query })} style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}/>
 <Text testID="dictionary-count">Найдено: {words.length}</Text>
 <Text>Фильтр: {filter.state === 'mastered' ? 'Изученные' : filter.state === 'learning' ? 'В процессе' : 'Все'}</Text>
 {([['all', 'Все'], ['learning', 'В процессе'], ['mastered', 'Изученные']] as const).map(([state, title]) => <Button key={state} title={title} onPress={() => setFilter({ ...filter, state })}/>)}
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text>Только трудные</Text><Switch accessibilityLabel="Только трудные" value={filter.difficult === true} onValueChange={value => setFilter({ ...filter, difficult: value ? true : undefined })}/></View>
 <Text>Тема: {topicRows.find(t=>t.id===filter.topicId)?.name ?? 'Все темы'}</Text><Button title="Все темы" onPress={()=>setFilter({...filter,topicId:undefined})}/>{topicRows.map(topic=><Button key={topic.id} title={`Тема: ${topic.name}`} onPress={()=>setFilter({...filter,topicId:topic.id})}/>)}
 <Button title="Добавить слово" onPress={onCreate}/>{error ? <Text>{error}</Text> : null}{words.map(word => <Button key={word.id} title={`${displayGerman(word)} — ${word.ru}`} onPress={() => onOpen(word.id)}/>)}</Screen>;
}
