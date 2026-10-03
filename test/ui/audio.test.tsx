import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react-native';
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
