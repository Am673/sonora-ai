import os, uuid, subprocess, tempfile, urllib.request
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(title='Sonora Audio Worker')
DATA_ROOT = Path(os.getenv('SONORA_DATA_ROOT','/data'))
OUT = DATA_ROOT/'outputs'; OUT.mkdir(parents=True, exist_ok=True)

class Job(BaseModel):
    operation: str
    payload: dict

def ffmpeg(*args):
    p=subprocess.run(['ffmpeg','-y',*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if p.returncode: raise RuntimeError(p.stderr[-1500:])

def download(url, suffix):
    fd,path=tempfile.mkstemp(suffix=suffix); os.close(fd)
    urllib.request.urlretrieve(url,path); return Path(path)

def resolve_inputs(payload):
    urls=payload.get('urls') or []
    if urls: return [download(u, Path(u.split('?')[0]).suffix or '.bin') for u in urls]
    raise ValueError('No signed input URLs supplied')

@app.get('/health')
def health(): return {'ok':True}

@app.get('/outputs/{job_id}')
def output(job_id:str):
    p=OUT/f'{job_id}.wav'
    if not p.exists(): raise HTTPException(404,'Output not ready')
    return FileResponse(p,media_type='audio/wav',filename=f'{job_id}.wav')

@app.post('/jobs')
def jobs(job:Job):
    temp=[]
    try:
        if job.operation not in ('master','mix','mashup'): raise ValueError('Worker supports master, mix and mashup')
        temp=resolve_inputs(job.payload); job_id=job.payload.get('jobId',str(uuid.uuid4())); out=OUT/f'{job_id}.wav'
        if job.operation=='master':
            ffmpeg('-i',str(temp[0]),'-af','highpass=f=25,lowpass=f=19000,acompressor=threshold=-18dB:ratio=2.5:attack=20:release=120,alimiter=limit=0.0dB,loudnorm=I=-14:TP=-1.0:LRA=11',str(out))
        elif job.operation=='mix':
            args=[]
            for p in temp[:4]: args += ['-i',str(p)]
            ffmpeg(*args,'-filter_complex',f'amix=inputs={min(len(temp),4)}:duration=longest:dropout_transition=2,alimiter=limit=0.0dB',str(out))
        else:
            ffmpeg('-i',str(temp[0]),'-i',str(temp[1]),'-filter_complex','[0:a]aresample=44100[a];[1:a]aresample=44100[b];[a][b]amix=inputs=2:duration=shortest:weights=1 1,alimiter=limit=0.0dB',str(out))
        return {'status':'completed','jobId':job_id,'outputPath':f'outputs/{job_id}.wav'}
    except Exception as e: raise HTTPException(500,detail=str(e))
    finally:
        for p in temp:
            try: p.unlink()
            except: pass
