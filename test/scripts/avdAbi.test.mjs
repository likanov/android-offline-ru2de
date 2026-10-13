import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync,copyFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {dirname} from 'node:path';import {spawnSync} from 'node:child_process';
test('upgrade AVD preparation reuses its configured ABI even when Node runs with another host architecture',()=>{
 const root=mkdtempSync(tmpdir()+'/avd-abi-');try{
  const script=root+'/worktrees/app/scripts/prepare-avd.sh',avd=root+'/work/android-regression/avd/GermanVocabulary_API36_Upgrade.avd',sdk=root+'/sdk',abi=process.arch==='x64'?'arm64-v8a':'x86_64';mkdirSync(dirname(script),{recursive:true});copyFileSync('scripts/prepare-avd.sh',script);mkdirSync(avd,{recursive:true});writeFileSync(avd+'/config.ini','abi.type='+abi+'\n');writeFileSync(avd.slice(0,-4)+'.ini','path='+avd+'\n');mkdirSync(sdk+'/system-images/android-36/google_apis/'+abi,{recursive:true});mkdirSync(sdk+'/cmdline-tools/latest/bin',{recursive:true});writeFileSync(sdk+'/cmdline-tools/latest/bin/avdmanager','#!/bin/sh\nexit 99\n');chmodSync(sdk+'/cmdline-tools/latest/bin/avdmanager',0o755);
  const env={...process.env,ANDROID_HOME:sdk,PATH:dirname(process.execPath)+':'+process.env.PATH};delete env.VOCABULARY_ABI;
  const r=spawnSync('/bin/sh',[script,'--upgrade'],{encoding:'utf8',env});assert.equal(r.status,0,r.stderr);assert.match(readFileSync(avd+'/config.ini','utf8'),new RegExp('abi.type='+abi));
 }finally{rmSync(root,{recursive:true,force:true});}
});
