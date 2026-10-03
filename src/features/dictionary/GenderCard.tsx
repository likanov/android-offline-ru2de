import React from 'react';
import { Text, View } from 'react-native';
import type { Word } from '../learning/learningTypes';
import { displayGerman, genderPresentation } from './wordValidation';
import { wordIcons } from '../../ui/IconPicker';
import { theme } from '../../ui/theme';
export function GenderCard({ word, hideGender = false }: {
    word: Word;
    hideGender?: boolean;
}) {
    const presentation = genderPresentation(word), color = hideGender ? null : presentation.color;
    return <View style={{ backgroundColor: color ?? theme.background, padding: 28, borderRadius: 20, minHeight: 180, justifyContent: 'center', gap: 12 }}>
 <Text style={{ fontSize: 40 }}>{wordIcons.find(i => i.id === word.icon)?.glyph}</Text>
 <Text style={{ fontSize: 32, fontWeight: '700', color: color ? '#fff' : theme.foreground }}>{hideGender ? word.de : displayGerman(word)}</Text>
 {!hideGender && <Text style={{ color: color ? '#fff' : theme.foreground }}>{presentation.label}</Text>}
 </View>;
}
