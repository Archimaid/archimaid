import mermaid from 'mermaid';
import { archimate } from '../../dist/index.js';

const source = `archimate-beta
  layout graph
  direction LR
  element businessRole clerk "Fulfilment clerk"
  element businessProcess fulfil "Fulfil order"
  element applicationService orders "Order management"
  clerk @==> fulfil
  orders --> fulfil`;

async function render() {
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    await mermaid.registerExternalDiagrams([archimate]);
    const { svg } = await mermaid.render('consumer-diagram', source);
    document.querySelector('#diagram').innerHTML = svg;
    document.body.dataset.status = 'rendered';
  } catch (error) {
    document.body.dataset.error = error instanceof Error ? error.message : String(error);
    document.body.dataset.status = 'failed';
  }
}

render();
