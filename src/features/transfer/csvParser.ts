import { AppError } from '../../core/errors';
import type { WordDraft } from '../learning/learningTypes';
import { validateWord } from '../dictionary/wordValidation';
export type CsvRecord = {line:number;values:Record<string,string>;fieldCount:number};
export type ParsedCsv = {headers:string[];rows:CsvRecord[]};
export type CsvRow = {line:number;draft:WordDraft;topicName:string|null};
export const CSV_MAX_BYTES=10*1024*1024;
export function assertTextLimit(text:string,maxBytes=CSV_MAX_BYTES):void {
 let bytes=0;
 for(const character of text){const code=character.codePointAt(0)!;bytes+=code<=0x7f?1:code<=0x7ff?2:code<=0xffff?3:4;if(bytes>maxBytes)throw new AppError('VALIDATION','Файл превышает допустимый размер (10 МиБ)');}
}
function invalid(message:string):never{throw new AppError('VALIDATION',message);}
export function parseCsv(input:string):ParsedCsv {
 assertTextLimit(input);
 const text=input.replace(/^\uFEFF/u,'');
 const records:{line:number;fields:string[]}[]=[];
 let line=1,start=1,fields:string[]=[],field='',quoted=false,closed=false,started=false;
 const finishField=()=>{fields.push(field);field='';closed=false;started=false;};
 const finishRecord=()=>{finishField();if(fields.length>1||fields.some(value=>value!==''))records.push({line:start,fields});fields=[];start=line;};
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(quoted){
   if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
   else{field+=char;if(char==='\n'||(char==='\r'&&text[i+1]!=='\n'))line++;}
   continue;
  }
  if(char===','){finishField();continue;}
  if(char==='\r'||char==='\n'){if(char==='\r'&&text[i+1]==='\n')i++;line++;finishRecord();continue;}
  if(closed)invalid(`Строка ${line}: символ после закрывающей кавычки`);
  if(char==='"'){if(started)invalid(`Строка ${line}: кавычка внутри поля`);quoted=true;started=true;continue;}
  field+=char;started=true;
 }
 if(quoted)invalid(`Строка ${start}: незакрытая кавычка`);
 if(field!==''||started||closed||fields.length)finishRecord();
 if(!records.length)invalid('CSV пуст: нужны заголовки de, ru, pos');
 const headers=records.shift()!.fields.map(header=>header.trim());
 const allowed=['de','ru','pos','gender','plural','exampleDe','exampleRu','note','icon','topic'];
 if(new Set(headers).size!==headers.length||headers.some(header=>!allowed.includes(header))||['de','ru','pos'].some(header=>!headers.includes(header)))invalid('Нужны уникальные заголовки de, ru, pos; неизвестные столбцы не поддерживаются');
 return {headers,rows:records.map(record=>({line:record.line,fieldCount:record.fields.length,values:Object.fromEntries(headers.map((header,i)=>[header,record.fields[i]??'']))}))};
}
export function csvRowToWord(record:CsvRecord):CsvRow {
 if(record.fieldCount!==Object.keys(record.values).length)invalid('Количество полей не совпадает с заголовком');
 const value=record.values;
 try{
 const draft=validateWord({de:value.de,ru:value.ru,pos:value.pos.trim() as WordDraft['pos'],gender:(value.gender?.trim()||null) as WordDraft['gender'],plural:value.plural,exampleDe:value.exampleDe,exampleRu:value.exampleRu,note:value.note,icon:value.icon||null});
 return {line:record.line,draft,topicName:value.topic?.normalize('NFC').trim()||null};
 }catch(error){throw new AppError('VALIDATION',error instanceof Error?error.message:String(error),error);}
}
