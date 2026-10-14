import { AudioCancelledError, AudioService } from './audioService';
import { audioManifest, audioSources } from './audioManifest';
import { offlineSpeech } from '../../../modules/german-offline';
// No runtime import or network operation until a user requests playback.
export function createAudioService(): AudioService {
 let playbackGeneration=0;
 let cancelPlayback: (()=>void) | undefined;
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
  const {createAudioPlayer,setAudioModeAsync}=require('expo-audio') as typeof import('expo-audio');
  await setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:false});
  if(generation!==playbackGeneration)return;
  await new Promise<void>((resolve,reject)=>{
   const player=createAudioPlayer({uri});
   let subscription:{remove():void}|undefined;
   let settled=false;
   const finish=(error?:unknown)=>{
    if(settled)return;
    settled=true;
    if(cancelPlayback===cancel)cancelPlayback=undefined;
    try{subscription?.remove();player.pause();player.remove();}catch(cleanupError){error??=cleanupError;}
    if(error)reject(error);else resolve();
   };
   const cancel=()=>finish(new AudioCancelledError());
   cancelPlayback=cancel;
   try{
    subscription=player.addListener('playbackStatusUpdate',status=>{
     if(settled||generation!==playbackGeneration)return;
     if(status.error)finish(new Error(status.error));
     else if(status.didJustFinish)finish();
    });
    player.play();
   }catch(error){finish(error);}
  });},
  stop:async()=>{++playbackGeneration;cancelPlayback?.();},
 });
}
