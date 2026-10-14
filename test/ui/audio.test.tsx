import React from 'react';
import {AppState} from 'react-native';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react-native';
import {AudioService} from '../../src/features/audio/audioService';
import {WordCardScreen} from '../../src/features/dictionary/WordCardScreen';
import {TrainingScreen} from '../../src/features/learning/TrainingScreen';
import {createWordHarness} from '../harness';
import {createProfile} from '../../src/features/profiles/profileRepository';
import {AnswerService} from '../../src/features/learning/answerService';
import {SessionRepository} from '../../src/features/learning/sessionRepository';

// These tests catch missing result playback, wrong snapshot text, playback-held
// navigation, audio writes to learning state, and stale async profile updates.
function deferred<T>(){
 let resolve!: (value:T)=>void, reject!: (error:unknown)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function resultDevice(){
 const spoken:string[]=[];let stops=0,stopFailure=false;
 const completions:Promise<void>[]=[];
 const service=new AudioService([],{
  listVoices:async()=>[{id:'de',language:'de-DE',installed:true,requiresNetwork:false}],
  speakOffline:async text=>{spoken.push(text);await completions.shift();},
  stopSpeech:async()=>{stops++;if(stopFailure)throw new Error('device stop failure');},
 },{play:async()=>{},stop:async()=>{}});
 return {service,spoken,completions,stops:()=>stops,failStop:()=>{stopFailure=true;}};
}
async function resultFixture(kindIndex=0){
 const h=await createWordHarness();const p=await createProfile(h.db,'A');
 const w=(await h.words.list(p.id)).find(x=>x.de==='Stuhl')!;
 const session=await h.sessions.start(p.id,{mode:'study',wordIds:[w.id]},'2026-10-03');
 await h.db.run('UPDATE sessions SET kindIndex=? WHERE id=?',[kindIndex,session.id]);
 const question=(await h.sessions.next(p.id,session.id,'2026-10-03'))!;
 return {h,p,w,session,question};
}
async function learningSnapshot(f:Awaited<ReturnType<typeof resultFixture>>){
 return {profile:await f.h.profile(f.p.id),state:await f.h.wordState(f.p.id,f.w.id),
  attempts:await f.h.db.all('SELECT * FROM attempts WHERE profileId=?',[f.p.id]),
  session:await f.h.sessions.resume(f.p.id)};
}
let previousAppState=AppState.currentState;
beforeEach(()=>{previousAppState=AppState.currentState;AppState.currentState='active';});
afterEach(()=>{jest.restoreAllMocks();AppState.currentState=previousAppState;});
function audio(){const player={play:jest.fn(async()=>{}),stop:jest.fn(async()=>{})};return {player,service:new AudioService([{text:'der Stuhl',localUri:async()=> 'file:///stuhl.wav'}],{listVoices:async()=>[],speakOffline:async()=>{},stopSpeech:async()=>{}},player)};}
test('card_plays_bundled_audio_and_stops_on_profile_change_and_exit',async()=>{
 const h=await createWordHarness();const p=await createProfile(h.db,'A'),other=await createProfile(h.db,'B');const w=(await h.words.list(p.id)).find(w=>w.de==='Stuhl')!;const {service,player}=audio();
 const props={db:h.db,profileId:p.id,wordId:w.id,onEdit:()=>{},onBack:()=>{},audio:service};const view=render(<WordCardScreen {...props}/>);
 fireEvent.press(await screen.findByRole('button',{name:'Прослушать'}));await waitFor(()=>expect(player.play).toHaveBeenCalledWith('file:///stuhl.wav'));
 const count=player.stop.mock.calls.length;view.rerender(<WordCardScreen {...props} profileId={other.id}/>);await waitFor(()=>expect(player.stop.mock.calls.length).toBeGreaterThan(count));view.unmount();h.close();
});
test('lost_voice_cancels_listening_without_progress_penalty_and_advances_kind',async()=>{
 const h=await createWordHarness();const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id)).find(w=>w.de==='Stuhl')!;
 const s=await h.sessions.start(p.id,{mode:'study',wordIds:[w.id]},'2026-10-03');await h.db.run('UPDATE sessions SET kindIndex=5 WHERE id=?',[s.id]);
 const speech={listVoices:jest.fn(async()=>[{id:'de',language:'de-DE',requiresNetwork:false,installed:true}]),speakOffline:jest.fn(async()=>{throw new Error('removed');}),stopSpeech:async()=>{}};
 const service=new AudioService([],speech,{play:async()=>{},stop:async()=>{}});
 const view=render(<TrainingScreen db={h.db} profileId={p.id} audio={service} today="2026-10-03"/>);
 fireEvent.press(await screen.findByRole('button',{name:'Прослушать'}));await screen.findByText('Офлайн-озвучка недоступна. Выбран другой тип вопроса.');
 expect((await h.sessions.resume(p.id))!.currentQuestion!.kind).not.toBe('listening');expect(await h.wordState(p.id,w.id)).toMatchObject({streak:0,totalErrors:0});expect(await h.profile(p.id)).toMatchObject({xp:0});view.unmount();h.close();
});

