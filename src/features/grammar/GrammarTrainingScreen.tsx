import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import { localDay } from '../../core/calendar';
import { useCurrentDay } from '../../app/useCurrentDay';
import { QuestionScreen } from '../../ui/QuestionScreen';
import { getAudioService, getGrammarServices } from '../../app/AppServices';
import type { AudioService } from '../audio/audioService';
import { grammarResultAudioText } from '../audio/resultAudioText';
import { useResultAudio } from '../audio/useResultAudio';
import { GrammarSessionError, sameGrammarSelection } from './grammarSessionRepository';
import { GrammarAnswerError } from './grammarAnswerService';
import type { GrammarAttemptResult, GrammarQuestion, GrammarSelection, GrammarSubmission } from './grammarTypes';
import type { LearningState } from '../learning/learningTypes';
import { readGrammarProgress } from './grammarRepository';
import { grammarQuestionPrompt, grammarLessonTitle } from './grammarPresentation';
import { QuestionHeader } from '../../ui/QuestionHeader';
import { GrammarQuestionView } from './GrammarQuestionView';
export function GrammarTrainingScreen({ db, profileId, profileName, selection, today: injectedDay, audio: injectedAudio, visible = true, onReference, onExplainError }: { db: SqlStore; profileId: string; profileName?: string; selection: GrammarSelection; today?: string; audio?: AudioService; visible?: boolean; onReference: () => void; onExplainError: (attemptId: string) => void }) {
  const calendar = useCurrentDay(); const today = injectedDay ?? calendar; const currentDay = () => injectedDay ?? localDay(new Date());
  const services = useMemo(() => getGrammarServices({ db }), [db]);
  const audio = useMemo(() => injectedAudio ?? getAudioService({ db }), [db, injectedAudio]);
  const [sessionId, setSessionId] = useState<string | null>(null); const [question, setQuestion] = useState<GrammarQuestion | null>(null); const [result, setResult] = useState<GrammarAttemptResult | null>(null); const [progress, setProgress] = useState<LearningState | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(true); const lock = useRef<number | null>(null); const loadEpoch = useRef(0);
  const request = question && result && question.profileId === profileId && result.attemptId === question.attemptId
    ? { key: JSON.stringify([profileId, question.attemptId]), text: grammarResultAudioText(question) } : null;
  const resultAudio = useResultAudio(audio, request, visible);
  async function load(initialNotice = '') {
    const epoch = ++loadEpoch.current;
    const current = () => epoch === loadEpoch.current;
    const existing = await services.sessions.resume(profileId);
    if (!current()) return;
    const session = existing && sameGrammarSelection(existing.selection, selection) ? existing : await services.sessions.start(profileId, selection, today);
    if (!current()) return;
    if (!session) { setQuestion(null); setResult(null); setProgress(null); setSessionId(null); return; }
    let q = session.currentQuestion;
    let notice = initialNotice;
    if (!session.result) {
      try { q = await services.sessions.next(profileId, session.id, today); } catch (e) {
        if (!current()) return;
        if (e instanceof GrammarSessionError && e.code === 'GRAMMAR_QUESTION_STALE') { notice = 'Пример обновлён. Продолжим с новым заданием'; q = await services.sessions.next(profileId, session.id, today); } else throw e;
      }
    }
    if (!current()) return;
    const state = q ? (await readGrammarProgress(db, profileId, q.targetId)).state : null;
    if (!current()) return;
    setSessionId(session.id); setQuestion(q); setResult(session.result); setProgress(state); setError(notice);
  }
  // Resume the saved session when visible; the question stays mounted through help.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (!visible) return; let alive = true; setBusy(true); void load().catch(e => { if (alive) setError(String(e)); }).finally(() => { if (alive) setBusy(false); }); return () => { alive = false; loadEpoch.current++; }; }, [db, profileId, selection.mode, selection.lesson, JSON.stringify(selection.targetIds), today, visible]);
  async function submit(answer: GrammarSubmission) {
    if (!visible || lock.current === loadEpoch.current || !sessionId || !question || question.profileId !== profileId || result) return;
    const epoch = loadEpoch.current; lock.current = epoch; setBusy(true); setError(''); let releaseEpoch = epoch;
    try {
      const saved = await services.answers.submit(profileId, sessionId, question.attemptId, answer, currentDay());
      if (epoch !== loadEpoch.current) return;
      setResult(saved); setProgress(saved.state);
    } catch (e) {
      if (epoch !== loadEpoch.current) return;
      if (e instanceof GrammarAnswerError && e.code === 'GRAMMAR_QUESTION_STALE') { releaseEpoch = loadEpoch.current + 1; await load('Пример обновлён. Продолжим с новым заданием'); } else setError(String(e));
    } finally { if (lock.current === epoch) lock.current = null; if (releaseEpoch === loadEpoch.current) setBusy(false); }
  }
  async function next() {
    if (!visible || lock.current === loadEpoch.current || !sessionId || question?.profileId !== profileId) return;
    const epoch = loadEpoch.current; const current = () => epoch === loadEpoch.current;
    lock.current = epoch; setBusy(true);
    try {
      await resultAudio.stop();
      if (!current()) return;
      let q: GrammarQuestion | null;
      try { q = await services.sessions.next(profileId, sessionId, currentDay()); } catch (e) {
        if (!current()) return;
        if (e instanceof GrammarSessionError && e.code === 'GRAMMAR_QUESTION_STALE') {
          setError('Пример обновлён. Продолжим с новым заданием'); q = await services.sessions.next(profileId, sessionId, currentDay());
        } else throw e;
      }
      if (!current()) return;
      const state = q ? (await readGrammarProgress(db, profileId, q.targetId)).state : null;
      if (!current()) return;
      setQuestion(q); setResult(null); setProgress(state);
    } catch (e) { if (current()) setError(String(e)); }
    finally { if (lock.current === epoch) lock.current = null; if (current()) setBusy(false); }
  }
  async function openHelp(callback: () => void) {
    if (!visible || lock.current === loadEpoch.current || question?.profileId !== profileId) return;
    const epoch = loadEpoch.current; const current = () => epoch === loadEpoch.current;
    lock.current = epoch; setBusy(true);
    try {
      await resultAudio.stop();
      if (current()) callback();
    } finally { if (lock.current === epoch) lock.current = null; if (current()) setBusy(false); }
  }
  const presentation = question ? grammarQuestionPrompt(question) : null;
  return <QuestionScreen><QuestionHeader title={grammarLessonTitle(selection.lesson)} profileName={profileName} mode={selection.mode} state={progress} requiredCorrect={10} />{error ? <Text accessibilityRole="alert">{error}</Text> : null}{question && question.profileId === profileId ? <>{presentation && presentation.instructionRu !== presentation.prompt ? <Text>{presentation.instructionRu}</Text> : null}<GrammarQuestionView key={question.attemptId} question={question} result={result} currentState={progress} busy={busy} onSubmit={answer => void submit(answer)} onNext={() => void next()} onExplainError={() => void openHelp(() => onExplainError(question.attemptId))} onReference={() => void openHelp(onReference)} onRepeatAudio={request ? resultAudio.repeat : undefined} onStopAudio={request ? () => void resultAudio.stop() : undefined} audioUnavailable={resultAudio.unavailable} /></> : <Text>{busy ? 'Загрузка…' : 'Занятие завершено'}</Text>}</QuestionScreen>;
}
