// Synthetic host contract evidence only; these files never certify Android.
import {writeFileSync} from 'node:fs';
import {sha256File,SCHEMA8_BASELINE_CERTIFICATE} from '../../scripts/regression-report.mjs';
export function syntheticSchema8Evidence(root,finalSha256,scenarios){
 const file=(name,data)=>{const path=root+'/'+name;writeFileSync(path,typeof data==='string'?data:JSON.stringify(data));return path;};
 const apk=file('schema8.apk','synthetic rebuilt schema8 APK');
 const state=n=>({streak:n,mastered:n===20,masteryBonusGranted:n===20,reviewStage:0,dueDay:n===20?'2026-10-07':null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0});
 const targets=['pronoun-cloze:ich','pronoun-cloze:du','pronoun-cloze:er','pronoun-cloze:sie_feminine','pronoun-cloze:es'];
 const progress=targets.map((targetId,i)=>({profileId:'p8',targetId,attemptCount:[0,9,10,19,20][i],variantIndex:[0,0,1,1,2][i],state:state([0,9,10,19,20][i])}));
 const before={version:3,profiles:[{profile:{id:'p8',name:'Schema8 0',xp:630},words:[],progress:[],attempts:[],rewards:[],dailyActivity:[{profileId:'p8',day:'2026-10-06',correct:58,errors:0,xp:630}],grammar:{catalogVersions:[1,2],progress,sessions:[],questions:[],attempts:[],rewards:[]}}]};
 const after=structuredClone(before);after.version=4;const p=after.profiles[0],g=p.grammar;g.catalogVersions=[1,2,3];g.rulesVersion=2;
 g.rulesTransitions=progress.map(r=>({profileId:'p8',targetId:r.targetId,fromRulesVersion:1,toRulesVersion:2,afterAttemptId:null,day:'2026-10-13',stateBefore:r.state,stateAfter:r.state.streak>=10?{...r.state,streak:10,mastered:true,masteryBonusGranted:true,dueDay:r.state.mastered?r.state.dueDay:'2026-10-14'}:r.state,xpDelta:r.state.streak>=10&&!r.state.masteryBonusGranted?50:0}));
 g.progress=g.progress.map((r,i)=>({...r,state:g.rulesTransitions[i].stateAfter}));p.profile.xp=730;p.dailyActivity.push({profileId:'p8',day:'2026-10-13',correct:0,errors:0,xp:100});
 const beforeEvidence=file('schema8-before.json',before),afterEvidence=file('schema8-after.json',after),repeatEvidence=file('schema8-repeat.json',after);
 const certificateSha256=SCHEMA8_BASELINE_CERTIFICATE,apkSha256=sha256File(apk);
 const provenancePath=file('schema8.provenance.json',{schemaVersion:8,commit:'7828274'+'a'.repeat(33),sourceMapVerified:true,rebuiltExactCommit:true,sha256:apkSha256,package:'com.personal.germanvocabulary',certificateSha256});
 const scenario=scenarios.find(s=>s.id==='grammar-rules.schema8-ten-upgrade');if(scenario)Object.assign(scenario,{beforeEvidence,stateEvidence:afterEvidence});
 return {apk,apkSha256,finalSha256,package:'com.personal.germanvocabulary',certificateSha256,finalCertificateSha256:certificateSha256,provenancePath,beforeEvidence,afterEvidence,repeatEvidence,day:'2026-10-13',stateValidation:{ok:true}};
}
