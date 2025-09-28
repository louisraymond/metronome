import assert from 'node:assert/strict';
import { clamp, median } from '../app/utils.js';

test('clamp bounds values within range', () => {
  assert.equal(clamp(10, 0, 20), 10);
  assert.equal(clamp(-5, 0, 20), 0);
  assert.equal(clamp(30, 0, 20), 20);
});

test('median returns middle element for odd length arrays', () => {
  assert.equal(median([5, 1, 8]), 5);
});

test('median averages the two middle elements for even length arrays', () => {
  assert.equal(median([2, 4, 6, 8]), 5);
});
