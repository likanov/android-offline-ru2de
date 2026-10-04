import { randomUUID } from 'expo-crypto';
import { subscribeProfileChanges, notifyProfileChanged } from '../../app/refreshBus';
import { AppError } from '../../core/errors';
import type { SqlStore, SqlExecutor } from '../../core/sql';
import type { WordRepository } from '../dictionary/wordRepository';
import { profileSelectionVersion } from '../profiles/profileRepository';
import type { ModelFiles } from './modelFiles';
import type { LanguageRuntime } from './runtimeTypes';
import type { HelperDraft, HelperRequest, WordRevision } from './assistantTypes';
import type { ErrorExplanation, PracticeRequest, PracticeResult } from './practiceTypes';
import { reference } from '../../data/reference';
import { buildContext } from './assistantContext';
import { buildMessages } from './assistantPrompts';
import { readErrorContext } from './practiceContext';
import { buildErrorPracticeMessages } from './practicePrompts';
export class AssistantService {
    private epoch = 0;
    private active?: AbortController;
    private activeDone?: Promise<void>;
    private draining: Promise<void> = Promise.resolve();
    private issued = new WeakMap<HelperDraft, {
        epoch: number;
        selection: number;
        metadata: string;
    }>();
    constructor(private db: SqlStore, private words: WordRepository, private files: Pick<ModelFiles, 'installedPath'>, private runtime: LanguageRuntime) { }
    private async owned(tx: SqlExecutor, profileId: string, dependencies: WordRevision[]): Promise<boolean> {
        for (const d of dependencies) {
            const row = await tx.first<{
                profileId: string;
                revision: number;
            }>('SELECT profileId,revision FROM words WHERE id=?', [d.wordId]);
            if (!row || row.profileId !== profileId || row.revision !== d.revision)
                return false;
        }
        return true;
    }
    private async activeProfile(tx: SqlExecutor, profileId: string): Promise<boolean> {
        return (await tx.first<{
            activeProfileId: string | null;
        }>('SELECT activeProfileId FROM app_settings WHERE id=1'))?.activeProfileId === profileId;
    }
    async generate(request: HelperRequest, signal: AbortSignal, onText: (text: string) => void): Promise<HelperDraft> {
        request = { ...request, selectedWordIds: Array.isArray(request.selectedWordIds) ? [...request.selectedWordIds] : request.selectedWordIds };
        if (signal.aborted)
            throw new AppError('CANCELLED', 'Запрос отменён');
        if (this.active)
            throw new AppError('BUSY', 'Помощник занят');
        const controller = new AbortController(), epoch = this.epoch, selection = profileSelectionVersion(this.db);
        this.active = controller;
        let finish!: () => void;
        this.activeDone = new Promise<void>(resolve => { finish = resolve; });
        const abort = () => controller.abort();
        signal.addEventListener('abort', abort);
        const stop = () => { void this.runtime.cancel().catch(() => { }); };
        controller.signal.addEventListener('abort', stop);
        const valid = () => !controller.signal.aborted && this.epoch === epoch && profileSelectionVersion(this.db) === selection;
        const check = () => {
            if (!valid())
                throw new AppError('CANCELLED', 'Запрос отменён');
        };
        let off: undefined | (() => void);
        try {
            await this.draining.catch(() => { });
            check();
            if (!await this.activeProfile(this.db, request.profileId))
                throw new AppError('WRONG_PROFILE', 'Выберите этот профиль');
            const context = buildContext(request, await this.words.list(request.profileId), request.mode === 'rule' && request.ruleTopic ? reference[request.ruleTopic] : null);
            check();
            off = subscribeProfileChanges(request.profileId, () => {
                void this.owned(this.db, request.profileId, context.dependencies).then(current => {
                    if (!current && this.active === controller)
                        controller.abort();
                }).catch(() => controller.abort());
            });
            const path = await this.files.installedPath();
            check();
            if (!path)
                throw new AppError('MODEL', 'Установите локальную модель для создания подсказок');
            // A fresh context for each request prevents previous dialog/KV data surviving
            // idle disposal or a profile change. The GGUF file is shared, never the dialog.
            await this.runtime.load(path);
            check();
            const requestId = randomUUID(), text = await this.runtime.generate({ requestId, messages: buildMessages(context), maxTokens: request.mode === 'text' ? 512 : 256 }, controller.signal, token => {
                if (valid())
                    onText(token);
            });
            check();
            if (!await this.owned(this.db, request.profileId, context.dependencies))
                throw new AppError('CANCELLED', 'Карточка изменилась');
            check();
            if (!text.trim())
                throw new AppError('MODEL', 'Модель вернула пустой результат');
            const draft: HelperDraft = { requestId, profileId: request.profileId, wordId: request.wordId, mode: request.mode, ruleTopic: request.mode === 'rule' ? request.ruleTopic : null, text, dependencies: context.dependencies, referenceTitle: context.reference?.title ?? null };
            this.issued.set(draft, { epoch, selection, metadata: JSON.stringify({ ...draft, text: undefined }) });
            return draft;
        }
        catch (error) {
            if (!valid())
                throw new AppError('CANCELLED', 'Запрос отменён', error);
            throw error;
        }
        finally {
            off?.();
            signal.removeEventListener('abort', abort);
            controller.signal.removeEventListener('abort', stop);
            if (this.active === controller) {
                this.active = undefined;
                this.activeDone = undefined;
            }
            finish();
        }
    }
    async generatePractice(request: PracticeRequest, signal: AbortSignal, onText: (text: string) => void): Promise<PracticeResult> {
        request = { ...request };
        if (request.kind !== 'error')
            throw new AppError('VALIDATION', 'Этот режим практики ещё не готов');
        if (signal.aborted)
            throw new AppError('CANCELLED', 'Запрос отменён');
        if (this.active)
            throw new AppError('BUSY', 'Помощник занят');
        const controller = new AbortController(), epoch = this.epoch, selection = profileSelectionVersion(this.db);
        this.active = controller;
        let finish!: () => void;
        this.activeDone = new Promise<void>(resolve => { finish = resolve; });
        const abort = () => controller.abort();
        signal.addEventListener('abort', abort);
        const stop = () => { void this.runtime.cancel().catch(() => { }); };
        controller.signal.addEventListener('abort', stop);
        const valid = () => !controller.signal.aborted && this.epoch === epoch && profileSelectionVersion(this.db) === selection;
        const check = () => {
            if (!valid())
                throw new AppError('CANCELLED', 'Запрос отменён');
        };
        let off: undefined | (() => void);
        try {
            await this.draining.catch(() => { });
            check();
            const context = await readErrorContext(this.db, request.profileId, request.attemptId);
            const dependencies: WordRevision[] = [{ wordId: context.word.id, revision: context.word.revision ?? 1 }];
            check();
            off = subscribeProfileChanges(request.profileId, () => {
                void this.owned(this.db, request.profileId, dependencies).then(current => {
                    if (!current && this.active === controller)
                        controller.abort();
                }).catch(() => controller.abort());
            });
            const path = await this.files.installedPath();
            check();
            if (!path)
                throw new AppError('MODEL', 'Установите локальную модель для создания подсказок');
            await this.runtime.load(path);
            check();
            const text = await this.runtime.generate({ requestId: randomUUID(), messages: buildErrorPracticeMessages(context), maxTokens: 256 }, controller.signal, token => {
                if (valid())
                    onText(token);
            });
            check();
            if (!await this.owned(this.db, request.profileId, dependencies))
                throw new AppError('CANCELLED', 'Карточка изменилась');
            check();
            if (!text.trim())
                throw new AppError('MODEL', 'Модель вернула пустой результат');
            const result: ErrorExplanation = { kind: 'error', profileId: request.profileId, attemptId: request.attemptId, submittedAnswer: context.result.submittedAnswer, expected: context.question.expected, text, referenceTitle: context.reference?.title ?? null };
            return result;
        }
        catch (error) {
            if (!valid())
                throw new AppError('CANCELLED', 'Запрос отменён', error);
            throw error;
        }
        finally {
            off?.();
            signal.removeEventListener('abort', abort);
            controller.signal.removeEventListener('abort', stop);
            if (this.active === controller) {
                this.active = undefined;
                this.activeDone = undefined;
            }
            finish();
        }
    }
    async save(draft: HelperDraft, editedText: string): Promise<void> {
        if (typeof editedText !== 'string' || !editedText.trim())
            throw new AppError('VALIDATION', 'Введите текст подсказки');
        const ticket = this.issued.get(draft);
        const fresh = () => ticket && ticket.epoch === this.epoch && ticket.selection === profileSelectionVersion(this.db) && ticket.metadata === JSON.stringify({ ...draft, text: undefined });
        await this.db.transaction(async (tx) => {
            if (!fresh() || !await this.activeProfile(tx, draft.profileId) || !draft.dependencies.some(d => d.wordId === draft.wordId) || !await this.owned(tx, draft.profileId, draft.dependencies))
                throw new AppError('STALE_QUESTION', 'Подсказка устарела. Создайте новую');
            const exists = await tx.first<{
                profileId: string;
            }>('SELECT profileId FROM aids WHERE id=?', [draft.requestId]);
            if (exists) {
                if (exists.profileId !== draft.profileId)
                    throw new AppError('WRONG_PROFILE', 'Другой профиль');
                return;
            }
            await tx.run('INSERT INTO aids(id,profileId,content) VALUES (?,?,?)', [draft.requestId, draft.profileId, JSON.stringify({ format: 'assistant-aid-v1', wordId: draft.wordId, mode: draft.mode, ruleTopic: draft.ruleTopic, text: editedText.trim(), referenceTitle: draft.referenceTitle })]);
            for (const d of draft.dependencies)
                await tx.run('INSERT INTO aid_words(aidId,profileId,wordId,revision) VALUES (?,?,?,?)', [draft.requestId, draft.profileId, d.wordId, d.revision]);
            if (!fresh())
                throw new AppError('STALE_QUESTION', 'Профиль изменился');
        });
        notifyProfileChanged(draft.profileId);
    }
    async cancelAndRelease(): Promise<void> {
        ++this.epoch;
        const activeDone = this.activeDone;
        this.active?.abort();
        const pending = this.draining.catch(() => { }).then(async () => {
            try {
                await this.runtime.cancel();
            }
            finally {
                try {
                    await this.runtime.release();
                }
                finally {
                    // Runtime release can invalidate initialization before its
                    // factory returns. Wait for generate's finally block too,
                    // so late native disposal and the active slot both finish.
                    await activeDone;
                }
            }
        });
        this.draining = pending;
        return pending;
    }
}
