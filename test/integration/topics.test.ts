import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { migrate } from '../../src/core/migrations';
import { openTestDb } from '../sqlite';
import { profilesSchema } from '../../src/core/migrations/001_profiles';
import { wordDetailsSchema } from '../../src/core/migrations/002_word_details';
import { learningSchema } from '../../src/core/migrations/003_learning';
import { starterWords } from '../../src/data/starterWords';
import { wordKey } from '../../src/features/dictionary/wordValidation';

test('membership_is_profile_owned_and_preserves_progress', async()=>{
 const h=await createWordHarness();try{

 const p1=await createProfile(h.db,'A'),p2=await createProfile(h.db,'B');
 const topics=h.topics;
 const t1=await topics.create(p1.id,'Мебель'),t2=await topics.create(p1.id,'Дом');
 const stool=(await h.words.list(p1.id,{query:'Stuhl'}))[0];
 await h.db.run('UPDATE word_progress SET streak=8 WHERE wordId=?',[stool.id]);
 const before=await h.wordState(p1.id,stool.id),revision=stool.revision;
 await topics.setWordTopics(p1.id,stool.id,[t1.id,t2.id,t1.id]);
 expect((await topics.wordTopics(p1.id,stool.id)).map((t)=>t.id).sort()).toEqual([t1.id,t2.id].sort());
 for(const topicId of [t1.id,t2.id]) expect((await h.words.list(p1.id,{topicId})).map(w=>w.id)).toEqual([stool.id]);
 expect(await h.wordState(p1.id,stool.id)).toEqual(before);expect((await h.words.get(p1.id,stool.id)).revision).toBe(revision);
 await expect(topics.setWordTopics(p2.id,stool.id,[t1.id])).rejects.toMatchObject({code:'WRONG_PROFILE'});
 await expect(topics.setWordTopics(p2.id,(await h.words.list(p2.id))[0].id,[t1.id])).rejects.toMatchObject({code:'WRONG_PROFILE'});
 await topics.rename(p1.id,t1.id,'Мебель дома');expect(await topics.wordTopics(p1.id,stool.id)).toEqual(expect.arrayContaining([expect.objectContaining({id:t1.id,name:'Мебель дома'})]));
 expect(await h.words.list(p2.id,{topicId:t1.id})).toEqual([]);
 await expect(h.db.run('INSERT INTO word_topics(profileId,wordId,topicId) VALUES (?,?,?)',[p2.id,(await h.words.list(p2.id))[0].id,t1.id])).rejects.toThrow(/FOREIGN KEY/);
 await expect(topics.create(p1.id,'  ')).rejects.toMatchObject({code:'VALIDATION'});
 await expect(topics.rename(p2.id,t1.id,'Чужая')).rejects.toMatchObject({code:'WRONG_PROFILE'});
 }finally{h.close();}
});

test('atomic_save_rolls_back_word_progress_and_membership_on_failure',async()=>{
 const h=await createWordHarness();try{
const topics=h.topics;
 const p=await createProfile(h.db,'A');const t=await topics.create(p.id,'Своя');const w=(await h.words.list(p.id))[0];await topics.setWordTopics(p.id,w.id,[t.id]);
 await h.db.run('UPDATE word_progress SET streak=9 WHERE wordId=?',[w.id]);const before=await h.wordState(p.id,w.id);
 const session=await h.sessions.start(p.id,{mode:'study',wordIds:[w.id]},'2026-10-03');await h.sessions.next(p.id,session.id,'2026-10-03');const sessionBefore=await h.sessions.resume(p.id);
 await h.db.exec("CREATE TRIGGER fail_membership BEFORE INSERT ON word_topics BEGIN SELECT RAISE(ABORT,'disk failure'); END;");
 await expect(h.words.saveWordWithTopics(p.id,{...w,de:'Kissen',ru:'подушка',pos:'noun',gender:'n'},[t.id],w.id)).rejects.toThrow('disk failure');
 expect(await h.words.get(p.id,w.id)).toMatchObject({de:w.de,revision:w.revision});expect(await h.wordState(p.id,w.id)).toEqual(before);expect((await topics.wordTopics(p.id,w.id)).map((x)=>x.id)).toEqual([t.id]);expect(await h.sessions.resume(p.id)).toEqual(sessionBefore);
 await expect(h.words.saveWordWithTopics(p.id,{de:'Kissen',ru:'подушка',pos:'noun',gender:'n'},[t.id])).rejects.toThrow('disk failure');expect(await h.words.list(p.id,{query:'Kissen'})).toEqual([]);
 }finally{h.close();}
});

