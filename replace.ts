import * as fs from 'fs';
let content = fs.readFileSync('src/components/ExcelGrid.tsx', 'utf8');
content = content.replace(/顧客提示レート\(お化粧\)/g, '顧客提示レート(整合値)');
fs.writeFileSync('src/components/ExcelGrid.tsx', content);
