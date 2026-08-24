# Sonora + Hugging Face (free development path)

Sonora keeps AI provider credentials on the server. Do not put HF tokens in the browser.

## Recommended development path

1. Create a free Hugging Face account.
2. Create a **fine-grained/read** token if the Space/API requires authentication.
3. Keep `HF_TOKEN` as a Vercel server environment variable.
4. Use the official ACE-Step v1.5 Space/API as the generation backend only after checking its current API schema. The Space can change its exposed Gradio API, so Sonora intentionally does not hard-code an undocumented endpoint.

## Production path

For reliable multi-user generation, run ACE-Step 1.5 on a dedicated GPU worker (RunPod or another GPU host) and set `ACE_STEP_API_URL` to that worker's REST API. This avoids relying on the free ZeroGPU quota.

## Current Sonora contract

The app expects an ACE-Step compatible REST API with:

- `POST /release_task`
- `POST /query_result`
- `GET /v1/audio?...`

This matches the documented ACE-Step self-hosted API contract.
