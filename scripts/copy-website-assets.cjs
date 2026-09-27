const fs = require('fs');
const path = require('path');

const srcDir = 'C:/Users/Administrator/.gemini/antigravity-ide/brain/8859509a-59bb-4136-bbfe-b18ec97eb4b3/.user_uploaded';
const destDir = path.resolve(__dirname, '..', 'website/public/images');
const brandDir = path.resolve(__dirname, '..', 'website/public/branding');

fs.mkdirSync(destDir, { recursive: true });
fs.mkdirSync(brandDir, { recursive: true });

fs.copyFileSync(
  path.resolve(__dirname, '..', 'src/assets/tforart-fileforge-logo.svg'),
  path.resolve(brandDir, 'tforart-fileforge-logo.svg')
);

const mappings = [
  ['media_1790499668657.png', 'dashboard-hero.png'],
  ['media_1790499748579.png', 'task-queue.png'],
  ['media_1790499698542.png', 'gdrive-7zip-settings.png'],
  ['media_1790499717716.png', 'desktop-system-tray.png'],
  ['media_1790499734342.png', 'watchers-automation.png'],
];

for (const [src, dest] of mappings) {
  const s = path.join(srcDir, src);
  const d = path.join(destDir, dest);
  fs.copyFileSync(s, d);
  console.log('Copied ' + src + ' -> ' + dest + ' (' + fs.statSync(d).size + ' bytes)');
}
console.log('Assets setup completed successfully.');
