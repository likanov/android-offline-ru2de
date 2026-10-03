"""Development-only generator. Model and Python environment must stay outside Git."""
import argparse, hashlib, json, re, wave
from pathlib import Path
from importlib.metadata import version
from piper import PiperVoice

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = (root/'src/data/starterWords.ts').read_text()
nouns = re.findall(r'\["([^"\n]+)", "[^"\n]+", "([mfn])"\]', source.split('const adjectives:')[0])
adjectives = re.findall(r'\["([^"\n]+)", "[^"\n]+"\]', source.split('const adjectives:')[1].split('// Plurals')[0])
texts = [dict(m='der',f='die',n='das')[gender]+' '+text for text,gender in nouns]+adjectives
assert len(texts)==40
voice = PiperVoice.load(str(args.model))
assets = root/'assets/audio'
assets.mkdir(parents=True,exist_ok=True)
manifest = {'generator':{'package':'piper-tts','version':version('piper-tts')},'voice':{'id':'de_DE-thorsten-medium','modelSha256':sha(args.model),'configSha256':sha(Path(str(args.model)+'.json')),'modelCard':'https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD'},'recordings':[]}
for i,text in enumerate(texts,1):
    key = f'seed-{i:02}'
    output = assets/(key+'.wav')
    with wave.open(str(output),'wb') as wav:
        voice.synthesize_wav(text,wav)
    manifest['recordings'].append({'seedKey':key,'text':text,'file':output.name,'sha256':sha(output)})
(assets/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
module = "import manifest from '../../../assets/audio/manifest.json';\nexport const audioManifest = manifest;\n// Literal requires are necessary for Metro to bundle every local recording.\nexport const audioSources: Record<string, number> = {\n"
module += ''.join(f" '{r['seedKey']}': require('../../../assets/audio/{r['file']}'),\n" for r in manifest['recordings'])
(root/'src/features/audio/audioManifest.ts').write_text(module+'};\n')
