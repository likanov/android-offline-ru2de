import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {MATRIX} from '../../scripts/regression-report.mjs';

// check-syntax is parser-only: this test never selects, boots or contacts a device.
const flows=[...new Set([
 ...MATRIX.filter(row=>['extended-vocabulary','grammar-lektion2'].includes(row.id)).flatMap(row=>[row.flow,...row.checks.map(c=>c.flow)]),
 'checks/grammar-persistence.sqlite-five-six-upgrade.yaml','grammar-import-fixture.yaml','helpers/save-word-return-dictionary.yaml','helpers/open-navigation.yaml','helpers/ensure-visible-below.yaml','helpers/export-state.yaml','schema6-grammar-before.yaml',
])];
const maestro=[process.env.MAESTRO_BIN,resolve('../../../work/toolchains/maestro/maestro/bin/maestro')].filter(Boolean).find(path=>existsSync(path));
const parserHome=maestro?mkdtempSync(join(tmpdir(),'maestro-syntax-test-')):null;
after(()=>{if(parserHome)rmSync(parserHome,{recursive:true,force:true});});
for(const flow of flows)test('Maestro parses R1 flow '+flow,{skip:!maestro&&'Set MAESTRO_BIN to run the installed Maestro parser'},()=>{
 const result=spawnSync(maestro,['check-syntax',resolve('e2e',flow)],{encoding:'utf8',timeout:30000,env:{...process.env,JAVA_OPTS:`-Duser.home=${parserHome}`,MAESTRO_CLI_NO_ANALYTICS:'1',MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:'true'}});
 assert.equal(result.status,0,`${flow}: ${result.error??''}\n${result.stdout}\n${result.stderr}`);
 assert.equal(result.stdout.trim(),'OK',`${flow}: ${result.stderr}`);
 assert.equal(result.stderr.trim(),'',flow);
});

test('R1 no-argument commands use executable mapping values',()=>{
 function validate(value,path){
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(['hideKeyboard','back'].includes(key))assert.ok(child&&typeof child==='object'&&!Array.isArray(child),`${path}.${key}: Maestro requires a command mapping, not null`);
   validate(child,path+'.'+key);
  }
 }
 for(const flow of flows)validate(JSON.parse(readFileSync(resolve('e2e',flow),'utf8').split('---\n')[1]),flow);
});
