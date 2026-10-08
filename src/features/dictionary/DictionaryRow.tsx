import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DictionaryEntry } from './dictionaryTypes';
import { displayGerman, genderPresentation } from './wordValidation';
import { wordLearningLabel, wordPartLabel } from './dictionaryPresentation';
import { theme } from '../../ui/theme';

export function DictionaryRow({ entry, onOpen }: { entry: DictionaryEntry; onOpen: (wordId: string) => void }) {
  const gender = genderPresentation(entry);
  return <Pressable testID={`dictionary-row-${entry.id}`} accessibilityRole="button" accessibilityLabel={`${displayGerman(entry)} — ${entry.ru}`} onPress={() => onOpen(entry.id)} style={{ minHeight: 64, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#d5d0c7', backgroundColor: '#fff', marginBottom: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View accessibilityLabel={gender.label} style={{ width: 12, height: 40, borderRadius: 6, backgroundColor: gender.color ?? theme.muted }}/><View style={{ flex: 1 }}><Text style={{ fontSize: 17, fontWeight: '700', color: theme.foreground }}>{displayGerman(entry)} — {entry.ru}</Text><Text>{wordPartLabel(entry.pos)}</Text><Text>{wordLearningLabel(entry.learning)}{entry.learning.difficult ? ' · Трудное' : ''}</Text>{entry.learning.dueDay && entry.learning.mastered ? <Text>Повторение: {entry.learning.dueDay}</Text> : null}</View></View></Pressable>;
}
