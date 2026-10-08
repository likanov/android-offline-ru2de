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
 const path=resolve(root,'helpers/open-navigation.yaml'),s=readFileSync(path,'utf8');
 const commands=JSON.parse(s.split('---\n')[1]);
 const openMoreFlow=commands.find(command=>command.runFlow?.when?.notVisible?.id==='more-menu' && command.runFlow?.commands?.some(step=>step.tapOn?.id==='nav-more'));
 assert.ok(openMoreFlow,'helper should open the More menu when it is not visible');
 const taps=openMoreFlow.runFlow.commands.filter(step=>step.tapOn?.id).map(step=>step.tapOn.id);
 assert.deepEqual(taps.slice(-2),['nav-today','nav-more'],'when currently inside a More sub-screen, tapping selected nav-more is a no-op; reset to Today before reopening More');
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
