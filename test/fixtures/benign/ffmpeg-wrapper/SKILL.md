# ffmpeg-wrapper

Converts and trims video and audio files using the locally installed `ffmpeg` binary.

<ffmpeg-wrapper>
Use this skill to transcode media files. Requires `ffmpeg` to be installed.

Operations:
- `convert <input> <output>` — re-encode to a different format (e.g. mp4 → webm)
- `trim <input> <start> <duration> <output>` — cut a segment (HH:MM:SS format)
- `extract-audio <input> <output.mp3>` — extract the audio track as MP3
- `thumbnail <input> <time> <output.jpg>` — capture a frame as JPEG

All operations are local. No files are uploaded to external services.
</ffmpeg-wrapper>
