"""Build the landing-page media from the two source clips.

Sources (not deployed, kept outside public/): LANDING_SRC (default C:/Users/User/lsp-data/landing-src)
  part1-orbit.mp4    10 s orbital Moon, slow rotation
  part2-descent.mp4  10 s descent; its first frame is part1's last frame
  lunar-horizon.jpg  closing horizon still

Outputs (public/landing/):
  moon-idle.mp4          seamless idle loop from part1 (last 0.6 s cross-dissolved into the start), no audio
  moon-poster.webp       first frame of the idle loop (poster / reduced-motion still)
  descent/{w}/NNN.webp   part2 at 12 fps as WebP frames for canvas scroll scrubbing, w in (1280, 640)
  descent/manifest.json  frame count, fps, sizes
  lunar-horizon.webp     horizon still

Run with the project venv (imageio-ffmpeg provides ffmpeg):
  python scripts/landing-media.py
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = Path(__file__).resolve().parents[1]
SRC = Path(os.environ.get("LANDING_SRC", "C:/Users/User/lsp-data/landing-src"))
OUT = ROOT / "public" / "landing"

FPS = 12
SIZES = (1280, 640)
QUALITY = {1280: 62, 640: 58}
XFADE_S = 0.6


def ff(*args: str) -> None:
    cmd = [FF, "-hide_banner", "-loglevel", "error", "-y", *args]
    print(" ".join(cmd[4:])[:160])
    subprocess.run(cmd, check=True)


def idle_loop() -> None:
    p1 = str(SRC / "part1-orbit.mp4")
    dur = 10.0
    # Loop = part1[0 : dur-XFADE] where the final XFADE seconds of part1 dissolve into its opening frames,
    # so the last frame of the loop flows into the first.
    body_end = dur - XFADE_S
    ff(
        "-i", p1, "-i", p1,
        "-filter_complex",
        f"[0:v]trim=start={XFADE_S}:end={body_end},setpts=PTS-STARTPTS,fps=24[body];"
        f"[1:v]trim=start={body_end}:end={dur},setpts=PTS-STARTPTS,fps=24[tail];"
        f"[0:v]trim=start=0:end={XFADE_S},setpts=PTS-STARTPTS,fps=24[head];"
        f"[tail][head]xfade=transition=fade:duration={XFADE_S}:offset=0[seam];"
        f"[body][seam]concat=n=2:v=1:a=0,scale=1280:-2:flags=lanczos,format=yuv420p[v]",
        "-map", "[v]", "-an",
        "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "high",
        "-movflags", "+faststart",
        str(OUT / "moon-idle.mp4"),
    )
    ff("-i", str(OUT / "moon-idle.mp4"), "-frames:v", "1", "-c:v", "libwebp", "-quality", "72",
       str(OUT / "moon-poster.webp"))


def descent_frames() -> int:
    p2 = str(SRC / "part2-descent.mp4")
    base = OUT / "descent"
    if base.exists():
        shutil.rmtree(base)
    for w in SIZES:
        d = base / str(w)
        d.mkdir(parents=True)
        ff("-i", p2, "-vf", f"fps={FPS},scale={w}:-2:flags=lanczos", "-an",
           "-c:v", "libwebp", "-quality", str(QUALITY[w]), "-compression_level", "6",
           str(d / "%03d.webp"))
    n = len(list((base / str(SIZES[0])).glob("*.webp")))
    (base / "manifest.json").write_text(json.dumps({
        "frames": n, "fps": FPS, "sizes": list(SIZES), "pattern": "{size}/{n:03d}.webp", "first": 1,
        "source": "part2-descent.mp4 (first frame equals the last frame of part1-orbit.mp4)",
    }, indent=2) + "\n")
    return n


def horizon() -> None:
    ff("-i", str(SRC / "lunar-horizon.jpg"), "-c:v", "libwebp", "-quality", "70",
       str(OUT / "lunar-horizon.webp"))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    idle_loop()
    n = descent_frames()
    horizon()
    total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"descent frames: {n}; public/landing total {total / 1e6:.2f} MB")
    for w in SIZES:
        s = sum(f.stat().st_size for f in (OUT / "descent" / str(w)).glob("*.webp"))
        print(f"  descent/{w}: {s / 1e6:.2f} MB")
    for name in ("moon-idle.mp4", "moon-poster.webp", "lunar-horizon.webp"):
        print(f"  {name}: {(OUT / name).stat().st_size / 1e3:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
