import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GrammarTrainingScreen } from '../../src/features/grammar/GrammarTrainingScreen';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { getGrammarServices } from '../../src/app/AppServices';
import type { GrammarSelection, GrammarSubmission } from '../../src/features/grammar/grammarTypes';
import { createGrammarHarness } from '../harness';
import { deferred, germanVoices, resultAudioDevice } from '../helpers/resultAudioDevice';

const selection: GrammarSelection = { mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] };
const day = '2026-10-14';
const flush = async () => { await act(async () => {}); };
let oldAppState: typeof AppState.currentState;
beforeEach(() => { oldAppState = AppState.currentState; AppState.currentState = 'active'; });
afterEach(() => { AppState.currentState = oldAppState; jest.restoreAllMocks(); });
async function ledger(h: Awaited<ReturnType<typeof createGrammarHarness>>, profileId: string) {
  return {
    attempts: await h.db.all('SELECT * FROM grammar_attempts WHERE profileId=? ORDER BY rowid', [profileId]),
    progress: await h.db.all('SELECT * FROM grammar_progress WHERE profileId=? ORDER BY targetId', [profileId]),
    profile: await h.profile(profileId),
    session: await h.grammarSessions.resume(profileId),
  };
}
async function answerThroughUI(answer: GrammarSubmission) {
  if (answer.kind === 'choice') fireEvent.press(await screen.findByTestId(`grammar-option-${answer.optionId}`));
  else if (answer.kind === 'typed') {
    fireEvent.changeText(await screen.findByTestId('grammar-answer-input'), answer.text);
    fireEvent.press(screen.getByTestId('grammar-submit'));
  } else {
    for (const id of answer.optionIds) fireEvent.press(await screen.findByTestId(`grammar-multi-option-${id}`));
    fireEvent.press(screen.getByTestId('grammar-multi-submit'));
  }
  await screen.findByTestId('grammar-result');
}
const cases: { name: string; selection: GrammarSelection; answer: GrammarSubmission; right: boolean; spoken: string }[] = [
  { name: 'correct pronoun', selection, answer: { kind: 'choice', optionId: 'ich' }, right: true, spoken: 'Ich bin hier.' },
  { name: 'incorrect pronoun', selection, answer: { kind: 'choice', optionId: 'du' }, right: false, spoken: 'Ich bin hier.' },
  { name: 'correct sein', selection: {mode:'study',lesson:'sein',targetIds:['sein-cloze:ich']}, answer:{kind:'choice',optionId:'bin'}, right:true, spoken:'Ich bin groß.' },
  { name: 'incorrect sein', selection: {mode:'study',lesson:'sein',targetIds:['sein-cloze:ich']}, answer:{kind:'choice',optionId:'bist'}, right:false, spoken:'Ich bin groß.' },
  { name: 'Lektion 2 full sentence', selection:{mode:'study',lesson:'professions-sein',targetIds:['professions-sein:ich']}, answer:{kind:'choice',optionId:'bin'}, right:true, spoken:'Ich bin Lehrer.' },
  { name: 'Lektion 2 corrected question', selection:{mode:'study',lesson:'yesno-transform',targetIds:['yesno-transform:noun']}, answer:{kind:'typed',text:'Das Buch ist neu.'}, right:false, spoken:'Ist das Buch neu?' },
  { name: 'Lektion 3 article and noun', selection:{mode:'study',lesson:'noun-article',targetIds:['noun-article:buch']}, answer:{kind:'choice',optionId:'der'}, right:false, spoken:'das Buch' },
  { name: 'Lektion 3 plural', selection:{mode:'study',lesson:'noun-plural',targetIds:['noun-plural:buch']}, answer:{kind:'typed',text:'die Bücher'}, right:true, spoken:'die Bücher' },
  { name: 'Lektion 3 correct invariant pairs only', selection:{mode:'study',lesson:'plural-invariant'}, answer:{kind:'multi-choice',optionIds:['student']}, right:false, spoken:'der Lehrer. die Lehrer. der Computer. die Computer.' },
];
// Missing result integration or reading the submitted token must break these real saved-answer cases.
test.each(cases)('$name reads the saved German answer once and passive controls preserve the ledger', async row => {
  const h = await createGrammarHarness(); const p = await createProfile(h.db, 'Audio'); const device = resultAudioDevice();
  const props = { db:h.db, profileId:p.id, today:day, selection:row.selection, audio:device.audio, onReference:jest.fn(), onExplainError:jest.fn() };
  const view = render(<GrammarTrainingScreen {...props} />);
  try {
    await screen.findByTestId('grammar-prompt'); expect(device.spoken).toEqual([]);
    await answerThroughUI(row.answer);
    await waitFor(() => expect(device.spoken).toEqual([row.spoken]));
    expect((await h.grammarSessions.resume(p.id))!.result).toMatchObject({right:row.right, xpDelta:row.right?10:0});
    const saved = await ledger(h, p.id);
    view.rerender(<GrammarTrainingScreen {...props} />); await flush(); expect(device.spoken).toEqual([row.spoken]);
    fireEvent.press(screen.getByTestId('grammar-result-audio-repeat'));
    await waitFor(() => expect(device.spoken).toEqual([row.spoken, row.spoken]));
    const stops = device.stops(); fireEvent.press(screen.getByTestId('grammar-result-audio-stop')); await flush();
    expect(device.stops()).toEqual({speechStops:stops.speechStops+1,playerStops:stops.playerStops+1});
    expect(await ledger(h,p.id)).toEqual(saved); expect(screen.getByTestId('grammar-next')).toBeEnabled();
  } finally { view.unmount(); h.close(); }
});

