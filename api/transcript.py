"""
Vercel Python Serverless Function for YouTube transcript extraction.
Uses yt-dlp to get authenticated timedtext URLs that bypass IP blocks.
"""

from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import urllib.request
import re


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """GET /api/transcript?v=VIDEO_ID"""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        video_id = params.get('v', [None])[0]

        if not video_id:
            self._respond(400, {'error': 'Missing v parameter'})
            return

        # Validate video ID format
        if not re.match(r'^[a-zA-Z0-9_-]{11}$', video_id):
            self._respond(400, {'error': 'Invalid video ID format'})
            return

        try:
            import yt_dlp

            # Use yt-dlp with 'mediaconnect' player client to bypass
            # YouTube bot detection on datacenter IPs (Vercel, AWS, etc.)
            ydl_opts = {
                'skip_download': True,
                'writesubtitles': True,
                'writeautomaticsub': True,
                'subtitleslangs': ['en'],
                'subtitlesformat': 'json3',
                'quiet': True,
                'no_warnings': True,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['mediaconnect'],
                    }
                },
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(
                    f'https://www.youtube.com/watch?v={video_id}',
                    download=False
                )

            title = info.get('title', 'Unknown')
            channel = info.get('channel', info.get('uploader', 'Unknown'))

            # Get subtitles (prefer manual, fall back to auto)
            subs = info.get('subtitles', {})
            auto_subs = info.get('automatic_captions', {})

            en_subs = subs.get('en', auto_subs.get('en', []))

            # Find json3 format URL
            json3_url = None
            for s in en_subs:
                if s.get('ext') == 'json3':
                    json3_url = s['url']
                    break

            if not json3_url:
                # Try srv1 (XML) format as fallback
                for s in en_subs:
                    if s.get('ext') == 'srv1':
                        json3_url = s['url']
                        break

            if not json3_url:
                self._respond(404, {
                    'error': 'No English captions found for this video',
                    'title': title,
                    'channel': channel,
                })
                return

            # Fetch the actual caption content using the authenticated URL
            req = urllib.request.Request(json3_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                              'AppleWebKit/537.36 (KHTML, like Gecko) '
                              'Chrome/120.0.0.0 Safari/537.36',
            })
            resp = urllib.request.urlopen(req, timeout=15)
            content = resp.read()

            if len(content) == 0:
                self._respond(500, {'error': 'Caption content is empty'})
                return

            data = json.loads(content)
            events = data.get('events', [])

            # Extract text segments with timestamps
            segments = []
            for evt in events:
                start_ms = evt.get('tStartMs', 0)
                duration_ms = evt.get('dDurationMs', 0)
                segs = evt.get('segs', [])
                text_parts = []
                for seg in segs:
                    t = seg.get('utf8', '').strip()
                    if t and t != '\n':
                        text_parts.append(t)
                if text_parts:
                    segments.append({
                        'text': ' '.join(text_parts),
                        'start': start_ms / 1000.0,
                        'duration': duration_ms / 1000.0,
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

            word_count = len(plain_text.split())

            self._respond(200, {
                'videoId': video_id,
                'title': title,
                'channel': channel,
                'text': plain_text,
                'timestamped': timestamped_text,
                'language': 'en',
                'wordCount': word_count,
                'segmentCount': len(segments),
            })

        except Exception as e:
            error_msg = str(e)
            self._respond(500, {
                'error': f'Transcript extraction failed: {error_msg}'
            })

    def _respond(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'public, max-age=300')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
