import { AudioService, type OfflineVoice, type Recording } from '../../src/features/audio/audioService';
import type { Word } from '../../src/features/learning/learningTypes';
const word = (extra: Partial<Word> = {}): Word => ({ id:'w',profileId:'p',de:'Stuhl',ru:'стул',pos:'noun',gender:'m',plural:null,exampleDe:null,exampleRu:null,note:'',...extra });
function setup(voices: OfflineVoice[] = [{id:'online',language:'de-DE',requiresNetwork:true,installed:true}], recordings: Recording[] = []) {
 const speech = {listVoices:jest.fn(async()=>voices),speakOffline:jest.fn<Promise<void>,[string,string,string]>(async()=>{}),stopSpeech:jest.fn(async()=>{})};
 const player = {play:jest.fn(async()=>{}),stop:jest.fn(async()=>{})};
 return {speech,player,service:new AudioService(recordings,speech,player)};
}

const offlineGerman: OfflineVoice = {id:'de',language:'de-DE',requiresNetwork:false,installed:true};
function deferred<T>() {
 let resolve!: (value:T)=>void;
 let reject!: (reason:unknown)=>void;
 const promise = new Promise<T>((finish,fail)=>{resolve=finish;reject=fail;});
 return {promise,resolve,reject};
}
async function waitForCall(mock: jest.Mock) {
 for(let i=0;i<20&&!mock.mock.calls.length;i++)await Promise.resolve();
 expect(mock).toHaveBeenCalled();
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

test.each(['number','verb','pronoun','adverb','preposition','conjunction','phrase'] as const)('non_noun_%s_is_spoken_without_article',async pos=>{
 const {service,speech}=setup([{id:'de',language:'de-DE',requiresNetwork:false,installed:true}]);
 await service.play(word({pos,gender:null,de:'Sie'}));expect(speech.speakOffline).toHaveBeenCalledWith('Sie','de',expect.any(String));
});

// These tests catch wrong text, voice selection, fallback, and stale-request side effects.
test('play_text_recording_priority',async()=>{
 const {service,speech,player}=setup([offlineGerman],[{text:'der Stuhl',localUri:async()=> 'file:///stuhl.wav'}]);
 await service.playText('der Stuhl');
 expect(player.play).toHaveBeenCalledWith('file:///stuhl.wav');
 expect(speech.listVoices).not.toHaveBeenCalled();
 expect(speech.speakOffline).not.toHaveBeenCalled();
});

test('play_text_offline_voice_filter',async()=>{
 const {service,speech,player}=setup([
  {id:'online',language:'de-DE',requiresNetwork:true,installed:true},
  {id:'missing',language:'de-DE',requiresNetwork:false,installed:false},
  {id:'en',language:'en-US',requiresNetwork:false,installed:true},
  {id:'misleading',language:'den',requiresNetwork:false,installed:true},
  offlineGerman,
 ]);
 await service.playText('Ist das Buch neu?');
 expect(speech.speakOffline).toHaveBeenCalledWith('Ist das Buch neu?','de',expect.any(String));
 expect(player.play).not.toHaveBeenCalled();
});

test('play_text_no_offline_voice',async()=>{
 const {service,speech}=setup();
 await expect(service.playText('Ist das Buch neu?')).rejects.toMatchObject({code:'AUDIO_UNAVAILABLE'});
 expect(speech.speakOffline).not.toHaveBeenCalled();
});

test('play_text_preserves_text_and_requires_exact_recording_match',async()=>{
 const {service,speech,player}=setup([offlineGerman],[{text:'ist das Buch schön?',localUri:async()=> 'file:///different.wav'}]);
 await service.playText('Ist das Buch schön?');
 expect(speech.speakOffline).toHaveBeenCalledWith('Ist das Buch schön?','de',expect.any(String));
 expect(player.play).not.toHaveBeenCalled();
});

test.each(['asset','player'] as const)('play_text_broken_recording_falls_back_%s',async failure=>{
 const {service,speech,player}=setup([offlineGerman],[{text:'der Stuhl',localUri:async()=>{
  if(failure==='asset')throw new Error('asset missing');
  return 'file:///stuhl.wav';
 }}]);
 if(failure==='player')player.play.mockRejectedValue(new Error('local player failure'));
 await service.playText('der Stuhl');
 expect(speech.speakOffline).toHaveBeenCalledWith('der Stuhl','de',expect.any(String));
});

test.each(['asset','player'] as const)('play_text_broken_recording_without_offline_voice_%s',async failure=>{
 const {service,speech,player}=setup([],[{text:'der Stuhl',localUri:async()=>{
  if(failure==='asset')throw new Error('asset missing');
  return 'file:///stuhl.wav';
 }}]);
 if(failure==='player')player.play.mockRejectedValue(new Error('local player failure'));
 await expect(service.playText('der Stuhl')).rejects.toMatchObject({code:'AUDIO_UNAVAILABLE'});
 expect(speech.speakOffline).not.toHaveBeenCalled();
});

test.each(['asset','voice'] as const)('play_text_stop_during_%s_resolution',async lookup=>{
 const asset=deferred<string>();
 const voices=deferred<OfflineVoice[]>();
 const localUri=jest.fn(()=>asset.promise);
 const {service,speech,player}=setup([offlineGerman],lookup==='asset'?[{text:'der Stuhl',localUri}]:[]);
 if(lookup==='voice')speech.listVoices.mockImplementation(()=>voices.promise);
 const pending=service.playText('der Stuhl');
 await waitForCall(lookup==='asset'?localUri:speech.listVoices);
 await service.stop();
 if(lookup==='asset')asset.resolve('file:///stuhl.wav');else voices.resolve([offlineGerman]);
 await pending;
 expect(player.play).not.toHaveBeenCalled();
 expect(speech.speakOffline).not.toHaveBeenCalled();
 if(lookup==='asset')expect(speech.listVoices).not.toHaveBeenCalled();
});

test('play_text_cancelled_recording_does_not_fall_back',async()=>{
 const {service,speech,player}=setup([offlineGerman],[{text:'der Stuhl',localUri:async()=> 'file:///stuhl.wav'}]);
 const playback=deferred<void>();
 player.play.mockImplementation(()=>playback.promise);
 const pending=service.playText('der Stuhl');
 await waitForCall(player.play);
 const outcome=expect(pending).rejects.toMatchObject({code:'AUDIO_CANCELLED'});
 playback.reject({code:'AUDIO_CANCELLED'});
 await outcome;
 expect(speech.listVoices).not.toHaveBeenCalled();
 expect(speech.speakOffline).not.toHaveBeenCalled();
});

test.each(['asset','speech'] as const)('play_text_new_request_supersedes_old_%s_failure',async failure=>{
 const old=deferred<void>();
 const asset=deferred<string>();
 const localUri=jest.fn(()=>asset.promise);
 const {service,speech,player}=setup([offlineGerman],failure==='asset'?[{text:'der Stuhl',localUri}]:[]);
 speech.speakOffline.mockImplementation(text=>text==='der Stuhl'?old.promise:Promise.resolve());
 const first=service.playText('der Stuhl');
 await waitForCall(failure==='asset'?localUri:speech.speakOffline);
 const firstOutcome=expect(first).rejects.toMatchObject({code:'AUDIO_CANCELLED'});
 await service.playText('Ist das Buch neu?');
 expect(speech.speakOffline).toHaveBeenLastCalledWith('Ist das Buch neu?','de',expect.any(String));
 expect(player.stop).toHaveBeenCalledTimes(2);
 expect(speech.stopSpeech).toHaveBeenCalledTimes(2);
 if(failure==='asset')asset.reject(new Error('late asset failure'));else old.reject(new Error('late engine failure'));
 await firstOutcome;
 expect(player.stop).toHaveBeenCalledTimes(2);
 expect(speech.stopSpeech).toHaveBeenCalledTimes(2);
 expect(player.play).not.toHaveBeenCalled();
 expect(speech.listVoices).toHaveBeenCalledTimes(failure==='asset'?1:2);
 expect(speech.speakOffline).toHaveBeenCalledTimes(failure==='asset'?1:2);
});

test('play_text_empty_is_noop',async()=>{
 const localUri=jest.fn(async()=> 'file:///empty.wav');
 const {service,speech,player}=setup([offlineGerman],[{text:'  \n\t ',localUri}]);
 await service.playText('  \n\t ');
 expect(localUri).not.toHaveBeenCalled();
 expect(player.play).not.toHaveBeenCalled();
 expect(speech.listVoices).not.toHaveBeenCalled();
 expect(speech.speakOffline).not.toHaveBeenCalled();
});
