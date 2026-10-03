import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { REQUIRED_SCENARIOS, sha256File, validateRegressionReport } from '../../scripts/regression-report.mjs';
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
  writeFileSync(previousApk,'original candidate fixture');
  const scenarios=REQUIRED_SCENARIOS.map(id=>{
    const junit=join(f.root,id+'.xml');
    writeFileSync(junit,`<testsuite tests="1" failures="0"><testcase name="${id}"/></testsuite>`);
    return {id,status:'passed',junit};
  });
  return {status:'passed',commit:'b'.repeat(40),apk:{path:f.apk,sha256:sha256File(f.apk)},
    model:{path:join(f.modelDir,'model.gguf'),sha256:f.hash},scenarios,
    generations:['association','example','text','rule'].map(mode=>({mode,runtime:'llama.rn',modelSha256:f.hash,text:'Der Stuhl. Стул.',screenshot:artifact,hierarchy:artifact})),
    network:{wifi:false,mobile:false},crashCount:0,anrCount:0,logcat:artifact,
    observations:{audioAudible:true,languageQuality:'reviewed',languageNotes:'Observed articles and DE/RU content.',tts:'absent-tested'},
    upgrade:{previousCommit:'19b2e0c1cf36eda73159aff9bb2d94b757d24144',apk:previousApk,apkSha256:sha256File(previousApk)}};
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
