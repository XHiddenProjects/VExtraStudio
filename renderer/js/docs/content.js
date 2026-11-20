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

## Responsive on every device

Exported pages and previews adjust to the screen by themselves (**Canvas → Responsive layout**):

- **Auto** (default) scales the whole design to the width of the screen, and on phones (narrower than **Stack below**, 640 px by default) reflows it into **one column in reading order**.
- **Scale to the screen only** never stacks; **Fixed size** keeps the design at its exact pixel size.
- For each item, **On phones** chooses *Stack*, *Stack, full width* or *Hide on phones*.

## Building a site (pages, sections, devices)

The designer works like a website builder:
- **Pages** are the tabs above the canvas. **+ Page** adds one (the first time, your existing content becomes *home*; navbar and footer stay on every page). Double-click a tab to rename it, right-click or 🗑 to delete it. New items go on the page you are editing.
- **＋ Section** drops a ready-made block under your content: Hero, Features, Pricing, Testimonials, Call to action, Contact form or Footer.
- **🖥 ▭ 📱** switch between editing and a live **tablet / phone preview** of the exported page (you can click its links to try the pages).
- Click an element for its **toolbar**: duplicate, forward, backward, *on this page / on every page* (🌐 / 📌) and delete.
- **Site title** (nothing selected) is the browser-tab title.

## Links, anchors and pages (like a website builder)

