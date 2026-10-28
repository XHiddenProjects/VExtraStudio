/* Vextra Studio – built-in documentation (Markdown). Block reference and plugin pages are generated elsewhere (docs.js). */
(function () {
  const A = (id, group, title, md) => VX.docs.register({ id, group, title, md });

  A('welcome', 'Start here', 'Welcome', `# Welcome to Vextra Studio

Vextra is a workspace for **making websites** and **making games** — in 2D or 3D — with the same tools: a code editor, a drag-and-drop designer, block-based logic and one-click sharing.

## What can I do?

- **Build a website** – open a folder, edit HTML/CSS/JS with live preview in phone, tablet and desktop frames. → [Websites](doc:web)
- **Design a screen visually** – drag components onto a canvas and export clean HTML. → [UI designer](doc:ui)
- **Make a game** – create objects, draw your own sprites, compose sounds, build 3D models, then wire up behaviour with blocks. → [Game editor](doc:game)
- **See the logic both ways** – every behaviour can be viewed as blocks, as code, or side by side. → [Blocks & code](doc:logic)
- **Share it** – publish to a public link, invite collaborators, keep leaderboards and cloud saves. → [Publishing](doc:publish)
- **Extend it** – write plugins that add commands, UI components, themes, game objects and new logic blocks. → [Plugins](doc:plugins-intro)

## Quick start

1. Click **New 2D game** on the Welcome page. A small playable sample opens.
2. Press **Play** (F5) and move with the arrow keys.
3. Switch to the **Logic** view and click the *Player* object — you will see its behaviour as blocks. Press **Code** to see the same thing as a script.
4. Drag a new object from the **Create** panel onto the scene.

> Everything is saved in plain files you own: \`.vxgame\` for games, \`.vxui\` for designs.`);

  A('shortcuts', 'Start here', 'Keyboard shortcuts', `# Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Command palette | Ctrl+Shift+P |
| Quick open file | Ctrl+P |
| Save / Save as | Ctrl+S / Ctrl+Shift+S |
| Close tab | Ctrl+W |
| Find in files | Ctrl+Shift+F |
| Toggle sidebar / bottom panel | Ctrl+B / Ctrl+J |
| Documentation | F1 |
| Play game / live preview | F5 |
| Format document | Shift+Alt+F |
| Settings | Ctrl+, |

## Game editor

| Action | Shortcut |
|---|---|
| Move / Rotate / Scale tool | W / E / R |
| Select tool | Q |
| Delete object / block | Delete |
| Duplicate | Ctrl+D |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z |
| Focus selection | F |
| Pan viewport | Middle mouse or Space + drag |
| Zoom | Mouse wheel |

## UI designer

| Action | Shortcut |
|---|---|
| Nudge | Arrow keys (Shift = 10 px) |
| Copy / Paste / Duplicate | Ctrl+C / Ctrl+V / Ctrl+D |
| Select several | Shift + click, or drag a box |
| Zoom | Ctrl + wheel |`);

  A('web', 'Websites', 'Building websites', `# Building websites

## Open or create a project

Use **New project** and pick a template (blank site, landing page, portfolio, dashboard) or **Open folder** to work on an existing one. Files appear in the Explorer; right-click for rename, delete and more.

## Live preview

Open an \`.html\` file and press **Live preview** (F5). The preview:

- updates **as you type**, including when you edit linked \`.css\` and \`.js\` files;
- inlines relative stylesheets, scripts, images and CSS \`url()\` assets from your project folder;
- shows \`console.log\` output and errors in the **Console** panel at the bottom;
- offers **device frames** — phone, small phone, tablet, laptop and desktop — with rotate.

Markdown (\`.md\`) and SVG files preview too.

## Editing tools

- Syntax highlighting for 25+ languages, auto-complete, snippets, multiple cursors, code folding.
- **Problems** panel shows JavaScript, CSS, JSON and HTML warnings as you type.
- **Format** (Shift+Alt+F) beautifies HTML, CSS, JS and JSON. Turn on *Format on save* in Settings.
- **Find in files** (Ctrl+Shift+F) with case and regex options. **Quick open** (Ctrl+P) jumps to any file.
- Drag files between folders in the Explorer.

## Publishing a site

Use **Publish** (cloud panel) to put the whole folder online at a public link. → [Share & publish](doc:publish)`);

  A('ui', 'UI designer', 'UI designer', `# UI designer

Create a \`.vxui\` file (**New UI design**) to open the visual designer.

## Adding components

The **Create** panel lists **40+ components** in groups — Layout, Navigation, Text, Controls, Forms, Media, Data and Feedback. Either:

- **drag** a component onto the canvas and drop it where you want it, or
- **click** it to add it to the middle of the canvas.

Plugins can add more components. → [Plugin API](doc:plugin-api)

## Working with the canvas

- Click to select, **Shift+click** to add to the selection, drag on empty space for a **selection box**.
- Drag to move, drag the white handles to resize. Hold **Alt** to bypass snapping.
- The right panel edits size, position, rotation and the component's own settings.
- **Align and distribute** several items, reorder layers, lock or hide layers.
- **Undo / Redo**, copy / paste / duplicate, zoom with Ctrl+wheel, **Fit**.

## Export

**Export HTML** writes a standalone page next to your design, and **Preview** opens it in a window. Use the exported HTML as a starting point in a website project.

> If dragging ever seems to do nothing: Vextra uses its own pointer-based drag and drop (not the browser's), so it works in the desktop app. Make sure you have a design tab open — the Create panel switches to that design's components.`);

  A('game', 'Making games', 'Game editor overview', `# Game editor overview

Create a game with **New 2D game** or **New 3D game**. A game is one \`.vxgame\` file holding scenes, objects, behaviours and your own assets.

## The layout

| Area | What it does |
|---|---|
| **Top bar** | Scene / Logic / Assets views, Play, device simulator, Export, Undo/Redo, game settings |
| **Left** | Scenes, the object **hierarchy** and prefabs |
| **Centre** | The viewport (2D canvas or 3D with orbit camera), the logic editor, or the asset studios |
| **Right** | The **Inspector** for the selected object, scene or block |

## Concepts

- **Scene** – a level or screen. 2D and 3D scenes can live in the same game. Use **Load Level** to switch.
- **Object** – anything in a scene: shapes, sprites, text, models, lights, cameras, empties, and objects added by plugins.
- **Behaviour** – a reusable bundle of logic. Attach as many as you like to an object. The scene itself can have behaviours too (for global rules like scoring).
- **Block** – one step of logic. Wire blocks together; signals flow along the wires. → [Blocks & code](doc:logic)
- **Asset** – sprites, sounds and 3D models you make in the studios, or import. → [Assets](doc:assets)
- **Prefab** – an object marked as a template. Use the **Spawn** block to create copies at run time.

## Adding objects

Drag from the **Create** panel onto the viewport, or click an item to add it at the centre. Objects can be dragged in the viewport; in 3D use the **Move / Rotate / Scale** gizmos (W / E / R).

## Playing

Press **Play** (F5). The game runs in the editor with a console. Use the **device simulator** to test phone/tablet sizes, tilt and shake. Edit and press Play again – the editor never changes your scene while playing.

## 2D vs 3D

| | 2D | 3D |
|---|---|---|
| Axes | X right, **Y down** | X right, **Y up**, Z towards you |
| Objects | Rectangle, ellipse, sprite, text, tilemap-like repeats | Cube, sphere, cylinder, cone, plane, torus, capsule, pyramid, ramp, models |
| Camera | Follow, zoom, shake | Fixed, follow, orbit, first-person |
| Physics | Boxes and circles | Boxes and spheres |
| Look | Pixel shaders (blur, glow, outline…) | Materials and shaders (toon, wireframe, hologram, custom GLSL) |`);

  A('logic', 'Making games', 'Blocks & code', `# Blocks & code

Every behaviour can be seen **three ways**. Switch with the **Blocks | Split | Code** buttons in the Logic view.

## Blocks (GUI)

A node graph. Each block has input sockets on the left and output sockets on the right.

- **Add a block** – drag from the palette (grouped into 9 families) or double-click empty space to search.
- **Wire** – drag from an output socket to an input socket. Click a wire and press Delete to remove it.
- **Edit settings** – select a block; its settings appear in the right panel. Hover a block for its description, press **?** for the full reference.
- **Bundles** – select several blocks and press *Group into bundle*; open a bundle by double-clicking it. → [Bundles](doc:blocks-bundles)

## Code

The same logic as a JavaScript script. Reading it teaches you how blocks map to code:

\`\`\`js
const key  = block('keyboard', { key: 'space', mode: 'down' });
const jump = block('impulse',  { y: -420 });
connect(key, 'out', jump, 'in');
\`\`\`

- Switch to **Code** to *read* the script; blocks are generated from the graph and a comment marks each one.
- Press **Convert to code** to make the script the source of truth. You can then write anything: loops, functions, your own logic. The graph becomes a read-only picture of what your code builds.
- **Revert to blocks** goes back to the stored graph.

## Split view

Blocks on the left, code on the right. Selecting a block highlights its lines in the code; placing the cursor in the code highlights the block it creates.

## Scripting API (free-form)

In code you can also use event helpers without blocks – see [Scripting API](doc:scripting).

## Signals

Wires carry **signals**: a number, text, true/false, an object or a list. A *Keyboard* block sends the key name; a *Timer* sends how many times it has fired; a *Collision* sends the other object's name. Blocks that need a number use the incoming signal if the setting says so (look for *Source* or *Use signal*).

## Targets

Many blocks have a **Target**: \`self\` (default), \`other\` (the last object collided with), \`parent\`, \`all\`, \`tag:enemy\` (every object with that tag), or an object name.`);

  A('scripting', 'Scripting', 'Scripting API', `# Scripting API

These functions are available in **Code** mode, in an object's *script* field, and in the *Custom Behavior* block.

## Building blocks in code

| Function | Description |
|---|---|
| \`block(type, params)\` | Create a block, returns a handle |
| \`handle.to(next, 'out', 'in')\` | Connect output port of this block to an input of \`next\` |
| \`connect(a, 'out', b, 'in')\` | Same as above |
| \`bundle(name, () => { ... })\` | Group the blocks created inside into a bundle |

## Events and helpers

\`\`\`js
on('start', () => log('hello'));
on('update', (dt) => { self.x += 100 * dt; });
on('key:space', () => { self.vy = -400; });      // key pressed
on('click', (e) => log(e.x, e.y));
on('collide:coin', (other) => { game.vars.score = (game.vars.score || 0) + 1; game.removeObject(other); });
on('message:hit', (payload) => log(payload));
after(2, () => log('two seconds later'));
every(0.5, () => spawn('Bullet'));
emit('boss-dead');        // custom trigger "boss-dead"
\`\`\`

## Objects and the game

| Name | What it is |
|---|---|
| \`self\` | The object the script runs on (\`x\`, \`y\`, \`z\`, \`w\`, \`h\`, \`rot\`, \`alpha\`, \`color\`, \`vx\`, \`vy\`, \`tags\`, \`vars\`…) |
| \`game\` | The running game: \`find(name)\`, \`findByTag(tag)\`, \`spawn(name, {x,y})\`, \`removeObject(o)\`, \`loadScene(ref)\`, \`pause()\`, \`vars\` |
| \`input\` | \`isDown('a')\`, \`pressed('space')\`, \`released('x')\`, \`mouse\` |
| \`vars\` | Shortcut to the global variables |
| \`log(...)\` | Print to the Console |

> Y points **down** in 2D and **up** in 3D.`);

  A('assets', 'Making games', 'Creating your own assets', `# Creating your own assets

Open the **Assets** view. Everything you create is stored inside the \`.vxgame\` file — no loose files to lose.

## Sprites – pixel editor

Create a sprite, pick a size (8×8 up to 128×128) and paint: pencil, eraser, fill, line, rectangle, ellipse, eyedropper, mirror drawing and a palette. **Frames** let you animate — add frames, set the speed and name animations (e.g. \`walk\` = frames 1–4). Import PNG/JPG/GIF files too.

## Sounds – synth studio

Design sound effects without any files: choose a wave (square, saw, triangle, sine, noise), set frequency sweep, volume envelope (attack, decay), vibrato and length, or start from presets (jump, coin, hit, explosion, laser, power-up). Press **Play** to hear it. Record music loops with the step sequencer. Import MP3/WAV/OGG as well.

## 3D models – model builder

- **Voxel models** – paint cubes in a 3D grid with a colour palette. Perfect for characters and props.
- **Shape groups** – combine primitives (cube, sphere, cylinder…) with position, rotation, scale and colour per part.
- **OBJ import** – bring in \`.obj\` meshes (single colour or with the object's material).

Then use the model in 3D scenes with the **Model** object type.

## Using assets

- Sprites: set a **Sprite** object's *sprite* to your asset, or use the *Animation* block to play animations.
- Sounds: the *Sound* block picks from your sounds.
- Models: the **Model** object.`);

  A('play', 'Making games', 'Playing, testing & exporting', `# Playing, testing & exporting

## Play

**Play** (F5) runs the game in a panel. The toolbar there offers: restart, pause, mute, debug view (colliders), and the **device simulator**:

- screen presets for phones and tablets (portrait/landscape),
- **Shake** and **Tilt** controls that feed the *Shake* and *Accelerometer* blocks,
- touch emulation.

Errors and \`log()\` output appear in the **Console** panel.

## Export

**Export** produces a **single HTML file** containing the game, the engine and all assets — it runs in any modern browser, offline. Upload it to any web host, or press **Publish** to host it with Vextra. → [Share & publish](doc:publish)

Settings that matter: title, size, background, pixel-art rendering, the starting scene.

## Mobile

The same HTML runs on phones. Touch is mapped to the mouse blocks; tilt feeds *Accelerometer*; *Vibrate* uses the vibration motor. For ads and Game Center you can wire a native wrapper — see the *Ad* and *Game Center* blocks.`);

  A('publish', 'Share & publish', 'Publishing & collaboration', `# Publishing & collaboration

Sharing features use a **Vextra server**. Run one locally with \`npm run server\` (it listens on port 8787) or deploy the \`server/\` folder to any machine with Node.js 18+. Then set its address in **Settings → Cloud**.

## Accounts

Open the **cloud** panel in the activity bar to create an account, sign in, change your password or delete your account. → [Accounts](doc:accounts)

## Publish a website or game

1. Sign in.
2. Click **Publish** (cloud panel, or the Publish button in the game editor).
3. Choose a name — your site goes to \`https://your-server/p/<you>/<name>/\`.
4. Click **Update** whenever you want to push changes. **Unpublish** removes it.

Games are published as a single exported HTML file; websites publish the project folder.

## Collaborate

1. Put your project in the cloud (**Share → Upload project**).
2. Copy the **invite code** and send it to a friend; they paste it under **Join project**.
3. Collaborators see and edit the same project; changes sync every few seconds and the cloud panel shows who is online.
4. If two people edit the same file at once, Vextra keeps both versions and asks which to keep.

Roles: **owner** (everything), **editor** (edit files), **viewer** (read only).

## Leaderboards and cloud saves

Published games get online **leaderboards** and per-player **cloud saves** automatically through the *Leaderboard* and *Cloud* blocks.

## Privacy

Projects are private to you and your collaborators until you publish. Published content is public to anyone with the link.`);

  A('accounts', 'Share & publish', 'Accounts', `# Accounts

- **Create account** – choose a username and password (min. 8 characters). Passwords are stored hashed on the server.
- **Sign in / out** – the session is remembered on this computer; the token is kept in the operating system's secure storage when available.
- **Change password**, **sign out of all devices**, **delete account** (also removes your projects and published sites).
- Your **profile** (display name) is shown to collaborators and on leaderboards.

Everything runs against the server in **Settings → Cloud → Server address**.`);

  A('plugins-intro', 'Plugins', 'Plugins overview', `# Plugins overview

A plugin is a single \`.js\` file that receives a \`forge\` object. Plugins can:

| Add | How |
|---|---|
| Commands in the palette | \`forge.commands.register\` |
| Toolbar buttons, status bar items | \`forge.toolbar.add\`, \`forge.statusBar.add\` |
| Side panels | \`forge.panels.register\` |
| UI-designer components | \`forge.designer.registerComponent('ui', …)\` |
| Themes | \`forge.themes.register\` |
| **Game object types** (2D & 3D) | \`forge.game.registerObjectType\` |
| **Logic blocks** | \`forge.game.registerBlock\` |
| **Their own documentation** | \`/** @forge-docs … */\` comment or \`forge.docs.register\` |

## Install and write plugins

- **Plugins** panel → **+** creates a plugin from a template and opens it. Save to hot-reload.
- **Import** loads a \`.js\` file; **Open plugins folder** shows where they live.
- Disable a plugin with its switch – everything it added is removed cleanly.

## Plugin documentation

Every plugin gets a page under **Docs → Plugins**. It combines the text you wrote in the \`@forge-docs\` comment, any pages from \`forge.docs.register\`, and an **automatic list of everything the plugin adds** (commands, components, blocks, panels…). Click **Docs** on a plugin card to open it.

\`\`\`js
/** @forge-plugin {"id":"my-plugin","name":"My Plugin","version":"1.0.0","description":"Does cool things"} */
/** @forge-docs
 * ## Using My Plugin
 * Run **My Plugin: Hello** from the command palette.
 */
forge.commands.register({ id: 'hello', title: 'My Plugin: Hello', run: () => forge.ui.toast('Hi!') });
\`\`\``);

  A('plugin-api', 'Plugins', 'Plugin API reference', `# Plugin API reference

Plugins run with a single argument, \`forge\`.

## Basics

| API | Description |
|---|---|
| \`forge.id\`, \`forge.version\` | Your plugin id and the host API version |
| \`forge.log(...)\` | Console log with your plugin's name |
| \`forge.on(event, cb)\` | Host events: \`editorChange\`, \`save\`, \`tabChange\`, \`registry\` |
| \`forge.settings.get(key, default)\` / \`.set(key, value)\` | Persistent per-plugin settings |

## Commands, toolbar, status bar, panels

\`\`\`js
forge.commands.register({ id: 'shout', title: 'Shout selection', run() { forge.editor.replaceSelection(forge.editor.getSelection().toUpperCase()); } });
forge.toolbar.add({ id: 'btn', label: 'Shout', run: () => forge.commands.run('my-plugin.shout'), when: (lang) => lang === 'html' });
const item = forge.statusBar.add({ id: 's', text: 'ready', align: 'right', onClick() {} });  item.update('busy');
forge.panels.register({ id: 'p', title: 'My panel', icon: 'plugin', render(container) { container.textContent = 'Hello'; } });
\`\`\`

## Editor

\`forge.editor\`: \`getValue()\`, \`setValue(text)\`, \`getSelection()\`, \`replaceSelection(text)\`, \`insertText(text)\`, \`getLanguage()\`, \`getPath()\`, \`onChange(cb)\`, \`onSave(cb)\`, \`onTabChange(cb)\`, \`openFile(path)\`, \`newFile(name, content, lang)\`.

## UI helpers

\`forge.ui\`: \`toast(msg, kind)\`, \`prompt(msg, default)\`, \`confirm(msg, okLabel)\`, \`form({title, fields})\`, \`modal({title, html, wide})\`, \`preview(html, title)\`.

## Designer components

\`\`\`js
forge.designer.registerComponent('ui', {
  type: 'badge', label: 'Badge', icon: '🏷', category: 'My components', w: 90, h: 30,
  props: { text: 'NEW', bg: '#e5534b' },
  schema: [{ key: 'text', label: 'Text', type: 'text' }, { key: 'bg', label: 'Colour', type: 'color' }],
  html: (item) => \`<div style="background:\${item.props.bg};color:#fff;border-radius:99px;display:grid;place-items:center;width:100%;height:100%">\${item.props.text}</div>\`,
});
\`\`\`

## Themes

\`forge.themes.register({ id, name, type: 'dark', colors: { bg, bg2, bg3, border, text, muted, accent, accentFg } })\`

## Game objects and blocks

See [Custom game objects & blocks](doc:plugin-game).

## Documentation

\`forge.docs.register({ id: 'guide', title: 'Guide', markdown: '# Hello' })\`, and the \`@forge-docs\` block comment at the top of the file.

## Account and files

\`forge.account.current()\`, \`forge.fs.readFile(path)\`, \`forge.fs.writeFile(path, text)\`, \`forge.fs.root()\`.`);

  A('plugin-game', 'Plugins', 'Custom game objects & blocks', `# Custom game objects & blocks

## A new logic block

\`\`\`js
forge.game.registerBlock({
  id: 'double', label: 'Double', cat: 'plugins', desc: 'Doubles the number it receives.',
  inputs: ['in'], outputs: ['out'],
  params: [{ key: 'times', label: 'Times', type: 'number', def: 2 }],
  onInput(node, port, value, game) { game.send(node, 'out', (Number(value) || 0) * node.p.times); },
});
\`\`\`

- \`node.p\` – the block's settings, \`node.st\` – a scratch object for state, \`node.owner\` – the object it runs on, \`node.cleanups.push(fn)\` – undo listeners.
- Hooks: \`init(node, game)\`, \`onInput(node, port, value, game)\`, \`update(node, dt, game)\` (every frame) and \`destroy(node, game)\`.
- Parameter types: \`number\`, \`text\`, \`multiline\`, \`bool\`, \`select\` (with \`options\`), \`color\`, \`code\`, \`target\`, \`sound\`, \`sprite\`, \`key\`.
- **Functions must be self-contained** (no outside variables) because they are copied into exported games.

## A new object type

\`\`\`js
forge.game.registerObjectType({
  type: 'star', label: 'Star', icon: '⭐', dim: '2d', category: 'My objects', w: 48, h: 48,
  props: { points: 5 },
  schema: [{ key: 'points', label: 'Points', type: 'number', min: 3, max: 12 }],
  draw(ctx, o) { /* ctx is translated to the object's centre */ },
});
\`\`\`

For 3D: \`dim: '3d'\` and \`build(THREE, o)\` returning a \`THREE.Object3D\`.

Blocks and object types appear in the editor palettes as soon as the plugin is enabled.`);

  A('mobile', 'Making games', 'Mobile & device features', `# Mobile & device features

| Block | Browser | Phone / tablet |
|---|---|---|
| Shake | test key **H**, simulator button | accelerometer shake |
| Accelerometer | arrow keys | device tilt |
| Vibrate | brief screen shake | vibration motor |
| Touch Check | mouse | multi-touch |
| Ad | simulated house ad | your ad network via \`game.adProvider\` |
| Game Center | local + cloud leaderboards | \`window.VextraNative.gameCenter\` when wrapped |
| Device Check | detects mobile/tablet/OS/orientation | same |
| Exit Game | thanks screen | \`window.VextraNative.exit\` |

## Connecting a real ad network

\`\`\`js
game.adProvider = (kind, done) => { MyAds.show(kind).then((r) => done({ rewarded: r.completed })); };
\`\`\`

Set it from a *Custom Behavior* block or the exported HTML. Until then, ads are **simulated** so you can design the flow.`);

  A('uninstall', 'Reference', 'Uninstalling & cleaning', `# Uninstalling & cleaning

All from the project folder (where \`package.json\` is):

| Command | What it does |
|---|---|
| \`npm run clean\` (alias \`npm run autoclean\`) | Removes **build artefacts only**: \`node_modules\`, \`src-tauri/target\`, \`renderer/vendor\`, build output. No questions. Re-run \`npm install\` to restore. |
| \`npm run uninstall\` | Interactive: choose what to remove (build files, app data, installed app). |
| \`npm run uninstall:auto\` | Same as full uninstall with no prompts (use \`--dry-run\` first to see what would happen). |

Options: \`node scripts/uninstall.js --mode=clean|full --auto --dry-run --keep-data --toolchain\`.

- **App data** (your plugins, themes, settings, sign-in data) lives in the per-user data folder for \`studio.vextra.app\`. Your projects are **never** deleted.
- \`--toolchain\` additionally offers to remove Rust (\`rustup self uninstall\`). It is never done without an explicit flag and confirmation, because other projects may use Rust.

You can also clean app data from **Settings → About & maintenance**.`);
})();
