/* Vextra game editor – headless playtest. Runs the exported game in a hidden, sandboxed iframe, presses keys, collects errors and takes screenshots.
   Used by the AI add-on ("play-test and look at the result"); also available to plugins as forge.game.playtest().
   The frame is sandboxed WITHOUT allow-same-origin (like Play): it cannot reach the editor. Every message carries a one-time token. */
(function () {
  const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', space: ' ', enter: 'Enter', esc: 'Escape', escape: 'Escape', shift: 'Shift', tab: 'Tab' };
  const keyOf = (k) => { k = String(k || '').trim(); const l = k.toLowerCase(); if (KEYS[l]) return KEYS[l]; if (/^arrow/i.test(k)) return 'Arrow' + k.slice(5, 6).toUpperCase() + k.slice(6).toLowerCase(); return k.length === 1 ? k : k.charAt(0).toUpperCase() + k.slice(1); };
  const codeOf = (key) => (key === ' ' ? 'Space' : /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : /^[0-9]$/.test(key) ? 'Digit' + key : key);

  /* runs INSIDE the game frame (first thing in <head>): keeps the WebGL buffer readable, records errors, answers commands */
  const PROBE = `(function(){var T=__TOKEN__,errs=[],frames=0;
var gc=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,o){if(/webgl/i.test(t)){o=Object.assign({},o||{},{preserveDrawingBuffer:true})}return gc.call(this,t,o)};
function err(m){if(errs.length<30)errs.push(String(m).slice(0,400))}
addEventListener('error',function(e){err(e.message+(e.lineno?' (line '+e.lineno+')':''))});addEventListener('unhandledrejection',function(e){err('Promise rejected: '+(e.reason&&e.reason.message||e.reason))});
var ce=console.error;console.error=function(){try{err([].slice.call(arguments).join(' '))}catch(_){}return ce.apply(console,arguments)};
(function loop(){frames++;requestAnimationFrame(loop)})();
function post(id,d){parent.postMessage(Object.assign({vx:'probe',token:T,id:id},d),'*')}
function canvas(){var best=null,a=0;[].forEach.call(document.querySelectorAll('canvas'),function(c){var s=c.width*c.height;if(s>a){a=s;best=c}});return best}
function shot(maxW){var c=canvas();if(!c)return{ok:false,why:'no canvas'};var w=Math.min(maxW||640,c.width),h=Math.round(c.height*w/c.width),o=document.createElement('canvas');o.width=w;o.height=h;var x=o.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,w,h);try{x.drawImage(c,0,0,w,h);var s=x.getImageData(0,0,w,h).data,seen={},n=0;for(var i=0;i<s.length;i+=4*Math.max(1,Math.floor(s.length/4/400))){var k=(s[i]>>4)+','+(s[i+1]>>4)+','+(s[i+2]>>4);if(!seen[k]){seen[k]=1;n++}}return{ok:true,data:o.toDataURL('image/jpeg',0.62),w:w,h:h,colors:n}}catch(e){return{ok:false,why:String(e.message)}}}
function key(type,k,code){var e=new KeyboardEvent(type,{key:k,code:code,bubbles:true,cancelable:true});window.dispatchEvent(e)}
function state(){var g=window.__vxGame,o={frames:frames,errors:errs.slice(),text:(document.body.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300)};if(g){try{o.scene=g.scene&&g.scene.name;o.time=Math.round(g.time*100)/100;o.fps=Math.round(g.fps||0);o.paused=!!g.paused;var v={},n=0;for(var k in g.vars){if(n++>30)break;var x=g.vars[k];v[k]=(typeof x==='object'&&x!==null)?'[object]':x}o.vars=v;o.objects=(g.objects||[]).filter(function(q){return q&&q.alive&&q.type!=='camera'}).slice(0,40).map(function(q){return{name:q.name,type:q.type,x:Math.round(q.x),y:Math.round(q.y),z:q.z===undefined?undefined:Math.round(q.z)}})}catch(e){o.stateError=String(e.message)}}return o}
addEventListener('message',function(e){var d=e.data;if(!d||d.vx!=='probe-cmd'||d.token!==T)return;
if(d.cmd==='state')post(d.id,{state:state()});
else if(d.cmd==='shot')post(d.id,{shot:shot(d.w),state:state()});
else if(d.cmd==='key'){key(d.down?'keydown':'keyup',d.key,d.code);post(d.id,{})}
else if(d.cmd==='click'){var c=canvas();if(c){var r=c.getBoundingClientRect(),X=r.left+d.x*r.width,Y=r.top+d.y*r.height,o={clientX:X,clientY:Y,bubbles:true,button:0,pointerId:1,pointerType:'mouse',isPrimary:true};['pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(t){(c.dispatchEvent(new (/^pointer/.test(t)?PointerEvent:MouseEvent)(t,o)))})}post(d.id,{})}
else post(d.id,{})});
post('ready',{});})();`;

  const run = (project, script, opts = {}) => new Promise((resolve) => {
    const started = Date.now(), W = opts.width || 640, H = opts.height || 360, limit = Math.min(60000, opts.timeout || 25000);
    const chan = { token: VX.channel.token(), origin: VX.channel.origin() };
    const res = { ok: true, errors: [], logs: [], shots: [], state: null, notes: [] };
    const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    /* inside the viewport (a cross-origin frame that is scrolled out of view is throttled by the browser) but invisible and untouchable */
    frame.style.cssText = `position:fixed;right:4px;bottom:4px;width:${W}px;height:${H}px;border:0;opacity:.001;pointer-events:none;z-index:-1`;
    /* visible mode: the game is shown in a small floating window while the AI plays, with what it is doing and a Stop button */
    let win = null, cap = null, stopped = false;
    if (opts.visible) {
      const k = 0.72; win = document.createElement('div'); win.setAttribute('role', 'status'); win.style.cssText = `position:fixed;right:14px;bottom:14px;z-index:99998;width:${Math.round(W * k)}px;background:#12151c;color:#e6e9ef;border:1px solid #3b4358;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);overflow:hidden;font:12px system-ui,sans-serif`;
      const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;background:#1b2030'; const dot = document.createElement('span'); dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#e55;animation:vxpt 1s infinite'; const ttl = document.createElement('b'); ttl.style.flex = '1'; ttl.textContent = opts.title || 'AI is play-testing your game'; const stopB = document.createElement('button'); stopB.textContent = '■ Stop'; stopB.style.cssText = 'cursor:pointer;border:0;border-radius:6px;padding:2px 8px;background:#c0392b;color:#fff;font:inherit'; stopB.onclick = () => { stopped = true; res.notes.push('The playtest was stopped by the user.'); finish(); };
      const st = document.createElement('style'); st.textContent = '@keyframes vxpt{50%{opacity:.25}}'; head.append(st, dot, ttl, stopB);
      const box = document.createElement('div'); box.style.cssText = `width:${Math.round(W * k)}px;height:${Math.round(H * k)}px;overflow:hidden;background:#000;position:relative`;
      frame.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;border:0;transform:scale(${k});transform-origin:0 0;pointer-events:none`; box.append(frame);
      cap = document.createElement('div'); cap.style.cssText = 'padding:4px 8px;min-height:16px;color:#9fb0d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; cap.textContent = 'starting the game…'; win.append(head, box, cap);
    }
    const say = (t) => { if (cap) cap.textContent = t; };
    let done = false, seq = 0; const waiting = new Map(); let readyRes;
    const ready = new Promise((r) => { readyRes = r; });
    const finish = (extra) => { if (done) return; done = true; clearTimeout(killer); window.removeEventListener('message', onMsg); try { if (win) { say(stopped ? 'stopped' : res.errors.length ? '⚠ ' + res.errors.length + ' error(s) found' : '✓ finished'); const w = win; setTimeout(() => { try { w.remove(); } catch { /* gone */ } }, stopped ? 200 : 1600); } frame.remove(); } catch { /* gone */ } res.ms = Date.now() - started; if (extra) Object.assign(res, extra); resolve(res); };
    const killer = setTimeout(() => { res.notes.push('The playtest hit its time limit and was stopped.'); finish(); }, limit);
    const onMsg = (e) => {
      if (e.source !== frame.contentWindow) return; const d = e.data; if (!d || d.token !== chan.token) return;
      if (d.vx === 'log') { const t = String(d.text || '').slice(0, 400); if (d.level === 'error') { if (res.errors.length < 30) res.errors.push(t); } else if (res.logs.length < 40) res.logs.push(`${d.level}: ${t}`); return; }
      if (d.vx !== 'probe') return; if (d.id === 'ready') { readyRes(); return; }
      const w = waiting.get(d.id); if (w) { waiting.delete(d.id); w(d); }
    };
    window.addEventListener('message', onMsg);
    const cmd = (c, extra) => new Promise((r) => { const id = 'c' + ++seq; waiting.set(id, r); try { frame.contentWindow.postMessage(Object.assign({ vx: 'probe-cmd', token: chan.token, id, cmd: c }, extra), '*'); } catch { waiting.delete(id); r({}); } setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); r({}); } }, 4000); });
    const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Math.min(8000, ms))));
    (async () => {
      let html; try { html = await VX.gameExport.toHTML(project, { channel: chan }); } catch (e) { res.ok = false; res.errors.push('Could not build the game: ' + e.message); return finish(); }
      html = html.replace(/<head>/i, () => '<head><script>' + PROBE.replace('__TOKEN__', JSON.stringify(chan.token)) + '</script>');
      document.body.append(win || frame); frame.srcdoc = html;
      const up = await Promise.race([ready.then(() => true), sleep(8000).then(() => false)]); if (!up) { res.ok = false; res.errors.push('The game did not start within 8 seconds.'); return finish(); }
      /* wait until the game is actually running (assets decoded, first frames drawn) */
      let st = null; for (let i = 0; i < 24; i++) { await sleep(250); const r = await cmd('state'); st = r.state; if (st && st.scene && st.frames > 8 && st.objects) break; }
      if (!st || !st.scene) res.notes.push('The game did not report a running scene (it may still be loading, or it crashed – see errors).');
      if (st) res.state0 = JSON.parse(JSON.stringify(st));
      const steps = Array.isArray(script) && script.length ? script.slice(0, 40) : [{ wait: 1200 }, { shot: true }];
      let shots = 0, held = new Set();
      for (const s of steps) {
        if (done) return; if (!s || typeof s !== 'object') continue;
        if (s.wait !== undefined) { say('waiting ' + Math.round((+s.wait || 0) / 100) / 10 + ' s…'); await sleep(+s.wait || 0); }
        else if (s.key !== undefined || s.press !== undefined) { const k = keyOf(s.key ?? s.press), code = codeOf(k); say((s.press !== undefined ? 'pressing ' : 'holding ') + (k === ' ' ? 'Space' : k) + (s.press !== undefined ? '' : ' for ' + Math.round((+s.hold || 300) / 100) / 10 + ' s')); await cmd('key', { key: k, code, down: true }); held.add(k); await sleep(s.press !== undefined ? 90 : +s.hold || 300); await cmd('key', { key: k, code, down: false }); held.delete(k); }
        else if (s.click !== undefined) { const p = s.click || {}; say('clicking the screen'); await cmd('click', { x: Math.max(0, Math.min(1, +p.x || 0.5)), y: Math.max(0, Math.min(1, +p.y || 0.5)) }); }
        else if (s.shot) { say('taking a screenshot'); if (shots >= (opts.maxShots || 4)) { res.notes.push('Screenshot limit reached (' + (opts.maxShots || 4) + ').'); continue; } const r = await cmd('shot', { w: opts.shotWidth || 640 }); if (r.shot && r.shot.ok) { shots++; res.shots.push({ label: String(s.label || 'screenshot ' + shots).slice(0, 60), data: r.shot.data, w: r.shot.w, h: r.shot.h, colors: r.shot.colors }); } else res.notes.push('Screenshot failed: ' + ((r.shot && r.shot.why) || 'no answer')); }
      }
      const fin = await cmd('state'); res.state = fin.state || st; if (res.state && res.state.errors) for (const e of res.state.errors) if (!res.errors.includes(e) && res.errors.length < 30) res.errors.push(e);
      if (res.state0) delete res.state0.errors; if (res.state) { delete res.state.errors; if (res.state.frames < 5) res.notes.push('Almost no frames were drawn – the game may have crashed on start.'); }
      for (const sh of res.shots) if (sh.colors <= 2) res.notes.push(`"${sh.label}" looks blank (nearly one colour): nothing is being drawn, or everything is off-screen.`);
      finish();
    })().catch((e) => { res.ok = false; res.errors.push(String(e && e.message || e)); finish(); });
  });


  /* A web page: renders it in a hidden sandboxed frame, collects script errors and rasterises the DOM (best effort: external images / web fonts are not available inside the sandbox). */
  const PAGE_PROBE = `(function(){var T=__TOKEN__,errs=[];addEventListener('error',function(e){if(errs.length<20)errs.push(String(e.message).slice(0,300))});addEventListener('unhandledrejection',function(e){errs.push('Promise rejected: '+(e.reason&&e.reason.message||e.reason))});
var ce=console.error;console.error=function(){try{errs.push([].slice.call(arguments).join(' ').slice(0,300))}catch(_){}return ce.apply(console,arguments)};
function done(d){parent.postMessage(Object.assign({vx:'probe',token:T,id:'page',errors:errs.slice(0,20)},d),'*')}
addEventListener('load',function(){setTimeout(function(){var de=document.documentElement,W=innerWidth,H=Math.min(Math.max(de.scrollHeight,innerHeight),__MAXH__);
var info={text:(document.body.innerText||'').replace(/\\s+/g,' ').trim().slice(0,500),title:document.title,headings:[].slice.call(document.querySelectorAll('h1,h2,h3')).slice(0,12).map(function(h){return h.textContent.trim().slice(0,60)}),links:document.querySelectorAll('a').length,images:document.querySelectorAll('img').length,forms:document.querySelectorAll('form').length,scrollW:de.scrollWidth,scrollH:de.scrollHeight,hOverflow:de.scrollWidth>W+2};
var broken=[].filter.call(document.querySelectorAll('img'),function(i){return i.complete&&!i.naturalWidth}).length;info.brokenImages=broken;
try{var x=new XMLSerializer().serializeToString(de);var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'"><foreignObject x="0" y="0" width="100%" height="100%">'+x+'</foreignObject></svg>';var im=new Image();im.onload=function(){try{var c=document.createElement('canvas'),k=Math.min(1,__SHOTW__/W);c.width=Math.round(W*k);c.height=Math.round(H*k);var g=c.getContext('2d');var bg=getComputedStyle(document.body).backgroundColor,bh=getComputedStyle(de).backgroundColor;g.fillStyle=(bh&&bh!=='rgba(0, 0, 0, 0)')?bh:(bg&&bg!=='rgba(0, 0, 0, 0)')?bg:'#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);info.shot=c.toDataURL('image/jpeg',0.62);info.w=c.width;info.h=c.height}catch(e){info.shotError=String(e.message)}done({info:info})};im.onerror=function(){info.shotError='could not rasterise the page';done({info:info})};im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}catch(e){info.shotError=String(e.message);done({info:info})}},700)});})();`;
  const page = (html, opts = {}) => new Promise((resolve) => {
    const W = opts.width || 1000, H = opts.height || 700, chan = { token: VX.channel.token() }; const res = { ok: true, errors: [], info: null, shots: [], notes: [] };
    const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1; frame.style.cssText = `position:fixed;right:4px;bottom:4px;width:${W}px;height:${H}px;border:0;opacity:.001;pointer-events:none;z-index:-1`;
    let done = false; const end = () => { if (done) return; done = true; clearTimeout(kill); window.removeEventListener('message', on); try { frame.remove(); } catch { /* gone */ } resolve(res); };
    const kill = setTimeout(() => { res.notes.push('The page did not finish loading within 12 seconds.'); end(); }, 12000);
    const on = (e) => { if (e.source !== frame.contentWindow) return; const d = e.data; if (!d || d.vx !== 'probe' || d.token !== chan.token || d.id !== 'page') return; res.errors = d.errors || []; res.info = d.info || null; if (d.info && d.info.shot) { res.shots.push({ label: opts.label || 'page', data: d.info.shot, w: d.info.w, h: d.info.h }); delete d.info.shot; } else if (d.info && d.info.shotError) res.notes.push('No screenshot: ' + d.info.shotError + ' – the text report below is still accurate.'); end(); };
    window.addEventListener('message', on);
    const probe = '<script>' + PAGE_PROBE.replace('__TOKEN__', JSON.stringify(chan.token)).replace('__MAXH__', String(opts.maxHeight || 2400)).replace('__SHOTW__', String(opts.shotWidth || 800)) + '</script>';
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + probe) : probe + html; document.body.append(frame); frame.srcdoc = html;
  });

  VX.playtest = { run, page, keyOf };
})();
