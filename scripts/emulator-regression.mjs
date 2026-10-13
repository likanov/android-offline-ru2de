import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, statSync, statfsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { arch, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import {appendDeviceLog,generationFromHierarchy,completeRegressionReport,offlineRadioState,rootVerified,applicationAlarmEpochs,alarmMatchesLocalTime,maestroOutcome} from './regression-evidence.mjs';
import {runRetainedUpgrade,installReplacementAndLaunch} from './regression-upgrade.mjs';
import {verifyScenarioState,compareBackupGraphs,compareGrammarRulesUpgrade} from './regression-state.mjs';
import { MATRIX, validateSchema8Upgrade, validateSchema6Upgrade, REQUIRED_SCENARIOS, sha256File, validateRegressionReport, validateBlockRegressionReport, matrixRowForBlock, scenarioIdsForBlock } from './regression-report.mjs';
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
  const needsModel=!['grammar-rules','grammar-lektion3'].includes(options.block);
  if(needsModel){
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
  }
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
  if(report.environment.freeBytes<16*1024**3+2*(report.model?.manifest?.bytes??0)+statSync(options.apk).size) blockers.push('HOST_DISK_INSUFFICIENT');
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
    if ((!options.block||options.block==='upgrade')&&!artifact(options['previous-apk'])) blockers.push('PREVIOUS_APK_MISSING:build original Task5 commit with same release key');
    else if(!options.block||options.block==='upgrade') {
      const previousHash=sha256File(options['previous-apk']);
      if(previousHash===report.apk.sha256)blockers.push('UPGRADE_APK_NOT_DISTINCT');
      const provenancePath=options['previous-apk']+'.provenance.json';
      if(!artifact(provenancePath))blockers.push('UPGRADE_PROVENANCE_MISSING');
      else { const provenance=JSON.parse(readFileSync(provenancePath,'utf8'));if(provenance.commit!==previousCommit||provenance.sha256!==previousHash||provenance.sourceMapVerified!==true)blockers.push('UPGRADE_PROVENANCE_MISMATCH');else report.upgrade={previousCommit,apk:resolve(options['previous-apk']),apkSha256:previousHash,provenancePath}; }
    }
    if(!options.block||['grammar-lektion2','extended-vocabulary'].includes(options.block)){
      if(!artifact(options['lektion2-fixture']))blockers.push('LEKTION2_FIXTURE_MISSING');
      if(!artifact(options['schema6-apk']))blockers.push('SCHEMA6_APK_MISSING');
      else {
        const apk=resolve(options['schema6-apk']),provenancePath=apk+'.provenance.json';
        const badging=execute(join(tools,'aapt'),['dump','badging',apk],{allowFailure:true});
        const signature=execute(join(tools,'apksigner'),['verify','--print-certs',apk],{allowFailure:true});
        const fingerprint=text=>text?.match(/certificate SHA-256 digest: ([a-f0-9]+)/)?.[1];
        let provenance;try{provenance=JSON.parse(readFileSync(provenancePath,'utf8'));}catch{}
        const evidence={apk,provenancePath,provenance,apkSha256:sha256File(apk),finalSha256:report.apk.sha256,package:badging.stdout?.match(/package: name='([^']+)'/)?.[1],certificateSha256:fingerprint(signature.stdout),finalCertificateSha256:fingerprint(report.apk.signature)};
        const validation=validateSchema6Upgrade(evidence);
        if(signature.status!==0||badging.status!==0)blockers.push('SCHEMA6_UNSIGNED_OR_INVALID');
        blockers.push(...validation.errors);report.schema6Upgrade=evidence;
      }
    }
    if(requiredRegressionInputs(options.block).includes('fixture')&&!artifact(options.fixture)) blockers.push('REGRESSION_FIXTURE_MISSING');
    if(requiredRegressionInputs(options.block).includes('grammar-fixture')&&!artifact(options['grammar-fixture'])) blockers.push('GRAMMAR_FIXTURE_MISSING');
    if(requiredRegressionInputs(options.block).includes('grammar-previous-apk')&&!artifact(options['grammar-previous-apk'])) blockers.push('GRAMMAR_PREVIOUS_APK_MISSING');
    else if(requiredRegressionInputs(options.block).includes('grammar-previous-apk')) {
      const apk=resolve(options['grammar-previous-apk']),hash=sha256File(apk),manifestPath=join(dirname(apk),'release-manifest.json');
      const signature=execute(join(tools,'apksigner'),['verify','--print-certs',apk],{allowFailure:true});
      const badging=execute(join(tools,'aapt'),['dump','badging',apk],{allowFailure:true});
      const certificate=signature.stdout?.match(/certificate SHA-256 digest: ([a-f0-9]+)/)?.[1];
      let manifest;try{manifest=JSON.parse(readFileSync(manifestPath,'utf8'));}catch{}
      const source=manifest?.sourceCommit?execute('git',['show',manifest.sourceCommit+':src/core/migrations.ts'],{allowFailure:true}):null;
      if(signature.status!==0||badging.status!==0||!badging.stdout?.includes("name='com.personal.germanvocabulary'")||!certificate||!report.apk.signature?.includes(certificate)||hash===report.apk.sha256)blockers.push('SCHEMA5_APK_INVALID');
      if(manifest?.files?.[basename(apk)]?.sha256!==hash||manifest?.certificateSha256!==certificate||source?.status!==0||!source.stdout?.includes('PRAGMA user_version=5'))blockers.push('SCHEMA5_PROVENANCE_INVALID');
      const sourceMigrationPath=join(reportDir,'schema5-source-migrations.ts');
      if(source?.status===0)writeFileSync(sourceMigrationPath,source.stdout);
      report.schema5Upgrade={apk,apkSha256:hash,manifestPath,sourceMigrationPath,sourceCommit:manifest?.sourceCommit,certificateSha256:certificate,finalCertificateSha256:report.apk.signature?.match(/certificate SHA-256 digest: ([a-f0-9]+)/)?.[1]};
    }

    if (!options.block || options.block === 'dictionary') {
      if (!artifact(options['dictionary-fixture'])) blockers.push('DICTIONARY_FIXTURE_MISSING');
      if (!artifact(options['dictionary-large-fixture'])) blockers.push('DICTIONARY_LARGE_FIXTURE_MISSING');
    }
    for(const key of requiredRegressionInputs(options.block))if(!artifact(options[key]))blockers.push('INPUT_MISSING:'+key);
    if(!options.block||options.block==='grammar-rules'){
      const legacyPath=schema8FixturePath();
      if(!artifact(legacyPath))blockers.push('SCHEMA8_FIXTURE_MISSING:'+legacyPath);
      const apk=options['schema8-apk'];
      if(artifact(apk)&&artifact(join(tools,'aapt'))&&artifact(join(tools,'apksigner'))){
       const provenancePath=apk+'.provenance.json';let provenance;try{provenance=JSON.parse(readFileSync(provenancePath,'utf8'));}catch{}
       const badging=execute(join(tools,'aapt'),['dump','badging',apk],{allowFailure:true}),signature=execute(join(tools,'apksigner'),['verify','--print-certs',apk],{allowFailure:true});
       const certificate=text=>text?.match(/certificate SHA-256 digest: ([a-f0-9]+)/)?.[1];
       const value={apk:resolve(apk),apkSha256:sha256File(apk),provenancePath,provenance,package:badging.stdout?.match(/package: name='([^']+)'/)?.[1],certificateSha256:certificate(signature.stdout),finalCertificateSha256:certificate(report.apk.signature),finalSha256:report.apk.sha256};
       blockers.push(...validateSchema8Upgrade(value).errors);if(signature.status!==0||badging.status!==0)blockers.push('SCHEMA8_UNSIGNED_OR_INVALID');report.schema8Upgrade=value;
      }
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
export function regressionFlowEnvironment(extra={}) { return {CATALOG_BASELINE:'false',...extra}; }
function flow(id,file,extra={}) {
  const junit=join(reportDir,`${id}.xml`);
  const args=['--device',serial,'test','--format','junit','--output',junit,'--test-output-dir',join(reportDir,`${id}-artifacts`),'-e',`REPORT_DIR=${reportDir}`,...Object.entries(regressionFlowEnvironment(extra)).flatMap(([k,v])=>['-e',`${k}=${v}`]),join(appRoot,'e2e',file)];
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
export function publicExportPlan(logicalName) {
 return {logicalName,filename:'b'+randomUUID().replaceAll('-','')+'.json',evidenceFilename:logicalName+'.json'};
}
function planExport(logicalName) {
 const plan=publicExportPlan(logicalName);
 (report.publicExports??=[]).push(plan);
 return plan;
}
export function exportedBackupCandidates(filename) {
 return ['/sdcard/Download/GermanVocabulary/'+filename, '/sdcard/Download/'+filename];
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
 const plan=planExport(name),{filename,evidenceFilename}=plan;flow('export-'+name,'helpers/export-state.yaml',{EXPORT_NAME:filename});
 const path=join(reportDir,evidenceFilename);
 const receipt=pullExportedFileInternal({execute,adb,serial,filename,destination:path});
 Object.assign(plan,{publicPath:receipt.remote,evidencePath:path});
 const backup=JSON.parse(readFileSync(path,'utf8'));if(backup.format!=='german-vocabulary-backup')throw Error('EXPORTED_BACKUP_INVALID');
 latestBackup=backup;return backup;
}
async function deviceRoot() {
 const r=execute(adb,['-s',serial,'root'],{allowFailure:true});if(r.stdout?.includes('cannot run as root'))throw new Unavailable('DEDICATED_AVD_ROOT_UNAVAILABLE');
 execute(adb,['-s',serial,'wait-for-device']);
 for(let i=0;i<10;i++){const observed=execute(adb,['-s',serial,'shell','id','-u'],{allowFailure:true});if(observed.status===0&&rootVerified({uid:observed.stdout}))return;await delay(1000);}
 throw new Unavailable('DEDICATED_AVD_ROOT_UNAVAILABLE');
}
export function setClock(instant,zone='Europe/Berlin',{relaunchApp=true,runShell=shell,clockReport=report}={}) {
 runShell('settings','put','global','auto_time','0');runShell('settings','put','global','auto_time_zone','0');runShell('setprop','persist.sys.timezone',zone);
 const epoch=Math.floor(Date.parse(instant)/1000);if(!Number.isFinite(epoch))throw Error('CLOCK_INPUT_INVALID');runShell('date','-s','@'+epoch);
 const actual=runShell('date','+%s').stdout.trim();if(Math.abs(Number(actual)-epoch)>5)throw new Unavailable('DEVICE_CLOCK_NOT_ACCEPTED');
 runShell('am','broadcast','--async','-a','android.intent.action.TIMEZONE_CHANGED','--es','time-zone',zone);runShell('am','broadcast','--async','-a','android.intent.action.TIME_SET');
 clockReport.clockChanges??=[];clockReport.clockChanges.push({instant,zone,actual:runShell('date','+%Y-%m-%dT%H:%M:%S%z').stdout.trim()});
 if(relaunchApp){runShell('am','force-stop',applicationId);runShell('am','start','-n',applicationId+'/.MainActivity');}
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
 if(check.device==='force-stop-reboot'){shell('am','force-stop',applicationId);shell('am','start','-W','-n',applicationId+'/.MainActivity');await rebootDevice();}
 if(check.device==='force-stop')shell('am','force-stop',applicationId);
 if(check.device==='reboot')await rebootDevice();
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
  if(['grammar-persistence.sqlite-five-six-upgrade','grammar-lektion2.schema6-eight-upgrade','grammar-rules.schema8-ten-upgrade'].includes(check.id))continue;
  const before=await prepareDetailedGrammarCheck(check,{
   capture:()=>{
    let value=baseline??latestBackup;
    if(check.state&&check.id!=='assistant.helper-save-edit'&&!baseline)value=captureState(check.id+'-before');
    if(check.id==='grammar-rules.legacy-backup-conversion')value=JSON.parse(readFileSync(schema8FixturePath(),'utf8'));
    return value;
   },
   prepareDevice:async value=>{
    if(check.id==='grammar-lektion3.keyboard-small-large'){flow(check.id+'-normal',check.flow,{...savedGrammarAnswers(value),CHECK_ID:check.id+'-normal'});report.grammarUi??={};report.grammarUi[check.id]={normal:{screenshot:screenshot(check.id+'-normal'),hierarchy:hierarchy(check.id+'-normal')}};}
    await beforeCheck(check);
   },
   flow,
  });
  const operation=planExport(check.id+'-operation'),restored=planExport(check.id+'-restored');
  const extra={...lektion2Answers(before),...savedGrammarAnswers(before),CHECK_ID:check.id,FIXTURE_DAY:fixtureDay,MODEL_FILENAME:report.model?.manifest?.fileName??'',EXPORT_NAME:operation.filename,RESTORE_CHECKPOINT_NAME:restored.filename};
  flow(check.id,check.flow,extra);
  report.scenarios.find(s=>s.id===check.id).apkSha256=report.apk.sha256;
  recordDictionaryUxEvidence(check);
  if(check.id==='grammar-lektion3.keyboard-small-large')report.grammarUi[check.id].smallLarge={screenshot:screenshot(check.id+'-small-large'),hierarchy:hierarchy(check.id+'-small-large')};
  await afterCheck(check);
  if(check.state) {
   const after=captureState(check.id+'-after'),today=shell('date','+%Y-%m-%d').stdout.trim();
   let restoreCheckpoint,restoreEvidence;
   if(check.id==='transfer.json-roundtrip'){
    const filename=restored.filename;
    restoreEvidence=join(reportDir,restored.evidenceFilename);
    const receipt=pullExportedFileInternal({execute,adb,serial,filename,destination:restoreEvidence});
    Object.assign(restored,{publicPath:receipt.remote,evidencePath:restoreEvidence});
    restoreCheckpoint=JSON.parse(readFileSync(restoreEvidence,'utf8'));
    if(restoreCheckpoint.format!=='german-vocabulary-backup')throw Error('RESTORE_CHECKPOINT_INVALID');
   }
   const result=verifyScenarioState(check.id,after,{before,today,fixtureDay,restoreCheckpoint});
   const scenario=report.scenarios.find(s=>s.id===check.id);scenario.stateEvidence=join(reportDir,check.id+'-after.json');scenario.stateValidation=result;scenario.beforeEvidence=join(reportDir,check.id+'-before.json');if(check.id==='grammar-rules.legacy-backup-conversion')writeFileSync(scenario.beforeEvidence,JSON.stringify(before));if(restoreEvidence)scenario.restoreEvidence=restoreEvidence;
   if(!result.ok){scenario.status='failed';scenario.reason=result.errors.join(';');throw Error('STATE_ASSERTION_FAILED:'+check.id+':'+scenario.reason);}
  }
  if(check.id==='grammar-progress.reviews-difficult')setClock(fixtureDay+'T12:00:00Z');
 }
 flow(row.id,row.flow,{FIXTURE_DAY:fixtureDay,GROUP_ID:row.id});
 report.scenarios.find(s=>s.id===row.id).apkSha256=report.apk.sha256;
}
async function preparePrimaryDevice() {
 await boot(options.avd,true);snapshotSettings();await deviceRoot();offline();
 execute(adb,['-s',serial,'install',options.apk]);setClock(fixtureDay+'T12:00:00Z');shell('logcat','-c');
 shell('mkdir','-p','/sdcard/Download/GermanVocabulary');
 for(const path of report.model?[report.model.path,report.model.manifestPath]:[])execute(adb,['-s',serial,'push',path,'/sdcard/Download/GermanVocabulary/'],{timeout:180000});
 const dictionaryFixture=options['dictionary-fixture'] ?? options.fixture;
 if(dictionaryFixture)execute(adb,['-s',serial,'push',dictionaryFixture,'/sdcard/Download/GermanVocabulary/dictionary-backup.json'],{timeout:180000});
 if(options.fixture)execute(adb,['-s',serial,'push',options.fixture,'/sdcard/Download/GermanVocabulary/regression-backup.json'],{timeout:180000});
 if(options['dictionary-large-fixture'])execute(adb,['-s',serial,'push',options['dictionary-large-fixture'],'/sdcard/Download/GermanVocabulary/dictionary-large-backup.json'],{timeout:180000});
 if(options['grammar-fixture'])execute(adb,['-s',serial,'push',options['grammar-fixture'],'/sdcard/Download/GermanVocabulary/grammar-backup-v2.json'],{timeout:180000});
 if(options['lektion2-fixture'])execute(adb,['-s',serial,'push',options['lektion2-fixture'],'/sdcard/Download/GermanVocabulary/lektion2-backup-v3.json']);
 for(const key of ['grammar-rules-fixture','lektion3-fixture'])if(options[key])execute(adb,['-s',serial,'push',options[key],'/sdcard/Download/GermanVocabulary/'+(key==='grammar-rules-fixture'?'grammar-rules-backup-v4.json':'lektion3-backup-v4.json')]);
 if(artifact(schema8FixturePath()))execute(adb,['-s',serial,'push',schema8FixturePath(),'/sdcard/Download/GermanVocabulary/grammar-rules-schema8-backup-v3.json']);
 for(const name of ['a1-300.csv','numbers-0-20.csv'])execute(adb,['-s',serial,'push',join(appRoot,'content/vocabulary',name),'/sdcard/Download/GermanVocabulary/']);
 execute(adb,['-s',serial,'push',join(appRoot,'e2e/fixtures/vocabulary.csv'),'/sdcard/Download/GermanVocabulary/'],{timeout:180000});
 execute(adb,['-s',serial,'push',join(appRoot,'e2e/fixtures/invalid-backup.json'),'/sdcard/Download/GermanVocabulary/']);
}
export function grammarFixtureImportEnvironment(path) {
 let fixture;try{fixture=JSON.parse(readFileSync(path,'utf8'));}catch{throw new Unavailable('GRAMMAR_FIXTURE_INVALID');}
 const profiles=fixture?.profiles;
 if(fixture?.format!=='german-vocabulary-backup'||fixture.version!==2||!Array.isArray(profiles)||!profiles.length||profiles.some(p=>typeof p?.profile?.id!=='string'||!p.profile.id||typeof p.profile.name!=='string'||!p.profile.name)||new Set(profiles.map(p=>p.profile.id)).size!==profiles.length)throw new Unavailable('GRAMMAR_FIXTURE_INVALID');
 return {BACKUP_FILE:'grammar-backup-v2.json',PROFILE_COUNT:String(profiles.length)};
}
async function importRegressionFixture(grammar=false) {
 const file=grammar?'grammar-backup-v2.json':'regression-backup.json';
 flow(grammar?'import-grammar-fixture':'import-fixture',grammar?'grammar-import-fixture.yaml':'import-fixture.yaml',grammar?grammarFixtureImportEnvironment(options['grammar-fixture']):{BACKUP_FILE:file,PROFILE_COUNT:'13'});latestBackup=captureState(grammar?'imported-grammar-fixture':'imported-fixture');
}
function lektion2Answers(backup) {
 const result={};
 for(const p of backup?.profiles??[]){
  const q=p.grammar?.sessions.find(s=>s.status==='active')?.currentQuestion;
  if(q?.catalogVersion!==2||q.presentation!=='sentence')continue;
  let key=p.profile.name.replace('A1 — ','').replaceAll('-','_').toUpperCase();
  if(p.profile.name==='A1 — пустой')key='EMPTY';
  if(p.profile.name==='A1 — Sie')key='SIE';
  result['ANSWER_'+key]=q.expected.sentences[0];
 }
 return result;
}
async function importLektion2Fixture() {
 flow('import-lektion2-fixture','grammar-import-fixture.yaml',{BACKUP_FILE:'lektion2-backup-v3.json'});
 latestBackup=captureState('imported-lektion2-fixture');
}
async function runCatalogUpgrade(schema) {
 if(processHandle){captureDeviceLog(devicePhase+'-before-schema'+schema);restoreSettings();execute(adb,['-s',serial,'emu','kill'],{allowFailure:true});await delay(3000);}
 devicePhase='upgrade-schema'+schema;
 execute('/bin/sh',[join(appRoot,'scripts/prepare-avd.sh'),'--upgrade']);
 await boot('GermanVocabulary_API36_Upgrade',true);snapshotSettings();await deviceRoot();offline();
 shell('mkdir','-p','/sdcard/Download/GermanVocabulary');shell('logcat','-c');
 const oldFixture=schema===6?options['grammar-fixture']:options.fixture;
 execute(adb,['-s',serial,'push',oldFixture,'/sdcard/Download/GermanVocabulary/old-versioned-backup.json']);
 const {before,after}=await runRetainedUpgrade({schema,prepareClock:options=>setClock(fixtureDay+'T12:00:00Z','Europe/Berlin',options),previousApk:options[schema===6?'schema6-apk':'grammar-previous-apk'],finalApk:options.apk,
  install:(path,replace)=>execute(adb,['-s',serial,'install',...(replace?['-r']:[]),path]),
  launch:()=>shell('am','start','-W','-n',applicationId+'/.MainActivity'),
  flow:id=>{flow(id,id+'.yaml',{CATALOG_BASELINE:'true'});if((schema===5&&id==='upgrade-before')||(schema===6&&id==='schema6-grammar-before')){const b=JSON.parse(readFileSync(oldFixture,'utf8'));flow('schema'+schema+'-legacy-import',schema===6?'grammar-import-fixture.yaml':'import-fixture.yaml',{BACKUP_FILE:'old-versioned-backup.json',PROFILE_COUNT:String(b.profiles.length)});}},capture:id=>captureState(id)});
 const id=schema===6?'grammar-lektion2.schema6-eight-upgrade':'grammar-persistence.sqlite-five-six-upgrade';
 const check=MATRIX.flatMap(row=>row.checks).find(check=>check.id===id);
 flow(id,check.flow);
 const validation=compareBackupGraphs(before,after,{upgrade:true});
 if(!before.profiles.some(p=>p.profile.name==='Миграция UI'&&p.profile.xp>=250&&p.attempts.length>=20))validation.errors.push('UPGRADE_UI_HISTORY_MISSING');
 if(schema===6&&!before.profiles.some(p=>p.grammar?.attempts.length>0))validation.errors.push('SCHEMA6_GRAMMAR_UI_HISTORY_MISSING');
 validation.ok=validation.errors.length===0;
 const scenario=report.scenarios.find(s=>s.id===id);
 Object.assign(scenario,{apkSha256:report.apk.sha256,stateEvidence:join(reportDir,`schema${schema}-after.json`),beforeEvidence:join(reportDir,`schema${schema}-before.json`),stateValidation:validation});
 Object.assign(report[schema===6?'schema6Upgrade':'schema5Upgrade'],{beforeEvidence:scenario.beforeEvidence,afterEvidence:scenario.stateEvidence,stateValidation:validation});
 if(!validation.ok){scenario.status='failed';throw Error('UPGRADE_GRAPH_CHANGED:'+validation.errors.join(';'));}
 captureDeviceLog(devicePhase+'-final');
}
async function importDictionaryFixtures() {
 if(options['dictionary-fixture']) { flow('import-dictionary-fixture','import-fixture.yaml',{BACKUP_FILE:'dictionary-backup.json',PROFILE_COUNT:'2'}); latestBackup=captureState('imported-dictionary-fixture'); }
 if(options['dictionary-large-fixture']) { flow('import-dictionary-large-fixture','import-fixture.yaml',{BACKUP_FILE:'dictionary-large-backup.json',PROFILE_COUNT:'1'}); latestBackup=captureState('imported-dictionary-large-fixture'); }
}
async function setupBlockPrerequisites() {
 flow('first-launch.clean-40-words','checks/first-launch.clean-40-words.yaml');
 if(report.model)flow('first-launch.model-picker','checks/first-launch.model-picker.yaml',{MODEL_FILENAME:report.model?.manifest?.fileName??''});
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
 await installReplacementAndLaunch({finalApk:options.apk,install:path=>execute(adb,['-s',serial,'install','-r',path]),launch:()=>shell('am','start','-W','-n',applicationId+'/.MainActivity')});shell('mkdir','-p','/sdcard/Download/GermanVocabulary');
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
 if(['grammar-rules','grammar-lektion3'].includes(block))await importNewGrammarFixture(block);
 else if(['extended-vocabulary','grammar-lektion2'].includes(block))await importLektion2Fixture();
 else await importRegressionFixture(block.startsWith('grammar-'));
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
 if(block==='grammar-rules')await runSchema8Upgrade();
 if(block==='grammar-lektion2')await runCatalogUpgrade(6);
 if(block==='grammar-persistence')await runCatalogUpgrade(5);
}
async function run() {
 await preparePrimaryDevice();
 await group(MATRIX.find(row=>row.id==='first-launch'));
 await importRegressionFixture();
 await importDictionaryFixtures();
 for(const row of MATRIX.filter(row=>row.phase==='main'&&!row.id.startsWith('grammar-')&&row.id!=='extended-vocabulary'))await group(row);
 await importRegressionFixture(true);
 for(const row of MATRIX.filter(row=>row.id.startsWith('grammar-')&&!['grammar-lektion2','grammar-rules','grammar-lektion3'].includes(row.id)))await group(row);
 await importLektion2Fixture();
 for(const id of ['extended-vocabulary','grammar-lektion2'])await group(MATRIX.find(row=>row.id===id));
 for(const id of ['grammar-rules','grammar-lektion3'])if(!options.block){await importNewGrammarFixture(id);await group(matrixRowForBlock(id));}
 flow('persistence-before','persistence-before.yaml');persistenceBaseline=captureState('persistence-baseline');
 shell('am','force-stop',applicationId);await group(MATRIX.find(row=>row.phase==='force-stop'),persistenceBaseline);
 await rebootDevice();await group(MATRIX.find(row=>row.phase==='reboot'),persistenceBaseline);
 captureDeviceLog('primary-final');restoreSettings();execute(adb,['-s',serial,'emu','kill']);await delay(3000);
 await runUpgradePhase();
 await runCatalogUpgrade(5);
 await runCatalogUpgrade(6);
 await runSchema8Upgrade();
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
   const allowed=new Set(['preflight','sdk-root','apk','model-dir','avd','report-dir','maestro','previous-apk','grammar-previous-apk','fixture','grammar-fixture','dictionary-fixture','dictionary-large-fixture','lektion2-fixture','schema6-apk','schema8-apk','schema8-fixture','grammar-rules-fixture','lektion3-fixture','observations','block']);
   for(let i=0;i<argv.length;i++){const key=argv[i].replace(/^--/,'');if(!argv[i].startsWith('--')||!allowed.has(key))throw new Unavailable(`ARGUMENT_INVALID:${argv[i]}`);if(key==='preflight')options[key]=true;else {if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Unavailable(`ARGUMENT_VALUE_MISSING:${key}`);options[key]=argv[++i];}}
   if(options.block){try{selectedBlockScenarios=scenarioIdsForBlock(options.block);}catch(error){throw new Unavailable(error.message);}}
   reportDir=resolve(options['report-dir'] ?? join(workRoot,`reports/${new Date().toISOString().replace(/[:.]/g,'-')}`));
   mkdirSync(reportDir,{recursive:true});mkdirSync(workRoot,{recursive:true});
   await preflight();
   if(options.preflight)throw new Unavailable('PREFLIGHT_ONLY:full regression not run');
   if(artifact(options.observations))report.observations=JSON.parse(readFileSync(options.observations,'utf8'));
   try{const fixturePath=options.block==='grammar-rules'?options['grammar-rules-fixture']:options.block==='grammar-lektion3'?options['lektion3-fixture']:options.block?.startsWith('grammar-')?options['grammar-fixture']:options.fixture;const parsed=JSON.parse(readFileSync(fixturePath,'utf8'));fixtureDay=parsed.profiles.find(p=>p.profile.name==='Регрессия — изучено')?.attempts?.[0]?.day??parsed.profiles.flatMap(p=>[...(p.attempts??[]),...(p.grammar?.attempts??[])]).map(a=>a.day).find(Boolean)??'2026-10-06';}catch{throw new Unavailable('REGRESSION_FIXTURE_INCOMPLETE');}
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

export function requiredRegressionInputs(block){
 if(block==='grammar-lektion3')return ['lektion3-fixture'];
 if(block==='grammar-rules')return ['grammar-rules-fixture','schema8-apk'];
 if(!block)return ['fixture','grammar-fixture','lektion2-fixture','grammar-rules-fixture','lektion3-fixture','dictionary-fixture','dictionary-large-fixture','previous-apk','grammar-previous-apk','schema6-apk','schema8-apk'];
 if(block==='upgrade')return ['previous-apk'];
 if(['grammar-lektion2','extended-vocabulary'].includes(block))return ['lektion2-fixture','schema6-apk',...(block==='grammar-lektion2'?['grammar-fixture']:[])];
 if(block.startsWith('grammar-'))return ['grammar-fixture',...(block==='grammar-persistence'?['grammar-previous-apk','fixture']:[])];
 return ['fixture',...(block==='dictionary'?['dictionary-fixture','dictionary-large-fixture']:[])];
}
function schema8FixturePath(){return options['schema8-fixture']??join(dirname(options['grammar-rules-fixture']??'.'),'grammar-rules-schema8-backup-v3.json');}
export function savedGrammarAnswers(backup){
 const env={};for(const p of backup?.profiles??[]){
  const q=p.grammar?.sessions.find(s=>s.status==='active')?.currentQuestion;if(!q)continue;
  const key=p.profile.name.replace(' — ','_').replaceAll('-','_').toUpperCase();
  if(q.responseMode==='choice'){env['OPTION_'+key]=q.expected.optionId;env['WRONG_'+key]=q.options.find(o=>o.id!==q.expected.optionId)?.id;}
  else if(q.responseMode==='typed')env['ANSWER_'+key]=q.expected.token??q.expected.sentences?.[0]??q.expected.phrases?.[0];
  else {const expected=q.expected.optionIds;const ids=[...expected,q.options.find(o=>!expected.includes(o.id))?.id];for(const [n,id]of ids.entries())env['MULTI_'+key+'_'+n]=id;}
 }return env;
}
async function importNewGrammarFixture(block){
 const key=block==='grammar-rules'?'grammar-rules-fixture':'lektion3-fixture',b=JSON.parse(readFileSync(options[key],'utf8'));
 if(b.version!==4)throw new Unavailable('BACKUP4_FIXTURE_REQUIRED');
 flow('import-'+block,'grammar-import-fixture.yaml',{BACKUP_FILE:block==='grammar-rules'?'grammar-rules-backup-v4.json':'lektion3-backup-v4.json',PROFILE_COUNT:String(b.profiles.length)});latestBackup=captureState('imported-'+block);
}
async function runSchema8Upgrade(){
 if(processHandle){captureDeviceLog(devicePhase+'-before-schema8');restoreSettings();execute(adb,['-s',serial,'emu','kill'],{allowFailure:true});await delay(3000);}
 devicePhase='upgrade-schema8';execute('/bin/sh',[join(appRoot,'scripts/prepare-avd.sh'),'--upgrade']);await boot('GermanVocabulary_API36_Upgrade',true);snapshotSettings();await deviceRoot();offline();shell('mkdir','-p','/sdcard/Download/GermanVocabulary');shell('logcat','-c');
 execute(adb,['-s',serial,'push',schema8FixturePath(),'/sdcard/Download/GermanVocabulary/grammar-rules-schema8-backup-v3.json']);
 const {before,after,repeat}=await runRetainedUpgrade({schema:8,previousApk:options['schema8-apk'],finalApk:options.apk,prepareClock:options=>setClock(fixtureDay+'T12:00:00Z','Europe/Berlin',options),install:(path,replace)=>execute(adb,['-s',serial,'install',...(replace?['-r']:[]),path]),launch:()=>shell('am','start','-W','-n',applicationId+'/.MainActivity'),flow:()=>{shell('am','start','-W','-n',applicationId+'/.MainActivity');flow('schema8-profile-before','checks/first-launch.clean-40-words.yaml');flow('schema8-grammar-before','grammar-import-fixture.yaml',{BACKUP_FILE:'grammar-rules-schema8-backup-v3.json',PROFILE_COUNT:'2'});},capture:id=>captureState(id)});
 const selected=before.profiles.filter(p=>p.profile.name.startsWith('Schema8 '));
 const validation=compareGrammarRulesUpgrade({...before,profiles:selected},{...after,profiles:after.profiles.filter(p=>selected.some(b=>b.profile.id===p.profile.id))},{day:fixtureDay,requireBoundaries:true});validation.errors.push(...compareBackupGraphs(after,repeat).errors);validation.ok=validation.errors.length===0;
 const id='grammar-rules.schema8-ten-upgrade',check=matrixRowForBlock('grammar-rules').checks.find(c=>c.id===id);flow(id,check.flow);
 const scenario=report.scenarios.find(s=>s.id===id);Object.assign(scenario,{apkSha256:report.apk.sha256,beforeEvidence:join(reportDir,'schema8-before.json'),stateEvidence:join(reportDir,'schema8-after.json'),stateValidation:validation});Object.assign(report.schema8Upgrade,{beforeEvidence:scenario.beforeEvidence,afterEvidence:scenario.stateEvidence,repeatEvidence:join(reportDir,'schema8-repeat.json'),day:fixtureDay,stateValidation:validation});
 if(!validation.ok){scenario.status='failed';throw Error('SCHEMA8_GRAPH_CHANGED:'+validation.errors.join(';'));}captureDeviceLog('upgrade-schema8-final');
}

// Public export navigates to Transfer, and device preparation can navigate again.
// Restore each older check's explicit question entry only after both operations.
export async function prepareDetailedGrammarCheck(check,{capture,prepareDevice,flow,advanceClock=day=>setClock(day+'T12:00:00Z')}){
 const before=await capture();await prepareDevice(before);
 const questions=new Set([
  'grammar-core.pronouns-sein-choice','grammar-core.typing-case-context','grammar-core.reference-no-xp','grammar-core.empty-dictionary-fallback','grammar-core.keyboard-320dp',
  'grammar-progress.twenty-ui-answers','grammar-progress.nineteen-error','grammar-progress.bonus-once-double-submit','grammar-progress.reviews-difficult',
  'grammar-persistence.profile-isolation','grammar-persistence.force-stop-reboot','grammar-persistence.word-dependency-edit',
  'grammar-transfer-assistant.no-model-rule','grammar-transfer-assistant.real-model-cancel',
 ]);
 if(questions.has(check.id)){
  const error=check.id==='grammar-progress.nineteen-error'||check.id.startsWith('grammar-transfer-assistant.');
  const review=check.id==='grammar-progress.reviews-difficult';
  if(review){
   const profile=before?.profiles?.find(p=>p.profile.name==='Грамматика — повторение');
   const due=profile?.grammar?.progress.find(p=>p.targetId==='sein-cloze:sie_formal'&&p.state.mastered&&p.attemptCount===21);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(due?.state.dueDay??''))throw new Unavailable('GRAMMAR_REVIEW_FIXTURE_NOT_READY');
   await advanceClock(due.state.dueDay);
  }
  await flow(check.id+'-question-entry','helpers/open-grammar-training.yaml',{PROFILE:error?'Грамматика — ошибка 19':review?'Грамматика — повторение':'Грамматика — 18 целей',GRAMMAR_START_ID:review?'grammar-review-start':'training-grammar-start'});
 }
 if(check.id==='grammar-progress.combined-summary')await flow(check.id+'-progress-entry','helpers/open-navigation.yaml',{NAV_TARGET:'nav-progress'});
 return before;
}
