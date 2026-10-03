import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAssistantHarness } from '../harness';
import { createProfile, setActiveProfile } from '../../src/features/profiles/profileRepository';
import { LlamaRuntime } from '../../src/features/assistant/llamaRuntime';
import type { HelperRequest } from '../../src/features/assistant/assistantTypes';
let h: Awaited<ReturnType<typeof createAssistantHarness>>;
beforeEach(async () => { h = await createAssistantHarness(); });
afterEach(async () => { await h.assistant.cancelAndRelease(); h.close(); });
async function fixture() { const p1 = await createProfile(h.db, 'P1'), p2 = await createProfile(h.db, 'P2'); await setActiveProfile(h.db, p1.id); const words = await h.words.list(p1.id); return { p1, p2, first: words[0], second: words[1] }; }
function request(profileId: string, wordId: string, selectedWordIds: string[] = [], mode: HelperRequest['mode'] = 'text'): HelperRequest { return { profileId, wordId, selectedWordIds, mode, ruleTopic: mode === 'rule' ? 'articles' : null }; }
test('secondary_word_edit_and_profile_switch_invalidate_draft', async () => {
    const { p1, first, second } = await fixture(), state = await h.wordState(p1.id, first.id), xp = (await h.profile(p1.id))!.xp;
    const draft = await h.assistant.generate(request(p1.id, first.id, [first.id, second.id]), new AbortController().signal, () => { });
    await h.words.update(p1.id, second.id, { ...second, ru: 'другой перевод' });
    await expect(h.assistant.save(draft, draft.text)).rejects.toMatchObject({ code: 'STALE_QUESTION' });
    expect(await h.aids.current(p1.id, first.id)).toEqual([]);
    expect(await h.wordState(p1.id, first.id)).toEqual(state);
    expect((await h.profile(p1.id))!.xp).toBe(xp);
});
test.each(['association', 'example', 'rule'] as const)('save_%s_is_explicit_idempotent_and_never_changes_learning', async (mode) => {
    const { p1, first } = await fixture(), before = await h.wordState(p1.id, first.id);
    const draft = await h.assistant.generate(request(p1.id, first.id, [], mode), new AbortController().signal, () => { });
    expect(await h.aids.current(p1.id, first.id)).toEqual([]);
    await expect(h.assistant.save(draft, '  ')).rejects.toMatchObject({ code: 'VALIDATION' });
    await h.assistant.save(draft, 'Отредактировано');
    await h.assistant.save(draft, 'Отредактировано');
    expect(await h.aids.current(p1.id, first.id)).toEqual([{ ...draft, text: 'Отредактировано' }]);
    expect(await h.wordState(p1.id, first.id)).toEqual(before);
    expect((await h.profile(p1.id))!.xp).toBe(0);
    await h.words.update(p1.id, first.id, { ...first, icon: 'chair', note: 'new note' });
    expect(await h.aids.current(p1.id, first.id)).toHaveLength(1);
});
test('current_excludes_saved_text_when_secondary_revision_changes', async () => {
    const { p1, first, second } = await fixture();
    const draft = await h.assistant.generate(request(p1.id, first.id, [second.id]), new AbortController().signal, () => { });
    await h.assistant.save(draft, draft.text);
    expect(await h.aids.current(p1.id, first.id)).toHaveLength(1);
    expect(await h.aids.current(p1.id, second.id)).toEqual([]);
    await h.words.update(p1.id, second.id, { ...second, gender: second.gender === 'n' ? 'm' : 'n' });
    expect(await h.aids.current(p1.id, first.id)).toEqual([]);
});
test('profile_switch_cancels_releases_then_reloads_without_late_text', async () => {
    await h.assistant.cancelAndRelease();
    h.close();
    const events: string[] = [];
    let finish!: (v: {
        text: string;
    }) => void;
    let emit!: (v: {
        token: string;
    }) => void;
    const runtime = new LlamaRuntime(async () => { events.push('load'); return { completion: async (_p, onToken) => { emit = onToken!; return new Promise(resolve => { finish = resolve; }); }, stopCompletion: async () => { events.push('cancel'); finish?.({ text: 'late P1' }); }, release: async () => { events.push('release'); } }; });
    h = await createAssistantHarness(runtime);
    const { p1, p2, first } = await fixture();
    const received: string[] = [];
    const pending = h.assistant.generate(request(p1.id, first.id), new AbortController().signal, text => received.push(text));
    const outcome = pending.then(d => d, e => e);
    for (let i = 0; i < 100 && !emit; i++)
        await new Promise(resolve => setTimeout(resolve, 1));
    expect(emit).toBeDefined();
    emit({ token: 'partial' });
    await h.assistant.cancelAndRelease();
    await setActiveProfile(h.db, p2.id);
    emit({ token: 'late' });
    expect(await outcome).toMatchObject({ code: 'CANCELLED' });
    expect(received).toEqual(['partial']);
    expect(events.indexOf('cancel')).toBeLessThan(events.indexOf('release'));
    expect(await h.db.all('SELECT * FROM aids')).toEqual([]);
    finish = undefined as any;
    const nextWord = (await h.words.list(p2.id))[0];
    const next = h.assistant.generate(request(p2.id, nextWord.id), new AbortController().signal, () => { });
    for (let i = 0; i < 100 && !finish; i++)
        await new Promise(resolve => setTimeout(resolve, 1));
    expect(events.filter(e => e === 'load')).toHaveLength(2);
    expect(finish).toBeDefined();
    finish({ text: 'P2 result' });
    expect(await next).toMatchObject({ profileId: p2.id, text: 'P2 result' });
});
test('draft_cannot_be_saved_after_switching_away_and_back_or_forging_dependencies', async () => {
    const { p1, p2, first } = await fixture();
    const draft = await h.assistant.generate(request(p1.id, first.id), new AbortController().signal, () => { });
    await expect(h.assistant.save({ ...draft, dependencies: [] }, 'forged')).rejects.toMatchObject({ code: 'STALE_QUESTION' });
    await setActiveProfile(h.db, p2.id);
    await setActiveProfile(h.db, p1.id);
    await expect(h.assistant.save(draft, draft.text)).rejects.toMatchObject({ code: 'STALE_QUESTION' });
});
test('assistant_aids_restore_with_new_profile_word_and_request_ids', async () => {
    const { p1, first, second } = await fixture();
    const draft = await h.assistant.generate(request(p1.id, first.id, [second.id]), new AbortController().signal, () => { });
    await h.assistant.save(draft, draft.text);
    const backup = await h.backup.exportAll(), restore = await h.backup.restore(h.backup.preview(JSON.stringify(backup)));
    const newP = restore.profileIds[0], newWord = (await h.words.list(newP)).find(w => w.de === first.de)!;
    const restored = await h.aids.current(newP, newWord.id);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ profileId: newP, wordId: newWord.id, text: draft.text });
    expect(restored[0].requestId).not.toBe(draft.requestId);
    expect(restored[0].dependencies.every(d => d.wordId !== first.id && d.wordId !== second.id)).toBe(true);
});
test('aborting_during_load_disposes_late_context_before_returning', async () => {
    await h.assistant.cancelAndRelease();
    h.close();
    let finish!: (c: any) => void;
    let released = false;
    let completions = 0;
    h = await createAssistantHarness(new LlamaRuntime(() => new Promise(resolve => { finish = resolve; })));
    const { p1, first } = await fixture(), abort = new AbortController();
    const pending = h.assistant.generate(request(p1.id, first.id), abort.signal, () => { });
    const outcome = pending.then(d => d, e => e);
    for (let i = 0; i < 100 && !finish; i++)
        await new Promise(resolve => setTimeout(resolve, 1));
    expect(finish).toBeDefined();
    abort.abort();
    finish({ completion: async () => { ++completions; return { text: 'late' }; }, stopCompletion: async () => { }, release: async () => { released = true; } });
    expect(await outcome).toMatchObject({ code: 'CANCELLED' });
    expect(released).toBe(true);
    expect(completions).toBe(0);
    expect(await h.db.all('SELECT * FROM aids')).toEqual([]);
});
test.each(['absent', 'corrupt', 'load refusal'] as const)('%s_model_failure_leaves_dictionary_training_and_progress_available', async (kind) => {
    await h.assistant.cancelAndRelease();
    h.close();
    h = await createAssistantHarness(new LlamaRuntime(async () => { throw new Error(kind === 'corrupt' ? 'Invalid GGUF metadata' : 'Not enough memory'); }), { installedPath: async () => kind === 'absent' ? null : '/models/local.gguf' });
    const { p1, first } = await fixture();
    await expect(h.assistant.generate(request(p1.id, first.id), new AbortController().signal, () => { })).rejects.toMatchObject({ code: 'MODEL' });
    expect(await h.words.get(p1.id, first.id)).toMatchObject({ de: first.de });
    const session = await h.sessions.start(p1.id, { mode: 'study', wordIds: [first.id] }, '2026-10-03');
    expect(await h.sessions.next(p1.id, session.id, '2026-10-03')).toMatchObject({ wordId: first.id });
    expect((await h.profile(p1.id))!.xp).toBe(0);
    expect(await h.aids.current(p1.id, first.id)).toEqual([]);
});
test('failed_dependency_insert_rolls_back_the_entire_aid', async () => {
    const { p1, first, second } = await fixture();
    const draft = await h.assistant.generate(request(p1.id, first.id, [second.id]), new AbortController().signal, () => { });
    await h.db.exec("CREATE TRIGGER fail_aid BEFORE INSERT ON aid_words BEGIN SELECT RAISE(ABORT,'disk full'); END;");
    await expect(h.assistant.save(draft, draft.text)).rejects.toThrow('disk full');
    expect(await h.db.all('SELECT * FROM aids')).toEqual([]);
    expect(await h.db.all('SELECT * FROM aid_words')).toEqual([]);
    await h.db.exec('DROP TRIGGER fail_aid');
    await h.assistant.save(draft, draft.text);
    expect(await h.aids.current(p1.id, first.id)).toHaveLength(1);
});
// An edited request object must not change the owner/mode of in-flight work.
test('generation_snapshots_request_before_loading', async () => {
    await h.assistant.cancelAndRelease();
    h.close();
    let finish!: (c: any) => void;
    h = await createAssistantHarness(new LlamaRuntime(() => new Promise(resolve => { finish = resolve; })));
    const { p1, p2, first } = await fixture(), req = request(p1.id, first.id);
    const pending = h.assistant.generate(req, new AbortController().signal, () => { });
    const outcome = pending.then(d => d, e => e);
    for (let i = 0; i < 100 && !finish; i++)
        await new Promise(resolve => setTimeout(resolve, 1));
    expect(finish).toBeDefined();
    req.profileId = p2.id;
    req.mode = 'rule';
    req.ruleTopic = 'gender';
    req.selectedWordIds.push('foreign');
    finish({ completion: async () => ({ text: 'Original context' }), stopCompletion: async () => { }, release: async () => { } });
    expect(await outcome).toMatchObject({ profileId: p1.id, wordId: first.id, mode: 'text', ruleTopic: null, text: 'Original context' });
});
test('cancel_failure_with_successful_release_does_not_poison_future_loads', async () => {
    await h.assistant.cancelAndRelease();
    h.close();
    let firstCancel = true;
    h = await createAssistantHarness(new LlamaRuntime(async () => ({ completion: async () => ({ text: 'fresh result' }), stopCompletion: async () => { if (firstCancel) {
            firstCancel = false;
            throw new Error('native cancel error');
        } }, release: async () => { } })));
    const { p1, first } = await fixture();
    const req = request(p1.id, first.id);
    await h.assistant.generate(req, new AbortController().signal, () => { });
    await expect(h.assistant.cancelAndRelease()).rejects.toThrow('native cancel error');
    expect(await h.assistant.generate(req, new AbortController().signal, () => { })).toMatchObject({ profileId: p1.id, text: 'fresh result' });
});
test('saved_aids_survive_database_close_and_reopen_without_model', async () => {
    await h.assistant.cancelAndRelease();
    h.close();
    const directory = mkdtempSync(join(tmpdir(), 'assistant-persistence-')), path = join(directory, 'app.db');
    try {
        h = await createAssistantHarness(undefined, undefined, path);
        const p = await createProfile(h.db, 'Persisted'), word = (await h.words.list(p.id))[0];
        const draft = await h.assistant.generate(request(p.id, word.id), new AbortController().signal, () => { });
        await h.assistant.save(draft, 'Сохранено на диске');
        await h.assistant.cancelAndRelease();
        h.close();
        h = await createAssistantHarness(undefined, { installedPath: async () => null }, path);
        expect(await h.aids.current(p.id, word.id)).toEqual([{ ...draft, text: 'Сохранено на диске' }]);
        expect(await h.words.get(p.id, word.id)).toMatchObject({ de: word.de });
        const s = await h.sessions.start(p.id, { mode: 'study', wordIds: [word.id] }, '2026-10-03');
        expect(await h.sessions.next(p.id, s.id, '2026-10-03')).not.toBeNull();
    }
    finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

// Cleanup must settle the old helper operation, not just invalidate its load epoch.
test('switch_during_pending_load_waits_for_disposal_then_immediately_generates_for_next_profile', async () => {
    await h.assistant.cancelAndRelease();
    h.close();
    let finishLoad!: (context: import('../../src/features/assistant/llamaRuntime').RuntimeContext) => void;
    let finishRelease!: () => void;
    let announceRelease!: () => void;
    const releaseStarted = new Promise<void>(resolve => { announceRelease = resolve; });
    let loads = 0;
    const events: string[] = [];
    h = await createAssistantHarness(new LlamaRuntime(async () => {
        ++loads;
        events.push(`load ${loads}`);
        if (loads === 1) return new Promise(resolve => { finishLoad = resolve; });
        return { completion: async () => ({ text: 'P2 fresh result' }), stopCompletion: async () => {}, release: async () => {} };
    }));
    const { p1, p2, first } = await fixture();
    const nextWord = (await h.words.list(p2.id))[0];
    const tokens: string[] = [];
    const firstOutcome = h.assistant.generate(request(p1.id, first.id), new AbortController().signal, text => tokens.push(text)).then(draft => draft, error => error);
    for (let i = 0; i < 100 && !finishLoad; ++i) await new Promise(resolve => setTimeout(resolve, 1));
    expect(finishLoad).toBeDefined();
    let cleanupResolved = false;
    const switchOutcome = (async () => {
        await h.assistant.cancelAndRelease();
        cleanupResolved = true;
        events.push('cleanup settled');
        await setActiveProfile(h.db, p2.id);
        return h.assistant.generate(request(p2.id, nextWord.id), new AbortController().signal, text => tokens.push(text));
    })().then(draft => draft, error => error);
    for (let i = 0; i < 20; ++i) await Promise.resolve();
    const cleanupDuringLoad = cleanupResolved;
    finishLoad({ completion: async () => ({ text: 'P1 late result' }), stopCompletion: async () => {}, release: async () => {
        events.push('P1 release started');
        announceRelease();
        await new Promise<void>(resolve => { finishRelease = resolve; });
        events.push('P1 release finished');
    } });
    await releaseStarted;
    for (let i = 0; i < 20; ++i) await Promise.resolve();
    const cleanupDuringRelease = cleanupResolved;
    finishRelease();
    const cancelled = await firstOutcome, second = await switchOutcome;
    expect({ cleanupDuringLoad, cleanupDuringRelease, firstCode: cancelled.code, secondCode: second.code ?? null, secondText: second.text ?? null }).toEqual({
        cleanupDuringLoad: false, cleanupDuringRelease: false, firstCode: 'CANCELLED', secondCode: null, secondText: 'P2 fresh result',
    });
    expect(second.profileId).toBe(p2.id);
    expect(events.indexOf('P1 release finished')).toBeLessThan(events.indexOf('cleanup settled'));
    expect(events.indexOf('cleanup settled')).toBeLessThan(events.indexOf('load 2'));
    expect(tokens).toEqual([]);
    expect(await h.db.all('SELECT * FROM aids')).toEqual([]);
});
