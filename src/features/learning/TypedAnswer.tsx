import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from '../../ui/Button';
export function TypedAnswer({ onSubmit, disabled = false }: {
    onSubmit: (answer: string) => void;
    disabled?: boolean;
}) { const [value, setValue] = useState(''); return <View><TextInput accessibilityLabel="Ответ на немецком" value={value} onChangeText={setValue} editable={!disabled} autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => { if (!disabled)
    onSubmit(value); }}/><View style={{ flexDirection: 'row', gap: 8 }}>{['ä', 'ö', 'ü', 'ß'].map(letter => <Button key={letter} title={letter} disabled={disabled} onPress={() => setValue(v => v + letter)}/>)}</View><Button title="Проверить" disabled={disabled || !value.trim()} onPress={() => onSubmit(value)}/></View>; }
