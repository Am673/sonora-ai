export async function callMusicProvider(input:{operation:'master'|'mix'|'mashup'|'generate',payload:any}){
  if(input.operation==='generate'){
    const url=process.env.ACE_STEP_API_URL
    if(!url) throw new Error('ACE_STEP_API_URL is not configured')
    const r=await fetch(`${url.replace(/\/$/,'')}/release_task`,{method:'POST',headers:{'content-type':'application/json',...(process.env.ACE_STEP_API_KEY?{authorization:`Bearer ${process.env.ACE_STEP_API_KEY}`}:{})},body:JSON.stringify(input.payload),cache:'no-store'})
    const text=await r.text(); if(!r.ok) throw new Error(`ACE-Step error ${r.status}: ${text.slice(0,500)}`)
    const data=JSON.parse(text); return {kind:'ace-step',...data.data}
  }
  const url=process.env.MUSIC_AI_API_URL
  if(!url) throw new Error('MUSIC_AI_API_URL is not configured')
  const r=await fetch(`${url.replace(/\/$/,'')}/jobs`,{method:'POST',headers:{'content-type':'application/json',...(process.env.MUSIC_AI_API_KEY?{authorization:`Bearer ${process.env.MUSIC_AI_API_KEY}`}:{})},body:JSON.stringify({operation:input.operation,payload:input.payload}),cache:'no-store'})
  const text=await r.text(); if(!r.ok) throw new Error(`Sonora worker error ${r.status}: ${text.slice(0,500)}`)
  return JSON.parse(text)
}
