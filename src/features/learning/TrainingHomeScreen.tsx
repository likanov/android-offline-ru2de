import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { TrainingSelection } from './questionTypes';
import type { GrammarProgressSummary } from '../grammar/grammarProgressRepository';
import type { GrammarSelection } from '../grammar/grammarTypes';
import { lektion2Lessons } from '../grammar/grammarPresentation';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { getGrammarServices, getProgressRepository } from '../../app/AppServices';
import { useCurrentDay } from '../../app/useCurrentDay';
import { subscribeProfileChanges } from '../../app/refreshBus';

export function TrainingHomeScreen({ db, profileId, onVocabulary, onGrammar }: {
  db: SqlStore;
  profileId: string;
  onVocabulary: (selection: TrainingSelection) => void;
  onGrammar: (selection: GrammarSelection) => void;
}) {
  const today = useCurrentDay();
  const [lektion2Open, setLektion2Open] = useState(false);
  const [words, setWords] = useState<{ mastered: number; totalWords: number; dueCount: number } | null>(null);
  const [grammar, setGrammar] = useState<{ mastered: number; totalTargets: number; dueCount: number } | null>(null);
  const [lessonSummaries, setLessonSummaries] = useState<Record<string, GrammarProgressSummary>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => void Promise.all([
      getProgressRepository({ db }).summary(profileId, today),
      getGrammarServices({ db }).progress.summary(profileId, today, 'mixed'),
      Promise.all(lektion2Lessons.map(async ({lesson}) => [lesson, await getGrammarServices({db}).progress.summary(profileId,today,lesson)] as const)),
    ]).then(([wordSummary, grammarSummary, lessons]) => {
      if (!alive) return;
      setWords({ mastered: wordSummary.mastered, totalWords: wordSummary.totalWords, dueCount: wordSummary.dueCount });
      setGrammar({ mastered: grammarSummary.mastered, totalTargets: grammarSummary.totalTargets, dueCount: grammarSummary.dueCount });
      setLessonSummaries(Object.fromEntries(lessons));
      setError('');
    }).catch(e => { if (alive) setError(String(e)); });
    load();
    const off = subscribeProfileChanges(profileId, load);
    return () => { alive = false; off(); };
  }, [db, profileId, today]);
  return <Screen>
    <Text accessibilityRole="header" style={{ fontSize: 28 }}>Тренировка</Text>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <View accessibilityRole="header"><Text style={{ fontSize: 20 }}>Слова</Text><Text>{words ? `Освоено: ${words.mastered} / ${words.totalWords}` : 'Загрузка…'}</Text><Text>К повторению: {words?.dueCount ?? 0}</Text></View>
    <Button title="Изучать слова" testID="training-vocabulary-start" disabled={!words || words.mastered >= words.totalWords} onPress={() => onVocabulary({ mode: 'study' })} />
    <Button title="Повторить слова" disabled={!words?.dueCount} onPress={() => onVocabulary({ mode: 'review' })} />
    <View accessibilityRole="header"><Text style={{ fontSize: 20 }}>Местоимения и sein</Text><Text>{grammar ? `Освоено: ${grammar.mastered} / ${grammar.totalTargets}` : 'Загрузка…'}</Text><Text>К повторению: {grammar?.dueCount ?? 0}</Text></View>
    <Button title="Изучать местоимения и sein" testID="training-grammar-start" disabled={!grammar || grammar.mastered >= grammar.totalTargets} onPress={() => onGrammar({ mode: 'study', lesson: 'mixed' })} />
    <Button title="Повторить грамматику" testID="grammar-review-start" disabled={!grammar?.dueCount} onPress={() => onGrammar({ mode: 'review', lesson: 'mixed' })} />
    <Text>Фильтр урока</Text>
    <Button title="Только местоимения" onPress={() => onGrammar({ mode: 'study', lesson: 'pronouns' })} />
    <Button title="Только sein" onPress={() => onGrammar({ mode: 'study', lesson: 'sein' })} />
    <Button title="Lektion 2 · Профессии и вопросы" variant="secondary" testID="training-lektion2-toggle" onPress={() => setLektion2Open(open => !open)} />
    {lektion2Open ? <View>{lektion2Lessons.map(({ lesson, title }) =>
      <View key={lesson}>
        <Text>{title} · К повторению: {lessonSummaries[lesson]?.dueCount ?? 0}</Text>
        <Button title={title} variant="ghost" testID={`training-lektion2-${lesson}`} onPress={() => onGrammar({ mode: 'study', lesson })} />
        <Button title={`Повторить: ${title}`} variant="secondary" testID={`training-lektion2-review-${lesson}`} disabled={!lessonSummaries[lesson]?.dueCount} onPress={() => onGrammar({ mode: 'review', lesson })} />
      </View>
    )}</View> : null}
  </Screen>;
}
