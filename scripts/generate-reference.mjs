import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { elementTypes, relationshipConnectors, relationshipNames, relationshipTypes } from '../dist/language.js';

const root = new URL('../', import.meta.url);
export const referencePath = fileURLToPath(new URL('docs/reference.md', root));
export const skillPath = fileURLToPath(new URL('skills/archimaid/SKILL.md', root));

const skillStart = '<!-- element-types:start -->';
const skillEnd = '<!-- element-types:end -->';

const layerNames = {
  strategy: 'Strategy',
  business: 'Business',
  application: 'Application',
  technology: 'Technology',
  physical: 'Physical',
  implementationAndMigration: 'Implementation & Migration',
  motivation: 'Motivation',
  composite: 'Composite',
};

const aspectNames = {
  activeStructure: 'Active structure',
  behavior: 'Behavior',
  passiveStructure: 'Passive structure',
  motivation: 'Motivation',
};

const cell = (text) => text.replaceAll('|', '\\|');
const code = (text) => '`' + cell(text) + '`';
const row = (cells) => `| ${cells.join(' | ')} |`;

function elementRows(columns) {
  return Object.entries(elementTypes).map(([key, type]) => row(columns(key, type)));
}

function connectorsOf(type) {
  return Object.entries(relationshipConnectors)
    .filter(([, notation]) => notation.type === type)
    .map(([connector, { access, directed }]) => {
      const variant = access && access !== 'unspecified' ? ` (${access})` : directed ? ' (directed)' : '';
      return code(connector) + variant;
    });
}

export function referenceMarkdown() {
  return [
    '# ArchiMate type reference',
    '',
    'Generated from the catalogue by `npm run reference`. Do not edit by hand.',
    '',
    `## Element types (${Object.keys(elementTypes).length})`,
    '',
    row(['Key', 'Name', 'Layer', 'Aspect', 'Description']),
    row(['---', '---', '---', '---', '---']),
    ...elementRows((key, { name, category, aspect, description }) => [
      code(key),
      name,
      layerNames[category],
      aspect ? aspectNames[aspect] : '—',
      cell(description),
    ]),
    '',
    `## Relationship types (${relationshipTypes.length})`,
    '',
    'The left endpoint of a shorthand connector is always the model source.',
    '',
    row(['Key', 'Name', 'Shorthand']),
    row(['---', '---', '---']),
    ...relationshipTypes.map((type) => row([code(type), relationshipNames[type], connectorsOf(type).join(', ')])),
    '',
  ].join('\n');
}

export function skillElementTable() {
  return [
    skillStart,
    row(['Key', 'Name', 'Layer']),
    row(['---', '---', '---']),
    ...elementRows((key, { name, category }) => [code(key), name, layerNames[category]]),
    skillEnd,
  ].join('\n');
}

export function withSkillElementTable(skill) {
  const start = skill.indexOf(skillStart);
  const end = skill.indexOf(skillEnd);
  if (start === -1 || end < start) {
    throw new Error(`SKILL.md must contain ${skillStart} and ${skillEnd}.`);
  }
  return skill.slice(0, start) + skillElementTable() + skill.slice(end + skillEnd.length);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await writeFile(referencePath, referenceMarkdown(), 'utf8');
  await writeFile(skillPath, withSkillElementTable(await readFile(skillPath, 'utf8')), 'utf8');
  console.log(`${referencePath}\n${skillPath}`);
}
