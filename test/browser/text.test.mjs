import assert from 'node:assert/strict';
import test from 'node:test';
import { withMermaidPage } from '../../scripts/mermaid-browser.mjs';

const longName = 'A very long application component name that keeps going until it reaches ninety characters';
const unbroken = 'A'.repeat(70);
const hyphenated = 'customer-relationship-management-integration-platform-adapter';
const longLabel = 'A relationship label that is long enough to need more than one line of text';

test('element names and relationship labels wrap within their limits', async () => {
  assert.equal(longName.length, 90);
  const source = `archimate-beta
element applicationComponent long "${longName}"
element applicationComponent word "${unbroken}"
element applicationComponent hyphen "${hyphenated}"
element applicationComponent explicit "First line\\nSecond line"
long --> word : "${longLabel}"
word --> hyphen
hyphen --> explicit`;
  const rendered = await withMermaidPage((page) => page.evaluate(async (source) => {
    const mermaid = await globalThis.archimateHost;
    const { svg } = await mermaid.render('wrapping', source);
    const container = document.createElement('div');
    container.innerHTML = svg;
    document.body.append(container);
    try {
      const elements = Object.fromEntries(Array.from(container.querySelectorAll('[data-archimate-element]'), (group) => {
        const outline = group.querySelector('.archimate-outline').getBoundingClientRect();
        const text = group.querySelector('text').getBoundingClientRect();
        return [group.dataset.archimateElement, {
          width: outline.width,
          contained: text.left >= outline.left && text.right <= outline.right
            && text.top >= outline.top && text.bottom <= outline.bottom,
          lines: Array.from(group.querySelectorAll('text tspan'), (span) => span.textContent),
        }];
      }));
      const label = container.querySelector('.archimate-edge-label');
      return {
        elements,
        label: {
          lines: Array.from(label.querySelectorAll('tspan'), (span) => span.textContent),
          backing: Number(label.previousElementSibling.getAttribute('width')),
          width: label.getBoundingClientRect().width,
        },
      };
    } finally {
      container.remove();
    }
  }, source));

  const { long, word, hyphen, explicit } = rendered.elements;
  assert.ok(long.width <= 260, `long name width was ${long.width}`);
  assert.ok(long.lines.length > 1);
  assert.equal(long.lines.join(' '), longName);
  assert.ok(word.width <= 260, `unbroken word width was ${word.width}`);
  assert.ok(word.lines.length > 1);
  assert.equal(word.lines.join(''), unbroken);
  assert.ok(hyphen.lines.length > 1);
  assert.equal(hyphen.lines.join(''), hyphenated);
  assert.ok(hyphen.lines.slice(0, -1).every((line) => line.endsWith('-')), hyphen.lines.join('|'));
  assert.deepEqual(explicit.lines, ['First line', 'Second line']);
  for (const [id, element] of Object.entries(rendered.elements)) {
    assert.ok(element.contained, `${id} label overflows its element`);
  }
  assert.ok(rendered.label.lines.length > 1);
  assert.equal(rendered.label.lines.join(' '), longLabel);
  assert.ok(rendered.label.backing <= 188, `label backing width was ${rendered.label.backing}`);
  assert.ok(rendered.label.width <= rendered.label.backing);
});
