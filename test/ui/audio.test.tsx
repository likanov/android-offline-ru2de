import React from 'react';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react-native';
import {AudioService} from '../../src/features/audio/audioService';
import {WordCardScreen} from '../../src/features/dictionary/WordCardScreen';
import {TrainingScreen} from '../../src/features/learning/TrainingScreen';
import {createWordHarness} from '../harness';
import {createProfile} from '../../src/features/profiles/profileRepository';
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
