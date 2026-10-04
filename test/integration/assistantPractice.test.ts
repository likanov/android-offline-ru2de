import { createAssistantHarness } from '../harness';
import { createProfile, setActiveProfile } from '../../src/features/profiles/profileRepository';
import { readErrorContext } from '../../src/features/assistant/practiceContext';
import type { GenerationRequest, LanguageRuntime } from '../../src/features/assistant/runtimeTypes';

const day = '2026-10-03';

let h: Awaited<ReturnType<typeof createAssistantHarness>>;

beforeEach(async () => {
    h = await createAssistantHarness();
});

afterEach(async () => {
    await h.assistant.cancelAndRelease().catch(() => {});
    h.close();
});

async function wrongAttempt(profileId: string, answer = 'falsch') {
    const word = (await h.words.list(profileId)).find(w => w.de === 'Stuhl')!;
    const session = await h.sessions.start(profileId, { mode: 'study', wordIds: [word.id] }, day);
    const question = (await h.sessions.next(profileId, session.id, day))!;
    const result = await h.answers.submit(profileId, session.id, question.attemptId, answer, day);
    return { word, session, question, result };
}

test('old_result_without_answer_is_readable', async () => {
    const profile = await createProfile(h.db, 'A');
    const { question, session } = await wrongAttempt(profile.id);
    const attempt = await h.db.first<{ result: string }>('SELECT result FROM attempts WHERE attemptId=?', [question.attemptId]);
    const legacy = JSON.stringify({ ...JSON.parse(attempt!.result), submittedAnswer: undefined });
    await h.db.run('UPDATE attempts SET result=? WHERE attemptId=?', [legacy, question.attemptId]);
    await h.db.run('UPDATE sessions SET result=? WHERE id=?', [legacy, session.id]);

    const context = await readErrorContext(h.db, profile.id, question.attemptId);

    expect(context.result).toMatchObject({ attemptId: question.attemptId, right: false, submittedAnswer: null });
    expect(context.question.expected).toEqual(question.expected);
    expect(context.word.id).toBe(question.wordId);
});

test('error_context_rejects_foreign_unanswered_correct_and_stale_attempts', async () => {
    const profile = await createProfile(h.db, 'A');
    const other = await createProfile(h.db, 'B');
    await setActiveProfile(h.db, profile.id);
    const { question } = await wrongAttempt(profile.id);

    await expect(readErrorContext(h.db, other.id, question.attemptId)).rejects.toMatchObject({ code: 'WRONG_PROFILE' });

    const active = await h.sessions.start(profile.id, { mode: 'study', wordIds: [question.wordId] }, day);
    const unanswered = (await h.sessions.next(profile.id, active.id, day))!;
    await expect(readErrorContext(h.db, profile.id, unanswered.attemptId)).rejects.toMatchObject({ code: 'STALE_QUESTION' });

    await h.sessions.cancelQuestion(profile.id, active.id);
    const correct = (await h.sessions.next(profile.id, active.id, day))!;
    await h.answers.submit(profile.id, active.id, correct.attemptId, correct.expected[0], day);
    await expect(readErrorContext(h.db, profile.id, correct.attemptId)).rejects.toMatchObject({ code: 'VALIDATION' });

    await h.words.update(profile.id, question.wordId, { ...(await h.words.get(profile.id, question.wordId)), ru: 'изменённый стул' });
    await expect(readErrorContext(h.db, profile.id, question.attemptId)).rejects.toMatchObject({ code: 'STALE_QUESTION' });
});

test('explanation_uses_saved_expected_and_never_regrades', async () => {
    const requests: GenerationRequest[] = [];
    const runtime: LanguageRuntime = {
        load: async () => {},
        generate: async (request, _signal, onText) => {
            requests.push(request);
            onText('Ответ верный');
            return 'Ответ верный';
        },
        cancel: async () => {},
        release: async () => {},
    };
    const assistantHarness = await createAssistantHarness(runtime);
    h.close();
    h = assistantHarness;
    const profile = await createProfile(h.db, 'A');
    const { question, result } = await wrongAttempt(profile.id, 'falsch');
    const before = await h.wordState(profile.id, question.wordId);

    const explanation = await h.assistant.generatePractice({ kind: 'error', profileId: profile.id, attemptId: question.attemptId }, new AbortController().signal, () => {});

    expect(explanation).toMatchObject({
        kind: 'error',
        profileId: profile.id,
        attemptId: question.attemptId,
        submittedAnswer: 'falsch',
        expected: question.expected,
        text: 'Ответ верный',
    });
    expect(result.right).toBe(false);
    expect(await h.wordState(profile.id, question.wordId)).toEqual(before);
    expect(requests[0].maxTokens).toBe(256);
    const userData = JSON.parse(requests[0].messages[1].content);
    expect(userData.result).toMatchObject({ submittedAnswer: 'falsch', expected: question.expected, right: false });
});

test('long_answer_is_bounded_in_model_context', async () => {
    const requests: GenerationRequest[] = [];
    const runtime: LanguageRuntime = {
        load: async () => {},
        generate: async (request) => {
            requests.push(request);
            return 'Короткое объяснение';
        },
        cancel: async () => {},
        release: async () => {},
    };
    const assistantHarness = await createAssistantHarness(runtime);
    h.close();
    h = assistantHarness;
    const profile = await createProfile(h.db, 'A');
    const longAnswer = `ä${'x'.repeat(600)}ß`;
    const { question } = await wrongAttempt(profile.id, longAnswer);

    const explanation = await h.assistant.generatePractice({ kind: 'error', profileId: profile.id, attemptId: question.attemptId }, new AbortController().signal, () => {});

    expect(explanation).toMatchObject({ submittedAnswer: longAnswer });
    const userData = JSON.parse(requests[0].messages[1].content);
    expect(userData.result.submittedAnswer).toBe(longAnswer.slice(0, 500));
    expect(userData.result.submittedAnswerTruncated).toBe(true);
});
