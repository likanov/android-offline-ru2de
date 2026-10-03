import React from 'react';
import { render,screen,fireEvent,waitFor } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { CsvImportService } from '../../src/features/transfer/csvImportService';
import { TransferScreen } from '../../src/features/transfer/TransferScreen';
test('pick preview counts errors and confirm exact preview; cancel is quiet',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A');let canceled=true;
 const picker={saveText:async()=>false,readText:async()=>canceled?null:{name:'words.csv',text:'de,ru,pos\nweich,мягкий,adjective\nx,,adjective'}};
 render(<TransferScreen profileId={p.id} csv={new CsvImportService(h.db)} picker={picker}/>);
 fireEvent.press(screen.getByRole('button',{name:'Выбрать CSV'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Выбрать CSV'})).not.toBeDisabled());expect(screen.queryByRole('alert')).toBeNull();
 canceled=false;fireEvent.press(screen.getByRole('button',{name:'Выбрать CSV'}));await screen.findByText('Новые: 1 · Дубли: 0 · Ошибки: 1');expect(screen.getByText(/Строка 3:/)).toBeTruthy();
 fireEvent.press(screen.getByRole('button',{name:'Импортировать'}));await screen.findByText('Добавлено: 1 · Дубли: 0 · Ошибки: 1');expect(await h.words.list(p.id,{query:'weich'})).toHaveLength(1);
 }finally{h.close();}
});
