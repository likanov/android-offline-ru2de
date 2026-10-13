import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { GrammarExplanationScreen } from '../../src/features/assistant/GrammarExplanationScreen';
import { createGrammarHarness } from '../harness';
import type { AssistantService } from '../../src/features/assistant/assistantService';
import type { GrammarQuestion, GrammarSubmission } from '../../src/features/grammar/grammarTypes';

const day = '2026-10-06';

function wrongFor(question: GrammarQuestion): GrammarSubmission { if(question.catalogVersion===3) throw new Error('Expected pre-Lektion3 question');
  return question.responseMode === 'typed'
    ? { kind: 'typed', text: 'falsch' }
    : { kind: 'choice', optionId: question.options.find(option => option.id !== question.expected.optionId)!.id };
}

test('grammar_error_without_model_shows_local_rule_without_runtime', async () => {
  const h = await createGrammarHarness();
  const generatePractice = jest.fn();
  try {
    const profile = await createProfile(h.db, 'Без модели');
    const session = await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'mixed', targetIds: ['pronoun-cloze:ich'] }, day);
    const question = await h.grammarSessions.next(profile.id, session!.id, day);
    await h.grammarAnswers.submit(profile.id, session!.id, question!.attemptId, wrongFor(question!), day);
    const assistant = { generatePractice, cancelAndRelease: jest.fn().mockResolvedValue(undefined) } as unknown as AssistantService;
    render(<GrammarExplanationScreen db={h.db} profileId={profile.id} attemptId={question!.attemptId} assistant={assistant} onModelSetup={jest.fn()} onBack={jest.fn()} />);
    await screen.findByText('Личные местоимения');
    await screen.findByText('В именительном падеже местоимение является подлежащим.');
    await screen.findByText('Объяснить подробнее');
    expect(generatePractice).not.toHaveBeenCalled();
  } finally { h.close(); }
});

test('grammar_generation_uses_shared_assistant_only_after_explicit_action', async () => {
  const h = await createGrammarHarness();
  const generatePractice = jest.fn().mockResolvedValue({ kind: 'grammar-error', profileId: 'p', attemptId: 'a', text: 'Дополнительное объяснение', referenceTitle: 'Личные местоимения' });
  try {
    const profile = await createProfile(h.db, 'Подробное объяснение');
    const session = await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'mixed', targetIds: ['pronoun-cloze:ich'] }, day);
    const question = await h.grammarSessions.next(profile.id, session!.id, day);
    await h.grammarAnswers.submit(profile.id, session!.id, question!.attemptId, wrongFor(question!), day);
    const assistant = { generatePractice, cancelAndRelease: jest.fn().mockResolvedValue(undefined) } as unknown as AssistantService;
    render(<GrammarExplanationScreen db={h.db} profileId={profile.id} attemptId={question!.attemptId} assistant={assistant} onModelSetup={jest.fn()} onBack={jest.fn()} />);
    await screen.findByText('Объяснить подробнее');
    fireEvent.press(screen.getByRole('button', { name: 'Объяснить подробнее' }));
    await screen.findByText('Дополнительное объяснение');
    expect(generatePractice).toHaveBeenCalledWith(expect.objectContaining({ kind: 'grammar-error', profileId: profile.id, attemptId: question!.attemptId }), expect.any(AbortSignal), expect.any(Function));
  } finally { h.close(); }
});

test('sentence_error_without_model_keeps_typed_answer_checked_solution_and_rule',async()=>{
 const h=await createGrammarHarness(); let view:ReturnType<typeof render>|undefined;
 try {
  const p=await createProfile(h.db,'Предложения'); const session=(await h.grammarSessions.start(p.id,{mode:'study',lesson:'yesno-transform',targetIds:['yesno-transform:noun']},day))!;
  const question=(await h.grammarSessions.next(p.id,session.id,day))!;
  await h.grammarAnswers.submit(p.id,session.id,question.attemptId,{kind:'typed',text:'Das Buch ist neu?'},day);
  const assistant={generatePractice:jest.fn(),cancelAndRelease:jest.fn().mockResolvedValue(undefined)} as unknown as AssistantService;
  view=render(<GrammarExplanationScreen db={h.db} profileId={p.id} attemptId={question.attemptId} assistant={assistant} onModelSetup={jest.fn()} onBack={jest.fn()} />);
  await screen.findByText('Ваш ответ: Das Buch ist neu?');
  expect(screen.getByText('Правильный ответ: Ist das Buch neu?')).toBeTruthy();
  expect(screen.getByTestId('grammar-error-reference-text')).toHaveTextContent('В вопросе без вопросительного слова глагол стоит перед подлежащим.');
  expect(assistant.generatePractice).not.toHaveBeenCalled();
 } finally {view?.unmount();h.close();}
});

test.each(['noun-article','noun-plural','plural-invariant'] as const)('offline_rule_explanation_supports_three_new_kinds: %s',async lesson=>{
 const h=await createGrammarHarness();let view:ReturnType<typeof render>|undefined;
 try {
  const p=await createProfile(h.db,'Без модели');const session=(await h.grammarSessions.start(p.id,{mode:'study',lesson,targetIds:[lesson==='plural-invariant'?'plural-invariant:recognition':`${lesson}:buch`]},day))!;
  const q=(await h.grammarSessions.next(p.id,session.id,day))!;
  await h.grammarAnswers.submit(p.id,session.id,q.attemptId,lesson==='noun-article'?{kind:'choice',optionId:'der'}:lesson==='noun-plural'?{kind:'typed',text:'die Buch'}:{kind:'multi-choice',optionIds:['student']},day);
  const assistant={generatePractice:jest.fn(),cancelAndRelease:jest.fn().mockResolvedValue(undefined)} as unknown as AssistantService;
  view=render(<GrammarExplanationScreen db={h.db} profileId={p.id} attemptId={q.attemptId} assistant={assistant} onModelSetup={jest.fn()} onBack={jest.fn()} />);
  expect(await screen.findByTestId('grammar-error-reference-text')).toHaveTextContent(lesson==='noun-article'?/der — мужской/:lesson==='noun-plural'?/Сохраняйте умлауты/:/Смена артикля не меняет/);
  expect(screen.getByText(lesson==='noun-article'?'Правильный ответ: das':lesson==='noun-plural'?'Правильный ответ: die Bücher':'Правильный ответ: der Lehrer, der Computer')).toBeTruthy();
  if(lesson==='plural-invariant') expect(screen.getByText('Ваш ответ: der Student')).toBeTruthy();
  expect(assistant.generatePractice).not.toHaveBeenCalled();
 } finally {view?.unmount();h.close();}
});
