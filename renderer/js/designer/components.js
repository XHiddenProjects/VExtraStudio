/* UI designer component registry. Plugins add more through forge.designer.registerComponent('ui', def).
   def = { type, label, icon, w, h, category, props, schema:[{key,label,type,...}], html(item, exported) → string } */
(function () {
  const esc = VX.esc;
  const registry = { ui: {} };
  function register(mode, def) {
    if (!registry[mode]) throw new Error('Unknown designer mode: ' + mode);
    if (!def || !def.type) throw new Error('Component needs a type');
    registry[mode][def.type] = Object.assign({ label: def.type, icon: '▢', w: 120, h: 60, props: {}, schema: [], category: 'General' }, def);
  }
  const C = {
    color: { key: 'color', label: 'Text color', type: 'color' }, bg: { key: 'bg', label: 'Background', type: 'color' },
    radius: { key: 'radius', label: 'Corner radius', type: 'number', min: 0, max: 200 }, size: { key: 'size', label: 'Font size', type: 'number', min: 6, max: 160 },
    text: { key: 'text', label: 'Text', type: 'text' }, align: { key: 'align', label: 'Align', type: 'select', options: ['left', 'center', 'right'] },
    border: { key: 'border', label: 'Border color', type: 'color' }, accent: { key: 'accent', label: 'Accent', type: 'color' },
    href: { key: 'href', label: 'Link (href)', type: 'text' },
  };
  const F = 'width:100%;height:100%;box-sizing:border-box;';
  const SANS = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;";
  const R = (name, def) => register('ui', Object.assign({ type: name }, def));
  const list = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

  /* ----- Layout ----- */
  R('box', { label: 'Box', icon: '▭', w: 200, h: 120, category: 'Layout', props: { bg: '#2a2f3a', radius: 12, border: '#3b4254', borderWidth: 1 },
    schema: [C.bg, C.radius, C.border, { key: 'borderWidth', label: 'Border width', type: 'number', min: 0, max: 20 }],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};border-radius:${+i.props.radius}px;border:${+i.props.borderWidth}px solid ${esc(i.props.border)}"></div>` });
  R('gradient', { label: 'Gradient', icon: '◐', w: 260, h: 140, category: 'Layout', props: { from: '#6c8cff', to: '#34e1c5', angle: 135, radius: 16 },
    schema: [{ key: 'from', label: 'From', type: 'color' }, { key: 'to', label: 'To', type: 'color' }, { key: 'angle', label: 'Angle', type: 'number', min: 0, max: 360 }, C.radius],
    html: (i) => `<div style="${F}background:linear-gradient(${+i.props.angle}deg,${esc(i.props.from)},${esc(i.props.to)});border-radius:${+i.props.radius}px"></div>` });
  R('circle', { label: 'Circle', icon: '◯', w: 100, h: 100, category: 'Layout', props: { bg: '#6c8cff' }, schema: [C.bg],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};border-radius:50%"></div>` });
  R('card', { label: 'Card', icon: '🗂', w: 260, h: 150, category: 'Layout', props: { title: 'Card title', body: 'Describe this card here.', bg: '#20242d', color: '#e7e9ee', radius: 14 },
    schema: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'body', label: 'Body', type: 'textarea' }, C.bg, C.color, C.radius],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border-radius:${+i.props.radius}px;padding:16px;${SANS}box-shadow:0 6px 20px rgba(0,0,0,.25)"><div style="font-weight:700;font-size:18px;margin-bottom:6px">${esc(i.props.title)}</div><div style="opacity:.75;font-size:14px;line-height:1.45">${esc(i.props.body)}</div></div>` });
  R('hero', { label: 'Hero section', icon: '🏔', w: 760, h: 300, category: 'Layout', props: { title: 'Ship your idea faster', sub: 'A short sentence that explains what you do and why it matters.', cta: 'Get started', bg: '#161a2b', color: '#ffffff', accent: '#6c8cff' },
    schema: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'sub', label: 'Subtitle', type: 'textarea' }, { key: 'cta', label: 'Button', type: 'text' }, C.bg, C.color, C.accent],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;padding:24px;${SANS}"><div style="font-size:42px;font-weight:800;letter-spacing:-.02em;line-height:1.1">${esc(i.props.title)}</div><div style="opacity:.7;font-size:17px;max-width:560px;line-height:1.5">${esc(i.props.sub)}</div><div style="margin-top:6px;background:${esc(i.props.accent)};color:#fff;padding:12px 26px;border-radius:10px;font-weight:700">${esc(i.props.cta)}</div></div>` });
  R('footer', { label: 'Footer', icon: '▁', w: 800, h: 80, category: 'Layout', props: { text: '© 2026 Your Company. All rights reserved.', links: 'Privacy, Terms, Contact', bg: '#101218', color: '#8b93a1' },
    schema: [C.text, { key: 'links', label: 'Links (comma)', type: 'text' }, C.bg, C.color],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-size:13px;${SANS}"><span>${esc(i.props.text)}</span><span style="display:flex;gap:18px">${list(i.props.links).map((l) => `<span>${esc(l)}</span>`).join('')}</span></div>` });
  R('divider', { label: 'Divider', icon: '―', w: 300, h: 2, category: 'Layout', props: { bg: '#3b4254' }, schema: [C.bg], html: (i) => `<div style="${F}background:${esc(i.props.bg)}"></div>` });

  /* ----- Navigation ----- */
  R('navbar', { label: 'Navbar', icon: '☰', w: 800, h: 56, category: 'Navigation', props: { brand: 'Brand', links: 'Home, Features, Pricing, Contact', bg: '#1a1d24', color: '#e7e9ee' },
    schema: [{ key: 'brand', label: 'Brand', type: 'text' }, { key: 'links', label: 'Links (comma)', type: 'text' }, C.bg, C.color],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};display:flex;align-items:center;gap:24px;padding:0 20px;${SANS}"><b style="font-size:18px;margin-right:auto">${esc(i.props.brand)}</b>${list(i.props.links).map((l) => `<span style="font-size:14px;opacity:.85">${esc(l)}</span>`).join('')}</div>` });
  R('tabs', { label: 'Tabs', icon: '⌸', w: 360, h: 40, category: 'Navigation', props: { items: 'Overview, Activity, Settings', active: 0, color: '#c3c8d2', accent: '#6c8cff' },
    schema: [{ key: 'items', label: 'Tabs (comma)', type: 'text' }, { key: 'active', label: 'Active index', type: 'number', min: 0, max: 20 }, C.color, C.accent],
    html: (i) => `<div style="${F}display:flex;border-bottom:1px solid #3b4254;${SANS}">${list(i.props.items).map((t, n) => `<div style="padding:0 18px;display:flex;align-items:center;font-size:14px;color:${n === +i.props.active ? esc(i.props.accent) : esc(i.props.color)};border-bottom:2px solid ${n === +i.props.active ? esc(i.props.accent) : 'transparent'};font-weight:${n === +i.props.active ? 700 : 500}">${esc(t)}</div>`).join('')}</div>` });
  R('breadcrumb', { label: 'Breadcrumb', icon: '›', w: 320, h: 28, category: 'Navigation', props: { items: 'Home, Library, Data', color: '#8b93a1', size: 13 },
    schema: [{ key: 'items', label: 'Items (comma)', type: 'text' }, C.color, C.size],
    html: (i) => `<div style="${F}display:flex;align-items:center;gap:8px;color:${esc(i.props.color)};font-size:${+i.props.size}px;${SANS}">${list(i.props.items).map((t, n, a) => `<span style="${n === a.length - 1 ? 'color:#e7e9ee;font-weight:600' : ''}">${esc(t)}</span>`).join('<span style="opacity:.5">/</span>')}</div>` });
  R('link', { label: 'Link', icon: '🔗', w: 140, h: 28, category: 'Navigation', props: { text: 'Read more →', href: '#', color: '#6c8cff', size: 15 },
    schema: [C.text, C.href, C.color, C.size],
    html: (i, ex) => `<a ${ex ? `href="${esc(i.props.href)}"` : ''} style="${F}display:flex;align-items:center;color:${esc(i.props.color)};font-size:${+i.props.size}px;text-decoration:underline;${SANS}">${esc(i.props.text)}</a>` });

  /* ----- Text ----- */
  R('heading', { label: 'Heading', icon: 'H', w: 360, h: 56, category: 'Text', props: { text: 'A great heading', size: 36, color: '#ffffff', weight: 700, align: 'left' },
    schema: [C.text, C.size, C.color, { key: 'weight', label: 'Weight', type: 'select', options: ['400', '500', '600', '700', '800'] }, C.align],
    html: (i) => `<div style="${F}color:${esc(i.props.color)};font:${esc(i.props.weight)} ${+i.props.size}px/1.15 system-ui,sans-serif;text-align:${esc(i.props.align)};overflow:hidden">${esc(i.props.text)}</div>` });
  R('text', { label: 'Text', icon: 'T', w: 300, h: 70, category: 'Text', props: { text: 'Write something helpful here. Use the Properties panel to edit this text.', size: 16, color: '#c3c8d2', align: 'left' },
    schema: [{ key: 'text', label: 'Text', type: 'textarea' }, C.size, C.color, C.align],
    html: (i) => `<div style="${F}color:${esc(i.props.color)};font:${+i.props.size}px/1.5 system-ui,sans-serif;text-align:${esc(i.props.align)};overflow:hidden">${esc(i.props.text)}</div>` });
  R('quote', { label: 'Quote', icon: '❝', w: 340, h: 120, category: 'Text', props: { text: 'The best way to predict the future is to build it.', author: '— Someone wise', color: '#e7e9ee', accent: '#6c8cff' },
    schema: [{ key: 'text', label: 'Quote', type: 'textarea' }, { key: 'author', label: 'Author', type: 'text' }, C.color, C.accent],
    html: (i) => `<div style="${F}border-left:4px solid ${esc(i.props.accent)};padding:6px 0 6px 16px;color:${esc(i.props.color)};${SANS}"><div style="font-size:18px;font-style:italic;line-height:1.45">${esc(i.props.text)}</div><div style="margin-top:8px;font-size:13px;opacity:.65">${esc(i.props.author)}</div></div>` });
  R('code', { label: 'Code block', icon: '</>', w: 360, h: 120, category: 'Text', props: { code: 'const hello = () => "world";\nconsole.log(hello());', bg: '#0d0f13', color: '#a5e075' },
    schema: [{ key: 'code', label: 'Code', type: 'textarea' }, C.bg, C.color],
    html: (i) => `<pre style="${F}margin:0;background:${esc(i.props.bg)};color:${esc(i.props.color)};border-radius:10px;padding:14px;font:13px/1.5 ui-monospace,Consolas,monospace;overflow:hidden">${esc(i.props.code)}</pre>` });
  R('badge', { label: 'Badge', icon: '🏷', w: 90, h: 28, category: 'Text', props: { text: 'NEW', bg: '#4cc38a', color: '#06210f' }, schema: [C.text, C.bg, C.color],
    html: (i) => `<div style="${F}display:grid;place-items:center;border-radius:999px;background:${esc(i.props.bg)};color:${esc(i.props.color)};font:700 12px system-ui;letter-spacing:.06em">${esc(i.props.text)}</div>` });

  /* ----- Controls & forms ----- */
  R('button', { label: 'Button', icon: '⏺', w: 140, h: 44, category: 'Controls', props: { text: 'Click me', bg: '#6c8cff', color: '#ffffff', radius: 10, size: 15, onclick: '' },
    schema: [C.text, C.bg, C.color, C.radius, C.size, { key: 'onclick', label: 'onclick JS', type: 'text' }],
    html: (i, ex) => `<button ${ex && i.props.onclick ? `onclick="${esc(i.props.onclick)}"` : ''} style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border:0;border-radius:${+i.props.radius}px;font:600 ${+i.props.size}px system-ui,sans-serif;cursor:pointer">${esc(i.props.text)}</button>` });
  R('iconbutton', { label: 'Icon button', icon: '⊕', w: 44, h: 44, category: 'Controls', props: { icon: '＋', bg: '#2a2f3a', color: '#e7e9ee', radius: 12, size: 20, onclick: '' },
    schema: [{ key: 'icon', label: 'Icon / emoji', type: 'text' }, C.bg, C.color, C.radius, C.size, { key: 'onclick', label: 'onclick JS', type: 'text' }],
    html: (i, ex) => `<button ${ex && i.props.onclick ? `onclick="${esc(i.props.onclick)}"` : ''} style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border:0;border-radius:${+i.props.radius}px;font-size:${+i.props.size}px;cursor:pointer">${esc(i.props.icon)}</button>` });
  R('input', { label: 'Input', icon: '⌸', w: 240, h: 42, category: 'Forms', props: { placeholder: 'Type here…', bg: '#14161b', color: '#e7e9ee', radius: 8 }, schema: [{ key: 'placeholder', label: 'Placeholder', type: 'text' }, C.bg, C.color, C.radius],
    html: (i) => `<input placeholder="${esc(i.props.placeholder)}" style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border:1px solid #3b4254;border-radius:${+i.props.radius}px;padding:0 12px;font:14px system-ui,sans-serif">` });
  R('textarea', { label: 'Text area', icon: '☰', w: 280, h: 100, category: 'Forms', props: { placeholder: 'Write a message…', bg: '#14161b', color: '#e7e9ee', radius: 8 }, schema: [{ key: 'placeholder', label: 'Placeholder', type: 'text' }, C.bg, C.color, C.radius],
    html: (i) => `<textarea placeholder="${esc(i.props.placeholder)}" style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border:1px solid #3b4254;border-radius:${+i.props.radius}px;padding:10px 12px;font:14px system-ui,sans-serif;resize:none"></textarea>` });
  R('select', { label: 'Dropdown', icon: '▾', w: 220, h: 42, category: 'Forms', props: { options: 'Option A, Option B, Option C', bg: '#14161b', color: '#e7e9ee', radius: 8 }, schema: [{ key: 'options', label: 'Options (comma)', type: 'text' }, C.bg, C.color, C.radius],
    html: (i) => `<select style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border:1px solid #3b4254;border-radius:${+i.props.radius}px;padding:0 10px;font:14px system-ui,sans-serif">${list(i.props.options).map((o) => `<option>${esc(o)}</option>`).join('')}</select>` });
  R('checkbox', { label: 'Checkbox', icon: '☑', w: 180, h: 28, category: 'Forms', props: { text: 'Remember me', color: '#e7e9ee', size: 14 }, schema: [C.text, C.color, C.size],
    html: (i) => `<label style="${F}display:flex;align-items:center;gap:8px;color:${esc(i.props.color)};font:${+i.props.size}px system-ui,sans-serif"><input type="checkbox"> ${esc(i.props.text)}</label>` });
  R('radio', { label: 'Radio group', icon: '◉', w: 180, h: 84, category: 'Forms', props: { options: 'Small, Medium, Large', color: '#e7e9ee', size: 14 }, schema: [{ key: 'options', label: 'Options (comma)', type: 'text' }, C.color, C.size],
    html: (i) => `<div style="${F}display:flex;flex-direction:column;justify-content:space-around;color:${esc(i.props.color)};font:${+i.props.size}px system-ui,sans-serif">${list(i.props.options).map((o, n) => `<label style="display:flex;gap:8px;align-items:center"><input type="radio" name="r${esc(i.id)}" ${n === 0 ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>` });
  R('toggle', { label: 'Toggle', icon: '⏽', w: 52, h: 28, category: 'Forms', props: { on: true, accent: '#6c8cff' }, schema: [{ key: 'on', label: 'On (true/false)', type: 'select', options: ['true', 'false'] }, C.accent],
    html: (i) => { const on = String(i.props.on) === 'true'; return `<div style="${F}border-radius:99px;background:${on ? esc(i.props.accent) : '#3a4050'};position:relative"><div style="position:absolute;top:3px;${on ? 'right:3px' : 'left:3px'};width:calc(100% * .46);aspect-ratio:1;border-radius:50%;background:#fff"></div></div>`; } });
  R('slider', { label: 'Slider', icon: '⎯◉', w: 220, h: 28, category: 'Forms', props: { value: 40, accent: '#6c8cff' }, schema: [{ key: 'value', label: 'Value %', type: 'number', min: 0, max: 100 }, C.accent],
    html: (i) => `<div style="${F}display:flex;align-items:center"><div style="flex:1;height:6px;border-radius:99px;background:#3a4050;position:relative"><div style="width:${+i.props.value}%;height:100%;border-radius:99px;background:${esc(i.props.accent)}"></div><div style="position:absolute;left:${+i.props.value}%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div></div></div>` });
  R('searchbar', { label: 'Search bar', icon: '🔍', w: 300, h: 42, category: 'Forms', props: { placeholder: 'Search…', bg: '#14161b', color: '#e7e9ee' }, schema: [{ key: 'placeholder', label: 'Placeholder', type: 'text' }, C.bg, C.color],
    html: (i) => `<div style="${F}display:flex;align-items:center;gap:10px;padding:0 14px;background:${esc(i.props.bg)};color:${esc(i.props.color)};border:1px solid #3b4254;border-radius:999px;${SANS}font-size:14px"><span style="opacity:.6">🔍</span><span style="opacity:.55">${esc(i.props.placeholder)}</span></div>` });
  R('loginform', { label: 'Login form', icon: '🔐', w: 300, h: 260, category: 'Forms', props: { title: 'Sign in', button: 'Continue', bg: '#20242d', color: '#e7e9ee', accent: '#6c8cff' },
    schema: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'button', label: 'Button', type: 'text' }, C.bg, C.color, C.accent],
    html: (i) => `<form onsubmit="return false" style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px;${SANS}box-shadow:0 10px 30px rgba(0,0,0,.3)"><div style="font-size:22px;font-weight:800">${esc(i.props.title)}</div><input placeholder="Email" style="padding:10px 12px;border-radius:8px;border:1px solid #3b4254;background:#14161b;color:inherit"><input placeholder="Password" type="password" style="padding:10px 12px;border-radius:8px;border:1px solid #3b4254;background:#14161b;color:inherit"><button style="margin-top:auto;padding:11px;border:0;border-radius:10px;background:${esc(i.props.accent)};color:#fff;font-weight:700">${esc(i.props.button)}</button></form>` });

  /* ----- Media ----- */
  R('image', { label: 'Image', icon: '🖼', w: 200, h: 140, category: 'Media', props: { src: '', fit: 'cover', radius: 10, bg: '#2a2f3a' },
    schema: [{ key: 'src', label: 'Image URL', type: 'text' }, { key: 'fit', label: 'Fit', type: 'select', options: ['cover', 'contain', 'fill'] }, C.radius, C.bg],
    html: (i) => i.props.src ? `<img src="${esc(i.props.src)}" style="${F}object-fit:${esc(i.props.fit)};border-radius:${+i.props.radius}px;display:block">` : `<div style="${F}background:${esc(i.props.bg)};border-radius:${+i.props.radius}px;display:grid;place-items:center;color:#8b93a1;font:13px system-ui">🖼 Image</div>` });
  R('avatar', { label: 'Avatar', icon: '👤', w: 64, h: 64, category: 'Media', props: { text: 'AB', bg: '#6c8cff', color: '#fff', src: '' }, schema: [C.text, C.bg, C.color, { key: 'src', label: 'Image URL', type: 'text' }],
    html: (i) => i.props.src ? `<img src="${esc(i.props.src)}" style="${F}border-radius:50%;object-fit:cover">` : `<div style="${F}border-radius:50%;background:${esc(i.props.bg)};color:${esc(i.props.color)};display:grid;place-items:center;font:700 ${Math.round(Math.min(i.w, i.h) * .38)}px system-ui">${esc(i.props.text)}</div>` });
  R('video', { label: 'Video', icon: '🎬', w: 320, h: 180, category: 'Media', props: { src: '', radius: 12 }, schema: [{ key: 'src', label: 'Video URL', type: 'text' }, C.radius],
    html: (i, ex) => ex && i.props.src ? `<video src="${esc(i.props.src)}" controls style="${F}border-radius:${+i.props.radius}px;background:#000"></video>` : `<div style="${F}background:#0d0f13;border-radius:${+i.props.radius}px;display:grid;place-items:center;color:#8b93a1;font:36px system-ui">▶</div>` });
  R('embed', { label: 'Embed (iframe)', icon: '⧉', w: 360, h: 220, category: 'Media', props: { src: 'https://example.com', radius: 10 }, schema: [{ key: 'src', label: 'URL', type: 'text' }, C.radius],
    html: (i, ex) => ex ? `<iframe src="${esc(i.props.src)}" style="${F}border:0;border-radius:${+i.props.radius}px;background:#fff"></iframe>` : `<div style="${F}background:#20242d;border:1px dashed #3b4254;border-radius:${+i.props.radius}px;display:grid;place-items:center;color:#8b93a1;font:13px system-ui;text-align:center;padding:10px">⧉ Embed<br>${esc(i.props.src)}</div>` });

  /* ----- Data & feedback ----- */
  R('stat', { label: 'Stat tile', icon: '📈', w: 200, h: 100, category: 'Data', props: { label: 'Monthly users', value: '12,480', delta: '+8.2%', bg: '#20242d', color: '#e7e9ee', accent: '#4cc38a' },
    schema: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'value', label: 'Value', type: 'text' }, { key: 'delta', label: 'Change', type: 'text' }, C.bg, C.color, C.accent],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border-radius:14px;padding:14px 16px;${SANS}"><div style="font-size:12px;opacity:.6">${esc(i.props.label)}</div><div style="font-size:28px;font-weight:800;margin:2px 0">${esc(i.props.value)}</div><div style="font-size:12px;color:${esc(i.props.accent)};font-weight:700">${esc(i.props.delta)}</div></div>` });
  R('table', { label: 'Table', icon: '▦', w: 420, h: 160, category: 'Data', props: { head: 'Name, Role, Status', rows: 'Ada, Engineer, Active\nLinus, Maintainer, Away\nGrace, Admiral, Active', bg: '#1a1d24', color: '#e7e9ee', accent: '#2a2f3a' },
    schema: [{ key: 'head', label: 'Header (comma)', type: 'text' }, { key: 'rows', label: 'Rows (one per line)', type: 'textarea' }, C.bg, C.color, { key: 'accent', label: 'Header bg', type: 'color' }],
    html: (i) => `<table style="${F}border-collapse:collapse;background:${esc(i.props.bg)};color:${esc(i.props.color)};font-size:13px;${SANS}border-radius:10px;overflow:hidden"><thead><tr>${list(i.props.head).map((c) => `<th style="text-align:left;padding:10px 14px;background:${esc(i.props.accent)}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${String(i.props.rows).split('\n').filter(Boolean).map((r) => `<tr>${r.split(',').map((c) => `<td style="padding:9px 14px;border-top:1px solid #2a2f3a">${esc(c.trim())}</td>`).join('')}</tr>`).join('')}</tbody></table>` });
  R('list', { label: 'List', icon: '☷', w: 220, h: 120, category: 'Data', props: { items: 'First item\nSecond item\nThird item', color: '#e7e9ee', size: 15, bullet: '•' }, schema: [{ key: 'items', label: 'Items (one per line)', type: 'textarea' }, C.color, C.size, { key: 'bullet', label: 'Bullet', type: 'text' }],
    html: (i) => `<ul style="${F}margin:0;padding:0;list-style:none;color:${esc(i.props.color)};font-size:${+i.props.size}px;${SANS}display:flex;flex-direction:column;gap:6px">${String(i.props.items).split('\n').filter(Boolean).map((t) => `<li><span style="opacity:.6;margin-right:8px">${esc(i.props.bullet)}</span>${esc(t)}</li>`).join('')}</ul>` });
  R('progress', { label: 'Progress bar', icon: '▰', w: 260, h: 14, category: 'Data', props: { value: 65, bg: '#3a4050', accent: '#6c8cff' }, schema: [{ key: 'value', label: 'Value %', type: 'number', min: 0, max: 100 }, C.bg, C.accent],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};border-radius:99px;overflow:hidden"><div style="width:${+i.props.value}%;height:100%;background:${esc(i.props.accent)};border-radius:99px"></div></div>` });
  R('rating', { label: 'Star rating', icon: '★', w: 140, h: 28, category: 'Data', props: { value: 4, max: 5, color: '#f5c451', size: 22 }, schema: [{ key: 'value', label: 'Value', type: 'number', min: 0, max: 10 }, { key: 'max', label: 'Max', type: 'number', min: 1, max: 10 }, C.color, C.size],
    html: (i) => `<div style="${F}display:flex;align-items:center;font-size:${+i.props.size}px;color:${esc(i.props.color)};letter-spacing:2px">${'★'.repeat(Math.max(0, +i.props.value))}<span style="opacity:.28">${'★'.repeat(Math.max(0, +i.props.max - +i.props.value))}</span></div>` });
  R('alert', { label: 'Alert', icon: '⚠', w: 340, h: 54, category: 'Feedback', props: { text: 'Heads up! Something needs your attention.', kind: 'info' }, schema: [C.text, { key: 'kind', label: 'Kind', type: 'select', options: ['info', 'success', 'warning', 'error'] }],
    html: (i) => { const c = { info: ['#6c8cff', '#141a33'], success: ['#4cc38a', '#10261c'], warning: ['#f5c451', '#2a2310'], error: ['#ef5b5b', '#2c1414'] }[i.props.kind] || ['#6c8cff', '#141a33']; return `<div style="${F}display:flex;align-items:center;padding:0 16px;background:${c[1]};border:1px solid ${c[0]};color:${c[0]};border-radius:10px;font-size:14px;${SANS}">${esc(i.props.text)}</div>`; } });
  R('pricing', { label: 'Pricing card', icon: '💳', w: 240, h: 320, category: 'Data', props: { plan: 'Pro', price: '$12', per: '/month', features: 'Unlimited projects\n3D game editor\nCloud publishing\nPriority support', cta: 'Choose plan', bg: '#20242d', color: '#e7e9ee', accent: '#6c8cff' },
    schema: [{ key: 'plan', label: 'Plan', type: 'text' }, { key: 'price', label: 'Price', type: 'text' }, { key: 'per', label: 'Period', type: 'text' }, { key: 'features', label: 'Features (one per line)', type: 'textarea' }, { key: 'cta', label: 'Button', type: 'text' }, C.bg, C.color, C.accent],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border:1px solid ${esc(i.props.accent)};border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:10px;${SANS}"><div style="font-weight:700;color:${esc(i.props.accent)}">${esc(i.props.plan)}</div><div style="font-size:40px;font-weight:800">${esc(i.props.price)}<span style="font-size:14px;opacity:.6;font-weight:500">${esc(i.props.per)}</span></div><div style="display:flex;flex-direction:column;gap:7px;font-size:14px;opacity:.85">${String(i.props.features).split('\n').filter(Boolean).map((f) => `<div>✓ ${esc(f)}</div>`).join('')}</div><div style="margin-top:auto;text-align:center;background:${esc(i.props.accent)};color:#fff;padding:11px;border-radius:10px;font-weight:700">${esc(i.props.cta)}</div></div>` });
  R('testimonial', { label: 'Testimonial', icon: '💬', w: 320, h: 150, category: 'Data', props: { text: '“This tool cut our build time in half. Absolutely love it.”', name: 'Jamie Rivera', role: 'Product Lead', bg: '#20242d', color: '#e7e9ee' },
    schema: [{ key: 'text', label: 'Quote', type: 'textarea' }, { key: 'name', label: 'Name', type: 'text' }, { key: 'role', label: 'Role', type: 'text' }, C.bg, C.color],
    html: (i) => `<div style="${F}background:${esc(i.props.bg)};color:${esc(i.props.color)};border-radius:14px;padding:18px;${SANS};display:flex;flex-direction:column;gap:12px"><div style="font-size:15px;line-height:1.5">${esc(i.props.text)}</div><div style="margin-top:auto;display:flex;gap:10px;align-items:center"><div style="width:34px;height:34px;border-radius:50%;background:#6c8cff;display:grid;place-items:center;font-weight:700;color:#fff">${esc((i.props.name || '?')[0])}</div><div><div style="font-weight:700;font-size:13px">${esc(i.props.name)}</div><div style="font-size:12px;opacity:.6">${esc(i.props.role)}</div></div></div></div>` });

  /* ----- Export ----- */
  function uiToHTML(doc, title) {
    const items = doc.items.map((i) => {
      const def = registry.ui[i.type]; if (!def) return '';
      return `    <div style="position:absolute;left:${i.x}px;top:${i.y}px;width:${i.w}px;height:${i.h}px;transform:rotate(${+i.rot || 0}deg)">${def.html(i, true)}</div>`;
    }).join('\n');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || 'Vextra UI')}</title>
<style>
  html, body { margin: 0; background: ${esc(doc.bg)}; min-height: 100%; }
  .stage { position: relative; width: ${doc.width}px; height: ${doc.height}px; margin: 0 auto; background: ${esc(doc.bg)}; overflow: hidden; }
</style>
</head>
<body>
  <div class="stage">
${items}
  </div>
</body>
</html>
`;
  }
  VX.components = { registry, register, uiToHTML };
})();
