# Sonora AI

Sonora is a Supabase-backed AI music workspace for mastering, mixing, mashups and text-to-music generation.

## Open-source audio stack

- **ACE-Step 1.5** is the recommended self-hosted generation engine. Its current HTTP API exposes `/release_task` and supports fields such as `prompt`, `lyrics`, `audio_duration`, `task_type`, `reference_audio_path`, and output format. See the official repository: https://github.com/ace-step/ACE-Step-1.5
- **Demucs** can be added for stem separation before mixing/mashups. See: https://github.com/adefossez/demucs
- **FFmpeg** is used by the included worker for deterministic mastering/mixing/mashup DSP.

## Local audio worker

1. Copy `.env.example` to `.env.local` and set the Supabase publishable key.
2. Start the DSP worker:

   `docker compose -f docker-compose.ai.yml up --build sonora-worker`

3. Run the Next.js app:

   `npm install && npm run dev`

The worker expects the same runtime audio directory used by the app. For production, replace the local filesystem handoff with object-storage signed URLs or a shared volume.

## ACE-Step

ACE-Step requires a compatible GPU environment for practical generation. The included compose profile is a wiring placeholder because GPU image/runtime requirements vary by host. Point `ACE_STEP_API_URL` at your running ACE-Step server and implement the generation adapter to POST to its `/release_task` endpoint.

## Supabase

The Sonora tables and private `sonora-audio` bucket are already provisioned in the connected Supabase project. Keep service-role credentials server-side only.

## What is connected now

The Next.js API sends Master/Mix/Mashup jobs to the local Sonora DSP worker using short-lived Supabase signed URLs. Completed WAV output is uploaded back into the private `sonora-audio` bucket. The Library polls for job completion.

Song generation uses ACE-Step's documented asynchronous flow: `/release_task` creates a task and `/query_result` is polled until success; the returned `/v1/audio?path=...` file is then copied into the user's private Supabase library. The official ACE-Step API documents this workflow and request fields. 

### Start the free/self-hosted stack

```bash
cp .env.example .env.local
# put your Supabase publishable key in .env.local

docker compose -f docker-compose.ai.yml up --build sonora-worker
npm install
npm run dev
```

For generation, start ACE-Step separately on a CUDA-capable host:

```bash
git clone https://github.com/ACE-Step/ACE-Step-1.5.git
cd ACE-Step-1.5
uv sync
uv run acestep-api
```

The API is available on port 8001 by default. Set `ACE_STEP_API_URL=http://localhost:8001` in Sonora. ACE-Step's current docs specify POST `/release_task`, POST `/query_result`, and `/v1/audio` for generated files. 
