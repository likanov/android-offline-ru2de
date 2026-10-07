import React from 'react';
import { GermanAnswerInput } from '../../ui/GermanAnswerInput';
export function GrammarTypedAnswer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (text: string) => void }) {
  return <GermanAnswerInput onSubmit={onSubmit} disabled={disabled} inputTestID="grammar-answer-input" submitTestID="grammar-submit" />;
}
