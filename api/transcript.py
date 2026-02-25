"""
Vercel Python Serverless Function for YouTube transcript extraction.
Uses youtube_transcript_api which handles YouTube's anti-bot measures.
"""

from http.server import BaseHTTPRequestHandler
import json
import urllib.parse


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """GET /api/transcript?v=VIDEO_ID"""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        video_id = params.get('v', [None])[0]

        if not video_id:
            self._respond(400, {'error': 'Missing v parameter'})
            return

        try:
            from youtube_transcript_api import YouTubeTranscriptApi

            ytt = YouTubeTranscriptApi()
            transcript = ytt.fetch(video_id)

            segments = []
            for snippet in transcript.snippets:
                segments.append({
                    'text': snippet.text,
                    'start': snippet.start,
                    'duration': snippet.duration,
                })

            # Build plain text and timestamped text
            plain_text = ' '.join(s['text'] for s in segments)
            timestamped_lines = []
            for s in segments:
                total_sec = int(s['start'])
                mins = total_sec // 60
                secs = total_sec % 60
                timestamped_lines.append(f"[{mins:02d}:{secs:02d}] {s['text']}")
            timestamped_text = '\n'.join(timestamped_lines)

            # Detect language from transcript metadata
            language = getattr(transcript, 'language', 'auto') or 'auto'
            if hasattr(transcript, 'language_code'):
                language = transcript.language_code

            word_count = len(plain_text.split())

            self._respond(200, {
                'videoId': video_id,
                'text': plain_text,
                'timestamped': timestamped_text,
                'language': language,
                'wordCount': word_count,
                'segmentCount': len(segments),
            })

        except Exception as e:
            error_msg = str(e)
            self._respond(500, {'error': f'Transcript extraction failed: {error_msg}'})

    def _respond(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'public, max-age=300')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
