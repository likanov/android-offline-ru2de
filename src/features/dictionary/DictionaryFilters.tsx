import React from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import type { Topic } from '../topics/topicRepository';
import type { WordFilter } from './wordRepository';
import { DictionaryFilterChip } from './DictionaryFilterChip';

export function DictionaryFilters({ filter, topics, expanded, onChange, onExpandedChange }: { filter: WordFilter; topics: Topic[]; expanded: boolean; onChange: (filter: WordFilter) => void; onExpandedChange: (value: boolean) => void }) {
  const state = filter.state ?? 'all';
  return <View><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"><DictionaryFilterChip label="Все" selected={state === 'all'} onPress={() => onChange({ ...filter, state: 'all' })}/><DictionaryFilterChip label="Не изучены" selected={state === 'learning'} onPress={() => onChange({ ...filter, state: 'learning' })}/><DictionaryFilterChip label="Изучены" selected={state === 'mastered'} onPress={() => onChange({ ...filter, state: 'mastered' })}/></ScrollView><DictionaryFilterChip testID="dictionary-filters-toggle" label={expanded ? 'Скрыть фильтры' : 'Фильтры'} selected={expanded} onPress={() => onExpandedChange(!expanded)}/>{expanded ? <View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text>Только трудные</Text><Switch accessibilityLabel="Только трудные" value={filter.difficult === true} onValueChange={value => onChange({ ...filter, difficult: value ? true : undefined })}/></View><Text>Темы</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}><DictionaryFilterChip label="Все темы" selected={!filter.topicId} onPress={() => onChange({ ...filter, topicId: undefined })}/>{topics.map(topic => <DictionaryFilterChip key={topic.id} label={topic.name} selected={filter.topicId === topic.id} onPress={() => onChange({ ...filter, topicId: topic.id })}/>)}</ScrollView></View> : null}</View>;
}
