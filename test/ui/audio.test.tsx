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
 const stopCompletions:Promise<void>[]=[];
 const service=new AudioService([],{
  listVoices:async()=>[{id:'de',language:'de-DE',installed:true,requiresNetwork:false}],
  speakOffline:async text=>{spoken.push(text);await completions.shift();},
  stopSpeech:async()=>{stops++;await stopCompletions.shift();if(stopFailure)throw new Error('device stop failure');},
 },{play:async()=>{},stop:async()=>{}});
 return {service,spoken,completions,stopCompletions,stops:()=>stops,failStop:()=>{stopFailure=true;}};
}
async function resultFixture(kindIndex=0){
 const h=await createWordHarness();const p=await createProfile(h.db,'A');
 const w=(await h.words.list(p.id)).find(x=>x.de==='Stuhl')!;
 const session=await h.sessions.start(p.id,{mode:'study',wordIds:[w.id]},'2026-10-03');
 await h.db.run('UPDATE sessions SET kindIndex=? WHERE id=?',[kindIndex,session.id]);
 const sessions=kindIndex===5?new SessionRepository(h.db,async()=>true):h.sessions;
 const question=(await sessions.next(p.id,session.id,'2026-10-03'))!;
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

test.each(['unmount','profile'] as const)('deferred explanation stop after %s never opens the departed attempt',async(change)=>{
 const f=await resultFixture();const other=await createProfile(f.h.db,'B');const device=resultDevice(),stopped=deferred<void>();
 const explained:string[]=[];
 await f.h.answers.submit(f.p.id,f.session.id,f.question.attemptId,'wrong','2026-10-03');
 const props={db:f.h.db,profileId:f.p.id,audio:device.service,today:'2026-10-03',onExplainError:(id:string)=>{explained.push(id);}};
 const view=render(<TrainingScreen {...props}/>);
 try{
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));
  device.stopCompletions.push(stopped.promise);
  fireEvent.press(screen.getByRole('button',{name:'Объяснить ошибку'}));
  expect(screen.getByRole('button',{name:'Объяснить ошибку'})).toBeDisabled();
  if(change==='unmount')view.unmount();else{
   view.rerender(<TrainingScreen {...props} profileId={other.id}/>);
  }
  await act(async()=>{stopped.resolve();});
  expect(explained).toEqual([]);
 }finally{stopped.resolve();view.unmount();f.h.close();}
});

test('deferred explanation stop cannot unlock a new profile explanation action',async()=>{
 const f=await resultFixture();const other=await createProfile(f.h.db,'B');const device=resultDevice();
 const oldStop=deferred<void>(),currentStop=deferred<void>();const explained:string[]=[];
 await f.h.answers.submit(f.p.id,f.session.id,f.question.attemptId,'wrong','2026-10-03');
 const otherWord=(await f.h.words.list(other.id)).find(x=>x.de==='Stuhl')!;
 const otherSession=await f.h.sessions.start(other.id,{mode:'study',wordIds:[otherWord.id]},'2026-10-03');
 const otherQuestion=(await f.h.sessions.next(other.id,otherSession.id,'2026-10-03'))!;
 await f.h.answers.submit(other.id,otherSession.id,otherQuestion.attemptId,'wrong','2026-10-03');
 const props={db:f.h.db,profileId:f.p.id,audio:device.service,today:'2026-10-03',onExplainError:(id:string)=>{explained.push(id);}};
 const view=render(<TrainingScreen {...props}/>);
 try{
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));
  device.stopCompletions.push(oldStop.promise);
  fireEvent.press(screen.getByRole('button',{name:'Объяснить ошибку'}));
  view.rerender(<TrainingScreen {...props} profileId={other.id}/>);
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl','der Stuhl']));
  expect(screen.getByRole('button',{name:'Объяснить ошибку'})).toBeEnabled();
  device.stopCompletions.push(currentStop.promise);
  fireEvent.press(screen.getByRole('button',{name:'Объяснить ошибку'}));
  await act(async()=>{oldStop.resolve();});
  expect(screen.getByRole('button',{name:'Объяснить ошибку'})).toBeDisabled();
  await act(async()=>{currentStop.resolve();});
  expect(explained).toEqual([otherQuestion.attemptId]);
  expect(screen.getByRole('button',{name:'Объяснить ошибку'})).toBeEnabled();
 }finally{oldStop.resolve();currentStop.resolve();view.unmount();f.h.close();}
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

// These cases catch departed result exits mutating a previous session or navigating
// with its word after native Stop completes, and an old finally releasing a new lock.
test.each(['Продолжить','Открыть карточку','Помощник'].flatMap(control=>
 (['unmount','profile'] as const).map(change=>({control,change}))))(
 'deferred $control stop after $change leaves the departed session untouched',async({control,change})=>{
 const f=await resultFixture();const other=await createProfile(f.h.db,'B');const device=resultDevice(),stopped=deferred<void>();
 const revealed:string[]=[],helped:string[]=[];
 await f.h.answers.submit(f.p.id,f.session.id,f.question.attemptId,'wrong','2026-10-03');
 const props={db:f.h.db,profileId:f.p.id,audio:device.service,today:'2026-10-03',onReveal:(id:string)=>{revealed.push(id);},onHelper:(id:string)=>{helped.push(id);}};
 const view=render(<TrainingScreen {...props}/>);
 try{
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));
  const saved=await learningSnapshot(f);
  device.stopCompletions.push(stopped.promise);
  fireEvent.press(screen.getByRole('button',{name:control}));
  expect(screen.getByRole('button',{name:control})).toBeDisabled();
  if(change==='unmount')view.unmount();else view.rerender(<TrainingScreen {...props} profileId={other.id}/>);
  await act(async()=>{stopped.resolve();});
  expect(revealed).toEqual([]);expect(helped).toEqual([]);
  expect(await learningSnapshot(f)).toEqual(saved);
 }finally{stopped.resolve();view.unmount();f.h.close();}
});

