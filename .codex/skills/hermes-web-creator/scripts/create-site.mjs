import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node scripts/create-site.mjs <target-directory>');
const source = fileURLToPath(new URL('../assets/frontend-template/', import.meta.url));
const target = path.resolve(destination);
try { await fs.access(target); throw new Error('Target already exists; adapt it manually or choose a new directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.cp(source, target, {recursive:true, errorOnExist:true, force:false});
console.log('Hermes starter created: ' + target);
console.log('Google Analytics is not configured; add only a Measurement ID supplied by the site owner.');
