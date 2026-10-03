import { AppError } from '../../core/errors';
import { assertTextLimit } from './csvParser';
export type FilePicker={readText(kind:'csv'|'json',maxBytes:number):Promise<{name:string;text:string}|null>};
type Selection={name:string;uri:string;size?:number};
export function createFilePicker(choose:()=>Promise<Selection|null>,read:(uri:string,maxBytes:number)=>Promise<string>):FilePicker {
 return {async readText(_kind,maxBytes){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw new AppError('VALIDATION','Недопустимый лимит файла');
  const selection=await choose();if(!selection)return null;
  if(selection.size!==undefined&&selection.size>maxBytes)throw new AppError('VALIDATION','Файл превышает допустимый размер (10 МиБ)');
  let text:string;
  try{text=await read(selection.uri,maxBytes);}catch(error){throw new AppError('VALIDATION','Не удалось прочитать UTF-8 файл. Максимальный размер — 10 МиБ.',error);}
  assertTextLimit(text,maxBytes);return {name:selection.name,text};
 }};
}
export const filePicker:FilePicker={async readText(kind,maxBytes){
 const {getDocumentAsync}=await import('expo-document-picker');
 const {localFiles}=await import('../../../modules/german-offline');
 return createFilePicker(async()=>{const result=await getDocumentAsync({type:'*/*',copyToCacheDirectory:false,multiple:false});return result.canceled?null:result.assets[0];},(uri,limit)=>localFiles().readTextBounded(uri,limit)).readText(kind,maxBytes);
}};
