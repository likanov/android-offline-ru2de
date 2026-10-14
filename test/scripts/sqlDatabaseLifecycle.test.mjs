import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

test('an app remount can read persisted SQLite data after the old native wrapper is collected',async()=>{
 const root=mkdtempSync(tmpdir()+'/sql-lifecycle-'),sdk=root+'/native-sdk.mjs';
 // Match expo-sqlite 56.0.6's cached native binding and Android GC release hook.
 // Real SQLite verifies that owned connections still use the same persisted file.
 writeFileSync(sdk,`
 import {DatabaseSync} from 'node:sqlite';
 const connections=new Set();let cached;
 export const wrappers=[];
 export async function openDatabaseAsync(name,options){
  const binding=options?.useNewConnection?undefined:cached;
  const current=binding??{valid:true,db:new DatabaseSync(${JSON.stringify(root)}+'/'+name)};
  connections.add(current);if(!options?.useNewConnection)cached=current;
  const check=()=>{if(!current.valid)throw Error('NativeDatabase.prepareAsync: java.lang.NullPointerException');};
  wrappers.push({collect:()=>{current.valid=false;}});
  return {
   execAsync:async sql=>{check();current.db.exec(sql);},
   runAsync:async(sql,params=[])=>{check();const r=current.db.prepare(sql).run(...params);return {changes:Number(r.changes),lastInsertRowId:Number(r.lastInsertRowid)};},
   getAllAsync:async(sql,params=[])=>{check();return current.db.prepare(sql).all(...params).map(row=>({...row}));},
   getFirstAsync:async(sql,params=[])=>{check();const row=current.db.prepare(sql).get(...params);return row?{...row}:null;},
   withExclusiveTransactionAsync:async()=>{throw Error('not used by this lifecycle read/write probe');}
  };
 }
 export function closeConnections(){for(const c of connections)c.db.close();}
 `);
 const url=pathToFileURL(sdk).href;
 const hooks=registerHooks({resolve(specifier,context,next){return specifier==='expo-sqlite'?{url,shortCircuit:true}:next(specifier,context);}});
 let native;
 try{
  const {openAppDb}=await import('../../src/core/sql.ts');native=await import('expo-sqlite');
  let oldRoot=await openAppDb();
  await oldRoot.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY,name TEXT)');
  await oldRoot.run('INSERT INTO profiles VALUES (?,?)',['p','Fixture']);
  const activeRoot=await openAppDb();
  oldRoot=null;
  native.wrappers[0].collect();
  assert.deepEqual(await activeRoot.all('SELECT id,name FROM profiles'),[{id:'p',name:'Fixture'}]);
  await activeRoot.run('INSERT INTO profiles VALUES (?,?)',['p2','After remount']);
  assert.equal((await activeRoot.all('SELECT * FROM profiles')).length,2);
 }finally{native?.closeConnections();hooks.deregister();rmSync(root,{recursive:true,force:true});}
});
