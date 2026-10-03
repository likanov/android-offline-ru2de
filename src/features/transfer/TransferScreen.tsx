import React,{useEffect,useRef,useState} from 'react';
import {Text} from 'react-native';
import {Screen} from '../../ui/Screen';
import {Button} from '../../ui/Button';
import {CSV_MAX_BYTES} from './csvParser';
import {filePicker,type FilePicker} from './filePicker';
import {CsvImportService,type CsvPreview} from './csvImportService';
type Props={profileId:string;csv:CsvImportService;picker?:FilePicker};
export function TransferScreen(props:Props){return <ProfileTransferScreen key={props.profileId} {...props}/>;}
function ProfileTransferScreen({profileId,csv,picker=filePicker}:Props){
 const [preview,setPreview]=useState<CsvPreview|null>(null),[name,setName]=useState(''),[error,setError]=useState(''),[result,setResult]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0),lifetime=useRef({alive:true});
 useEffect(()=>{const state=lifetime.current;state.alive=true;return()=>{state.alive=false;};},[]);
 async function pick(){const token=++generation.current;setBusy(true);setPreview(null);setError('');setResult('');setName('');try{
  const file=await picker.readText('csv',CSV_MAX_BYTES);if(!file)return;
  const next=await csv.preview(profileId,file.text);if(lifetime.current.alive&&token===generation.current){setPreview(next);setName(file.name);}
 }catch(e){if(lifetime.current.alive&&token===generation.current)setError(e instanceof Error?e.message:String(e));}finally{if(lifetime.current.alive&&token===generation.current)setBusy(false);}}
 async function commit(){if(!preview)return;const exact=preview,token=generation.current;setBusy(true);setError('');try{const counts=await csv.commit(exact);if(lifetime.current.alive&&token===generation.current){setResult(`Добавлено: ${counts.added} · Дубли: ${counts.duplicates} · Ошибки: ${counts.invalid}`);setPreview(null);}}catch(e){if(lifetime.current.alive&&token===generation.current)setError(e instanceof Error?e.message:String(e));}finally{if(lifetime.current.alive&&token===generation.current)setBusy(false);}}
 return <Screen><Text>Импорт CSV</Text><Text>UTF-8, до 10 МиБ. Столбцы: de, ru, pos; для noun — gender (m/f/n). Дополнительно: plural, exampleDe, exampleRu, note, icon, topic.</Text><Button title="Выбрать CSV" disabled={busy} onPress={()=>void pick()}/>{name?<Text>{name}</Text>:null}{preview?<><Text>{`Новые: ${preview.valid.length} · Дубли: ${preview.duplicates.length} · Ошибки: ${preview.errors.length}`}</Text>{preview.errors.map(item=><Text key={item.line}>{`Строка ${item.line}: ${item.message}`}</Text>)}<Button title="Импортировать" disabled={busy||!preview.valid.length} onPress={()=>void commit()}/></>:null}{result?<Text>{result}</Text>:null}{error?<Text accessibilityRole="alert">{error}</Text>:null}</Screen>;
}
