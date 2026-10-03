import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { SqlStore } from '../../core/sql';
import { addDays } from '../../core/calendar';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { useProgress } from './useProgress';
export function ProgressScreen({ db, profileId, today: override }: {
    db: SqlStore;
    profileId: string;
    today?: string;
}) {
    const { summary, error, today } = useProgress(db, profileId, override);
    const context = `${profileId}:${today}`;
    const [selected, setSelected] = useState({ context, month: today.slice(0, 7) });
    const month = selected.context === context ? selected.month : today.slice(0, 7);
    const days: string[] = [];
    for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1))
        days.push(day);
    function move(offset: number) { const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset); setSelected({ context, month: date.toISOString().slice(0, 7) }); }
    const labels = { translation: 'Перевод', writing: 'Письмо', article: 'Артикли', listening: 'Аудирование' };
    return <Screen><Text style={{ fontSize: 28 }}>Прогресс</Text>{error ? <Text accessibilityRole="alert">{error}</Text> : null}{summary ? <><Text>XP: {summary.xp}</Text><Text>Уровень: {summary.level}</Text><Text>До следующего уровня: {summary.xpToNextLevel} XP</Text><Text>Изучено: {summary.mastered} / {summary.totalWords}</Text><Text>Серия дней: {summary.dayStreak}</Text>{Object.values(summary.skills).every(s => !s.total) ? <Text>Ещё нет ответов</Text> : null}{(Object.keys(labels) as (keyof typeof labels)[]).map(skill => <Text key={skill}>{labels[skill]}: {summary.skills[skill].correct} / {summary.skills[skill].total}</Text>)}<Text>Календарь: {month}</Text><Button title="Предыдущий месяц" onPress={() => move(-1)}/><Button title="Следующий месяц" onPress={() => move(1)}/><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{days.map(day => { const correct = summary.calendar.find(d => d.day === day)?.correct ?? 0; return <Text key={day} accessibilityLabel={`${day}: ${correct} правильных`} style={{ width: 64, padding: 8, backgroundColor: correct ? '#d7eadc' : '#eeeeee' }}>{Number(day.slice(-2))}: {correct}</Text>; })}</View></> : <Text>Загрузка…</Text>}</Screen>;
}
