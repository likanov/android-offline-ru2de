import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
export const MATRIX = JSON.parse(readFileSync(new URL('../e2e/matrix.json',import.meta.url),'utf8'));
export const BLOCK_IDS = MATRIX.map(row=>row.id);
export const REQUIRED_SCENARIOS = MATRIX.flatMap(row=>[row.id,...row.checks.map(check=>check.id)]);
export function matrixRowForBlock(block) {
  const row = MATRIX.find(candidate => candidate.id === block);
  if (!row) throw new Error(`BLOCK_INVALID:${block}`);
  return row;
}
export function scenarioIdsForBlock(block) {
  const row = matrixRowForBlock(block);
  return [row.id, ...row.checks.map(check => check.id)];
}
const DICTIONARY_UX_CHECKS = [
  'dictionary.viewport-keyboard',
  'dictionary.context-return',
  'dictionary.search-variants',
  'dictionary.empty-status-accessibility',
  'dictionary.large-font',
  'dictionary.large-profile',
];
export function validateDictionaryUxEvidence(report) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const artifact = path => typeof path === 'string' && existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
  const apkSha256 = report?.apk?.sha256;
  require(/^[a-f0-9]{64}$/.test(apkSha256 ?? ''), 'DICTIONARY_APK_SHA256_MISSING');
  const ux = report?.dictionaryUx;
  for (const id of DICTIONARY_UX_CHECKS) {
    const item = ux?.[id];
    require(item && item.apkSha256 === apkSha256, `DICTIONARY_APK_SHA256_MISMATCH:${id}`);
    const captures = Array.isArray(item?.captures) ? item.captures : [];
    require(captures.length > 0, `DICTIONARY_CAPTURES_MISSING:${id}`);
    for (const capture of captures) {
      require(artifact(capture?.screenshot) && artifact(capture?.hierarchy), `DICTIONARY_CAPTURE_ARTIFACT_MISSING:${id}`);
    }
    const observations = item?.observations ?? {};
    if (id === 'dictionary.viewport-keyboard') {
      require(captures.some(capture => capture.step === 'keyboard-closed') && captures.some(capture => capture.step === 'keyboard-open'), 'DICTIONARY_VIEWPORT_CAPTURES_MISSING');
      require(observations.twoRowsVisible === true && observations.addVisible === true && observations.resultTappable === true, 'DICTIONARY_VIEWPORT_OBSERVATION_MISSING');
    }
    if (id === 'dictionary.context-return') require(observations.contextPreserved === true && observations.profilesIsolated === true, 'DICTIONARY_CONTEXT_OBSERVATION_MISSING');
    if (id === 'dictionary.search-variants') require(observations.searchVariants === true, 'DICTIONARY_SEARCH_OBSERVATION_MISSING');
    if (id === 'dictionary.empty-status-accessibility') require(observations.emptyStatesReviewed === true && observations.talkBackReviewed === true && observations.selectedAnnounced === true, 'DICTIONARY_EMPTY_ACCESSIBILITY_OBSERVATION_MISSING');
    if (id === 'dictionary.large-font') require(observations.labelsReadable === true && observations.actionsReachable === true, 'DICTIONARY_LARGE_FONT_OBSERVATION_MISSING');
    if (id === 'dictionary.large-profile') require(observations.wordCount === 10000 && Array.isArray(observations.samplesMs) && observations.samplesMs.length === 20 && Number.isFinite(observations.p95Ms) && observations.p95Ms <= 300, 'DICTIONARY_LARGE_PROFILE_MEASUREMENT_MISSING');
  }
  return { ok: errors.length === 0, errors };
}
const QUESTION_UI_SCENARIOS = [
  'question-ui.word-typing',
  'question-ui.grammar-typing',
  'question-ui.practice-typing',
  'question-ui.error-help-return',
  'question-ui.large-font-background',
];
export function validateQuestionUiEvidence(report) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const artifact = path => typeof path === 'string' && existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
  const apkSha256 = report?.apk?.sha256;
  require(/^[a-f0-9]{64}$/.test(apkSha256 ?? ''), 'QUESTION_UI_APK_SHA256_MISSING');
  for (const id of QUESTION_UI_SCENARIOS) {
    const item = report?.questionUi?.[id];
    require(item && item.apkSha256 === apkSha256, `QUESTION_UI_APK_SHA256_MISMATCH:${id}`);
    const captures = Array.isArray(item?.captures) ? item.captures : [];
    for (const step of ['keyboard-closed', 'keyboard-open', 'after-submit']) {
      const matches = captures.filter(capture => capture?.step === step);
      require(matches.length === 1, `QUESTION_UI_CAPTURE_MISSING:${id}:${step}`);
      const capture = matches[0];
      if (!capture) continue;
      require(artifact(capture.screenshot) && artifact(capture.hierarchy), `QUESTION_UI_ARTIFACT_MISSING:${id}:${step}`);
      require(Number.isFinite(capture.viewport?.top) && Number.isFinite(capture.viewport?.bottom), `QUESTION_UI_VIEWPORT_MISSING:${id}:${step}`);
      require(capture.submit && Number.isFinite(capture.submit.top) && Number.isFinite(capture.submit.bottom), `QUESTION_UI_SUBMIT_GEOMETRY_MISSING:${id}:${step}`);
      if (step === 'keyboard-open') {
        require(capture.keyboard?.visible === true && Number.isFinite(capture.keyboard?.top), `QUESTION_UI_KEYBOARD_MISSING:${id}`);
        require(capture.input && Number.isFinite(capture.input.top) && Number.isFinite(capture.input.bottom), `QUESTION_UI_INPUT_MISSING:${id}`);
        if (capture.input && Number.isFinite(capture.keyboard?.top)) require(capture.input.bottom <= capture.keyboard.top, `QUESTION_UI_INPUT_OVERLAPS_KEYBOARD:${id}`);
        if (capture.submit && Number.isFinite(capture.keyboard?.top)) require(capture.submit.bottom <= capture.keyboard.top, `QUESTION_UI_SUBMIT_OVERLAPS_KEYBOARD:${id}`);
      }
      if (step === 'after-submit') require(capture.keyboard?.visible !== true || !Number.isFinite(capture.keyboard?.top) || capture.submit.bottom <= capture.keyboard.top, `QUESTION_UI_RESULT_OVERLAPS_KEYBOARD:${id}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
export function validateBlockRegressionReport(report, block) {
  const errors=[];
  let row;
  try { row=matrixRowForBlock(block); } catch(error) { return {ok:false,errors:[String(error.message??error)]}; }
  const require=(condition,message)=>{if(!condition)errors.push(message);};
  const artifact=path=>typeof path==='string'&&existsSync(path)&&statSync(path).isFile()&&statSync(path).size>0;
  require(report?.status==='passed','RUN_NOT_COMPLETE');
  require(report?.runMode?.type==='block'&&report.runMode.block===block,'BLOCK_RUN_MODE_MISSING');
  require(artifact(report?.apk?.path)&&/^[a-f0-9]{64}$/.test(report?.apk?.sha256??'')&&sha256File(report.apk.path)===report.apk.sha256,'APK_EVIDENCE_MISSING');
  require(artifact(report?.model?.path)&&/^[a-f0-9]{64}$/.test(report?.model?.sha256??'')&&sha256File(report.model.path)===report.model.sha256,'MODEL_EVIDENCE_MISSING');
  const scenarios=Array.isArray(report?.scenarios)?report.scenarios:[];
  for(const check of [{id:row.id,state:false}, ...row.checks]){
    const id=check.id, matches=scenarios.filter(item=>item.id===id);
    require(matches.length===1,`SCENARIO_MISSING_OR_DUPLICATE:${id}`);
    const item=matches[0];
    require(item?.status==='passed',`SCENARIO_NOT_PASSED:${id}`);
    require(artifact(item?.junit),`JUNIT_MISSING:${id}`);
    if(artifact(item?.junit)){
      const xml=readFileSync(item.junit,'utf8');
      require(/<testcase\b/.test(xml)&&!/<(?:failure|error|skipped)\b/.test(xml),`JUNIT_NOT_PASSED:${id}`);
      require(xml.includes(`name="${id}"`),`JUNIT_ID_MISSING:${id}`);
    }
    if(['extended-vocabulary','grammar-lektion2'].includes(block))require(item?.apkSha256===report?.apk?.sha256,`SCENARIO_APK_MISMATCH:${id}`);
    if(check.state)require(artifact(item?.stateEvidence)&&item?.stateValidation?.ok===true,`STATE_EVIDENCE_MISSING:${id}`);
    if(check.device==='four-generations')require(Array.isArray(report?.generations)&&report.generations.some(g=>g.mode==='grammar-error'&&g.modelSha256===report?.model?.sha256&&typeof g.text==='string'&&g.text.trim()&&artifact(g.screenshot)&&artifact(g.hierarchy)),`REAL_GENERATION_MISSING:grammar-error`);
  }
  require((report?.crashCount??0)===0&&(report?.anrCount??0)===0,'CRASH_ANR_NOT_VERIFIED');
  if (block === 'grammar-lektion2')errors.push(...validateSchema6ReportEvidence(report).errors);
  if (block === 'dictionary') errors.push(...validateDictionaryUxEvidence(report).errors);
  if (block === 'question-ui') errors.push(...validateQuestionUiEvidence(report).errors);
  return {ok:errors.length===0,errors};
}
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
  require(report?.runMode?.type!=='block','FULL_RUN_REQUIRED');
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
  for(const block of MATRIX.filter(row=>['extended-vocabulary','grammar-lektion2'].includes(row.id)))for(const check of block.checks){const row=scenarios.find(s=>s.id===check.id);require(row?.apkSha256===report?.apk?.sha256,`SCENARIO_APK_MISMATCH:${check.id}`);if(check.state)require(artifact(row?.stateEvidence)&&row?.stateValidation?.ok===true,`STATE_EVIDENCE_MISSING:${check.id}`);}
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
  errors.push(...validateSchema6ReportEvidence(report).errors);
  if (report?.dictionaryUx) errors.push(...validateDictionaryUxEvidence(report).errors);
  if (report?.questionUi) errors.push(...validateQuestionUiEvidence(report).errors);
  return {ok:errors.length===0,errors};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { const result=validateRegressionReport(JSON.parse(readFileSync(process.argv[2],'utf8'))); console.log(JSON.stringify(result,null,2)); process.exitCode=result.ok?0:1; }
  catch(error) { console.error(String(error)); process.exitCode=1; }
}

export function validateSchema6Upgrade(value) {
 const errors=[];
 const check=(ok,label)=>{if(!ok)errors.push(label);};
 check(/^[a-f0-9]{64}$/.test(value?.apkSha256??'')&&value.apkSha256!==value.finalSha256,'SCHEMA6_APK_NOT_DISTINCT');
 check(value?.package==='com.personal.germanvocabulary','SCHEMA6_PACKAGE_MISMATCH');
 check(/^[a-f0-9]{64}$/.test(value?.certificateSha256??'')&&value.certificateSha256===value.finalCertificateSha256,'SCHEMA6_CERTIFICATE_MISMATCH');
 const p=value?.provenance;
 check(p?.schemaVersion===6&&p.sourceMapVerified===true&&/^[a-f0-9]{40}$/.test(p.commit??'')&&p.sha256===value.apkSha256&&p.package===value.package&&p.certificateSha256===value.certificateSha256,'SCHEMA6_PROVENANCE_INVALID');
 return {ok:errors.length===0,errors};
}

function validateSchema6ReportEvidence(report) {
 const value=report?.schema6Upgrade,errors=[];
 const artifact=path=>typeof path==='string'&&existsSync(path)&&statSync(path).isFile()&&statSync(path).size>0;
 if(!value)return {ok:false,errors:['SCHEMA6_UPGRADE_MISSING']};
 let provenance;try{provenance=JSON.parse(readFileSync(value.provenancePath,'utf8'));}catch{}
 errors.push(...validateSchema6Upgrade({...value,provenance,finalSha256:report?.apk?.sha256}).errors);
 if(!artifact(value.apk)||sha256File(value.apk)!==value.apkSha256)errors.push('SCHEMA6_APK_HASH_MISMATCH');
 for(const key of ['beforeEvidence','afterEvidence'])if(!artifact(value[key]))errors.push('SCHEMA6_'+key.toUpperCase()+'_MISSING');
 if(value.stateValidation?.ok!==true)errors.push('SCHEMA6_GRAPH_NOT_VERIFIED');
 return {ok:errors.length===0,errors};
}
