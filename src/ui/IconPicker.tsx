import React from 'react';
import { Text, View } from 'react-native';
import { Button } from './Button';
export const wordIcons = [{ id: 'book', label: 'книга', glyph: '📖' }, { id: 'chair', label: 'стул', glyph: '🪑' }, { id: 'home', label: 'дом', glyph: '🏠' }, { id: 'flower', label: 'цветок', glyph: '🌷' }, { id: 'train', label: 'поезд', glyph: '🚆' }, { id: 'star', label: 'звезда', glyph: '⭐' }];
export function IconPicker({ value, onChange }: {
    value: string | null;
    onChange: (value: string | null) => void;
}) {
    return <View><Text>Иконка: {wordIcons.find(i => i.id === value)?.glyph ?? 'без иконки'}</Text>{wordIcons.map(icon => <Button key={icon.id} title={`Иконка: ${icon.label}`} onPress={() => onChange(icon.id)}/>)}<Button title="Без иконки" onPress={() => onChange(null)}/></View>;
}
