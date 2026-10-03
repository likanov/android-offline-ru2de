import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { ReviewRepository } from '../../src/features/reviews/reviewRepository';
import { readState } from '../../src/features/learning/sessionRepository';
import { openTestDb } from '../sqlite';
import { migrate } from '../../src/core/migrations';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('review_success_error_and_future_difficult_word', async () => {
 const h=await createWordHarness();
 try {
 const p=await createProfile(h.db,'A'); const words=await h.words.list(p.id); const [successWord,errorWord,future,learning]=words;
 for(const w of [successWord,errorWord,future]) await h.db.run('UPDATE word_progress SET streak=20,learned=1,bonusAwarded=1,dueDate=? WHERE wordId=?',['2026-10-04',w.id]);
 await h.db.run("UPDATE word_progress SET difficult=1,totalErrors=3,recoveryErrors=3,dueDate='2026-10-07' WHERE wordId=?",[future.id]);
 await h.db.run('UPDATE word_progress SET difficult=1,totalErrors=3,recoveryErrors=3 WHERE wordId=?',[learning.id]);
 const reviews=new ReviewRepository(h.db);
 expect((await reviews.dueWords(p.id,'2026-10-03'))).toEqual([]);
 for(const [w,right] of [[successWord,true],[errorWord,false]] as const){
 const s=await h.sessions.start(p.id,{mode:'review',wordIds:[w.id]},'2026-10-04'); const q=(await h.sessions.next(p.id,s.id,'2026-10-04'))!;
 await expect(h.answers.submit(p.id,s.id,q.attemptId,q.expected[0],'2026-10-03')).rejects.toMatchObject({code:'STALE_QUESTION'});
 const result=await h.answers.submit(p.id,s.id,q.attemptId,right?q.expected[0]:'wrong','2026-10-04');
 expect(result).toMatchObject(right?{xpDelta:10,state:{mastered:true,streak:20,dueDay:'2026-10-07'}}:{xpDelta:0,state:{mastered:true,streak:20,reviewStage:0,dueDay:'2026-10-05'}});
 expect(await h.sessions.next(p.id,s.id,'2026-10-04')).toBeNull();
 expect(await h.answers.submit(p.id,s.id,q.attemptId,'wrong','2026-10-04')).toEqual(result);
 }
 expect(await reviews.dueWords(p.id,'2026-10-04')).toEqual([]);
 expect(await reviews.difficultWords(p.id,'2026-10-04')).toEqual(expect.arrayContaining([{word:expect.objectContaining({id:future.id}),eligible:false,dueDay:'2026-10-07'},{word:expect.objectContaining({id:learning.id}),eligible:true,dueDay:null}]));
 expect(await h.profile(p.id)).toMatchObject({xp:10});
 } finally {h.close();}
});

test('due_queue_orders_overdue_then_word_and_isolates_profile_without_catch_up_duplicates',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A'),other=await createProfile(h.db,'B');
 const sorted=[];for(const de of ['Aaa','Bbb','Ccc']) sorted.push(await h.words.create(p.id,{de,ru:de,pos:'adjective',gender:null}));
 for(const w of [sorted[0],sorted[1],sorted[2]]) await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-01' WHERE wordId=?",[w.id]);
 await h.db.run("UPDATE word_progress SET dueDate='2026-09-01' WHERE wordId=?",[sorted[2].id]);
 await h.db.run("UPDATE word_progress SET learned=1,difficult=1,dueDate='2026-09-01' WHERE profileId=?",[other.id]);
 const r=new ReviewRepository(h.db);expect((await r.dueWords(p.id,'2026-10-04')).map(w=>w.id)).toEqual([sorted[2].id,sorted[0].id,sorted[1].id]);
 expect(await r.difficultWords(p.id,'2026-10-04')).toEqual([]);
 const s=await h.sessions.start(p.id,{mode:'review',wordIds:[sorted[2].id]},'2026-10-04');const q=(await h.sessions.next(p.id,s.id,'2026-10-04'))!;
 expect(await h.answers.submit(p.id,s.id,q.attemptId,q.expected[0],'2026-10-04')).toMatchObject({state:{dueDay:'2026-10-07'}});
 expect(await h.sessions.next(p.id,s.id,'2026-10-04')).toBeNull();
 await expect(r.dueWords(p.id,'invalid')).rejects.toThrow();
 }finally{h.close();}
});

test('review_schedule_survives_database_reopen',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'reviews-'));const path=join(dir,'db');let store=openTestDb(path);
 try{await migrate(store.db);const p=await createProfile(store.db,'A');const w=(await store.db.first<{id:string}>('SELECT id FROM words WHERE profileId=?',[p.id]))!;
 await store.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-07' WHERE wordId=?",[w.id]);
 store.close();store=openTestDb(path);expect(await readState(store.db,p.id,w.id)).toMatchObject({mastered:true,streak:20,dueDay:'2026-10-07'});expect(await new ReviewRepository(store.db).dueWords(p.id,'2026-10-04')).toEqual([]);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});


test('difficult_queue_tracks_nonconsecutive_review_errors_and_three_correct_recovery',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A');const w=(await h.words.list(p.id))[0];
 await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-04' WHERE wordId=?",[w.id]);
 const episodes=[['2026-10-04',false],['2026-10-05',true],['2026-10-08',false],['2026-10-09',true],['2026-10-12',false],['2026-10-13',true],['2026-10-16',true],['2026-10-23',true]] as const;
 for(const [day,right] of episodes){
 const s=await h.sessions.start(p.id,{mode:'review',wordIds:[w.id]},day),q=(await h.sessions.next(p.id,s.id,day))!;
 const r=await h.answers.submit(p.id,s.id,q.attemptId,right?q.expected[0]:'wrong',day);
 expect(r.state).toMatchObject({mastered:true,streak:20});
 if(day==='2026-10-12') expect(await h.reviews.difficultWords(p.id,day)).toMatchObject([{eligible:false,dueDay:'2026-10-13'}]);
 if(day==='2026-10-16') expect(await h.reviews.difficultWords(p.id,day)).toMatchObject([{eligible:false,dueDay:'2026-10-23'}]);
 }
 expect(await h.reviews.difficultWords(p.id,'2026-10-23')).toEqual([]);
 expect(await h.wordState(p.id,w.id)).toMatchObject({difficult:false,totalErrors:3,recoveryErrors:0,dueDay:'2026-11-06'});
 }finally{h.close();}
});
