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

test('grammar_matrix_requires_four_android_blocks_and_all_required_checks',()=>{
 const expected={
  'grammar-core':['grammar-core.pronouns-sein-choice','.typing-case-context','.reference-no-xp','.empty-dictionary-fallback','.keyboard-320dp'],
  'grammar-progress':['grammar-progress.twenty-ui-answers','.nineteen-error','.bonus-once-double-submit','.reviews-difficult','.combined-summary'],
  'grammar-persistence':['grammar-persistence.profile-isolation','.force-stop-reboot','.word-dependency-edit','.sqlite-five-six-upgrade'],
  'grammar-transfer-assistant':['grammar-transfer-assistant.v1-v2-roundtrip','.invalid-backup-atomicity','.no-model-rule','.real-model-cancel'],
 };
 for(const [block,suffixes] of Object.entries(expected)){
  const row=MATRIX.find(candidate=>candidate.id===block);assert.ok(row,`missing block ${block}`);
  for(const suffix of suffixes){const id=suffix.startsWith('.')?block+suffix:suffix;const check=row.checks.find(candidate=>candidate.id===id);assert.ok(check,`missing check ${id}`);assert.equal(check.status,'implemented-unverified',id);assert.ok(existsSync(resolve(root,check.flow)),id);}
  assert.ok(existsSync(resolve(root,row.flow)),block);
 }
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

test('documentsui_picker_confirms_selected_file_when_documentsui_requires_select',()=>{
 const path=resolve(root,'helpers/picker.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const fileTapIndex=commands.findIndex((command)=>command.tapOn?.id==='android:id/title'&&command.tapOn?.text==='${FILE}');
 assert.notEqual(fileTapIndex,-1,'picker should tap the file result by stable DocumentsUI title id');
 const selectTapIndex=commands.findIndex((command,index)=>index>fileTapIndex&&command.tapOn?.text==='Select');
 assert.notEqual(selectTapIndex,-1,'DocumentsUI grid mode may only select the file; helper must tap Select to return the URI to the app');
 assert.equal(commands[selectTapIndex].tapOn.optional,true,'Select is only present when DocumentsUI enters multi-select mode');
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




test('export_state_helper_ends_with_stable_terminal_command_after_success_assertion',()=>{
 const path=resolve(root,'helpers/export-state.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const savedIndex=commands.findLastIndex((command)=>command.assertVisible==='Резервная копия сохранена');
 assert.notEqual(savedIndex,-1,'export helper should assert that backup save completed');
 assert.deepEqual(commands[savedIndex+1],{takeScreenshot:'export-state-saved'},'Maestro has hung after export helper ended on a success assert; keep a stable terminal command after it');
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

test('upgrade_before_uses_text_save_button_supported_by_old_task5_apk',()=>{
 const s=readFileSync(resolve(root,'../e2e/upgrade-before.yaml'),'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const saveAssertIndex=commands.findIndex((command)=>JSON.stringify(command).includes('Сохранить слово'));
 assert.notEqual(saveAssertIndex,-1,'upgrade-before should wait for the old APK save button text');
 const saveTapIndex=commands.findIndex((command,index)=>index>saveAssertIndex&&command.tapOn==='Сохранить слово');
 assert.notEqual(saveTapIndex,-1,'upgrade-before should tap the old APK save button by text');
 assert.ok(!commands.some((command,index)=>index>saveAssertIndex&&command.tapOn?.id==='word-save'),'upgrade-before runs against the old APK and must not require the newer word-save testID');
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


test('dictionary_noun_adjective_edit_ends_with_stable_terminal_command_after_accented_assertion',()=>{
 const path=resolve(root,'checks/dictionary.noun-adjective-edit.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const finalHübschIndex=commands.findLastIndex((command)=>command.assertVisible==='hübsch');
 assert.notEqual(finalHübschIndex,-1,'flow should still verify the saved adjective with umlaut');
 assert.deepEqual(commands[finalHübschIndex+1],{takeScreenshot:'dictionary-noun-adjective-edit-final'},'Maestro has hung after ending on an accented assert; keep a stable terminal command after it');
});

test('dictionary_search_duplicate_uses_composed_umlaut_because_maestro_ime_cannot_type_nfd',()=>{
 const path=resolve(root,'checks/dictionary.search-nfc-nfd.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 assert.ok(!commands.some((command)=>command.inputText==='Prüfschrank'),'Maestro IME has failed on decomposed umlauts; NFD normalization is covered by repository and answer-normalization tests');
 const duplicateInputIndex=commands.findIndex((command,index)=>index>commands.findIndex((c)=>c.assertVisible==='Найдено: 1')&&command.inputText==='Prüfschrank');
 assert.notEqual(duplicateInputIndex,-1,'UI duplicate validation should use a composed umlaut that Android can type reliably');
 const translationIndex=commands.findIndex((command,index)=>index>duplicateInputIndex&&command.inputText);
 assert.equal(commands[translationIndex]?.inputText,'проверенный шкаф','duplicate assertion must use the same translation as the existing word; a different translation is allowed by canonicalKey rules');
 const duplicateAssertIndex=commands.findIndex((command,index)=>index>translationIndex&&command.assertVisible==='Такое слово уже есть в словаре');
 assert.notEqual(duplicateAssertIndex,-1,'flow should assert the duplicate validation message after trying to save the same de/ru pair');
});



test('dictionary_cosmetic_preserve_refocuses_note_after_erase_before_typing',()=>{
 const path=resolve(root,'checks/dictionary.cosmetic-preserve.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const inputIndex=commands.findIndex((command)=>command.inputText==='Сохранённая серия');
 assert.notEqual(inputIndex,-1,'flow should type the cosmetic note');
 assert.deepEqual(commands[inputIndex-1],{tapOn:{id:'word-note'}},'Maestro can drop IME focus after eraseText; refocus note input by stable id before typing');
 assert.equal(commands[inputIndex-2]?.eraseText,100,'note erase should happen immediately before refocus and input');
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


test('open_navigation_resets_more_tab_stack_before_opening_more_menu',()=>{
 const result=exerciseNavigationHelper('nav-transfer');
 assert.deepEqual(result.taps.slice(0,2),['nav-today','nav-more']);
});


test('dst_device_date_uses_single_argument_format_without_spaces',()=>{
 const runner=readFileSync(resolve(root,'../scripts/emulator-regression.mjs'),'utf8');
 assert.match(runner,/shell\('date','\+%Y-%m-%dT%H:%M%z'\)/,'adb shell date should receive one format argument; spaces are split by Android date');
 assert.ok(!runner.includes("shell('date','+%Y-%m-%d %H:%M %z')"),'DST evidence must not use a date format with spaces');
 assert.match(runner,/before\.includes\('02:30\+0200'\)/);
 assert.match(runner,/after\.includes\('02:30\+0100'\)/);
});

test('progress_calendar_streak_checks_top_metrics_before_scrolling_to_calendar',()=>{
 const path=resolve(root,'checks/progress.calendar-streak-skills.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const xpAssertIndex=commands.findIndex((command)=>command.assertVisible==='XP: 250');
 const streakAssertIndex=commands.findIndex((command)=>command.assertVisible==='Серия дней: 1');
 assert.notEqual(xpAssertIndex,-1,'progress flow should verify XP from the top of the screen');
 assert.notEqual(streakAssertIndex,-1,'progress flow should verify streak from the top of the screen');
 const firstSwipeIndex=commands.findIndex((command)=>JSON.stringify(command).includes('"swipe"'));
 assert.notEqual(firstSwipeIndex,-1,'progress flow should still scroll later for calendar checks');
 assert.ok(xpAssertIndex<firstSwipeIndex,'XP should be asserted before scrolling away from the top metrics');
 assert.ok(streakAssertIndex<firstSwipeIndex,'streak should be asserted before scrolling away from the top metrics');
});

test('progress_block_uses_fixture_profile_with_existing_mastery_state',()=>{
 for (const file of ['progress.calendar-streak-skills.yaml','progress.no-passive-xp.yaml']) {
  const path=resolve(root,'checks',file),s=readFileSync(path,'utf8');
  assert.match(s,/"PROFILE"\s*:\s*"Регрессия — изучено"/,`${file} should be runnable as an isolated progress block from the imported fixture`);
 }
 const verifier=readFileSync(resolve(root,'../scripts/regression-state.mjs'),'utf8');
 assert.match(verifier,/id==='progress\.calendar-streak-skills'\)\{const p=part\('Регрессия — изучено'\)/,'state verifier should validate the same mastered fixture profile as the UI flow');
});

test('progress_calendar_state_validation_matches_fixture_audio_unavailable_history',()=>{
 const verifier=readFileSync(resolve(root,'../scripts/regression-state.mjs'),'utf8');
 assert.match(verifier,/\['translation','writing','article'\]\.every\(skill=>p\?\.skillHistory\.some\(h=>h\.skill===skill\)\)/,'fixture records non-audio skill history; UI flow separately verifies the Listening category is rendered');
 assert.ok(!verifier.includes('FOUR_SKILLS'),'listening is rendered as a zero-count category when fixture audio is unavailable, not as recorded skill history');
 const flow=readFileSync(resolve(root,'checks/progress.calendar-streak-skills.yaml'),'utf8');
 assert.match(flow,/Аудирование:\.\*/,'UI flow should still verify the listening skill category is present');
});

test('emulator_regression_boots_headless_with_software_gpu_for_ci_stability',()=>{
 const runner=readFileSync(resolve(root,'../scripts/emulator-regression.mjs'),'utf8');
 assert.match(runner,/'-no-window'/,'AVD boot should not depend on a host display surface during regression');
 assert.match(runner,/'-gpu','swiftshader_indirect'/,'software GPU avoids display-surface context crashes in headless regression');
});

test('prepare_avd_honors_vocabulary_abi_override_for_installed_system_image',()=>{
 const script=readFileSync(resolve('scripts/prepare-avd.sh'),'utf8');
 assert.ok(script.includes('ABI="${VOCABULARY_ABI:-$HOST_ABI}"'),'prepare-avd should allow regression runs to choose the installed ARM system image on x64 hosts');
 assert.ok(script.includes('HOST_ABI=$(node -p'),'prepare-avd should still derive a host default when no override is provided');
 assert.ok(!script.includes('python3 - "$CONFIG" "$ABI"'),'prepare-avd should not depend on macOS python3/xcrun when spawned from x64 Node');
 const runner=readFileSync(resolve(root,'../scripts/emulator-regression.mjs'),'utf8');
 assert.ok(runner.includes("execute('/bin/sh',[join(appRoot,'scripts/prepare-avd.sh'),'--upgrade']"),'upgrade runner should invoke prepare-avd through /bin/sh to avoid direct-script xcrun failures under x64 Node on ARM macOS');
});


test('emulator_regression_records_maestro_result_before_optional_screenshot',()=>{
 const s=readFileSync(resolve('scripts/emulator-regression.mjs'),'utf8');
 const flowMatch=s.match(/function flow\(id,file,extra=\{\}\) \{([\s\S]*?)\n\}/);
 assert.ok(flowMatch,'flow function should be present');
 const body=flowMatch[1];
 const assignIndex=body.indexOf('Object.assign(row,{junit,status:outcome.status,reason:outcome.reason});');
 const screenshotIndex=body.indexOf('try{row.screenshot=screenshot(id);}');
 assert.notEqual(assignIndex,-1,'flow should store the Maestro outcome even when later artifact capture fails');
 assert.notEqual(screenshotIndex,-1,'flow should still try to capture a screenshot as optional evidence');
 assert.ok(assignIndex<screenshotIndex,'status/JUnit must be recorded before optional screenshot capture');
 assert.ok(body.includes('SCREENSHOT_UNAVAILABLE:'),'screenshot failures should be preserved as evidence warnings instead of erasing a passed scenario');
});


test('non_first_launch_block_setup_uses_clean_profile_and_model_picker_instead_of_full_first_launch_group',()=>{
 const s=readFileSync(resolve('scripts/emulator-regression.mjs'),'utf8');
 assert.match(s,/async function setupBlockPrerequisites\(\) \{/,'block runner should expose lightweight setup prerequisites');
 const setup=s.match(/async function setupBlockPrerequisites\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
 assert.ok(setup.includes("flow('first-launch.clean-40-words','checks/first-launch.clean-40-words.yaml'"),'non-first-launch block setup should create the Регрессия UI profile used by isolated flows');
 assert.ok(setup.includes("flow('first-launch.model-picker','checks/first-launch.model-picker.yaml'"),'non-first-launch block setup should still install/select the local model');
 assert.ok(!setup.includes('first-launch.all-screens'),'setup must not rerun the heavyweight first-launch all-screens check');
 const block=s.match(/async function runBlock\(block\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
 assert.ok(block.includes('await setupBlockPrerequisites();'),'non-first-launch blocks should use the lightweight setup');
 assert.ok(!block.includes("await group(MATRIX.find(candidate=>candidate.id==='first-launch'))"),'non-first-launch blocks must not rerun the whole first-launch group');
});

test('isolated_persistence_blocks_seed_mastered_learning_state_before_persistence_check',()=>{
 const s=readFileSync(resolve('scripts/emulator-regression.mjs'),'utf8');
 const seed=s.match(/async function seedPersistencePrerequisite\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
 assert.ok(seed.includes("flow('learning.twenty-ui-answers','checks/learning.twenty-ui-answers.yaml'"),'isolated persistence block setup should create the same mastered Регрессия — 20 UI state that the full regression has before persistence');
 const block=s.match(/async function runBlock\(block\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
 const seedIndex=block.indexOf('await seedPersistencePrerequisite();');
 const persistenceIndex=block.indexOf("flow('persistence-before','persistence-before.yaml')");
 assert.notEqual(seedIndex,-1,'persistence blocks should seed mastered learning state in isolated block mode');
 assert.notEqual(persistenceIndex,-1,'persistence blocks should still run persistence-before after prerequisites');
 assert.ok(seedIndex<persistenceIndex,'mastered learning prerequisite must run before persistence-before captures the baseline');
});

test('learning_twenty_ui_answers_reaches_twentieth_answer_before_expect_mastery_bonus',()=>{
 const s=readFileSync(resolve(root,'checks/learning.twenty-ui-answers.yaml'),'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const repeatBeforeBonus=commands.find((command,index)=>index<commands.findIndex((item)=>JSON.stringify(item).includes('Верно! \\\\+60 XP'))&&command.repeat?.commands?.some((nested)=>JSON.stringify(nested).includes('../helpers/answer-correct.yaml')));
 assert.equal(repeatBeforeBonus?.repeat?.times,19,'the flow should answer 19 times before the final answer that grants the +60 XP mastery result');
});


test('reminders_block_inactive_profile_uses_fixture_profile_for_isolated_runs',()=>{
 for (const file of ['helpers/inactive-reminder.yaml','checks/reminders.reminder-profile.yaml']) {
  const s=readFileSync(resolve(root,file),'utf8');
  assert.match(s,/Регрессия — 20 UI/,`${file} should select a profile present in the imported regression fixture`);
  assert.ok(!s.includes('Второй переименован'),`${file} must not depend on the profiles block creating a renamed profile`);
 }
});

test('assistant_profile_dependency_uses_fixture_profile_for_isolated_runs',()=>{
 const s=readFileSync(resolve(root,'checks/assistant.helper-profile-dependency.yaml'),'utf8');
 assert.match(s,/Регрессия — продолжение/,'assistant profile dependency flow should switch to a profile present in the imported regression fixture');
 assert.ok(!s.includes('Второй переименован'),'assistant block must not depend on the profiles block creating a renamed profile');
});



test('assistant_cancel_background_uses_slow_text_mode_before_expect_cancel_button',()=>{
 const s=readFileSync(resolve(root,'checks/assistant.helper-cancel-background.yaml'),'utf8');
 const textMode=s.indexOf('Короткий текст');
 const create=s.indexOf('Создать подсказку', textMode);
 const cancel=s.indexOf('Отменить', create);
 assert.ok(textMode>=0,'cancel/background flow should switch to a slower real generation mode');
 assert.ok(create>textMode,'flow should create the prompt after selecting text mode');
 assert.ok(cancel>create,'flow should look for cancel during that slower generation');
});

test('assistant_cancel_background_waits_for_transient_cancel_without_scrolling',()=>{
 const s=readFileSync(resolve(root,'checks/assistant.helper-cancel-background.yaml'),'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const createTapIndex=commands.findIndex((command)=>command.tapOn==='Создать подсказку');
 assert.notEqual(createTapIndex,-1,'flow should start assistant generation');
 const cancelIndex=commands.findIndex((command,index)=>index>createTapIndex&&JSON.stringify(command).includes('Отменить'));
 assert.notEqual(cancelIndex,-1,'flow should wait for the transient cancel action after generation starts');
 assert.deepEqual(commands[createTapIndex+1],{swipe:{from:{id:'screen-scroll'},direction:'UP',duration:300}},'cancel appears below the create button when the screen is already scrolled near the bottom; reveal it with one bounded swipe');
 assert.deepEqual(commands[cancelIndex],{extendedWaitUntil:{visible:'Отменить',timeout:15000}},'temporary cancel button must be awaited without the long ensure-visible helper, which can outlive the button');
 assert.deepEqual(commands[cancelIndex+1],{tapOn:'Отменить'},'flow should tap cancel immediately after it becomes visible');
});

test('transfer_csv_picker_escaping_matches_current_duplicate_rule',()=>{
 const s=readFileSync(resolve(root,'checks/transfer.csv-picker-escaping.yaml'),'utf8');
 assert.match(s,/Новые: 3 · Дубли: 0 · Ошибки: 1/,'duplicate count is for existing dictionary rows; repeated rows inside the selected CSV are imported as new rows');
 assert.match(s,/Добавлено: 3 · Дубли: 0 · Ошибки: 1/,'commit summary should match the preview count for the current CSV fixture');
 assert.ok(!s.includes('Новые: 2 · Дубли: 1 · Ошибки: 1'),'old expectation treated an intra-CSV repeated row as a dictionary duplicate');
});

test('transfer_csv_preview_cancel_uses_fixture_profile_for_isolated_runs',()=>{
 const s=readFileSync(resolve(root,'checks/transfer.csv-preview-cancel-profile.yaml'),'utf8');
 assert.match(s,/Регрессия — продолжение/,'transfer cancel flow should switch to a profile present in the imported regression fixture');
 assert.ok(!s.includes('Второй переименован'),'transfer block must not depend on the profiles block creating a renamed profile');
});






test('transfer_json_roundtrip_answers_restored_fixture_translation',()=>{
 const s=readFileSync(resolve(root,'checks/transfer.json-roundtrip.yaml'),'utf8');
 assert.match(s,/"WORD_DE": "Prüfstuhl"/,'roundtrip flow should answer the restored fixture word');
 assert.match(s,/"WORD_RU": "контрольный стул"/,'roundtrip flow should use the translation present in the restored backup fixture');
 assert.ok(!s.includes('"WORD_RU": "новый перевод"'),'roundtrip flow must not expect a stale edited translation that is absent from the restored backup');
});

test('transfer_json_roundtrip_does_not_expect_feedback_for_empty_restored_profile',()=>{
 const s=readFileSync(resolve(root,'checks/transfer.json-roundtrip.yaml'),'utf8');
 assert.ok(!s.includes('Регрессия — 20 UI восстановлено 2'),'roundtrip flow should not assert saved training feedback for a restored profile whose exported backup has no attempts or sessions');
 assert.ok(!s.includes('Верно! \\+60 XP'),'roundtrip flow should not require stale mastery-feedback text before performing the explicit post-restore answer');
});

test('picker_cancel_flows_return_to_app_before_asserting_transfer_ui',()=>{
 for (const file of ['checks/transfer.csv-preview-cancel-profile.yaml','checks/resilience.picker-double-answer.yaml']) {
  const s=readFileSync(resolve(root,file),'utf8');
  const commands=JSON.parse(s.split('---\n')[1]);
  const backIndex=commands.findIndex((command)=>Object.prototype.hasOwnProperty.call(command,'back'));
  assert.notEqual(backIndex,-1,`${file} should cancel the DocumentsUI picker`);
  assert.deepEqual(commands[backIndex+1],{launchApp:{stopApp:false}},`${file} must bring the app foreground after picker cancellation before looking for app ids`);
  assert.deepEqual(commands[backIndex+2],{runFlow:{file:'../helpers/open-navigation.yaml',env:{NAV_TARGET:'nav-transfer'}}},`${file} should reopen navigation after returning from DocumentsUI`);
  assert.deepEqual(commands[backIndex+3],{tapOn:{id:'nav-transfer'}},`${file} should return to the transfer screen before asserting transfer UI`);
 }
});

test('transfer_invalid_interrupted_returns_from_picker_without_stopping_app',()=>{
 const s=readFileSync(resolve(root,'checks/transfer.invalid-interrupted.yaml'),'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const backupTapIndexes=commands
  .map((command,index)=>command.tapOn==='Выбрать резервную копию' ? index : -1)
  .filter((index)=>index!==-1);
 assert.ok(backupTapIndexes.length>=2,'invalid interrupted flow should open the backup picker more than once');
 const interruptedPickerIndex=backupTapIndexes.at(-1);
 assert.deepEqual(commands[interruptedPickerIndex+1],{launchApp:{stopApp:false}},'interrupted import should return from DocumentsUI by foregrounding the app without stopping it');
 assert.deepEqual(commands[interruptedPickerIndex+2],{runFlow:{file:'../helpers/open-navigation.yaml',env:{NAV_TARGET:'nav-transfer'}}},'interrupted import should reopen navigation after returning from DocumentsUI');
 assert.deepEqual(commands[interruptedPickerIndex+3],{tapOn:{id:'nav-transfer'}},'interrupted import should return to transfer before asserting app UI');
});

test('device_log_capture_pulls_device_file_instead_of_streaming_large_logcat_stdout',()=>{
 const s=readFileSync(resolve('scripts/emulator-regression.mjs'),'utf8');
 assert.match(s,/maxBuffer=32\*1024\*1024/,'execute should keep a bounded default output buffer');
 assert.match(s,/shell','logcat','-d','-v','threadtime','-f',devicePath/,'logcat capture should write to a device file instead of overflowing spawnSync stdout');
 assert.match(s,/adb,\['-s',serial,'pull',devicePath,path\]/,'logcat capture should pull the device file as evidence');
 assert.match(s,/readFileSync\(path,'utf8'\)/,'local logcat evidence should still be scanned for crashes and ANRs');
 assert.doesNotMatch(s,/logcat','-d','-v','threadtime'\],\{allowFailure:true,maxBuffer:128\*1024\*1024\}/,'large logcat capture must not depend on spawnSync stdout buffering');
});

test('new_blocks_have_executable_unique_checks',()=>{
 const ids=new Set();
 for(const block of ['extended-vocabulary','grammar-lektion2']){
  const row=MATRIX.find(r=>r.id===block);assert.ok(row,block);
  assert.ok(row.checks.length>=5);
  for(const check of row.checks){assert.ok(!ids.has(check.id));ids.add(check.id);const commands=JSON.parse(readFileSync(resolve(root,check.flow),'utf8').split('---\n')[1]);assert.ok(commands.some(c=>c.tapOn||c.runFlow));assert.ok(commands.some(c=>c.assertVisible||c.runFlow));}
 }
});

test('nine_type_editor_saves_through_shared_card_return_helper',()=>{
 const steps=JSON.parse(readFileSync(resolve(root,'checks/extended-vocabulary.nine-type-editor.yaml'),'utf8').split('---\n')[1]);
 const saves=steps.filter(s=>s.runFlow?.file==='../helpers/save-word-return-dictionary.yaml');
 assert.equal(saves.length,9);
 assert.equal(new Set(saves.map(s=>s.runFlow.env.WORD_DE)).size,9);
 assert.equal(saves[0].runFlow.env.CARD_TEXT,'der R1noun');
 const commands=JSON.parse(readFileSync(resolve(root,'helpers/save-word-return-dictionary.yaml'),'utf8').split('---\n')[1]);
 const save=commands.findIndex(c=>c.tapOn?.id==='word-save');
 const card=commands.findIndex(c=>c.assertVisible==='${CARD_TEXT}');
 const back=commands.findIndex(c=>c.tapOn==='Назад в словарь');
 const dictionary=commands.findIndex(c=>c.assertVisible?.id==='dictionary-search');
 assert.ok(save>=0&&card>save&&back>card&&dictionary>back);
});
test('lektion2_sentence_keyboard_captures_have_unique_lesson_names',()=>{
 const commands=JSON.parse(readFileSync(resolve(root,'checks/grammar-lektion2.five-lessons.yaml'),'utf8').split('---\n')[1]);
 const names=commands.filter(c=>c.takeScreenshot).map(c=>c.takeScreenshot);
 assert.equal(names.length,3);assert.equal(new Set(names).size,3);
});

test('backup_preview_reveals_summary_and_restore_action_before_assert_or_tap',()=>{
 for(const file of ['grammar-import-fixture.yaml','checks/extended-vocabulary.backup3-roundtrip.yaml']){
  const raw=readFileSync(resolve(root,file),'utf8');
  const commands=JSON.parse(raw.split('---\n')[1]);
  const summaryIndex=commands.findIndex(c=>typeof c.assertVisible==='string'&&c.assertVisible.startsWith('Профилей:'));
  assert.ok(summaryIndex>=0,file);
  const summary=commands[summaryIndex].assertVisible;
  assert.ok(new RegExp(summary.replace('${PROFILE_COUNT}','10')).test('Профилей: 10 · Слов: 362 · Грамматических целей: 20'),file+': summary must match complete preview text');
  assert.ok(summary.endsWith('.*'),file+': summary must include the numeric preview suffix');
  const reveal=commands[summaryIndex-1]?.runFlow;
  assert.ok(reveal?.file.endsWith('/ensure-visible.yaml'),file+': reveal summary before assertion');
  assert.equal(reveal.env.TARGET_TEXT,summary);
  const restoreIndex=commands.findIndex(c=>c.tapOn==='Восстановить новые профили');
  assert.ok(restoreIndex>summaryIndex);
  assert.equal(commands[restoreIndex-1]?.runFlow?.env?.TARGET_TEXT,'Восстановить новые профили',file+': restore can still be below viewport after summary');
 }
 const raw=readFileSync(resolve(root,'grammar-import-fixture.yaml'),'utf8');
 assert.ok(raw.includes('PROFILE_COUNT: "10"'),'V3 import defaults to the exact generated fixture count; legacy runner supplies its own count');
 const commands=JSON.parse(raw.split('---\n')[1]);
 const summary=commands.find(c=>typeof c.assertVisible==='string'&&c.assertVisible.startsWith('Профилей:')).assertVisible;
 for(const count of [9,100])assert.equal(new RegExp(summary.replace('${PROFILE_COUNT}','10')).test('Профилей: '+count+' · Слов: 362'),false);
});

function exerciseNavigationHelper(target,{menu=false,keyboard=false}={}){
 const primary=['nav-today','nav-dictionary','nav-training'];
 const secondary=['nav-profiles','nav-progress','nav-reviews','nav-topics','nav-difficult','nav-reminders','nav-transfer','nav-model'];
 const state={menu,keyboard,menuScrolled:false,barPending:false,taps:[],swipes:0,selected:null};
 const id=selector=>selector.id==='${NAV_TARGET}'?target:selector.id;
 const visible=selector=>{const value=id(selector);if(['more-menu','menu-close','more-menu-scroll'].includes(value))return state.menu;if(primary.includes(value)||value==='nav-more')return !state.menu&&!state.keyboard&&!state.barPending;return state.menu&&secondary.includes(value)&&(secondary.indexOf(value)<3||state.menuScrolled);};
 const condition=when=>!when||(when.visible?visible(when.visible):!visible(when.notVisible));
 function run(commands){for(const c of commands){
  if(c.runFlow){assert.ok(c.runFlow.commands,'navigation helper must be self-contained');if(condition(c.runFlow.when))run(c.runFlow.commands);}
  else if(c.hideKeyboard){state.keyboard=false;state.barPending=true;}
  else if(c.extendedWaitUntil){assert.equal(c.extendedWaitUntil.visible.id,'nav-more');assert.ok(!state.menu&&!state.keyboard);state.barPending=false;}
  else if(c.tapOn){assert.ok(visible(c.tapOn),'cannot tap hidden '+id(c.tapOn));const value=id(c.tapOn);state.taps.push(value);if(value==='menu-close'){state.menu=false;state.barPending=true;}else if(value==='nav-more'){state.menu=true;state.menuScrolled=false;}else{state.selected=value;state.menu=false;}}
  else if(c.repeat){for(let i=0;i<c.repeat.times&&condition(c.repeat.while);i++)run(c.repeat.commands);}
  else if(c.swipe){assert.ok(state.menu&&c.swipe.from.id==='more-menu-scroll','only scroll the open overflow sheet');state.menuScrolled=true;state.swipes++;}
  else if(c.assertVisible)assert.ok(visible(c.assertVisible),'target remains hidden '+id(c.assertVisible));
  else assert.fail('unsupported navigation command '+JSON.stringify(c));
 }}
 run(JSON.parse(readFileSync(resolve(root,'helpers/open-navigation.yaml'),'utf8').split('---\n')[1]));
 assert.ok(visible({id:target}));run([{tapOn:{id:target}}]);assert.equal(state.selected,target);return state;
}
test('navigation_helper_reveals_primary_tabs_without_opening_overflow',()=>{
 for(const target of ['nav-today','nav-dictionary','nav-training'])for(const state of [{},{menu:true},{keyboard:true}]){
  const result=exerciseNavigationHelper(target,state);assert.ok(!result.taps.includes('nav-more'));assert.equal(result.swipes,0);if(state.menu)assert.equal(result.taps[0],'menu-close');
 }
});
test('navigation_helper_preserves_all_overflow_targets_from_menu_and_keyboard_states',()=>{
 for(const target of ['nav-profiles','nav-progress','nav-reviews','nav-topics','nav-difficult','nav-reminders','nav-transfer','nav-model'])for(const state of [{},{menu:true},{keyboard:true}]){
  const result=exerciseNavigationHelper(target,state);assert.ok(result.taps.includes('nav-more'));assert.equal(result.menu,false);
 }
});
test('csv_import_reveals_preview_action_and_distinct_completion_result',()=>{
 const commands=JSON.parse(readFileSync(resolve(root,'checks/extended-vocabulary.both-csv-duplicates-topics.yaml'),'utf8').split('---\n')[1]);
 const imports=commands.map((c,i)=>c.tapOn==='Импортировать'?i:-1).filter(i=>i>=0);assert.equal(imports.length,3);
 for(const i of imports){assert.equal(commands[i-1].runFlow?.env?.TARGET_TEXT,'Импортировать');const reveal=commands[i+1].runFlow;assert.ok(reveal?.env?.TARGET_TEXT.startsWith('Добавлено:'));assert.equal(commands[i+2].assertVisible,reveal.env.TARGET_TEXT);}
});

test('csv_preview_and_completion_require_production_fixture_counts',()=>{
 const contract=JSON.parse(readFileSync(resolve(root,'fixtures/extended-vocabulary-import-contract.json'),'utf8'));
 const commands=JSON.parse(readFileSync(resolve(root,'checks/extended-vocabulary.both-csv-duplicates-topics.yaml'),'utf8').split('---\n')[1]);
 const summaries=commands.filter(c=>typeof c.assertVisible==='string'&&/^(Новые|Добавлено):/.test(c.assertVisible)).map(c=>c.assertVisible);
 assert.deepEqual(summaries,contract.steps.flatMap(s=>[`Новые: ${s.added} · Дубли: ${s.duplicates} · Ошибки: 0`,`Добавлено: ${s.added} · Дубли: ${s.duplicates} · Ошибки: 0`]));
 assert.equal(new RegExp('^'+summaries[3]+'$').test('Добавлено: 1 · Дубли: 0 · Ошибки: 0'),false);
 assert.equal(new RegExp('^'+summaries[5]+'$').test('Добавлено: 1 · Дубли: 299 · Ошибки: 0'),false);
 assert.deepEqual(contract.steps.map(s=>[s.added,s.duplicates,s.invalid]),[[260,40,0],[21,0,0],[0,300,0]]);
});

test('editor_below_fold_reveals_search_down_content_first_and_keep_reverse_fallback',()=>{
 const parse=path=>JSON.parse(readFileSync(path,'utf8').split('---\n')[1]);
 const editorPath=resolve(root,'checks/extended-vocabulary.nine-type-editor.yaml');
 const savePath=resolve(root,'helpers/save-word-return-dictionary.yaml');
 const editor=parse(editorPath), save=parse(savePath);
 const calls=[...editor.filter(c=>c.runFlow?.env?.TARGET_TEXT).map(c=>[editorPath,c.runFlow]),...save.filter(c=>['Сохранить слово','Назад в словарь'].includes(c.runFlow?.env?.TARGET_TEXT)).map(c=>[savePath,c.runFlow])];
 assert.equal(calls.length,21); // Nine POS toggles/options, noun gender, save and return.
 function execute(commands,start,target){
  let position=start;const swipes=[];
  const visible=()=>position===target;
  for(const command of commands){
   if(command.repeat){
    assert.deepEqual(command.repeat.while,{notVisible:'${TARGET_TEXT}'});
    assert.ok(command.repeat.times>0&&command.repeat.times<=18);
    for(let i=0;i<command.repeat.times&&!visible();i++)for(const nested of command.repeat.commands){
     assert.equal(nested.swipe.from.id,'screen-scroll');
     const direction=nested.swipe.direction;assert.ok(['UP','DOWN'].includes(direction));
     swipes.push(direction);position=Math.max(0,Math.min(6,position+(direction==='UP'?1:-1)));
    }
   }else {assert.equal(command.assertVisible,'${TARGET_TEXT}');assert.ok(visible(),'target must be visible, including missing-target failure');}
  }
  return swipes;
 }
 for(const [path,call] of calls){
  const commands=parse(resolve(dirname(path),call.file));
  assert.deepEqual(execute(commands,0,3),['UP','UP','UP'],call.env.TARGET_TEXT+': avoid 18 topward swipes');
  assert.deepEqual(execute(commands,3,3),[],'already visible needs no swipe');
  assert.ok(execute(commands,4,1).includes('DOWN'),'reverse fallback finds a target above');
  assert.throws(()=>execute(commands,0,99),/target must be visible/,'missing controls must still fail');
 }
 assert.equal(save.find(c=>c.runFlow?.env?.TARGET_TEXT==='${CARD_TEXT}').runFlow.file,'ensure-visible.yaml','card title remains top-first');
});

test('dictionary_search_preserves_foreground_when_ime_has_already_closed',()=>{
 const commands=JSON.parse(readFileSync(resolve(root,'checks/extended-vocabulary.search-sie-numbers.yaml'),'utf8').split('---\n')[1]);
 const start=commands.findIndex(c=>c.tapOn?.id==='dictionary-search');
 assert.ok(start>=0);
 for(const imeAfterInput of [false,true]){
  let foreground=true,ime=false,query='';const verified=[];
  for(const command of commands.slice(start)){
   assert.ok(foreground,'search must remain in app even if the IME closed before dismissal');
   if(command.tapOn){assert.equal(command.tapOn.id,'dictionary-search');ime=true;}
   else if(command.eraseText)query='';
   else if(command.inputText){query+=command.inputText;ime=imeAfterInput;}
   else if(command.hideKeyboard){if(ime)ime=false;else foreground=false;}
   else if(command.back)foreground=false;
   else if(command.assertVisible){
    const expected=query==='Sie'?'.*Вы.*':query==='22'?'.*zweiundzwanzig.*':null;
    assert.equal(command.assertVisible,expected,'retain each query/result assertion');verified.push(query);
   }else assert.fail('unexpected search command '+JSON.stringify(command));
  }
  assert.ok(foreground);assert.deepEqual(verified,['Sie','22']);
 }
});

test('export_dialog_checks_entered_name_after_ime_commit_before_save',()=>{
 const commands=JSON.parse(readFileSync(resolve(root,'helpers/export-state.yaml'),'utf8').split('---\n')[1]);
 const input=commands.findIndex(c=>c.inputText==='${EXPORT_NAME}');
 const save=commands.findIndex(c=>c.tapOn==='SAVE');
 const typed='b0123456789abcdef0123456789abcdef.json';
 function submit(renderedName){let checked=false;
  for(const command of commands.slice(input+1,save+1)){
   if(command.hideKeyboard)checked=false; // IME commit may transform text.
   if(command.assertVisible?.id==='android:id/title'){
    const pattern=command.assertVisible.text.replace('${EXPORT_NAME}',typed);
    assert.ok(new RegExp(pattern).test(renderedName),'changed filename must fail before SAVE');checked=true;
   }
   if(command.tapOn==='SAVE')assert.ok(checked,'validate committed filename before SAVE');
  }
 }
 submit(typed);
 assert.throws(()=>submit('b0123456789abcdef 0123456789abcdef.json'),/changed filename/);
 assert.throws(()=>submit(typed+' (1)'),/changed filename/);
});

test('old_upgrade_training_entry_supports_direct_questions_and_catalog_home',()=>{
 const raw=JSON.parse(readFileSync(resolve(root,'upgrade-before.yaml'),'utf8').split('---\n')[1]);
 const commands=raw.flatMap(c=>c.runFlow?.when?.true?.includes("!== 'true'")?c.runFlow.commands:[c]);
 const entry=commands.findIndex(c=>c.tapOn==='Тренировка');
 const loop=commands.findIndex((c,i)=>i>entry&&c.repeat?.times===19);
 assert.ok(entry>=0&&loop>entry);
 for(const baseline of ['Task5-direct','schema5-direct','schema6-home']){
  let screen=baseline==='schema6-home'?'home':'question',starts=0,answers=0;
  function execute(rows){for(const c of rows){
   if(c.runFlow?.when){assert.equal(c.runFlow.when.visible,'Изучать слова');if(screen==='home')execute(c.runFlow.commands);}
   else if(c.tapOn==='Изучать слова'){assert.equal(screen,'home');screen='question';starts++;}
   else if(c.extendedWaitUntil){assert.deepEqual(c.extendedWaitUntil.visible,{id:'training-prompt-.*'});assert.equal(screen,'question','must reach a real question before answering');}
   else if(c.repeat){for(let i=0;i<c.repeat.times;i++)execute(c.repeat.commands);}
   else if(c.runFlow?.file==='helpers/old-answer.yaml'){assert.equal(screen,'question','old-answer requires question, not training home');answers++;}
   else if(c.runFlow?.file==='helpers/ensure-visible.yaml'){assert.equal(c.runFlow.env.TARGET_TEXT,'Продолжить');}
   else if(c.tapOn==='Продолжить')assert.equal(screen,'question');
   else assert.fail('unexpected training command '+JSON.stringify(c));
  }}
  execute(commands.slice(entry+1,loop+2)); // Original 19-loop and final twentieth answer.
  assert.equal(starts,baseline==='schema6-home'?1:0);assert.equal(answers,20);
 }
});

test('schema5_upgrade_search_stays_foreground_if_input_already_dismissed_ime',()=>{
 const commands=JSON.parse(readFileSync(resolve(root,'checks/grammar-persistence.sqlite-five-six-upgrade.yaml'),'utf8').split('---\n')[1]);
 const start=commands.findIndex(c=>c.inputText==='Upgradeprobe');assert.ok(start>=0);
 for(const imeAfterInput of [false,true]){
  let foreground=true,ime=imeAfterInput,verified=false;
  for(const c of commands.slice(start+1)){
   assert.ok(foreground,'search must not Back to launcher after IME already closed');
   if(c.hideKeyboard){if(ime)ime=false;else foreground=false;}
   else if(c.assertVisible){assert.equal(c.assertVisible,'.*Upgradeprobe.*');verified=true;}
   else assert.fail('unexpected post-input command '+JSON.stringify(c));
  }
  assert.ok(foreground);assert.ok(verified,'retain migrated custom-word assertion');
 }
});
