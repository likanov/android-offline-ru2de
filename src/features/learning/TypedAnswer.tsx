import React from 'react';
import { View } from 'react-native';
import { GermanAnswerInput } from '../../ui/GermanAnswerInput';
export function TypedAnswer({ onSubmit, disabled = false }: {
    onSubmit: (answer: string) => void;
    disabled?: boolean;
}) {
  return (
    <View>
      <GermanAnswerInput onSubmit={onSubmit} disabled={disabled} inputTestID="typed-answer-input" submitTestID="typed-submit" />
    </View>
  );
}
