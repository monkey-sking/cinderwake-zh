import { readFileSync } from 'node:fs';

const src = readFileSync('/tmp/cinderwake-formatted.js', 'utf8');
const lines = src.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('var hU = [') || line.includes('var hU=[')) {
    console.log(`Found hU at line ${i + 1}:`);
    for (let j = i; j < i + 40; j++) console.log(`${j + 1}: ${lines[j]}`);
    break;
  }
}
