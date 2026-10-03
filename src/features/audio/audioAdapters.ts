import { AudioService } from './audioService';
import { audioManifest, audioSources } from './audioManifest';
import { offlineSpeech } from '../../../modules/german-offline';
// No runtime import or network operation until a user requests playback.
export function createAudioService(): AudioService {
 let playbackGeneration=0;
 let player: import('expo-audio').AudioPlayer | undefined;
 const speech = {
  listVoices: async () => {try{return await offlineSpeech().listVoices();}catch{return [];}},
  speakOffline: async (text:string,voiceId:string,requestId:string) => offlineSpeech().speakOffline(text,voiceId,requestId),
  stopSpeech: async () => {try{await offlineSpeech().stopSpeech();}catch{/* Optional TTS engine is absent. */}},
 };
 return new AudioService(audioManifest.recordings.map(entry=>({text:entry.text,localUri:async()=>{
  // Metro literal require keeps optional native playback lazy.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {Asset}=require('expo-asset') as typeof import('expo-asset');const asset=Asset.fromModule(audioSources[entry.seedKey]);
  await asset.downloadAsync();if(!asset.localUri)throw new Error('Bundled audio unavailable');return asset.localUri;
 }})),speech,{
  play:async(uri)=>{const generation=++playbackGeneration;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {createAudioPlayer,setAudioModeAsync}=require('expo-audio') as typeof import('expo-audio');await setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:false});if(generation!==playbackGeneration)return;player=createAudioPlayer({uri});player.play();},
  stop:async()=>{++playbackGeneration;player?.pause();player?.remove();player=undefined;},
 });
}
