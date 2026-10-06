import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {completeRegressionReport} from '../../scripts/regression-evidence.mjs';
import { REQUIRED_SCENARIOS, sha256File, validateRegressionReport, validateBlockRegressionReport } from '../../scripts/regression-report.mjs';
function inputs() {
  const root = mkdtempSync(join(tmpdir(), 'vocabulary-regression-'));
  const apk = join(root, 'app.apk'), modelDir = join(root, 'model'), sdk = join(root, 'sdk');
  mkdirSync(modelDir); mkdirSync(sdk);
  writeFileSync(apk, 'local APK fixture');
  const model = Buffer.from('GGUF\x03\x00\x00\x00local test model');
  writeFileSync(join(modelDir, 'model.gguf'), model);
  const hash = createHash('sha256').update(model).digest('hex');
  writeFileSync(join(modelDir, 'model-manifest.json'), JSON.stringify({fileName:'model.gguf',bytes:model.length,sha256:hash,id:'test',sourceRevision:'a'.repeat(40),quantization:'Q4_K_M',runtimeVersion:'0.12.9'}));
  return {root,apk,modelDir,sdk,hash};
}
test('regression_preflight_rejects_missing_adb', () => {
  const f = inputs();
  try {
    const result = spawnSync(process.execPath, ['scripts/emulator-regression.mjs','--preflight','--sdk-root',f.sdk,'--apk',f.apk,'--model-dir',f.modelDir,'--avd','GermanVocabulary_API36','--report-dir',join(f.root,'report')], {encoding:'utf8'});
    assert.equal(result.status, 2);
    assert.match(result.stderr, /ADB_MISSING/);
  } finally { rmSync(f.root,{recursive:true,force:true}); }
});
function completeReport(f) {
  const artifact=join(f.root,'evidence.txt'), previousApk=join(f.root,'old.apk');
  writeFileSync(artifact,'Observed UI artifacts and logcat fixture');
  const primaryLog=artifact+'.primary.log',upgradeLog=artifact+'.upgrade.log';writeFileSync(primaryLog,'Primary device clean log\n');writeFileSync(upgradeLog,'Upgrade device clean log\n');
  writeFileSync(previousApk,'original candidate fixture');
  const provenancePath=previousApk+'.provenance.json';
  writeFileSync(provenancePath,JSON.stringify({commit:'19b2e0c1cf36eda73159aff9bb2d94b757d24144',sha256:sha256File(previousApk),sourceMapVerified:true}));
  const scenarios=REQUIRED_SCENARIOS.map(id=>{
    const junit=join(f.root,id+'.xml');
    writeFileSync(junit,`<testsuite tests="1" failures="0"><testcase name="${id}"/></testsuite>`);
    const grammarState = id.startsWith('grammar-') && ['grammar-core.pronouns-sein-choice','grammar-core.typing-case-context','grammar-core.reference-no-xp','grammar-progress.twenty-ui-answers','grammar-progress.nineteen-error','grammar-progress.bonus-once-double-submit','grammar-progress.reviews-difficult','grammar-progress.combined-summary','grammar-persistence.profile-isolation','grammar-persistence.force-stop-reboot','grammar-persistence.word-dependency-edit','grammar-persistence.sqlite-five-six-upgrade','grammar-transfer-assistant.v1-v2-roundtrip','grammar-transfer-assistant.invalid-backup-atomicity'].includes(id);
    return grammarState ? {id,status:'passed',junit,stateEvidence:artifact,stateValidation:{ok:true}} : {id,status:'passed',junit};
  });
  return {status:'passed',commit:'b'.repeat(40),apk:{path:f.apk,sha256:sha256File(f.apk)},
    model:{path:join(f.modelDir,'model.gguf'),sha256:f.hash},scenarios,
    generations:['association','example','text','rule'].map(mode=>({mode,runtime:'llama.rn',modelSha256:f.hash,text:'Der Stuhl. Стул.',screenshot:artifact,hierarchy:artifact})),
    network:{wifi:false,mobile:false},crashCount:0,anrCount:0,logcat:artifact,deviceLogs:[{phase:'primary-final',path:primaryLog,crashCount:0,anrCount:0},{phase:'upgrade-final',path:upgradeLog,crashCount:0,anrCount:0}],
    observations:{audioAudible:true,languageQuality:'reviewed',languageNotes:'Observed articles and DE/RU content.',tts:'absent-tested'},
    upgrade:{previousCommit:'19b2e0c1cf36eda73159aff9bb2d94b757d24144',apk:previousApk,apkSha256:sha256File(previousApk),provenancePath}};
}
test('regression_report_accepts_complete_evidence_manifest',()=>{
  const f=inputs();
  try { assert.deepEqual(validateRegressionReport(completeReport(f)),{ok:true,errors:[]}); }
  finally { rmSync(f.root,{recursive:true,force:true}); }
});
test('regression_report_rejects_missing_flow_or_model', () => {
  const f=inputs();
  try {
    const report=completeReport(f);
    for (const id of REQUIRED_SCENARIOS) {
      const result=validateRegressionReport({...report,scenarios:report.scenarios.filter(row=>row.id!==id)});
      assert.equal(result.ok,false);
      assert.ok(result.errors.includes(`SCENARIO_MISSING_OR_DUPLICATE:${id}`));
    }
    const missingModel=validateRegressionReport({...report,model:null});
    assert.equal(missingModel.ok,false);assert.ok(missingModel.errors.includes('MODEL_MISSING'));
    for(const mode of ['association','example','text','rule']) {
      const result=validateRegressionReport({...report,generations:report.generations.filter(g=>g.mode!==mode)});
      assert.equal(result.ok,false);assert.ok(result.errors.includes(`REAL_GENERATION_MISSING:${mode}`));
    }
  } finally { rmSync(f.root,{recursive:true,force:true}); }
});
test('regression_report_rejects_stale_apk_sha256', () => {
  const f = inputs();
  try { const report=completeReport(f);writeFileSync(f.apk,'rebuilt APK');const result=validateRegressionReport(report);assert.equal(result.ok,false);assert.ok(result.errors.includes('APK_SHA256_MISMATCH')); }
  finally { rmSync(f.root,{recursive:true,force:true}); }
});
test('regression_report_rejects_skipped_failed_duplicate_and_unverified_results',()=>{
  const f=inputs();
  try {
    const report=completeReport(f),row=report.scenarios[0];
    for(const status of ['failed','not-verified','skipped'])assert.equal(validateRegressionReport({...report,scenarios:[{...row,status},...report.scenarios.slice(1)]}).ok,false);
    assert.equal(validateRegressionReport({...report,scenarios:[...report.scenarios,row]}).ok,false);
    writeFileSync(row.junit,`<testsuite><testcase name="${row.id}"><skipped/></testcase></testsuite>`);
    const result=validateRegressionReport(report);assert.ok(result.errors.includes(`JUNIT_NOT_PASSED:${row.id}`));
  } finally {rmSync(f.root,{recursive:true,force:true});}
});
test('upgrade_provenance_rejects_current_app_resolved_through_shared_dependencies',async()=>{
  const {validateUpgradeSourceMap}=await import('../../scripts/upgrade-provenance.mjs');
  const result=validateUpgradeSourceMap({sources:['/../../../outputs/german-vocabulary/App.tsx','/../../../outputs/german-vocabulary/src/core/migrations/004_topics.ts']});
  assert.equal(result.ok,false);
});
test('upgrade_provenance_accepts_checkout_owned_task5_app_and_schema',async()=>{
  const {validateUpgradeSourceMap}=await import('../../scripts/upgrade-provenance.mjs');
  assert.deepEqual(validateUpgradeSourceMap({sources:['/App.tsx','/src/app/navigation.tsx','/src/core/migrations/003_learning.ts','/../../../outputs/german-vocabulary/node_modules/react/index.js']}),{ok:true,errors:[]});
});

