import { createFilePicker } from '../../src/features/transfer/filePicker';
test('cancel is null and reported oversize is rejected before reading',async()=>{
 const read=jest.fn(async()=> 'de,ru,pos');
 expect(await createFilePicker(async()=>null,read).readText('csv',10)).toBeNull();
 await expect(createFilePicker(async()=>({name:'large.csv',uri:'content://one',size:11}),read).readText('csv',10)).rejects.toMatchObject({code:'VALIDATION'});expect(read).not.toHaveBeenCalled();
});
test('unknown size still uses bounded native read and guards UTF8 bytes',async()=>{
 let limit=0;const picker=createFilePicker(async()=>({name:'words.csv',uri:'content://one'}),async(_uri,max)=>{limit=max;return 'ä';});
 expect(await picker.readText('csv',2)).toEqual({name:'words.csv',text:'ä'});expect(limit).toBe(2);
 await expect(picker.readText('csv',1)).rejects.toMatchObject({code:'VALIDATION'});
});
