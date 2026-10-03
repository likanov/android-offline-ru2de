import {validateRegressionReport} from './regression-report.mjs';
export function appendDeviceLog(report,{phase,path,text}) {
  report.deviceLogs ??= [];
  const row={phase,path,crashCount:(text.match(/FATAL EXCEPTION|Fatal signal/g)||[]).length,anrCount:(text.match(/ANR in |am_anr/g)||[]).length};
  report.deviceLogs.push(row);
  report.crashCount=report.deviceLogs.reduce((n,r)=>n+r.crashCount,0);
  report.anrCount=report.deviceLogs.reduce((n,r)=>n+r.anrCount,0);
  return row;
}
function decode(text) { return text.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#([0-9]+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'); }
export function generationFromHierarchy(xml) {
  const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(([node])=>Object.fromEntries([...node.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,decode(v)])));
  const find=id=>nodes.find(n=>n['resource-id']===id||n['resource-id']?.endsWith('/'+id));
  if(find('assistant-status')?.text!=='Проверьте подсказку перед сохранением')return null;
  return find('assistant-result')?.text?.trim()||null;
}
export function completeRegressionReport(report,validate=validateRegressionReport) {
  if(report.crashCount>0||report.anrCount>0||report.scenarios?.some(s=>s.status==='failed'))return {exitCode:1,status:'failed',errors:['SCENARIO_OR_RUNTIME_FAILED']};
  if(report.blockers?.length)return {exitCode:2,status:'not-verified',errors:report.blockers};
  const result=validate({...report,status:'passed'});
  return {exitCode:result.ok?0:2,status:result.ok?'passed':'not-verified',errors:result.errors};
}

export function offlineRadioState({wifi,mobile,airplane}) {return {wifi:wifi==='0'?false:null,mobile:mobile==='0'||airplane==='1'?false:null};}

export function rootVerified({uid}) {return uid.trim()==='0';}

export function applicationAlarmEpochs(dump,now) {
 return [...new Set([...dump.matchAll(/Alarm\{[^\n}]*\bwhen (\d+) com\.personal\.germanvocabulary\}/g)].map(m=>Number(m[1])).filter(n=>n>now))];
}
export function alarmMatchesLocalTime(epoch,zone,time) {
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(epoch);
 return parts.find(p=>p.type==='hour')?.value+':'+parts.find(p=>p.type==='minute')?.value===time;
}

export function maestroOutcome(status,xml) {
 if(status===0)return {status:'passed',exitCode:0,reason:'MAESTRO_PASSED'};
 if(/DeviceServerDiedException|Unable to connect to device|Failed to establish connection/.test(xml))return {status:'not-verified',exitCode:2,reason:'MAESTRO_DEVICE_UNAVAILABLE'};
 return {status:'failed',exitCode:1,reason:'MAESTRO_FAILED'};
}
