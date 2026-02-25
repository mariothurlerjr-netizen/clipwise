#!/usr/bin/env python3
"""
YouTube Video Transcriber & Summarizer
Extracts transcriptions from YouTube videos and generates organized summaries.
Supports multiple languages with automatic detection.
"""

import sys
import os
import re
import json
import argparse
from datetime import datetime

# ── YouTube Transcript API ──────────────────────────────────────────────────
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter

# ── yt-dlp for video metadata ──────────────────────────────────────────────
import yt_dlp


def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'(?:v=|/v/|youtu\.be/|/embed/)([a-zA-Z0-9_-]{11})',
        r'^([a-zA-Z0-9_-]{11})$',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract video ID from: {url}")


def get_video_metadata(video_id: str) -> dict:
    """Fetch video metadata using yt-dlp."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'title': info.get('title', 'Unknown'),
                'channel': info.get('channel', info.get('uploader', 'Unknown')),
                'duration': info.get('duration', 0),
                'upload_date': info.get('upload_date', ''),
                'view_count': info.get('view_count', 0),
                'description': info.get('description', ''),
                'language': info.get('language', ''),
                'url': url,
            }
    except Exception as e:
        return {
            'title': 'Unknown',
            'channel': 'Unknown',
            'duration': 0,
            'upload_date': '',
            'view_count': 0,
            'description': '',
            'language': '',
            'url': url,
            'error': str(e),
        }


def format_duration(seconds: int) -> str:
    """Convert seconds to HH:MM:SS format."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def format_timestamp(seconds: float) -> str:
    """Convert seconds to [MM:SS] or [HH:MM:SS] format."""
    total_secs = int(seconds)
    hours = total_secs // 3600
    minutes = (total_secs % 3600) // 60
    secs = total_secs % 60
    if hours > 0:
        return f"[{hours:02d}:{minutes:02d}:{secs:02d}]"
    return f"[{minutes:02d}:{secs:02d}]"