test('a restored saved result auto-reads once and an unavailable voice retains its result and ledger', async () => {
  const h=await createGrammarHarness(); const p=await createProfile(h.db,'Restored');
  const s=(await h.grammarSessions.start(p.id,selection,day))!; const q=(await h.grammarSessions.next(p.id,s.id,day))!;
  await h.grammarAnswers.submit(p.id,s.id,q.attemptId,{kind:'choice',optionId:'ich'},day);
  const saved=await ledger(h,p.id); const device=resultAudioDevice(); device.lookups.push(Promise.resolve([]));
  const props={db:h.db,profileId:p.id,today:day,selection,audio:device.audio,onReference:jest.fn(),onExplainError:jest.fn()};
  const view=render(<GrammarTrainingScreen {...props}/>);
  try {
    expect(await screen.findByText('Офлайн-озвучка недоступна.')).toBeTruthy(); expect(screen.getByTestId('grammar-result')).toBeTruthy();
    expect(await ledger(h,p.id)).toEqual(saved); expect(screen.getByTestId('grammar-next')).toBeEnabled();
    fireEvent.press(screen.getByTestId('grammar-result-audio-repeat')); await waitFor(()=>expect(device.spoken).toEqual(['Ich bin hier.']));
    expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
    view.rerender(<GrammarTrainingScreen {...props}/>); await flush(); expect(device.spoken).toEqual(['Ich bin hier.']); expect(await ledger(h,p.id)).toEqual(saved);
  } finally {view.unmount();h.close();}
});

test('Continue stops pending speech and advances without waiting for synthesis', async()=>{
 const h=await createGrammarHarness();const p=await createProfile(h.db,'Pending');const device=resultAudioDevice();const pending=deferred<void>();device.completions.push(pending.promise);
 const view=render(<GrammarTrainingScreen db={h.db} profileId={p.id} today={day} selection={selection} audio={device.audio} onReference={jest.fn()} onExplainError={jest.fn()}/>);
 try {
  await answerThroughUI({kind:'choice',optionId:'ich'});await waitFor(()=>expect(device.spoken).toEqual(['Ich bin hier.']));
  const attempt=(await h.grammarSessions.resume(p.id))!.currentQuestion!.attemptId;const stops=device.stops();
  expect(screen.getByTestId('grammar-next')).toBeEnabled();fireEvent.press(screen.getByTestId('grammar-next'));
  await flush(); await waitFor(()=>expect(screen.queryByTestId('grammar-result')).toBeNull());
  expect((await h.grammarSessions.resume(p.id))!.currentQuestion!.attemptId).not.toBe(attempt);
  expect(device.stops().speechStops).toBeGreaterThan(stops.speechStops);expect(device.stops().playerStops).toBeGreaterThan(stops.playerStops);
  await act(async()=>pending.reject(new Error('Old synthesis failed')));expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
  expect((await h.db.all('SELECT * FROM grammar_attempts WHERE profileId=?',[p.id]))).toHaveLength(1);expect((await h.profile(p.id))!.xp).toBe(10);
 } finally {view.unmount();h.close();}
});

