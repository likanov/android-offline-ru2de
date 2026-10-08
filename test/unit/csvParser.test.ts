import { parseCsv, csvRowToWord } from '../../src/features/transfer/csvParser';

test('quoted_csv_unicode_and_line_numbers', () => {
 const parsed=parseCsv('\uFEFFde,ru,pos,gender,note\r\nStuhl,"стул, мягкий",noun,m,"строка 1\nстрока 2"\r\nklein,"маленький ""дом""",adjective,,');
 expect(parsed.rows[0].values.ru).toBe('стул, мягкий');
 expect(parsed.rows[0].values.note).toBe('строка 1\nстрока 2');
 expect(parsed.rows[1].line).toBe(4);
 expect(parsed.rows[1].values.ru).toBe('маленький "дом"');
 expect(csvRowToWord(parsed.rows[0]).draft.gender).toBe('m');
});
test.each(['de,ru,pos\nx,"broken,adjective','de,ru,pos\nx,bad"quote,adjective','de,ru,pos\nx,"value"tail,adjective','de,de,pos\nx,y,adjective','de,pos\nx,adjective'])('syntax and invalid headers abort the file: %s', text=>{
 expect(()=>parseCsv(text)).toThrow(expect.objectContaining({code:'VALIDATION'}));
});
test('invalid fields and uneven columns reject individual rows',()=>{
 for(const text of ['de,ru,pos,gender\nStuhl,стул,noun,','de,ru,pos,gender\nklein,,adjective,','de,ru,pos,gender\nx,y,interjection,','de,ru,pos\nx,y,adjective,extra']){
 expect(()=>csvRowToWord(parseCsv(text).rows[0])).toThrow(expect.objectContaining({code:'VALIDATION'}));
 }
});
test('empty data records keep their line errors; physical blank lines are ignored',()=>{
 const parsed=parseCsv('de,ru,pos,gender\n\n,,,\n');expect(parsed.rows).toHaveLength(1);expect(parsed.rows[0].line).toBe(3);expect(()=>csvRowToWord(parsed.rows[0])).toThrow(expect.objectContaining({code:'VALIDATION'}));
});
test('documented CSV accepts snake_case example headers and preserves examples',()=>{
 const parsed=parseCsv('de,ru,pos,gender,plural,example_de,example_ru,note,topic\nStuhl,стул,noun,m,die Stühle,Der Stuhl ist klein.,Стул маленький.,Синий стул,Комната\nklein,маленький,adjective,,,,,,Признаки');
 expect(parsed.rows.map(csvRowToWord)).toEqual([
  expect.objectContaining({line:2,topicName:'Комната',draft:expect.objectContaining({de:'Stuhl',ru:'стул',pos:'noun',gender:'m',exampleDe:'Der Stuhl ist klein.',exampleRu:'Стул маленький.'})}),
  expect.objectContaining({line:3,topicName:'Признаки',draft:expect.objectContaining({de:'klein',pos:'adjective',gender:null})}),
 ]);
});
test.each(['de,ru,gender\nKissen,подушка,n','de,ru,pos,gender\nKissen,подушка,,n'])('omitted or empty pos defaults to noun: %s',text=>{
 expect(csvRowToWord(parseCsv(text).rows[0]).draft).toMatchObject({pos:'noun',gender:'n'});
});
test('duplicate example aliases cannot overwrite each other',()=>{
 expect(()=>parseCsv('de,ru,example_de,exampleDe\nx,y,a,b')).toThrow(expect.objectContaining({code:'VALIDATION'}));
});
test('quoted-empty records remain rows at newline and EOF',()=>{
 const rows=parseCsv('de,ru,pos\n""\n"\n"\n""').rows;
 expect(rows.map(row=>({line:row.line,fieldCount:row.fieldCount,de:row.values.de}))).toEqual([
  {line:2,fieldCount:1,de:''},{line:3,fieldCount:1,de:'\n'},{line:5,fieldCount:1,de:''},
 ]);
 for(const row of rows)expect(()=>csvRowToWord(row)).toThrow(expect.objectContaining({code:'VALIDATION'}));
});