test.each(['exit','profile'] as const)('late_playback_rejection_after_%s_does_not_create_departed_question',async(change)=>{
 const h=await createWordHarness();const p=await createProfile(h.db,'A'),other=await createProfile(h.db,'B');const w=(await h.words.list(p.id)).find(w=>w.de==='Stuhl')!;
 const s=await h.sessions.start(p.id,{mode:'study',wordIds:[w.id]},'2026-10-03');await h.db.run('UPDATE sessions SET kindIndex=5 WHERE id=?',[s.id]);
 let fail!: (e:Error)=>void;const service=new AudioService([], {listVoices:async()=>[{id:'de',language:'de-DE',requiresNetwork:false,installed:true}],speakOffline:()=>new Promise<void>((_resolve,reject)=>{fail=reject;}),stopSpeech:async()=>{}},{play:async()=>{},stop:async()=>{}});
 // Keep lifecycle protection independent of AudioService's cancellation mapping.
 // A playback adapter can report a delayed failure even after stop returns.
 jest.spyOn(service,'play').mockImplementation(()=>new Promise<void>((_resolve,reject)=>{fail=reject;}));
 const props={db:h.db,profileId:p.id,audio:service,today:'2026-10-03'};const view=render(<TrainingScreen {...props}/>);
 fireEvent.press(await screen.findByRole('button',{name:'Прослушать'}));await waitFor(()=>expect(fail).toBeDefined());
 await h.sessions.cancelQuestion(p.id,s.id);
 if(change==='exit')view.unmount();else{view.rerender(<TrainingScreen {...props} profileId={other.id}/>);await waitFor(async()=>expect((await h.sessions.resume(other.id))?.currentQuestion).toBeTruthy());}
 await act(async()=>{fail(new Error('late synthesis failure'));await new Promise(resolve=>setTimeout(resolve,20));});
 expect((await h.sessions.resume(p.id))!.currentQuestion).toBeNull();
 if(change==='profile'){expect(screen.queryByText('Офлайн-озвучка недоступна. Выбран другой тип вопроса.')).toBeNull();view.unmount();}
 h.close();
});

