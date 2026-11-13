// Renders the favicon, app icons, social preview image and GitHub avatar from one definition of the mark.
// The outputs are committed; run this after changing the mark or the social preview.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const siteRoot = new URL('../', import.meta.url);
const publicDirectory = new URL('public/', siteRoot);
const brandDirectory = new URL('brand/', siteRoot);

const colours = {
  ink: '#17171c',
  paper: '#fbfaf6',
  business: '#faf087',
  application: '#b8e7fc',
  technology: '#d6f8b8',
  implementation: '#ffe0e0',
  motivation: '#d9cfff',
  strategy: '#f5deaa',
};

function mark(strokeWidth) {
  const bars = [
    [34, 14, colours.business],
    [23, 47, colours.application],
    [12, 80, colours.technology],
  ];
  const rects = bars
    .map(
      ([x, y, fill]) =>
        `<rect x="${x}" y="${y}" width="74" height="26" rx="9" fill="${fill}" stroke="${colours.ink}" stroke-width="${strokeWidth}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${rects}</svg>`;
}

function fontFace(family, file, weight) {
  const data = readFileSync(new URL(`node_modules/${file}`, siteRoot)).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};}`;
}

const fonts = [
  fontFace('Space Grotesk', '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2', '300 700'),
  fontFace('JetBrains Mono', '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 400),
  fontFace('JetBrains Mono', '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2', 600),
].join('');

function iconPage(size, { background, markScale, strokeWidth }) {
  const markSize = Math.round(size * markScale);
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:${size}px;height:${size}px;background:${background};}
    body{display:flex;align-items:center;justify-content:center;}
    svg{width:${markSize}px;height:${markSize}px;display:block;}
  </style></head><body>${mark(strokeWidth)}</body></html>`;
}

function socialPreviewPage() {
  const diagram = readFileSync(new URL('src/diagrams/order-fulfilment.svg', siteRoot), 'utf8');
  const stripe = ['strategy', 'business', 'application', 'technology', 'implementation', 'motivation']
    .map((layer) => `<span style="background:${colours[layer]}"></span>`)
    .join('');
  return `<!doctype html><html><head><style>
    ${fonts}
    *{box-sizing:border-box}
    html,body{margin:0;width:1200px;height:630px;background:${colours.paper};color:${colours.ink};font-family:'Space Grotesk',sans-serif;}
    .stripe{display:grid;grid-template-columns:repeat(6,1fr);height:10px}
    .layout{display:grid;grid-template-columns:540px 1fr;gap:44px;padding:52px 64px 0;height:620px}
    .brand{display:flex;align-items:center;gap:16px;font-size:40px;font-weight:700;letter-spacing:-0.03em}
    .brand svg{width:56px;height:56px}
    h1{margin:44px 0 0;font-size:66px;line-height:1.02;letter-spacing:-0.04em;font-weight:700}
    mark{background:${colours.business};color:inherit;padding:0 0.14em;border-radius:0.16em}
    p{margin:26px 0 0;font-size:26px;line-height:1.4;color:#4a4a5c}
    .footer{position:absolute;left:64px;bottom:44px;display:flex;gap:14px;font-family:'JetBrains Mono',monospace;font-size:20px}
    .pill{padding:6px 14px;border:2px solid ${colours.ink};border-radius:999px;background:#fff}
    .card{align-self:start;margin-top:8px;border:3px solid ${colours.ink};border-radius:22px;overflow:hidden;box-shadow:10px 10px 0 ${colours.ink};background:#fff}
    pre{margin:0;padding:22px 24px;background:#14141c;color:#ecebe7;font-family:'JetBrains Mono',monospace;font-size:15px;line-height:26px;font-variant-ligatures:none}
    .kw{color:#c3b6ff}.bus{color:#f4e65e;font-weight:600}.str{color:#ffc2a8}.op{color:#ff92b8;font-weight:600}.rid{color:#a9a6c8;font-style:italic}
    .diagram{padding:18px 18px 22px;background-color:#fff;background-image:radial-gradient(#dcdad2 1px,transparent 1px);background-size:18px 18px}
    .diagram svg{display:block;width:100%;height:auto}
  </style></head><body>
    <div class="stripe">${stripe}</div>
    <div class="layout">
      <div>
        <div class="brand">${mark(5)}Archimaid</div>
        <h1>Write the architecture.<br><mark>Get&nbsp;the&nbsp;diagram.</mark></h1>
        <p>ArchiMate® diagrams as plain text, checked in CI and rendered by Mermaid.</p>
      </div>
      <div class="card">
        <pre><span class="kw">element</span> <span class="bus">businessActor</span> customer <span class="str">"Customer"</span>
<span class="kw">element</span> <span class="bus">businessProcess</span> fulfil <span class="str">"Fulfil order"</span>
<span class="kw">relationship</span> <span class="op">assignment</span> <span class="rid">performs</span>
  customer <span class="op">-></span> fulfil</pre>
        <div class="diagram">${diagram}</div>
      </div>
    </div>
    <div class="footer"><span class="pill">archimaid.org</span><span class="pill">Open source · MIT</span></div>
  </body></html>`;
}

function icoFromPngs(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  async function render(html, width, height, { transparent = false } = {}) {
    await page.setViewportSize({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return page.screenshot({ type: 'png', omitBackground: transparent });
  }

  const transparentIcon = (size, strokeWidth) =>
    render(iconPage(size, { background: 'transparent', markScale: 1, strokeWidth }), size, size, { transparent: true });
  const solidIcon = (size, markScale) =>
    render(iconPage(size, { background: colours.paper, markScale, strokeWidth: 6 }), size, size);

  mkdirSync(brandDirectory, { recursive: true });
  writeFileSync(new URL('favicon.svg', publicDirectory), `${mark(9)}\n`);
  writeFileSync(
    new URL('favicon.ico', publicDirectory),
    icoFromPngs([
      { size: 16, data: await transparentIcon(16, 12) },
      { size: 32, data: await transparentIcon(32, 9) },
      { size: 48, data: await transparentIcon(48, 7) },
    ]),
  );
  writeFileSync(new URL('apple-touch-icon.png', publicDirectory), await solidIcon(180, 0.72));
  writeFileSync(new URL('icon-192.png', publicDirectory), await solidIcon(192, 0.72));
  writeFileSync(new URL('icon-512.png', publicDirectory), await solidIcon(512, 0.72));
  writeFileSync(new URL('icon-maskable-512.png', publicDirectory), await solidIcon(512, 0.56));
  writeFileSync(new URL('og.png', publicDirectory), await render(socialPreviewPage(), 1200, 630));
  writeFileSync(new URL('github-avatar.png', brandDirectory), await solidIcon(512, 0.68));

  console.log(`Brand images written to ${fileURLToPath(publicDirectory)} and ${fileURLToPath(brandDirectory)}`);
} finally {
  await browser.close();
}