test('a departed Continue stop cannot unlock a new profile helper action',async()=>{
 const f=await resultFixture();const other=await createProfile(f.h.db,'B');const device=resultDevice();
 const oldStop=deferred<void>(),currentStop=deferred<void>();const helped:string[]=[];
 await f.h.answers.submit(f.p.id,f.session.id,f.question.attemptId,'wrong','2026-10-03');
 const otherWord=(await f.h.words.list(other.id)).find(x=>x.de==='Stuhl')!;
 const otherSession=await f.h.sessions.start(other.id,{mode:'study',wordIds:[otherWord.id]},'2026-10-03');
 const otherQuestion=(await f.h.sessions.next(other.id,otherSession.id,'2026-10-03'))!;
 await f.h.answers.submit(other.id,otherSession.id,otherQuestion.attemptId,'wrong','2026-10-03');
 const props={db:f.h.db,profileId:f.p.id,audio:device.service,today:'2026-10-03',onHelper:(id:string)=>{helped.push(id);}};
 const view=render(<TrainingScreen {...props}/>);
 try{
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));
  device.stopCompletions.push(oldStop.promise);
  fireEvent.press(screen.getByRole('button',{name:'Продолжить'}));
  view.rerender(<TrainingScreen {...props} profileId={other.id}/>);
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl','der Stuhl']));
  device.stopCompletions.push(currentStop.promise);
  fireEvent.press(screen.getByRole('button',{name:'Помощник'}));
  await act(async()=>{oldStop.resolve();});
  expect(screen.getByRole('button',{name:'Помощник'})).toBeDisabled();
  expect(screen.getByTestId('training-result')).toBeTruthy();
  await act(async()=>{currentStop.resolve();});
  expect(helped).toEqual([otherWord.id]);
  expect(screen.getByRole('button',{name:'Помощник'})).toBeEnabled();
 }finally{oldStop.resolve();currentStop.resolve();view.unmount();f.h.close();}
});

// A saved listening result must use snapshot result playback, never the mutable
// pre-answer listening/fallback path, even while native speech is pending or fails.
test.each(['Продолжить','Помощник'])(
 'restored listening result keeps snapshot playback non-blocking for %s',async(control)=>{
 const f=await resultFixture(5);expect(f.question.kind).toBe('listening');
 const device=resultDevice(),firstSpeech=deferred<void>(),replay=deferred<void>();
 device.completions.push(firstSpeech.promise,replay.promise);const helped:string[]=[];
 await f.h.answers.submit(f.p.id,f.session.id,f.question.attemptId,'wrong','2026-10-03');
 await f.h.db.run("UPDATE words SET de='Sessel' WHERE profileId=? AND id=?",[f.p.id,f.w.id]);
 const saved=await learningSnapshot(f);
 const view=render(<TrainingScreen db={f.h.db} profileId={f.p.id} audio={device.service} today="2026-10-03" onHelper={id=>{helped.push(id);}}/>);
 try{
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl']));
  expect(screen.queryByRole('button',{name:'Прослушать'})).toBeNull();
  expect(screen.getAllByRole('button',{name:'Остановить звук'})).toHaveLength(1);
  expect(screen.getByRole('button',{name:'Продолжить'})).toBeEnabled();
  expect(screen.getByRole('button',{name:'Помощник'})).toBeEnabled();
  expect(await learningSnapshot(f)).toEqual(saved);
  await act(async()=>{firstSpeech.reject(new Error('offline speech failed'));});
  await screen.findByText('Офлайн-озвучка недоступна.');
  expect(screen.getByTestId('training-result')).toBeTruthy();
  expect(screen.queryByText('Офлайн-озвучка недоступна. Выбран другой тип вопроса.')).toBeNull();
  expect(await learningSnapshot(f)).toEqual(saved);
  fireEvent.press(screen.getByTestId('training-result-audio-repeat'));
  await waitFor(()=>expect(device.spoken).toEqual(['der Stuhl','der Stuhl']));
  expect(screen.getByRole('button',{name:'Продолжить'})).toBeEnabled();
  expect(screen.getByRole('button',{name:'Помощник'})).toBeEnabled();
  expect(await learningSnapshot(f)).toEqual(saved);
  fireEvent.press(screen.getByRole('button',{name:control}));
  if(control==='Продолжить')await screen.findByTestId('training-prompt-ru-de');
  else await waitFor(()=>expect(helped).toEqual([f.w.id]));
 }finally{firstSpeech.resolve();replay.resolve();view.unmount();f.h.close();}
});
