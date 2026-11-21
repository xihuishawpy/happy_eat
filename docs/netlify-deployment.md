# Netlify deployment

Production runs as a Vite SPA with a Netlify Functions v2 API (`/api/*`) backed by **Netlify Blobs** (`happy-eat-state` store, strong consistency + ETag optimistic concurrency).

## Required environment variables

Configure these in Netlify Site Settings -> Environment variables (or via `netlify env:set`):

- `FAMILY_ACCESS_CODE` (required): shared family access code protecting `/api/*`
- `DEEPSEEK_API_KEY` (optional, recommended): enables text AI (`deepseek-chat`), multimodal image recipe recognition (`deepseek-flash`), and voice transcription (`/v1/tools/asr`) all with a single DeepSeek key
- `DEEPSEEK_BASE_URL` (optional): defaults to `https://api.deepseek.com`
- `DEEPSEEK_TEXT_MODEL` (optional): defaults to `deepseek-chat`
- `DEEPSEEK_VISION_MODEL` (optional): defaults to `deepseek-flash`
- `DASHSCOPE_API_KEY` (optional): fallback provider for text, image vision, and voice transcription when `DEEPSEEK_API_KEY` is unset
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
