#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
ARCHIVES = ROOT / "backups" / "full-archives"


def main():
    ARCHIVES.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S-%f")
    archive = ARCHIVES / f"futureflow-data-{stamp}.zip"
    manifest = []
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for file in sorted(DATA.rglob("*")):
            if not file.is_file():
                continue
            relative = file.relative_to(ROOT)
            content = file.read_bytes()
            manifest.append({
                "path": str(relative),
                "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            })
            bundle.writestr(str(relative), content)
        bundle.writestr(
            "BACKUP_MANIFEST.json",
            json.dumps({"createdAt": datetime.now().astimezone().isoformat(), "files": manifest},
                       ensure_ascii=False, indent=2),
        )
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".sha256").write_text(
        f"{digest}  {archive.name}\n", encoding="utf-8"
    )
    print(archive)


if __name__ == "__main__":
    main()
