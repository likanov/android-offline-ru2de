import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';
import type { Lektion3NounId } from './lektion3Types';

export function GrammarMultiChoiceAnswer({ options, disabled, onSubmit }: {
  options: { id: Lektion3NounId; label: string }[];
  disabled: boolean;
  onSubmit: (optionIds: Lektion3NounId[]) => void;
}) {
  const [selected, setSelected] = useState<Lektion3NounId[]>([]);
  function toggle(id: Lektion3NounId) {
    if (disabled) return;
    setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  }
  return <View style={styles.group}>
    <ScrollView nestedScrollEnabled style={styles.options}>
      {options.map(option => {
        const checked = selected.includes(option.id);
        return <Pressable key={option.id} testID={`grammar-multi-option-${option.id}`}
          accessibilityRole="checkbox" accessibilityLabel={option.label}
          accessibilityState={{ checked, disabled }} disabled={disabled}
          onPress={() => toggle(option.id)} style={[styles.option, checked && styles.selected, disabled && styles.disabled]}>
          <Text style={styles.label}>{checked ? '☑' : '☐'} {option.label}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <Button title="Проверить" testID="grammar-multi-submit" disabled={disabled || selected.length === 0}
      onPress={() => { if (!disabled && selected.length) onSubmit([...selected]); }} />
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: 8 },
  options: { maxHeight: 360 },
  option: { minHeight: 56, justifyContent: 'center', padding: 12, marginVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: theme.muted, backgroundColor: '#fff' },
  selected: { borderColor: theme.primary, borderWidth: 2, backgroundColor: '#e3f0ed' },
  disabled: { opacity: 0.45 },
  label: { fontSize: 18, color: theme.foreground },
});
