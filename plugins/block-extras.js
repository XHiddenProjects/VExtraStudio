/** @forge-plugin {"id":"block-extras","name":"Block Extras","version":"1.0.0","description":"Example plugin that adds two custom logic blocks: Coin Flip and Clamp."} */
/** @forge-docs
 * ## Using Block Extras
 * Open a game, switch to **Logic** and look for the **Plugins** category in the block palette.
 *
 * - **Coin Flip** – every time it receives a signal it sends `heads` or `tails` out of the matching port.
 * - **Clamp** – limits a number between *Min* and *Max*.
 *
 * ### Writing your own
 * Blocks registered with `forge.game.registerBlock` must be **self-contained**: their functions are copied as text into exported games, so they cannot use variables from the plugin file. Use only what the function receives:
 * `onInput(node, port, value, game)` – `node.p` holds the settings, `game.send(node, 'port', value)` sends a signal.
 */
forge.game.registerBlock({
  id: 'coinflip', label: 'Coin Flip', cat: 'plugins', desc: 'Sends a signal out of "heads" or "tails" at random.',
  inputs: ['in'], outputs: ['heads', 'tails'], params: [{ key: 'bias', label: 'Chance of heads (0–1)', type: 'number', def: 0.5 }],
  onInput(n, port, v, g) { const p = parseFloat(n.p.bias); g.send(n, Math.random() < (Number.isFinite(p) ? p : 0.5) ? 'heads' : 'tails', 1); },
});
forge.game.registerBlock({
  id: 'clampnum', label: 'Clamp', cat: 'plugins', desc: 'Limits a number to a range.',
  inputs: ['in'], outputs: ['out'], params: [{ key: 'min', label: 'Min', type: 'number', def: 0 }, { key: 'max', label: 'Max', type: 'number', def: 1 }],
  onInput(n, port, v, g) { const a = parseFloat(n.p.min) || 0, b = parseFloat(n.p.max); g.send(n, 'out', Math.max(a, Math.min(Number.isFinite(b) ? b : 1, parseFloat(v) || 0))); },
});
