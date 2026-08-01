import assert from 'node:assert/strict';
import test from 'node:test';

import { PUZZLES } from '../src/puzzles.js';

const EXPECTED_CLUES = {
  easy: 42,
  medium: 36,
  hard: 32,
  expert: 29,
  pro: 27,
  master: 25,
};
const COMPLETE_UNIT = '123456789';
const FULL_MASK = 0x3fe;

function units(values) {
  const result = [];
  for (let row = 0; row < 9; row += 1) {
    result.push(values.slice(row * 9, row * 9 + 9));
  }
  for (let column = 0; column < 9; column += 1) {
    result.push(Array.from({ length: 9 }, (_, row) => values[row * 9 + column]));
  }
  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxColumn = 0; boxColumn < 3; boxColumn += 1) {
      const box = [];
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          box.push(values[(boxRow * 3 + row) * 9 + boxColumn * 3 + column]);
        }
      }
      result.push(box);
    }
  }
  return result;
}

function solve(board, limit = 2) {
  const values = [...board].map(Number);
  const rows = new Uint16Array(9);
  const columns = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  let count = 0;
  let firstSolution = null;

  for (let index = 0; index < 81; index += 1) {
    const value = values[index];
    if (!value) continue;
    const row = Math.floor(index / 9);
    const column = index % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
    const bit = 1 << value;
    if (rows[row] & bit || columns[column] & bit || boxes[box] & bit) {
      return { count: 0, firstSolution: null };
    }
    rows[row] |= bit;
    columns[column] |= bit;
    boxes[box] |= bit;
  }

  function search() {
    if (count >= limit) return;
    let bestIndex = -1;
    let bestMask = 0;
    let fewestCandidates = 10;

    for (let index = 0; index < 81; index += 1) {
      if (values[index]) continue;
      const row = Math.floor(index / 9);
      const column = index % 9;
      const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
      const mask = FULL_MASK & ~(rows[row] | columns[column] | boxes[box]);
      const candidateCount = mask.toString(2).replaceAll('0', '').length;
      if (!candidateCount) return;
      if (candidateCount < fewestCandidates) {
        bestIndex = index;
        bestMask = mask;
        fewestCandidates = candidateCount;
        if (candidateCount === 1) break;
      }
    }

    if (bestIndex < 0) {
      count += 1;
      if (!firstSolution) firstSolution = values.join('');
      return;
    }

    const row = Math.floor(bestIndex / 9);
    const column = bestIndex % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
    for (let mask = bestMask; mask; mask &= mask - 1) {
      const bit = mask & -mask;
      values[bestIndex] = Math.log2(bit);
      rows[row] |= bit;
      columns[column] |= bit;
      boxes[box] |= bit;
      search();
      rows[row] ^= bit;
      columns[column] ^= bit;
      boxes[box] ^= bit;
      values[bestIndex] = 0;
      if (count >= limit) return;
    }
  }

  search();
  return { count, firstSolution };
}

test('catalog contains four puzzles for each documented level', () => {
  assert.deepEqual(Object.keys(PUZZLES), Object.keys(EXPECTED_CLUES));
  assert.equal(Object.values(PUZZLES).flat().length, 24);
  for (const puzzles of Object.values(PUZZLES)) assert.equal(puzzles.length, 4);
});

test('puzzle strings are globally unique', () => {
  const puzzles = Object.values(PUZZLES).flat().map(({ p }) => p);
  assert.equal(new Set(puzzles).size, puzzles.length);
});

for (const [level, puzzles] of Object.entries(PUZZLES)) {
  puzzles.forEach((item, puzzleIndex) => {
    test(`${level} puzzle ${puzzleIndex + 1} is valid and uniquely solvable`, () => {
      assert.deepEqual(Object.keys(item).sort(), ['c', 'p', 's']);
      assert.match(item.p, /^[0-9]{81}$/);
      assert.match(item.s, /^[1-9]{81}$/);
      assert.equal(item.c, EXPECTED_CLUES[level]);
      assert.equal([...item.p].filter((value) => value !== '0').length, item.c);

      for (let index = 0; index < 81; index += 1) {
        assert.ok(item.p[index] === '0' || item.p[index] === item.s[index]);
      }
      for (const unit of units([...item.s])) {
        assert.equal([...unit].sort().join(''), COMPLETE_UNIT);
      }
      for (const unit of units([...item.p])) {
        const clues = unit.filter((value) => value !== '0');
        assert.equal(new Set(clues).size, clues.length);
      }

      const result = solve(item.p);
      assert.equal(result.count, 1);
      assert.equal(result.firstSolution, item.s);
    });
  });
}

