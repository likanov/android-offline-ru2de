import React,{useEffect,useState} from 'react';
import {Text} from 'react-native';
import {registerRootComponent} from 'expo';
import {Asset} from 'expo-asset';
import {audioManifest,audioSources} from '../../src/features/audio/audioManifest';
import {createAudioService} from '../../src/features/audio/audioAdapters';
import {offlineSpeech} from '../../modules/german-offline';
import {starterWords} from '../../src/data/starterWords';
import type {Word} from '../../src/features/learning/learningTypes';
function Probe(){const [status,setStatus]=useState('Checking local audio');useEffect(()=>{void(async()=>{
 try{
 const service=createAudioService();let assets=0;
 for(const entry of audioManifest.recordings){const asset=Asset.fromModule(audioSources[entry.seedKey]);await asset.downloadAsync();if(!asset.localUri)throw Error(`Missing ${entry.file}`);assets++;}
 const word={...starterWords[1],id:'test',profileId:'test'} as Word;
 await service.play(word);await new Promise(resolve=>setTimeout(resolve,2000));await service.play(word);await new Promise(resolve=>setTimeout(resolve,2000));await service.stop();
 const speech=offlineSpeech();let voices:Awaited<ReturnType<typeof speech.listVoices>>=[];try{voices=await speech.listVoices();}catch{}
 const custom={...word,de:'Apfel'};const available=await service.available(custom);
 if(available){await service.play(custom);await new Promise(resolve=>setTimeout(resolve,2000));await service.stop();}
 else{try{await service.play(custom);throw Error('Unavailable custom word played');}catch(e){if((e as {code:string}).code!=='AUDIO_UNAVAILABLE')throw e;}}
 let rejected=false;try{await speech.speakOffline('der Apfel','nonexistent-network-voice','invalid');}catch{rejected=true;}if(!rejected)throw Error('Invalid voice accepted');
 const result={status:'PASS',localAssets:assets,bundledReplay:true,customOfflineAvailable:available,voiceCount:voices.length,installedGerman:voices.filter(v=>v.language.startsWith('de')&&v.installed),invalidVoiceRejected:rejected};console.log('NATIVE_AUDIO_RESULT '+JSON.stringify(result));setStatus(JSON.stringify(result));
 }catch(e){console.log('NATIVE_AUDIO_RESULT '+JSON.stringify({status:'FAIL',error:String(e)}));setStatus(String(e));}
 })();},[]);return <Text>{status}</Text>;}
registerRootComponent(Probe);