test('stopping_custom_card_speech_keeps_replay_available',async()=>{
 const h=await createWordHarness();const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id)).find(w=>w.de==='Stuhl')!;let rejectSpeech!: (e:{code:string})=>void;
 const service=new AudioService([], {listVoices:async()=>[{id:'de',language:'de-DE',requiresNetwork:false,installed:true}],speakOffline:()=>new Promise<void>((_resolve,reject)=>{rejectSpeech=reject;}),stopSpeech:async()=>{if(rejectSpeech)rejectSpeech({code:'AUDIO_CANCELLED'});}},{play:async()=>{},stop:async()=>{}});
 const view=render(<WordCardScreen db={h.db} profileId={p.id} wordId={w.id} audio={service} onEdit={()=>{}} onBack={()=>{}}/>);
 fireEvent.press(await screen.findByRole('button',{name:'Прослушать'}));await waitFor(()=>expect(rejectSpeech).toBeDefined());fireEvent.press(screen.getByRole('button',{name:'Остановить звук'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Прослушать'}).props.accessibilityState.disabled).toBe(false));expect(screen.queryByText('Офлайн-озвучка недоступна')).toBeNull();view.unmount();h.close();
});

test.each([true,false])('saved %s dictionary result speaks once and repeat/stop preserve learning',async(right)=>{
 const f=await resultFixture();const device=resultDevice();
 const props={db:f.h.db,profileId:f.p.id,audio:device.service,today:'2026-10-03'};
 const view=render(<TrainingScreen {...props}/>);
 try{
  const answer=right?'der Stuhl':f.question.options.find(x=>x!=='der Stuhl')!;
  fireEvent.press(await screen.findByRole('button',{name:answer}));
  await screen.findByTestId('training-result');
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));
  const saved=await learningSnapshot(f);
  view.rerender(<TrainingScreen {...props} profileName="A"/>);
  await act(async()=>{});expect(device.spoken).toEqual(['der Stuhl']);
  fireEvent.press(screen.getByTestId('training-result-audio-repeat'));
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl','der Stuhl']));
  const stops=device.stops();fireEvent.press(screen.getByTestId('training-result-audio-stop'));
  await waitFor(()=>expect(device.stops()).toBeGreaterThan(stops));
  expect(await learningSnapshot(f)).toEqual(saved);
  expect(screen.getByRole('button',{name:'Продолжить'})).toBeEnabled();
 }finally{view.unmount();f.h.close();}
});

test.each([[0,'der Stuhl'],[1,'der Stuhl'],[3,'der Stuhl'],[4,'ein Stuhl']] as const)(
 'restored kind %s reads the persisted German phrase %s',async(kindIndex,text)=>{
 const f=await resultFixture(kindIndex);const device=resultDevice();
 await f.h.answers.submit(f.p.id,f.session.id,f.question.attemptId,f.question.expected[0],'2026-10-03');
 await f.h.db.run("UPDATE words SET de='Sessel' WHERE profileId=? AND id=?",[f.p.id,f.w.id]);
 const view=render(<TrainingScreen db={f.h.db} profileId={f.p.id} audio={device.service} today="2026-10-03"/>);
 try{await screen.findByTestId('training-result');await waitFor(()=>expect(device.spoken).toEqual([text]));}
 finally{view.unmount();f.h.close();}
});

test.each(['resolve','reject'] as const)('Continue stops pending result speech before advancing despite late %s',async(settlement)=>{
 const f=await resultFixture();const device=resultDevice(),pending=deferred<void>();device.completions.push(pending.promise);
 const stop=jest.spyOn(device.service,'stop'),next=jest.spyOn(SessionRepository.prototype,'next');
 const view=render(<TrainingScreen db={f.h.db} profileId={f.p.id} audio={device.service} today="2026-10-03"/>);
 try{
  fireEvent.press(await screen.findByRole('button',{name:'der Stuhl'}));
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));
  expect(screen.getByRole('button',{name:'Продолжить'})).toBeEnabled();
  stop.mockClear();next.mockClear();fireEvent.press(screen.getByRole('button',{name:'Продолжить'}));
  await screen.findByTestId('training-prompt-de-ru');
  expect(stop.mock.invocationCallOrder[0]).toBeLessThan(next.mock.invocationCallOrder[0]);
  const saved=await learningSnapshot(f);
  await act(async()=>{if(settlement==='resolve')pending.resolve();else pending.reject(new Error('late speech'));});
  expect(screen.queryByTestId('training-result')).toBeNull();
  expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
  expect(await learningSnapshot(f)).toEqual(saved);
 }finally{view.unmount();f.h.close();}
});

test('result audio unavailable keeps its saved answer and Continue without listening fallback',async()=>{
 const f=await resultFixture();const device=resultDevice(),pending=deferred<void>();device.completions.push(pending.promise);
 const view=render(<TrainingScreen db={f.h.db} profileId={f.p.id} audio={device.service} today="2026-10-03"/>);
 try{
  fireEvent.press(await screen.findByRole('button',{name:'der Stuhl'}));
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));
  const saved=await learningSnapshot(f);
  await act(async()=>{pending.reject({code:'AUDIO_UNAVAILABLE'});});
  await screen.findByText('Офлайн-озвучка недоступна.');
  expect(screen.getByTestId('training-result')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Продолжить'})).toBeEnabled();
  expect(screen.queryByText('Офлайн-озвучка недоступна. Выбран другой тип вопроса.')).toBeNull();
  expect(await learningSnapshot(f)).toEqual(saved);
 }finally{view.unmount();f.h.close();}
});

