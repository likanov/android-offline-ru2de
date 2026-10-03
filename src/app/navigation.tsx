import React, { useState, useEffect } from 'react';
import { View, Text, BackHandler } from 'react-native';
import { ProfilesScreen } from '../features/profiles/ProfilesScreen';
import { ModelSetupScreen } from '../features/assistant/ModelSetupScreen';
import { DictionaryScreen } from '../features/dictionary/DictionaryScreen';
import { WordCardScreen } from '../features/dictionary/WordCardScreen';
import { WordEditorScreen } from '../features/dictionary/WordEditorScreen';
import { useActiveProfile } from './ActiveProfileProvider';
import { useAppServices } from './AppServices';
import { Button } from '../ui/Button';
type Route = {
    screen: 'profiles' | 'model' | 'dictionary' | 'card' | 'editor';
    wordId?: string;
};
export function Navigation() {
    const { profile } = useActiveProfile();
    return <NavigationRoutes key={profile?.id ?? 'no-profile'}/>;
}
function NavigationRoutes() {
    const { db } = useAppServices(), { profile } = useActiveProfile(), [route, setRoute] = useState<Route>({ screen: 'profiles' });
    const back = () => setRoute({ screen: route.screen === 'editor' && route.wordId ? 'card' : 'dictionary', wordId: route.wordId });
    useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (route.screen === 'card' || route.screen === 'editor') {
        back();
        return true;
    } return false; }); return () => subscription.remove(); });
    return <View style={{ flex: 1 }}>
 {route.screen === 'profiles' ? <ProfilesScreen /> : route.screen === 'model' ? <ModelSetupScreen /> : !profile ? <Text>Сначала выберите профиль</Text> : route.screen === 'dictionary' ? <DictionaryScreen db={db} profileId={profile.id} onOpen={wordId => setRoute({ screen: 'card', wordId })} onCreate={() => setRoute({ screen: 'editor' })}/> : route.screen === 'editor' ? <WordEditorScreen key={`${profile.id}:${route.wordId ?? 'new'}`} db={db} profileId={profile.id} wordId={route.wordId} onSaved={wordId => setRoute({ screen: 'card', wordId })} onCancel={back}/> : <WordCardScreen db={db} profileId={profile.id} wordId={route.wordId!} onEdit={() => setRoute({ ...route, screen: 'editor' })} onBack={() => setRoute({ screen: 'dictionary' })}/>}
 <View style={{ paddingHorizontal: 24, paddingBottom: 16, flexDirection: 'row', gap: 8 }}><Button title="Профили" onPress={() => setRoute({ screen: 'profiles' })}/><Button title="Словарь" disabled={!profile} onPress={() => setRoute({ screen: 'dictionary' })}/><Button title="Локальная модель" onPress={() => setRoute({ screen: 'model' })}/></View>
 </View>;
}
