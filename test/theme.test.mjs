import assert from 'node:assert/strict';
import test from 'node:test';
import { archimateStyles, resolveDiagramColours, resolveTypography } from '../dist/mermaid/styles.js';

const light = { canvas: '#ffffff', text: '#1b1b1b', relationship: '#000000' };
const dark = { canvas: '#333', text: '#ffffff', relationship: '#ffffff', relationshipOutline: '#333' };

test('named Mermaid themes keep the ArchiMate presets', () => {
  assert.deepEqual(resolveDiagramColours(), light);
  assert.deepEqual(
    resolveDiagramColours({ theme: 'default', themeVariables: { background: 'white', lineColor: '#333333' } }),
    light,
  );
  assert.deepEqual(
    resolveDiagramColours({ theme: 'dark', themeVariables: { darkMode: true, background: '#333' } }),
    dark,
  );
  assert.deepEqual(resolveDiagramColours({ theme: 'neo-dark' }), dark);
  assert.deepEqual(resolveDiagramColours({ theme: 'forest', themeVariables: { background: 'white' } }), light);
});

test('the base theme reads its variables and decides dark mode from darkMode, then luminance', () => {
  for (const background of ['#101020', 'rgb(16, 16, 32)', 'hsl(240, 33%, 9%)', 'black']) {
    const colours = resolveDiagramColours({ theme: 'base', themeVariables: { background, lineColor: '#eeeeee' } });
    assert.equal(colours.canvas, background);
    assert.equal(colours.relationship, '#eeeeee');
    assert.equal(colours.relationshipOutline, background, background);
  }
  const forcedLight = resolveDiagramColours({
    theme: 'base',
    themeVariables: { darkMode: false, background: '#101020' },
  });
  assert.equal(forcedLight.relationshipOutline, undefined);
  assert.equal(forcedLight.relationship, '#000000');
  const unreadable = resolveDiagramColours({
    theme: 'base',
    themeVariables: { background: '#101020', textColor: '#333' },
  });
  assert.equal(unreadable.text, '#ffffff');
  // Without a browser to resolve it, a named colour is unknown, so canvas and ink both stay on the preset.
  assert.deepEqual(resolveDiagramColours({ theme: 'base', themeVariables: { background: 'papayawhip' } }), light);
  assert.deepEqual(
    resolveDiagramColours({ theme: 'base', themeVariables: { background: 'papayawhip' } }, () => 'rgb(255, 239, 213)'),
    { ...light, canvas: 'papayawhip' },
  );
});

test('the base theme parses alpha colour forms and never paints with an unknown or transparent canvas', () => {
  for (const background of [
    '#1e1e2eff',
    '#123f',
    'rgba(16, 16, 32, 1)',
    'rgb(16 16 32 / 100%)',
    'hsla(240, 33%, 9%, 1)',
  ]) {
    const colours = resolveDiagramColours({ theme: 'base', themeVariables: { background, lineColor: '#eeeeee' } });
    assert.equal(colours.canvas, background);
    assert.equal(colours.relationship, '#eeeeee', background);
    assert.equal(colours.relationshipOutline, background, background);
  }
  for (const background of ['transparent', '#1e1e2e80', 'rgba(16, 16, 32, 0.5)', 'navy']) {
    assert.deepEqual(
      resolveDiagramColours({ theme: 'base', themeVariables: { background, lineColor: '#eeeeee' } }),
      light,
      background,
    );
  }
  assert.deepEqual(
    resolveDiagramColours({ theme: 'base', themeVariables: { background: 'transparent' } }, () => 'rgba(0, 0, 0, 0)'),
    light,
  );
  assert.deepEqual(
    resolveDiagramColours({ theme: 'base', themeVariables: { background: 'navy', darkMode: true } }),
    dark,
    'an unknown background with declared dark mode keeps the whole dark preset',
  );
  const navy = resolveDiagramColours(
    { theme: 'base', themeVariables: { background: 'navy', lineColor: '#ccccff' } },
    () => 'rgb(0, 0, 128)',
  );
  assert.deepEqual(navy, { canvas: 'navy', text: '#ffffff', relationship: '#ccccff', relationshipOutline: 'navy' });
});

test('typography follows base theme variables and rejects unsafe font families', () => {
  assert.deepEqual(resolveTypography('default', { fontSize: '16px', fontFamily: 'serif' }), {
    fontFamily: 'var(--mermaid-font-family, Arial, sans-serif)',
    labelSize: 14,
    titleSize: 17,
    edgeLabelSize: 12,
  });
  assert.deepEqual(resolveTypography('base', { fontSize: '28px', fontFamily: 'Georgia, serif' }), {
    fontFamily: 'Georgia, serif',
    labelSize: 28,
    titleSize: 34,
    edgeLabelSize: 24,
  });
  assert.equal(
    resolveTypography('base', { fontFamily: 'x; } svg { display: none' }).fontFamily,
    'var(--mermaid-font-family, Arial, sans-serif)',
  );
  assert.match(archimateStyles({ theme: 'base', fontSize: 20 }), /\.archimate-label \{[^}]*font-size: 20px;/u);
  const fallback = 'var(--mermaid-font-family, Arial, sans-serif)';
  for (const fontFamily of ['Georgia, serif', "'Open Sans', sans-serif", '"Trebuchet MS", Verdana, sans-serif']) {
    assert.equal(resolveTypography('base', { fontFamily }).fontFamily, fontFamily);
  }
  for (const fontFamily of ['"Arial', "Arial'", 'a;b', 'url(x)', 'x} svg {', 'Arial\\']) {
    assert.equal(resolveTypography('base', { fontFamily }).fontFamily, fallback, fontFamily);
  }
  assert.match(
    archimateStyles({ theme: 'base', fontFamily: '"Arial', fontSize: 16 }),
    /font-family: var\(--mermaid-font-family, Arial, sans-serif\);\s+font-size: 16px;/u,
  );
  for (const [fontSize, expected] of [
    ['1e6', 32],
    [1e6, 32],
    ['2px', 8],
    ['abc', 14],
    ['-4', 14],
    ['20px', 20],
  ]) {
    assert.equal(resolveTypography('base', { fontSize }).labelSize, expected, String(fontSize));
  }
  assert.match(archimateStyles(), /font-family: var\(--mermaid-font-family, Arial, sans-serif\);\s+font-size: 14px;/u);
});

test('the base theme reports a text or line colour it replaces for legibility', () => {
  const warnings = [];
  const colours = resolveDiagramColours(
    {
      theme: 'base',
      themeVariables: { background: '#101020', textColor: '#333333', lineColor: '#eeeeee' },
    },
    undefined,
    (message) => warnings.push(message),
  );
  assert.equal(colours.text, '#ffffff');
  assert.equal(colours.relationship, '#eeeeee');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /textColor #333333/);
});
