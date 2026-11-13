import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { referenceMarkdown, referencePath, skillPath, withSkillElementTable } from '../scripts/generate-reference.mjs';

test('the type reference and the skill element table match the catalogue', async () => {
  const stale = 'is stale. Run npm run reference.';
  assert.equal(await readFile(referencePath, 'utf8'), referenceMarkdown(), `docs/reference.md ${stale}`);
  const skill = await readFile(skillPath, 'utf8');
  assert.equal(skill, withSkillElementTable(skill), `SKILL.md ${stale}`);
});
