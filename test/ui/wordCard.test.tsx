import { View } from 'react-native';
import { GenderCard } from '../../src/features/dictionary/GenderCard';
import { theme } from '../../src/ui/theme';
import { DictionaryRow } from '../../src/features/dictionary/DictionaryRow';
import type { DictionaryEntry } from '../../src/features/dictionary/dictionaryTypes';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { WordCardScreen } from '../../src/features/dictionary/WordCardScreen';

const silentAudio = { available: async () => false, play: async () => {}, stop: async () => {} } as any;

test('card_shows_new_started_mastered_difficult_and_next_review', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  const word = (await h.words.list(profile.id))[0];
  await h.db.run('UPDATE word_progress SET streak=20,learned=1,dueDate=?,difficult=1 WHERE wordId=?', ['2026-10-07', word.id]);
  render(<WordCardScreen db={h.db} profileId={profile.id} profileName={profile.name} wordId={word.id} audio={silentAudio} onEdit={() => {}} onBack={() => {}}/>);
  expect(await screen.findByText('Профиль: A')).toBeTruthy();
  expect(await screen.findByText('Изучено · Трудное')).toBeTruthy();
  expect(screen.getByText('Следующее повторение: 07.10.2026')).toBeTruthy();
  h.close();
});

test('mastered_word_without_due_day_has_explicit_unscheduled_state', async () => {
  const h = await createWordHarness();
  const profile = await createProfile(h.db, 'A');
  const word = (await h.words.list(profile.id))[0];
  await h.db.run('UPDATE word_progress SET streak=20,learned=1,dueDate=NULL WHERE wordId=?', [word.id]);
  render(<WordCardScreen db={h.db} profileId={profile.id} wordId={word.id} audio={silentAudio} onEdit={() => {}} onBack={() => {}}/>);
  expect(await screen.findByText('Повторение пока не назначено')).toBeTruthy();
  h.close();
});

test('offline_voice_absent_does_not_block_non_noun_card',async()=>{
 const h=await createWordHarness();const p=await createProfile(h.db,'A');
 const word=await h.words.create(p.id,{de:'sechzehn',ru:'шестнадцать',pos:'number',gender:null,plural:null,note:''});
 render(<WordCardScreen db={h.db} profileId={p.id} wordId={word.id} audio={silentAudio} onEdit={()=>{}} onBack={()=>{}} onPractice={()=>{}}/>);
 expect(await screen.findByText('sechzehn')).toBeTruthy();expect(screen.getByText('Числительное')).toBeTruthy();expect(await screen.findByText('Офлайн-озвучка недоступна')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Редактировать'})).toBeTruthy();expect(screen.getByRole('button',{name:'Практика с пропуском'})).toBeTruthy();expect(screen.queryByText(/род/i)).toBeNull();h.close();
});

test.each([
 ['number','Числительное'],['verb','Глагол'],['pronoun','Местоимение'],['adverb','Наречие'],['preposition','Предлог'],['conjunction','Союз'],['phrase','Выражение'],['adjective','Прилагательное'],
] as const)('non_nouns_have_no_gender_or_article_and_show_type_%s',(pos,label)=>{
 const entry:DictionaryEntry={id:'w',profileId:'p',de:'Sie',ru:'Вы',pos,gender:null,plural:null,exampleDe:null,exampleRu:null,note:'',topicIds:[],learning:{streak:0,mastered:false,difficult:false,dueDay:null,started:false}};
 render(<DictionaryRow entry={entry} onOpen={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Sie — Вы'})).toBeTruthy();expect(screen.getByText(label)).toBeTruthy();expect(screen.queryByText(/род/i)).toBeNull();
});

test.each(['number','verb','pronoun','adverb','preposition','conjunction','phrase','adjective'] as const)('non_noun_card_%s_has_neutral_background',pos=>{
 const word={id:'w',profileId:'p',de:'Sie',ru:'Вы',pos,gender:null,plural:null,exampleDe:null,exampleRu:null,note:''};
 const view=render(<GenderCard word={word}/>);expect(view.UNSAFE_getByType(View).props.style.backgroundColor).toBe(theme.background);expect(screen.getByText('Sie')).toBeTruthy();
});
