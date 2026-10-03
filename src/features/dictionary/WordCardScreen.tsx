import React, { useState, useEffect, useMemo } from 'react';
import { Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { Word } from '../learning/learningTypes';
import { WordRepository } from './wordRepository';
import { GenderCard } from './GenderCard';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
export function WordCardScreen({ db, profileId, wordId, onEdit, onBack }: {
    db: SqlStore;
    profileId: string;
    wordId: string;
    onEdit: () => void;
    onBack: () => void;
}) {
    const words = useMemo(() => new WordRepository(db), [db]), [word, setWord] = useState<Word | null>(null), [error, setError] = useState('');
    useEffect(() => { let alive = true; void words.get(profileId, wordId).then(w => { if (alive)
        setWord(w); }).catch(e => { if (alive)
        setError(e.message); }); return () => { alive = false; }; }, [words, profileId, wordId]);
    return <Screen>{error ? <Text>{error}</Text> : word ? <><GenderCard word={word}/><Text style={{ fontSize: 24 }}>{word.ru}</Text>{word.plural ? <Text>Множественное число: {word.plural}</Text> : null}{word.exampleDe ? <Text>{word.exampleDe}</Text> : null}{word.exampleRu ? <Text>{word.exampleRu}</Text> : null}{word.note ? <Text>{word.note}</Text> : null}<Button title="Редактировать" onPress={onEdit}/></> : <Text>Загрузка…</Text>}<Button title="Назад в словарь" onPress={onBack}/></Screen>;
}
