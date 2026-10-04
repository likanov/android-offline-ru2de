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


test('profile_create_rename_uses_stable_profile_form_ids_instead_of_text_only_labels',()=>{
 const path=resolve(root,'checks/profiles.profile-create-rename.yaml'),s=readFileSync(path,'utf8');
 assert.match(s,/"id"\s*:\s*"profile-new-name"/);
 assert.match(s,/"id"\s*:\s*"profile-create"/);
 assert.match(s,/"id"\s*:\s*"profile-rename-второй-ui"/);
 assert.match(s,/"id"\s*:\s*"profile-edit-name"/);
 assert.match(s,/"id"\s*:\s*"profile-save-name"/);
 assert.ok(!s.includes('"text": "Имя нового профиля"'),'new profile field is an accessibility label, not a stable visible text target');
 assert.ok(!s.includes('"tapOn": "Создать профиль"'));
 assert.ok(!s.includes('"tapOn": "Переименовать Второй UI"'));
 assert.ok(!s.includes('"tapOn": "Сохранить имя"'));
});


test('profile_create_rename_scrolls_to_new_profile_input_by_id_before_asserting',()=>{
 const path=resolve(root,'checks/profiles.profile-create-rename.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const firstAfterSelect=commands[1];
 assert.equal(firstAfterSelect.repeat?.while?.notVisible?.id,'profile-new-name');
 assert.equal(firstAfterSelect.repeat?.commands?.[0]?.swipe?.from?.id,'screen-scroll');
 assert.equal(firstAfterSelect.repeat?.commands?.[0]?.swipe?.direction,'UP');
});



test('profile_create_rename_scrolls_back_to_edit_form_after_rename_tap',()=>{
 const path=resolve(root,'checks/profiles.profile-create-rename.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const editSeek=commands.find((command)=>command.repeat?.while?.notVisible?.id==='profile-edit-name');
 assert.ok(editSeek,'profile edit field should be sought by stable id');
 assert.equal(editSeek.repeat?.commands?.[0]?.swipe?.from?.id,'screen-scroll');
 assert.equal(editSeek.repeat?.commands?.[0]?.swipe?.direction,'DOWN');
});

test('first_launch_clean_uses_stable_profile_and_dictionary_ids_instead_of_long_text_scrolls',()=>{
 const path=resolve(root,'checks/first-launch.clean-40-words.yaml'),s=readFileSync(path,'utf8');
 assert.match(s,/"id"\s*:\s*"profile-new-name"/);
 assert.match(s,/"id"\s*:\s*"profile-create"/);
 assert.match(s,/"id"\s*:\s*"dictionary-count"/);
 assert.ok(!s.includes('"text": "Имя нового профиля"'),'profile input is an accessibility label that may sit below the fold');
 assert.ok(!s.includes('"text": "Найдено: 40"'),'dictionary count has a stable testID near the top');
 assert.ok(!s.includes('"tapOn": "Создать профиль"'));
});
