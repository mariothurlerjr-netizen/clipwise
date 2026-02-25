---
name: youtube-transcriber
description: >
  Transcribe and summarize YouTube videos automatically. Extracts transcriptions
  (with timestamps), generates organized AI summaries, and saves formatted reports.
  Supports multiple languages with auto-detection. Use this skill whenever the user
  wants to transcribe a YouTube video, get a summary of a video, extract text from
  a YouTube link, or process YouTube content in any way.
---

# YouTube Video Transcriber & Summarizer

This skill transcribes YouTube videos and generates organized summaries with Claude.

## How it Works

1. **Extract transcript** from YouTube using available captions/subtitles
2. **Fetch metadata** (title, channel, duration, etc.)
3. **Generate summary** using Claude (organized with executive summary, key points, detailed breakdown)
4. **Save report** as formatted Markdown file

## Dependencies

Install before first use:
```bash
pip install youtube-transcript-api yt-dlp anthropic --break-system-packages -q
```

## Usage

### Quick Transcription (single video)

```bash
python3 <skill-path>/scripts/transcribe.py "YOUTUBE_URL" -o /path/to/output
```

### Options

| Flag | Description |
|------|-------------|
| `--no-timestamps` | Plain text without timestamps |
| `--no-summary` | Skip AI summary (just transcript) |
| `--api-key KEY` | Anthropic API key (or use ANTHROPIC_API_KEY env) |
| `-o DIR` | Output directory for report files |
| `--json` | Output metadata as JSON |

### As a Python Module

```python
from scripts.transcribe import transcribe_video

result = transcribe_video(
    url="https://youtube.com/watch?v=VIDEO_ID",
    with_timestamps=True,
    summarize=True,
    output_dir="./output"
)

print(result['summary'])
print(result['transcript']['plain_text'])
```

## Output Format

The skill generates three files per video:

1. **`{title}_report.md`** — Full formatted report with metadata, summary, and transcript
2. **`{title}_transcript.txt`** — Raw transcript (with or without timestamps)
3. **`{title}_data.json`** — Structured metadata for programmatic use

## Report Structure

The summary follows this format:
- **Resumo Executivo** — 2-3 sentence overview
- **Pontos Principais** — Key takeaways
- **Resumo Detalhado** — Topic-by-topic breakdown with timestamps
- **Insights e Destaques** — Notable quotes, data, unique insights
- **Conclusão / Próximos Passos** — Action items if applicable

## Language Support

The skill auto-detects the video's language and writes the summary in the same language.
Priority order for transcript lookup: pt, pt-BR, en, es, fr, de, it, ja, ko, zh.

## Limitations

- Requires the video to have captions/subtitles (most YouTube videos do)
- Videos without any captions will fail (a Whisper-based fallback can be added)
- Very long videos (3h+) may have transcripts truncated for summarization
- Requires ANTHROPIC_API_KEY for summary generation

## Workflow for the Agent

When the user provides a YouTube URL:

1. Install dependencies if not already installed
2. Run the transcription script with output to the workspace
3. Read the generated report and present key findings to the user
4. Share the report file link for download
