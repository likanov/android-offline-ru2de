import { getAudioService } from '../../app/AppServices';
import type { AudioService } from '../audio/audioService';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, KeyboardAvoidingView } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { TrainingSelection, Session, Question, AttemptResult } from './questionTypes';
import { SessionRepository } from './sessionRepository';
import { AnswerService } from './answerService';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { TypedAnswer } from './TypedAnswer';
import { localDay } from '../../core/calendar';
import { genderPresentation } from '../dictionary/wordValidation';
import type { Word } from './learningTypes';
export function TrainingScreen({ db, profileId, selection, today = localDay(new Date()), onReveal, onHelper, audio: providedAudio }: {
    audio?: AudioService;
    db: SqlStore;
    profileId: string;
    selection?: TrainingSelection;
    today?: string;
    onReveal?: (wordId: string) => void;
    onHelper?: (wordId: string) => void;
}) {
    const audio=useMemo(()=>providedAudio ?? getAudioService({db}),[providedAudio,db]);
    const services = useMemo(() => ({ sessions: new SessionRepository(db,word=>audio.available(word)), answers: new AnswerService(db) }), [db,audio]);
    const [session, setSession] = useState<Session | null>(null), [question, setQuestion] = useState<Question | null>(null), [result, setResult] = useState<AttemptResult | null>(null), [word, setWord] = useState<Word | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [finished, setFinished] = useState(false);
    const lock = useRef(false);
    const playbackEpoch = useRef({generation:0});
    const selectionRef = useRef(selection);
    useEffect(() => { const playback=playbackEpoch.current; let alive = true; (async () => { try {
        const existing = await services.sessions.resume(profileId);
        const requested = selectionRef.current;
        const s = existing && (!requested || existing.mode === requested.mode) ? existing : await services.sessions.start(profileId, requested ?? { mode: 'study' }, today);
        const q = s.currentQuestion ?? await services.sessions.next(profileId, s.id, today);
        const w = q ? await db.first<Word>('SELECT * FROM words WHERE profileId=? AND id=?', [profileId, q.wordId]) : null;
        if (alive) {
            setSession(s);
            setQuestion(q);
            setResult(s.result);
            setWord(w);
            setFinished(!q);
        }
    }
    catch (e) {
        if (alive)
            setError(String(e));
    }
    finally {
        if (alive)
            setBusy(false);
    } })(); return () => { alive = false; ++playback.generation; lock.current=false; void audio.stop(); }; }, [services, profileId, today, db, audio]);
    async function submit(answer: string) { if (lock.current || !session || !question || result)
        return; lock.current = true; setBusy(true); setError(''); try {
        setResult(await services.answers.submit(profileId, session.id, question.attemptId, answer, today));
    }
    catch (e) {
        setError(`Не удалось сохранить ответ. Повторите попытку. ${String(e)}`);
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    async function next(reveal: 'card'|'helper'|false = false) { if (lock.current || !session)
        return; lock.current = true; setBusy(true); setError(''); try {
        await audio.stop();
        if (reveal)
            await services.sessions.cancelQuestion(profileId, session.id);
        if (reveal==='card' && question && onReveal) {
            onReveal(question.wordId);
            return;
        }
        if (reveal==='helper' && question && onHelper) {
            onHelper(question.wordId);
            return;
        }
        const q = await services.sessions.next(profileId, session.id, today);
        setQuestion(q);
        setResult(null);
        setFinished(!q);
        if(reveal==='helper')setError('Помощник пока недоступен');
        setWord(q ? await db.first<Word>('SELECT * FROM words WHERE profileId=? AND id=?', [profileId, q.wordId]) : null);
    }
    catch (e) {
        setError(String(e));
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    useEffect(()=>{const playback=playbackEpoch.current;return()=>{++playback.generation;void audio.stop();};},[audio,question?.attemptId]);
    async function play(){
        if(!word||!session||!question||lock.current)return;
        const epoch=++playbackEpoch.current.generation;
        const current=()=>epoch===playbackEpoch.current.generation;
        lock.current=true;setBusy(true);
        try{await audio.play(word);}catch(error){
            if(!current() || (error as {code?:string})?.code==='AUDIO_CANCELLED')return;
            await audio.stop();
            if(!current())return;
            await services.sessions.cancelQuestion(profileId,session.id);
            if(!current())return;
            const q=await services.sessions.next(profileId,session.id,today);
            if(!current())return;
            const w=q ? await db.first<Word>('SELECT * FROM words WHERE profileId=? AND id=?',[profileId,q.wordId]):null;
            if(!current())return;
            setQuestion(q);setResult(null);setFinished(!q);setWord(w);
            setError('Офлайн-озвучка недоступна. Выбран другой тип вопроса.');
        }finally{if(current()){lock.current=false;setBusy(false);}}
    }
    const marker = word && (question?.markerVisible || result) && question?.kind !== 'listening' ? genderPresentation(word) : null;
    return <KeyboardAvoidingView style={{ flex: 1 }} behavior="height"><Screen><Text style={{ fontSize: 28 }}>Тренировка</Text>{error ? <Text accessibilityRole="alert">{error}</Text> : null}{finished ? <Text>Занятие завершено</Text> : question ? <><Text style={{ fontSize: 24, color: marker?.color ?? '#20252b' }}>{question.prompt}</Text>{marker?.article && question.markerVisible ? <Text style={{ color: marker.color! }}>{marker.article}</Text> : null}{question.kind==='listening' ? <><Button title="Прослушать" disabled={busy} onPress={()=>void play()}/><Button title="Остановить звук" onPress={()=>void audio.stop()}/></> : null}{result ? <><Text>{result.right ? `Верно! +${result.xpDelta} XP` : session?.mode === 'review' ? 'Ошибка. Повторение назначено на завтра.' : 'Ошибка. Серия этого слова сброшена.'}</Text><Text>Ответ: {question.expected.join(' / ')}</Text><Text>Серия: {result.state.streak}/20</Text><Button title="Продолжить" disabled={busy} onPress={() => void next()}/></> : question.options.length ? question.options.map(option => <Button key={option} title={option} disabled={busy} onPress={() => void submit(option)}/>) : <TypedAnswer key={question.attemptId} disabled={busy} onSubmit={answer => void submit(answer)}/>}<Button title="Открыть карточку" disabled={busy || !!result} onPress={() => void next('card')}/><Button title="Помощник" disabled={busy || !!result} onPress={() => void next('helper')}/></> : <Text>Загрузка…</Text>}</Screen></KeyboardAvoidingView>;
}
