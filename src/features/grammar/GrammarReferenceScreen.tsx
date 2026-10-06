import React from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
export function GrammarReferenceScreen({ onBack }: { onBack: () => void }) {
  return <Screen><Text accessibilityRole="header" style={{ fontSize: 28 }}>Справочник</Text><Text>Личные местоимения</Text><View><Text>1 лицо: ich — я, wir — мы</Text><Text>2 лицо: du — ты, ihr — вы</Text><Text>3 лицо: er — он, sie — она, es — оно, sie — они</Text><Text>Вежливое обращение: Sie — Вы</Text></View><Text>Глагол sein в настоящем времени</Text><View><Text>ich bin · du bist · er/sie/es ist</Text><Text>wir sind · ihr seid · sie/Sie sind</Text></View><Button title="Назад к заданию" onPress={onBack} /></Screen>;
}
