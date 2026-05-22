import * as fs from 'fs';
const files = ['src/utils/calculations.ts', 'src/App.tsx', 'src/types.ts', 'src/components/ExcelGrid.tsx', 'src/components/CompareResults.tsx'];
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/お化粧後/g, '調整後')
                   .replace(/お化粧前/g, '調整前')
                   .replace(/お化粧なし/g, '調整なし')
                   .replace(/お化粧/g, '調整');
  fs.writeFileSync(file, content);
});
