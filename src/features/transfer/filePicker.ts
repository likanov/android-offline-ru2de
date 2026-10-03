import { AppError } from '../../core/errors';
import { assertTextLimit } from './csvParser';
export type FilePicker = {
    readText(kind: 'csv' | 'json', maxBytes: number): Promise<{
        name: string;
        text: string;
    } | null>;
    saveText(name: string, text: string): Promise<boolean>;
};
type Selection = {
    name: string;
    uri: string;
    size?: number;
};
export function createFilePicker(choose: () => Promise<Selection | null>, read: (uri: string, maxBytes: number) => Promise<string>, save: (name: string, text: string) => Promise<boolean> = async () => { throw new Error('Saving unavailable'); }): FilePicker {
    return { async readText(_kind, maxBytes) {
            if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
                throw new AppError('VALIDATION', 'Недопустимый лимит файла');
            const limit = `${Math.ceil(maxBytes / (1024 * 1024))} МиБ`, selection = await choose();
            if (!selection)
                return null;
            if (selection.size !== undefined && selection.size > maxBytes)
                throw new AppError('VALIDATION', `Файл превышает допустимый размер (${limit})`);
            let text: string;
            try {
                text = await read(selection.uri, maxBytes);
                assertTextLimit(text, maxBytes);
            }
            catch (error) {
                throw new AppError('VALIDATION', `Не удалось прочитать UTF-8 файл. Максимальный размер — ${limit}.`, error);
            }
            return { name: selection.name, text };
        }, async saveText(name, text) { try {
            return await save(name, text);
        }
        catch (error) {
            throw new AppError('STORAGE', 'Не удалось сохранить файл. Проверьте свободное место и доступ к папке.', error);
        } } };
}
export const filePicker: FilePicker = { async readText(kind, maxBytes) {
        const { getDocumentAsync } = await import('expo-document-picker');
        const { localFiles } = await import('../../../modules/german-offline');
        return createFilePicker(async () => { const result = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: false, multiple: false }); return result.canceled ? null : result.assets[0]; }, (uri, limit) => localFiles().readTextBounded(uri, limit)).readText(kind, maxBytes);
    }, async saveText(name, text) { const { localFiles } = await import('../../../modules/german-offline'); return createFilePicker(async () => null, async () => '', (filename, content) => localFiles().saveText(filename, content)).saveText(name, text); } };
