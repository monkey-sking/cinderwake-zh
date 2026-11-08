import { readFileSync } from 'node:fs';

const src = readFileSync('/tmp/cinderwake-formatted.js', 'utf8');
const lines = src.split('\n');

for (let i = 29290; i <= 29390; i++) {
  const line = lines[i];
  if (line.includes('id:') || line.includes('name:') || line.includes('describe:')) {
    console.log(`${i + 1}: ${line.slice(0, 140)}`);
  }
}
