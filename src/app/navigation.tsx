import { TransferScreen } from '../features/transfer/TransferScreen';
import { ReminderSettings } from '../features/reminders/ReminderSettings';
import { TodayScreen } from '../features/progress/TodayScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { TopicsScreen } from '../features/topics/TopicsScreen';
import React, { useState, useEffect } from 'react';
import { View, Text, BackHandler } from 'react-native';
import { ProfilesScreen } from '../features/profiles/ProfilesScreen';
import { ModelSetupScreen } from '../features/assistant/ModelSetupScreen';
import { DictionaryScreen } from '../features/dictionary/DictionaryScreen';
import { WordCardScreen } from '../features/dictionary/WordCardScreen';
import { WordEditorScreen } from '../features/dictionary/WordEditorScreen';
import { useActiveProfile } from './ActiveProfileProvider';
import { useAppServices, getTrainingServices, getProgressRepository, getReminderService, getCsvImportService } from './AppServices';
import { Button } from '../ui/Button';
import { ReviewsScreen } from '../features/reviews/ReviewsScreen';
import { DifficultWordsScreen } from '../features/reviews/DifficultWordsScreen';
import type { TrainingSelection } from '../features/learning/questionTypes';
import { TrainingScreen } from '../features/learning/TrainingScreen';
type Route = {
    screen: 'profiles' | 'model' | 'dictionary' | 'card' | 'editor' | 'training' | 'reviews' | 'difficult' | 'topics' | 'today' | 'progress' | 'reminders' | 'transfer';
    wordId?: string;
    mode?: 'study' | 'review';
    fromTraining?: boolean;
    wordIds?: string[];
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
        if (route.screen === 'editor' && route.wordId) {
            void navigate({ ...route, screen: 'card' });
        } else if (route.screen === 'card' && route.fromTraining) {
            void navigate({ screen: 'training', mode: route.mode, wordIds: route.wordIds });
        } else {
            void navigate({ screen: 'dictionary' });
        }
    }
    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (['card', 'editor', 'training', 'reviews', 'difficult', 'topics', 'transfer'].includes(route.screen)) {
                back();
                return true;
            }
            return false;
        });
        return () => subscription.remove();
    });
    const startQueue = (selection: TrainingSelection) => setRoute({ screen: 'training', mode: selection.mode, wordIds: selection.wordIds });
    let content: React.ReactNode;
    if (route.screen === 'profiles')
        content = <ProfilesScreen />;
    else if (route.screen === 'model')
        content = <ModelSetupScreen />;
    else if (!profile)
        content = <Text>Сначала выберите профиль</Text>;
    else if (route.screen === 'today')
        content = <TodayScreen db={db} profileId={profile.id} onStart={startQueue} onProgress={() => setRoute({screen:'progress'})}/>;
    else if (route.screen === 'reminders')
        content = <ReminderSettings key={profile.id} profileId={profile.id} progress={getProgressRepository(app)} service={app.reminders ?? getReminderService(app)}/>;
    else if (route.screen === 'progress')
        content = <ProgressScreen db={db} profileId={profile.id}/>;
    else if (route.screen === 'transfer')
        content = <TransferScreen key={profile.id} profileId={profile.id} csv={getCsvImportService(app)}/>;
    else if (route.screen === 'topics')
        content = <TopicsScreen db={db} profileId={profile.id} onStart={startQueue}/>;
    else if (route.screen === 'reviews')
        content = <ReviewsScreen db={db} profileId={profile.id} onStart={startQueue}/>;
    else if (route.screen === 'difficult')
        content = <DifficultWordsScreen db={db} profileId={profile.id} onStart={startQueue}/>;
    else if (route.screen === 'training')
        content = <TrainingScreen key={`${profile.id}:${route.mode ?? 'study'}`} db={db} profileId={profile.id} selection={{ mode: route.mode ?? 'study', wordIds: route.wordIds }} onReveal={wordId => setRoute({ screen: 'card', wordId, fromTraining: true, mode: route.mode, wordIds: route.wordIds })}/>;
    else if (route.screen === 'dictionary')
        content = <DictionaryScreen db={db} profileId={profile.id} onOpen={wordId => setRoute({ screen: 'card', wordId })} onCreate={() => setRoute({ screen: 'editor' })}/>;
    else if (route.screen === 'editor')
        content = <WordEditorScreen key={`${profile.id}:${route.wordId ?? 'new'}`} db={db} profileId={profile.id} wordId={route.wordId} onSaved={wordId => setRoute({ ...route, screen: 'card', wordId })} onCancel={back}/>;
    else
        content = <WordCardScreen db={db} profileId={profile.id} wordId={route.wordId!} onEdit={() => setRoute({ ...route, screen: 'editor' })} onBack={back}/>;
    return <View style={{ flex: 1 }}>{content}{error ? <Text accessibilityRole="alert">{error}</Text> : null}<View style={{ paddingHorizontal: 24, paddingBottom: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button title="Профили" onPress={() => void navigate({ screen: 'profiles' })}/><Button title="Сегодня" disabled={!profile} onPress={() => void navigate({ screen: 'today' })}/><Button title="Прогресс" disabled={!profile} onPress={() => void navigate({ screen: 'progress' })}/><Button title="Словарь" disabled={!profile} onPress={() => void navigate({ screen: 'dictionary' })}/><Button title="Тренировка" disabled={!profile} onPress={() => void navigate({ screen: 'training', mode: 'study' })}/><Button title="Повторение" disabled={!profile} onPress={() => void navigate({ screen: 'reviews' })}/><Button title="Наборы" disabled={!profile} onPress={() => void navigate({ screen: 'topics' })}/><Button title="Трудные" disabled={!profile} onPress={() => void navigate({ screen: 'difficult' })}/><Button title="Напоминания" disabled={!profile} onPress={() => void navigate({ screen: 'reminders' })}/><Button title="Импорт CSV" disabled={!profile} onPress={() => void navigate({ screen: 'transfer' })}/><Button title="Локальная модель" onPress={() => void navigate({ screen: 'model' })}/></View></View>;
}
