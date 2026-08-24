import {SupabaseClient} from '@supabase/supabase-js'
export async function finalizeWorkerOutput(sb:SupabaseClient, jobId:string, userId:string){
  const base=process.env.MUSIC_AI_API_URL; if(!base) throw new Error('MUSIC_AI_API_URL is not configured')
  const r=await fetch(`${base.replace(/\/$/,'')}/outputs/${jobId}`,{cache:'no-store'}); if(!r.ok) throw new Error(`Worker output unavailable: ${r.status}`)
  const buf=Buffer.from(await r.arrayBuffer()); const path=`${userId}/outputs/${jobId}.wav`
  const up=await sb.storage.from('sonora-audio').upload(path,buf,{contentType:'audio/wav',upsert:true}); if(up.error) throw up.error
  const signed=await sb.storage.from('sonora-audio').createSignedUrl(path,60*60*24*7); if(signed.error) throw signed.error
  await sb.from('sonora_jobs').update({status:'completed',output_path:path,metadata:{output_url:signed.data.signedUrl}}).eq('id',jobId)
  return signed.data.signedUrl
}
