"""``lightbox-bake`` — build the gallery's static data directory.

lightbox-bake fixture --out web/public/data          # synthetic, committed
lightbox-bake tape --out web/public/data-tape        # real run from the cortex lineage store
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from lightbox_bake.fixture import fixture_records
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

    args = parser.parse_args(argv)
    if args.command == "fixture":
        records, source = fixture_records(), "fixture"
    else:
        if not args.pg_url:
            parser.error("no lineage store: pass --pg-url or set CORTEX_PG_URL")
        records, source = tape_records(args.pg_url, dataset=args.dataset, limit=args.limit), "tape"

    stats = build_index(records, args.out, source=source)
    print(f"baked {stats.baked} photos into {args.out}/index.json")
    if stats.drifted:
        print(f"  {stats.drifted} recorded captions differ from what this lens version would assemble (explain.drift)")
    for reason in stats.skipped:
        print(f"  skipped {reason}", file=sys.stderr)
    return 0 if stats.baked else 1


if __name__ == "__main__":
    raise SystemExit(main())
