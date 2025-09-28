import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDir = __dirname;
const files = fs
  .readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

if (files.length === 0) {
  console.error('No test files found in test/.');
  process.exitCode = 1;
  process.exit();
}

let total = 0;
let failed = 0;

for (const file of files) {
  const collected = [];
  globalThis.test = (name, fn) => {
    collected.push({ name, fn });
  };

  const fileUrl = pathToFileURL(path.join(testDir, file)).href;
  await import(fileUrl);
  delete globalThis.test;

  if (collected.length === 0) {
    console.warn(`Warning: no tests registered in ${file}`);
    continue;
  }

  for (const { name, fn } of collected) {
    total += 1;
    try {
      await fn();
      console.log(`[PASS] ${file} :: ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`[FAIL] ${file} :: ${name}`);
      if (err && err.stack) {
        console.error(err.stack);
      } else {
        console.error(err);
      }
    }
  }
}

delete globalThis.test;

if (failed > 0) {
  console.error(`\n${failed} of ${total} tests failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} tests passed.`);
}
