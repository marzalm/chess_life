#!/usr/bin/env python3
"""
Build the starter Chess Life puzzle pool from real Lichess puzzle data.

Lichess stores FEN as the position before the opponent's setup move.
We apply that first move at extraction time so the shipped data is
ready to play: `fen` becomes the position the player actually sees,
and `solution[0]` becomes the player's first move.

Phase E.1 target:
  - exactly 8 puzzles per locked theme (22 * 8 = 176 total)
  - beginner-weighted difficulty mix per theme: 5 low, 3 mid
  - side-to-move mix per theme: 4 white-to-play, 4 black-to-play
  - low  =  600-999
  - mid  = 1000-1299
  - 1300+ removed from the starter pool

Input sources:
  1. --input-csv PATH   plain CSV file
  2. --input-zst PATH   zstd-compressed CSV file
  3. default            stream official Lichess dump via curl | zstdcat

Output:
  - writes js/puzzle-data.js as a static const PUZZLES = [...]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

try:
    import chess
except ImportError as exc:
    raise SystemExit(
        "python-chess is required for puzzle extraction. "
        "Install it with: python3 -m pip install --user chess"
    ) from exc


DEFAULT_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
THEMES = [
    "fork",
    "pin",
    "skewer",
    "discoveredAttack",
    "hangingPiece",
    "sacrifice",
    "trappedPiece",
    "attackingF2F7",
    "mateIn1",
    "mateIn2",
    "backRankMate",
    "opening",
    "middlegame",
    "endgame",
    "deflection",
    "attraction",
    "ruyLopez",
    "sicilianDefense",
    "frenchDefense",
    "caroKannDefense",
    "italianGame",
    "queensPawnGame",
]
DIRECT_THEMES = {
    "fork",
    "pin",
    "skewer",
    "discoveredAttack",
    "hangingPiece",
    "sacrifice",
    "trappedPiece",
    "attackingF2F7",
    "mateIn1",
    "mateIn2",
    "backRankMate",
    "opening",
    "middlegame",
    "endgame",
    "deflection",
    "attraction",
}
OPENING_PREFIXES = {
    "Ruy_Lopez": "ruyLopez",
    "Sicilian_Defense": "sicilianDefense",
    "French_Defense": "frenchDefense",
    "Caro-Kann_Defense": "caroKannDefense",
    "Italian_Game": "italianGame",
    "Queens_Pawn_Game": "queensPawnGame",
}
THEME_PRIORITY = [
    "ruyLopez",
    "sicilianDefense",
    "frenchDefense",
    "caroKannDefense",
    "italianGame",
    "queensPawnGame",
    "deflection",
    "attraction",
    "attackingF2F7",
    "trappedPiece",
    "discoveredAttack",
    "skewer",
    "pin",
    "fork",
    "sacrifice",
    "hangingPiece",
    "mateIn1",
    "mateIn2",
    "backRankMate",
    "opening",
    "middlegame",
    "endgame",
]
BAND_TARGETS = {"low": 5, "mid": 3}
SIDE_TARGETS = {"w": 4, "b": 4}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-csv")
    parser.add_argument("--input-zst")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parents[1] / "js" / "puzzle-data.js"),
    )
    return parser.parse_args()


def open_csv_stream(args: argparse.Namespace):
    if args.input_csv:
      cmd = f"cat '{args.input_csv}'"
    elif args.input_zst:
      cmd = f"zstdcat '{args.input_zst}'"
    else:
      cmd = f"curl -L --silent '{args.url}' | zstdcat"

    proc = subprocess.Popen(
        ["bash", "-lc", cmd],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert proc.stdout is not None
    return proc


def difficulty_band(rating: int) -> str | None:
    if 600 <= rating < 1000:
        return "low"
    if 1000 <= rating < 1300:
        return "mid"
    return None


def theme_candidates(row: dict[str, str]) -> list[str]:
    out = []
    row_themes = set((row.get("Themes") or "").split())
    for theme in DIRECT_THEMES:
        if theme in row_themes:
            out.append(theme)

    opening_tags = (row.get("OpeningTags") or "").split()
    for tag in opening_tags:
        for prefix, theme in OPENING_PREFIXES.items():
            if tag.startswith(prefix):
                out.append(theme)

    # preserve priority order and uniqueness
    return [theme for theme in THEME_PRIORITY if theme in out]


def stable_key(theme: str, puzzle_id: str) -> str:
    return hashlib.sha1(f"{theme}:{puzzle_id}".encode("utf-8")).hexdigest()


def turn_color_from_fen(fen: str) -> str:
    parts = fen.split(" ")
    return "b" if len(parts) > 1 and parts[1] == "b" else "w"


def normalize_lichess_puzzle(row: dict[str, str]) -> tuple[str, list[str]] | None:
    fen = row["FEN"].strip()
    raw_moves = [move for move in row["Moves"].strip().split() if move]
    if len(raw_moves) < 2:
        return None

    board = chess.Board(fen)
    setup_move = chess.Move.from_uci(raw_moves[0])
    if setup_move not in board.legal_moves:
        return None

    board.push(setup_move)
    solution = raw_moves[1:]
    if not solution:
        return None

    return board.fen(), solution


def sanitize_row(theme: str, row: dict[str, str], normalized: tuple[str, list[str]]) -> dict[str, object]:
    puzzle_id = row["PuzzleId"].strip()
    fen, solution = normalized
    return {
        "id": f"{theme}_{puzzle_id.lower()}",
        "fen": fen,
        "solution": solution,
        "theme": theme,
        "difficulty": int(row["Rating"]),
        "source": f"lichess:{puzzle_id}",
        "_puzzle_id": puzzle_id,
        "_sort_key": stable_key(theme, puzzle_id),
        "_turn": turn_color_from_fen(fen),
    }


def collect_candidates(args: argparse.Namespace) -> dict[str, dict[str, list[dict[str, object]]]]:
    proc = open_csv_stream(args)
    reader = csv.DictReader(proc.stdout)
    pools: dict[str, dict[str, list[dict[str, object]]]] = {
        theme: {"low": [], "mid": []} for theme in THEMES
    }

    rows_seen = 0
    for row in reader:
        rows_seen += 1
        try:
            rating = int(row["Rating"])
        except (KeyError, TypeError, ValueError):
            continue

        band = difficulty_band(rating)
        if band is None:
            continue

        normalized = normalize_lichess_puzzle(row)
        if normalized is None:
            continue

        for theme in theme_candidates(row):
            pools[theme][band].append(sanitize_row(theme, row, normalized))

    _, stderr = proc.communicate()
    if proc.returncode not in (0, None):
        raise RuntimeError(f"CSV source command failed: {stderr.strip()}")

    if rows_seen == 0:
        raise RuntimeError("No CSV rows were read from the source")

    return pools


def _select_theme_candidates(
    theme: str,
    pools: dict[str, dict[str, list[dict[str, object]]]],
    used_ids: set[str],
) -> list[dict[str, object]]:
    available = {
        "low": {
            "w": [],
            "b": [],
        },
        "mid": {
            "w": [],
            "b": [],
        },
    }

    for band in ("low", "mid"):
        candidates = sorted(
            pools[theme][band],
            key=lambda item: item["_sort_key"],
        )
        for candidate in candidates:
            if candidate["_puzzle_id"] in used_ids:
                continue
            available[band][candidate["_turn"]].append(candidate)

    for white_low in range(1, 5):
        white_mid = 4 - white_low
        black_low = BAND_TARGETS["low"] - white_low
        black_mid = 4 - black_low

        if black_low < 0 or black_low > 4 or black_mid < 0 or black_mid > 4:
            continue

        if len(available["low"]["w"]) < white_low:
            continue
        if len(available["mid"]["w"]) < white_mid:
            continue
        if len(available["low"]["b"]) < black_low:
            continue
        if len(available["mid"]["b"]) < black_mid:
            continue

        selected = (
            available["low"]["w"][:white_low]
            + available["mid"]["w"][:white_mid]
            + available["low"]["b"][:black_low]
            + available["mid"]["b"][:black_mid]
        )
        if len(selected) == 8:
            selected.sort(key=lambda item: (item["difficulty"], item["_sort_key"]))
            return selected

    band_counts = {
        band: len(pools[theme][band]) for band in ("low", "mid")
    }
    side_counts = {
        band: {
            "w": len(available[band]["w"]),
            "b": len(available[band]["b"]),
        }
        for band in ("low", "mid")
    }
    raise RuntimeError(
        f"Theme '{theme}' could not reach 8 puzzles with the locked 5/3 band mix "
        f"and 4w/4b side split. Candidates: bands={band_counts} sides={side_counts}"
    )


def select_puzzles(pools: dict[str, dict[str, list[dict[str, object]]]]) -> list[dict[str, object]]:
    used_ids: set[str] = set()
    chosen: list[dict[str, object]] = []

    for theme in THEME_PRIORITY:
        selected_theme = _select_theme_candidates(theme, pools, used_ids)
        for candidate in selected_theme:
            used_ids.add(candidate["_puzzle_id"])
        chosen.extend(selected_theme)

    chosen.sort(key=lambda item: (THEME_PRIORITY.index(item["theme"]), item["difficulty"], item["_sort_key"]))
    return chosen


def write_output(puzzles: list[dict[str, object]], output_path: Path) -> None:
    serializable = []
    for puzzle in puzzles:
        serializable.append({
            "id": puzzle["id"],
            "fen": puzzle["fen"],
            "solution": puzzle["solution"],
            "theme": puzzle["theme"],
            "difficulty": puzzle["difficulty"],
            "source": puzzle["source"],
        })

    counts = defaultdict(int)
    for puzzle in serializable:
        counts[puzzle["theme"]] += 1

    header = [
        "// puzzle-data.js",
        "//",
        "// Generated from the real Lichess puzzle database by",
        "// tools/extract_lichess_puzzles.py.",
        f"// Total puzzles: {len(serializable)}",
        "// Per-theme counts: " + ", ".join(f"{theme}={counts[theme]}" for theme in THEMES),
        "",
    ]
    body = "const PUZZLES = " + json.dumps(serializable, indent=2, ensure_ascii=False) + ";\n"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(header) + body, encoding="utf-8")


def main() -> int:
    args = parse_args()
    output_path = Path(args.output).resolve()
    pools = collect_candidates(args)
    puzzles = select_puzzles(pools)
    write_output(puzzles, output_path)

    print(f"Wrote {len(puzzles)} puzzles to {output_path}")
    for theme in THEMES:
        theme_puzzles = [p for p in puzzles if p["theme"] == theme]
        low = sum(1 for p in theme_puzzles if 600 <= int(p["difficulty"]) <= 999)
        mid = sum(1 for p in theme_puzzles if 1000 <= int(p["difficulty"]) <= 1299)
        white = sum(1 for p in theme_puzzles if turn_color_from_fen(str(p["fen"])) == "w")
        black = sum(1 for p in theme_puzzles if turn_color_from_fen(str(p["fen"])) == "b")
        print(f"  {theme}: total={len(theme_puzzles)} low={low} mid={mid} white={white} black={black}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
