import React from 'react';
import { Pressable, Text } from 'react-native';
import { theme } from '../../ui/theme';

export function DictionaryFilterChip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: selected ? theme.primary : theme.muted, backgroundColor: selected ? theme.primary : 'transparent', marginRight: 8, marginBottom: 8 }}><Text style={{ color: selected ? '#fff' : theme.foreground, fontWeight: '600' }}>{label}</Text></Pressable>;
}
