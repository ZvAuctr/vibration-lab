const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
const html = read('index.html').replace('<!-- STYLE -->', () => '<style>\n' + read('style.css') + '\n</style>')
  .replace('<!-- PHYSICS -->', () => '<script>\n' + read('physics.js') + '\n</script>\n<script>\n' + read('sdof.js') + '\n</script>')
  .replace('<!-- APP -->', () => '<script>\n' + read('app.js') + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
fs.mkdirSync(path.join(root, 'outputs'), { recursive: true });
fs.writeFileSync(path.join(root, 'outputs', '振动力学-1.0.1.html'), html);
console.log('Built offline HTML: ' + Buffer.byteLength(html) + ' bytes; no external assets.');
