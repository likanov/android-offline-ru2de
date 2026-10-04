import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {MATRIX} from '../../scripts/regression-report.mjs';
const root=resolve('e2e');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]);}
test('every_detailed_flow_exists_and_nested_flow_paths_resolve',()=>{
 for(const row of MATRIX)for(const check of row.checks){const path=resolve(root,check.flow);assert.ok(existsSync(path),check.id);assert.equal(readFileSync(path,'utf8').match(/^name: (.+)$/m)?.[1],check.id);}
 for(const path of files(root).filter(p=>p.endsWith('.yaml'))){const s=readFileSync(path,'utf8');if(!s.includes('---\n['))continue;const commands=JSON.parse(s.split('---\n')[1]);function visit(v){if(v&&typeof v==='object'){if(v.runFlow?.file)assert.ok(existsSync(resolve(dirname(path),v.runFlow.file)),`${path}: ${v.runFlow.file}`);for(const x of Object.values(v))visit(x);}}visit(commands);}
});
test('app_scroll_commands_target_the_scrollable_content_fragment',()=>{
 for(const path of files(root).filter(p=>p.endsWith('.yaml'))){const s=readFileSync(path,'utf8');if(!s.includes('---\n['))continue;const commands=JSON.parse(s.split('---\n')[1]);function visit(v){if(v&&typeof v==='object'){assert.ok(!v.scrollUntilVisible,`${path}: default center swipe lands on fixed navigation`);for(const x of Object.values(v))visit(x);}}visit(commands);}
});

test('documentsui_picker_helper_does_not_depend_on_app_scroll_id',()=>{
 const path=resolve(root,'helpers/picker.yaml'),s=readFileSync(path,'utf8');
 assert.ok(!s.includes('screen-scroll'),'DocumentsUI picker does not expose the app screen-scroll testID');
 assert.match(s,/com\.google\.android\.documentsui:id\/(option_menu_search|dir_list)/);
});

test('documentsui_picker_selects_file_result_not_search_box',()=>{
 const path=resolve(root,'helpers/picker.yaml'),s=readFileSync(path,'utf8');
 assert.match(s,/"id"\s*:\s*"android:id\/title"/);
 assert.ok(!s.includes('"tapOn": "${FILE}"'),'generic text tap can hit the search input instead of the file result');
});


test('export_state_scrolls_to_stable_backup_save_id_instead_of_text_only_button_label',()=>{
 const path=resolve(root,'helpers/export-state.yaml'),s=readFileSync(path,'utf8');
 assert.match(s, /"id"\s*:\s*"backup-save"/);
 assert.ok(!s.includes('"text": "Сохранить резервную копию"'), 'React Native Button exposes the title as accessibility text, not stable visible text');
 assert.ok(!s.includes('"tapOn": "Сохранить резервную копию"'));
});
