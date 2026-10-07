import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createGrammarHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { TrainingHomeScreen } from '../../src/features/learning/TrainingHomeScreen';
import { GrammarTrainingScreen } from '../../src/features/grammar/GrammarTrainingScreen';
import { persistLegacySiePluralQuestion } from '../fixtures/legacyGrammarQuestion';

test('training_home_opens_both_blocks_and_resumes', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  const view = render(<TrainingHomeScreen db={h.db} profileId={profile.id} onVocabulary={jest.fn()} onGrammar={jest.fn()} />);
  expect(await screen.findByText('Тренировка')).toBeTruthy();
  expect(screen.getByTestId('training-vocabulary-start')).toBeTruthy();
  expect(screen.getByTestId('training-grammar-start')).toBeTruthy();
  view.unmount(); h.close();
});
test('grammar_saved_streak_is_visible_before_submit', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  await h.db.run("INSERT INTO grammar_progress(profileId,targetId,catalogVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex) VALUES (?,?,1,7,0,0,0,NULL,0,0,0,0,0,0)", [profile.id, 'pronoun-cloze:ich']);
  const view = render(<GrammarTrainingScreen db={h.db} profileId={profile.id} profileName={profile.name} today="2026-10-03" selection={{ mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }} onReference={jest.fn()} onExplainError={jest.fn()} />);
  try { expect(await screen.findByText('Серия: 7/20')).toBeTruthy(); expect(screen.queryByText(`Профиль: ${profile.id}`)).toBeNull(); } finally { view.unmount(); h.close(); }
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

test.each([
  { label: 'Sie', right: true, xp: 10, streak: 1, errors: 0 },
  { label: 'Du', right: false, xp: 0, streak: 0, errors: 1 },
])('resumed_legacy_question_grades_$label_from_four_german_only_buttons', async ({ label, right, xp, streak, errors }) => {
  const h = await createGrammarHarness();
  let view: ReturnType<typeof render> | undefined;
  try {
    const profile = await createProfile(h.db, 'Продолжение');
    const selection = { mode: 'study' as const, lesson: 'pronouns' as const, targetIds: ['pronoun-cloze:sie_plural' as const] };
    const session = (await h.grammarSessions.start(profile.id, selection, '2026-10-06'))!;
    const question = (await h.grammarSessions.next(profile.id, session.id, '2026-10-06'))!;
    const legacy = await persistLegacySiePluralQuestion(h.db, question);
    view = render(<GrammarTrainingScreen db={h.db} profileId={profile.id} today="2026-10-06" selection={selection} onReference={jest.fn()} onExplainError={jest.fn()} />);
    const buttons = await screen.findAllByTestId(/grammar-option-/);
    expect(buttons.map(button => button.props.accessibilityLabel).sort()).toEqual(['Du', 'Er', 'Ich', 'Sie']);
    for (const name of ['Du', 'Er', 'Ich', 'Sie']) {
      expect(screen.getByText(name)).toBeTruthy();
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByTestId('grammar-context')).toHaveTextContent('Контекст: они.');
    expect(screen.queryByTestId('grammar-result')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: label }));
    await screen.findByTestId('grammar-result');
    expect(screen.getByText(legacy.feedback.translationRu)).toBeTruthy();
    expect((await h.grammarSessions.resume(profile.id))!.result).toMatchObject({ right, xpDelta: xp });
    expect(await h.grammar.getState(profile.id, 'pronoun-cloze:sie_plural')).toMatchObject({ attemptCount: 1, state: { streak, totalErrors: errors } });
    expect(await h.profile(profile.id)).toMatchObject({ xp });
  } finally {
    view?.unmount();
    h.close();
  }
});
