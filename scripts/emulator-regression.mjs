import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, statSync, statfsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { arch, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import {appendDeviceLog,generationFromHierarchy,completeRegressionReport,offlineRadioState,rootVerified,applicationAlarmEpochs,alarmMatchesLocalTime,maestroOutcome} from './regression-evidence.mjs';
import {verifyScenarioState} from './regression-state.mjs';
import { MATRIX, REQUIRED_SCENARIOS, sha256File, validateRegressionReport, validateBlockRegressionReport, matrixRowForBlock, scenarioIdsForBlock } from './regression-report.mjs';
const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const taskRoot=resolve(appRoot,'../..');
const workRoot=join(taskRoot,'work/android-regression');
const avdRoot=join(workRoot,'avd');
const applicationId='com.personal.germanvocabulary';
const previousCommit='19b2e0c1cf36eda73159aff9bb2d94b757d24144';
class Unavailable extends Error { constructor(message) { super(message); this.exitCode=2; } }
const options={};
const report={version:1,runId:randomUUID(),status:'not-verified',startedAt:new Date().toISOString(),scenarios:REQUIRED_SCENARIOS.map(id=>({id,status:'not-verified',reason:'NOT_RUN'})),generations:[],blockers:[],commands:[]};
let selectedBlockScenarios=null;
let reportDir, adb, emulator, maestro, processHandle, serial='emulator-5580', settingsSnapshot;
const env={...process.env,ANDROID_AVD_HOME:avdRoot,ANDROID_USER_HOME:join(workRoot,'android-user'),EXPO_NO_TELEMETRY:'1',MAESTRO_CLI_NO_ANALYTICS:'1',MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:'true',JAVA_OPTS:`${process.env.JAVA_OPTS??''} -Duser.home=${join(workRoot,'maestro-user')}`};
const execute=(command,args=[],{allowFailure=false,timeout=60000,binary=false,maxBuffer=32*1024*1024}={})=>{
  const r=spawnSync(command,args,{cwd:appRoot,env,encoding:binary?undefined:'utf8',timeout,maxBuffer});
  const number=report.commands.length;
  const stdout=join(reportDir,`command-${number}.stdout${binary?'.bin':'.log'}`), stderr=join(reportDir,`command-${number}.stderr.log`);
  writeFileSync(stdout,r.stdout ?? ''); writeFileSync(stderr,r.stderr ?? '');
  report.commands.push({command,args,status:r.status,signal:r.signal,stdout,stderr,error:r.error?.message});
  if (!allowFailure && (r.status!==0 || r.error)) throw Error(`COMMAND_FAILED:${command} ${args.join(' ')}; exit=${r.status}; signal=${r.signal ?? ''}`);
  return r;
};
const shell=(...args)=>execute(adb,['-s',serial,'shell',...args]);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function commandPath(name) { const r=spawnSync('/usr/bin/which',[name],{encoding:'utf8',env}); return r.status===0?r.stdout.trim():null; }
function nativeHostArch() {
  const r=spawnSync('/usr/bin/arch',[],{encoding:'utf8',env});
  return r.status===0?r.stdout.trim():arch();
}
function androidHostAbi() {
  const native=nativeHostArch();
  if(native==='arm64'||arch()==='arm64')return 'arm64-v8a';
  if(native==='i386'||native==='x86_64'||arch()==='x64')return 'x86_64';
  return null;
}
function artifact(path) { return path && existsSync(path) && statSync(path).isFile(); }
async function preflight() {
  const sdk=resolve(options['sdk-root'] ?? process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(taskRoot,'work/toolchains/android-sdk'));
  report.environment={hostAbi:arch(),nativeHostArch:nativeHostArch(),sdkRoot:sdk,avd:options.avd,avdHome:avdRoot,ramBytes:totalmem(),freeBytes:Number(statfsSync(workRoot).bavail)*Number(statfsSync(workRoot).bsize)};
  adb=join(sdk,'platform-tools/adb'); emulator=join(sdk,'emulator/emulator');
  if (!artifact(adb)) throw new Unavailable('ADB_MISSING');
  if (!artifact(options.apk)) throw new Unavailable('APK_MISSING');
  report.apk={path:resolve(options.apk),sha256:sha256File(options.apk)};
  const manifestPath=join(options['model-dir'] ?? '', 'model-manifest.json');
  if (!artifact(manifestPath)) throw new Unavailable('MODEL_MANIFEST_MISSING');
  let manifest; try { manifest=JSON.parse(readFileSync(manifestPath,'utf8')); } catch { throw new Unavailable('MODEL_MANIFEST_INVALID'); }
  if (typeof manifest.fileName!=='string' || basename(manifest.fileName)!==manifest.fileName || !/^[a-f0-9]{64}$/.test(manifest.sha256??'') || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision??'') || manifest.quantization!=='Q4_K_M' || manifest.runtimeVersion!=='0.12.9' || !Number.isSafeInteger(manifest.bytes)) throw new Unavailable('MODEL_MANIFEST_INVALID');
  if(!manifest.id||!manifest.fileName.endsWith('.gguf')||manifest.bytes<8)throw new Unavailable('MODEL_MANIFEST_INVALID');
  const modelPath=resolve(options['model-dir'],manifest.fileName);
  if (!artifact(modelPath)) throw new Unavailable('MODEL_MISSING');
  const hash=sha256File(modelPath);
  if (hash!==manifest.sha256 || statSync(modelPath).size!==manifest.bytes) throw new Unavailable('MODEL_SHA256_MISMATCH');
  const fd=openSync(modelPath,'r'),header=Buffer.alloc(8); const fs=await import('node:fs');
  try { fs.readSync(fd,header,0,8,0); } finally { closeSync(fd); }
  if (header.toString('ascii',0,4)!=='GGUF' || header.readUInt32LE(4)!==3) throw new Unavailable('MODEL_NOT_GGUF_V3');
  report.model={path:modelPath,sha256:hash,manifestPath,manifest};
  const blockers=[];
  if (options.avd!=='GermanVocabulary_API36') blockers.push('DEDICATED_AVD_REQUIRED:GermanVocabulary_API36');
  maestro=options.maestro ?? commandPath('maestro') ?? (artifact(join(taskRoot,'work/toolchains/maestro/maestro/bin/maestro'))?join(taskRoot,'work/toolchains/maestro/maestro/bin/maestro'):null);
  if (!maestro) blockers.push('MAESTRO_MISSING');
  const adbVersion=execute(adb,['version'],{allowFailure:true}); report.environment.adb=adbVersion.stdout?.trim();
  if (adbVersion.status!==0) blockers.push('ADB_UNAVAILABLE');
  if (!artifact(emulator)) blockers.push('EMULATOR_MISSING');
  else { const r=execute(emulator,['-version'],{allowFailure:true}); report.environment.emulator={status:r.status,signal:r.signal,stdout:r.stdout?.trim(),stderr:r.stderr?.trim()}; if(r.status!==0) blockers.push('EMULATOR_UNAVAILABLE'); }
  if (maestro) { const r=execute(maestro,['--version'],{allowFailure:true}); report.environment.maestro=r.stdout?.trim(); if(r.status!==0) blockers.push('MAESTRO_UNAVAILABLE'); }
  const config=join(avdRoot,'GermanVocabulary_API36.avd/config.ini');
  if (!artifact(config)) blockers.push('AVD_MISSING:run npm run prepare:android:emulator');
  else { report.environment.avdConfig=readFileSync(config,'utf8'); writeFileSync(join(reportDir,'avd-config.ini'),report.environment.avdConfig); if(!/hw.ramSize\s*=\s*8192/.test(report.environment.avdConfig)|| !/disk.dataPartition.size\s*=\s*(12G|12884901888)/.test(report.environment.avdConfig)) blockers.push('AVD_RESOURCES_INVALID'); }
  const configuredAbi=report.environment.avdConfig?.match(/^abi\.type=(.+)$/m)?.[1];
  const abi=configuredAbi ?? androidHostAbi();
  report.environment.androidHostAbi=abi;
  report.environment.image=`system-images;android-36;google_apis;${abi}`;
  if(!abi || !existsSync(join(sdk,'system-images/android-36/google_apis',abi))) blockers.push('SYSTEM_IMAGE_MISSING');
  if(report.environment.ramBytes<12*1024**3) blockers.push('HOST_RAM_INSUFFICIENT_OR_UNVERIFIED');
  if(report.environment.freeBytes<16*1024**3+2*manifest.bytes+statSync(options.apk).size) blockers.push('HOST_DISK_INSUFFICIENT');
  report.commit=execute('git',['rev-parse','HEAD']).stdout.trim();
  if (!options.preflight) {
    const tools=join(sdk,'build-tools/36.0.0');
    if (!artifact(join(tools,'aapt')) || !artifact(join(tools,'apksigner'))) blockers.push('APK_INSPECTION_TOOLS_MISSING');
    else {
      const permissions=execute(join(tools,'aapt'),['dump','permissions',options.apk],{allowFailure:true});
      const badging=execute(join(tools,'aapt'),['dump','badging',options.apk],{allowFailure:true});
      const signature=execute(join(tools,'apksigner'),['verify','--print-certs',options.apk],{allowFailure:true});
      report.apk.permissions=permissions.stdout;report.apk.badging=badging.stdout;report.apk.signature=signature.stdout;
      if(permissions.status!==0||badging.status!==0||signature.status!==0)blockers.push('APK_INVALID_OR_UNSIGNED');
      if(permissions.stdout?.includes('android.permission.INTERNET'))blockers.push('RELEASE_HAS_INTERNET');
      if(!badging.stdout?.includes("name='com.personal.germanvocabulary'"))blockers.push('APPLICATION_ID_MISMATCH');
      if(!badging.stdout?.includes(abi))blockers.push('APK_ABI_INCOMPATIBLE');
      if(artifact(options['previous-apk'])) {
        const previousSignature=execute(join(tools,'apksigner'),['verify','--print-certs',options['previous-apk']],{allowFailure:true});
        const fingerprint=text=>text?.match(/certificate SHA-256 digest: ([a-f0-9]+)/)?.[1];
        if(previousSignature.status!==0||!fingerprint(signature.stdout)||fingerprint(signature.stdout)!==fingerprint(previousSignature.stdout))blockers.push('UPGRADE_SIGNING_KEY_MISMATCH');
      }
    }
    if (!artifact(options['previous-apk'])) blockers.push('PREVIOUS_APK_MISSING:build original Task5 commit with same release key');
    else {
      const previousHash=sha256File(options['previous-apk']);
      if(previousHash===report.apk.sha256)blockers.push('UPGRADE_APK_NOT_DISTINCT');
      const provenancePath=options['previous-apk']+'.provenance.json';
      if(!artifact(provenancePath))blockers.push('UPGRADE_PROVENANCE_MISSING');
      else { const provenance=JSON.parse(readFileSync(provenancePath,'utf8'));if(provenance.commit!==previousCommit||provenance.sha256!==previousHash||provenance.sourceMapVerified!==true)blockers.push('UPGRADE_PROVENANCE_MISMATCH');else report.upgrade={previousCommit,apk:resolve(options['previous-apk']),apkSha256:previousHash,provenancePath}; }
    }
    if (!artifact(options.fixture)) blockers.push('REGRESSION_FIXTURE_MISSING');
    if (!artifact(options['grammar-fixture'])) blockers.push('GRAMMAR_FIXTURE_MISSING');
    if (!artifact(options['grammar-previous-apk'])) blockers.push('GRAMMAR_PREVIOUS_APK_MISSING');
    if (!options.block || options.block === 'dictionary') {
      if (!artifact(options['dictionary-fixture'])) blockers.push('DICTIONARY_FIXTURE_MISSING');
      if (!artifact(options['dictionary-large-fixture'])) blockers.push('DICTIONARY_LARGE_FIXTURE_MISSING');
    }
    // Audibility/language observations are collected against this run's artifacts.
    // Missing observations must not prevent generating the evidence to review.
  }
  report.blockers=blockers;
  if(blockers.length) throw new Unavailable(blockers.join('\n'));
}
async function boot(name,wipe) {
  const devices=execute(adb,['devices']).stdout;
  if(devices.includes(serial)) throw new Unavailable('DEDICATED_PORT_BUSY');
  const stdout=openSync(join(reportDir,`${name}-emulator.stdout.log`),'a'),stderr=openSync(join(reportDir,`${name}-emulator.stderr.log`),'a');
  processHandle=spawn(emulator,['-avd',name,'-port','5580','-memory','8192','-partition-size','12288','-no-snapshot','-no-window','-gpu','swiftshader_indirect',...(wipe?['-wipe-data']:[])],{env,stdio:['ignore',stdout,stderr]});
  closeSync(stdout);closeSync(stderr);
  let launchError; processHandle.once('error',error=>{launchError=error;});
  const deadline=Date.now()+180000;
  while(Date.now()<deadline) {
    if(launchError||processHandle.exitCode!==null||processHandle.signalCode) throw new Unavailable(`EMULATOR_LAUNCH_FAILED:${launchError?.message ?? processHandle.exitCode ?? processHandle.signalCode}`);
    const r=execute(adb,['-s',serial,'shell','getprop','sys.boot_completed'],{allowFailure:true,timeout:5000});
    if(r.status===0&&r.stdout.trim()==='1') { shell('input','keyevent','82'); return; }
    await delay(2000);
  }
  throw new Unavailable('EMULATOR_BOOT_TIMEOUT');
}
function offline() {
  shell('cmd','connectivity','airplane-mode','enable');shell('svc','wifi','disable');shell('svc','data','disable');execute(adb,['-s',serial,'reverse','--remove-all']);
  const wifi=shell('settings','get','global','wifi_on').stdout.trim(),mobile=shell('settings','get','global','mobile_data').stdout.trim();
  const airplane=shell('settings','get','global','airplane_mode_on').stdout.trim();report.network={...offlineRadioState({wifi,mobile,airplane}),deviceSettings:{wifi,mobile,airplane}};
  if(report.network.wifi!==false||report.network.mobile!==false) throw new Unavailable('NETWORK_DISABLE_UNVERIFIED');
}
function snapshotSettings() {
  settingsSnapshot={airplane:shell('settings','get','global','airplane_mode_on').stdout.trim(),font:shell('settings','get','system','font_scale').stdout.trim(),autoTime:shell('settings','get','global','auto_time').stdout.trim(),autoZone:shell('settings','get','global','auto_time_zone').stdout.trim(),zone:shell('getprop','persist.sys.timezone').stdout.trim(),epoch:shell('date','+%s').stdout.trim(),hostTime:Date.now()};
  writeFileSync(join(reportDir,'system-settings-before.json'),JSON.stringify(settingsSnapshot,null,2));
}
function restoreSettings() {
  if(!settingsSnapshot)return;
  const failures=[];
  const restore=args=>{ const r=execute(adb,['-s',serial,'shell',...args],{allowFailure:true});if(r.status!==0)failures.push(args.join(' ')); };
  restore(['cmd','connectivity','airplane-mode',settingsSnapshot.airplane==='1'?'enable':'disable']);restore(['wm','size','reset']);restore(['wm','density','reset']);
  for(const [namespace,key,value] of [['system','font_scale',settingsSnapshot.font],['global','auto_time',settingsSnapshot.autoTime],['global','auto_time_zone',settingsSnapshot.autoZone]]) restore(value==='null'?['settings','delete',namespace,key]:['settings','put',namespace,key,value]);
  restore(['setprop','persist.sys.timezone',settingsSnapshot.zone]);
  // Calendar scenarios may change device clock. Restore elapsed wall time too.
  restore(['date','-s',`@${Number(settingsSnapshot.epoch)+Math.floor((Date.now()-settingsSnapshot.hostTime)/1000)}`]);
  restore(['am','broadcast','--async','-a','android.intent.action.TIME_SET']);
  report.restoration={status:failures.length?'failed':'passed',failures};
  settingsSnapshot=undefined;
  if(failures.length)throw new Unavailable('SYSTEM_SETTINGS_RESTORE_FAILED');
}
function screenshot(name) {
  const r=execute(adb,['-s',serial,'exec-out','screencap','-p'],{binary:true});const path=join(reportDir,`${name}.png`);writeFileSync(path,r.stdout);return path;
}
function flow(id,file,extra={}) {
  const junit=join(reportDir,`${id}.xml`);
  const args=['--device',serial,'test','--format','junit','--output',junit,'--test-output-dir',join(reportDir,`${id}-artifacts`),'-e',`REPORT_DIR=${reportDir}`,...Object.entries(extra).flatMap(([k,v])=>['-e',`${k}=${v}`]),join(appRoot,'e2e',file)];
  const r=execute(maestro,args,{allowFailure:true,timeout:20*60*1000});
  const outcome=maestroOutcome(r.status,artifact(junit)?readFileSync(junit,'utf8'):'');
  const row=report.scenarios.find(s=>s.id===id);
  if(row) {
    Object.assign(row,{junit,status:outcome.status,reason:outcome.reason});
    try{row.screenshot=screenshot(id);}catch(error){row.screenshotWarning='SCREENSHOT_UNAVAILABLE:'+error.message;}
  }
  if(outcome.exitCode===2)throw new Unavailable(`MAESTRO_DEVICE_UNAVAILABLE:${id}`);
  if(outcome.exitCode===1)throw Error(`SCENARIO_FAILED:${id}`);
}
let latestBackup,persistenceBaseline,devicePhase='primary',modelOriginal,modelPath,disabledTts=[];
let fixtureDay;
function captureDeviceLog(phase) {
 const index=report.deviceLogs?.length??0;
 const devicePath=`/sdcard/regression-logcat-${phase}-${index}.txt`;
 const path=join(reportDir,`logcat-${phase}-${index}.txt`);
 const capture=execute(adb,['-s',serial,'shell','logcat','-d','-v','threadtime','-f',devicePath],{allowFailure:true,timeout:60000});
 if(capture.status!==0||capture.error)throw new Unavailable('LOGCAT_UNAVAILABLE:'+phase);
 const pulled=execute(adb,['-s',serial,'pull',devicePath,path],{allowFailure:true,timeout:60000});
 execute(adb,['-s',serial,'shell','rm','-f',devicePath],{allowFailure:true,timeout:10000});
 if(pulled.status!==0||pulled.error||!artifact(path))throw new Unavailable('LOGCAT_UNAVAILABLE:'+phase);
 const text=readFileSync(path,'utf8');
 appendDeviceLog(report,{phase,path,text});shell('logcat','-c');
 report.logcat=join(reportDir,'logcat.txt');writeFileSync(report.logcat,(report.deviceLogs??[]).map(row=>`${row.phase}: ${row.path}`).join('\n'));
 if(report.crashCount||report.anrCount)throw Error('CRASH_ANR_DETECTED:'+phase);
}
function hierarchy(name) {
 shell('uiautomator','dump','/sdcard/regression-hierarchy.xml');
 const path=join(reportDir,name+'.xml');execute(adb,['-s',serial,'pull','/sdcard/regression-hierarchy.xml',path]);return path;
}
function recordDictionaryUxEvidence(check) {
 if(!check.id.startsWith('dictionary.'))return;
 const scenario=report.scenarios.find(row=>row.id===check.id);
 const observations=report.observations?.dictionaryUx?.[check.id] ?? {};
 const captures=[];
 if(check.id==='dictionary.viewport-keyboard') {
  const openScreenshot=scenario?.screenshot ?? screenshot(check.id+'-keyboard-open');
  captures.push({step:'keyboard-open',screenshot:openScreenshot,hierarchy:hierarchy(check.id+'-keyboard-open')});
  shell('input','keyevent','111');
  captures.push({step:'keyboard-closed',screenshot:screenshot(check.id+'-keyboard-closed'),hierarchy:hierarchy(check.id+'-keyboard-closed')});
 } else {
  captures.push({step:'review',screenshot:scenario?.screenshot ?? screenshot(check.id),hierarchy:hierarchy(check.id)});
 }
 report.dictionaryUx ??={};
 report.dictionaryUx[check.id]={apkSha256:report.apk.sha256,captures,observations};
}
export function exportedBackupCandidates(filename) {
 return ['/sdcard/Download/GermanVocabulary/'+filename, '/sdcard/Download/'+filename, '/data/user/0/'+applicationId+'/files/last-export.json'];
}
function pullExportedFileInternal({execute, adb, serial, filename, destination}) {
 const attempts=[];
 for (const remote of exportedBackupCandidates(filename)) {
  const result=execute(adb,['-s',serial,'pull',remote,destination],{allowFailure:true});
  attempts.push({remote,status:result.status,signal:result.signal,error:result.error?.message});
  if(result.status===0&&!result.error)return {remote,attempts};
 }
 throw Error('EXPORTED_FILE_NOT_FOUND:'+filename+':'+attempts.map(row=>row.remote+'='+row.status).join(','));
}
export function pullExportedFile(args) { return pullExportedFileInternal(args); }
function captureState(name) {
 const filename=name+'.json';flow('export-'+name,'helpers/export-state.yaml',{EXPORT_NAME:filename});
 const path=join(reportDir,filename);pullExportedFileInternal({execute,adb,serial,filename,destination:path});
 const backup=JSON.parse(readFileSync(path,'utf8'));if(backup.format!=='german-vocabulary-backup')throw Error('EXPORTED_BACKUP_INVALID');
 latestBackup=backup;return backup;
}
async function deviceRoot() {
 const r=execute(adb,['-s',serial,'root'],{allowFailure:true});if(r.stdout?.includes('cannot run as root'))throw new Unavailable('DEDICATED_AVD_ROOT_UNAVAILABLE');
 execute(adb,['-s',serial,'wait-for-device']);
 for(let i=0;i<10;i++){const observed=execute(adb,['-s',serial,'shell','id','-u'],{allowFailure:true});if(observed.status===0&&rootVerified({uid:observed.stdout}))return;await delay(1000);}
 throw new Unavailable('DEDICATED_AVD_ROOT_UNAVAILABLE');
}
function setClock(instant,zone='Europe/Berlin') {
 shell('settings','put','global','auto_time','0');shell('settings','put','global','auto_time_zone','0');shell('setprop','persist.sys.timezone',zone);
 const epoch=Math.floor(Date.parse(instant)/1000);if(!Number.isFinite(epoch))throw Error('CLOCK_INPUT_INVALID');shell('date','-s','@'+epoch);
 const actual=shell('date','+%s').stdout.trim();if(Math.abs(Number(actual)-epoch)>5)throw new Unavailable('DEVICE_CLOCK_NOT_ACCEPTED');
 shell('am','broadcast','--async','-a','android.intent.action.TIMEZONE_CHANGED','--es','time-zone',zone);shell('am','broadcast','--async','-a','android.intent.action.TIME_SET');
 report.clockChanges??=[];report.clockChanges.push({instant,zone,actual:shell('date','+%Y-%m-%dT%H:%M:%S%z').stdout.trim()});
 shell('am','force-stop',applicationId);shell('am','start','-n',applicationId+'/.MainActivity');
}
function alarmEvidence(name,enabled=true) {
 const dump=shell('dumpsys','alarm').stdout;const path=join(reportDir,'alarm-'+name+'.txt');writeFileSync(path,dump);
 const now=Number(shell('date','+%s').stdout.trim())*1000,zone=shell('getprop','persist.sys.timezone').stdout.trim();
 const alarms=applicationAlarmEpochs(dump,now);
 if(enabled&&!alarms.length)throw new Unavailable('REMINDER_ALARM_NOT_OBSERVABLE:'+name);
 if(!enabled&&alarms.length)throw Error('INACTIVE_PROFILE_REMINDER_REMAINS');
 if(enabled&&!alarms.some(epoch=>alarmMatchesLocalTime(epoch,zone,'08:30')))throw Error('REMINDER_LOCAL_TIME_MISMATCH:'+name);
 report.reminderEvidence??=[];report.reminderEvidence.push({name,path,enabled,alarms,zone});
}
async function rebootDevice() {
 captureDeviceLog(devicePhase+'-before-reboot');execute(adb,['-s',serial,'reboot']);
 let booted=false;for(let i=0;i<90;i++){await delay(2000);const r=execute(adb,['-s',serial,'shell','getprop','sys.boot_completed'],{allowFailure:true,timeout:5000});if(r.status===0&&r.stdout.trim()==='1'){booted=true;break;}}
 if(!booted)throw new Unavailable('REBOOT_TIMEOUT');await deviceRoot();offline();shell('input','keyevent','82');
}
async function beforeCheck(check) {
 if(check.clock)setClock(`${check.clock==='tomorrow'?new Date(Date.parse(fixtureDay+'T12:00:00Z')+86400000).toISOString():fixtureDay+'T12:00:00Z'}`);
 if(check.device==='permission-denied') {shell('pm','revoke',applicationId,'android.permission.POST_NOTIFICATIONS');shell('pm','clear-permission-flags',applicationId,'android.permission.POST_NOTIFICATIONS','user-set','user-fixed');}
 if(check.device==='permission-granted')shell('pm','grant',applicationId,'android.permission.POST_NOTIFICATIONS');
 if(check.device==='tts-disabled') {const names=shell('pm','list','packages').stdout.split('\n').filter(x=>/tts|texttospeech/.test(x)).map(x=>x.replace('package:','').trim());for(const p of names){shell('pm','disable-user','--user','0',p);disabledTts.push(p);}}
 if(check.device==='tts-restored') {for(const p of disabledTts)shell('pm','enable',p);disabledTts=[];const path=join(reportDir,'tts-engine.txt');writeFileSync(path,shell('dumpsys','texttospeech').stdout);report.ttsEngine=path;}
 if(check.device==='display') {shell('wm','size','960x1920');shell('wm','density','480');shell('settings','put','system','font_scale','1.5');const size=shell('wm','size').stdout;if(!size.includes('960x1920'))throw new Unavailable('DISPLAY_SIZE_NOT_ACCEPTED');}
 if(check.device==='dictionary-viewport') {shell('wm','size','1080x1920');shell('wm','density','420');const size=shell('wm','size').stdout;if(!size.includes('1080x1920'))throw new Unavailable('DICTIONARY_VIEWPORT_SIZE_NOT_ACCEPTED');}
 if(check.device==='reminder-reboot-zone') {await rebootDevice();setClock(fixtureDay+'T12:00:00Z','America/New_York');}
 if(check.device==='dst') {
  setClock('2026-10-25T00:30:00Z');const before=shell('date','+%Y-%m-%dT%H:%M%z').stdout.trim();
  setClock('2026-10-25T01:30:00Z');const after=shell('date','+%Y-%m-%dT%H:%M%z').stdout.trim();
  if(!before.includes('02:30+0200')||!after.includes('02:30+0100'))throw new Unavailable('DST_NOT_ACCEPTED');report.dst={before,after};
 }
 if(check.id==='reminders.reminder-profile'){flow('inactive-reminder','helpers/inactive-reminder.yaml');alarmEvidence('inactive-profile',false);}
 if(check.device==='four-generations') {
  const modes=[['association','Ассоциация'],['example','Пример'],['text','Короткий текст'],['rule','Правило']];
  if(check.id.startsWith('grammar-'))modes.push(['grammar-error','Пояснение ошибки']);
  for(const [mode,title]of modes) {
   flow('generation-'+mode,'assistant-generation.yaml',{MODE_TITLE:title});
   const xml=hierarchy('generation-'+mode),text=generationFromHierarchy(readFileSync(xml,'utf8'));
   if(!text)throw Error('REAL_GENERATION_EMPTY_OR_UNFINISHED:'+mode);
   report.generations.push({mode,runtime:'llama.rn',modelSha256:report.model.sha256,text,hierarchy:xml,screenshot:screenshot('generation-'+mode)});
  }
 }
 if(check.device==='model-unavailable') {
  const found=shell('find','/data/user/0/'+applicationId+'/files','-name','*.gguf').stdout.trim().split('\n').filter(Boolean);
  if(found.length!==1)throw new Unavailable('INSTALLED_MODEL_PATH_AMBIGUOUS');modelPath=found[0];modelOriginal=modelPath+'.regression-original';shell('mv',modelPath,modelOriginal);
 }
}
async function afterCheck(check) {
 if(check.device==='display'||check.device==='dictionary-viewport'){shell('wm','size','reset');shell('wm','density','reset');if(check.device==='display')shell('settings','put','system','font_scale',settingsSnapshot.font);}
 if(check.device==='model-unavailable') {
  const corrupt=join(reportDir,'corrupt.gguf');writeFileSync(corrupt,'corrupted GGUF input');execute(adb,['-s',serial,'push',corrupt,modelPath]);
  flow('corrupt-model',check.flow);shell('rm',modelPath);shell('mv',modelOriginal,modelPath);modelOriginal=undefined;
 }
 if(check.id.startsWith('reminders.')&&check.device!=='permission-denied')alarmEvidence(check.id);
 if(check.device==='logs')captureDeviceLog(devicePhase+'-resilience');
 if(check.observation&&artifact(options.observations)) {
  const observed=JSON.parse(readFileSync(options.observations,'utf8'));
  if(check.observation==='audioAudible'&&observed.audioAudible!==true)throw new Unavailable('AUDIO_NOT_OBSERVED');
  if(check.observation==='languageQuality'&&observed.languageQuality!=='reviewed')throw new Unavailable('LANGUAGE_NOT_REVIEWED');
 }
}
async function group(row,baseline) {
 for(const check of row.checks) {
  let before=baseline??latestBackup;
  if(check.state&&check.id!=='assistant.helper-save-edit'&&!baseline)before=captureState(check.id+'-before');
  await beforeCheck(check);
  const extra={FIXTURE_DAY:fixtureDay,MODEL_FILENAME:report.model.manifest.fileName,EXPORT_NAME:check.id+'-operation.json',RESTORE_CHECKPOINT_NAME:check.id+'-restored.json'};
  flow(check.id,check.flow,extra);
  recordDictionaryUxEvidence(check);
  await afterCheck(check);
  if(check.state) {
   const after=captureState(check.id+'-after'),today=shell('date','+%Y-%m-%d').stdout.trim();
   let restoreCheckpoint,restoreEvidence;
   if(check.id==='transfer.json-roundtrip'){
    const filename=check.id+'-restored.json';
    restoreEvidence=join(reportDir,filename);
    pullExportedFileInternal({execute,adb,serial,filename,destination:restoreEvidence});
    restoreCheckpoint=JSON.parse(readFileSync(restoreEvidence,'utf8'));
    if(restoreCheckpoint.format!=='german-vocabulary-backup')throw Error('RESTORE_CHECKPOINT_INVALID');
   }
   const result=verifyScenarioState(check.id,after,{before,today,fixtureDay,restoreCheckpoint});
   const scenario=report.scenarios.find(s=>s.id===check.id);scenario.stateEvidence=join(reportDir,check.id+'-after.json');scenario.stateValidation=result;if(restoreEvidence)scenario.restoreEvidence=restoreEvidence;
   if(!result.ok){scenario.status='failed';scenario.reason=result.errors.join(';');throw Error('STATE_ASSERTION_FAILED:'+check.id+':'+scenario.reason);}
  }
 }
 flow(row.id,row.flow,{FIXTURE_DAY:fixtureDay,GROUP_ID:row.id});
}
async function preparePrimaryDevice() {
 await boot(options.avd,true);snapshotSettings();await deviceRoot();offline();
 execute(adb,['-s',serial,'install',options.apk]);setClock(fixtureDay+'T12:00:00Z');shell('logcat','-c');
 shell('mkdir','-p','/sdcard/Download/GermanVocabulary');
 for(const path of [report.model.path,report.model.manifestPath])execute(adb,['-s',serial,'push',path,'/sdcard/Download/GermanVocabulary/'],{timeout:180000});
 const dictionaryFixture=options['dictionary-fixture'] ?? options.fixture;
 if(dictionaryFixture)execute(adb,['-s',serial,'push',dictionaryFixture,'/sdcard/Download/GermanVocabulary/dictionary-backup.json'],{timeout:180000});
 execute(adb,['-s',serial,'push',options.fixture,'/sdcard/Download/GermanVocabulary/regression-backup.json'],{timeout:180000});
 if(options['dictionary-large-fixture'])execute(adb,['-s',serial,'push',options['dictionary-large-fixture'],'/sdcard/Download/GermanVocabulary/dictionary-large-backup.json'],{timeout:180000});
 execute(adb,['-s',serial,'push',options['grammar-fixture'],'/sdcard/Download/GermanVocabulary/grammar-backup-v2.json'],{timeout:180000});
 execute(adb,['-s',serial,'push',join(appRoot,'e2e/fixtures/vocabulary.csv'),'/sdcard/Download/GermanVocabulary/'],{timeout:180000});
 execute(adb,['-s',serial,'push',join(appRoot,'e2e/fixtures/invalid-backup.json'),'/sdcard/Download/GermanVocabulary/']);
}
async function importRegressionFixture(grammar=false) {
 const file=grammar?'grammar-backup-v2.json':'regression-backup.json';
 flow(grammar?'import-grammar-fixture':'import-fixture',grammar?'grammar-import-fixture.yaml':'import-fixture.yaml',{BACKUP_FILE:file,PROFILE_COUNT:grammar?'4':'13'});latestBackup=captureState(grammar?'imported-grammar-fixture':'imported-fixture');
}
async function importDictionaryFixtures() {
 if(options['dictionary-fixture']) { flow('import-dictionary-fixture','import-fixture.yaml',{BACKUP_FILE:'dictionary-backup.json',PROFILE_COUNT:'2'}); latestBackup=captureState('imported-dictionary-fixture'); }
 if(options['dictionary-large-fixture']) { flow('import-dictionary-large-fixture','import-fixture.yaml',{BACKUP_FILE:'dictionary-large-backup.json',PROFILE_COUNT:'1'}); latestBackup=captureState('imported-dictionary-large-fixture'); }
}
async function setupBlockPrerequisites() {
 flow('first-launch.clean-40-words','checks/first-launch.clean-40-words.yaml');
 flow('first-launch.model-picker','checks/first-launch.model-picker.yaml',{MODEL_FILENAME:report.model.manifest.fileName});
}
async function seedPersistencePrerequisite() {
 flow('learning.twenty-ui-answers','checks/learning.twenty-ui-answers.yaml');
}
async function runUpgradePhase() {
 devicePhase='upgrade';
 const prepare=execute('/bin/sh',[join(appRoot,'scripts/prepare-avd.sh'),'--upgrade'],{allowFailure:true});if(prepare.status!==0)throw new Unavailable('UPGRADE_AVD_PREPARE_FAILED');
 await boot('GermanVocabulary_API36_Upgrade',true);snapshotSettings();await deviceRoot();offline();
 execute(adb,['-s',serial,'install',options['previous-apk']]);setClock(fixtureDay+'T12:00:00Z');shell('logcat','-c');
 flow('upgrade-before','upgrade-before.yaml');hierarchy('upgrade-before');screenshot('upgrade-before');
 captureDeviceLog('upgrade-before-install');shell('logcat','-c');
 execute(adb,['-s',serial,'install','-r',options.apk]);shell('mkdir','-p','/sdcard/Download/GermanVocabulary');
 latestBackup=captureState('upgrade-baseline');await group(MATRIX.find(row=>row.phase==='upgrade'),latestBackup);
 captureDeviceLog('upgrade-final');
}
async function runBlock(block) {
 report.runMode={type:'block',block};
 const row=matrixRowForBlock(block);
 if(row.phase==='upgrade') { await runUpgradePhase(); return; }
 await preparePrimaryDevice();
 if(block==='first-launch') { await group(row); captureDeviceLog('primary-block-'+block); return; }
 await setupBlockPrerequisites();
 await importRegressionFixture(block.startsWith('grammar-'));
 if(block==='dictionary')await importDictionaryFixtures();
 if(row.phase==='force-stop'||row.phase==='reboot') {
  await seedPersistencePrerequisite();
  flow('persistence-before','persistence-before.yaml');persistenceBaseline=captureState('persistence-baseline');
  if(row.phase==='force-stop')shell('am','force-stop',applicationId);
  else await rebootDevice();
  await group(row,persistenceBaseline);
 } else {
  await group(row);
 }
 captureDeviceLog('primary-block-'+block);
}
async function run() {
 await preparePrimaryDevice();
 await group(MATRIX.find(row=>row.id==='first-launch'));
 await importRegressionFixture();
 await importDictionaryFixtures();
 for(const row of MATRIX.filter(row=>row.phase==='main'&&!row.id.startsWith('grammar-')))await group(row);
 await importRegressionFixture(true);
 for(const row of MATRIX.filter(row=>row.id.startsWith('grammar-')))await group(row);
 flow('persistence-before','persistence-before.yaml');persistenceBaseline=captureState('persistence-baseline');
 shell('am','force-stop',applicationId);await group(MATRIX.find(row=>row.phase==='force-stop'),persistenceBaseline);
 await rebootDevice();await group(MATRIX.find(row=>row.phase==='reboot'),persistenceBaseline);
 captureDeviceLog('primary-final');restoreSettings();execute(adb,['-s',serial,'emu','kill']);await delay(3000);
 await runUpgradePhase();
   if(artifact(options.observations))report.observations=JSON.parse(readFileSync(options.observations,'utf8'));
 else report.blockers.push('OBSERVATIONS_MISSING:review generated text and audible playback');
}
function completeBlockRegressionReport(block) {
 const ids=scenarioIdsForBlock(block), validation=validateBlockRegressionReport({...report,status:'passed'},block), errors=[...validation.errors];
 if(report.blockers.length)errors.push(...report.blockers);
 const failed=ids.some(id=>report.scenarios.find(s=>s.id===id)?.status==='failed')||(report.crashCount??0)!==0||(report.anrCount??0)!==0;
 return {exitCode:errors.length?(failed?1:2):0,status:errors.length?(failed?'failed':'not-verified'):'passed',errors};
}
async function main() {
 let exitCode=2;
 try {
   const argv=process.argv.slice(2);
   const allowed=new Set(['preflight','sdk-root','apk','model-dir','avd','report-dir','maestro','previous-apk','grammar-previous-apk','fixture','grammar-fixture','dictionary-fixture','dictionary-large-fixture','observations','block']);
   for(let i=0;i<argv.length;i++){const key=argv[i].replace(/^--/,'');if(!argv[i].startsWith('--')||!allowed.has(key))throw new Unavailable(`ARGUMENT_INVALID:${argv[i]}`);if(key==='preflight')options[key]=true;else {if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Unavailable(`ARGUMENT_VALUE_MISSING:${key}`);options[key]=argv[++i];}}
   if(options.block){try{selectedBlockScenarios=scenarioIdsForBlock(options.block);}catch(error){throw new Unavailable(error.message);}}
   reportDir=resolve(options['report-dir'] ?? join(workRoot,`reports/${new Date().toISOString().replace(/[:.]/g,'-')}`));
   mkdirSync(reportDir,{recursive:true});mkdirSync(workRoot,{recursive:true});
   await preflight();
   if(options.preflight)throw new Unavailable('PREFLIGHT_ONLY:full regression not run');
   if(artifact(options.observations))report.observations=JSON.parse(readFileSync(options.observations,'utf8'));
   try{const fixturePath=options.block?.startsWith('grammar-')?options['grammar-fixture']:options.fixture;const parsed=JSON.parse(readFileSync(fixturePath,'utf8'));fixtureDay=parsed.profiles.find(p=>p.profile.name==='Регрессия — изучено')?.attempts?.[0]?.day??parsed.profiles.flatMap(p=>[...(p.attempts??[]),...(p.grammar?.attempts??[])]).map(a=>a.day).find(Boolean)??'2026-10-06';}catch{throw new Unavailable('REGRESSION_FIXTURE_INCOMPLETE');}
   if(options.block)await runBlock(options.block);
   else await run();
   const completion=options.block?completeBlockRegressionReport(options.block):completeRegressionReport(report);exitCode=completion.exitCode;report.status=completion.status;report.blockers.push(...completion.errors);
 } catch(error) {
   exitCode=error.exitCode ?? 1;report.status=exitCode===2?'not-verified':'failed';report.blockers.push(error.message);console.error(error.message);
 } finally {
   if(reportDir) {
     if(processHandle) {
       try{captureDeviceLog(devicePhase+'-finally');}catch(error){report.blockers.push(error.message);exitCode=error.message.startsWith('CRASH_ANR')?1:(exitCode||2);report.status=exitCode===1?'failed':'not-verified';}
       if(modelOriginal){try{shell('mv',modelOriginal,modelPath);}catch(error){report.blockers.push('MODEL_RESTORE_FAILED:'+error.message);exitCode=2;report.status='not-verified';}}
       for(const p of disabledTts)execute(adb,['-s',serial,'shell','pm','enable',p],{allowFailure:true});
       try{restoreSettings();}catch(error){report.blockers.push(error.message);exitCode=exitCode||2;report.status='not-verified';}
       execute(adb,['-s',serial,'emu','kill'],{allowFailure:true});processHandle.kill('SIGTERM');
     }
     report.completedAt=new Date().toISOString();report.exitCode=exitCode;report.validation=options.block?{ok:exitCode===0,block:options.block,scenarios:selectedBlockScenarios}:validateRegressionReport(report);
     writeFileSync(join(reportDir,'report.json'),JSON.stringify(report,null,2)+'\n');
     writeFileSync(join(reportDir,'summary.md'),`# Android regression\n\nStatus: ${report.status}; exit ${exitCode}.\n\n${report.blockers.map(s=>`- ${s}`).join('\n')}\n\n${report.scenarios.map(s=>`- ${s.id}: ${s.status} (${s.reason})`).join('\n')}\n`);
     console.log(`Report: ${join(reportDir,'report.json')}`);
   }
   process.exitCode=exitCode;
 }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
