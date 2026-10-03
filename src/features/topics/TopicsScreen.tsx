import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { TrainingSelection } from '../learning/questionTypes';
import { getTopicRepository, getWordRepository, getTrainingServices } from '../../app/AppServices';
import type { Topic } from './topicRepository';
import { localDay } from '../../core/calendar';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
export function TopicsScreen({db,profileId,today=localDay(new Date()),onStart}: {
 db: SqlStore; profileId:string; today?:string; onStart:(selection:TrainingSelection)=>void;
}) {
 const topics=useMemo(()=>getTopicRepository({db}),[db]),words=useMemo(()=>getWordRepository({db}),[db]);
 const [rows,setRows]=useState<Topic[]>([]),[selected,setSelected]=useState<string>(),[newName,setNewName]=useState(''),[name,setName]=useState(''),[error,setError]=useState('');
 const [study,setStudy]=useState<string[]>([]),[review,setReview]=useState<string[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[total,setTotal]=useState(0);
 const lock=useRef(false);
 useEffect(()=>{let alive=true;void topics.list(profileId).then(value=>{if(alive){setRows(value);setLoading(false);}}).catch(e=>{if(alive){setError(e.message);setLoading(false);}});return()=>{alive=false;};},[topics,profileId]);
 useEffect(()=>{
  let alive=true;if(!selected)return;
  void (async()=>{
   const pool=await words.list(profileId,{topicId:selected});
   const progress=await db.all<{wordId:string;learned:number;dueDate:string|null}>('SELECT wordId,learned,dueDate FROM word_progress WHERE profileId=?',[profileId]);
   if(alive){setTotal(pool.length);setStudy(pool.filter(w=>progress.some(p=>p.wordId===w.id&&!p.learned)).map(w=>w.id));setReview(pool.filter(w=>progress.some(p=>p.wordId===w.id&&!!p.learned&&p.dueDate!==null&&p.dueDate<=today)).map(w=>w.id));setLoading(false);}
  })().catch(e=>{if(alive){setError(e.message);setLoading(false);}});
  return()=>{alive=false;};
 },[db,words,profileId,selected,today]);
 async function save(rename:boolean) {
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{if(rename&&selected) await topics.rename(profileId,selected,name);else{await topics.create(profileId,newName);setNewName('');}setRows(await topics.list(profileId));}
  catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 async function start(mode:'study'|'review') {
  const wordIds=mode==='study'?study:review;if(loading||!wordIds.length||lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const selection={mode,wordIds};await getTrainingServices({db}).sessions.start(profileId,selection,today);onStart(selection);}
  catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 return <Screen><Text style={{fontSize:28,fontWeight:'700'}}>Тематические наборы</Text>{error?<Text accessibilityRole="alert">{error}</Text>:null}
  <TextInput accessibilityLabel="Название нового набора" placeholder="Название нового набора" value={newName} onChangeText={setNewName} editable={!busy} style={{borderWidth:1,padding:12,borderRadius:10}}/>
  <Button title="Создать набор" disabled={busy} onPress={()=>void save(false)}/>
  {rows.map(topic=><Button key={topic.id} title={`Выбрать набор: ${topic.name}`} disabled={busy} onPress={()=>{if(selected!==topic.id){setLoading(true);setStudy([]);setReview([]);setSelected(topic.id);}setName(topic.name);}}/>)}
  {selected?<><TextInput accessibilityLabel="Название набора" value={name} onChangeText={setName} editable={!busy} style={{borderWidth:1,padding:12,borderRadius:10}}/><Button title="Переименовать набор" disabled={busy} onPress={()=>void save(true)}/>
   {loading?<Text>Загрузка…</Text>:<><Text>Слов в наборе: {total}</Text><Text>Доступно для изучения: {study.length}</Text><Text>Повторений на сегодня: {review.length}</Text></>}
   <Button title="Изучать набор" disabled={loading||busy||!study.length} onPress={()=>void start('study')}/><Button title="Повторить набор" disabled={loading||busy||!review.length} onPress={()=>void start('review')}/>
  </>:<Text>Выберите набор</Text>}
 </Screen>;
}
