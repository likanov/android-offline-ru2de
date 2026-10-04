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



test('profile_create_rename_refocuses_inputs_after_erase_before_typing',()=>{
 const path=resolve(root,'checks/profiles.profile-create-rename.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 for (const [fieldId,text] of [['profile-new-name','Второй UI'],['profile-edit-name','Второй переименован']]) {
  const inputIndex=commands.findIndex((command)=>command.inputText===text);
  assert.notEqual(inputIndex,-1,`flow should type ${text}`);
  assert.deepEqual(commands[inputIndex-1]?.tapOn,{id:fieldId},`flow should refocus ${fieldId} after eraseText before typing ${text}`);
  assert.equal(commands[inputIndex-2]?.eraseText,100,`flow should erase ${fieldId} immediately before refocusing`);
 }
});


test('profile_create_rename_scrolls_back_to_edit_form_after_rename_tap',()=>{
 const path=resolve(root,'checks/profiles.profile-create-rename.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const editSeek=commands.find((command)=>command.repeat?.while?.notVisible?.id==='profile-edit-name');
 assert.ok(editSeek,'profile edit field should be sought by stable id');
 assert.equal(editSeek.repeat?.commands?.[0]?.swipe?.from?.id,'screen-scroll');
 assert.equal(editSeek.repeat?.commands?.[0]?.swipe?.direction,'DOWN');
});



test('dictionary_edit_returns_to_dictionary_before_looking_for_edit_action',()=>{
 const path=resolve(root,'checks/dictionary.noun-adjective-edit.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const savedIndex=commands.findIndex((command)=>command.assertVisible==='der Prüfschrank');
 assert.notEqual(savedIndex,-1,'flow should verify the saved noun card');
 const editTargetIndex=commands.findIndex((command,index)=>index>savedIndex&&command.runFlow?.env?.TARGET_TEXT==='Редактировать');
 assert.notEqual(editTargetIndex,-1,'flow should seek the edit action after saving the noun');
 const navIndex=commands.findIndex((command,index)=>index>savedIndex&&index<editTargetIndex&&command.tapOn?.id==='nav-dictionary');
 assert.notEqual(navIndex,-1,'saving returns to the home card, so the flow must reopen Dictionary before seeking Edit');
 const openSavedIndex=commands.findIndex((command,index)=>index>navIndex&&index<editTargetIndex&&command.tapOn==='der Prüfschrank — контрольный шкаф');
 assert.notEqual(openSavedIndex,-1,'the flow should open the saved noun card before seeking Edit');
});

test('dictionary_word_editor_saves_by_stable_button_id',()=>{
 const path=resolve(root,'checks/dictionary.noun-adjective-edit.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const saveTaps=commands.filter((command)=>command.tapOn?.id==='word-save');
 assert.ok(saveTaps.length>=3,'dictionary create/edit/adjective saves should tap the stable word-save id');
 assert.ok(!s.includes('"tapOn": "Сохранить слово"'),'text-only save taps are flaky on Android after long editor scrolling');
});

test('dictionary_reopens_saved_noun_by_search_instead_of_long_word_list_scroll',()=>{
 const path=resolve(root,'checks/dictionary.noun-adjective-edit.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const savedIndex=commands.findIndex((command)=>command.assertVisible==='der Prüfschrank');
 const editTargetIndex=commands.findIndex((command,index)=>index>savedIndex&&command.runFlow?.env?.TARGET_TEXT==='Редактировать');
 const navIndex=commands.findIndex((command,index)=>index>savedIndex&&index<editTargetIndex&&command.tapOn?.id==='nav-dictionary');
 assert.notEqual(navIndex,-1,'flow should reopen Dictionary after saving the noun');
 const searchTapIndex=commands.findIndex((command,index)=>index>navIndex&&index<editTargetIndex&&command.tapOn?.id==='dictionary-search');
 assert.notEqual(searchTapIndex,-1,'flow should focus the stable dictionary search before looking for the saved noun');
 const inputIndex=commands.findIndex((command,index)=>index>searchTapIndex&&index<editTargetIndex&&command.inputText==='Prüfschrank');
 assert.notEqual(inputIndex,-1,'flow should filter the dictionary to the saved noun instead of scrolling the full list');
 const openSavedIndex=commands.findIndex((command,index)=>index>inputIndex&&index<editTargetIndex&&command.tapOn==='der Prüfschrank — контрольный шкаф');
 assert.notEqual(openSavedIndex,-1,'flow should open the saved noun from filtered dictionary results before seeking Edit');
});

test('dictionary_search_nfc_nfd_duplicate_uses_same_translation_as_existing_word',()=>{
 const path=resolve(root,'checks/dictionary.search-nfc-nfd.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const nfdInputIndex=commands.findIndex((command)=>command.inputText==='Prüfschrank');
 assert.notEqual(nfdInputIndex,-1,'flow should type the NFD German spelling to exercise normalization');
 const translationIndex=commands.findIndex((command,index)=>index>nfdInputIndex&&command.inputText);
 assert.equal(commands[translationIndex]?.inputText,'проверенный шкаф','duplicate assertion must use the same translation as the existing word; a different translation is allowed by canonicalKey rules');
 const duplicateAssertIndex=commands.findIndex((command,index)=>index>translationIndex&&command.assertVisible==='Такое слово уже есть в словаре');
 assert.notEqual(duplicateAssertIndex,-1,'flow should assert the duplicate validation message after trying to save same de/ru in NFD form');
});

test('dictionary_search_nfc_nfd_stops_after_duplicate_validation_message',()=>{
 const path=resolve(root,'checks/dictionary.search-nfc-nfd.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const duplicateAssertIndex=commands.findIndex((command)=>command.assertVisible==='Такое слово уже есть в словаре');
 assert.notEqual(duplicateAssertIndex,-1,'flow should assert the duplicate validation message');
 const laterCommands=commands.slice(duplicateAssertIndex+1);
 assert.equal(laterCommands.length,0,'after the duplicate message is visible, the business rule is verified and the flow should not keep scrolling the editor');
 assert.ok(!s.includes('"text": "Отмена"'),'searching for the cancel button after duplicate validation is flaky because long scrolls can move away from the error message');
 assert.ok(!s.includes('"tapOn": "Отмена"'));
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
