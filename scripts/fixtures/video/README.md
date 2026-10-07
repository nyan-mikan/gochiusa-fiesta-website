These are synthetic 16×16 black one-frame videos and a silent audio fixture,
generated locally with FFmpeg. They contain no user media. Tests read the small
committed files and do not require FFmpeg.

Generation: `ffmpeg -f lavfi -i color=c=black:s=16x16:r=10 -t 0.1 -an`
followed by `-c:v libx264 -pix_fmt yuv420p -movflags +faststart black.mp4`,
`-c:v libx264 -pix_fmt yuv420p black.mov`, `-c:v libvpx black.webm`, or
`-c:v libx264 black.mkv`.

Audio-only rejection: `ffmpeg -f lavfi -i anullsrc=r=8000:cl=mono -t 0.1 -vn -c:a aac silent.m4a`.

Audio-only WebM: `ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 0.1 -vn -c:a libopus silent.webm`.
