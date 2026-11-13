import { writeFile } from 'node:fs/promises';
import { elementTypes, relationshipTypes } from 'archi-mermaid/language';
import { closeMermaidBrowser, withMermaidPage } from './mermaid-browser.mjs';

const elements = Object.entries(elementTypes).map(([type, { name, category }]) => ({
  type,
  name,
  category,
}));
const source = [
  'archimate-beta',
  ...elements.map(({ type, name }) => `element ${type} ${type} ${JSON.stringify(name)}`),
  'note preview_note "Add context here"',
].join('\n');
const legend = relationshipTypes.flatMap((type) => {
  if (type === 'access') {
    return [
      ['Access', 'access unspecified'],
      ['Access (read)', 'access read'],
      ['Access (write)', 'access write'],
      ['Access (read/write)', 'access readWrite'],
    ].map(([name, options]) => ({ type, name, options }));
  }
  const entry = { type, name: type[0].toUpperCase() + type.slice(1), options: '' };
  return type === 'association' ? [entry, { type, name: 'Association (directed)', options: 'directed' }] : [entry];
});
// Grouping can be connected to another Grouping by each relationship type.
const relationshipSource = [
  'archimate-beta',
  'direction LR',
  ...legend.flatMap(({ type, options }, index) => [
    `element grouping source_${index} "Source"`,
    `element grouping target_${index} "Target"`,
    [`relationship ${type} relation_${index} source_${index} -> target_${index}`, options].filter(Boolean).join(' '),
  ]),
].join('\n');
const pngPath = process.argv[2];

