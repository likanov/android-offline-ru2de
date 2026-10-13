import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import { localDay } from '../../core/calendar';
import { useCurrentDay } from '../../app/useCurrentDay';
import { QuestionScreen } from '../../ui/QuestionScreen';
import { getGrammarServices } from '../../app/AppServices';
import { GrammarSessionError, sameGrammarSelection } from './grammarSessionRepository';
import { GrammarAnswerError } from './grammarAnswerService';
import type { GrammarAttemptResult, GrammarQuestion, GrammarSelection, GrammarSubmission } from './grammarTypes';
import type { LearningState } from '../learning/learningTypes';
import { readGrammarProgress } from './grammarRepository';
import { grammarQuestionPrompt, grammarLessonTitle } from './grammarPresentation';
import { QuestionHeader } from '../../ui/QuestionHeader';
import { GrammarQuestionView } from './GrammarQuestionView';
export function GrammarTrainingScreen({ db, profileId, profileName, selection, today: injectedDay, onReference, onExplainError }: { db: SqlStore; profileId: string; profileName?: string; selection: GrammarSelection; today?: string; onReference: () => void; onExplainError: (attemptId: string) => void }) {
  const calendar = useCurrentDay(); const today = injectedDay ?? calendar; const currentDay = () => injectedDay ?? localDay(new Date());
  const services = useMemo(() => getGrammarServices({ db }), [db]);
  const [sessionId, setSessionId] = useState<string | null>(null); const [question, setQuestion] = useState<GrammarQuestion | null>(null); const [result, setResult] = useState<GrammarAttemptResult | null>(null); const [progress, setProgress] = useState<LearningState | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(true); const lock = useRef(false); const loadEpoch = useRef(0);
  async function load() {
    const epoch = ++loadEpoch.current;
    const current = () => epoch === loadEpoch.current;
    const existing = await services.sessions.resume(profileId);
    if (!current()) return;
    const session = existing && sameGrammarSelection(existing.selection, selection) ? existing : await services.sessions.start(profileId, selection, today);
    if (!current()) return;
    if (!session) { setQuestion(null); setResult(null); setProgress(null); setSessionId(null); return; }
    let q = session.currentQuestion;
    let notice = '';
    if (!session.result) {
      try { q = await services.sessions.next(profileId, session.id, today); } catch (e) { if (e instanceof GrammarSessionError && e.code === 'GRAMMAR_QUESTION_STALE') { notice = 'Пример обновлён. Продолжим с новым заданием'; q = await services.sessions.next(profileId, session.id, today); } else throw e; }
    }
    const state = q ? (await readGrammarProgress(db, profileId, q.targetId)).state : null;
    if (!current()) return;
    setSessionId(session.id); setQuestion(q); setResult(session.result); setProgress(state); setError(notice);
  }
  // The repository snapshot is asynchronous state loaded when a route opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { let alive = true; void load().catch(e => { if (alive) setError(String(e)); }).finally(() => { if (alive) setBusy(false); }); return () => { alive = false; loadEpoch.current++; }; }, [db, profileId, selection.mode, selection.lesson, JSON.stringify(selection.targetIds), today]);
  async function submit(answer: GrammarSubmission) { if (lock.current || !sessionId || !question || question.profileId !== profileId || result) return; lock.current = true; setBusy(true); setError(''); const epoch = loadEpoch.current; let releaseEpoch = epoch; try { const saved = await services.answers.submit(profileId, sessionId, question.attemptId, answer, currentDay()); if (epoch !== loadEpoch.current) return; setResult(saved); setProgress(saved.state); } catch (e) { if (epoch !== loadEpoch.current) return; if (e instanceof GrammarAnswerError && e.code === 'GRAMMAR_QUESTION_STALE') { setError('Пример обновлён. Продолжим с новым заданием'); releaseEpoch = loadEpoch.current + 1; await load(); } else setError(String(e)); } finally { lock.current = false; if (releaseEpoch === loadEpoch.current) setBusy(false); } }
  async function next() { if (lock.current || !sessionId) return; lock.current = true; setBusy(true); try { const q = await services.sessions.next(profileId, sessionId, currentDay()); setQuestion(q); setResult(null); setProgress(q ? (await readGrammarProgress(db, profileId, q.targetId)).state : null); } catch (e) { if (e instanceof GrammarSessionError && e.code === 'GRAMMAR_QUESTION_STALE') { setError('Пример обновлён. Продолжим с новым заданием'); const q = await services.sessions.next(profileId, sessionId, currentDay()); setQuestion(q); setResult(null); setProgress(q ? (await readGrammarProgress(db, profileId, q.targetId)).state : null); } else setError(String(e)); } finally { lock.current = false; setBusy(false); } }
  const presentation = question ? grammarQuestionPrompt(question) : null;
  return <QuestionScreen><QuestionHeader title={grammarLessonTitle(selection.lesson)} profileName={profileName} mode={selection.mode} state={progress} requiredCorrect={10} />{error ? <Text accessibilityRole="alert">{error}</Text> : null}{question && question.profileId === profileId ? <>{presentation && presentation.instructionRu !== presentation.prompt ? <Text>{presentation.instructionRu}</Text> : null}<GrammarQuestionView key={question.attemptId} question={question} result={result} currentState={progress} busy={busy} onSubmit={answer => void submit(answer)} onNext={() => void next()} onExplainError={() => onExplainError(question.attemptId)} onReference={onReference} /></> : <Text>{busy ? 'Загрузка…' : 'Занятие завершено'}</Text>}</QuestionScreen>;
}