test.each(['Продолжить','Открыть карточку','Помощник','Объяснить ошибку'])(
 'result navigation through %s survives native Stop failure',async(control)=>{
 const f=await resultFixture();const device=resultDevice();const onReveal=jest.fn(),onHelper=jest.fn(),onExplainError=jest.fn();
 await f.h.answers.submit(f.p.id,f.session.id,f.question.attemptId,'wrong','2026-10-03');
 const view=render(<TrainingScreen db={f.h.db} profileId={f.p.id} audio={device.service} today="2026-10-03" onReveal={onReveal} onHelper={onHelper} onExplainError={onExplainError}/>);
 try{
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));device.failStop();const stops=device.stops();
  fireEvent.press(screen.getByRole('button',{name:control}));
  if(control==='Продолжить')await screen.findByTestId('training-prompt-de-ru');
  else await waitFor(()=>expect(control==='Открыть карточку'?onReveal:control==='Помощник'?onHelper:onExplainError).toHaveBeenCalled());
  expect(device.stops()).toBeGreaterThan(stops);
 }finally{view.unmount();f.h.close();}
});

test.each(['exit','profile'] as const)('delayed saved submission after %s never speaks a departed result',async(change)=>{
 const f=await resultFixture();const other=await createProfile(f.h.db,'B');const device=resultDevice();
 const release=deferred<void>(),saved=deferred<void>();const submit=AnswerService.prototype.submit;
 jest.spyOn(AnswerService.prototype,'submit').mockImplementation(async function(this:AnswerService,...args){
  const result=await submit.apply(this,args);saved.resolve();await release.promise;return result;
 });
 const props={db:f.h.db,profileId:f.p.id,audio:device.service,today:'2026-10-03'};
 const view=render(<TrainingScreen {...props}/>);
 try{
  fireEvent.press(await screen.findByRole('button',{name:'der Stuhl'}));await act(async()=>{await saved.promise;});
  if(change==='exit')view.unmount();else{
   view.rerender(<TrainingScreen {...props} profileId={other.id}/>);
   await screen.findByRole('button',{name:'Открыть карточку'});
   await waitFor(async()=>expect((await f.h.sessions.resume(other.id))?.currentQuestion).toBeTruthy());
  }
  await act(async()=>{release.resolve();});
  expect(device.spoken).toEqual([]);
  if(change==='profile')expect(screen.queryByTestId('training-result')).toBeNull();
 }finally{release.resolve();view.unmount();f.h.close();}
});

test.each(['exit','profile'] as const)('pending result voice lookup after %s cannot start departed speech',async(change)=>{
 const f=await resultFixture();const other=await createProfile(f.h.db,'B');const lookup=deferred<{id:string;language:string;installed:boolean;requiresNetwork:boolean}[]>();
 const spoken:string[]=[];const service=new AudioService([],{listVoices:()=>lookup.promise,speakOffline:async text=>{spoken.push(text);},stopSpeech:async()=>{}},{play:async()=>{},stop:async()=>{}});
 const play=jest.spyOn(service,'playText');
 await f.h.answers.submit(f.p.id,f.session.id,f.question.attemptId,f.question.expected[0],'2026-10-03');
 const props={db:f.h.db,profileId:f.p.id,audio:service,today:'2026-10-03'};const view=render(<TrainingScreen {...props}/>);
 try{
  await waitFor(()=>expect(play).toHaveBeenCalledWith('der Stuhl'));
  if(change==='exit')view.unmount();else{view.rerender(<TrainingScreen {...props} profileId={other.id}/>);await waitFor(async()=>expect((await f.h.sessions.resume(other.id))?.currentQuestion).toBeTruthy());}
  await act(async()=>{lookup.resolve([{id:'de',language:'de-DE',installed:true,requiresNetwork:false}]);});
  expect(spoken).toEqual([]);
 }finally{view.unmount();f.h.close();}
});
