import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendDeviceLog,generationFromHierarchy,completeRegressionReport} from '../../scripts/regression-evidence.mjs';
test('device_logs_preserve_primary_crash_when_upgrade_is_clean',()=>{
  const report={deviceLogs:[]};
  appendDeviceLog(report,{phase:'primary',path:'/primary.log',text:'FATAL EXCEPTION: main\nProcess: com.personal.germanvocabulary\n'});
  appendDeviceLog(report,{phase:'upgrade',path:'/upgrade.log',text:'Android runtime initialized\n'});
  assert.equal(report.crashCount,1);assert.equal(report.anrCount,0);assert.equal(report.deviceLogs.length,2);
});
test('generation_capture_uses_nonempty_actual_edittext_and_completed_status',()=>{
  const xml='<hierarchy><node resource-id="assistant-result" text="DE: Der Stuhl.&#10;RU: Стул &amp; дом."/><node resource-id="assistant-status" text="Проверьте подсказку перед сохранением"/></hierarchy>';
  assert.equal(generationFromHierarchy(xml),'DE: Der Stuhl.\nRU: Стул & дом.');
  assert.equal(generationFromHierarchy(xml.replace('Проверьте подсказку перед сохранением','Загрузка модели и создание подсказки…')),null);
  assert.equal(generationFromHierarchy(xml.replace('DE: Der Stuhl.&#10;RU: Стул &amp; дом.','')),null);
});

test('generation_capture_accepts_uiautomator_single_quoted_edittext',()=>{
  const xml=`<hierarchy><node resource-id="assistant-status" text="Проверьте подсказку перед сохранением"/><node index="12" text='{"type":"association","word":{"de":"Stuhl","ru":"стул"}}' resource-id="assistant-result" class="android.widget.EditText" /></hierarchy>`;
  assert.equal(generationFromHierarchy(xml),'{"type":"association","word":{"de":"Stuhl","ru":"стул"}}');
});
test('complete_report_can_succeed_and_environment_incomplete_stays_nonzero',()=>{
  const validation={ok:true,errors:[]};
  assert.deepEqual(completeRegressionReport({blockers:[],crashCount:0,anrCount:0},()=>validation),{exitCode:0,status:'passed',errors:[]});
  assert.equal(completeRegressionReport({blockers:['MAESTRO_MISSING']},()=>validation).exitCode,2);
  assert.equal(completeRegressionReport({blockers:[],crashCount:1,anrCount:0},()=>validation).exitCode,1);
});
test('offline_radio_verification_handles_api36_no_sim_mobile_setting',async()=>{
 const {offlineRadioState}=await import('../../scripts/regression-evidence.mjs');
 assert.deepEqual(offlineRadioState({wifi:'0',mobile:'1',airplane:'1'}),{wifi:false,mobile:false});
 assert.deepEqual(offlineRadioState({wifi:'1',mobile:'0',airplane:'1'}),{wifi:null,mobile:false});
 assert.deepEqual(offlineRadioState({wifi:'0',mobile:'1',airplane:'0'}),{wifi:false,mobile:null});
});
test('adb_root_restart_requires_observed_uid_instead_of_command_transport_status',async()=>{
 const {rootVerified}=await import('../../scripts/regression-evidence.mjs');
 assert.equal(rootVerified({rootStatus:1,uid:'0'}),true);
 assert.equal(rootVerified({rootStatus:0,uid:'2000'}),false);
});
test('reminder_evidence_parses_only_future_application_alarms_and_local_time',async()=>{
 const {applicationAlarmEpochs,alarmMatchesLocalTime}=await import('../../scripts/regression-evidence.mjs');
 const time=Date.parse('2026-10-04T06:30:00Z');
 const dump=`RTC_WAKEUP #0: Alarm{abc type 0 when ${time} com.personal.germanvocabulary}\nRTC_WAKEUP #1: Alarm{def type 0 when ${time+5000} other.app}\nAlarm{old type 0 when 1000 com.personal.germanvocabulary}`;
 assert.deepEqual(applicationAlarmEpochs(dump,2000),[time]);
 const modernDump=`RTC_WAKEUP #19: Alarm{3966c00 type 0 origWhen ${time} whenElapsed 66634527 com.personal.germanvocabulary}
      tag=*walarm*:expo.modules.notifications.NOTIFICATION_EVENT
      type=RTC_WAKEUP origWhen=2026-10-04 08:30:00.000 window=+1h0m0s0ms repeatInterval=0 count=0 flags=0x20`;
 assert.deepEqual(applicationAlarmEpochs(modernDump,2000),[time]);
 assert.equal(alarmMatchesLocalTime(time,'Europe/Berlin','08:30'),true);
 assert.equal(alarmMatchesLocalTime(time,'America/New_York','08:30'),false);
});
test('maestro_transport_failure_is_unverified_and_assertion_failure_stays_failed',async()=>{
 const {maestroOutcome}=await import('../../scripts/regression-evidence.mjs');
 assert.deepEqual(maestroOutcome(0,'<testcase/>'),{status:'passed',exitCode:0,reason:'MAESTRO_PASSED'});
 assert.equal(maestroOutcome(1,'<failure>DeviceServerDiedException: DEADLINE_EXCEEDED</failure>').exitCode,2);
 assert.equal(maestroOutcome(1,'<failure>Assertion is false</failure>').exitCode,1);
});

test('full_report_requires_new_blocks',async()=>{
 const {validateRegressionReport}=await import('../../scripts/regression-report.mjs');
 const result=validateRegressionReport({status:'passed',runMode:{type:'block',block:'grammar-lektion2'},scenarios:[]});
 for(const block of ['extended-vocabulary','grammar-lektion2'])assert.ok(result.errors.includes('SCENARIO_NOT_PASSED:'+block));
 assert.ok(result.errors.includes('FULL_RUN_REQUIRED'));
});
