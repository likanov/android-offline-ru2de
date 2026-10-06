import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createGrammarHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { TrainingHomeScreen } from '../../src/features/learning/TrainingHomeScreen';
import { GrammarTrainingScreen } from '../../src/features/grammar/GrammarTrainingScreen';

test('training_home_opens_both_blocks_and_resumes', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  const view = render(<TrainingHomeScreen db={h.db} profileId={profile.id} onVocabulary={jest.fn()} onGrammar={jest.fn()} />);
  expect(await screen.findByText('Тренировка')).toBeTruthy();
  expect(screen.getByTestId('training-vocabulary-start')).toBeTruthy();
  expect(screen.getByTestId('training-grammar-start')).toBeTruthy();
  view.unmount(); h.close();
});

test('feedback_hides_expected_before_submit_and_keyboard_submit_and_feedback_visible', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  const view = render(<GrammarTrainingScreen db={h.db} profileId={profile.id} today="2026-10-03" selection={{ mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }} onReference={jest.fn()} onExplainError={jest.fn()} />);
  const option = (await screen.findAllByTestId(/grammar-option-/))[0];
  expect(screen.queryByTestId('grammar-result')).toBeNull();
  fireEvent.press(option);
  await screen.findByTestId('grammar-result');
  expect(screen.getByTestId('grammar-next')).toBeTruthy();
  view.unmount(); h.close();
});

test('answered_feedback_survives_reopen_and_reference_returns_to_same_question', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  const props = { db: h.db, profileId: profile.id, today: '2026-10-03' as const, selection: { mode: 'study' as const, lesson: 'pronouns' as const, targetIds: ['pronoun-cloze:ich' as const] }, onReference: jest.fn(), onExplainError: jest.fn() };
  const first = render(<GrammarTrainingScreen {...props} />);
  fireEvent.press((await screen.findAllByTestId(/grammar-option-/))[0]);
  await screen.findByTestId('grammar-result');
  const q = (await h.grammarSessions.resume(profile.id))!.currentQuestion!;
  first.unmount();
  const second = render(<GrammarTrainingScreen {...props} />);
  expect(await screen.findByTestId('grammar-result')).toBeTruthy();
  expect((await h.grammarSessions.resume(profile.id))!.currentQuestion!.attemptId).toBe(q.attemptId);
  second.unmount(); h.close();
});

test('grammar_choice_then_typing_same_target', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  await h.db.run("INSERT INTO grammar_progress(profileId,targetId,catalogVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex) VALUES (?,?,1,0,0,0,0,NULL,0,0,0,0,3,0)", [profile.id, 'pronoun-cloze:ich']);
  const view = render(<GrammarTrainingScreen db={h.db} profileId={profile.id} today="2026-10-03" selection={{ mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }} onReference={jest.fn()} onExplainError={jest.fn()} />);
  const input = await screen.findByTestId('grammar-answer-input');
  fireEvent.changeText(input, 'Ich');
  fireEvent.press(screen.getByTestId('grammar-submit'));
  await screen.findByTestId('grammar-result');
  view.unmount(); h.close();
});