test('report_rejects_stale_previous_apk_and_wrong_provenance',()=>{
  const f=inputs();try {
    const report=completeReport(f);writeFileSync(report.upgrade.apk,'changed candidate');
    assert.ok(validateRegressionReport(report).errors.includes('PREVIOUS_APK_SHA256_MISMATCH'));
    report.upgrade.apkSha256=sha256File(report.upgrade.apk);
    assert.ok(validateRegressionReport(report).errors.includes('UPGRADE_PROVENANCE_INVALID'));
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('report_rejects_stale_model_and_incomplete_actual_observations',()=>{
  const f=inputs();try {
    const report=completeReport(f);writeFileSync(report.model.path,'changed GGUF');
    assert.ok(validateRegressionReport(report).errors.includes('MODEL_SHA256_MISMATCH'));
    for(const [field,value,error] of [['audioAudible',null,'AUDIO_OBSERVATION_MISSING'],['languageQuality','not-verified','LANGUAGE_OBSERVATION_MISSING'],['languageNotes','','LANGUAGE_OBSERVATION_MISSING'],['tts','not-verified','TTS_NOT_VERIFIED']]){
      assert.ok(validateRegressionReport({...report,observations:{...report.observations,[field]:value}}).errors.includes(error));
    }
  }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('runner_completion_uses_complete_real_report_validation',()=>{
 const f=inputs();try {const report=completeReport(f);assert.equal(completeRegressionReport(report).exitCode,0);report.generations=[];assert.equal(completeRegressionReport(report).exitCode,2);}finally{rmSync(f.root,{recursive:true,force:true});}
});
test('report_rejects_primary_crash_even_if_declared_aggregate_is_zero',()=>{
 const f=inputs();try {const report=completeReport(f);writeFileSync(report.deviceLogs[0].path,'FATAL EXCEPTION: main\nProcess: com.personal.germanvocabulary\n');assert.equal(validateRegressionReport(report).ok,false);}finally{rmSync(f.root,{recursive:true,force:true});}
});


test('runner_pulls_exported_backup_from_downloads_when_documentsui_ignores_subfolder', async () => {
  const {pullExportedFile} = await import('../../scripts/emulator-regression.mjs');
  const calls = [];
  const result = pullExportedFile({
    adb: 'adb',
    serial: 'emulator-5580',
    filename: 'imported-fixture.json',
    destination: '/tmp/imported-fixture.json',
    execute(command, args, options) {
      calls.push({command, args, options});
      const remote = args[3];
      return {status: remote === '/sdcard/Download/imported-fixture.json' ? 0 : 1};
    },
  });
  assert.equal(result.remote, '/sdcard/Download/imported-fixture.json');
  assert.deepEqual(calls.map(call => call.args[3]), [
    '/sdcard/Download/GermanVocabulary/imported-fixture.json',
    '/sdcard/Download/imported-fixture.json',
  ]);
  assert.ok(calls.every(call => call.options?.allowFailure === true));
});


test('runner_pulls_exported_backup_from_private_mirror_when_documentsui_path_is_hidden', async () => {
  const {pullExportedFile} = await import('../../scripts/emulator-regression.mjs');
  const calls = [];
  const result = pullExportedFile({
    adb: 'adb',
    serial: 'emulator-5580',
    filename: 'after-restore.json',
    destination: '/tmp/after-restore.json',
    execute(command, args, options) {
      calls.push({command, args, options});
      const remote = args[3];
      return {status: remote === '/data/user/0/com.personal.germanvocabulary/files/last-export.json' ? 0 : 1};
    },
  });
  assert.equal(result.remote, '/data/user/0/com.personal.germanvocabulary/files/last-export.json');
  assert.deepEqual(calls.map(call => call.args[3]), [
    '/sdcard/Download/GermanVocabulary/after-restore.json',
    '/sdcard/Download/after-restore.json',
    '/data/user/0/com.personal.germanvocabulary/files/last-export.json',
  ]);
});


test('scenario selection exposes exact block membership', async () => {
  const { scenarioIdsForBlock, BLOCK_IDS } = await import('../../scripts/regression-report.mjs');
  assert.ok(BLOCK_IDS.includes('dictionary'));
  assert.deepEqual(scenarioIdsForBlock('dictionary'), [
    'dictionary',
    'dictionary.noun-adjective-edit',
    'dictionary.search-nfc-nfd',
    'dictionary.lexical-reset',
    'dictionary.cosmetic-preserve',
    'dictionary.viewport-keyboard',
    'dictionary.context-return',
    'dictionary.search-variants',
    'dictionary.empty-status-accessibility',
    'dictionary.large-font',
    'dictionary.large-profile',
  ]);
});

test('grammar_block_report_requires_state_junit_and_model_evidence', async () => {
 const {scenarioIdsForBlock}=await import('../../scripts/regression-report.mjs');
 const ids=scenarioIdsForBlock('grammar-progress');
 const report={status:'passed',block:'grammar-progress',scenarios:ids.map(id=>({id,status:'passed',junit:'/tmp/does-not-exist.xml'})),apk:{sha256:'a'.repeat(64)},model:{sha256:'b'.repeat(64)}};
 const result=validateBlockRegressionReport(report,'grammar-progress');
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(error=>error.includes('JUNIT_MISSING')));
 assert.ok(result.errors.includes('STATE_EVIDENCE_MISSING:grammar-progress.twenty-ui-answers'));
});

test('runner_accepts_separate_v2_grammar_fixture_and_v5_upgrade_inputs', () => {
 const source=readFileSync('scripts/emulator-regression.mjs','utf8');
 assert.match(source,/grammar-fixture/);
 assert.match(source,/grammar-previous-apk/);
 assert.match(source,/options\['grammar-fixture'\]/);
 assert.match(source,/options\['grammar-previous-apk'\]/);
});

test('runner_rejects_unknown_block_before_adb_preflight', () => {
  const f = inputs();
  try {
    const result = spawnSync(process.execPath, [
      'scripts/emulator-regression.mjs',
      '--preflight',
      '--block', 'unknown-block',
      '--sdk-root', f.sdk,
      '--apk', f.apk,
      '--model-dir', f.modelDir,
      '--avd', 'GermanVocabulary_API36',
      '--report-dir', join(f.root, 'block-report'),
    ], {encoding:'utf8'});
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BLOCK_INVALID:unknown-block/);
    assert.doesNotMatch(result.stderr, /ADB_MISSING/);
  } finally { rmSync(f.root,{recursive:true,force:true}); }
});
