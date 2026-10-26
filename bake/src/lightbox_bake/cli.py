"""``lightbox-bake`` — build the gallery's static data directory.

lightbox-bake fixture --out web/public/data          # synthetic, committed
lightbox-bake tape --out web/public/data-tape        # real run from the cortex lineage store
lightbox-bake folder --photos /photos --lens-url http://lens:8100
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from lightbox_bake.fixture import fixture_records
from lightbox_bake.folder import purge_store, stream_folder
from lightbox_bake.index import build_index
from lightbox_bake.sources import default_pg_url, tape_records


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(prog="lightbox-bake", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    fixture = sub.add_parser("fixture", help="bake the synthetic fixture (no tape needed)")
    fixture.add_argument("--out", type=Path, default=Path("web/public/data"))

    tape = sub.add_parser("tape", help="bake from the cortex lineage store (CORTEX_PG_URL, CORTEX_S3_*)")
    tape.add_argument("--out", type=Path, default=Path("web/public/data-tape"))
    tape.add_argument("--pg-url", default=default_pg_url(), help="lineage store URL (default: $CORTEX_PG_URL)")
    tape.add_argument("--dataset", help="only captions in this curated dataset (dataset_membership)")
    tape.add_argument("--limit", type=int, help="bake at most N assets")

    folder = sub.add_parser("folder", help="caption a folder of photos via a lens server (LENS_URL)")
    folder.add_argument("--photos", type=Path, required=True, help="directory of images (local, NAS, or USB mount)")
    folder.add_argument("--out", type=Path, default=Path("web/public/data-folder"))
    folder.add_argument("--lens-url", default=os.environ.get("LENS_URL", "http://127.0.0.1:8100"))
    folder.add_argument("--cache", type=Path, help="directory of cached CaptionResult JSON, keyed by sha256")
    folder.add_argument("--limit", type=int, help="caption at most N images, in sorted path order")
    folder.add_argument("--no-recursive", action="store_true", help="only the top of --photos, not subfolders")
    folder.add_argument("--recaption", action="store_true", help="ignore the caption cache and ask lens again")

    purge = sub.add_parser("purge", help="delete a baked gallery and its caption cache")
    purge.add_argument("--root", type=Path, required=True, help="directory that contains data/ and cache/")

    args = parser.parse_args(argv)
    if args.command == "purge":
        purge_store(args.root)
        print(f"purged gallery and caption cache under {args.root}")
        return 0
    if args.command == "fixture":
        stats = build_index(fixture_records(), args.out, source="fixture")
    elif args.command == "tape":
        if not args.pg_url:
            parser.error("no lineage store: pass --pg-url or set CORTEX_PG_URL")
        stats = build_index(tape_records(args.pg_url, dataset=args.dataset, limit=args.limit), args.out, source="tape")
    else:
        stats = stream_folder(
            args.photos,
            args.lens_url,
            args.out,
            cache=args.cache,
            limit=args.limit,
            recursive=not args.no_recursive,
            recaption=args.recaption,
        )
    print(f"baked {stats.baked} photos into {args.out}/index.json")
    if stats.drifted:
        print(f"  {stats.drifted} recorded captions differ from what this lens version would assemble (explain.drift)")
    for reason in stats.skipped:
        print(f"  skipped {reason}", file=sys.stderr)
    return 0 if stats.baked else 1


if __name__ == "__main__":
    raise SystemExit(main())
