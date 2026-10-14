import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import type { SqlStore } from '../../core/sql';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';
import type { DictionaryEntry } from './dictionaryTypes';
import { filterDictionaryEntries } from './dictionaryRepository';
import { DictionaryEmptyState } from './DictionaryEmptyState';
import { DictionaryFilters } from './DictionaryFilters';
import { DictionaryRow } from './DictionaryRow';
import { useDictionaryData } from './useDictionaryData';
import type { DictionaryViewState } from './dictionaryViewState';
import { initialDictionaryViewState } from './dictionaryViewState';

export function DictionaryScreen({ db, profileId, profileName = '', viewState: controlledViewState, onViewStateChange: controlledOnViewStateChange, onOpen, onCreate }: { db: SqlStore; profileId: string; profileName?: string; viewState?: DictionaryViewState; onViewStateChange?: (value: DictionaryViewState) => void; onOpen: (id: string) => void; onCreate: () => void }) {
  const [localViewState, setLocalViewState] = useState(controlledViewState ?? initialDictionaryViewState());
  const viewState = controlledViewState ?? localViewState;
  const onViewStateChange = controlledOnViewStateChange ?? setLocalViewState;
  const { snapshot, status, error } = useDictionaryData(db, profileId);
  const list = useRef<FlatList<DictionaryEntry>>(null);
  const offset = useRef(viewState.scrollOffset);
  const entries = snapshot ? filterDictionaryEntries(snapshot, viewState.filter) : [];
  const hasFilters = !!viewState.filter.topicId || viewState.filter.difficult === true || viewState.filter.state !== 'all';
  const updateFilter = useCallback((filter: typeof viewState.filter) => { offset.current = 0; onViewStateChange({ ...viewState, filter, scrollOffset: 0 }); }, [onViewStateChange, viewState]);
  useEffect(() => { offset.current = viewState.scrollOffset; }, [viewState.scrollOffset]);
  useEffect(() => { if (snapshot && viewState.scrollOffset > 0) list.current?.scrollToOffset({ offset: viewState.scrollOffset, animated: false }); }, [snapshot, viewState.scrollOffset]);
  const open = (id: string) => { onViewStateChange({ ...viewState, scrollOffset: offset.current }); onOpen(id); };
  const header = <View style={{ gap: 8 }}><Text style={{ fontSize: 28, fontWeight: '700', color: theme.foreground }}>Словарь</Text><Text>Профиль: {profileName}</Text><Text>Поиск</Text><TextInput testID="dictionary-search" accessibilityLabel="Поиск слов" placeholder="Слово или перевод" value={viewState.filter.query ?? ''} onChangeText={query => updateFilter({ ...viewState.filter, query })} style={{ borderWidth: 1, borderColor: theme.muted, padding: 12, borderRadius: 10, backgroundColor: '#fff', minHeight: 48 }}/><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text testID="dictionary-count">Найдено: {entries.length}</Text><Button testID="dictionary-add" title="Добавить слово" onPress={onCreate}/></View><DictionaryFilters filter={viewState.filter} topics={snapshot?.topics ?? []} expanded={viewState.filtersExpanded} onChange={updateFilter} onExpandedChange={filtersExpanded => onViewStateChange({ ...viewState, filtersExpanded })}/>{viewState.filter.query ? <Button testID="dictionary-clear-search" title="Очистить поиск" onPress={() => updateFilter({ ...viewState.filter, query: '' })}/> : null}{hasFilters ? <Button testID="dictionary-reset-filters" title="Сбросить фильтры" onPress={() => updateFilter({ ...viewState.filter, state: 'all', topicId: undefined, difficult: undefined })}/> : null}</View>;
  const empty = <DictionaryEmptyState loading={status === 'loading'} error={error} hasWords={(snapshot?.entries.length ?? 0) > 0} query={viewState.filter.query ?? ''} hasFilters={hasFilters} onClearSearch={() => updateFilter({ ...viewState.filter, query: '' })} onResetFilters={() => updateFilter({ ...viewState.filter, state: 'all', topicId: undefined, difficult: undefined })}/>;
  const useVirtualizedList = (snapshot?.entries.length ?? 0) > 100;
  const content = useVirtualizedList ? <FlatList ref={list} testID="dictionary-list" data={entries} keyExtractor={entry => entry.id} initialNumToRender={40} maxToRenderPerBatch={40} ListHeaderComponent={header} ListEmptyComponent={empty} renderItem={({ item }) => <DictionaryRow entry={item} onOpen={open}/>} contentContainerStyle={{ padding: 24, paddingTop: 48, paddingBottom: 120 }} keyboardShouldPersistTaps="handled" onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={100} onContentSizeChange={() => { if (viewState.scrollOffset > 0) list.current?.scrollToOffset({ offset: viewState.scrollOffset, animated: false }); }}/> : <ScrollView testID="dictionary-list" contentContainerStyle={{ padding: 24, paddingTop: 48, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">{header}{entries.length ? entries.map(entry => <DictionaryRow key={entry.id} entry={entry} onOpen={open}/>) : empty}</ScrollView>;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{content}</KeyboardAvoidingView>;
}