- Give an item an **Anchor name** (Properties → Responsive & links), then link to it with \`#name\` from a Link, Button, Navbar, Tabs or Footer. Navbar, Tabs and Footer lists take \`Label|#name\`.
- Give items a **Show on page** name to build a multi-page site in one design: \`#about\` shows the items of the page *about* (items with no page show on every page). The first page you use is the home page.
- A \`#\` link **never leaves the site or reloads the app**: the page scrolls or switches, and the address bar keeps the \`#name\` (also in previews).

## Export

**Export HTML** writes a standalone page next to your design, and **Preview** opens it in a window. Use the exported HTML as a starting point in a website project. Hidden layers are not exported.

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
- **OBJ import** – bring in \`.obj\` meshes or \`.glb\` / \`.gltf\` models (colours, textures, normal and emissive maps, transparency – scaled to fit a unit cube). **.glb / .gltf keep their skeleton, skin, animation clips and morph targets, and Draco / Meshopt compressed files load too.** FBX, Collada (.dae), STL, PLY and 3MF are converted to .glb when you import them – see *3D models from other tools* below.

Then use the model in 3D scenes with the **Model** object type.

## Automatic updates
Settings → About shows when a new version exists; **Install and restart** downloads it, verifies its signature and installs it.
1. Run \`npm run updater:keygen\` once and commit \`src-tauri/updater/pubkey.txt\`.
2. Add the GitHub secrets \`TAURI_SIGNING_PRIVATE_KEY\` and \`TAURI_SIGNING_PRIVATE_KEY_PASSWORD\` (the command prints them).
3. Publish a release: the workflow signs the bundles and uploads \`latest.json\`.

Builds made before the key was added cannot update themselves; install one new build by hand. Linux updates work for the AppImage only.

## Windows SmartScreen ("Windows protected your PC")
SmartScreen warns about installers it has not seen often and that are not signed by a known publisher. No setting in the app can switch that off; what removes it is **code signing**, and a signed publisher then builds trust over time. The release workflow signs the Windows installers when you add one of these repository secrets (Settings → Secrets and variables → Actions):
- **Azure Artifact Signing** (formerly Trusted Signing): \`AZURE_TENANT_ID\`, \`AZURE_CLIENT_ID\`, \`AZURE_CLIENT_SECRET\`, \`AZURE_SIGNING_ENDPOINT\`, \`AZURE_SIGNING_ACCOUNT\`, \`AZURE_SIGNING_PROFILE\`.
- **A certificate file** (OV or EV, \`.pfx\`): \`WINDOWS_CERTIFICATE\` (the file as base64) and \`WINDOWS_CERTIFICATE_PASSWORD\`.

Without secrets the installers are built unsigned and the log says so. Until you sign: users can press *More info → Run anyway*, and you can send the installer to Microsoft at https://www.microsoft.com/wdsi/filesubmission to be checked. Keep one file name and download from the same GitHub release page every time.

## Uninstalling Vextra Studio

| Installer | How to uninstall | Delete my data? |
|---|---|---|
| Windows **.exe** (setup) | Windows Settings → Apps → Vextra Studio → Uninstall | A **“Delete the application data”** box in the uninstaller |
| Windows **.msi** | Windows Settings → Apps → Vextra Studio → Uninstall (or run the .msi again → Remove) | A **Yes / No question** appears. Silent uninstall keeps the data unless you add \`REMOVEUSERDATA=1\`: \`msiexec /x Vextra.msi REMOVEUSERDATA=1 /qn\`. Upgrades never delete anything. |
| macOS **.dmg** | Drag *Vextra Studio* from Applications to the Bin | Settings → *Uninstall Vextra* → **Delete everything & prepare to uninstall** first |
| Linux **.deb** | \`sudo apt remove vextra-studio\` | The same Settings button first |
| Linux **AppImage** | Delete the file | The same Settings button first |

**Settings → Uninstall Vextra** removes everything Vextra keeps: settings, sign-in data, plugins, themes, local server data and the app's own browser storage. Your project folders are never touched. Leftover folders, if you uninstalled first: Windows \`%APPDATA%\\studio.vextra.app\` and \`%LOCALAPPDATA%\\studio.vextra.app\`, macOS \`~/Library/Application Support/studio.vextra.app\` and \`~/Library/WebKit/studio.vextra.app\`, Linux \`~/.local/share/studio.vextra.app\`.

## Exporting VR and AR games to stores

Open the game and press **📦 Store export** (enable the *Store Export* plugin). It detects VR and AR blocks and offers matching packages:

| Target | What you get for a VR / AR game |
|---|---|
| **Meta Quest – Meta Horizon Store** | \`meta/\`: the game as an installable web app, a Bubblewrap Quest project, placeholder store artwork (square, landscape, portrait, icon) and \`README-META.md\` with the Horizon Developer Dashboard steps (release channel, data use checkup, age and VR comfort ratings). Host \`meta/www\` on https first (🌐 Publish works). |
| **Android VR / AR (WebXR)** | \`xr/\`: the same kind of package for **Android phones with ARCore** (real AR surface tracking). Follow \`README-XR.md\`. |
| **Google Play / App Store** | A phone web view has no WebXR, so VR runs as phone VR (gyroscope, side-by-side view) and AR shows the camera. The project gets the camera, gyroscope and ARCore entries (Android) and the camera / motion texts (iOS). |
| **Steam** | Electron has no WebXR, so the game opens in the player's own Edge or Chrome (full screen, SteamVR / OpenXR). Without a browser it opens as a normal window. Set *VR Support* on the Steamworks page. |

Choose *VR / AR* in the form to override the detection. A plain **⬇ Export HTML** of a VR / AR game works too, but WebXR only runs on **https** (or localhost).

## Live link with Blender

The Blender add-on (v1.1) can talk to Vextra directly, so you never export and import by hand:

1. In Blender install \`tools/blender-addon/vextra_tools.py\`, press **N** over the 3D view → **Vextra** tab → **Start link**. The panel shows a *key*.
2. In Vextra open *Assets → 3D Models → 🟠 Blender*, paste the key and press **Connect**.
3. **From Blender into the game:** pick *Selected objects*, *The whole scene* or a *Collection* and press **Pull model**. Skeletons, animations and materials come along (rigs of selected meshes are included automatically).
4. **Linked models:** a pulled model stays linked. With **Auto-sync** on, every change you make in Blender (shape, material, pose, animation) shows up in the game a moment after you stop editing. *Update now* does it by hand; *Unlink* cuts the link.
5. **From the game into Blender:** choose any model and press **Send to Blender**. It appears in a collection called *Vextra: name*. glb/gltf models stay linked, so what you edit there flows back; voxel, shape-group and OBJ models arrive as a copy.

Right-click a model card for *Send to Blender*, *Update from Blender* and *Unlink*. Auto-sync waits while you are in Edit Mode or playing an animation in Blender, then continues.

The link runs only on this computer (127.0.0.1, port 7788 – change it in the add-on preferences) and every request must carry the key, so nothing else can read or change your Blender scene. It is off until you press *Start link* (or tick *Start the link when Blender starts* in the add-on preferences).

## 3D models from other tools

Vextra's model format is **glTF (.glb)** – the "JPEG of 3D" that every tool exports. Import with *Assets → Models → Import*:

| Tool / source | How to get a model in |
|---|---|
| **Blender** | Install the add-on in \`tools/blender-addon/vextra_tools.py\` (Preferences → Add-ons → Install). Then *File → Export → Vextra game model* (or the *Vextra* tab in the 3D view sidebar): skeletons, animations and shape keys are kept, Draco compression is on by default, and *Check game budget* counts triangles, bones and textures first. Without the add-on use *File → Export → glTF 2.0 (.glb)*. For a **live two-way link** see *Live link with Blender* below. |
| **Maya, 3ds Max, Cinema 4D, Unity, Unreal** | Export **FBX** (embed media for textures) or glTF and import it. FBX is converted to .glb automatically. |
| **Mixamo** | Download the character as **FBX (.fbx)** with skin, and animations as FBX too; import – bones and clips are kept. Use the *Model Animation* block to play them. |
| **Sketchfab, Poly Pizza, Kenney, Quaternius** | Download the **glTF / GLB** version. |
| **CAD / 3D printing (Fusion, Onshape, Tinkercad)** | Export **STL** or **3MF**; imported as a plain-colour mesh. |
| **Scans, MagicaVoxel exporters** | **PLY** (with vertex colours) or OBJ. |
| **Collada (.dae)** | Imported and converted to .glb. |

Notes: textures must be **embedded** in the file (GLB, or FBX/DAE exported with embedded media) – texture files left next to the original are dropped and the material keeps its colour. Y is up in Vextra; CAD formats (STL / 3MF) are often Z-up, so rotate the Model object 90° if it lies on its back.

### Playing animations
Add a **Model Animation** block next to your Model object. Leave *Clip* empty for the first one or type a clip name; \`clips\` tells you what the file contains, \`started\` / \`finished\` send the clip name, and *Blend time* cross-fades from the previous clip. The Assets preview already plays the first clip.

### Making files smaller
Large models make big project and export files. Compress them once:
\`\`\`
node tools/model-optimize/optimize.js hero.glb hero-small.glb --compress meshopt --texture-size 1024 --webp
\`\`\`
(or \`--compress draco\`). Both compressed forms load in the editor and in exported games; the 300 KB Draco decoder is embedded in an export only when a model needs it.

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

A plugin is a single \`.js\` file that receives a \`vx\` object. Plugins can:

| Add | How |
|---|---|
| Commands in the palette | \`vx.commands.register\` |
| Toolbar buttons, status bar items | \`vx.toolbar.add\`, \`vx.statusBar.add\` |
| Side panels | \`vx.panels.register\` |
| UI-designer components | \`vx.designer.registerComponent('ui', …)\` |
| Themes | \`vx.themes.register\` |
| **Game object types** (2D & 3D) | \`vx.game.registerObjectType\` |
| **Logic blocks** | \`vx.game.registerBlock\` |
| **Their own documentation** | \`/** @vx-docs … */\` comment or \`vx.docs.register\` |

## Install and write plugins

- **Plugins** panel → **+** creates a plugin from a template and opens it. Save to hot-reload.
- **Import** loads a \`.js\` file; **Open plugins folder** shows where they live.
- Disable a plugin with its switch – everything it added is removed cleanly.

## Plugin documentation

The comment tags are \`@vx-plugin\` and \`@vx-docs\`. Older plugins that still use \`@forge-plugin\` / \`@forge-docs\` keep working, but new plugins should use the \`@vx-\` tags.

Every plugin gets a page under **Docs → Plugins**. It combines the text you wrote in the \`@vx-docs\` comment, any pages from \`vx.docs.register\`, and an **automatic list of everything the plugin adds** (commands, components, blocks, panels…). Click **Docs** on a plugin card to open it.

\`\`\`js
/** @vx-plugin {"id":"my-plugin","name":"My Plugin","version":"1.0.0","description":"Does cool things"} */
/** @vx-docs
 * ## Using My Plugin
 * Run **My Plugin: Hello** from the command palette.
 */
vx.commands.register({ id: 'hello', title: 'My Plugin: Hello', run: () => vx.ui.toast('Hi!') });
\`\`\``);

  A('plugin-api', 'Plugins', 'Plugin API reference', `# Plugin API reference

Plugins run with a single argument, \`vx\` (older plugins that use \`forge\` keep working: it is an alias).

## Basics

| API | Description |
|---|---|
| \`vx.id\`, \`vx.version\` | Your plugin id and the host API version |
| \`vx.log(...)\` | Console log with your plugin's name |
| \`vx.on(event, cb)\` | Host events: \`editorChange\`, \`save\`, \`tabChange\`, \`registry\` |
| \`vx.settings.get(key, default)\` / \`.set(key, value)\` | Persistent per-plugin settings |

## Commands, toolbar, status bar, panels

\`\`\`js
vx.commands.register({ id: 'shout', title: 'Shout selection', run() { vx.editor.replaceSelection(vx.editor.getSelection().toUpperCase()); } });
vx.toolbar.add({ id: 'btn', label: 'Shout', run: () => vx.commands.run('my-plugin.shout'), when: (lang) => lang === 'html' });
const item = vx.statusBar.add({ id: 's', text: 'ready', align: 'right', onClick() {} });  item.update('busy');
vx.panels.register({ id: 'p', title: 'My panel', icon: 'plugin', render(container) { container.textContent = 'Hello'; } });
\`\`\`

## Editor

\`vx.editor\`: \`getValue()\`, \`setValue(text)\`, \`getSelection()\`, \`replaceSelection(text)\`, \`insertText(text)\`, \`getLanguage()\`, \`getPath()\`, \`onChange(cb)\`, \`onSave(cb)\`, \`onTabChange(cb)\`, \`openFile(path)\`, \`newFile(name, content, lang)\`.

## UI helpers

\`vx.ui\`: \`toast(msg, kind)\`, \`prompt(msg, default)\`, \`confirm(msg, okLabel)\`, \`form({title, fields})\`, \`modal({title, html, wide})\`, \`preview(html, title)\`.

## Designer components

\`\`\`js
vx.designer.registerComponent('ui', {
  type: 'badge', label: 'Badge', icon: '🏷', category: 'My components', w: 90, h: 30,
  props: { text: 'NEW', bg: '#e5534b' },
  schema: [{ key: 'text', label: 'Text', type: 'text' }, { key: 'bg', label: 'Colour', type: 'color' }],
  html: (item) => \`<div style="background:\${item.props.bg};color:#fff;border-radius:99px;display:grid;place-items:center;width:100%;height:100%">\${item.props.text}</div>\`,
});
\`\`\`

## Themes

\`vx.themes.register({ id, name, type: 'dark', colors: { bg, bg2, bg3, border, text, muted, accent, accentFg } })\`

## Game objects and blocks

See [Custom game objects & blocks](doc:plugin-game).

## Documentation

\`vx.docs.register({ id: 'guide', title: 'Guide', markdown: '# Hello' })\`, and the \`@vx-docs\` block comment at the top of the file.

## Account and files

\`vx.account.current()\`, \`vx.fs.readFile(path)\`, \`vx.fs.writeFile(path, text)\`, \`vx.fs.root()\`.`);

  A('plugin-game', 'Plugins', 'Custom game objects & blocks', `# Custom game objects & blocks

## A new logic block

\`\`\`js
vx.game.registerBlock({
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
- **Demo video:** add \`demo: { video: 'https://example.com/clip.webm', caption: 'What it shows' }\` (an \`https://\` or relative \`.webm\` / \`.mp4\` link). The clip appears in the block's documentation and on your plugin's page, which now lists all its blocks. The built-in **Block Extras** plugin (15 blocks) is a good source of examples.

## A new object type

\`\`\`js
vx.game.registerObjectType({
  type: 'star', label: 'Star', icon: '⭐', dim: '2d', category: 'My objects', w: 48, h: 48,
  props: { points: 5 },
  schema: [{ key: 'points', label: 'Points', type: 'number', min: 3, max: 12 }],
  draw(ctx, o) { /* ctx is translated to the object's centre */ },
});
\`\`\`

For 3D: \`dim: '3d'\` and \`build(THREE, o)\` returning a \`THREE.Object3D\`.

Blocks and object types appear in the editor palettes as soon as the plugin is enabled.`);

  A('library', 'Share & publish', 'Library: templates & games', `# Library

Open the **Library** (books icon in the left bar, or the Welcome page). It lists website templates and 2D/3D games you can install in one click.

- **Defaults** ship with the app.
- **Install from a URL**: paste an \`https://\` link to a \`.zip\`, a single \`.vxgame\` file, a GitHub repository (the main or master branch is downloaded), or an \`index.json\` catalog (\`{"name":"…","items":[{"name":"…","desc":"…","type":"website|game2d|game3d","url":"…"}]}\`).
- You always see what will be installed and confirm first. File paths are sanitised and downloads are capped at 50 MB.
- Websites are extracted into a new folder you choose; games open in a new tab.

Only install things from people you trust: a website template can contain scripts.`);

  A('anim', 'Making games', 'Animation, materials & shaders', `# Animation, materials & shaders

## The Animation block (one block for everything)
There is a single **Animation** block. Pick its **Target** and the **Animation** list fills itself with what that object can play – its sprite animations, its 3D model poses and the project's keyframe clips – so there is nothing to type or guess.
- **Play animation** – plays the chosen one. A held key fires every frame, so a running animation is *not* restarted unless **Restart if already playing** is on. *When it ends*: animation default, loop, once or ping-pong. Speed and fps can be changed. The **done** output fires when it ends.
- **Auto (idle / walk / jump from movement)** – needs no wires. It watches how the target moves and plays idle, walk, jump or fall, turning it to face the way it moves (2D flip, 3D turn). Leave the four name boxes empty and it finds animations called idle/walk/jump/fall (or similar) by itself. Output **state** reports what it chose.
- **Pause / Resume / Stop**, **Show a specific frame**, and **Effect preset** (bounce, pulse, shake, spin, fade, wobble, jelly…).
Old projects that used the separate *Animation clip* and *Movement Animator* blocks are converted automatically.

## Sprite animation studio
In the Sprite editor press **🎞 Animate**. Make a named animation (idle, walk…), click pictures in the **frame bin** to add them to the timeline, drag cards to reorder, use **− / +** to hold a frame longer, and set **fps** and **When it ends** (loop, once, ping-pong). The preview starts paused; press Play or Space. In the **Animation** block use *Play* with the animation's name.

## Model animation studio
In the Model editor press **🎞 Animate**. Add an animation, then add tracks for the whole model or any part (move, rotate, scale), double-click a lane to add keys, and press Play for a live 3D preview. Play it with the Animation block (*Play*, name = the animation's name).

## Lights
**3D**: add a 💡 Light (point, directional, spot, ambient, hemisphere). Lights need something to shine on; lower the scene's *Ambient* to see them clearly. The editor draws a reach sphere (point) or an aim line (directional/spot). **2D**: add a 💡 Light, then raise **Darkness** in the Scene settings; each light cuts a soft glow (circle or cone) out of the dark.

## Animation clips
**Assets → Animations** holds keyframe clips. Each clip has a duration, a loop mode (once, loop, ping-pong), optional *relative* values and tracks for properties such as x, y, z, rotation, scale, opacity and colour. Click on a track to add keys, pick an easing per key, and press Play to preview. Run a clip with the **Animation** block (pick it from the Animation list). Works for 2D and 3D objects.

## Material files
**Assets → Materials** creates reusable materials (colour, pattern, texture, bump, metalness, roughness, emissive, opacity, wireframe, flat shading, double-sided, repeat). Assign one to a 3D object (**Material file** in the inspector), to a whole model or to a single model part in the Model editor. Import \`.vxmat\` (JSON) or \`.mtl\` files.

## Shaders
The **Shader** block applies a screen effect from a list (Bloom, Blur, Glitch, Pixelize, Retro TV, Wavy and more). Choose a **Mode**: Everything, Background, Game Layer, UI Layer, Labels Only, or This object only. Hover an option in the block settings to read what it does.

**Custom shaders**: **Assets → Shaders → Import** loads a \`.frag\`/\`.glsl\` file (or create one from the template). Write a \`main()\` that sets \`gl_FragColor\` (or just a main body); \`uTex, uRes, vUv, uTime, uAmount, uSize, uA, uB\` are provided – the template lists them all. Your shader appears in the same list.

## Behaviour blocks that talk to themselves
A block's output can now be wired back to its own input; the signal arrives on the next frame, so loops are safe.

## Other block updates
- **Switch**: inputs *off, on, in*, output *out*, property *current state*. **Toggle switch**: inputs *next, in*, outputs *out1, out2*, properties *loop, current state*.
- **Number**: rounding property (none, round, round down, round up).
- **Collision**: outputs *side* and a *side* filter (top, bottom, left, right, front, back…).
- **Cursor**: the *none* shape hides the system cursor completely.
- Block settings panels can be resized horizontally by dragging their edge.`);

  A('layers', 'Making games', 'Layers & UI layout', `# Layers and UI layout

**Layers.** Each object lives on one of three layers (Inspector → Appearance → Layer): **Background** (drawn first), **World** (the normal game world) and **UI** (screen-space: positioned in screen pixels, always on top, ignores the camera). Use the layer bar above the viewport to choose where new objects go, and the eye / lock buttons to hide or lock a whole layer while you edit (this only affects the editor).

**Where am I?** The bottom-left corner of the viewport shows the cursor position (2D: world X, Y; 3D: ground X, Z) and the selected object's position and size.

**Edit UI layout.** Press **Edit UI layout** to see the game screen with every Label and Bar block of the scene. Drag one to move it, or click it and set the *Anchor* and exact *X / Y* in the bar at the top. Snap is 4 px (hold Alt to move freely); **Reset** returns to the block's own values. The layout is saved with the scene and also works for blocks created by code behaviours.

**Behaviours instead of object scripts.** Logic now lives in behaviours (Logic tab). Older projects with scripts inside objects are converted automatically.`);

  A('examples', 'Making games', 'Example games', `# Example games

Library → Games lists ten ready-made games. Open one, press **Play**, then change anything – they are ordinary projects built entirely from **blocks**: open the Logic tab to read the wired graphs (rules and HUD in the scene behaviour, one behaviour per kind of object) and rewire them. Lists, timers, messages, sensors, Hearing, Ray Cast and Expressions do the work – there is no hand-written code.

**2D:** Neon Breakout (bricks, power-ups), Drone Swarm (top-down wave shooter), Sling Smash (physics puzzle), Hopper (platformer), Echo Pads (memory / rhythm).

**VR / AR:** VR Toy Toss (grab and throw), VR Orb Garden (look at orbs – works with a cardboard viewer), AR Garden (tap to plant, pinch to resize) and AR Tape Measure. They use floating **3D Text** for the score, because the screen HUD is not visible inside a headset.\n\n**3D:** Echo Maze (first person; the Stalker hears your footsteps and your real voice), Sky Parkour (kinematic moving platforms, crumbling tiles that come back when you respawn, checkpoints), Hyper-Real Showroom (Realism look, keys 1-3 change the light with the **Light** block), Core Defender (arena defence, mouse aim) and Marble Lanes (bowling physics).

**Voice Command in the desktop app:** its web engine has no speech recognition, so open **Settings → Voice commands (games)**. Pick a **Local model** (a Whisper server on your own computer – whisper.cpp, Speaches / faster-whisper-server, LocalAI, LM Studio; the address must be localhost, nothing leaves your PC) or a **Cloud service** (OpenAI, Groq, Mistral or any https OpenAI-style transcription URL + key), exactly like choosing a provider in the AI plugin. *How to listen* decides what is used (Automatic tries the engine, then your local model, then the cloud service); the Voice Command block's **Recognise with** setting can override it. These services work while testing inside Vextra; exported games played in Chrome, Edge or Safari use the browser's own recognition (a key is never written into an exported game).

**Kinematic bodies:** tick *Kinematic gravity* in the Physics inspector (or the Physics block) to let a kinematic body fall; it still pushes dynamic bodies and is not pushed back.`);

  A('loading-page', 'Share & publish', 'Loading page & credit', `# Loading page & credit

The page is always shown for **at least 1.5 seconds**; a shorter (or empty) *Show for at least* value is raised to 1.5 s. Preview does not wait.

Every game starts with a **loading page**: the title, a progress bar and the line “Made with Vextra Studio · © <year> XHiddenProjects”. It is part of exported games, published games and Play.

Open a game and press **⏳ Loading page** in the toolbar to customize it:

| Setting | What it does |
|---|---|
| Title / Subtitle | Text shown (the title defaults to the game title) |
| Progress style | Bar (with percentage), spinner or bouncing dots |
| Background / Text / Accent | Colours (the background defaults to the game background) |
| Logo | One of the game's sprites |
| Tips | One per line, shown in turn while loading |
| Show for at least | Seconds the page stays up (0 – 10) so players can read it |
| Credit line position | Top or bottom – the credit can be moved but not removed |

The bar fills as the runtime starts and every sprite picture is decoded; the game starts when it is full. In Play the minimum time is skipped so testing stays quick.

**Websites and UI designs:** Export website adds a footer “Made with Vextra Studio · © <year> XHiddenProjects” to every page (or only the home page); pick its alignment and style in the export dialog. Exported UI designs carry the same footer.`);

  A('touch-controls', 'Games', 'Phones & tablets (touch controls)', `# Phones & tablets\n\nMobile support is part of the **game engine**: three blocks in the **GUI** group, placed in the **UI layer** like a Label or Bar.\n\n- **Joystick** – a stick that presses the keys you choose (default W A S D / arrows). Settings: size, knob size, colours, opacity, dead zone, invert Y, base / knob **sprites**, anchor + offset, *Always show* (otherwise only on touch screens).\n- **Touch Button** – a round / rounded / square button that presses a key (space, shift, M …). Label, colours, size, sprite, anchor.\n- **Touch Look** – look around in first-person games. Mode **Drag** (swipe the screen), **Stick** (a second stick – easiest with an emulator or one finger) or **Both**; area (whole screen / right / left half) and sensitivity (default 3.5). It feeds the *Locked Mouse* → *Camera (look)* chain, so no extra wiring.\n\n**Place and move them:** Game toolbar → **Edit UI layout**. They appear as Joystick / Touch button items; drag them, or focus one and use the **arrow keys** (Shift = 10 px, Delete = back to the block's own position).\n\n**Ready-made:** every example game already has them. Games with no touch blocks still get a simple automatic overlay as a fallback.\n\n**Game settings → On-screen touch controls:** Automatic (touch screens only), Always (try it on a computer) or Never. Exported websites and Store Export apps (Android / iOS) use the same blocks.`);
  A('language-access', 'Getting started', 'Languages & accessibility', `# Languages & accessibility

## Language
**Settings → Interface → Language**: Español, Français, Deutsch, Português, Italiano, 日本語, 简体中文, 한국어, Русский and العربية (right-to-left layout), or *Automatic* to follow your system. The core interface (menus, Settings, Welcome, file actions) is translated; text without a translation stays in English. Plugins can add a language:

\`\`\`js
VX.i18n.register('nl', { name: 'Nederlands', dir: 'ltr', strings: { 'Settings': 'Instellingen', 'Save': 'Opslaan' } });
\`\`\`

The keys are the English texts. Choose the language in Settings afterwards.

## Accessibility
- **Screen readers:** landmarks, dialogs (focus moves in, Tab stays inside, Esc closes, focus goes back), names for icon buttons, and a live announcer for toasts, tab changes and selections.
- **Keyboard:** *Skip to the editor* link, visible focus outline (optional extra-thick), Enter / Space on tabs and tiles. In the **block graph**: \`[\` and \`]\` step through the blocks, **arrow keys** move the selected blocks (Shift = bigger steps), Enter opens a bundle. In the **UI designer**: arrows nudge the selection (Shift = 10 px).
- **Reduce motion:** Settings → Accessibility (System / Always / Never). Animations stop and the Camera *shake* is skipped in games – also in exported games when the player's system asks for reduced motion.
- **High contrast:** themes *High Contrast Dark* and *High Contrast Light*, plus **Interface zoom** (70–200%).

See \`ACCESSIBILITY.md\` for what is still missing and how to make your own games accessible.`);

  A('store-export', 'Share & publish', 'Store Export', `# Store Export (plugin)

Open a game and press **📦 Store export**. Pick your targets and details, then **Create packages**. With *Install, assign and build automatically* ticked (desktop app) Vextra runs the npm steps for you and shows a **progress bar** with a live log and a Cancel button:

1. Steam: \`npm install\` → \`npm run build:<your OS>\`
2. Mobile: \`npm install\` → \`npx cap add android\` (and iOS on a Mac) → \`npm run assets\` → \`npm run patch\` → \`npx cap sync\` → \`npm run build:android\` (debug APK)

Android builds need no setup questions: Vextra **uses what Android Studio already has** (its Java and its SDK, including newer platforms such as Android 17) and only installs what is missing. The Gradle wrapper is pointed at the **latest Gradle** (services.gradle.org), and if a build fails because the **Android Gradle plugin** is too old, it is updated to the newest stable release automatically (or on demand with \`npm run update:agp\`; the old one is restored if the new one does not help) and the release build uses the optimised ProGuard file. Everything an Android build needs that you do not already have is **installed for you, from scratch** – It downloads **Java 27** and the **latest Gradle** into \`~/.vextra/toolchain\`. For the **Android SDK** it first looks for a complete one already on the computer (Android Studio's, or \`ANDROID_HOME\`): if there is one it is used as it is and never changed or deleted, so nothing is downloaded. Only when none exists is the newest SDK (platform, build-tools, licences) installed in the same folder, checks them again before every export and, when a newer version exists, **deletes the old one** and installs the new one so storage does not pile up. If a download fails it keeps working with what is already installed, and nothing in this step stops the export with an error. The build creates \`mobile/dist/<name>-debug.apk\`; if the newest Java does not suit the project it retries by itself with Java 21 and the project's own Gradle. The \`mobile/android\` folder is portable: open it in **Android Studio** on any computer (File → Open), or copy the folder to a **Mac**, run \`npm install\` + \`npm run sync\` and open Android Studio or Xcode (\`npx cap open ios\`).

Steam install/build steps are required; the Android steps are skipped with a plain explanation if Java, Gradle or the SDK could not be set up (for example offline), and the project files are still written.

## Building Vextra itself
\`npm run build:win\`, \`npm run build:linux\`, \`npm run build:mac\` (each builds installers for that OS; build on the target OS).`);

  A('shield', 'Share & publish', 'Security & Vextra Shield', `# Security & Vextra Shield

The built-in **Vextra Shield** plugin adds protection for games, accounts and publishing. Open **Plugins → Vextra Shield → ⚙ Configure** to choose what is on.

- **Exported games** get a strict Content-Security-Policy (only the game's own scripts, pinned by hash), a no-referrer policy and optional right-click/embedding blocks. The editor's *Play* preview is never restricted.
- **Saves** are signed: a save changed outside the game is ignored.
- **Accounts**: password policy, sign-in lockout after repeated failures, idle sign-out, and a warning before a password goes over \`http://\`.
- **Publishing**: files are scanned for API keys, tokens and private keys (and \`.env\`-style files) before upload.
- **Shield: Audit project** (Command Palette) reviews your folder and game for risky patterns and can save \`SECURITY-AUDIT.md\`.

**Account security**: with Shield on, *Your account* shows a security section: authenticator-app two-step sign-in (type the setup key into Google Authenticator, Aegis, 1Password…), recovery codes, and security keys/passkeys. After turning it on, sign-in asks for the code (or key) after the password.

Limits: code running on a player's computer can always be changed by a determined player, so verify scores and purchases on a server you control.

## Dependency scripts
\`package.json\` already allows the \`esbuild\` install script for pnpm (\`pnpm.onlyBuiltDependencies\`), Bun (\`trustedDependencies\`) and Yarn (\`dependenciesMeta\`). No other dependency is allowed to run install scripts.`);

  A('ai', 'Plugins', 'Vextra AI', `# Vextra AI

Open the **AI** panel (sidebar) and chat with the model you choose in **Plugins → Vextra AI → ⚙ Configure**: Claude, OpenAI, Gemini, Groq, OpenRouter, Ollama, LM Studio or any OpenAI-compatible server (Mistral, DeepSeek, xAI, Together…). Local models need no key. A bar under the chat shows how much of the model's context window is used; if the AI cannot be reached it says it timed out and offers Reconnect (internet providers wait for the connection, then reconnect after a 3-second countdown) or Retry (local). After a time-out a banner shows when you can send the next request. Stopped or interrupted runs leave a checkpoint with a Continue button. Permissions: read project, edit open file, create & edit other files, build & change site (web files, new_site, preview_site), delete / move, build & change game.

Each ability has its own **Deny / Ask / Allow**: *Read project*, *Edit open file*, *Write files*, *Change game*. The panel has presets – **Chat only**, **Assist** (asks before changing anything), **Agent** (changes without asking, asks before deleting) and **Builder** (everything allowed, up to 30 steps).

**Build things by asking**: *“Build me a 2D platformer with coins and enemies”* or *“Create a portfolio website”*. The AI plans, opens a game, adds scenes, objects, sprites and ready-made assets, writes block logic, attaches it, checks the result and fixes problems – each game change is one undo step. For websites it creates, edits, moves and deletes files and folders in your open folder. Secret-looking files (\`.env\`, keys) are never read. Everything you send and everything the AI reads goes to the provider you picked.

## It tests its own work
After it changes a game the AI **plays it** in a hidden, sandboxed window: it presses keys, clicks, reads runtime errors, checks which objects moved and takes **screenshots** (shown in the chat with a 🎬 caption). Then it fixes what it found. Ask for it too: *“play-test it and make sure the player can jump”*. For websites it renders the page at a width you choose (390 = phone) and reports script errors, broken images and sideways overflow. Control it with the **Play-test & take screenshots** permission and *Play-test automatically…* in ⚙ Configure. Pictures need a model that can **see** (Claude, GPT-4o, Gemini, llava, qwen-vl…); a text-only model gets the written report instead and the AI tells you so.

## Attach files
Press **📎**, drag files into the panel or paste a picture. Up to 8 files per message: **pictures** and **four frames of a video** are shown to the AI, **text and code files** are read, **audio** and other files are described. The AI can save a file into your folder, turn a picture into a **sprite** and an audio file into a **sound** in your game. Files stay in memory for the session and are sent only to the provider you chose.

## It does not get stuck
Repeating an action that already gave the same answer returns “nothing changed” at once. If the AI repeats a step, or several steps in a row change nothing, it is told to change its approach; if it still repeats it **stops** and waits. **▶ Continue** then starts a different approach.

## Token limit and cooldown
Set **Token limit per hour** in ⚙ Configure. The meter under the chat counts every request. If the next request would pass the limit, the AI stops at once, asks the model for a short hand-over note, saves it as the **checkpoint** and locks for one hour. After the hour the count starts again and **▶ Continue** picks up from the checkpoint. Providers do not stream through Vextra, so the meter updates when a request goes out and when the answer arrives.

## Status icon
The bot icon in the sidebar changes colour: working, done, paused (limit or Stop) and error.

## Empty answers
If a model returns nothing the AI retries with a nudge, then with the optional **Fallback model**, then saves a checkpoint instead of hanging.

## Settings follow the model
Temperature, max output and context window are filled in for the chosen provider and model; settings the model cannot change are greyed out.

## Replies, layers and design tools
Replies are shown as Markdown; raw action JSON is never shown. The AI knows the three layers (background, world, UI) and places HUD items on the UI layer. It can open the Sprite, Sound, 3D and Material editors, and drive **Blender** through the Vextra Blender add-on (other desktop apps are not controlled; save files to the project folder instead). Play-tests can run in a visible window with a Stop button (setting **Show play-tests**).

For plugin authors: \`vx.game.playtest(steps, opts)\`, \`vx.game.screenshotPage(html, opts)\` and \`vx.panels.setState(panelId, 'working'|'done'|'paused'|'error')\`.`);

  A('plugin-hooks', 'Plugins', 'Plugin hooks & settings button', `# Plugin hooks and the Configure button

## Configure button
\`\`\`js
vx.config.register({
  title: 'My plugin – settings',
  fields: [{ key: 'greeting', label: 'Greeting', value: 'Hello' }, { key: 'loud', label: 'Shout', type: 'checkbox' }],
  // optional: validate(values) → error text, load() → values, save(values)
});
const greeting = vx.settings.get('greeting', 'Hello');
\`\`\`
The plugin card shows **⚙ Configure** while the plugin is enabled. Without \`load/save\` the values are kept with \`vx.settings\`. \`vx.config.open()\` opens it from code.

## Hooks
\`vx.hooks.on(name, fn)\`:

| Hook | What you get | What you can do |
|---|---|---|
| \`game.export.html\` | \`(html, {play, publish, project})\` | return a changed HTML string |
| \`account.register\`, \`account.password\` | \`{username, password, server}\` | \`throw vx.hooks.block('why')\` to stop it |
| \`account.login\` | \`{username, server}\` | throw \`vx.hooks.block\` (e.g. lockout) |
| \`account.loginOk\`, \`account.loginFailed\` | \`{username, error, status}\` | notification only |
| \`publish.before\` | \`{slug, kind, title, files}\` | throw \`vx.hooks.block\` to cancel |

Also: \`vx.onUnload(fn)\`, \`vx.fs.list()\`, \`vx.account.signOut()\`.`);

  A('sensors', 'Making games', 'Microphone, Camera, VR & AR blocks', `# Microphone, Camera, VR & AR blocks

These four block groups (shown in **Advanced** mode) let a game use the player's voice, camera and headset. The browser asks for permission the first time. Every block has a **desktop test fallback**, so you can design without a microphone, camera or headset.

**Permissions:** in the editor's Play panel the editor itself opens the microphone / camera (the game frame is sandboxed) – answer the permission prompt once, and on Windows / macOS make sure the system privacy setting for the microphone / camera is on for desktop apps. If a block cannot start, its **error** exit and the game log say exactly why. Voice Command also needs a speech-recognition service (Chrome, Edge, Safari); where the engine has none, use the *say* entry or test keys.

## Microphone
| Block | What it does |
|---|---|
| **Microphone** | Loudness 0–100, pitch (Hz) and low / mid / high sound every frame, plus "loud" and "quiet". Test key **M**. |
| **Voice Command** | Type commands one per line – each becomes its own exit ("jump", "fire"). Uses the browser's speech recognition. Use the *say* entry to test with text. |
| **Sound Detector** | Clap, double clap, whistle, shout, loud and silence. Test keys **C**, **B**, **V**. |
| **Voice Noise** | Turns your voice into **noise at an object** – the louder, the further it carries. Hold the quiet key (Shift) to sneak. |
| **Make Noise** | Noise from a door, bottle or explosion – or footsteps while an object moves. |
| **Hearing** | Gives an enemy ears: it hears noises in range, remembers where they came from and **walks to them**. Exits: heard, x / y / z, arrived, lost. |

**Enemy that tracks the player by voice:** put *Microphone-based* **Voice Noise** on the player (source = self) and a **Hearing** block on the enemy (walk towards the sound = on). Shouting makes the enemy come; whispering (or holding Shift) hides you.

## Camera
| Block | What it does |
|---|---|
| **Camera Feed** | Switches the camera on and shows it small, over the game, or behind a 3D scene. |
| **Motion Sensor** | How much moves (0–100), where, "moved" / "still", swipes (wave left / right / up / down) and a 3×3 "zones" grid. Nothing is recorded or uploaded. Test key **N**. |
| **Color Tracker** | Follows a colour (a ball, a glove) – can move an object for you. |
| **Light Sensor** | Brightness 0–100, "dark" / "bright" – cover the lens to hide. Test key **L**. |
| **Face Tracker** | Face position and size (browsers with the built-in FaceDetector). |
| **Photo** | Takes a picture into a variable (data URL), optionally downloads it. |

## VR (3D games)
**VR Mode** enters real VR on a WebXR headset (Quest, SteamVR…) and otherwise shows a **split-screen cardboard view** steered with the mouse / arrow keys (or by turning your phone). Browsers only start VR from a click, so the block shows an **Enter VR** button.
| Block | What it does |
|---|---|
| **VR Head** | Head position, yaw / pitch / roll, nod and head-shake detection, keep an object on the head. |
| **VR Controller** | Trigger, grip, A / B, thumbstick, position; attach an object; pointer ray over targets. Desktop: mouse = right hand (click = trigger, **E** grip, **Q** / **F** = A / B, **W A S D** stick). |
| **VR Move** | Smooth walking, snap turn or teleport. |
| **VR Grab** | Grab, hold and throw objects (tag them *grab*). |
| **VR Haptics** | Controller vibration. |
| **VR Gaze** | Select by looking at an object for a moment. |

## AR (3D games)
**AR Mode** uses real surface tracking on AR phones / headsets (WebXR) and otherwise shows the **camera behind your 3D scene**, steered by tilting the phone. Button: **Start AR**.
| Block | What it does |
|---|---|
| **AR Surface** | Finds the floor / table, shows a placement ring, sends x / y / z. |
| **AR Place** | Tap to move or spawn an object on that spot. |
| **AR Pinch & Turn** | Pinch to scale, Shift + wheel to turn (desktop). |
| **AR Light Match** | Dims / boosts your lights to match the room. |
| **AR Shadow Floor** | An invisible floor that only catches shadows. |
| **AR Distance** | Real distance from the device (or between objects). |

> Real WebXR (headsets, AR phones) needs https and a supported browser. The fallbacks work everywhere.
`);

  A('realism', 'Making games', 'Realism material & hyper-real look', `# Realism – hyper-realistic 3D

Three pieces work together:

1. **Realism materials** – in *Assets → Materials* tick **Physically based "Realism" material**. New sliders appear: clear coat (car paint, varnish), sheen (cloth, velvet), transmission (real glass), index of refraction, thickness, iridescence (soap bubbles), micro-surface detail (tiny bumps and roughness variation, generated for you – no image files needed) and reflection strength. The *Material* library has ready-made ones: **Realistic car paint, brushed steel, polished marble, leather, velvet, concrete, skin, glass, soap bubble, wet asphalt, rubber**.
2. **Realism object shader** – on any 3D object choose **Inspector → Shader → realism** to give it the physically based look without making a material file.
3. **Realism screen effect** – a **Shader** block with the effect **Realism (hyper-real camera)** adds a cinematic camera (filmic tone curve, bloom on highlights, lens vignette and colour fringing, film grain, sharpening) and, in a 3D game, switches on filmic tone mapping, **soft shadows**, sky-based reflections and sharper light shadows for the whole scene. Size = bloom radius, Extra A = bloom threshold, Extra B = grain.

Tips: add a **Directional light** with *Cast shadows* on, use realistic materials on big surfaces (floor, walls), and keep metal objects away from pure black backgrounds so they have something to reflect.

## Custom shaders and materials from a list
When the Shader block's effect is **Custom shader file**, a **Custom shader** drop-down lists every shader in *Assets → Shaders*. With **Custom material file (3D)** a **Custom material** drop-down lists your materials. On a 3D object, choosing **Shader → custom** in the Inspector shows the same list. A shader file works on the screen, on 2D sprites **and** on 3D objects (inside it, **T(uv)** is the object's lit colour).
`);

  A('mobile', 'Making games', 'Mobile & device features', `# Mobile & device features

| Block | Browser | Phone / tablet |
|---|---|---|
| Shake | test key **H**, simulator button | accelerometer shake |
| Accelerometer | arrow keys | device tilt |
| Vibrate | brief screen shake | vibration motor |
| Touch Check | mouse | multi-touch |
| Ad | simulated house ad (or your chosen service) | your chosen ad service |
| Game Center | local + cloud leaderboards | \`window.VextraNative.gameCenter\` when wrapped |
| Device Check | detects mobile/tablet/OS/orientation | same |
| Exit Game | thanks screen | \`window.VextraNative.exit\` |
| Bluetooth Connect / Read / Write / Notify | needs Chrome or Edge (a mock in the simulator) | Chrome on Android; not iOS / Safari |

## Bluetooth devices

Use **Bluetooth Connect** from a click or key (the browser shows its own device picker), list the services you need, then wire **connected** into **Read**, **Write** or **Notify**. Give every block the same *Device name*. Common names: \`battery_service\` / \`battery_level\`, \`heart_rate\` / \`heart_rate_measurement\`, or a hex id like \`0xFFE0\`. Failures go to the \`error\` port.

## Watching blocks work (Live)

In the **Logic** tab press **▶ Live**. The game starts in a small box; click it and play. Every block shows the latest value of each output and a counter (×12), and flashes when it fires – ideal for finding out why something does not trigger. **↻** restarts with your latest edits, **⌫** clears the counters, **■ Stop live** closes the box.

## Reading results that have several parts

Some blocks send several values at once (a joystick, Size, a position). Anywhere text is shown they appear readable (\`x: 3, y: 4\`). To use one part: write \`{value.x}\` in a Label, use the block's own ports (e.g. Size has \`w\`, \`h\`, \`d\`), or add a **Get Field** block.

## The Ad block and its service

The **Ad** block has a **Type** (interstitial, rewarded or banner) and an **Ad service**:

| Service | What it does |
|---|---|
| House ad | A simulated placeholder so you can design the flow (default). |
| Image + link | Shows your own image; clicking opens the Click-through URL. |
| Custom HTML / ad tag | Runs your HTML or an ad-network tag inside a sandboxed frame. |
| Google AdSense | Enter your own publisher id (\`ca-pub-…\`) and slot id; needs an approved AdSense site and internet access. |
| My own code | Calls \`game.adProvider\` (below). |

**Banners are part of the game GUI**: choose a *Banner position* (any screen anchor), size, and use the \`hideBanner\` input to remove it. Fullscreen ads pause the game and show a *Close / Claim reward* button after the wait time. The Ad block also has a \`click\` output.

## Connecting a real ad network

\`\`\`js
game.adProvider = (kind, done, options) => { MyAds.show(kind).then((r) => done({ rewarded: r.completed })); };
\`\`\`

Set it from a *Custom Behavior* block or the exported HTML. Until then, ads are **simulated** so you can design the flow.`);

  A('web-backend', 'Websites', 'Database, PHP & exporting a site', `# Database, PHP & exporting a site

## Any file type
Create files of **any** type from the Explorer (**New file**): \`index.php\`, \`schema.sql\`, \`.htaccess\`, \`nginx.conf\`, \`Dockerfile\`, \`.env\`, \`app.py\` … The editor picks the right highlighting (PHP, SQL, nginx, Apache, YAML, INI, Python, Shell, Rust, Go, Java, C/C++ and more), and server files such as \`.htaccess\` and \`nginx.conf\` start with sensible content.

## The built-in database
Open it with the **Database** button in the Explorer header (or the Command Palette → *Open project database*). Each project folder has **one SQLite database**, stored as \`database.sqlite\` in the project and saved automatically.

- Browse tables, **double-click a cell to edit it**, add and delete rows.
- **＋ Table** builds a table without writing SQL; the editor runs any SQL with **Ctrl+Enter**.
- **Import .sql**, **Open .sqlite**, **Export .sql**, **Export .sqlite**.

### Using it from a live preview
Pages in the **Live preview** can talk to the project database through \`window.VXDB\`:

\`\`\`js
await VXDB.exec('CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, text TEXT)');
await VXDB.run('INSERT INTO todos (text) VALUES (?)', ['Buy milk']);
const rows = await VXDB.query('SELECT * FROM todos');   // array of objects
const one  = await VXDB.get('SELECT * FROM todos WHERE id = ?', [1]);
\`\`\`

\`VXDB\` exists only inside the preview. A deployed site needs a real backend – see PHP below.

## PHP
Edit PHP anywhere. In the **desktop app**, **Run PHP** (toolbar on \`.php\` files) starts PHP's built-in server for your project and shows the page. This needs **PHP installed on your computer** (and the \`pdo_sqlite\` extension for databases). Use the **PHP + SQLite site** template for a working example. PHP's built-in server does not read \`.htaccess\`, so it is for development only.

## Local server preview
In the preview bar, **🌐 Local server** (desktop app) serves the page over a real \`http://127.0.0.1\` address, so relative \`fetch()\`, ES modules and storage behave like a real site. It reloads when you save.

## Export the whole site
**Export website** (Explorer header, Command Palette, or **📦 Export site** on web files) packs the project into a **ZIP** or **tar.gz** containing:

- all your files in one folder (not \`node_modules\`, \`.git\` or hidden folders),
- a ready **\`.htaccess\`** and **\`nginx.conf\`** (yours are kept if they already exist),
- optionally the **database** (\`db/database.sql\`, \`db/database.sqlite\`, or both), blocked from the web by both configs,
- a short **README-DEPLOY.txt**.

Check the generated server configs before going live: set your real domain, enable HTTPS, and make \`db/\` writable by the web-server user only if your site writes to it.
`);

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

  A('vxscript', 'Making games', 'VXScript, packs & Night Shift', `# VXScript, project packs & the Night Shift game

## VXScript (\`.vxs\`)
A small language that is **converted to the block graph** (it is not JavaScript). Press **📜** in the game editor to paste or open a script; it becomes normal blocks you can keep editing.

\`\`\`
behavior "Player controls"
when key space pressed:
    jump
when touching tag:coin:
    destroy other
    score += 1
    if score >= 5:
        show toast "You win!" kind success
\`\`\`

Scripts are compiled, never run. Unknown blocks or ports are reported with the line number.

## Project packs (\`.vxpack\`)
A pack is a ZIP of a project. **Opening one** (double-click, File → Open or the Command Palette) unpacks it into its own folder and builds everything: \`.vxs\` scripts become blocks, every \`.vxgame\` is checked and gets a web build in \`build/\`. Programs (.exe, .sh …) and unsafe paths are never written. Make one with *Pack this folder*.

## Night Shift: Tape 07
A 3D found-footage horror game seen through a VHS camcorder (the **VHS Tape** shader block): three levels, four cutscenes, objectives, a flashlight with a battery and a stalker that hunts by sound. It is built **only from blocks**: open it from the game editor's *Examples*, or open \`examples/night-shift/night-shift.vxgame\` from the download, and edit any behaviour in the Logic tab. The folder also has a ready \`.vxpack\` and a web build.

# Hosting & collaborating
**Settings → Host & share.** Private by default. Public mode offers a **ghost domain** (a tunnel address that hides your real IP; the helper is downloaded only after you agree) or a **direct port forward** (UPnP, which shows your real IP). You can create a self-signed certificate, hand out invite codes and set an auto-stop. Switch back to private to stop everything.

# Updates & backups
Your data lives outside the install folder; a safety copy is saved before each update (\`update-backups/\`, last 3). The **Backup** plugin makes your own backups.`);
})();
