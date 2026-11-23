# Accessibility

Vextra Studio should be usable by as many people as possible – both the **editor** you work in and the **games** you make with it. This page says what is supported today, what is not yet, and how to help.

## The editor

**What works today**
- **Themes:** seven built-in themes, including a light one (`vextra-light`) and dark ones. Pick one in Settings; themes are plain JSON files in `themes/`, and two high-contrast ones ship with it.
- **Editor text size and font:** Settings → Editor (font size, font family, tab size, word wrap).
- **Keyboard:** the code editor, menus, dialogs and the Help pages can be used from the keyboard. The full list is in Help → Keyboard shortcuts.
- **Reduced motion:** animations stop when your system (or Settings → Accessibility) asks for it.
- **Plain-language blocks:** every block has a text description in the Logic tab, so a graph can be read as text.

**Added in 3.8.0**
- Landmarks, roles, accessible names for icon-only buttons and unlabeled fields; dialogs are announced, keep focus inside and give it back on close.
- A live announcer reads toasts, tab changes and selections in the canvas editors.
- *Skip to the editor* link and visible keyboard focus (optional extra-thick outline in Settings → Accessibility).
- **High Contrast Dark / Light** themes and **Interface zoom** (70–200%).
- **Reduce motion** (system or forced) – animations stop and games skip Camera shake.
- Keyboard alternatives: in the block graph `[` / `]` step through blocks, arrow keys move them (Shift = bigger steps), Enter opens a bundle.
- **Languages:** ten interface languages including right-to-left Arabic.

- **UI layout editor:** every HUD item and touch control can be focused and moved with the arrow keys (Shift = 10 px, Delete resets), and is announced.
- **Touch controls** (Joystick, Touch Button, Touch Look) have accessible names; the stick and buttons can also be driven by the keyboard, and *Reduce motion* is respected.

**Known gaps (still being worked on)**
- The 2D / 3D viewports and the paint / animation tools are drawn on a canvas: selection is announced, but the picture itself is not described. Everything they do can also be done from the Inspector panels, which are ordinary form fields.
- Translations cover the core interface; many panels and the documentation are still English only.
- Screen-reader support was tested with the browser engine's accessibility tree, not yet with every screen reader on every system.

## Games you make

Vextra gives you tools to build accessible games; nothing is forced on you, so please use them:
- **Never make the microphone or camera the only way to play.** Voice Noise has a *test key* (default M), Voice Command can be paired with keys, and the example games all work without a mic or camera.
- **Offer more than one control.** The examples accept WASD *and* arrow keys, and mouse *and* keyboard (Echo Pads: click, 1-4 or arrows).
- **Don't rely on colour alone.** Echo Pads gives each pad its own note and size change as well as a colour flash.
- **Readable text.** Use Label / Bar blocks (size, colour and anchor are settings) and keep text large and high-contrast against the background. Use **Edit UI layout** to move HUD items away from where the action happens.
- **Avoid flashing.** Don't flash large areas more than three times per second (screen shake and Shader effects included); give players a way to turn effects off.
- **Pause and timing.** Use the Pause Game block, and avoid timers that cannot be extended unless the challenge needs it.
- **Touch.** Add Joystick / Touch Button blocks so phone players can play; make buttons large (72 px or more) and don't make a game need two-finger gestures.
- **Sound.** Give important sounds a visual twin (a label, an icon or a flash) and let players mute.

## Report a problem or suggest a fix

Open an issue (see `ISSUE_TEMPLATES.md`) and tick *accessibility*, or send a pull request (see `CONTRIBUTING.md`). Please say which part of Vextra Studio, what you use (screen reader, magnifier, keyboard only, switch device…) and what happened. Accessibility fixes are welcome in any release.

Security problems go to `SECURITY.md`, not the public issue list.
