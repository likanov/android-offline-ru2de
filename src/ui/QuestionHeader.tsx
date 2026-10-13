import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { LearningState } from '../features/learning/learningTypes';

export function QuestionHeader({ title, profileName, mode, state, requiredCorrect = 20 }: { title: string; profileName?: string; mode: 'study' | 'review'; state: LearningState | null; requiredCorrect?: 10 | 20 }) {
  return <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {profileName ? <Text style={styles.profile}>Профиль: {profileName}</Text> : null}
    {mode === 'review' ? <Text style={styles.progress}>Повторение · Изучено</Text> : state ? <Text style={styles.progress}>Серия: {state.streak}/{requiredCorrect}</Text> : <Text style={styles.progress}>Прогресс загружается…</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  title: { fontSize: 28, color: '#152c38' },
  profile: { fontSize: 15, color: '#53676c' },
  progress: { fontSize: 16, color: '#152c38' },
});
