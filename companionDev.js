// Local-only controls for trying a companion session.
// The panel is created only on localhost when companionDev=1 is present.
// The public timer page does not show it and does not open a socket.

import { createStorytellerTransport } from './companionTransport.js';
import {
  disableCompanionPublishing,
  enableCompanionPublishing,
  publishCompanionSnapshot,
} from './companionPublish.js';

export function mountCompanionDev(locationObject = globalThis.location) {
  const host = locationObject.hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  const params = new URLSearchParams(locationObject.search);
  if (!local || params.get('companionDev') !== '1') return null;

  const style = document.createElement('style');
  style.textContent = `
    #companionDev {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 1100;
      width: min(280px, calc(100vw - 24px));
      padding: 12px;
      border: 1px solid #5c4a32;
      border-radius: 8px;
      background: #fff8ea;
      color: #2b2118;
      font: 14px/1.4 system-ui, sans-serif;
    }
    #companionDev h2 { margin: 0 0 8px; font-size: 14px; }
    #companionDev p { margin: 4px 0; }
    #companionDev button, #companionDev a { margin: 8px 8px 0 0; }
    #companionDev code { font-size: 18px; letter-spacing: 0.08em; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.id = 'companionDev';
  panel.innerHTML = `
    <h2>Companion dev</h2>
    <p>Local session only. Nothing here is on the public timer.</p>
    <p>Code <code id="companionDevCode">—</code></p>
    <p id="companionDevStatus">Idle</p>
    <p id="companionDevDelivery"></p>
    <button type="button" id="companionDevStart">Start sharing</button>
    <button type="button" id="companionDevDrop">Drop connection</button>
    <button type="button" id="companionDevStop">Stop</button>
    <button type="button" id="companionDevEnd">End session</button>
    <a id="companionDevOpen" href="companion-dev.html" target="_blank" rel="noopener">Open companion</a>
  `;
  document.body.appendChild(panel);

  const codeNode = panel.querySelector('#companionDevCode');
  const statusNode = panel.querySelector('#companionDevStatus');
  const deliveryNode = panel.querySelector('#companionDevDelivery');
  const openLink = panel.querySelector('#companionDevOpen');

  const transport = createStorytellerTransport({
    enablePublishing: enableCompanionPublishing,
    disablePublishing: disableCompanionPublishing,
    republish: () => publishCompanionSnapshot(true),
    onStatus(status) {
      codeNode.textContent = status.code ?? '—';
      statusNode.textContent = status.connection;
      const rev = status.acceptedRev == null ? 'none' : String(status.acceptedRev);
      deliveryNode.textContent = `${status.delivery}, revision ${rev}`;
      if (status.code) {
        openLink.href = `companion-dev.html?code=${encodeURIComponent(status.code)}`;
      }
    },
  });

  panel.querySelector('#companionDevStart').addEventListener('click', () => {
    transport.start();
  });
  panel.querySelector('#companionDevDrop').addEventListener('click', () => {
    transport.drop();
  });
  panel.querySelector('#companionDevStop').addEventListener('click', () => {
    transport.stop();
  });
  openLink.addEventListener('click', (event) => {
    event.preventDefault();
    const child = window.open(openLink.href, 'companionDevClient');
    if (child) window.__companionDevClient = child;
  });
  panel.querySelector('#companionDevEnd').addEventListener('click', () => {
    transport.end();
  });
  return transport;
}
