import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, statSync, statfsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { arch, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { MATRIX, REQUIRED_SCENARIOS, sha256File, validateRegressionReport } from './regression-report.mjs';
const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const taskRoot=resolve(appRoot,'../..');
const workRoot=join(taskRoot,'work/android-regression');
const avdRoot=join(workRoot,'avd');
const applicationId='com.personal.germanvocabulary';
const previousCommit='19b2e0c1cf36eda73159aff9bb2d94b757d24144';
class Unavailable extends Error { constructor(message) { super(message); this.exitCode=2; } }
const options={};
const report={version:1,status:'not-verified',startedAt:new Date().toISOString(),scenarios:REQUIRED_SCENARIOS.map(id=>({id,status:'not-verified',reason:'NOT_RUN'})),generations:[],blockers:[],commands:[]};
let reportDir, adb, emulator, maestro, processHandle, serial='emulator-5580', settingsSnapshot;
const env={...process.env,ANDROID_AVD_HOME:avdRoot,ANDROID_USER_HOME:join(workRoot,'android-user'),EXPO_NO_TELEMETRY:'1'};
const execute=(command,args=[],{allowFailure=false,timeout=60000,binary=false}={})=>{
  const r=spawnSync(command,args,{cwd:appRoot,env,encoding:binary?undefined:'utf8',timeout,maxBuffer:32*1024*1024});
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
function artifact(path) { return path && existsSync(path) && statSync(path).isFile(); }
async function preflight() {
  const sdk=resolve(options['sdk-root'] ?? process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(taskRoot,'work/toolchains/android-sdk'));
  report.environment={hostAbi:arch(),sdkRoot:sdk,avd:options.avd,avdHome:avdRoot,ramBytes:totalmem(),freeBytes:Number(statfsSync(workRoot).bavail)*Number(statfsSync(workRoot).bsize)};
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
  maestro=options.maestro ?? commandPath('maestro');
  if (!maestro) blockers.push('MAESTRO_MISSING');
  const adbVersion=execute(adb,['version'],{allowFailure:true}); report.environment.adb=adbVersion.stdout?.trim();
  if (adbVersion.status!==0) blockers.push('ADB_UNAVAILABLE');
  if (!artifact(emulator)) blockers.push('EMULATOR_MISSING');
  else { const r=execute(emulator,['-version'],{allowFailure:true}); report.environment.emulator={status:r.status,signal:r.signal,stdout:r.stdout?.trim(),stderr:r.stderr?.trim()}; if(r.status!==0) blockers.push('EMULATOR_UNAVAILABLE'); }
  if (maestro) { const r=execute(maestro,['--version'],{allowFailure:true}); report.environment.maestro=r.stdout?.trim(); if(r.status!==0) blockers.push('MAESTRO_UNAVAILABLE'); }
  const config=join(avdRoot,'GermanVocabulary_API36.avd/config.ini');
  if (!artifact(config)) blockers.push('AVD_MISSING:run npm run prepare:android:emulator');
  else { report.environment.avdConfig=readFileSync(config,'utf8'); writeFileSync(join(reportDir,'avd-config.ini'),report.environment.avdConfig); if(!/hw.ramSize\s*=\s*8192/.test(report.environment.avdConfig)|| !/disk.dataPartition.size\s*=\s*(12G|12884901888)/.test(report.environment.avdConfig)) blockers.push('AVD_RESOURCES_INVALID'); }
  const abi=arch()==='arm64'?'arm64-v8a':arch()==='x64'?'x86_64':null;
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
    if (!artifact(options.observations)) blockers.push('OBSERVATIONS_MISSING');
  }
  report.blockers=blockers;
  if(blockers.length) throw new Unavailable(blockers.join('\n'));
}
async function boot(name,wipe) {
  const devices=execute(adb,['devices']).stdout;
  if(devices.includes(serial)) throw new Unavailable('DEDICATED_PORT_BUSY');
  const stdout=openSync(join(reportDir,`${name}-emulator.stdout.log`),'a'),stderr=openSync(join(reportDir,`${name}-emulator.stderr.log`),'a');
  processHandle=spawn(emulator,['-avd',name,'-port','5580','-memory','8192','-partition-size','12288','-no-snapshot',...(wipe?['-wipe-data']:[])],{env,stdio:['ignore',stdout,stderr]});
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
  shell('svc','wifi','disable');shell('svc','data','disable');execute(adb,['-s',serial,'reverse','--remove-all']);
  const wifi=shell('settings','get','global','wifi_on').stdout.trim(),mobile=shell('settings','get','global','mobile_data').stdout.trim();
  report.network={wifi:wifi==='0'?false:null,mobile:mobile==='0'?false:null};
  if(report.network.wifi!==false||report.network.mobile!==false) throw new Unavailable('NETWORK_DISABLE_UNVERIFIED');
}
function snapshotSettings() {
  settingsSnapshot={font:shell('settings','get','system','font_scale').stdout.trim(),autoTime:shell('settings','get','global','auto_time').stdout.trim(),autoZone:shell('settings','get','global','auto_time_zone').stdout.trim(),zone:shell('getprop','persist.sys.timezone').stdout.trim(),epoch:shell('date','+%s').stdout.trim(),hostTime:Date.now()};
  writeFileSync(join(reportDir,'system-settings-before.json'),JSON.stringify(settingsSnapshot,null,2));
}
function restoreSettings() {
  if(!settingsSnapshot)return;
  const failures=[];
  const restore=args=>{ const r=execute(adb,['-s',serial,'shell',...args],{allowFailure:true});if(r.status!==0)failures.push(args.join(' ')); };
  restore(['wm','size','reset']);restore(['wm','density','reset']);
  for(const [namespace,key,value] of [['system','font_scale',settingsSnapshot.font],['global','auto_time',settingsSnapshot.autoTime],['global','auto_time_zone',settingsSnapshot.autoZone]]) restore(value==='null'?['settings','delete',namespace,key]:['settings','put',namespace,key,value]);
  restore(['setprop','persist.sys.timezone',settingsSnapshot.zone]);
  // Calendar scenarios may change device clock. Restore elapsed wall time too.
  restore(['date','-s',`@${Number(settingsSnapshot.epoch)+Math.floor((Date.now()-settingsSnapshot.hostTime)/1000)}`]);
  restore(['am','broadcast','-a','android.intent.action.TIME_SET']);
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
  const row=report.scenarios.find(s=>s.id===id);
  if(row) Object.assign(row,{junit,screenshot:screenshot(id),status:r.status===0?'not-verified':'failed',reason:r.status===0?'FLOW_COVERAGE_DRAFT:see matrix; full requirement assertions not implemented':'MAESTRO_FAILED'});
  if(r.status!==0)throw Error(`SCENARIO_FAILED:${id}`);
}
async function run() {
  await boot(options.avd,true);
  snapshotSettings();offline();
  shell('logcat','-c');
  execute(adb,['-s',serial,'install',options.apk]);
  shell('mkdir','-p','/sdcard/Download/GermanVocabulary');
  for(const path of [report.model.path,report.model.manifestPath,options.fixture,join(appRoot,'e2e/fixtures/vocabulary.csv')]) execute(adb,['-s',serial,'push',path,'/sdcard/Download/GermanVocabulary/'],{timeout:180000});
  for(const row of MATRIX.filter(row=>['clean','main'].includes(row.phase))) flow(row.id,row.flow);
  // Preserve DB through both boundaries. No clearState, uninstall or wipe here.
  flow('persistence-before','persistence-before.yaml');
  shell('am','force-stop',applicationId);flow('persistence-force-stop','persistence-after.yaml',{PHASE_ID:'persistence-force-stop'});
  execute(adb,['-s',serial,'reboot']);
  let booted=false;for(let i=0;i<90;i++){await delay(2000);const r=execute(adb,['-s',serial,'shell','getprop','sys.boot_completed'],{allowFailure:true,timeout:5000});if(r.status===0&&r.stdout.trim()==='1'){booted=true;break;}}
  if(!booted)throw new Unavailable('REBOOT_TIMEOUT');offline();flow('persistence-reboot','persistence-after.yaml',{PHASE_ID:'persistence-reboot'});
  restoreSettings();execute(adb,['-s',serial,'emu','kill'],{allowFailure:true}); await delay(3000);
  // A second clean, isolated AVD is necessary: installing an old APK on a new DB
  // is not a migration test. No resets occur between old install and update.
  const prepare=execute(join(appRoot,'scripts/prepare-avd.sh'),['--upgrade'],{allowFailure:true});if(prepare.status!==0)throw new Unavailable('UPGRADE_AVD_PREPARE_FAILED');
  await boot('GermanVocabulary_API36_Upgrade',true);snapshotSettings();offline();
  execute(adb,['-s',serial,'install',options['previous-apk']]);flow('upgrade-before','upgrade-before.yaml');
  execute(adb,['-s',serial,'install','-r',options.apk]);
  report.upgrade={...report.upgrade,previousCommit,apk:resolve(options['previous-apk']),apkSha256:sha256File(options['previous-apk'])};
  flow('upgrade','upgrade.yaml');
  report.observations=JSON.parse(readFileSync(options.observations,'utf8'));
  // Generation is intentionally not fabricated from SQL fixture data. Draft
  // assistant flow artifacts must be inspected and the capture driver completed.
  report.blockers.push('REAL_GENERATION_CAPTURE_INCOMPLETE','FULL_SCENARIO_ASSERTIONS_INCOMPLETE');
  throw new Unavailable(report.blockers.join('\n'));
}
let exitCode=2;
try {
  const argv=process.argv.slice(2);
  const allowed=new Set(['preflight','sdk-root','apk','model-dir','avd','report-dir','maestro','previous-apk','fixture','observations']);
  for(let i=0;i<argv.length;i++){const key=argv[i].replace(/^--/,'');if(!argv[i].startsWith('--')||!allowed.has(key))throw new Unavailable(`ARGUMENT_INVALID:${argv[i]}`);if(key==='preflight')options[key]=true;else {if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Unavailable(`ARGUMENT_VALUE_MISSING:${key}`);options[key]=argv[++i];}}
  reportDir=resolve(options['report-dir'] ?? join(workRoot,`reports/${new Date().toISOString().replace(/[:.]/g,'-')}`));
  mkdirSync(reportDir,{recursive:true});mkdirSync(workRoot,{recursive:true});
  await preflight();
  if(options.preflight)throw new Unavailable('PREFLIGHT_ONLY:full regression not run');
  await run();
  report.status='passed';const validation=validateRegressionReport(report);report.validation=validation;if(!validation.ok)throw new Unavailable(validation.errors.join('\n'));exitCode=0;
} catch(error) {
  exitCode=error.exitCode ?? 1;report.status=exitCode===2?'not-verified':'failed';report.blockers.push(error.message);console.error(error.message);
} finally {
  if(reportDir) {
    if(processHandle) {
      try { const r=execute(adb,['-s',serial,'logcat','-d','-v','threadtime'],{allowFailure:true});report.logcat=join(reportDir,'logcat.txt');writeFileSync(report.logcat,r.stdout ?? '');const text=r.stdout ?? '';report.crashCount=(text.match(/FATAL EXCEPTION|Fatal signal/g)||[]).length;report.anrCount=(text.match(/ANR in |am_anr/g)||[]).length;if(report.crashCount||report.anrCount) {exitCode=1;report.status='failed';} } catch(error){report.blockers.push(`LOGCAT_FAILED:${error.message}`);exitCode=exitCode||2;}
      try{restoreSettings();}catch(error){report.blockers.push(error.message);exitCode=exitCode||2;report.status='not-verified';}
      execute(adb,['-s',serial,'emu','kill'],{allowFailure:true});processHandle.kill('SIGTERM');
    }
    report.completedAt=new Date().toISOString();report.exitCode=exitCode;report.validation=validateRegressionReport(report);
    writeFileSync(join(reportDir,'report.json'),JSON.stringify(report,null,2)+'\n');
    writeFileSync(join(reportDir,'summary.md'),`# Android regression\n\nStatus: ${report.status}; exit ${exitCode}.\n\n${report.blockers.map(s=>`- ${s}`).join('\n')}\n\n${report.scenarios.map(s=>`- ${s.id}: ${s.status} (${s.reason})`).join('\n')}\n`);
    console.log(`Report: ${join(reportDir,'report.json')}`);
  }
  process.exitCode=exitCode;
}
