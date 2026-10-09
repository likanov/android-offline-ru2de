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
    return {id,status:'passed',junit,apkSha256:sha256File(f.apk),stateEvidence:artifact,stateValidation:{ok:true}};
  });
  const schema6Provenance=join(f.root,'schema6-provenance.json');writeFileSync(schema6Provenance,JSON.stringify({schemaVersion:6,sha256:sha256File(previousApk),package:'com.personal.germanvocabulary',certificateSha256:'c'.repeat(64),commit:'d'.repeat(40),sourceMapVerified:true}));
  const manifestPath=join(f.root,'release-manifest.json'),sourceMigrationPath=join(f.root,'schema5-source.ts'),beforeEvidence=join(f.root,'schema5-before.json'),afterEvidence=join(f.root,'schema5-after.json');
  writeFileSync(manifestPath,JSON.stringify({apk:'old.apk',files:{'old.apk':{sha256:sha256File(previousApk)}},applicationId:'com.personal.germanvocabulary',sourceCommit:'d'.repeat(40),certificateSha256:'c'.repeat(64)}));
  writeFileSync(sourceMigrationPath,'PRAGMA user_version=5;');
  const profile={profile:{id:'p',name:'Миграция UI',xp:250},attempts:Array.from({length:20},(_,i)=>({attemptId:String(i),xpDelta:i===19?60:10})),rewards:[{amount:50}]};
  writeFileSync(beforeEvidence,JSON.stringify({version:1,profiles:[profile]}));writeFileSync(afterEvidence,JSON.stringify({version:3,profiles:[{...profile,grammar:{catalogVersions:[1,2],progress:[],sessions:[],questions:[],attempts:[],rewards:[]}}]}));
  Object.assign(scenarios.find(s=>s.id==='grammar-persistence.sqlite-five-six-upgrade'),{beforeEvidence,stateEvidence:afterEvidence});
  const schema5Upgrade={apk:previousApk,apkSha256:sha256File(previousApk),manifestPath,sourceMigrationPath,sourceCommit:'d'.repeat(40),certificateSha256:'c'.repeat(64),finalCertificateSha256:'c'.repeat(64),beforeEvidence,afterEvidence,stateValidation:{ok:true}};
  return {schema5Upgrade,schema6Upgrade:{apk:previousApk,apkSha256:sha256File(previousApk),package:'com.personal.germanvocabulary',certificateSha256:'c'.repeat(64),finalCertificateSha256:'c'.repeat(64),provenancePath:schema6Provenance,beforeEvidence:artifact,afterEvidence:artifact,stateValidation:{ok:true}},status:'passed',commit:'b'.repeat(40),apk:{path:f.apk,sha256:sha256File(f.apk)},
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


test('runner_rejects_missing_exact_public_export_even_when_private_mirror_exists', async () => {
 const {pullExportedFile}=await import('../../scripts/emulator-regression.mjs');const calls=[];
 assert.throws(()=>pullExportedFile({adb:'adb',serial:'emulator-5580',filename:'b123.json',destination:'/tmp/export.json',execute(command,args){calls.push(args[3]);return {status:args[3].includes('last-export.json')?0:1};}}),/EXPORTED_FILE_NOT_FOUND/);
 assert.deepEqual(calls,['/sdcard/Download/GermanVocabulary/b123.json','/sdcard/Download/b123.json']);
});

test('public_export_names_are_opaque_unique_and_keep_logical_evidence_names',async()=>{
 const {publicExportPlan}=await import('../../scripts/emulator-regression.mjs');
 const names=new Set();
 for(const logicalName of ['extended-vocabulary.backup3-roundtrip-operation','transfer.json-roundtrip-restored','imported-lektion2-fixture'])for(let i=0;i<100;i++){
  const plan=publicExportPlan(logicalName);
  assert.equal(plan.logicalName,logicalName);assert.equal(plan.evidenceFilename,logicalName+'.json');
  assert.match(plan.filename,/^b[a-f0-9]{32}\.json$/);assert.ok(!names.has(plan.filename));names.add(plan.filename);
 }
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

test('schema6_upgrade_requires_distinct_signed_apk',async()=>{
 const module=await import('../../scripts/regression-report.mjs');
 assert.equal(typeof module.validateSchema6Upgrade,'function');
 const validate=module.validateSchema6Upgrade;
 const base={apkSha256:'a'.repeat(64),finalSha256:'b'.repeat(64),package:'com.personal.germanvocabulary',certificateSha256:'c'.repeat(64),finalCertificateSha256:'c'.repeat(64),provenance:{schemaVersion:6,sha256:'a'.repeat(64),package:'com.personal.germanvocabulary',certificateSha256:'c'.repeat(64),commit:'d'.repeat(40),sourceMapVerified:true}};
 assert.equal(validate(base).ok,true);
 for(const change of [{finalSha256:base.apkSha256},{package:'other.app'},{finalCertificateSha256:'e'.repeat(64)},{provenance:{...base.provenance,sourceMapVerified:false}},{provenance:{...base.provenance,sha256:'f'.repeat(64)}}])assert.equal(validate({...base,...change}).ok,false);
});

test('retained_upgrade_exports_before_install_and_never_injects_database',async()=>{
 const {runRetainedUpgrade}=await import('../../scripts/regression-upgrade.mjs');
 const calls=[];
 const result=await runRetainedUpgrade({schema:6,previousApk:'old.apk',finalApk:'final.apk',install:(path,replace)=>calls.push(['install',path,replace]),launch:()=>calls.push(['launch']),flow:id=>calls.push(['flow',id]),capture:id=>{calls.push(['export',id]);return {id};}});
 assert.deepEqual(calls,[['install','old.apk',false],['flow','upgrade-before'],['flow','schema6-grammar-before'],['export','schema6-before'],['install','final.apk',true],['launch'],['export','schema6-after']]);
 assert.equal(result.before.id,'schema6-before');assert.equal(result.after.id,'schema6-after');
});

test('new_report_checks_reject_missing_skipped_and_other_apk_evidence',()=>{
 const f=inputs();try{
  for(const id of ['extended-vocabulary.typed-number','grammar-lektion2.five-lessons']){
   for(const mutation of [r=>r.scenarios=r.scenarios.filter(s=>s.id!==id),r=>r.scenarios.find(s=>s.id===id).status='skipped',r=>r.scenarios.find(s=>s.id===id).apkSha256='f'.repeat(64)]){
    const report=completeReport(f);mutation(report);assert.equal(validateRegressionReport(report).ok,false);
   }
  }
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('full_report_requires_legacy_apk_state_and_schema5_evidence',()=>{
 const f=inputs();try{
  let report=completeReport(f);report.scenarios.find(s=>s.id==='learning.twenty-ui-answers').apkSha256='f'.repeat(64);
  assert.ok(validateRegressionReport(report).errors.includes('SCENARIO_APK_MISMATCH:learning.twenty-ui-answers'));
  report=completeReport(f);delete report.scenarios.find(s=>s.id==='learning.twenty-ui-answers').stateEvidence;
  assert.ok(validateRegressionReport(report).errors.includes('STATE_EVIDENCE_MISSING:learning.twenty-ui-answers'));
  report=completeReport(f);delete report.schema5Upgrade;
  assert.ok(validateRegressionReport(report).errors.includes('SCHEMA5_UPGRADE_MISSING'));
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('schema5_evidence_rejects_missing_provenance_checkpoints_and_changed_graph',()=>{
 const f=inputs();try{
  for(const mutate of [r=>delete r.schema5Upgrade.manifestPath,r=>delete r.schema5Upgrade.beforeEvidence,r=>delete r.schema5Upgrade.afterEvidence,r=>r.schema5Upgrade.apkSha256='f'.repeat(64),r=>r.schema5Upgrade.finalCertificateSha256='f'.repeat(64),r=>writeFileSync(r.schema5Upgrade.afterEvidence,JSON.stringify({version:3,profiles:[]}))]){const r=completeReport(f);mutate(r);assert.equal(validateRegressionReport(r).ok,false);}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('legacy_grammar_import_uses_exact_validated_fixture_profile_count',async()=>{
 const module=await import('../../scripts/emulator-regression.mjs');
 assert.equal(typeof module.grammarFixtureImportEnvironment,'function');
 assert.deepEqual(module.grammarFixtureImportEnvironment('work/android-regression/fixtures/grammar-backup-v2.json'),{BACKUP_FILE:'grammar-backup-v2.json',PROFILE_COUNT:'3'});
 const f=inputs();try{
  const path=join(f.root,'grammar-backup.json');
  const fixture={format:'german-vocabulary-backup',version:2,profiles:Array.from({length:3},(_,i)=>({profile:{id:'p'+i,name:'Grammar '+i}}))};
  writeFileSync(path,JSON.stringify(fixture));
  assert.deepEqual(module.grammarFixtureImportEnvironment(path),{BACKUP_FILE:'grammar-backup-v2.json',PROFILE_COUNT:'3'});
  fixture.profiles.push({profile:{id:'p3',name:'Additional profile'}});writeFileSync(path,JSON.stringify(fixture));
  assert.equal(module.grammarFixtureImportEnvironment(path).PROFILE_COUNT,'4');
  for(const value of [{...fixture,profiles:[]},{...fixture,version:3},{...fixture,profiles:[{}]}]){writeFileSync(path,JSON.stringify(value));assert.throws(()=>module.grammarFixtureImportEnvironment(path),/GRAMMAR_FIXTURE_INVALID/);}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('catalog_upgrades_set_clock_without_starting_an_uninstalled_activity',async()=>{
 const {runRetainedUpgrade}=await import('../../scripts/regression-upgrade.mjs');
 const {setClock}=await import('../../scripts/emulator-regression.mjs');
 const instant='2026-10-09T12:00:00Z',epoch=String(Date.parse(instant)/1000);
 for(const schema of [5,6]){
  let installed=false;const calls=[],clockReport={};
  const runShell=(...args)=>{calls.push(args);if(args[0]==='am'&&['start','force-stop'].includes(args[1]))assert.ok(installed,'no Activity operation before old APK install');return {stdout:args[1]==='+%s'?epoch:instant};};
  await runRetainedUpgrade({schema,previousApk:'old.apk',finalApk:'new.apk',prepareClock:options=>setClock(instant,'Europe/Berlin',{...options,runShell,clockReport}),install:(path)=>{calls.push(['install',path]);installed=true;},launch:()=>{assert.ok(installed);},flow:id=>{assert.ok(installed);calls.push(['flow',id]);},capture:id=>({id})});
  assert.equal(clockReport.clockChanges?.length,1,'deterministic clock must be set');
  assert.ok(calls.findIndex(c=>c[0]==='date'&&c[1]==='-s')<calls.findIndex(c=>c[0]==='install'));
  assert.deepEqual(calls.filter(c=>c[0]==='am'&&['start','force-stop'].includes(c[1])),[]);
  assert.ok(calls.findIndex(c=>c[0]==='install')<calls.findIndex(c=>c[0]==='flow'));
 }
});

test('clock_changes_relaunch_installed_app_by_default',async()=>{
 const {setClock}=await import('../../scripts/emulator-regression.mjs');const calls=[];
 const instant='2026-10-09T12:00:00Z';
 setClock(instant,'Europe/Berlin',{clockReport:{},runShell:(...args)=>{calls.push(args);return {stdout:args[1]==='+%s'?String(Date.parse(instant)/1000):instant};}});
 assert.deepEqual(calls.slice(-2),[['am','force-stop','com.personal.germanvocabulary'],['am','start','-n','com.personal.germanvocabulary/.MainActivity']]);
});
test('retained_upgrade_foregrounds_replacement_before_public_after_export',async()=>{
 const {runRetainedUpgrade}=await import('../../scripts/regression-upgrade.mjs');
 for(const schema of [5,6]){
  let installed=false,foreground=false;const calls=[];
  await runRetainedUpgrade({schema,previousApk:'old.apk',finalApk:'final.apk',
   install:(apk,replace)=>{calls.push(['install',apk,replace]);installed=true;foreground=false;},
   launch:()=>{assert.ok(installed);calls.push(['launch']);foreground=true;},
   flow:id=>{assert.ok(installed);calls.push(['flow',id]);foreground=true;},
   capture:id=>{assert.ok(foreground,'public export requires foreground app after install-r');calls.push(['export',id]);return {id};},
  });
  const replace=calls.findIndex(c=>c[0]==='install'&&c[2]);assert.deepEqual(calls.slice(replace),[['install','final.apk',true],['launch'],['export',`schema${schema}-after`]]);
  assert.equal(calls.filter(c=>c[0]==='launch').length,1,'no launch before old APK installation');
 }
});
test('shared_in_place_upgrade_launches_only_after_successful_replacement',async()=>{
 const {installReplacementAndLaunch}=await import('../../scripts/regression-upgrade.mjs');const calls=[];
 await installReplacementAndLaunch({finalApk:'final.apk',install:async(apk,replace)=>{calls.push(['install',apk,replace]);},launch:async()=>calls.push(['launch'])});
 assert.deepEqual(calls,[['install','final.apk',true],['launch']]);
 await assert.rejects(installReplacementAndLaunch({finalApk:'bad.apk',install:async()=>{throw Error('install failed');},launch:()=>assert.fail('must not launch failed install')}),/install failed/);
});
