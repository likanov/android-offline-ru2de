import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Button } from '../../ui/Button';
import type { ProgressRepository } from './progressRepository';
export function GoalSettings({ repository, profileId, goal }: {
    repository: ProgressRepository;
    profileId: string;
    goal: number;
}) {
    const [value, setValue] = useState(String(goal)), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function save() { setBusy(true); setError(''); try {
        await repository.setGoal(profileId, Number(value));
    }
    catch (e) {
        setError(String(e));
    }
    finally {
        setBusy(false);
    } }
    return <><Text>Дневная цель (1–200 правильных ответов)</Text><TextInput accessibilityLabel="Дневная цель" keyboardType="number-pad" value={value} onChangeText={setValue}/><Button title="Сохранить цель" disabled={busy} onPress={() => void save()}/>{error ? <Text accessibilityRole="alert">{error}</Text> : null}</>;
}