test('profile change stops the previous result and ignores its late voice lookup',async()=>{
 const h=await createGrammarHarness();const a=await createProfile(h.db,'A');const device=resultAudioDevice();const pending=deferred<typeof germanVoices>();device.lookups.push(pending.promise);
 const props={db:h.db,today:day,selection,audio:device.audio,onReference:jest.fn(),onExplainError:jest.fn()};const view=render(<GrammarTrainingScreen {...props} profileId={a.id}/>);
 try {
  await answerThroughUI({kind:'choice',optionId:'ich'});const saved=await ledger(h,a.id);const stops=device.stops();
  const b=await createProfile(h.db,'B');view.rerender(<GrammarTrainingScreen {...props} profileId={b.id}/>);await screen.findByTestId('grammar-option-ich');
  await act(async()=>pending.resolve(germanVoices));expect(device.spoken).toEqual([]);expect(device.stops().speechStops).toBeGreaterThan(stops.speechStops);
  expect(await ledger(h,a.id)).toEqual(saved);expect(screen.queryByTestId('grammar-result')).toBeNull();
  await answerThroughUI({kind:'choice',optionId:'ich'});await waitFor(()=>expect(device.spoken).toEqual(['Ich bin hier.']));
 } finally {view.unmount();h.close();}
});

test.each(['profile','hidden','cancelled','failed'] as const)('pending %s save cannot synthesize unsaved or obsolete feedback',async reason=>{
 const h=await createGrammarHarness();const a=await createProfile(h.db,'A');const device=resultAudioDevice();const services=getGrammarServices({db:h.db});
 const gate=deferred<void>(); const realSubmit=services.answers.submit.bind(services.answers);
 const submit=jest.spyOn(services.answers,'submit').mockImplementationOnce(async(...args)=>{await gate.promise;return realSubmit(...args);});
 const props={db:h.db,today:day,selection,audio:device.audio,onReference:jest.fn(),onExplainError:jest.fn()};const view=render(<GrammarTrainingScreen {...props} profileId={a.id}/>);
 try {
  fireEvent.press(await screen.findByTestId('grammar-option-ich'));await flush();expect(device.spoken).toEqual([]);
  if(reason==='profile') {const b=await createProfile(h.db,'B');view.rerender(<GrammarTrainingScreen {...props} profileId={b.id}/>);}
  if(reason==='hidden') view.rerender(<GrammarTrainingScreen {...props} profileId={a.id} visible={false}/>);
  if(reason==='cancelled') {const s=(await h.grammarSessions.resume(a.id))!;await services.sessions.cancelQuestion(a.id,s.id);}
  await act(async()=>{if(reason==='failed') gate.reject(new Error('Save failed'));else gate.resolve();});
  await flush();expect(device.spoken).toEqual([]);expect(screen.queryByTestId('grammar-result')).toBeNull();
  if(reason==='hidden') {
   expect((await h.grammarSessions.resume(a.id))!.result).toMatchObject({right:true});
   view.rerender(<GrammarTrainingScreen {...props} profileId={a.id}/>);await screen.findByTestId('grammar-result');await waitFor(()=>expect(device.spoken).toEqual(['Ich bin hier.']));
  } else if(reason==='cancelled') {
   await waitFor(()=>expect(screen.getByTestId('grammar-option-ich')).toBeEnabled());
   expect(await h.db.all('SELECT * FROM grammar_attempts WHERE profileId=?',[a.id])).toHaveLength(0);
  }
 } finally {view.unmount();submit.mockRestore();h.close();}
});

