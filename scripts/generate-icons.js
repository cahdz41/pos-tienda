// Genera icon-192.png e icon-512.png con la letra "C" sobre fondo ámbar
// Usa solo módulos de Node.js — sin dependencias extra
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generate(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Fondo oscuro redondeado
  const radius = size * 0.2;
  ctx.fillStyle = '#0D0D12';
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  // Letra "C" en ámbar
  ctx.fillStyle = '#F0B429';
  ctx.font = `bold ${size * 0.55}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

const dest = path.join(__dirname, '../public');
fs.writeFileSync(path.join(dest, 'icon-192.png'), generate(192));
fs.writeFileSync(path.join(dest, 'icon-512.png'), generate(512));
console.log('✅ Íconos PWA generados: icon-192.png, icon-512.png');
