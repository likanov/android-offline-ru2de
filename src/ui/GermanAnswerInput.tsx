import React, { forwardRef, useRef, useState } from 'react';
import { Text, TextInput, View, StyleSheet, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { Button } from './Button';
import { theme } from './theme';
import { insertGermanCharacter, type GermanCharacter } from './insertGermanCharacter';
import { useQuestionInputReveal } from './QuestionScreen';

export type GermanAnswerInputProps = {
  onSubmit: (answer: string) => void;
  maxLength?:number;
  disabled?: boolean;
  inputTestID: string;
  submitTestID: string;
};

export const GermanAnswerInput = forwardRef<View, GermanAnswerInputProps>(function GermanAnswerInput(
  { onSubmit, disabled = false, inputTestID, submitTestID, maxLength },
  groupRef,
) {
  const [value, setValue] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const inputRef = useRef<TextInput>(null);
  const answerGroupRef = useRef<View | null>(null);
  const reveal = useQuestionInputReveal();
  const submit = () => {
    const answer = value.trim();
    if (!disabled && answer) onSubmit(value);
  };
  const addCharacter = (letter: GermanCharacter) => {
    if (disabled) return;
    const next = insertGermanCharacter(value, selection, letter);
    setValue(next.value);
    setSelection(next.selection);
    inputRef.current?.focus();
  };
  const handleSelectionChange = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSelection(event.nativeEvent.selection);
  };

  const setGroupRef = (node: View | null) => {
    answerGroupRef.current = node;
    if (typeof groupRef === 'function') groupRef(node);
    else if (groupRef) groupRef.current = node;
    reveal(node);
  };

  return (
    <View ref={setGroupRef} onLayout={() => { if (answerGroupRef.current) reveal(answerGroupRef.current); }} style={styles.group}>
      <Text style={styles.label}>Ответ на немецком</Text>
      <TextInput
        maxLength={maxLength}
        ref={inputRef}
        testID={inputTestID}
        accessibilityLabel="Ответ на немецком"
        accessibilityRole="text"
        placeholder="Ваш ответ"
        placeholderTextColor={theme.muted}
        value={value}
        selection={selection}
        onSelectionChange={handleSelectionChange}
        onChangeText={text => {
          setValue(text);
          setSelection({ start: text.length, end: text.length });
        }}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        returnKeyLabel="Проверить"
        onSubmitEditing={submit}
        onFocus={() => { if (answerGroupRef.current) reveal(answerGroupRef.current); }}
        style={[styles.input, disabled && styles.disabled]}
      />
      <View style={styles.characters}>
        {(['ä', 'ö', 'ü', 'ß'] as GermanCharacter[]).map(letter => (
          <Button key={letter} title={letter} disabled={disabled} onPress={() => addCharacter(letter)} />
        ))}
      </View>
      <Button title="Проверить" testID={submitTestID} disabled={disabled || !value.trim()} onPress={submit} />
    </View>
  );
});

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { color: theme.foreground, fontSize: 16, fontWeight: '600' },
  input: {
    minHeight: 56,
    backgroundColor: '#ffffff',
    color: theme.foreground,
    borderColor: theme.muted,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 18,
  },
  disabled: { opacity: 0.6 },
  characters: { flexDirection: 'row', gap: 8 },
});
