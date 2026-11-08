import { readFileSync } from 'node:fs';

const src = readFileSync('/tmp/cinderwake-formatted.js', 'utf8');
const lines = src.split('\n');

for (let i = 32350; i <= 32410; i++) {
  const line = lines[i];
  if (!line) continue;
  console.log(`${i + 1}: ${line}`);
}
