const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
const html = read('index.html').replace('<!-- STYLE -->', () => '<style>\n' + read('style.css') + '\n</style>')
  .replace('<!-- PHYSICS -->', () => '<script>\n' + read('physics.js') + '\n</script>')
  .replace('<!-- APP -->', () => '<script>\n' + read('app.js') + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
fs.writeFileSync(path.join(root, '..', '振动力学实验室.html'), html);
console.log('Built offline HTML: ' + Buffer.byteLength(html) + ' bytes; no external assets.');
