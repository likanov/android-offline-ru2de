import {createAudioService} from '../../src/features/audio/audioAdapters';
import type {AudioStatus} from 'expo-audio';
import type {OfflineVoice} from '../../src/features/audio/audioService';
import type {Word} from '../../src/features/learning/learningTypes';

const mockSpeech={
 listVoices:jest.fn<Promise<OfflineVoice[]>,[]>(async()=>[]),
 speakOffline:jest.fn<Promise<void>,[string,string,string]>(async()=>{}),
 stopSpeech:jest.fn(async()=>{}),
};
const mockSetMode=jest.fn<Promise<void>,[]>(async()=>{});
const mockPlayers: ReturnType<typeof mockCreatePlayer>[]=[];
function mockCreatePlayer(){
 let listener:((status:AudioStatus)=>void)|undefined;
 const removeListener=jest.fn(()=>{listener=undefined;});
 return {
  play:jest.fn(),pause:jest.fn(),remove:jest.fn(),removeListener,
  addListener:jest.fn((_event:string,onStatus:(status:AudioStatus)=>void)=>{
   listener=onStatus;
   return {remove:removeListener};
  }),
  emit:(status:AudioStatus)=>listener?.(status),
 };
}
jest.mock('expo-audio',()=>({
 setAudioModeAsync:()=>mockSetMode(),
 createAudioPlayer:()=>{const player=mockCreatePlayer();mockPlayers.push(player);return player;},
}));
jest.mock('expo-asset',()=>({Asset:{fromModule:()=>({localUri:'file:///bundled.wav',downloadAsync:async()=>{}})}}));
jest.mock('../../modules/german-offline',()=>({offlineSpeech:()=>mockSpeech}));
const offlineGerman: OfflineVoice={id:'de',language:'de-DE',requiresNetwork:false,installed:true};
function status(extra:Partial<AudioStatus>={}):AudioStatus{
 return {id:'player',currentTime:0,playbackState:'ready',timeControlStatus:'playing',reasonForWaitingToPlay:'',mute:false,duration:1,playing:true,loop:false,didJustFinish:false,isBuffering:false,isLoaded:true,playbackRate:1,shouldCorrectPitch:false,isLive:false,currentOffsetFromLive:null,error:null,...extra};
}
async function flushPlayback(){for(let i=0;i<30;i++)await Promise.resolve();}
async function waitForPlayer(count=1){
 for(let i=0;i<50&&mockPlayers.length<count;i++)await Promise.resolve();
 expect(mockPlayers).toHaveLength(count);
 return mockPlayers[count-1];
}
beforeEach(()=>{
 mockPlayers.length=0;
 mockSetMode.mockReset().mockResolvedValue(undefined);
 mockSpeech.listVoices.mockReset().mockResolvedValue([]);
 mockSpeech.speakOffline.mockClear();
 mockSpeech.stopSpeech.mockClear();
});

test('stop_during_android_audio_mode_setup_does_not_start_playback',async()=>{
 let finishMode!:()=>void;
 mockSetMode.mockImplementation(()=>new Promise<void>(resolve=>{finishMode=resolve;}));
 const service=createAudioService();const word={id:'w',profileId:'p',de:'Stuhl',ru:'стул',pos:'noun',gender:'m',plural:null,exampleDe:null,exampleRu:null,note:''} as Word;
 const pending=service.play(word);
 await flushPlayback();expect(finishMode).toBeDefined();
 await service.stop();finishMode();await pending;
 expect(mockPlayers).toHaveLength(0);
});

// Catch an adapter that resolves on play() and loses asynchronous decoder errors.
test('late_recording_error_uses_offline_speech',async()=>{
 mockSpeech.listVoices.mockResolvedValue([offlineGerman]);
 const service=createAudioService();const pending=service.playText('der Stuhl');
 const player=await waitForPlayer();
 player.emit(status({error:'decoder failure',playing:false}));
 await pending;
 expect(mockSpeech.speakOffline).toHaveBeenCalledWith('der Stuhl','de',expect.any(String));
 expect(player.removeListener).toHaveBeenCalledTimes(1);
 expect(player.pause).toHaveBeenCalledTimes(1);
 expect(player.remove).toHaveBeenCalledTimes(1);
});

test('late_recording_error_without_offline_voice_is_unavailable',async()=>{
 const service=createAudioService();const pending=service.playText('der Stuhl');
 const outcome=expect(pending).rejects.toMatchObject({code:'AUDIO_UNAVAILABLE'});
 const player=await waitForPlayer();
 player.emit(status({error:'load failure',playing:false}));
 await outcome;
 expect(mockSpeech.speakOffline).not.toHaveBeenCalled();
 expect(player.removeListener).toHaveBeenCalledTimes(1);
 expect(player.remove).toHaveBeenCalledTimes(1);
});

test('recording_waits_for_completion_and_releases_player',async()=>{
 const service=createAudioService();let finished=false;
 const pending=service.playText('der Stuhl').then(()=>{finished=true;});
 const player=await waitForPlayer();
 player.emit(status({isBuffering:true,isLoaded:false,playing:false}));
 await flushPlayback();expect(finished).toBe(false);
 player.emit(status({didJustFinish:true,playing:false,currentTime:1}));
 await pending;
 expect(finished).toBe(true);
 expect(player.removeListener).toHaveBeenCalledTimes(1);
 expect(player.remove).toHaveBeenCalledTimes(1);
 await service.stop();
 expect(player.remove).toHaveBeenCalledTimes(1);
 expect(mockSpeech.speakOffline).not.toHaveBeenCalled();
});

test('stop_settles_recording_as_cancelled_without_speech_fallback',async()=>{
 mockSpeech.listVoices.mockResolvedValue([offlineGerman]);
 const service=createAudioService();const pending=service.playText('der Stuhl');
 const outcome=expect(pending).rejects.toMatchObject({code:'AUDIO_CANCELLED'});
 const player=await waitForPlayer();
 await service.stop();await outcome;
 expect(player.removeListener).toHaveBeenCalledTimes(1);
 expect(player.pause).toHaveBeenCalledTimes(1);
 expect(player.remove).toHaveBeenCalledTimes(1);
 expect(mockSpeech.listVoices).not.toHaveBeenCalled();
 expect(mockSpeech.speakOffline).not.toHaveBeenCalled();
});

test('queued_old_player_error_cannot_affect_new_playback',async()=>{
 mockSpeech.listVoices.mockResolvedValue([offlineGerman]);
 const service=createAudioService();const first=service.playText('der Stuhl');
 const firstOutcome=expect(first).rejects.toMatchObject({code:'AUDIO_CANCELLED'});
 const oldPlayer=await waitForPlayer();
 const oldListener=oldPlayer.addListener.mock.calls[0]?.[1];
 let secondFinished=false;
 const second=service.playText('der Tisch').then(()=>{secondFinished=true;});
 const currentPlayer=await waitForPlayer(2);await firstOutcome;
 oldListener?.(status({error:'queued old decoder failure',playing:false}));
 await flushPlayback();
 expect(secondFinished).toBe(false);
 expect(currentPlayer.pause).not.toHaveBeenCalled();
 expect(currentPlayer.remove).not.toHaveBeenCalled();
 expect(mockSpeech.speakOffline).not.toHaveBeenCalled();
 currentPlayer.emit(status({didJustFinish:true,playing:false}));await second;
 expect(currentPlayer.remove).toHaveBeenCalledTimes(1);
 expect(oldPlayer.remove).toHaveBeenCalledTimes(1);
});
