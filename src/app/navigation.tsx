import { AssistantScreen } from '../features/assistant/AssistantScreen';
import { ErrorExplanationScreen } from '../features/assistant/ErrorExplanationScreen';
import { GrammarExplanationScreen } from '../features/assistant/GrammarExplanationScreen';
import { PracticeScreen } from '../features/assistant/PracticeScreen';
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
import { useAppServices, getTrainingServices, getProgressRepository, getReminderService, getCsvImportService, getBackupService, getMemoryAssistant } from './AppServices';
import { NavigationMenu } from './NavigationMenu';
import { ReviewsScreen } from '../features/reviews/ReviewsScreen';
import { DifficultWordsScreen } from '../features/reviews/DifficultWordsScreen';
import type { TrainingSelection } from '../features/learning/questionTypes';
import { TrainingScreen } from '../features/learning/TrainingScreen';
import { TrainingHomeScreen } from '../features/learning/TrainingHomeScreen';
import { GrammarTrainingScreen } from '../features/grammar/GrammarTrainingScreen';
import { GrammarReferenceScreen } from '../features/grammar/GrammarReferenceScreen';
import type { GrammarSelection } from '../features/grammar/grammarTypes';
type Route = {
    screen: 'profiles' | 'assistant' | 'error-explanation' | 'grammar-explanation' | 'practice' | 'model' | 'dictionary' | 'card' | 'editor' | 'training' | 'training-home' | 'grammar-training' | 'grammar-reference' | 'reviews' | 'difficult' | 'topics' | 'today' | 'progress' | 'reminders' | 'transfer';
    wordId?: string;
    attemptId?: string;
    practiceKind?: 'cloze' | 'difficult';
    mode?: 'study' | 'review';
    fromTraining?: boolean;
    wordIds?: string[];
    grammarSelection?: GrammarSelection;
    grammarAttemptId?: string;
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
            if (profile && route.screen === 'training' && !['training', 'training-home', 'grammar-training', 'grammar-reference'].includes(target.screen)) {
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
        if (route.screen === 'practice' && route.wordIds?.[0]) {
            void navigate({ screen: 'card', wordId: route.wordIds[0] });
        } else if (route.screen === 'error-explanation') {
            void navigate({ screen: 'training', mode: route.mode, wordIds: route.wordIds });
        } else if (route.screen === 'grammar-explanation') {
            void navigate({ screen: 'grammar-training', grammarSelection: route.grammarSelection });
        } else if (route.screen === 'grammar-reference') {
            void navigate({ screen: 'grammar-training', grammarSelection: route.grammarSelection, grammarAttemptId: route.grammarAttemptId });
        } else if (route.screen === 'grammar-training' || route.screen === 'training-home') {
            void navigate({ screen: 'training-home' });
        } else if (route.screen === 'assistant' && route.wordId) {
            void navigate({ ...route, screen: 'card' });
        } else if (route.screen === 'editor' && route.wordId) {
            void navigate({ ...route, screen: 'card' });
        } else if (route.screen === 'card' && route.fromTraining) {
            void navigate({ screen: 'training', mode: route.mode, wordIds: route.wordIds });
        } else {
            void navigate({ screen: 'dictionary' });
        }
    }
    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (['assistant', 'error-explanation', 'grammar-explanation', 'practice', 'card', 'editor', 'training', 'training-home', 'grammar-training', 'grammar-reference', 'reviews', 'difficult', 'topics', 'transfer'].includes(route.screen)) {
                back();
                return true;
            }
            return false;
        });
        return () => subscription.remove();
    });
    const startQueue = (selection: TrainingSelection) => setRoute({ screen: 'training', mode: selection.mode, wordIds: selection.wordIds });
    const startGrammar = (selection: GrammarSelection) => setRoute({ screen: 'grammar-training', grammarSelection: selection });
    let content: React.ReactNode;
    if (route.screen === 'profiles')
        content = <ProfilesScreen />;
    else if (route.screen === 'model')
        content = <ModelSetupScreen />;
    else if (route.screen === 'transfer')
        content = <TransferScreen profileId={profile?.id} csv={getCsvImportService(app)} backup={getBackupService(app)}/>;
    else if (!profile)
        content = <Text>Сначала выберите профиль</Text>;
    else if (route.screen === 'assistant')
        content = <AssistantScreen db={db} profileId={profile.id} wordId={route.wordId!} assistant={getMemoryAssistant(app)} onModelSetup={() => void navigate({screen:'model'})} onBack={back}/>;
    else if (route.screen === 'error-explanation')
        content = <ErrorExplanationScreen profileId={profile.id} attemptId={route.attemptId!} assistant={getMemoryAssistant(app)} onModelSetup={() => void navigate({screen:'model'})} onBack={back}/>;
    else if (route.screen === 'grammar-explanation')
        content = <GrammarExplanationScreen db={db} profileId={profile.id} attemptId={route.grammarAttemptId!} assistant={getMemoryAssistant(app)} onModelSetup={() => void navigate({screen:'model'})} onBack={back}/>;
    else if (route.screen === 'practice')
        content = <PracticeScreen db={db} profileId={profile.id} request={{ kind: route.practiceKind ?? 'cloze', profileId: profile.id, wordIds: route.wordIds! }} assistant={getMemoryAssistant(app)} onBack={back}/>;
    else if (route.screen === 'today')
        content = <TodayScreen db={db} profileId={profile.id} onStart={startQueue} onGrammar={startGrammar} onProgress={() => setRoute({screen:'progress'})}/>;
    else if (route.screen === 'reminders')
        content = <ReminderSettings key={profile.id} profileId={profile.id} progress={getProgressRepository(app)} service={app.reminders ?? getReminderService(app)}/>;
    else if (route.screen === 'progress')
        content = <ProgressScreen db={db} profileId={profile.id}/>;
    else if (route.screen === 'topics')
        content = <TopicsScreen db={db} profileId={profile.id} onStart={startQueue}/>;
    else if (route.screen === 'reviews')
        content = <ReviewsScreen db={db} profileId={profile.id} onStart={startQueue}/>;
    else if (route.screen === 'difficult')
        content = <DifficultWordsScreen db={db} profileId={profile.id} onStart={startQueue} onPractice={wordIds => setRoute({ screen: 'practice', practiceKind: 'difficult', wordIds })}/>;
    else if (route.screen === 'training-home')
        content = <TrainingHomeScreen db={db} profileId={profile.id} onVocabulary={startQueue} onGrammar={startGrammar}/>;
    else if (route.screen === 'grammar-training')
        content = <GrammarTrainingScreen key={`${profile.id}:${JSON.stringify(route.grammarSelection ?? {mode:'study',lesson:'mixed'})}`} db={db} profileId={profile.id} selection={route.grammarSelection ?? {mode:'study',lesson:'mixed'}} onReference={() => setRoute({ screen: 'grammar-reference', grammarSelection: route.grammarSelection, grammarAttemptId: route.grammarAttemptId })} onExplainError={attemptId => setRoute({ screen: 'grammar-explanation', grammarSelection: route.grammarSelection, grammarAttemptId: attemptId })}/>;
    else if (route.screen === 'grammar-reference')
        content = <GrammarReferenceScreen onBack={back}/>;
    else if (route.screen === 'training')
        content = <TrainingScreen key={`${profile.id}:${route.mode ?? 'study'}`} db={db} profileId={profile.id} selection={{ mode: route.mode ?? 'study', wordIds: route.wordIds }} onHelper={wordId => setRoute({screen:'assistant', wordId, fromTraining:true, mode:route.mode, wordIds:route.wordIds})} onExplainError={attemptId => setRoute({ screen: 'error-explanation', attemptId, mode: route.mode, wordIds: route.wordIds })} onReveal={wordId => setRoute({ screen: 'card', wordId, fromTraining: true, mode: route.mode, wordIds: route.wordIds })}/>;
    else if (route.screen === 'dictionary')
        content = <DictionaryScreen db={db} profileId={profile.id} onOpen={wordId => setRoute({ screen: 'card', wordId })} onCreate={() => setRoute({ screen: 'editor' })}/>;
    else if (route.screen === 'editor')
        content = <WordEditorScreen key={`${profile.id}:${route.wordId ?? 'new'}`} db={db} profileId={profile.id} wordId={route.wordId} onSaved={wordId => setRoute({ ...route, screen: 'card', wordId })} onCancel={back}/>;
    else
        content = <WordCardScreen db={db} profileId={profile.id} wordId={route.wordId!} onAssistant={() => void navigate({ ...route, screen: 'assistant' })} onPractice={() => setRoute({ screen: 'practice', practiceKind: 'cloze', wordIds: [route.wordId!] })} onEdit={() => setRoute({ ...route, screen: 'editor' })} onBack={back}/>;
    const active = ['card', 'editor', 'assistant', 'error-explanation', 'grammar-explanation', 'practice'].includes(route.screen)
        ? route.fromTraining ? 'training' : 'dictionary'
        : (['training-home', 'grammar-training', 'grammar-reference'].includes(route.screen) ? 'training' : route.screen as React.ComponentProps<typeof NavigationMenu>['active']);
    return <View style={{ flex: 1 }}>{content}{error ? <Text accessibilityRole="alert">{error}</Text> : null}<NavigationMenu active={active} hasProfile={!!profile} onNavigate={screen => void navigate(screen === 'training' ? { screen: 'training-home' } : { screen })}/></View>;
}
