import * as fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(/\\\$/g, '$');
fs.writeFileSync('server.ts', content);
