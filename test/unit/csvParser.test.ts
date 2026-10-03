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
 for(const text of ['de,ru,pos,gender\nStuhl,стул,noun,','de,ru,pos,gender\nklein,,adjective,','de,ru,pos,gender\nx,y,verb,','de,ru,pos\nx,y,adjective,extra']){
 expect(()=>csvRowToWord(parseCsv(text).rows[0])).toThrow(expect.objectContaining({code:'VALIDATION'}));
 }
});
test('empty data records keep their line errors; physical blank lines are ignored',()=>{
 const parsed=parseCsv('de,ru,pos,gender\n\n,,,\n');expect(parsed.rows).toHaveLength(1);expect(parsed.rows[0].line).toBe(3);expect(()=>csvRowToWord(parsed.rows[0])).toThrow(expect.objectContaining({code:'VALIDATION'}));
});