def get_transcript(video_id: str, preferred_langs=None) -> dict:
    """
    Get transcript for a video. Tries preferred languages first,
    then falls back to any available transcript.

    Returns dict with 'segments' (list of {text, start, duration}),
    'language', and 'is_generated'.
    """
    if preferred_langs is None:
        preferred_langs = ['pt', 'pt-BR', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh']

    ytt_api = YouTubeTranscriptApi()

    try:
        transcript_list = ytt_api.list(video_id)
    except Exception as e:
        raise RuntimeError(f"Could not access transcripts for video {video_id}: {e}")

    # Try manually created transcripts first (higher quality)
    try:
        transcript = transcript_list.find_manually_created_transcript(preferred_langs)
        segments = transcript.fetch()
        return {
            'segments': [{'text': s.text, 'start': s.start, 'duration': s.duration} for s in segments],
            'language': transcript.language_code,
            'is_generated': False,
        }
    except Exception:
        pass

    # Try generated transcripts
    try:
        transcript = transcript_list.find_generated_transcript(preferred_langs)
        segments = transcript.fetch()
        return {
            'segments': [{'text': s.text, 'start': s.start, 'duration': s.duration} for s in segments],
            'language': transcript.language_code,
            'is_generated': True,
        }
    except Exception:
        pass

    # Fallback: get any available transcript
    try:
        for transcript in transcript_list:
            segments = transcript.fetch()
            return {
                'segments': [{'text': s.text, 'start': s.start, 'duration': s.duration} for s in segments],
                'language': transcript.language_code,
                'is_generated': transcript.is_generated,
            }
    except Exception:
        pass

    raise RuntimeError(f"No transcripts available for video {video_id}")


def build_timestamped_text(segments: list) -> str:
    """Build text with timestamps from transcript segments."""
    lines = []
    for seg in segments:
        ts = format_timestamp(seg['start'])
        text = seg['text'].strip()
        if text:
            lines.append(f"{ts} {text}")
    return "\n".join(lines)


def build_plain_text(segments: list) -> str:
    """Build plain text (no timestamps) from transcript segments."""
    texts = [seg['text'].strip() for seg in segments if seg['text'].strip()]
    return " ".join(texts)


def generate_summary_with_claude(text: str, metadata: dict, api_key: str = None) -> str:
    """Generate an organized summary using Claude API."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()

    lang_hint = metadata.get('language', '')
    title = metadata.get('title', 'Unknown')

    prompt = f"""Analise a transcrição abaixo de um vídeo do YouTube e crie um resumo organizado.

INFORMAÇÕES DO VÍDEO:
- Título: {title}
- Canal: {metadata.get('channel', 'Unknown')}
- Duração: {format_duration(metadata.get('duration', 0))}

INSTRUÇÕES:
1. Detecte o idioma da transcrição e escreva o resumo NO MESMO IDIOMA do vídeo
2. Use o seguinte formato:

## 📋 Resumo Executivo
(2-3 frases com a essência do vídeo)

## 🔑 Pontos Principais
(Lista dos pontos mais importantes abordados)

## 📝 Resumo Detalhado
(Resumo organizado por tópicos/seções do vídeo, com timestamps quando relevante)

## 💡 Insights e Destaques
(Citações marcantes, dados importantes, ou insights únicos)

## 🎯 Conclusão / Próximos Passos
(Se aplicável, o que o espectador deve fazer após assistir)

TRANSCRIÇÃO:
{text[:50000]}"""

    message = client.messages.create(
        model="claude-sonnet-4-5-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text


def transcribe_video(url: str, with_timestamps: bool = True, summarize: bool = True,
                     api_key: str = None, output_dir: str = None) -> dict:
    """
    Main function: transcribe a YouTube video and optionally summarize it.

    Returns a dict with all results.
    """
    video_id = extract_video_id(url)

    # Get metadata
    print(f"📹 Fetching video metadata...")
    metadata = get_video_metadata(video_id)
    print(f"   Title: {metadata['title']}")
    print(f"   Channel: {metadata['channel']}")
    print(f"   Duration: {format_duration(metadata.get('duration', 0))}")

    # Get transcript
    print(f"\n📝 Fetching transcript...")
    transcript_data = get_transcript(video_id)
    lang = transcript_data['language']
    is_gen = "auto-generated" if transcript_data['is_generated'] else "manual"
    print(f"   Language: {lang} ({is_gen})")
    print(f"   Segments: {len(transcript_data['segments'])}")

    # Build text
    plain_text = build_plain_text(transcript_data['segments'])
    timestamped_text = build_timestamped_text(transcript_data['segments'])

    result = {
        'video_id': video_id,
        'metadata': metadata,
        'transcript': {
            'language': lang,
            'is_generated': transcript_data['is_generated'],
            'plain_text': plain_text,
            'timestamped_text': timestamped_text,
            'segment_count': len(transcript_data['segments']),
            'word_count': len(plain_text.split()),
        },
        'summary': None,
    }

    # Generate summary
    if summarize:
        print(f"\n🤖 Generating summary with Claude...")
        try:
            summary = generate_summary_with_claude(plain_text, metadata, api_key)
            result['summary'] = summary
            print(f"   Summary generated!")
        except Exception as e:
            print(f"   ⚠️ Summary generation failed: {e}")
            result['summary'] = f"Error generating summary: {e}"

    # Save outputs
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        safe_title = re.sub(r'[^\w\s-]', '', metadata['title'])[:60].strip()
        safe_title = re.sub(r'\s+', '_', safe_title)

        # Save full report
        report = build_report(result, with_timestamps)
        report_path = os.path.join(output_dir, f"{safe_title}_report.md")
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(report)
        result['report_path'] = report_path
        print(f"\n📄 Report saved: {report_path}")

        # Save raw transcript
        transcript_path = os.path.join(output_dir, f"{safe_title}_transcript.txt")
        with open(transcript_path, 'w', encoding='utf-8') as f:
            f.write(timestamped_text if with_timestamps else plain_text)
        result['transcript_path'] = transcript_path

        # Save JSON data
        json_path = os.path.join(output_dir, f"{safe_title}_data.json")
        json_data = {
            'video_id': result['video_id'],
            'metadata': result['metadata'],
            'transcript_stats': {
                'language': result['transcript']['language'],
                'is_generated': result['transcript']['is_generated'],
                'segment_count': result['transcript']['segment_count'],
                'word_count': result['transcript']['word_count'],
            },
            'processed_at': datetime.now().isoformat(),
        }
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)

    return result


def build_report(result: dict, with_timestamps: bool = True) -> str:
    """Build a formatted markdown report."""
    meta = result['metadata']
    trans = result['transcript']

    report = f"""# 🎬 {meta['title']}

| Info | Detalhe |
|------|---------|
| **Canal** | {meta['channel']} |
| **Duração** | {format_duration(meta.get('duration', 0))} |
| **Idioma** | {trans['language']} ({'auto-gerado' if trans['is_generated'] else 'manual'}) |
| **Palavras** | {trans['word_count']:,} |
| **Link** | {meta['url']} |
| **Processado em** | {datetime.now().strftime('%d/%m/%Y %H:%M')} |

---

"""
    if result.get('summary'):
        report += result['summary'] + "\n\n---\n\n"

    report += "## 📜 Transcrição Completa\n\n"
    if with_timestamps:
        report += "```\n" + trans['timestamped_text'] + "\n```\n"
    else:
        report += trans['plain_text'] + "\n"

    return report


def main():
    parser = argparse.ArgumentParser(description="YouTube Video Transcriber & Summarizer")
    parser.add_argument('url', help='YouTube video URL or ID')
    parser.add_argument('--no-timestamps', action='store_true', help='Omit timestamps from transcript')
    parser.add_argument('--no-summary', action='store_true', help='Skip AI summary generation')
    parser.add_argument('--api-key', help='Anthropic API key (or set ANTHROPIC_API_KEY env var)')
    parser.add_argument('--output-dir', '-o', help='Output directory for files')
    parser.add_argument('--json', action='store_true', help='Output result as JSON')

    args = parser.parse_args()

    try:
        result = transcribe_video(
            url=args.url,
            with_timestamps=not args.no_timestamps,
            summarize=not args.no_summary,
            api_key=args.api_key,
            output_dir=args.output_dir,
        )

        if args.json:
            # Output minimal JSON (without full text for brevity)
            output = {
                'video_id': result['video_id'],
                'title': result['metadata']['title'],
                'channel': result['metadata']['channel'],
                'duration': result['metadata'].get('duration', 0),
                'language': result['transcript']['language'],
                'word_count': result['transcript']['word_count'],
                'summary': result.get('summary', ''),
                'report_path': result.get('report_path', ''),
            }
            print(json.dumps(output, ensure_ascii=False, indent=2))
        elif not args.output_dir:
            # Print report to stdout
            report = build_report(result, not args.no_timestamps)
            print("\n" + report)

    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
