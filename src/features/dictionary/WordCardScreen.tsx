import { subscribeProfileChanges } from '../../app/refreshBus';
import { AidRepository } from '../assistant/aidRepository';
import type { HelperDraft } from '../assistant/assistantTypes';
import { getAudioService } from '../../app/AppServices';
import type { AudioService } from '../audio/audioService';
import React, { useState, useEffect, useMemo } from 'react';
import { Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import { DictionaryRepository } from './dictionaryRepository';
import type { DictionaryEntry } from './dictionaryTypes';
import { formatReviewDay, wordLearningLabel } from './dictionaryPresentation';
import { GenderCard } from './GenderCard';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';

export function WordCardScreen({ db, profileId, profileName = '', wordId, onEdit, onBack, onAssistant, onPractice, audio: providedAudio }: { onAssistant?: () => void; onPractice?: () => void; audio?: AudioService; db: SqlStore; profileId: string; profileName?: string; wordId: string; onEdit: () => void; onBack: () => void }) {
    const audio=useMemo(()=>providedAudio ?? getAudioService({db}),[providedAudio,db]);
    const [available,setAvailable]=useState(false),[playing,setPlaying]=useState(false);
    const [entry, setEntry] = useState<DictionaryEntry | null>(null), [error, setError] = useState('');
    const [aids,setAids]=useState<HelperDraft[]>([]);
    const words = useMemo(() => new DictionaryRepository(db), [db]);
    useEffect(()=>{let alive=true;const repository=new AidRepository(db);const refresh=()=>{void Promise.all([words.getEntry(profileId,wordId),repository.current(profileId,wordId)]).then(([value,helpers])=>{if(alive){setEntry(value);setAids(helpers);}}).catch(e=>{if(alive){setAids([]);setError(e.message);}});};refresh();const off=subscribeProfileChanges(profileId,refresh);return()=>{alive=false;off();};},[db,profileId,wordId,words]);
    const word=entry;
    useEffect(()=>{let alive=true;if(word)void audio.available(word).then(value=>{if(alive)setAvailable(value);});return()=>{alive=false;};},[word,audio]);
    useEffect(() => () => { void audio.stop(); }, [audio, profileId, wordId]);
    async function play(){if(!word)return;setPlaying(true);try{await audio.play(word);}catch(error){if((error as {code?:string})?.code!=='AUDIO_CANCELLED'){setAvailable(false);setError('Офлайн-озвучка недоступна');}}finally{setPlaying(false);}}
    return <Screen>{error ? <Text>{error}</Text> : word ? <><Text>Профиль: {profileName}</Text><GenderCard word={word}/>{available ? <><Button title="Прослушать" disabled={playing} onPress={()=>void play()}/><Button title="Остановить звук" onPress={()=>void audio.stop()}/></> : <Text>Офлайн-озвучка недоступна</Text>}<Text style={{ fontSize: 24 }}>{word.ru}</Text><Text>{wordLearningLabel(word.learning)}{word.learning.difficult ? ' · Трудное' : ''}</Text>{word.learning.mastered ? <Text>{word.learning.dueDay ? `Следующее повторение: ${formatReviewDay(word.learning.dueDay)}` : 'Повторение пока не назначено'}</Text> : null}{word.plural ? <Text>Множественное число: {word.plural}</Text> : null}{word.exampleDe ? <Text>{word.exampleDe}</Text> : null}{word.exampleRu ? <Text>{word.exampleRu}</Text> : null}{word.note ? <Text>{word.note}</Text> : null}<Text accessibilityRole="header">Мои подсказки</Text>{aids.filter(a=>a.profileId===profileId&&a.wordId===wordId).map(a=><Text key={a.requestId}>{a.text}</Text>)}{onAssistant?<Button title="Помоги запомнить" onPress={onAssistant}/>:null}{onPractice?<Button title="Практика с пропуском" testID="practice-start" onPress={onPractice}/>:null}<Button title="Редактировать" onPress={onEdit}/></> : <Text>Загрузка…</Text>}<Button title="Назад в словарь" onPress={onBack}/></Screen>;
}
