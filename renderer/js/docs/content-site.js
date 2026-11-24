/* Vextra Studio – documentation for the website builder, anti-cheat and text-to-speech (added in 4.4.0). */
(function () {
  const A = (id, group, title, md) => VX.docs.register({ id, group, title, md });

  A('site-builder', 'Websites', 'Website builder (no code)', `# Website builder

Build a real website by **dragging blocks** – no code. Pages can save what visitors send (a database), have **members** who log in, and are protected by a server you can host later.

**Start:** Welcome → *Website builder*, or the Create panel → *New website (blocks)*, or the command palette → *New website (block builder)*. Your site is saved as a \`.vxsite\` file.

## The editor
| Part | What it does |
|---|---|
| **Blocks** (left) | **Ready-made sections** (hero, features, pricing, testimonials, FAQ, contact, gallery, call to action) plus 35+ blocks in groups: *Text* (heading, paragraph, rich text/Markdown, button, button group, notice, code), *Media* (image, gallery with lightbox, video, map), *Layout* (hero, section, columns, card, spacer, divider), *Interactive* (tabs, accordion, countdown, numbers), *Content* (feature grid, pricing plans, testimonials, table), *Data* (form, list) and *Members*. Drag one onto the page, or click it to add it at the end. |
| **Page** (middle) | What you see is what visitors get. Drop on the thin orange line to place a block before / after another one; drop into a column to nest it. Drag a block to move it. **Alt + ↑ / ↓** moves the selected block, **Delete** removes it, **Ctrl + Z** undoes. |
| **Inspector** (right) | Text, links, colours and sizes of the selected block. *Link to a page…* fills in the address for you. |
| **Pages** tab | Add, reorder and rename pages; set the address, a description for search engines, show in menu, and **Members only**. The page called *home* is the front page. |
| **Data** tab | Your database: **collections** (tables) and their **fields** (short text, long text, email, number, choice list, pick-one buttons, tick box, date, web address, phone, rating 1–5; required / private; placeholder and help text; and *Only ask when…* conditions). |
| **Site** tab | Name, colours, font, corners, width, accessibility, security and hosting settings. |

The toolbar has **Desktop / Phone** width, **Checks** (problems to fix), **Preview** (forms pretend to work) and **Export & host**.

## Login popup, validation and identifiers

- **Login / sign-up popup:** one popup is added to every page (Site → *Login / sign-up popup*: link, on page load, or off). Login and Sign-up pages are created automatically and use the same form.
- **Validation:** forms show their own messages instead of the browser's. The server checks everything again.
- **Formats:** give a text field a preset (email, phone, ZIP, URL, username, strong password…) or your own pattern and message; the tester shows what passes. Very slow patterns are refused.
- **Identifiers** (page address, collection name, field key, link name) fill in from the title and cannot be edited by hand.
- **Map:** type an address to place the map. **Code blocks** are syntax highlighted.
- **Where entries are saved:** the exported site's server keeps them in \`data/db.json\` (a JSON file in the folder set by \`DATA_DIR\`). Nothing is saved in the builder preview.

## Advanced blocks
- **Style & behaviour** (inspector, every block): space above / below / sides, background and text colour, border, corner radius, shadow, maximum width and placement, **hide on phones or computers**, **fade / slide / zoom in** when scrolled into view (switched off for visitors who prefer reduced motion) and a **link name** so a button can jump to \`#name\`.
- **Who sees it** shows a block only to logged-in members or only to guests. This is **cosmetic**: the text is still in the page source. Put private content on a **Members only** page, which the server enforces.
- **Containers with blocks inside:** *Columns* (equal or wide first / last column), *Section* (coloured or picture background, any width), *Tabs* (keyboard accessible) and *Accordion* (up to 6 panels, each holds any blocks).
- **Forms:** split long forms into **steps**, add placeholder and help text, **conditional fields**, redirect after sending. Conditions are re-checked by the server, so a hidden field is never required or stored.
- **Lists:** search box, sort by a field (click table headings), pages, cards / table / plain list.
- **Video and map:** only YouTube (privacy mode), Vimeo, a .mp4 / .webm file and OpenStreetMap maps. The embed address is built by the editor, and the exported server only allows those hosts in its Content-Security-Policy (and only when the site uses them).
- **Rich text** understands a safe Markdown (headings, **bold**, *italic*, links, lists, quotes, code). It is escaped first, so it cannot add scripts or raw HTML.
- **Site tab:** heading font, **dark / light / follow the device**, button shape and a sticky menu. **Pages** tab: start a new page from a template (landing, about, pricing, contact, FAQ) and set a social preview picture.

## Database
1. **Data → New collection** (for example *Orders*), add its fields.
2. Drop a **Form** block on a page and choose the collection. Visitors fill it in; the server checks every entry against your fields and stores it.
3. Drop a **List from database** block to show entries as cards or a table. Entries are only shown publicly if you tick **Visitors may read the entries**; *email* fields and fields marked **Private** are never sent to visitors.
4. Read, delete and download (CSV) entries in the exported site's **/admin** area.

## Members
Put a **Sign-up** and a **Login** block on pages, then mark pages **Members only**. Logged-in members can also be the only people allowed to submit a collection (*Who can add entries*). A simple login / sign-up page is added for you if you did not make one.

## Security – what the exported server does
- Passwords are stored as **salted scrypt hashes** only; wrong-password lock-out; the same answer for unknown and known emails.
- Sessions are random tokens (\`HttpOnly\`, \`SameSite=Strict\`, \`Secure\` on HTTPS) and stored hashed.
- **Server-side validation** of every field (types, lengths, choices, required) – never trusting the browser.
- Cross-site request protection, request-size limit, rate limits, a hidden **spam trap**, strict **Content-Security-Policy** (no inline scripts), \`X-Frame-Options\`, \`nosniff\`, HSTS on HTTPS.
- **Members-only pages are checked on the server**, not just hidden.
- Visitor text is always shown as **plain text**; links only allow http(s), mailto, tel and relative addresses; there is deliberately **no raw-HTML block**. Collections' *phone* and *email* fields are never listed publicly.
- Admin area protected by a password (hashed with PBKDF2 in the config, or a random one shown at the first start) with rate limiting.

**Not included:** sending email, payments and password-reset mails. Use HTTPS in front of the server (see below) and back up the \`data\` folder.

## Export and host later
**Export & host** asks for an optional admin password and creates a folder (or ZIP):

\`\`\`
public/        your pages, styles, images
server.js      the small server (Node.js 18+, no packages to install)
site.json      your collections and page access rules
config.json    port, host, HTTPS options
data/          created at run time (db.json) – keep it private and back it up
HOSTING.md     step-by-step hosting guide for your site
Dockerfile, start.bat, start.sh
\`\`\`

Run it with \`start.bat\` / \`./start.sh\` (or \`node server.js\`), open http://localhost:8080. To put it online use any Node.js host or Docker and **put HTTPS in front** (HOSTING.md has a ready Caddy example), then set *Public address*, *Send visitors to https://* and *A proxy handles HTTPS* in the Site tab.

## Accessibility
Every page has a **Skip to the content** link, labelled form fields, visible focus and a **🔊 Listen** button that reads the page aloud and **highlights each word** as it is spoken (Site → Accessibility). Add descriptions to your images – *Checks* reminds you.

## Limits
Preview and the test server run on your computer; how well hosting works depends on your host. One server process keeps everything in a single file – great for small sites, not for very busy ones.
`);

  A('anti-cheat', 'Making games', 'Anti-cheat (admin settings)', `# Anti-cheat

**Game toolbar → 🛡 Anti-cheat.** You, the game's admin, decide which checks run, **what happens to a player** who trips one, and how strict it is. **It never affects you:** the editor's own Play button is always exempt, and you can set a passphrase that makes you exempt in the exported game too.

## Be honest about what it can do
A browser or app game runs on the *player's* device, so a determined cheater can always change it. This guard stops casual cheating, **makes tampering visible and punishable**, and gives you reports – it is not a guarantee. For leaderboards, also check scores on a server you control.

## Checks
| Check | Catches |
|---|---|
| **Speed / time manipulation** | tools that speed up or slow down the game clock |
| **Variable limits** | your own rules, one per line: \`variable | min | max | most it may rise per second\` – for example \`score | | 100000 | 500\` |
| **Outside edits** | a variable changed by something that is not part of your game (browser console, injected script) |
| **Automated input** | scripts that press keys or click, impossible inputs per second |
| **Developer tools open** | window-size heuristic, off by default |
| **Edited game file** | the game compares its logic with the version you exported |

## What happens
For every check pick: *only record*, *warn the player*, *pause with a message*, *undo the value* (limits), *restart the game*, *remove from the game* (kick) or *ban*. Strikes add up: after **N strikes** the **escalation** action runs. Messages shown to players, ban length (0 = permanent) and the cooldown between alerts are yours to write.

## You are exempt
- Playing from the editor is always exempt.
- **Admin passphrase:** open the exported game with \`#vx-admin=your passphrase\` once; that browser is exempt afterwards. Only a hash is stored in the game.

## Reports and bans
Turn on *Send reports to my server* (the Vextra server that hosts the game). **Reports & bans** lists events and bans/unbans players. The admin routes only answer from the app on the computer that runs the server.

## Players
Players see only your messages. Nothing is installed on their device – the guard is part of the exported game.
`);

  A('tts', 'Getting started', 'Read aloud (text-to-speech)', `# Read aloud

Vextra can read text aloud and **highlight each word** as it is spoken. It uses the voices of your system / browser, so nothing is sent anywhere.

- **In the app:** select text and press **Alt + R**, or press it with nothing selected to read the page you are on (docs pages have a 🔊 button). **Settings → Accessibility** sets the voice, speed, pitch and highlight. Command palette: *Accessibility: read aloud*, *pause / resume*.
- **In games:** the **Read aloud** block (Text group) speaks a message and highlights it; *Game settings → Player settings → Read-text-aloud* lets players switch it on and set the speed in the pause menu.
- **In websites you build:** *Site → Accessibility → Listen button*.

If your device has no voices, the buttons say so instead of failing silently.
`);
})();
