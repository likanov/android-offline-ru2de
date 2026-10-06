import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from '../../ui/Button';
export function GrammarTypedAnswer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('');
  const submit = () => { if (!disabled && value.trim()) onSubmit(value); };
  return <View><TextInput testID="grammar-answer-input" accessibilityLabel="Ответ на немецком" value={value} editable={!disabled} autoCapitalize="none" autoCorrect={false} onChangeText={setValue} onSubmitEditing={submit} /><View style={{ flexDirection: 'row', gap: 8 }}>{['ä', 'ö', 'ü', 'ß'].map(letter => <Button key={letter} title={letter} disabled={disabled} onPress={() => setValue(v => v + letter)} />)}</View><Button title="Проверить" testID="grammar-submit" disabled={disabled || !value.trim()} onPress={submit} /></View>;
}
