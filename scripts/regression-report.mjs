import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
export const MATRIX = JSON.parse(readFileSync(new URL('../e2e/matrix.json',import.meta.url),'utf8'));
export const REQUIRED_SCENARIOS = MATRIX.flatMap(row=>[row.id,...row.checks.map(check=>check.id)]);
export function sha256File(path) { const hash=createHash('sha256'), fd=openSync(path,'r'), buffer=Buffer.alloc(1024*1024); try { let n; while ((n=readSync(fd,buffer,0,buffer.length,null))>0) hash.update(buffer.subarray(0,n)); } finally { closeSync(fd); } return hash.digest('hex'); }
// These reports are evidence manifests, not a replacement for inspecting artifacts.
export function validateRegressionReport(report) {
  const errors=[];
  const require = (condition,message) => { if (!condition) errors.push(message); };
  const artifact = path => typeof path==='string' && existsSync(path) && statSync(path).isFile() && statSync(path).size>0;
  for (const kind of ['apk','model']) {
    const value=report?.[kind];
    require(artifact(value?.path), `${kind.toUpperCase()}_MISSING`);
    if (artifact(value?.path)) require(/^[a-f0-9]{64}$/.test(value.sha256 ?? '') && sha256File(value.path)===value.sha256, `${kind.toUpperCase()}_SHA256_MISMATCH`);
  }
  require(report?.status==='passed','RUN_NOT_COMPLETE');
  require(/^[a-f0-9]{40}$/.test(report?.commit ?? ''),'COMMIT_MISSING');
  const scenarios = Array.isArray(report?.scenarios) ? report.scenarios : [];
  for (const id of REQUIRED_SCENARIOS) {
    const rows=scenarios.filter(row=>row.id===id);
    require(rows.length===1,`SCENARIO_MISSING_OR_DUPLICATE:${id}`);
    const row=rows[0];
    require(row?.status==='passed',`SCENARIO_NOT_PASSED:${id}`);
    require(artifact(row?.junit),`JUNIT_MISSING:${id}`);
    if (artifact(row?.junit)) {
      const xml=readFileSync(row.junit,'utf8');
      require(/<testcase\b/.test(xml) && !/<(?:failure|error|skipped)\b/.test(xml),`JUNIT_NOT_PASSED:${id}`);
      require(xml.includes(`name="${id}"`),`JUNIT_ID_MISSING:${id}`);
    }
  }
  for (const mode of ['association','example','text','rule']) {
    const g=report?.generations?.find(row=>row.mode===mode);
    require(g?.runtime==='llama.rn' && g.modelSha256===report?.model?.sha256 && typeof g.text==='string' && g.text.trim().length>0 && artifact(g.screenshot) && artifact(g.hierarchy),`REAL_GENERATION_MISSING:${mode}`);
  }
  require(report?.network?.wifi===false && report?.network?.mobile===false,'OFFLINE_NOT_VERIFIED');
  require(report?.crashCount===0 && report?.anrCount===0 && artifact(report?.logcat),'CRASH_ANR_NOT_VERIFIED');
  const logs=Array.isArray(report?.deviceLogs)?report.deviceLogs:[];
  for(const phase of ['primary','upgrade'])require(logs.some(log=>log.phase?.startsWith(phase)&&artifact(log.path)),`DEVICE_LOG_MISSING:${phase}`);
  let crashes=0,anrs=0;
  for(const log of logs) {
    require(artifact(log.path),'DEVICE_LOG_ARTIFACT_MISSING');
    if(artifact(log.path)){const text=readFileSync(log.path,'utf8'),crashCount=(text.match(/FATAL EXCEPTION|Fatal signal/g)||[]).length,anrCount=(text.match(/ANR in |am_anr/g)||[]).length;crashes+=crashCount;anrs+=anrCount;require(crashCount===log.crashCount&&anrCount===log.anrCount,'DEVICE_LOG_COUNTS_MISMATCH');}
  }
  require(crashes===0&&anrs===0&&crashes===report?.crashCount&&anrs===report?.anrCount,'DEVICE_LOG_CRASH_ANR_DETECTED');
  require(typeof report?.observations?.audioAudible==='boolean' && report?.observations?.audioAudible===true,'AUDIO_OBSERVATION_MISSING');
  require(report?.observations?.languageQuality==='reviewed' && typeof report?.observations?.languageNotes==='string' && report.observations.languageNotes.trim(),'LANGUAGE_OBSERVATION_MISSING');
  require(['absent-tested','offline-tested'].includes(report?.observations?.tts),'TTS_NOT_VERIFIED');
  require(report?.upgrade?.previousCommit==='19b2e0c1cf36eda73159aff9bb2d94b757d24144','UPGRADE_COMMIT_MISSING');
  require(report?.upgrade?.previousCommit!==report?.commit && report?.upgrade?.apkSha256!==report?.apk?.sha256 && artifact(report?.upgrade?.apk),'UPGRADE_NOT_DISTINCT');
  if(artifact(report?.upgrade?.apk))require(sha256File(report.upgrade.apk)===report.upgrade.apkSha256,'PREVIOUS_APK_SHA256_MISMATCH');
  require(artifact(report?.upgrade?.provenancePath),'UPGRADE_PROVENANCE_MISSING');
  if(artifact(report?.upgrade?.provenancePath)) {
    let provenance;try{provenance=JSON.parse(readFileSync(report.upgrade.provenancePath,'utf8'));}catch{}
    require(provenance?.commit===report.upgrade.previousCommit && provenance.sha256===report.upgrade.apkSha256 && provenance.sourceMapVerified===true,'UPGRADE_PROVENANCE_INVALID');
  }
  return {ok:errors.length===0,errors};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { const result=validateRegressionReport(JSON.parse(readFileSync(process.argv[2],'utf8'))); console.log(JSON.stringify(result,null,2)); process.exitCode=result.ok?0:1; }
  catch(error) { console.error(String(error)); process.exitCode=1; }
}
