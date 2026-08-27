import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function aceUrl(path: string) {
  const base = process.env.ACE_STEP_API_URL
  if (!base) throw new Error('ACE_STEP_API_URL is not configured')

  if (/^https?:\/\//i.test(path)) return path

  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
}

async function pollAceStep(taskId: string) {
  const base = process.env.ACE_STEP_API_URL

  if (!base) {
    throw new Error('ACE_STEP_API_URL is not configured')
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }

  if (process.env.ACE_STEP_API_KEY) {
    headers.authorization = `Bearer ${process.env.ACE_STEP_API_KEY}`
  }

  const response = await fetch(
    `${base.replace(/\/$/, '')}/query_result`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        task_id_list: [taskId],
      }),
      cache: 'no-store',
    }
  )

  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `ACE-Step query failed ${response.status}: ${text.slice(0, 300)}`
    )
  }

  const json = JSON.parse(text)
  const result = json?.data?.[0]

  if (!result) return { status: 0 }

  if (Number(result.status) === 2) {
    return {
      status: 2,
      error: 'ACE-Step generation failed.',
    }
  }

  if (Number(result.status) !== 1) {
    return { status: 0 }
  }

  let files: any[] = []

  try {
    files =
      typeof result.result === 'string'
        ? JSON.parse(result.result || '[]')
        : result.result || []
  } catch {
    files = []
  }

  const file = files.find((item) => item?.file)?.file

  if (!file) {
    return {
      status: 2,
      error: 'ACE-Step finished but returned no audio file.',
    }
  }

  return {
    status: 1,
    file: aceUrl(file),
  }
}

export async function GET(req: Request) {
  const token = req.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
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
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { data: jobs, error } = await sb
    .from('sonora_jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  const updatedJobs = []

  for (const job of jobs || []) {
    if (
      job.status !== 'processing' ||
      job.job_type !== 'generate' ||
      job.metadata?.output_url ||
      !job.metadata?.task_id
    ) {
      updatedJobs.push(job)
      continue
    }

    try {
      const result = await pollAceStep(job.metadata.task_id)

      if (result.status === 1 && result.file) {
        const audioResponse = await fetch(result.file, {
          headers: process.env.ACE_STEP_API_KEY
            ? {
                authorization:
                  `Bearer ${process.env.ACE_STEP_API_KEY}`,
              }
            : undefined,
          cache: 'no-store',
        })

        if (!audioResponse.ok) {
          throw new Error(
            `Audio download failed: ${audioResponse.status}`
          )
        }

        const audio = await audioResponse.arrayBuffer()

        const storagePath =
          `${user.id}/generated-${job.id}.mp3`

        const { error: uploadError } = await sb.storage
          .from('sonora-audio')
          .upload(storagePath, audio, {
            contentType: 'audio/mpeg',
            upsert: true,
          })

        if (uploadError) throw uploadError

        const { data: signed, error: signedError } =
          await sb.storage
            .from('sonora-audio')
            .createSignedUrl(
              storagePath,
              60 * 60 * 24 * 7
            )

        if (signedError) throw signedError

        const metadata = {
          ...(job.metadata || {}),
          provider: 'ace-step',
          output_url: signed.signedUrl,
          output_path: storagePath,
        }

        const { data: updated } = await sb
          .from('sonora_jobs')
          .update({
            status: 'completed',
            metadata,
            error_message: null,
          })
          .eq('id', job.id)
          .select()
          .single()

        updatedJobs.push(
          updated || {
            ...job,
            status: 'completed',
            metadata,
          }
        )

        continue
      }

      if (result.status === 2) {
        const { data: updated } = await sb
          .from('sonora_jobs')
          .update({
            status: 'failed',
            error_message:
              result.error || 'Generation failed.',
          })
          .eq('id', job.id)
          .select()
          .single()

        updatedJobs.push(
          updated || {
            ...job,
            status: 'failed',
          }
        )

        continue
      }
    } catch (e) {
      console.error('ACE-Step polling error:', e)
    }

    updatedJobs.push(job)
  }

  return NextResponse.json(updatedJobs)
       }
