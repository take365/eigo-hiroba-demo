# OpenPronounce pronunciation analysis

The pronunciation analyzer can use the local OpenPronounce service instead of the transcription-only fallback.

```powershell
docker compose -f docker-compose.openpronounce.yml up --build -d
$env:OPENPRONOUNCE_URL = 'http://localhost:8010'
node app/server.mjs
```

The first build/download is large because OpenPronounce downloads two Wav2Vec2 checkpoints (about 1.2 GB each) on first use. The named Docker volume keeps them for later runs. If `OPENPRONOUNCE_URL` is unset or the service is unavailable, the app automatically falls back to the existing OpenAI transcription + gentle feedback path.

The UI shows the OpenPronounce score and transcript. A score of 45 or higher with at most one reported phone error is treated as a pass for this elementary-learner demo; tune `PRONOUNCE_PASS_SCORE` if needed.
