import React from 'react';
import { GermanAnswerInput } from '../../ui/GermanAnswerInput';
export function GrammarTypedAnswer({ disabled, onSubmit, maxLength }: { disabled: boolean; maxLength?:number; onSubmit: (text: string) => void }) {
  return <GermanAnswerInput maxLength={maxLength} onSubmit={onSubmit} disabled={disabled} inputTestID="grammar-answer-input" submitTestID="grammar-submit" />;
}
