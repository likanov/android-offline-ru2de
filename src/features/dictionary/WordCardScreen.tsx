import { getAudioService } from '../../app/AppServices';
import type { AudioService } from '../audio/audioService';
import React, { useState, useEffect, useMemo } from 'react';
import { Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { Word } from '../learning/learningTypes';
import { WordRepository } from './wordRepository';
import { GenderCard } from './GenderCard';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
export function WordCardScreen({ db, profileId, wordId, onEdit, onBack, audio: providedAudio }: {
    audio?: AudioService;
    db: SqlStore;
    profileId: string;
    wordId: string;
    onEdit: () => void;
    onBack: () => void;
}) {
    const audio=useMemo(()=>providedAudio ?? getAudioService({db}),[providedAudio,db]);
    const [available,setAvailable]=useState(false),[playing,setPlaying]=useState(false);
    const words = useMemo(() => new WordRepository(db), [db]), [loadedWord, setWord] = useState<Word | null>(null), [error, setError] = useState('');
    const word=loadedWord?.profileId===profileId && loadedWord.id===wordId ? loadedWord : null;
    useEffect(() => { let alive = true; void words.get(profileId, wordId).then(w => { if (alive)
        setWord(w); }).catch(e => { if (alive)
        setError(e.message); }); return () => { alive = false; void audio.stop(); }; }, [words, profileId, wordId, audio]);
    useEffect(()=>{let alive=true;if(word)void audio.available(word).then(value=>{if(alive)setAvailable(value);});return()=>{alive=false;};},[word,audio]);
    async function play(){if(!word)return;setPlaying(true);try{await audio.play(word);}catch{setAvailable(false);setError('Офлайн-озвучка недоступна');}finally{setPlaying(false);}}
    return <Screen>{error ? <Text>{error}</Text> : word ? <><GenderCard word={word}/>{available ? <><Button title="Прослушать" disabled={playing} onPress={()=>void play()}/><Button title="Остановить звук" onPress={()=>void audio.stop()}/></> : <Text>Офлайн-озвучка недоступна</Text>}<Text style={{ fontSize: 24 }}>{word.ru}</Text>{word.plural ? <Text>Множественное число: {word.plural}</Text> : null}{word.exampleDe ? <Text>{word.exampleDe}</Text> : null}{word.exampleRu ? <Text>{word.exampleRu}</Text> : null}{word.note ? <Text>{word.note}</Text> : null}<Button title="Редактировать" onPress={onEdit}/></> : <Text>Загрузка…</Text>}<Button title="Назад в словарь" onPress={onBack}/></Screen>;
}
