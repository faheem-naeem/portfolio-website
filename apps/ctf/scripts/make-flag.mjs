#!/usr/bin/env node
// Generates a random CTF flag and its SHA-256 hash, and prints both.
// Nothing is written to disk: copy the values straight into secrets.
//
//   node apps/ctf/scripts/make-flag.mjs
//
// - CTF_FLAG  (plain flag)  -> api Worker:  cd apps/api && npx wrangler secret put CTF_FLAG
// - FLAG_HASH (hex SHA-256) -> ctf Worker:  cd apps/ctf && npx wrangler secret put FLAG_HASH
import { createHash, randomBytes } from 'node:crypto';

const WORDS = [
    'curious',
    'rabbit',
    'hatch',
    'cipher',
    'robots',
    'header',
    'lantern',
    'compass',
    'signal',
    'beacon',
    'puzzle',
    'trail',
];

function pick() {
    return WORDS[randomBytes(1)[0] % WORDS.length];
}

const flag = `FAHEEM{${pick()}-${pick()}-${randomBytes(8).toString('hex')}}`;
const hash = createHash('sha256').update(flag, 'utf8').digest('hex');

console.log(`CTF_FLAG  = ${flag}`);
console.log(`FLAG_HASH = ${hash}`);
console.log('');
console.log('Set them as secrets (paste the value when prompted):');
console.log('  cd apps/api && npx wrangler secret put CTF_FLAG');
console.log('  cd apps/ctf && npx wrangler secret put FLAG_HASH');
console.log(
    'Do not commit these values. Keep the flag only in your password manager.',
);
