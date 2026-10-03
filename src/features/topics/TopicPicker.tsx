import React from 'react';
import { Text, Pressable } from 'react-native';
import type { Topic } from './topicRepository';
import { theme } from '../../ui/theme';
export function TopicPicker({ topics, value, onChange, disabled=false }: {
 topics: Topic[]; value: string[]; onChange: (ids:string[])=>void; disabled?: boolean;
}) {
 return <><Text>Наборы (можно выбрать несколько)</Text>{topics.map(topic=>{
  const checked=value.includes(topic.id);
  return <Pressable key={topic.id} accessibilityRole="checkbox" accessibilityLabel={topic.name} accessibilityState={{checked,disabled}} disabled={disabled} onPress={()=>onChange(checked?value.filter(id=>id!==topic.id):[...value,topic.id])} style={{padding:12,borderWidth:1,borderColor:theme.muted,borderRadius:10,backgroundColor:checked?'#e2eefc':'transparent'}}><Text>{checked?'☑':'☐'} {topic.name}</Text></Pressable>;
 })}</>;
}
