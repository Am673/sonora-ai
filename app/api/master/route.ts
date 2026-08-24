import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callMusicProvider } from '@/lib/provider'
import { finalizeWorkerOutput } from '@/lib/job-finalizer'

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  if (!Array.isArray(body.paths) || body.paths.length !== 1) {
    return NextResponse.json(
      { error: 'Upload exactly one track' },
      { status: 400 }
    )
  }

  const path = body.paths[0]

  const { data: job, error } = await sb
    .from('sonora_jobs')
    .insert({
      user_id: user.id,
      job_type: 'master',
      input_path: path,
      metadata: {
        paths: body.paths,
        names: body.names || []
      }
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    const signed = await sb.storage
      .from('sonora-audio')
      .createSignedUrl(path, 600)

    if (signed.error) throw signed.error

    const provider = await callMusicProvider({
      operation: 'master',
      payload: {
        jobId: job.id,
        url: signed.data.signedUrl
      }
    })

    await sb
      .from('sonora_jobs')
      .update({
        status: 'processing',
        metadata: { provider }
      })
      .eq('id', job.id)

    const outputUrl = await finalizeWorkerOutput(
      sb,
      job.id,
      user.id
    )

    return NextResponse.json({
      id: job.id,
      status: 'completed',
      outputUrl,
      message: 'Mastering completed.'
    })
  } catch (e) {
    await sb
      .from('sonora_jobs')
      .update({
        status: 'failed',
        error_message:
          e instanceof Error ? e.message : 'Provider error'
      })
      .eq('id', job.id)

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'Provider submission failed'
      },
      { status: 502 }
    )
  }
}
