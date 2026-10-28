#!/bin/sh
# From each assets/video/<name>.mp4 (720x1600 H.264, what record-clips.mjs
# encodes), make what the site actually serves (stage.js / site.js pick):
#   <name>.webm       VP9 720x1600   wide screens
#   <name>-540.webm   VP9 540x1200   phones (the 3D phone is about 240 css px wide)
#   <name>-540.mp4    H.264 540x1200 phones whose browser has no VP9
#   <name>-first.webp the first frame, shown until the clip can play
# The 720 .mp4 stays as the fallback for wide screens without VP9.
#   tools/video-variants.sh [name ...]     (default: all four)
set -e
cd "$(dirname "$0")/../assets/video"
for n in ${@:-scan add remind settle}; do
  vp9() { ffmpeg -v error -y -i "$n.mp4" -vf "scale=$1:flags=lanczos" -c:v libvpx-vp9 -crf "$2" -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -g 60 -an "$3"; }
  vp9 720:1600 40 "$n.webm"
  vp9 540:1200 42 "$n-540.webm"
  ffmpeg -v error -y -i "$n.mp4" -vf "scale=540:1200:flags=lanczos" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -g 30 -movflags +faststart -an "$n-540.mp4"
  ffmpeg -v error -y -i "$n.mp4" -frames:v 1 -vf "scale=540:1200:flags=lanczos" -c:v libwebp -quality 80 "$n-first.webp"
  echo "$n: $(du -k "$n.mp4" | cut -f1)K mp4 -> $(du -k "$n.webm" | cut -f1)K webm, $(du -k "$n-540.webm" | cut -f1)K / $(du -k "$n-540.mp4" | cut -f1)K at 540, first frame $(du -k "$n-first.webp" | cut -f1)K"
done
