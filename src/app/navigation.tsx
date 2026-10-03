import React, { useState, useEffect } from 'react';
import { View, Text, BackHandler } from 'react-native';
import { ProfilesScreen } from '../features/profiles/ProfilesScreen';
import { ModelSetupScreen } from '../features/assistant/ModelSetupScreen';
import { DictionaryScreen } from '../features/dictionary/DictionaryScreen';
import { WordCardScreen } from '../features/dictionary/WordCardScreen';
import { WordEditorScreen } from '../features/dictionary/WordEditorScreen';
import { useActiveProfile } from './ActiveProfileProvider';
import { useAppServices, getTrainingServices } from './AppServices';
import { Button } from '../ui/Button';
import { TrainingScreen } from '../features/learning/TrainingScreen';
type Route = {
    screen: 'profiles' | 'model' | 'dictionary' | 'card' | 'editor' | 'training';
    wordId?: string;
    mode?: 'study' | 'review';
    fromTraining?: boolean;
};
export function Navigation() {
    const { profile } = useActiveProfile();
    return <NavigationRoutes key={profile?.id ?? 'no-profile'}/>;
}
function NavigationRoutes() {
    const app = useAppServices(), { db } = app, { profile } = useActiveProfile();
    const [route, setRoute] = useState<Route>({ screen: 'profiles' }), [error, setError] = useState('');
    async function navigate(target: Route) {
        try {
            if (profile && route.screen === 'training' && target.screen !== 'training') {
                const { sessions } = getTrainingServices(app), session = await sessions.resume(profile.id);
                if (session)
                    await sessions.cancelQuestion(profile.id, session.id);
            }
            setError('');
            setRoute(target);
        }
        catch (e) {
            setError(String(e));
        }
    }
    function back() {
        const screen = route.screen === 'editor' && route.wordId ? 'card' : route.fromTraining ? 'training' : 'dictionary';
        void navigate({ ...route, screen });
    }
    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (['card', 'editor', 'training'].includes(route.screen)) {
                back();
                return true;
            }
            return false;
        });
        return () => subscription.remove();
    });
    let content: React.ReactNode;
    if (route.screen === 'profiles')
        content = <ProfilesScreen />;
    else if (route.screen === 'model')
        content = <ModelSetupScreen />;
    else if (!profile)
        content = <Text>Сначала выберите профиль</Text>;
    else if (route.screen === 'training')
        content = <TrainingScreen key={`${profile.id}:${route.mode ?? 'study'}`} db={db} profileId={profile.id} selection={{ mode: route.mode ?? 'study' }} onReveal={wordId => setRoute({ screen: 'card', wordId, fromTraining: true, mode: route.mode })}/>;
    else if (route.screen === 'dictionary')
        content = <DictionaryScreen db={db} profileId={profile.id} onOpen={wordId => setRoute({ screen: 'card', wordId })} onCreate={() => setRoute({ screen: 'editor' })}/>;
    else if (route.screen === 'editor')
        content = <WordEditorScreen key={`${profile.id}:${route.wordId ?? 'new'}`} db={db} profileId={profile.id} wordId={route.wordId} onSaved={wordId => setRoute({ ...route, screen: 'card', wordId })} onCancel={back}/>;
    else
        content = <WordCardScreen db={db} profileId={profile.id} wordId={route.wordId!} onEdit={() => setRoute({ ...route, screen: 'editor' })} onBack={back}/>;
    return <View style={{ flex: 1 }}>{content}{error ? <Text accessibilityRole="alert">{error}</Text> : null}<View style={{ paddingHorizontal: 24, paddingBottom: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button title="Профили" onPress={() => void navigate({ screen: 'profiles' })}/><Button title="Словарь" disabled={!profile} onPress={() => void navigate({ screen: 'dictionary' })}/><Button title="Тренировка" disabled={!profile} onPress={() => void navigate({ screen: 'training', mode: 'study' })}/><Button title="Повторение" disabled={!profile} onPress={() => void navigate({ screen: 'training', mode: 'review' })}/><Button title="Локальная модель" onPress={() => void navigate({ screen: 'model' })}/></View></View>;
}
