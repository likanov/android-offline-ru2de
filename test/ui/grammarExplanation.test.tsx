import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { GrammarExplanationScreen } from '../../src/features/assistant/GrammarExplanationScreen';
import { createGrammarHarness } from '../harness';
import type { AssistantService } from '../../src/features/assistant/assistantService';
import type { GrammarQuestion, GrammarSubmission } from '../../src/features/grammar/grammarTypes';

const day = '2026-10-06';

function wrongFor(question: GrammarQuestion): GrammarSubmission {
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