const svg = await withMermaidPage(async (page) => {
  const sheet = await page.evaluate(
    async ({ source, elements, relationshipSource, legend }) => {
      const host = await globalThis.archimateHost;
      const { svg } = await host.render('element-preview-sheet', source);
      const relationships = await host.render('relationship-preview', relationshipSource);
      const staging = document.createElement('div');
      staging.innerHTML = svg + relationships.svg;
      document.body.append(staging);
      const rendered = staging.querySelector('#element-preview-sheet');
      const renderedRelationships = staging.querySelector('#relationship-preview');
      const note = rendered.querySelector('[data-archimate-note="preview_note"]');
      const nodes = new Map(
        Array.from(rendered.querySelectorAll('[data-archimate-element]'), (element) => [
          element.dataset.archimateElement,
          element,
        ]),
      );
      if (nodes.size !== elements.length) throw new Error('Incomplete element catalogue render');

      const ns = 'http://www.w3.org/2000/svg';
      function add(parent, tag, attrs, content) {
        const child = document.createElementNS(ns, tag);
        for (const [name, value] of Object.entries(attrs)) child.setAttribute(name, String(value));
        if (content !== undefined) child.textContent = content;
        parent.append(child);
        return child;
      }

      const columns = [
        [
          ['motivation', 'Motivation'],
          ['strategy', 'Strategy'],
          ['business', 'Business'],
          ['composite', 'Composite elements'],
        ],
        [
          ['application', 'Application'],
          ['technology', 'Technology'],
          ['physical', 'Physical elements'],
          ['implementationAndMigration', 'Implementation and migration'],
        ],
      ];
      const shapes = elements.map(({ type }) => nodes.get(type).querySelector('.archimate-outline').getBBox());
      const cellWidth = Math.ceil(Math.max(...shapes.map(({ width }) => width))) + 14;
      const rowHeight = Math.ceil(Math.max(...shapes.map(({ height }) => height))) + 12;
      const panelWidth = 3 * cellWidth;
      const margin = 32;
      const panelGap = 32;
      const width = 2 * margin + 2 * panelWidth + panelGap;
      const sheet = document.createElementNS(ns, 'svg');
      sheet.id = rendered.id;
      sheet.setAttribute('width', width);
      sheet.setAttribute('role', 'img');
      sheet.setAttribute('aria-labelledby', 'sheet-title sheet-description');
      add(sheet, 'title', { id: 'sheet-title' }, 'ArchiMate 3.2 notation preview');
      add(
        sheet,
        'desc',
        { id: 'sheet-description' },
        'Element types, relationship notation, and the diagram note annotation.',
      );
      for (const style of rendered.querySelectorAll(':scope > style')) sheet.append(style.cloneNode(true));
      const background = add(sheet, 'rect', { width, fill: '#fff' });
      const heading = { 'font-family': 'Arial, sans-serif', fill: '#182339' };
      add(
        sheet,
        'text',
        { ...heading, x: margin, y: 56, 'font-size': 32, 'font-weight': 700 },
        'ArchiMate 3.2 notation preview',
      );
      add(
        sheet,
        'text',
        { ...heading, x: margin, y: 82, 'font-size': 15, fill: '#475569' },
        `${elements.length} element types · ${legend.length} relationship examples`,
      );
      let bottom = 0;
      columns.forEach((sections, column) => {
        const x = margin + column * (panelWidth + panelGap);
        let y = 115;
        for (const [category, name] of sections) {
          const members = elements.filter((element) => element.category === category);
          add(sheet, 'text', { ...heading, x, y: y + 20, 'font-size': 19, 'font-weight': 700 }, name);
          add(
            sheet,
            'text',
            { ...heading, x: x + panelWidth, y: y + 20, 'font-size': 14, fill: '#475569', 'text-anchor': 'end' },
            String(members.length),
          );
          add(sheet, 'line', { x1: x, x2: x + panelWidth, y1: y + 31, y2: y + 31, stroke: '#e2e8f0' });
          y += 40;
          members.forEach(({ type }, index) => {
            const node = nodes.get(type);
            const shape = node.querySelector('.archimate-outline').getBBox();
            const left = x + (index % 3) * cellWidth + (cellWidth - shape.width) / 2;
            const top = y + Math.floor(index / 3) * rowHeight + (rowHeight - shape.height) / 2;
            const copy = node.cloneNode(true);
            copy.setAttribute('transform', 'translate(' + (left - shape.x) + ' ' + (top - shape.y) + ')');
            sheet.append(copy);
          });
          y += Math.ceil(members.length / 3) * rowHeight + 16;
        }
        bottom = Math.max(bottom, y);
      });
      const legendWidth = panelWidth * 2 - 182;
      const noteX = margin + legendWidth + panelGap;
      const noteWidth = width - noteX - margin;
      const headingY = bottom + 20;
      add(sheet, 'text', { ...heading, x: margin, y: headingY, 'font-size': 19, 'font-weight': 700 }, 'Relationships');
      add(
        sheet,
        'text',
        { ...heading, x: noteX, y: headingY, 'font-size': 19, 'font-weight': 700 },
        'Diagram annotation',
      );
      add(sheet, 'line', { x1: margin, x2: width - margin, y1: headingY + 11, y2: headingY + 11, stroke: '#e2e8f0' });

      // Reuse the renderer's actual line styles and marker definitions.
      const defs = add(sheet, 'defs', {});
      for (const marker of renderedRelationships.querySelectorAll('defs > marker')) {
        defs.append(marker.cloneNode(true));
      }
      const legendColumns = 5;
      const legendCellWidth = legendWidth / legendColumns;
      const legendRowHeight = 58;
      legend.forEach(({ name }, index) => {
        const x = margin + ((index % legendColumns) + 0.5) * legendCellWidth;
        const y = headingY + 30 + Math.floor(index / legendColumns) * legendRowHeight;
        const path = renderedRelationships
          .querySelector(`[data-archimate-relationship="relation_${index}"]`)
          .cloneNode(true);
        path.setAttribute('d', `M ${x - 59} ${y} H ${x + 59}`);
        sheet.append(path);
        add(sheet, 'text', { ...heading, x, y: y + 22, 'font-size': 14, 'text-anchor': 'middle' }, name);
      });

      const noteBox = note.getBBox();
      const noteSample = note.cloneNode(true);
      noteSample.setAttribute(
        'transform',
        `translate(${noteX + (noteWidth - noteBox.width) / 2 - noteBox.x} ${headingY + 26 - noteBox.y})`,
      );
      sheet.append(noteSample);
      add(
        sheet,
        'text',
        {
          ...heading,
          x: noteX + noteWidth / 2,
          y: headingY + 26 + noteBox.height + 20,
          'font-size': 14,
          'text-anchor': 'middle',
        },
        'Note',
      );
      const height = headingY + 24 + Math.ceil(legend.length / legendColumns) * legendRowHeight;
      sheet.setAttribute('height', height);
      sheet.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      background.setAttribute('height', height);
      staging.remove();
      document.body.style.margin = '0';
      document.body.append(sheet);

      const labels = new Map(
        Array.from(sheet.querySelectorAll('[data-archimate-element]'), (group) => [
          group.dataset.archimateElement,
          group.querySelector('.archimate-label').textContent,
        ]),
      );
      if (labels.size !== elements.length || elements.some(({ type, name }) => labels.get(type) !== name)) {
        throw new Error('Element names or coverage changed in the preview sheet');
      }
      for (const group of sheet.querySelectorAll('[data-archimate-element]')) {
        const shape = group.querySelector('.archimate-outline').getBBox();
        const label = group.querySelector('.archimate-label').getBBox();
        if (label.x < shape.x || label.x + label.width > shape.x + shape.width) {
          throw new Error('Label overflows: ' + group.dataset.archimateElement);
        }
      }
      return { svg: new XMLSerializer().serializeToString(sheet), width, height };
    },
    { source, elements, relationshipSource, legend },
  );
  if (pngPath) {
    await page.setViewportSize({ width: sheet.width, height: sheet.height });
    await page.locator('#element-preview-sheet').screenshot({ path: pngPath });
  }
  return sheet.svg;
}).finally(closeMermaidBrowser);
await writeFile(new URL('../examples/element-preview.svg', import.meta.url), svg + '\n');
console.log(
  `Rendered ${elements.length} elements and ${legend.length} relationship examples in examples/element-preview.svg`,
);
