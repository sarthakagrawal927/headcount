#!/bin/bash
# The cut. Pop comes from pacing and fades, not per-frame rescaling — zoompan
# on 1080p cards costs minutes per segment and buys a push-in nobody asked for.
# Cards are short and land on one idea; the live footage runs fast enough to
# feel like a system under load rather than a screen recording.
set -e
WORK="${WORK:-/tmp/hc-video}"
cd "$WORK" && rm -rf seg3 && mkdir -p seg3
ENC="-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r 30 -an"

card(){ # <file> <seconds> <out>
  local d=$2
  ffmpeg -y -loglevel error -loop 1 -t "$d" -i "cards/$1.png" \
    -vf "fade=t=in:st=0:d=0.3,fade=t=out:st=$(echo "$d-0.35"|bc):d=0.35" \
    $ENC "seg3/$3.mp4"
}
live(){ # <dir> <fps> <out>
  ffmpeg -y -loglevel error -framerate "$2" -i "$1/f%05d.jpg" \
    -vf "fade=t=in:st=0:d=0.35" $ENC "seg3/$3.mp4"
}

card 01-title 5.0 01
card n1       3.5 02
live sceneA 20 03
card n2       3.5 04
card 04       4.5 05
card n3       3.5 06
live sceneB 26 07
card 07       8.0 08
card n4       3.5 09
card 09       8.0 10
card 10       7.0 11
card n5       3.5 12
card 12       9.5 13
card 13       6.5 14
card n6       3.5 15
card 14       7.0 16

for f in seg3/*.mp4; do echo "file '$PWD/$f'"; done > list3.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list3.txt -c copy \
  "${OUT:-$HOME/Desktop/hackathons/HEADCOUNT-demo.mp4}"
