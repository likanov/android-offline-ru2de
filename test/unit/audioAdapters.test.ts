import {createAudioService} from '../../src/features/audio/audioAdapters';
import type {Word} from '../../src/features/learning/learningTypes';
let mockFinishMode:()=>void;
const mockStart=jest.fn();
jest.mock('expo-audio',()=>({setAudioModeAsync:()=>new Promise<void>(resolve=>{mockFinishMode=resolve;}),createAudioPlayer:()=>({play:mockStart,pause:()=>{},remove:()=>{}})}));
jest.mock('expo-asset',()=>({Asset:{fromModule:()=>({localUri:'file:///bundled.wav',downloadAsync:async()=>{}})}}));
test('stop_during_android_audio_mode_setup_does_not_start_playback',async()=>{
 const service=createAudioService();const word={id:'w',profileId:'p',de:'Stuhl',ru:'стул',pos:'noun',gender:'m',plural:null,exampleDe:null,exampleRu:null,note:''} as Word;
 const pending=service.play(word);for(let i=0;!mockFinishMode&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,1));expect(mockFinishMode).toBeDefined();await service.stop();mockFinishMode();await pending;expect(mockStart).not.toHaveBeenCalled();
});
