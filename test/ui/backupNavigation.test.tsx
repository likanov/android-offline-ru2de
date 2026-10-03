import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react-native';
import {createWordHarness} from '../harness';
import {createProfile} from '../../src/features/profiles/profileRepository';
import {AppServicesContext} from '../../src/app/AppServices';
import {ActiveProfileProvider} from '../../src/app/ActiveProfileProvider';
import {Navigation} from '../../src/app/navigation';
import {filePicker} from '../../src/features/transfer/filePicker';
test('fresh_install_restores_without_creating_a_seeded_profile_and_csv_requires_selection',async()=>{
 const source=await createWordHarness(),h=await createWordHarness();
 try{
  await createProfile(source.db,'Восстановленный');
  const text=JSON.stringify(await source.backup.exportAll());
  const read=jest.spyOn(filePicker,'readText').mockImplementation(async kind=>{if(kind!=='json')throw new Error('CSV cannot run without profile');return {name:'backup.json',text};});
  render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation/></ActiveProfileProvider></AppServicesContext.Provider>);
  await screen.findByText('Активный профиль: не выбран');
  const transfer=screen.getByRole('button',{name:/Перенос данных|Импорт CSV/});
  expect(transfer).not.toBeDisabled();fireEvent.press(transfer);
  expect(screen.getByRole('button',{name:'Выбрать CSV'})).toBeDisabled();
  fireEvent.press(screen.getByRole('button',{name:'Выбрать резервную копию'}));
  await screen.findByText(/Профилей: 1 · Слов:/);
  expect(await h.db.first('SELECT count(*) AS n FROM profiles')).toEqual({n:0});
  fireEvent.press(screen.getByRole('button',{name:'Восстановить новые профили'}));
  await screen.findByText('Восстановлено профилей: 1');
  expect(await h.db.first('SELECT count(*) AS n FROM profiles')).toEqual({n:1});
  expect(await h.db.first('SELECT activeProfileId FROM app_settings')).toEqual({activeProfileId:null});
  fireEvent.press(screen.getByRole('button',{name:'Профили'}));
  fireEvent.press(await screen.findByRole('button',{name:'Выбрать Восстановленный'}));
  await screen.findByText('Активный профиль: Восстановленный');
  fireEvent.press(screen.getByRole('button',{name:/Перенос данных|Импорт CSV/}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Выбрать CSV'})).not.toBeDisabled());
  read.mockRestore();
 }finally{jest.restoreAllMocks();source.close();h.close();}
});