test('starter_topics_migrate_existing_profiles_and_copy_independently',async()=>{
 const store=openTestDb();try{
 await store.db.exec(profilesSchema);await store.db.exec(wordDetailsSchema);await store.db.exec(learningSchema);await store.db.exec('PRAGMA user_version=3');
 await store.db.run("INSERT INTO profiles(id,name,xp,createdAt) VALUES ('old','A',0,'2026-10-03')");
 for(const w of starterWords){await store.db.run('INSERT INTO words(id,profileId,seedKey,seedDe,de,ru,pos,gender,canonicalKey) VALUES (?,?,?,?,?,?,?,?,?)',[w.seedKey,'old',w.seedKey,w.de,w.de,w.ru,w.pos,w.gender,wordKey(w)]);await store.db.run('INSERT INTO word_progress(profileId,wordId,streak) VALUES (?,?,8)',['old',w.seedKey]);}
 await migrate(store.db);expect(await store.db.first('PRAGMA user_version')).toEqual({user_version:7});
 await migrate(store.db);const p=await createProfile(store.db,'B');
 for(const id of ['old',p.id]){
 expect(await store.db.all('SELECT t.name,count(wt.wordId) n FROM topics t LEFT JOIN word_topics wt ON wt.profileId=t.profileId AND wt.topicId=t.id WHERE t.profileId=? GROUP BY t.id ORDER BY t.name',[id])).toEqual([
 {name:'Люди',n:4},{name:'Предметы и комната',n:14},{name:'Признаки',n:8},{name:'Транспорт',n:2},{name:'Учёба и печать',n:7},{name:'Цвета',n:8}]);
 }
 expect(await store.db.all("SELECT w.de FROM word_topics wt JOIN topics t ON t.id=wt.topicId AND t.profileId=wt.profileId JOIN words w ON w.id=wt.wordId AND w.profileId=wt.profileId WHERE t.profileId='old' AND t.name='Транспорт' ORDER BY w.de")).toEqual([{de:'Straße'},{de:'Zug'}]);
 expect(await store.db.first('SELECT count(*) n FROM word_progress WHERE profileId=? AND streak=8',['old'])).toEqual({n:40});
 expect(await store.db.first('SELECT count(*) n FROM topics a JOIN topics b ON a.id=b.id WHERE a.profileId=? AND b.profileId=?',['old',p.id])).toEqual({n:0});
 }finally{store.close();}
});

test('selected_topic_sessions_exclude_future_mastered_words_and_separate_review',async()=>{
 const h=await createWordHarness();try{
const topics=h.topics;const p=await createProfile(h.db,'A');const t=await topics.create(p.id,'Выбор');const [study,due,future]=await h.words.list(p.id);
 for(const w of [study,due,future]) await topics.setWordTopics(p.id,w.id,[t.id]);
 await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-03' WHERE wordId=?",[due.id]);await h.db.run("UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate='2026-10-08' WHERE wordId=?",[future.id]);
 const wordIds=(await h.words.list(p.id,{topicId:t.id})).map(w=>w.id);
 expect(await h.sessions.start(p.id,{mode:'study',wordIds},'2026-10-03')).toMatchObject({mode:'study',wordIds:[study.id]});expect(await h.sessions.start(p.id,{mode:'review',wordIds},'2026-10-03')).toMatchObject({mode:'review',wordIds:[due.id]});
 await topics.setWordTopics(p.id,study.id,[]);await topics.setWordTopics(p.id,due.id,[]);const onlyFuture=(await h.words.list(p.id,{topicId:t.id})).map(w=>w.id);const before=await h.sessions.resume(p.id);await expect(h.sessions.start(p.id,{mode:'study',wordIds:onlyFuture},'2026-10-03')).rejects.toMatchObject({code:'EMPTY_QUEUE'});expect(await h.sessions.resume(p.id)).toEqual(before);
 }finally{h.close();}
});
