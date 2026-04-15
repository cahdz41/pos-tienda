const fs = require('fs');
const path = require('path');

const src  = path.join(__dirname, '../node_modules/onnxruntime-web/dist');
const dest = path.join(__dirname, '../public/ort-wasm');

fs.mkdirSync(dest, { recursive: true });

const copied = [];
fs.readdirSync(src).forEach(file => {
  if (file.endsWith('.wasm') || file.endsWith('.mjs') || file.endsWith('.js')) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
    copied.push(file);
  }
});

console.log(`✅ ort-wasm: ${copied.length} archivos copiados a public/ort-wasm/`);
