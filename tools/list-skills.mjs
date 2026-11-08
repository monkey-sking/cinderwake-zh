import { readFileSync } from 'node:fs';

const src = readFileSync('/tmp/cinderwake-formatted.js', 'utf8');
const lines = src.split('\n');

for (let i = 29050; i <= 29900; i++) {
  const line = lines[i];
  if (!line) continue;
  const match = line.match(/id:\s*`([^`]+)`,\s*name:\s*`([^`]+)`/);
  if (match) {
    console.log(`${i + 1}\t${match[1]}\t${match[2]}`);
  }
}