// Removing the post-stop epoch check would navigate or advance the previous profile.
test.each(['next', 'reference', 'explanation'] as const)('pending stop before %s is cancelled by a profile change', async action => {
  const h = await createGrammarHarness();
  const a = await createProfile(h.db, 'A');
  const device = resultAudioDevice();
  const onReference = jest.fn();
  const onExplainError = jest.fn();
  const props = { db: h.db, today: day, selection, audio: device.audio, onReference, onExplainError };
  const view = render(<GrammarTrainingScreen {...props} profileId={a.id} />);
  const gate = deferred<void>();
  try {
    await answerThroughUI({ kind: 'choice', optionId: 'du' });
    await waitFor(() => expect(device.spoken).toEqual(['Ich bin hier.']));
    const saved = await ledger(h, a.id);
    const realStop = device.audio.stop.bind(device.audio);
    jest.spyOn(device.audio, 'stop').mockImplementationOnce(async () => { await realStop(); await gate.promise; });
    fireEvent.press(screen.getByTestId(action === 'next' ? 'grammar-next' : action === 'reference' ? 'grammar-reference-open' : 'grammar-error-open'));
    await flush();
    expect(await ledger(h, a.id)).toEqual(saved);
    expect(onReference).not.toHaveBeenCalled();
    expect(onExplainError).not.toHaveBeenCalled();
    const b = await createProfile(h.db, 'B');
    view.rerender(<GrammarTrainingScreen {...props} profileId={b.id} />);
    await screen.findByTestId('grammar-option-ich');
    await act(async () => gate.resolve());
    expect(await ledger(h, a.id)).toEqual(saved);
    expect(onReference).not.toHaveBeenCalled();
    expect(onExplainError).not.toHaveBeenCalled();
    expect(screen.queryByTestId('grammar-result')).toBeNull();
    await answerThroughUI({ kind: 'choice', optionId: 'ich' });
    await waitFor(() => expect(device.spoken).toEqual(['Ich bin hier.', 'Ich bin hier.']));
  } finally { view.unmount(); h.close(); }
});

// A native stop rejection must not trap the learner on the result or alter the saved answer.
test('Continue advances after native stop failure', async () => {
  const h = await createGrammarHarness();
  const p = await createProfile(h.db, 'Stop failure');
  const device = resultAudioDevice();
  const view = render(<GrammarTrainingScreen db={h.db} profileId={p.id} today={day} selection={selection} audio={device.audio} onReference={jest.fn()} onExplainError={jest.fn()} />);
  try {
    await answerThroughUI({ kind: 'choice', optionId: 'ich' });
    await waitFor(() => expect(device.spoken).toEqual(['Ich bin hier.']));
    device.failStop();
    fireEvent.press(screen.getByTestId('grammar-next'));
    await screen.findByTestId('grammar-option-ich');
    expect(await h.db.all('SELECT * FROM grammar_attempts WHERE profileId=?', [p.id])).toHaveLength(1);
    expect((await h.profile(p.id))!.xp).toBe(10);
    expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
  } finally { view.unmount(); h.close(); }
});

// Transition callbacks must wait for actual device stop, including while synthesis is pending.
test.each(['reference', 'explanation'] as const)('%s waits for audio stop before opening help and preserves the saved answer', async help => {
  const h = await createGrammarHarness();
  const p = await createProfile(h.db, 'Help ordering');
  const device = resultAudioDevice();
  const pendingSpeech = deferred<void>(); device.completions.push(pendingSpeech.promise);
  const onReference = jest.fn(); const onExplainError = jest.fn();
  const view = render(<GrammarTrainingScreen db={h.db} profileId={p.id} today={day} selection={selection} audio={device.audio} onReference={onReference} onExplainError={onExplainError} />);
  try {
    await answerThroughUI({ kind: 'choice', optionId: 'du' });
    await waitFor(() => expect(device.spoken).toEqual(['Ich bin hier.']));
    const saved = await ledger(h, p.id);
    const gate = deferred<void>(); const realStop = device.audio.stop.bind(device.audio);
    jest.spyOn(device.audio, 'stop').mockImplementationOnce(async () => { await realStop(); await gate.promise; });
    fireEvent.press(screen.getByTestId(help === 'reference' ? 'grammar-reference-open' : 'grammar-error-open'));
    await flush();
    expect(onReference).not.toHaveBeenCalled(); expect(onExplainError).not.toHaveBeenCalled();
    expect(screen.getByTestId('grammar-next')).toBeDisabled();
    await act(async () => gate.resolve());
    if (help === 'reference') expect(onReference).toHaveBeenCalledTimes(1);
    else expect(onExplainError).toHaveBeenCalledWith(saved.session!.currentQuestion!.attemptId);
    expect(await ledger(h, p.id)).toEqual(saved);
    await act(async () => pendingSpeech.reject(new Error('Old speech failed')));
    expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
  } finally { view.unmount(); h.close(); }
});
