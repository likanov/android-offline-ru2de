import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QuestionHeader } from '../../src/ui/QuestionHeader';
import type { LearningState } from '../../src/features/learning/learningTypes';
const state: LearningState = { streak: 9, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 };
test('dictionary_defaults_to_twenty', () => { render(<QuestionHeader title="Словарь" mode="study" state={state}/>); expect(screen.getByText('Серия: 9/20')).toBeTruthy(); });
test('grammar_uses_ten', () => { render(<QuestionHeader requiredCorrect={10} title="Грамматика" mode="study" state={state}/>); expect(screen.getByText('Серия: 9/10')).toBeTruthy(); });
test('review_preserves_mastery_label', () => { render(<QuestionHeader {...{ requiredCorrect: 10 as const }} title="Грамматика" mode="review" state={state}/>); expect(screen.getByText('Повторение · Изучено')).toBeTruthy(); });
