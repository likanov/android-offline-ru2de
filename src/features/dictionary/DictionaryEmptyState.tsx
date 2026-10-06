import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../ui/Button';

export function DictionaryEmptyState({ loading, error, hasWords, query, hasFilters, onClearSearch, onResetFilters }: { loading: boolean; error: string | null; hasWords: boolean; query: string; hasFilters: boolean; onClearSearch: () => void; onResetFilters: () => void }) {
  if (loading) return <Text>Загрузка словаря…</Text>;
  if (error) return <Text accessibilityRole="alert">{error}</Text>;
  if (!hasWords && !query && !hasFilters) return <Text>В этом профиле пока нет слов.</Text>;
  return <View><Text>{hasWords ? 'По вашему запросу ничего не найдено.' : 'Для выбранных фильтров нет слов.'}</Text>{query ? <Button testID="dictionary-clear-search" title="Очистить поиск" onPress={onClearSearch}/> : null}{hasFilters ? <Button testID="dictionary-reset-filters" title="Сбросить фильтры" onPress={onResetFilters}/> : null}</View>;
}
