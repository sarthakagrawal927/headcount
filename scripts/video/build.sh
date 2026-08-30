#!/bin/bash
# Poppy cut: cards get a slow push-in and a fade, live footage gets speed and
# crossfades. Motion is subtle on purpose — this is an operations tool, not a
# trailer — but nothing sits perfectly still for four seconds any more.
set -e
# Frames and cards are produced by record.mjs and card.mjs into this workspace.
WORK="${WORK:-/tmp/hc-video}"
cd "$WORK" && rm -rf seg2 && mkdir -p seg2
ENC="-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 -an"

# card <file> <seconds> <out>  — 3% push-in + 0.4s fade at both ends
card(){
  local f=$1 d=$2 out=$3 frames=$((${2%.*}*30))
  ffmpeg -y -loglevel error -loop 1 -t "$d" -i "cards/$f.png" \
    -vf "scale=2112:-1,zoompan=z='min(zoom+0.00042,1.06)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=$(echo "$d-0.4"|bc):d=0.4" \
    $ENC "seg2/$out.mp4"
}
# live <dir> <fps> <out>
live(){
  ffmpeg -y -loglevel error -framerate "$2" -i "$1/f%05d.jpg" \
    -vf "fade=t=in:st=0:d=0.4" $ENC "seg2/$3.mp4"
}

card 01-title 5.5 01
card n1       4.0 02
live sceneA 16 03
card n2       4.5 04
card 04       5.0 05
card n3       4.0 06
live sceneB 22 07
card 07       8.5 08
card n4       4.5 09
card 09       8.5 10
card 10       7.5 11
card n5       4.5 12
card 12      10.0 13
card 13       7.0 14
card n6       4.0 15
card 14       7.5 16

for f in seg2/*.mp4; do echo "file '$PWD/$f'"; done > list2.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list2.txt -c copy "${OUT:-$HOME/Desktop/hackathons/HEADCOUNT-demo.mp4}"
