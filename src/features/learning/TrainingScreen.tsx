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
import { useCurrentDay } from '../../app/useCurrentDay';
import { localDay } from '../../core/calendar';
import { genderPresentation } from '../dictionary/wordValidation';
import type { Word } from './learningTypes';
export function TrainingScreen({ db, profileId, selection, today: injectedDay, onReveal, onHelper, onExplainError, audio: providedAudio }: {
    audio?: AudioService;
    db: SqlStore;
    profileId: string;
    selection?: TrainingSelection;
    today?: string;
    onReveal?: (wordId: string) => void;
    onHelper?: (wordId: string) => void;
    onExplainError?: (attemptId: string) => void;
}) {
    const calendarDay = useCurrentDay(), today = injectedDay ?? calendarDay;
    const currentDay = () => injectedDay ?? localDay(new Date());
    const audio=useMemo(()=>providedAudio ?? getAudioService({db}),[providedAudio,db]);
    const services = useMemo(() => ({ sessions: new SessionRepository(db,word=>audio.available(word)), answers: new AnswerService(db) }), [db,audio]);
    const [session, setSession] = useState<Session | null>(null), [question, setQuestion] = useState<Question | null>(null), [result, setResult] = useState<AttemptResult | null>(null), [word, setWord] = useState<Word | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [finished, setFinished] = useState(false);
    const lock = useRef(false);
    const actionEpoch = useRef(0);
    const playbackEpoch = useRef({generation:0});
    const selectionRef = useRef(selection);
    useEffect(() => {
        // Calendar refreshes cannot interrupt actions or apply snapshots read before them.
        if (lock.current) return;
        const epoch = actionEpoch.current;
        let alive = true;
        const current = () => alive && epoch === actionEpoch.current;
        (async () => { try {
        const existing = await services.sessions.resume(profileId);
        const requested = selectionRef.current;
        const s = existing && (!requested || existing.mode === requested.mode) ? existing : await services.sessions.start(profileId, requested ?? { mode: 'study' }, today);
        const q = s.currentQuestion ?? await services.sessions.next(profileId, s.id, today);
        const w = q ? await db.first<Word>('SELECT * FROM words WHERE profileId=? AND id=?', [profileId, q.wordId]) : null;
        if (current()) {
            setError('');
            setSession(s);
            setQuestion(q);
            setResult(s.result);
            setWord(w);
            setFinished(!q);
        }
    }
    catch (e) {
        if (current())
            setError(String(e));
    }
    finally {
        if (current())
            setBusy(false);
    } })(); return () => { alive = false; }; }, [services, profileId, today, db]);
    useEffect(() => { const playback=playbackEpoch.current, actions=actionEpoch; return () => {
        ++actions.current; ++playback.generation; lock.current=false; void audio.stop();
    }; }, [services, profileId, audio]);
    async function submit(answer: string) { if (lock.current || !session || !question || result)
        return; ++actionEpoch.current; lock.current = true; setBusy(true); setError(''); try {
        setResult(await services.answers.submit(profileId, session.id, question.attemptId, answer, currentDay()));
    }
    catch (e) {
        setError(`Не удалось сохранить ответ. Повторите попытку. ${String(e)}`);
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    async function next(reveal: 'card'|'helper'|false = false) { if (lock.current || !session)
        return; ++actionEpoch.current; lock.current = true; setBusy(true); setError(''); try {
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
        const q = await services.sessions.next(profileId, session.id, currentDay());
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
        ++actionEpoch.current;
        const epoch=++playbackEpoch.current.generation;
        const current=()=>epoch===playbackEpoch.current.generation;
        lock.current=true;setBusy(true);
        try{await audio.play(word);}catch(error){
            if(!current() || (error as {code?:string})?.code==='AUDIO_CANCELLED')return;
            await audio.stop();
            if(!current())return;
            await services.sessions.cancelQuestion(profileId,session.id);
            if(!current())return;
            const q=await services.sessions.next(profileId,session.id,currentDay());
            if(!current())return;
            const w=q ? await db.first<Word>('SELECT * FROM words WHERE profileId=? AND id=?',[profileId,q.wordId]):null;
            if(!current())return;
            setQuestion(q);setResult(null);setFinished(!q);setWord(w);
            setError('Офлайн-озвучка недоступна. Выбран другой тип вопроса.');
        }finally{if(current()){lock.current=false;setBusy(false);}}
    }
    const marker = word && (question?.markerVisible || result) && question?.kind !== 'listening' ? genderPresentation(word) : null;
    return <KeyboardAvoidingView style={{ flex: 1 }} behavior="height"><Screen><Text style={{ fontSize: 28 }}>Тренировка</Text>{error ? <Text accessibilityRole="alert">{error}</Text> : null}{finished ? <Text>Занятие завершено</Text> : question ? <><Text testID={`training-prompt-${question.kind}`} style={{ fontSize: 24, color: marker?.color ?? '#20252b' }}>{question.prompt}</Text>{marker?.article && question.markerVisible ? <Text testID="training-gender-hint" style={{ color: marker.color! }}>{marker.article}</Text> : null}{question.kind==='listening' ? <><Button title="Прослушать" disabled={busy} onPress={()=>void play()}/><Button title="Остановить звук" onPress={()=>void audio.stop()}/></> : null}{result ? <><Text testID="training-result">{result.right ? `Верно! +${result.xpDelta} XP` : session?.mode === 'review' ? 'Ошибка. Повторение назначено на завтра.' : 'Ошибка. Серия этого слова сброшена.'}</Text><Text>Ответ: {question.expected.join(' / ')}</Text><Text testID="training-streak">Серия: {result.state.streak}/20</Text>{!result.right && onExplainError ? <Button title="Объяснить ошибку" testID="error-explanation-open" disabled={busy} onPress={() => onExplainError(question.attemptId)}/> : null}<Button title="Продолжить" disabled={busy} onPress={() => void next()}/></> : question.options.length ? question.options.map(option => <Button key={option} title={option} disabled={busy} onPress={() => void submit(option)}/>) : <TypedAnswer key={question.attemptId} disabled={busy} onSubmit={answer => void submit(answer)}/>}<Button title="Открыть карточку" disabled={busy || !!result} onPress={() => void next('card')}/><Button title="Помощник" disabled={busy || !!result} onPress={() => void next('helper')}/></> : <Text>Загрузка…</Text>}</Screen></KeyboardAvoidingView>;
}
