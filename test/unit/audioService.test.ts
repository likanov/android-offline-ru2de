import { AudioService } from '../../src/features/audio/audioService';
import type { Word } from '../../src/features/learning/learningTypes';
const word = (extra: Partial<Word> = {}): Word => ({ id:'w',profileId:'p',de:'Stuhl',ru:'стул',pos:'noun',gender:'m',plural:null,exampleDe:null,exampleRu:null,note:'',...extra });
function setup(voices = [{id:'online',language:'de-DE',requiresNetwork:true,installed:true}]) {
 const speech = {listVoices:jest.fn(async()=>voices),speakOffline:jest.fn(async()=>{}),stopSpeech:jest.fn(async()=>{})};
 const player = {play:jest.fn(async()=>{}),stop:jest.fn(async()=>{})};
 return {speech,player,service:new AudioService([],speech,player)};
}
test('network_voice_is_never_used',async()=>{
 const {service,speech}=setup();expect(await service.available(word())).toBe(false);
 await expect(service.play(word())).rejects.toMatchObject({code:'AUDIO_UNAVAILABLE'});expect(speech.speakOffline).not.toHaveBeenCalled();
});
test('recording_requires_exact_current_german_label',async()=>{
 const {speech,player}=setup();const service=new AudioService([{text:'der Stuhl',localUri:async()=> 'file:///stuhl.wav'}],speech,player);
 expect(await service.available(word())).toBe(true);await service.play(word());expect(player.play).toHaveBeenCalledWith('file:///stuhl.wav');expect(speech.speakOffline).not.toHaveBeenCalled();
 for(const change of [{gender:'f' as const},{de:'Tisch'},{pos:'adjective' as const,gender:null}])expect(await service.available(word(change))).toBe(false);
});
test('only_installed_german_offline_voice_is_selected_and_rechecked',async()=>{
 const {speech,service}=setup([{id:'en',language:'en-US',requiresNetwork:false,installed:true},{id:'missing',language:'de-DE',requiresNetwork:false,installed:false},{id:'de',language:'de-DE',requiresNetwork:false,installed:true}]);
 expect(await service.available(word())).toBe(true);await service.play(word());expect(speech.speakOffline).toHaveBeenCalledWith('der Stuhl','de',expect.any(String));
 speech.listVoices.mockResolvedValue([]);await expect(service.play(word())).rejects.toMatchObject({code:'AUDIO_UNAVAILABLE'});
});
test('stop_cancels_pending_playback_resolution',async()=>{
 const {speech,player}=setup();let resolve!: (uri:string)=>void;
 const service=new AudioService([{text:'der Stuhl',localUri:()=>new Promise<string>(r=>{resolve=r;})}],speech,player);
 const pending=service.play(word());while(!resolve)await Promise.resolve();await service.stop();resolve('file:///stuhl.wav');await pending;expect(player.play).not.toHaveBeenCalled();expect(player.stop).toHaveBeenCalled();expect(speech.stopSpeech).toHaveBeenCalled();
});
test('stopped_speech_rejection_is_cancellation_not_unavailability',async()=>{
 const {speech,service}=setup([{id:'de',language:'de-DE',requiresNetwork:false,installed:true}]);let fail!: (e:Error)=>void;
 speech.speakOffline.mockImplementation(()=>new Promise<void>((_resolve,reject)=>{fail=reject;}));
 const pending=service.play(word());while(!fail)await Promise.resolve();const outcome=expect(pending).rejects.toMatchObject({code:'AUDIO_CANCELLED'});
 await service.stop();fail(new Error('late engine error'));await outcome;
});
test('asynchronous_synthesis_error_after_acceptance_rejects_playback',async()=>{
 const {speech,service}=setup([{id:'de',language:'de-DE',requiresNetwork:false,installed:true}]);let fail!: (e:Error)=>void;
 speech.speakOffline.mockImplementation(()=>new Promise<void>((_resolve,reject)=>{fail=reject;}));
 const pending=service.play(word());while(!fail)await Promise.resolve();const outcome=expect(pending).rejects.toMatchObject({code:'AUDIO_UNAVAILABLE'});
 fail(new Error('synthesis output error'));await outcome;
});
