const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
const version = require('../package.json').version;
const html = read('index.html').replace('<!-- STYLE -->', () => '<style>\n' + read('style.css') + '\n</style>')
  .replace('<!-- MDOF -->', () => read('mdof.html'))
  .replace('<!-- PHYSICS -->', () => '<script>\n' + read('physics.js') + '\n</script>\n<script>\n' + read('sdof.js') + '\n</script>')
  .replace('<!-- APP -->', () => ['spectrum.js', 'app.js', 'mdof.js', 'mdof-ui.js'].map(name => '<script>\n' + read(name) + '\n</script>').join('\n'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
fs.mkdirSync(path.join(root, 'outputs'), { recursive: true });
fs.writeFileSync(path.join(root, 'outputs', '振动力学-' + version + '.html'), html);
console.log('Built offline HTML: ' + Buffer.byteLength(html) + ' bytes; no external assets.');
