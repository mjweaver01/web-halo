#!/usr/bin/env python3
"""Download the browser UI images into ``port/web/assets/ui``.

The images are Halo artwork, so they are not in Git. Each deployment serves
them, and the next deployment takes them from there. The script tries each
base URL in order and fails if an image is not available or is not an image.
"""

import argparse
import re
import sys
import urllib.request
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parent.parent
WEB_DIR = REPOSITORY / "port" / "web"
DEFAULT_SOURCES = [
    "https://halo-web.mjweaver01.workers.dev",
    "https://mitchellhynes.com/halo",
]
IMAGE_SIGNATURES = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff")


def required_paths() -> list:
    paths = set()
    for source in [WEB_DIR / "shell.html", *WEB_DIR.glob("*.js")]:
        text = source.read_text(encoding="utf-8")
        paths.update(re.findall(r"assets/ui/[\w./-]+\.(?:png|jpg)", text))
    client = (WEB_DIR / "online_client.js").read_text(encoding="utf-8")
    styles = re.search(r"PLAYER_STYLES = Object\.freeze\(\[(.*?)\]", client, re.S)
    if not styles:
        raise RuntimeError("PLAYER_STYLES is missing from online_client.js")
    for style in re.findall(r'"([a-z]+)"', styles.group(1)):
        paths.add(f"assets/ui/spartan/{style}.png")
    return sorted(paths)


def fetch(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": "web-halo-deploy"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
    except OSError as error:
        print(f"{url}: {error}", file=sys.stderr)
        return None
    if not data.startswith(IMAGE_SIGNATURES):
        print(f"{url}: not a PNG or JPEG image", file=sys.stderr)
        return None
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", help="base URL; repeat for fallbacks")
    args = parser.parse_args()
    sources = [source.rstrip("/") for source in (args.source or DEFAULT_SOURCES)]

    missing = []
    for path in required_paths():
        for source in sources:
            data = fetch(f"{source}/{path}")
            if data is not None:
                output = WEB_DIR / path
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(data)
                break
        else:
            missing.append(path)

    if missing:
        print("UI images not available from any source:", *missing, sep="\n  ", file=sys.stderr)
        return 1
    print(f"Downloaded {len(required_paths())} UI images.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
