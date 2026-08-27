import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callMusicProvider } from '@/lib/provider'

export async function POST(req: Request) {
  const token = req.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  )

  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))

  const prompt =
    typeof body.prompt === 'string'
      ? body.prompt.trim()
      : ''

  const duration = Number(body.duration) || 120
  const instrumental = Boolean(body.instrumental)

  if (prompt.length < 3) {
    return NextResponse.json(
      { error: 'Describe your song first.' },
      { status: 400 }
    )
  }

  const { data: job, error } = await sb
    .from('sonora_jobs')
    .insert({
      user_id: user.id,
      job_type: 'generate',
      status: 'queued',
      metadata: {
        prompt,
        duration,
        instrumental,
      },
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  try {
    const provider = await callMusicProvider({
      operation: 'generate',
      payload: {
        prompt,
        audio_duration: duration,
        instrumental,
        task_type: 'text2music',
      },
    })

    // ACE-Step returns the asynchronous task ID here.
    const taskId =
      provider?.task_id ??
      provider?.taskId ??
      provider?.id ??
      null

    if (!taskId) {
      throw new Error(
        'ACE-Step did not return a task_id.'
      )
    }

    await sb
      .from('sonora_jobs')
      .update({
        status: 'processing',
        metadata: {
          prompt,
          duration,
          instrumental,
          provider: 'ace-step',
          task_id: taskId,
        },
      })
      .eq('id', job.id)

    return NextResponse.json({
      id: job.id,
      task_id: taskId,
      status: 'processing',
      message: 'Song generation started.',
    })
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : 'Generation provider failed'

    await sb
      .from('sonora_jobs')
      .update({
        status: 'failed',
        error_message: message,
      })
      .eq('id', job.id)

    return NextResponse.json(
      { error: message },
      { status: 502 }
    )
  }
}
