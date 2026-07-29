#!/usr/bin/env python3
"""Generate uniquely solvable Sudoku puzzles for the web application."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

FULL_MASK = (1 << 9) - 1
LEVELS = {"easy": 42, "medium": 36, "hard": 32, "expert": 29, "pro": 27, "master": 25}


def solution_count(board: list[int], limit: int = 2) -> int:
    rows = [0] * 9
    columns = [0] * 9
    boxes = [0] * 9

    for index, value in enumerate(board):
        if not value:
            continue
        bit = 1 << (value - 1)
        row, column = divmod(index, 9)
        box = (row // 3) * 3 + column // 3
        if rows[row] & bit or columns[column] & bit or boxes[box] & bit:
            return 0
        rows[row] |= bit
        columns[column] |= bit
        boxes[box] |= bit

    count = 0

    def search() -> None:
        nonlocal count
        if count >= limit:
            return

        best_index = -1
        best_mask = 0
        fewest_candidates = 10
        for index, value in enumerate(board):
            if value:
                continue
            row, column = divmod(index, 9)
            box = (row // 3) * 3 + column // 3
            mask = FULL_MASK & ~(rows[row] | columns[column] | boxes[box])
            candidate_count = mask.bit_count()
            if candidate_count == 0:
                return
            if candidate_count < fewest_candidates:
                best_index, best_mask, fewest_candidates = index, mask, candidate_count
                if candidate_count == 1:
                    break

        if best_index < 0:
            count += 1
            return

        row, column = divmod(best_index, 9)
        box = (row // 3) * 3 + column // 3
        while best_mask:
            bit = best_mask & -best_mask
            best_mask -= bit
            board[best_index] = bit.bit_length()
            rows[row] |= bit
            columns[column] |= bit
            boxes[box] |= bit
            search()
            rows[row] ^= bit
            columns[column] ^= bit
            boxes[box] ^= bit
            board[best_index] = 0
            if count >= limit:
                return

    search()
    return count


def generate_solution() -> list[int]:
    board = [0] * 81
    rows = [0] * 9
    columns = [0] * 9
    boxes = [0] * 9

    def search() -> bool:
        best_index = -1
        best_mask = 0
        fewest_candidates = 10
        for index, value in enumerate(board):
            if value:
                continue
            row, column = divmod(index, 9)
            box = (row // 3) * 3 + column // 3
            mask = FULL_MASK & ~(rows[row] | columns[column] | boxes[box])
            candidate_count = mask.bit_count()
            if candidate_count < fewest_candidates:
                best_index, best_mask, fewest_candidates = index, mask, candidate_count
                if candidate_count == 1:
                    break

        if best_index < 0:
            return True

        candidates: list[int] = []
        while best_mask:
            bit = best_mask & -best_mask
            best_mask -= bit
            candidates.append(bit)
        random.shuffle(candidates)

        row, column = divmod(best_index, 9)
        box = (row // 3) * 3 + column // 3
        for bit in candidates:
            board[best_index] = bit.bit_length()
            rows[row] |= bit
            columns[column] |= bit
            boxes[box] |= bit
            if search():
                return True
            rows[row] ^= bit
            columns[column] ^= bit
            boxes[box] ^= bit
            board[best_index] = 0
        return False

    if not search():
        raise RuntimeError("Unable to generate a complete Sudoku board")
    return board


def generate_puzzle(target_clues: int) -> tuple[list[int], list[int]]:
    solution = generate_solution()
    puzzle = solution.copy()
    cells = list(range(81))
    random.shuffle(cells)

    for index in cells:
        if sum(value != 0 for value in puzzle) <= target_clues:
            break
        previous = puzzle[index]
        puzzle[index] = 0
        if solution_count(puzzle.copy(), limit=2) != 1:
            puzzle[index] = previous

    return puzzle, solution


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-level", type=int, default=4)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--output", type=Path, default=Path("src/puzzles.js"))
    args = parser.parse_args()

    random.seed(args.seed)
    data: dict[str, list[dict[str, object]]] = {}
    for level, clues in LEVELS.items():
        data[level] = []
        for _ in range(args.per_level):
            puzzle, solution = generate_puzzle(clues)
            data[level].append({
                "p": "".join(map(str, puzzle)),
                "s": "".join(map(str, solution)),
                "c": sum(value != 0 for value in puzzle),
            })

    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    args.output.write_text(f"export const PUZZLES = {payload};\n", encoding="utf-8")
    print(f"Generated {sum(map(len, data.values()))} puzzles in {args.output}")


if __name__ == "__main__":
    main()
