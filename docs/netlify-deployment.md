# Netlify deployment

Production runs as a Vite SPA with a Netlify Functions v2 API (`/api/*`) backed by **Netlify Blobs** (`happy-eat-state` store, strong consistency + ETag optimistic concurrency).

## Required environment variables

Configure these in Netlify Site Settings -> Environment variables (or via `netlify env:set`):

- `FAMILY_ACCESS_CODE` (required): shared family access code protecting `/api/*`
- `DEEPSEEK_API_KEY` (optional, recommended for text AI): enables AI ingredient parsing, AI text/web recipe extraction, and AI recipe generation via DeepSeek (`deepseek-chat`)
- `DEEPSEEK_BASE_URL` (optional): defaults to `https://api.deepseek.com`
- `DEEPSEEK_TEXT_MODEL` (optional): defaults to `deepseek-chat`
- `DASHSCOPE_API_KEY` (optional): enables image recipe OCR/vision extraction and voice transcription (`/api/audio/transcriptions`), and also serves as fallback text LLM when `DEEPSEEK_API_KEY` is unset
- `DASHSCOPE_BASE_URL` (optional): defaults to `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `DASHSCOPE_TEXT_MODEL` (optional): defaults to `qwen-plus`
- `DASHSCOPE_VISION_MODEL` (optional): defaults to `qwen3-vl-plus`
- `DASHSCOPE_ASR_MODEL` (optional): defaults to `qwen3-asr-flash`

## Deploy via CLI

```bash
npm install
npx netlify-cli link   # or create a new site
npx netlify-cli env:set FAMILY_ACCESS_CODE "your-access-code"
npx netlify-cli env:set DEEPSEEK_API_KEY "your-deepseek-key"
npx netlify-cli deploy --build --prod
```

## Notes

- First API request automatically seeds the Netlify Blobs `happy-eat-state` store with default sample ingredients and recipes when empty.
- Standard Netlify Functions buffered request payloads are capped at 6 MB (about 4.5 MB raw image/audio before base64 encoding).
