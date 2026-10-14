import { displayGerman } from '../dictionary/wordValidation';
import type { Word } from '../learning/learningTypes';
export type OfflineVoice = { id:string; language:string; requiresNetwork:boolean; installed:boolean };
export type OfflineSpeech = { listVoices():Promise<OfflineVoice[]>; speakOffline(text:string,voiceId:string,requestId:string):Promise<void>; stopSpeech():Promise<void> };
export type Recording = {text:string;localUri():Promise<string>};
export type AudioPlayer = {play(localUri:string):Promise<void>;stop():Promise<void>};
export class AudioUnavailableError extends Error {
 readonly code = 'AUDIO_UNAVAILABLE';
 constructor(){super('Офлайн-озвучка недоступна');}
}
export class AudioCancelledError extends Error {
 readonly code='AUDIO_CANCELLED';
 constructor(){super('Озвучка остановлена');}
}
export class AudioService {
 private generation=0;
 constructor(private recordings:readonly Recording[],private speech:OfflineSpeech,private player:AudioPlayer){}
 private async voice(){try{return (await this.speech.listVoices()).find(v=>v.installed&&!v.requiresNetwork&&/^de(?:[-_]|$)/i.test(v.language));}catch{return undefined;}}
 async available(word:Word):Promise<boolean>{return this.recordings.some(r=>r.text===displayGerman(word))||!!await this.voice();}
 play(word:Word):Promise<void>{return this.playText(displayGerman(word));}
 async playText(text:string):Promise<void>{
  if(!text.trim())return;
  const generation=++this.generation;
  try{
   await Promise.all([this.player.stop(),this.speech.stopSpeech()]);
   if(generation!==this.generation)return;
   const recording=this.recordings.find(r=>r.text===text);
   if(recording){
    try{
     const uri=await recording.localUri();
     if(generation!==this.generation)return;
     await this.player.play(uri);
     if(generation!==this.generation)return;
     return;
    }catch(error){
     if(generation!==this.generation || (error as {code?:string})?.code==='AUDIO_CANCELLED')throw new AudioCancelledError();
    }
   }
   const voice=await this.voice();
   if(generation!==this.generation)return;
   if(!voice)throw new AudioUnavailableError();
   await this.speech.speakOffline(text,voice.id,`audio-${generation}`);
   if(generation!==this.generation)return;
  }catch(error){
   if(generation!==this.generation || (error as {code?:string})?.code==='AUDIO_CANCELLED')throw new AudioCancelledError();
   throw new AudioUnavailableError();
  }
 }
 async stop():Promise<void>{++this.generation;await Promise.all([this.player.stop(),this.speech.stopSpeech()]);}
}
