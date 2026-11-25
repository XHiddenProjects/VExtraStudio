/* Vextra Helpdesk – agentless IT helpdesk, computer inventory and package deployment. Zero dependencies (Node 18+), runs on Windows, macOS and Linux.
   "Agentless": nothing is installed on the devices. They are found by looking at your own private network (TCP probes + the ARP table) and managed over
   SSH (the OpenSSH client that ships with Windows 10/11, macOS and Linux). Windows devices are managed through OpenSSH Server + PowerShell.
   Everything that changes a device needs the Vextra app on THIS computer (the same "admin" check as hosting) and is written to an audit log. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const dns = require('dns');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const PORTS = [22, 135, 445, 3389, 5985, 5986, 548, 5900, 80, 443];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'in-progress', 'waiting', 'resolved', 'closed'];
const SLA_HOURS = { low: 72, normal: 24, high: 8, urgent: 4 };
const MAX_OUT = 64 * 1024;

/* ------------------------------------------------------------------ pure helpers (unit-tested) */
const ip2n = (ip) => ip.split('.').reduce((a, x) => a * 256 + (+x), 0);
const n2ip = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const isIp4 = (s) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s);
const isPrivate = (ip) => { if (!isIp4(ip)) return false; const [a, b] = ip.split('.').map(Number); return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254); };
/** "192.168.1.0/24" → { first, last, count } – only private ranges, at most 1024 addresses (a /22). Returns { error } otherwise. */
function parseCidr(c) {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(c || '').trim()); if (!m || !isIp4(m[1])) return { error: 'Use an address range like 192.168.1.0/24' };
  const bits = +m[2]; if (bits < 22 || bits > 32) return { error: 'Ranges from /22 (1024 addresses) to /32 are allowed' };
  if (!isPrivate(m[1])) return { error: 'Only private network ranges (10.x, 172.16–31.x, 192.168.x) can be scanned' };
  const size = 2 ** (32 - bits), base = Math.floor(ip2n(m[1]) / size) * size; if (!isPrivate(n2ip(base)) || !isPrivate(n2ip(base + size - 1))) return { error: 'That range leaves the private network space' };
  return { first: base, last: base + size - 1, count: size, cidr: n2ip(base) + '/' + bits };
}
/** The private subnets of this computer (a /16 or bigger is narrowed to the /24 around the computer's own address). */
function localSubnets(ifaces = os.networkInterfaces()) {
  const out = [], mine = [];
  for (const list of Object.values(ifaces)) for (const a of list || []) {
    if (a.family !== 'IPv4' || a.internal || !isPrivate(a.address)) continue; mine.push(a.address);
    let bits = a.netmask ? a.netmask.split('.').reduce((n, x) => n + (+x).toString(2).replace(/0/g, '').length, 0) : 24; if (bits < 24) bits = 24;
    const c = parseCidr(a.address + '/' + Math.min(bits, 30)); if (c.cidr && !out.includes(c.cidr)) out.push(c.cidr);
  }
  return { cidrs: out, mine };
}
/** Reads `arp -a` (Windows, macOS, Linux) or `ip neigh` output → Map(ip → mac). */
function parseArp(text) {
  const m = new Map();
  for (const l of String(text || '').split(/\r?\n/)) {
    let r = /\(?((?:\d{1,3}\.){3}\d{1,3})\)?\s+(?:at\s+|dev\s+\S+\s+lladdr\s+)?([0-9a-f]{1,2}(?:[:-][0-9a-f]{1,2}){5})/i.exec(l); if (!r) continue;
    const mac = r[2].toLowerCase().split(/[:-]/).map((x) => x.padStart(2, '0')).join(':'); if (mac === 'ff:ff:ff:ff:ff:ff' || mac === '00:00:00:00:00:00' || /^01:00:5e/.test(mac)) continue; m.set(r[1], mac);
  }
  return m;
}
/** A first guess of the operating system from the open ports (confirmed when the device is inspected). */
function guessOs(ports) {
  const p = new Set(ports || []);
  if (p.has(3389) || p.has(5985) || p.has(5986) || (p.has(135) && p.has(445))) return 'windows';
  if (p.has(548) || (p.has(5900) && p.has(22) && !p.has(80))) return 'mac';
  if (p.has(22)) return 'linux';
  return 'unknown';
}
const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";           /* sh single quotes */
const pq = (s) => "'" + String(s).replace(/'/g, "''") + "'";               /* PowerShell single quotes */
const okId = (s) => /^[A-Za-z0-9][A-Za-z0-9._+:@/-]{0,99}$/.test(String(s || ''));
const okVer = (s) => /^[A-Za-z0-9._+:~-]{1,40}$/.test(String(s || ''));
const okSvc = (s) => /^[A-Za-z0-9_.@-]{1,64}$/.test(String(s || ''));
const okHost = (s) => /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(String(s || '')) && !/\.\./.test(s);
const okUser = (s) => /^[A-Za-z0-9_][A-Za-z0-9._@\\ -]{0,63}$/.test(String(s || ''));
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const csvCell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

/* ---- what is run on a device -------------------------------------------------------------------------------------------------- */
const INV = {
  linux: String.raw`LC_ALL=C; export LC_ALL
echo "VX.hostname=$(hostname 2>/dev/null)"; echo "VX.kernel=$(uname -sr)"; echo "VX.arch=$(uname -m)"
if [ -r /etc/os-release ]; then . /etc/os-release; echo "VX.os=${'$'}{PRETTY_NAME:-Linux}"; else echo "VX.os=Linux"; fi
echo "VX.cpu=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//')"
echo "VX.cores=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo)"
echo "VX.memKB=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null)"
echo "VX.uptime=$(cut -d' ' -f1 /proc/uptime 2>/dev/null)"
echo "VX.serial=$(cat /sys/class/dmi/id/product_serial 2>/dev/null)"; echo "VX.vendor=$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null)"; echo "VX.model=$(cat /sys/class/dmi/id/product_name 2>/dev/null)"
echo "VX.user=$(who 2>/dev/null | awk 'NR==1{print $1}')"
df -P -k 2>/dev/null | awk 'NR>1 && $1 ~ /^\// {print "VX.disk=" $6 "|" $2 "|" $3}'
ip -o -4 addr show 2>/dev/null | awk '{print "VX.ip=" $2 "|" $4}'
ip -o link 2>/dev/null | awk '$2 != "lo:" {print "VX.mac=" $17}'
if command -v dpkg >/dev/null 2>&1; then dpkg-query -W -f='VX.sw=${'$'}{Package}|${'$'}{Version}|\n' 2>/dev/null | head -400; elif command -v rpm >/dev/null 2>&1; then rpm -qa --qf 'VX.sw=%{NAME}|%{VERSION}|%{VENDOR}\n' 2>/dev/null | head -400; fi
[ -f /var/run/reboot-required ] && echo "VX.reboot=1"
exit 0`,
  mac: String.raw`export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
echo "VX.hostname=$(hostname)"; echo "VX.kernel=$(uname -sr)"; echo "VX.arch=$(uname -m)"
echo "VX.os=$(sw_vers -productName) $(sw_vers -productVersion)"
echo "VX.cpu=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || uname -m)"; echo "VX.cores=$(sysctl -n hw.ncpu)"
echo "VX.memKB=$(( $(sysctl -n hw.memsize) / 1024 ))"; echo "VX.model=$(sysctl -n hw.model)"
echo "VX.serial=$(system_profiler SPHardwareDataType 2>/dev/null | awk '/Serial Number/{print $NF}')"; echo "VX.vendor=Apple"
echo "VX.user=$(stat -f%Su /dev/console 2>/dev/null)"
echo "VX.uptime=$(( $(date +%s) - $(sysctl -n kern.boottime | sed 's/.*sec = \([0-9]*\).*/\1/') ))"
df -k 2>/dev/null | awk 'NR>1 && $1 ~ /^\/dev\// && $NF !~ /^\/System\/Volumes\/(VM|Preboot|Update|xarts|iSCPreboot|Hardware)/ {print "VX.disk=" $NF "|" $2 "|" $3}'
ifconfig 2>/dev/null | awk '/^[a-z0-9]+:/{i=$1} /inet /{print "VX.ip=" i "|" $2}'
ifconfig en0 2>/dev/null | awk '/ether/{print "VX.mac=" $2}'
if command -v brew >/dev/null 2>&1; then brew list --versions 2>/dev/null | awk '{print "VX.sw=" $1 "|" $2 "|"}' | head -400; fi
ls /Applications 2>/dev/null | sed -n 's/\.app$//p' | awk '{print "VX.sw=" $0 "||"}' | head -200
exit 0`,
  windows: String.raw`$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='SilentlyContinue'
$o=Get-CimInstance Win32_OperatingSystem; $c=Get-CimInstance Win32_ComputerSystem; $b=Get-CimInstance Win32_BIOS; $p=@(Get-CimInstance Win32_Processor)
"VX.hostname=$($c.Name)"; "VX.os=$($o.Caption) $($o.Version)"; "VX.kernel=Windows NT $($o.Version)"; "VX.arch=$($o.OSArchitecture)"
"VX.cpu=$(($p[0].Name -as [string]).Trim())"; "VX.cores=$(($p | Measure-Object NumberOfLogicalProcessors -Sum).Sum)"
"VX.memKB=$([int64]($c.TotalPhysicalMemory/1024))"; "VX.serial=$($b.SerialNumber)"; "VX.vendor=$($c.Manufacturer)"; "VX.model=$($c.Model)"
"VX.user=$($c.UserName)"; "VX.domain=$($c.Domain)"; "VX.uptime=$([int]((Get-Date) - $o.LastBootUpTime).TotalSeconds)"
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { "VX.disk=$($_.DeviceID)|$([int64]($_.Size/1024))|$([int64](($_.Size-$_.FreeSpace)/1024))" }
Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=true' | ForEach-Object { $d=$_.Description; foreach($a in $_.IPAddress){ if($a -match '^\d+\.\d+\.\d+\.\d+$'){ "VX.ip=$d|$a" } }; "VX.mac=$($_.MACAddress)" }
$k='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
Get-ItemProperty $k | Where-Object { $_.DisplayName } | Sort-Object DisplayName -Unique | Select-Object -First 400 | ForEach-Object { "VX.sw=$($_.DisplayName)|$($_.DisplayVersion)|$($_.Publisher)" }
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { 'VX.reboot=1' }
exit 0`,
};
/** Turns the "VX.key=value" lines into an inventory record. */
function parseInventory(text) {
  const inv = { disks: [], ips: [], macs: [], software: [] }, one = {};
  for (let l of String(text || '').split(/\r?\n/)) {
    l = l.trim(); const m = /^VX\.([a-z]+)=(.*)$/.exec(l); if (!m) continue; const k = m[1], v = m[2].slice(0, 300).trim();
    if (k === 'disk') { const [mount, size, used] = v.split('|'); if (mount && +size > 0) inv.disks.push({ mount: mount.slice(0, 80), totalKB: +size || 0, usedKB: +used || 0 }); }
    else if (k === 'ip') { const [nic, addr] = v.split('|'); if (addr && !/^127\./.test(addr)) inv.ips.push({ nic: str(nic, 60), addr: str(addr, 60) }); }
    else if (k === 'mac') { if (/^[0-9a-f:-]{11,17}$/i.test(v) && !inv.macs.includes(v.toLowerCase())) inv.macs.push(v.toLowerCase().replace(/-/g, ':')); }
    else if (k === 'sw') { const [name, ver, pub] = v.split('|'); if (name && inv.software.length < 500) inv.software.push({ name: str(name, 120), version: str(ver, 40), publisher: str(pub, 80) }); }
    else one[k] = v;
  }
  Object.assign(inv, { hostname: one.hostname || '', os: one.os || '', kernel: one.kernel || '', arch: one.arch || '', cpu: one.cpu || '', cores: +one.cores || 0, memKB: +one.memKB || 0, serial: /^(none|n\/a|to be filled.*|default string|system serial number)$/i.test(one.serial || '') ? '' : one.serial || '', vendor: one.vendor || '', model: one.model || '', user: one.user || '', domain: one.domain || '', uptimeS: Math.round(+one.uptime) || 0, rebootPending: one.reboot === '1' });
  return inv;
}
/** The fixed "actions" a technician can run. Nothing here takes free text except a validated service name. */
const ACTIONS = {
  info: { label: 'System summary', change: false, linux: 'uname -a; uptime; free -h 2>/dev/null | head -3', mac: 'uname -a; uptime; vm_stat | head -5', windows: "Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,Version,LastBootUpTime,@{n='FreeMemMB';e={[int]($_.FreePhysicalMemory/1024)}} | Format-List" },
  disks: { label: 'Disk space', change: false, linux: 'df -hP | head -30', mac: 'df -h | head -30', windows: 'Get-PSDrive -PSProvider FileSystem | Format-Table Name,@{n="UsedGB";e={[math]::Round($_.Used/1GB,1)}},@{n="FreeGB";e={[math]::Round($_.Free/1GB,1)}} -AutoSize' },
  processes: { label: 'Busiest processes', change: false, linux: 'ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -15', mac: 'ps -Ao pid,pcpu,pmem,comm -r | head -15', windows: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 Id,ProcessName,@{n="CPU";e={[int]$_.CPU}},@{n="MemMB";e={[int]($_.WorkingSet64/1MB)}} | Format-Table -AutoSize' },
  failed: { label: 'Failed services', change: false, linux: 'systemctl --failed --no-legend 2>/dev/null | head -20 || true', mac: 'launchctl list | awk \'$2 != 0 && $2 != "-"\' | head -20', windows: "Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' } | Select-Object -First 30 Name,Status | Format-Table -AutoSize" },
  network: { label: 'Network settings', change: false, linux: 'ip -br addr 2>/dev/null || ifconfig; ip route 2>/dev/null | head -5', mac: 'ifconfig | grep -E "^[a-z0-9]+:|inet "', windows: 'ipconfig /all' },
  updates: { label: 'Pending updates', change: false, linux: 'if command -v apt-get >/dev/null; then apt list --upgradable 2>/dev/null | head -40; elif command -v dnf >/dev/null; then dnf -q check-update 2>/dev/null | head -40; else echo "No supported package manager"; fi', mac: 'softwareupdate -l 2>&1 | head -30', windows: 'Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 HotFixID,InstalledOn | Format-Table -AutoSize' },
  'flush-dns': { label: 'Flush DNS cache', change: true, linux: 'sudo -n resolvectl flush-caches 2>&1 || sudo -n systemd-resolve --flush-caches 2>&1 || echo "Nothing to flush"', mac: 'sudo -n dscacheutil -flushcache && sudo -n killall -HUP mDNSResponder && echo done', windows: 'Clear-DnsClientCache; "done"' },
  reboot: { label: 'Restart in 1 minute', change: true, linux: 'sudo -n shutdown -r +1 "Restart requested by the helpdesk" 2>&1', mac: 'sudo -n shutdown -r +1 2>&1', windows: 'shutdown /r /t 60 /c "Restart requested by the helpdesk"' },
  'restart-service': { label: 'Restart a service', change: true, param: 'service', linux: (a) => `sudo -n systemctl restart ${sq(a)} && echo restarted`, mac: (a) => `sudo -n launchctl kickstart -k system/${sq(a)} && echo restarted`, windows: (a) => `Restart-Service -Name ${pq(a)} -ErrorAction Stop; "restarted"` },
};
function actionScript(id, osName, param) {
  const a = ACTIONS[id]; if (!a) return { error: 'Unknown action' }; const t = a[osName]; if (!t) return { error: 'Not available for this device type' };
  if (a.param) { if (!okSvc(param)) return { error: 'Type a valid service name' }; return { script: t(param), change: a.change }; }
  return { script: t, change: a.change };
}
/** Package → the script for one OS. Types: winget / choco / msi (windows), os-package (apt/dnf/yum/zypper, linux), brew / pkg (mac), script (any). */
function packageScript(pk, osName) {
  const t = (pk && pk.targets && pk.targets[osName]); if (!t) return { error: 'This package has no ' + osName + ' version' };
  const ver = t.version && okVer(t.version) ? t.version : '';
  if (t.type === 'script') { if (!str(t.script, 20000).trim()) return { error: 'The script is empty' }; return { script: str(t.script, 20000), custom: true }; }
  if (t.type === 'url') return { error: 'Unknown installer type' };
  if (t.type === 'winget') { if (osName !== 'windows' || !okId(t.id)) return { error: 'Invalid winget id' }; return { script: `winget install --id ${pq(t.id)} --exact --silent --accept-package-agreements --accept-source-agreements${ver ? ' --version ' + pq(ver) : ''}; exit $LASTEXITCODE` }; }
  if (t.type === 'choco') { if (osName !== 'windows' || !okId(t.id)) return { error: 'Invalid Chocolatey id' }; return { script: `choco install ${pq(t.id)} -y --no-progress${ver ? ' --version ' + pq(ver) : ''}; exit $LASTEXITCODE` }; }
  if (t.type === 'msi') {
    if (osName !== 'windows' || !/^https:\/\/[^\s'"`$;|&<>]+$/i.test(t.url || '') || !/^[a-f0-9]{64}$/i.test(t.sha256 || '')) return { error: 'An https:// link and the SHA-256 of the installer are required' };
    return { script: `$f=Join-Path $env:TEMP ('vx-'+[guid]::NewGuid()+'.msi'); Invoke-WebRequest -UseBasicParsing -Uri ${pq(t.url)} -OutFile $f; if ((Get-FileHash $f -Algorithm SHA256).Hash -ne ${pq(String(t.sha256).toUpperCase())}) { Remove-Item $f; Write-Error 'Checksum mismatch - nothing was installed'; exit 3 }; $r=Start-Process msiexec.exe -ArgumentList '/i',$f,'/qn','/norestart' -Wait -PassThru; Remove-Item $f; exit $r.ExitCode` };
  }
  if (t.type === 'os-package') { if (osName !== 'linux' || !okId(t.id)) return { error: 'Invalid package name' }; const n = sq(t.id);
    return { script: `if command -v apt-get >/dev/null 2>&1; then sudo -n apt-get update -qq && sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y ${n}; elif command -v dnf >/dev/null 2>&1; then sudo -n dnf install -y ${n}; elif command -v yum >/dev/null 2>&1; then sudo -n yum install -y ${n}; elif command -v zypper >/dev/null 2>&1; then sudo -n zypper --non-interactive install ${n}; else echo "No supported package manager" >&2; exit 4; fi` }; }
  if (t.type === 'brew') { if (osName !== 'mac' || !okId(t.id)) return { error: 'Invalid Homebrew name' }; return { script: `export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; brew install ${sq(t.id)}` }; }
  if (t.type === 'pkg') {
    if (osName !== 'mac' || !/^https:\/\/[^\s'"`$;|&<>]+$/i.test(t.url || '') || !/^[a-f0-9]{64}$/i.test(t.sha256 || '')) return { error: 'An https:// link and the SHA-256 of the installer are required' };
    return { script: `f=$(mktemp /tmp/vx-XXXXXX.pkg) && curl -fsSL ${sq(t.url)} -o "$f" && echo ${sq(String(t.sha256).toLowerCase() + '  ')}"$f" | shasum -a 256 -c - && sudo -n installer -pkg "$f" -target /; r=$?; rm -f "$f"; exit $r` };
  }
  return { error: 'Unknown installer type' };
}

/* ------------------------------------------------------------------ the module */
module.exports = function Helpdesk(deps) {
  const { DATA, send, fail, readJson, isAdmin, authUser, limited, clientIp } = deps;
  const DIR = path.join(DATA, 'helpdesk'); fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const FILE = path.join(DIR, 'helpdesk.json'), KEYF = path.join(DIR, 'vault.key'), KNOWN = path.join(DIR, 'known_hosts');
  const rid = (n = 6) => crypto.randomBytes(n).toString('hex');
  let db = { devices: {}, creds: {}, packages: {}, jobs: {}, tickets: {}, audit: [], settings: { sla: { ...SLA_HOURS }, concurrency: 5, scanRanges: [] }, seq: 0 };
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); db = Object.assign(db, j); db.settings = Object.assign({ sla: { ...SLA_HOURS }, concurrency: 5, scanRanges: [] }, db.settings); } catch { /* new */ }
  let timer = 0; const flush = () => { clearTimeout(timer); const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(db), { mode: 0o600 }); fs.renameSync(t, FILE); };
  const dirty = () => { clearTimeout(timer); timer = setTimeout(flush, 200); timer.unref && timer.unref(); };
  const audit = (who, ip, what) => { db.audit.push({ at: Date.now(), who: str(who, 40), ip: str(ip, 45), what: str(what, 300) }); if (db.audit.length > 3000) db.audit.splice(0, db.audit.length - 3000); dirty(); };

  /* ---- vault: AES-256-GCM, key kept in its own 0600 file. Protects the passwords from being read out of helpdesk.json (backups, shares), not from someone who owns this computer. */
  let vkey = null; try { vkey = fs.readFileSync(KEYF); } catch { /* create below */ }
  if (!vkey || vkey.length !== 32) { vkey = crypto.randomBytes(32); fs.writeFileSync(KEYF, vkey, { mode: 0o600 }); }
  const seal = (text) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', vkey, iv); const d = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: d.toString('base64') }; };
  const unseal = (e) => { const d = crypto.createDecipheriv('aes-256-gcm', vkey, Buffer.from(e.iv, 'base64')); d.setAuthTag(Buffer.from(e.tag, 'base64')); return Buffer.concat([d.update(Buffer.from(e.data, 'base64')), d.final()]).toString('utf8'); };

  /* ---- running things on a device over SSH ---------------------------------------------------------------------------------- */
  let sshChecked = null;
  const sshBin = () => new Promise((res) => { if (sshChecked !== null) return res(sshChecked); execFile(process.platform === 'win32' ? 'where' : 'which', ['ssh'], { timeout: 4000 }, (e, o) => { sshChecked = e ? '' : String(o).split(/\r?\n/)[0].trim(); res(sshChecked); }); });
  /** ssh asks this tiny helper for the password; the helper only prints the VX_PW environment variable, so the password is never written to disk or put on a command line. */
  function askpassFiles() {
    const w = process.platform === 'win32', f = path.join(DIR, w ? 'askpass.cmd' : 'askpass.sh');
    fs.writeFileSync(f, w ? '@echo off\r\nsetlocal EnableDelayedExpansion\r\necho !VX_PW!\r\n' : '#!/bin/sh\nprintf \'%s\\n\' "$VX_PW"\n', { mode: 0o700 }); return f;
  }
  /** The real transport. Returns { code, out }. `script` goes in through stdin, so nothing the admin typed is ever part of a command line. */
  async function sshRun(dev, cred, { script, osName, timeout }) {
    const bin = await sshBin(); if (!bin) return { code: 127, out: 'The OpenSSH client (ssh) was not found on the computer that runs the Vextra server. Windows 10/11: Settings → Apps → Optional features → OpenSSH Client.' };
    if (!okHost(dev.host) || !okUser(cred.user) || cred.user.startsWith('-')) return { code: 126, out: 'Invalid address or user name' };
    const args = ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'UserKnownHostsFile=' + KNOWN, '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=15', '-o', 'LogLevel=ERROR', '-p', String(+dev.port || 22), '-l', cred.user];
    const env = { ...process.env }; let tmpKey = '';
    try {
      if (cred.kind === 'password') { Object.assign(env, { SSH_ASKPASS: askpassFiles(), SSH_ASKPASS_REQUIRE: 'force', DISPLAY: env.DISPLAY || 'vextra:0', VX_PW: unseal(cred.enc) }); args.push('-o', 'PreferredAuthentications=password,keyboard-interactive', '-o', 'PubkeyAuthentication=no', '-o', 'NumberOfPasswordPrompts=1'); }
      else {
        args.push('-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes'); let kp = cred.keyPath;
        if (cred.kind === 'key') { tmpKey = path.join(os.tmpdir(), 'vx-' + rid(8)); fs.writeFileSync(tmpKey, unseal(cred.enc).replace(/\r\n/g, '\n').replace(/\n?$/, '\n'), { mode: 0o600 }); kp = tmpKey; }
        if (kp) args.push('-i', kp);
      }
      args.push(dev.host, osName === 'windows' ? 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -' : 'sh -s');
      return await new Promise((resolve) => {
        const p = spawn(bin, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', done = false;
        const add = (b) => { if (out.length < MAX_OUT) out += b.toString('utf8'); };
        const fin = (code) => { if (done) return; done = true; clearTimeout(t); resolve({ code, out: out.slice(0, MAX_OUT) }); };
        const t = setTimeout(() => { out += '\n[timed out]'; try { p.kill('SIGKILL'); } catch { /* gone */ } fin(124); }, timeout || 60000);
        p.stdout.on('data', add); p.stderr.on('data', add); p.on('error', (e) => { out += e.message; fin(127); }); p.on('close', (c) => fin(c == null ? 1 : c));
        p.stdin.on('error', () => { /* closed early */ }); p.stdin.end(script + '\n');
      });
    } finally { if (tmpKey) try { fs.unlinkSync(tmpKey); } catch { /* gone */ } }
  }
  let runner = sshRun; /* tests plug in a fake one */
  const credOf = (dev) => db.creds[dev.credId];
  async function run(dev, script, osName, timeout) { const cred = credOf(dev); if (!cred) return { code: 125, out: 'No sign-in is chosen for this device' }; return runner(dev, cred, { script, osName: osName || dev.os, timeout }); }
  /** Finds out whether a device runs Windows, macOS or Linux (it can be wrong from the ports alone). */
  async function detectOs(dev) {
    const r = await run(dev, 'uname -s', 'linux', 15000); const o = r.out.trim().split(/\r?\n/).pop();
    if (r.code === 0 && /^Darwin$/i.test(o)) return 'mac'; if (r.code === 0 && /^Linux$/i.test(o)) return 'linux';
    const w = await run(dev, '$PSVersionTable.PSVersion.Major', 'windows', 20000); if (w.code === 0 && /^\d+\s*$/.test(w.out.trim())) return 'windows'; return '';
  }
  async function inventoryOf(dev, ip) {
    const cred = credOf(dev); if (!cred) throw new Error('Choose a sign-in for this device first');
    let osn = dev.os; if (!INV[osn]) { osn = await detectOs(dev); if (!osn) throw new Error('Could not sign in or recognise the system. Check the address, the user and that SSH is on (Windows: OpenSSH Server).'); dev.os = osn; }
    const r = await run(dev, INV[osn], osn, 90000); if (r.code !== 0 && !/VX\./.test(r.out)) throw new Error('Inventory failed (' + r.code + '): ' + r.out.trim().slice(-300));
    dev.inventory = { at: Date.now(), ...parseInventory(r.out) }; if (dev.inventory.hostname && !dev.nameSet) dev.name = dev.inventory.hostname; dev.lastSeen = Date.now(); dev.online = true; dirty(); return dev.inventory;
  }

  /* ---- discovery -------------------------------------------------------------------------------------------------------------- */
  const probe = (host, port, ms = 700) => new Promise((res) => { const s = net.connect({ host, port }); let done = false; const fin = (v) => { if (!done) { done = true; s.destroy(); res(v); } }; s.setTimeout(ms, () => fin(false)); s.once('connect', () => fin(true)); s.once('error', () => fin(false)); });
  const arpText = () => new Promise((res) => { execFile(process.platform === 'win32' ? 'arp' : 'arp', ['-a'], { timeout: 6000, windowsHide: true }, (e, o) => { if (!e && o) return res(o); execFile('ip', ['neigh'], { timeout: 6000 }, (e2, o2) => res(e2 ? '' : o2)); }); });
  const rdns = (ip) => Promise.race([dns.promises.reverse(ip).then((a) => (a[0] || '').replace(/\.$/, '')).catch(() => ''), new Promise((r) => setTimeout(() => r(''), 1500))]);
  const scan = { running: false, total: 0, done: 0, found: [], started: 0, ranges: [], error: '' };
  async function runScan(ranges, who) {
    Object.assign(scan, { running: true, total: ranges.reduce((a, r) => a + r.count, 0), done: 0, found: [], started: Date.now(), ranges: ranges.map((r) => r.cidr), error: '' });
    const mine = new Set(localSubnets().mine); const hits = new Map(); const queue = []; for (const r of ranges) for (let n = r.first; n <= r.last; n++) { const ip = n2ip(n); if (!/\.(0|255)$/.test(ip)) queue.push(ip); }
    scan.total = queue.length;
    const worker = async () => { for (let ip; (ip = queue.shift());) { const open = []; await Promise.all(PORTS.map(async (p) => { if (await probe(ip, p)) open.push(p); })); if (open.length) hits.set(ip, open.sort((a, b) => a - b)); scan.done++; } };
    try {
      await Promise.all(Array.from({ length: 48 }, worker)); const arp = parseArp(await arpText()); const inRange = (ip) => ranges.some((r) => ip2n(ip) >= r.first && ip2n(ip) <= r.last);
      for (const [ip] of arp) if (inRange(ip) && !hits.has(ip) && !/\.(0|255)$/.test(ip)) hits.set(ip, []);
      const found = [];
      for (const [ip, ports] of hits) {
        const mac = arp.get(ip) || ''; let d = Object.values(db.devices).find((x) => (mac && x.mac === mac) || x.ip === ip);
        const name = await rdns(ip);
        if (!d) { d = { id: 'd_' + rid(5), name: name || ip, host: ip, ip, mac, os: guessOs(ports), ports, port: ports.includes(22) ? 22 : 22, credId: '', tags: [], notes: '', firstSeen: Date.now(), lastSeen: Date.now(), online: true, managed: false, source: 'discovered' }; db.devices[d.id] = d; }
        else { d.ip = ip; d.mac = mac || d.mac; d.ports = ports; d.lastSeen = Date.now(); d.online = true; if (d.os === 'unknown' || !d.os) d.os = guessOs(ports); if (name && !d.nameSet && d.name === d.host) d.name = name; if (d.host === d.ip || d.source === 'discovered') d.host = d.managed && d.host !== d.ip ? d.host : ip; }
        found.push({ id: d.id, ip, self: mine.has(ip) });
      }
      for (const d of Object.values(db.devices)) if (d.ip && inRange(d.ip) && !hits.has(d.ip)) d.online = false;
      scan.found = found; audit(who, '', `Scanned ${scan.ranges.join(', ')} – found ${found.length} device(s)`);
    } catch (e) { scan.error = 'Scan failed: ' + e.message; } finally { scan.running = false; dirty(); }
  }

  /* ---- jobs --------------------------------------------------------------------------------------------------------------------- */
  const live = new Set();
  async function runJob(job, work) {
    job.status = 'running'; job.started = Date.now(); dirty(); const ids = Object.keys(job.results); let i = 0, running = 0;
    await new Promise((resolve) => {
      const next = () => { if (i >= ids.length && !running) return resolve(); while (running < (db.settings.concurrency || 5) && i < ids.length) { const id = ids[i++]; running++; const r = job.results[id]; r.status = 'running'; r.started = Date.now();
        Promise.resolve().then(() => work(db.devices[id], r)).catch((e) => { r.status = 'failed'; r.out = str(e.message, 2000); r.code = -1; }).finally(() => { r.ended = Date.now(); running--; dirty(); next(); }); } };
      next();
    });
    const rs = Object.values(job.results); job.status = rs.every((r) => r.status === 'ok') ? 'done' : rs.some((r) => r.status === 'ok') ? 'partial' : 'failed'; job.ended = Date.now(); dirty();
  }
  const newJob = (kind, title, who, ids, extra) => { const j = { id: 'j_' + rid(5), kind, title: str(title, 140), by: who, at: Date.now(), status: 'queued', results: {}, ...extra }; for (const id of ids) j.results[id] = { status: 'queued', code: null, out: '' }; db.jobs[j.id] = j; const keys = Object.keys(db.jobs); if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete db.jobs[k]; dirty(); return j; };
  const finish = (r, x) => { r.code = x.code; r.out = str(x.out, MAX_OUT); r.status = x.code === 0 ? 'ok' : 'failed'; };

  /* ---- views -------------------------------------------------------------------------------------------------------------------- */
  const devView = (d, full) => { const v = { id: d.id, name: d.name, host: d.host, ip: d.ip, mac: d.mac, os: d.os, ports: d.ports || [], port: d.port, credId: d.credId, tags: d.tags || [], notes: d.notes || '', managed: !!d.managed, online: !!d.online, firstSeen: d.firstSeen, lastSeen: d.lastSeen, source: d.source, summary: d.inventory ? { os: d.inventory.os, cpu: d.inventory.cpu, cores: d.inventory.cores, memKB: d.inventory.memKB, serial: d.inventory.serial, model: d.inventory.model, vendor: d.inventory.vendor, at: d.inventory.at, rebootPending: d.inventory.rebootPending, user: d.inventory.user } : null }; if (full) v.inventory = d.inventory || null; return v; };
  const credView = (c) => ({ id: c.id, name: c.name, kind: c.kind, user: c.user, keyPath: c.keyPath || '', hasSecret: !!c.enc });
  const tkView = (t) => ({ ...t, comments: t.comments, overdue: !['resolved', 'closed'].includes(t.status) && t.due < Date.now() });
  const stats = () => { const ds = Object.values(db.devices).filter((d) => d.managed), ts = Object.values(db.tickets), openT = ts.filter((t) => !['resolved', 'closed'].includes(t.status));
    const by = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
    return { devices: ds.length, discovered: Object.values(db.devices).filter((d) => !d.managed).length, online: ds.filter((d) => d.online).length, byOs: by(ds, (d) => d.os || 'unknown'), rebootPending: ds.filter((d) => d.inventory && d.inventory.rebootPending).length, notInventoried: ds.filter((d) => !d.inventory).length,
      tickets: { open: openT.length, overdue: openT.filter((t) => t.due < Date.now()).length, byPriority: by(openT, (t) => t.priority), unassigned: openT.filter((t) => !t.assignee).length }, jobs: Object.values(db.jobs).slice(-5).reverse().map((j) => ({ id: j.id, title: j.title, status: j.status, at: j.at })) }; };
  const ticketFrom = (b, t, who, admin) => {
    const pr = PRIORITIES.includes(b.priority) ? b.priority : t.priority || 'normal';
    t.title = str(b.title != null ? b.title : t.title, 140).trim(); t.body = str(b.body != null ? b.body : t.body, 8000); t.category = str(b.category != null ? b.category : t.category, 40);
    if (admin) { if (STATUSES.includes(b.status)) t.status = b.status; t.assignee = str(b.assignee != null ? b.assignee : t.assignee, 40); if (b.deviceId !== undefined) t.deviceId = db.devices[b.deviceId] ? b.deviceId : ''; }
    if (!t.created) t.created = Date.now(); if (pr !== t.priority) { t.priority = pr; t.due = (t.created || Date.now()) + (db.settings.sla[pr] || 24) * 3600e3; } t.updated = Date.now();
  };

  /* ---- routes ------------------------------------------------------------------------------------------------------------------- */
  async function handle(req, res, url, seg) {
    const m = req.method, ip = clientIp(req), a = seg[2] || '';
    /* people who are signed in to Vextra can raise and follow their own tickets from anywhere */
    if (a === 'my') {
      const u = authUser(req); if (!u) return fail(res, 401, 'Please sign in'); const mine = Object.values(db.tickets).filter((t) => t.requester === u.username);
      if (seg[3] === 'tickets' && !seg[4] && m === 'GET') return send(res, 200, { tickets: mine.map((t) => ({ ...tkView(t), comments: t.comments.filter((c) => !c.internal) })).sort((x, y) => y.updated - x.updated) });
      if (seg[3] === 'tickets' && !seg[4] && m === 'POST') { if (limited(ip, 'hdticket', 10, 3600e3)) return fail(res, 429, 'Too many tickets, try again later'); const b = await readJson(req); if (!str(b.title, 140).trim()) return fail(res, 422, 'Give the ticket a title');
        const t = { id: 't_' + rid(5), num: ++db.seq, requester: u.username, status: 'open', priority: 'normal', assignee: '', deviceId: '', comments: [], created: Date.now() }; ticketFrom({ title: b.title, body: b.body, category: b.category, priority: b.priority === 'urgent' ? 'high' : b.priority }, t, u.username, false); db.tickets[t.id] = t; dirty(); return send(res, 200, { ticket: t }); }
      if (seg[3] === 'tickets' && seg[4] && seg[5] === 'comment' && m === 'POST') { const t = mine.find((x) => x.id === seg[4]); if (!t) return fail(res, 404, 'Not found'); const b = await readJson(req); if (!str(b.text, 4000).trim()) return fail(res, 422, 'Write something'); t.comments.push({ by: u.username, at: Date.now(), text: str(b.text, 4000), internal: false }); if (t.status === 'waiting') t.status = 'open'; t.updated = Date.now(); dirty(); return send(res, 200, { ok: true }); }
      return fail(res, 404, 'Not found');
    }
    if (!isAdmin(req)) return fail(res, 403, 'The helpdesk is managed from the Vextra app on the computer that runs this server');
    const who = 'admin';
    if (a === '' && m === 'GET') { const ssh = await sshBin(); return send(res, 200, { platform: process.platform, ssh: !!ssh, stats: stats(), settings: db.settings, subnets: localSubnets().cidrs, version: 1 }); }
    if (a === 'settings' && m === 'POST') { const b = await readJson(req); const s = db.settings; if (b.concurrency != null) s.concurrency = Math.min(20, Math.max(1, +b.concurrency | 0 || 5)); if (b.sla && typeof b.sla === 'object') for (const k of PRIORITIES) if (+b.sla[k] > 0) s.sla[k] = Math.min(720, +b.sla[k]); if (Array.isArray(b.scanRanges)) { const ok = []; for (const c of b.scanRanges.slice(0, 8)) { const p = parseCidr(c); if (p.error) return fail(res, 422, p.error); ok.push(p.cidr); } s.scanRanges = ok; } audit(who, ip, 'Changed helpdesk settings'); dirty(); return send(res, 200, { settings: s }); }
    if (a === 'audit' && m === 'GET') return send(res, 200, { audit: db.audit.slice(-300).reverse() });
    /* --- discovery --- */
    if (a === 'scan') {
      if (m === 'GET') return send(res, 200, { ...scan, found: scan.found.length, foundList: scan.found });
      if (m === 'POST') { if (scan.running) return fail(res, 409, 'A scan is already running'); if (limited(ip, 'hdscan', 4, 60e3)) return fail(res, 429, 'Wait a moment before scanning again'); const b = await readJson(req);
        const list = Array.isArray(b.cidrs) && b.cidrs.length ? b.cidrs.slice(0, 8) : db.settings.scanRanges.length ? db.settings.scanRanges : localSubnets().cidrs; if (!list.length) return fail(res, 422, 'No private network was found on this computer. Type a range such as 192.168.1.0/24');
        const ranges = []; for (const c of list) { const p = parseCidr(c); if (p.error) return fail(res, 422, p.error); ranges.push(p); } if (ranges.reduce((s, r) => s + r.count, 0) > 2048) return fail(res, 422, 'Scan at most 2048 addresses at a time');
        audit(who, ip, 'Started a scan of ' + ranges.map((r) => r.cidr).join(', ')); runScan(ranges, who); return send(res, 200, { started: true, ranges: ranges.map((r) => r.cidr) }); }
    }
    /* --- devices --- */
    if (a === 'devices') {
      const id = seg[3], op = seg[4];
      if (!id && m === 'GET') return send(res, 200, { devices: Object.values(db.devices).sort((x, y) => String(x.name).localeCompare(String(y.name))).map((d) => devView(d)) });
      if (!id && m === 'POST') { const b = await readJson(req); if (!okHost(b.host)) return fail(res, 422, 'Type an address or host name'); const d = { id: 'd_' + rid(5), name: str(b.name || b.host, 60), host: b.host, ip: isIp4(b.host) ? b.host : '', mac: '', os: ['windows', 'mac', 'linux'].includes(b.os) ? b.os : 'unknown', ports: [], port: Math.min(65535, Math.max(1, +b.port | 0 || 22)), credId: db.creds[b.credId] ? b.credId : '', tags: [], notes: '', firstSeen: Date.now(), lastSeen: 0, online: false, managed: true, nameSet: !!b.name, source: 'manual' }; db.devices[d.id] = d; audit(who, ip, 'Added device ' + d.name); dirty(); return send(res, 200, { device: devView(d) }); }
      const d = db.devices[id]; if (!d) return fail(res, 404, 'No such device');
      if (!op && m === 'GET') return send(res, 200, { device: devView(d, true) });
      if (!op && m === 'PATCH') { const b = await readJson(req); if (b.name != null) { d.name = str(b.name, 60) || d.name; d.nameSet = true; } if (b.host != null) { if (!okHost(b.host)) return fail(res, 422, 'Invalid address'); d.host = b.host; } if (b.port != null) d.port = Math.min(65535, Math.max(1, +b.port | 0 || 22)); if (['windows', 'mac', 'linux', 'unknown'].includes(b.os)) d.os = b.os; if (b.credId !== undefined) d.credId = db.creds[b.credId] ? b.credId : ''; if (b.notes != null) d.notes = str(b.notes, 2000); if (Array.isArray(b.tags)) d.tags = b.tags.slice(0, 10).map((x) => str(x, 24)); if (b.managed != null) { d.managed = !!b.managed; audit(who, ip, (d.managed ? 'Now managing ' : 'Stopped managing ') + d.name); } dirty(); return send(res, 200, { device: devView(d) }); }
      if (!op && m === 'DELETE') { delete db.devices[id]; audit(who, ip, 'Removed device ' + d.name); dirty(); return send(res, 200, { ok: true }); }
      if (op === 'inventory' && m === 'POST') { if (!d.managed) return fail(res, 422, 'Add the device to your inventory first'); try { const inv = await inventoryOf(d); audit(who, ip, 'Inventory of ' + d.name); return send(res, 200, { device: devView(d, true), inventory: inv }); } catch (e) { d.online = false; dirty(); return fail(res, 502, e.message); } }
      if (op === 'action' && m === 'POST') {
        if (!d.managed) return fail(res, 422, 'Add the device to your inventory first'); const b = await readJson(req); const A = ACTIONS[b.action]; if (!A) return fail(res, 422, 'Unknown action'); if (!INV[d.os]) return fail(res, 422, 'Find out the system type first (run an inventory)');
        const s = actionScript(b.action, d.os, b.param); if (s.error) return fail(res, 422, s.error); if (s.change && b.confirm !== true) return fail(res, 422, 'This changes the device – confirm it first');
        audit(who, ip, `Action "${A.label}"${b.param ? ' (' + str(b.param, 64) + ')' : ''} on ${d.name}`); const r = await run(d, s.script, d.os, 60000); return send(res, 200, { code: r.code, out: str(r.out, MAX_OUT) });
      }
    }
    if (a === 'actions' && m === 'GET') return send(res, 200, { actions: Object.entries(ACTIONS).map(([id, x]) => ({ id, label: x.label, change: x.change, param: x.param || '', os: ['windows', 'mac', 'linux'].filter((o) => x[o]) })) });
    /* --- credentials (secrets are write-only) --- */
    if (a === 'creds') {
      const id = seg[3];
      if (!id && m === 'GET') return send(res, 200, { creds: Object.values(db.creds).map(credView) });
      if (!id && m === 'POST') { const b = await readJson(req); if (!okUser(b.user) || String(b.user).startsWith('-')) return fail(res, 422, 'Type the user name used to sign in to the devices'); if (!['password', 'key', 'keyfile'].includes(b.kind)) return fail(res, 422, 'Choose password, key or key file');
        const c = { id: 'c_' + rid(4), name: str(b.name || b.user, 40), kind: b.kind, user: b.user }; if (b.kind === 'keyfile') { if (!str(b.keyPath, 400).trim()) return fail(res, 422, 'Type the path of the private key file'); c.keyPath = str(b.keyPath, 400); } else { if (!str(b.secret, 20000)) return fail(res, 422, b.kind === 'key' ? 'Paste the private key' : 'Type the password'); if (b.kind === 'key' && !/BEGIN [A-Z ]*PRIVATE KEY/.test(b.secret)) return fail(res, 422, 'That does not look like a private key'); c.enc = seal(b.secret); }
        db.creds[c.id] = c; audit(who, ip, `Saved sign-in "${c.name}" (${c.kind})`); dirty(); return send(res, 200, { cred: credView(c) }); }
      if (id && m === 'DELETE') { if (!db.creds[id]) return fail(res, 404, 'Not found'); delete db.creds[id]; for (const d of Object.values(db.devices)) if (d.credId === id) d.credId = ''; audit(who, ip, 'Deleted a saved sign-in'); dirty(); return send(res, 200, { ok: true }); }
    }
    /* --- packages and deployment --- */
    if (a === 'packages') {
      const id = seg[3];
      if (!id && m === 'GET') return send(res, 200, { packages: Object.values(db.packages) });
      if (!id && m === 'POST') { const b = await readJson(req); const name = str(b.name, 60).trim(); if (!name) return fail(res, 422, 'Give the package a name'); const targets = {};
        for (const o of ['windows', 'mac', 'linux']) { const t = b.targets && b.targets[o]; if (!t || !t.type) continue; const probeP = packageScript({ targets: { [o]: t } }, o); if (probeP.error) return fail(res, 422, o + ': ' + probeP.error); targets[o] = { type: t.type, id: str(t.id, 100), version: str(t.version, 40), url: str(t.url, 500), sha256: str(t.sha256, 64), script: str(t.script, 20000) }; }
        if (!Object.keys(targets).length) return fail(res, 422, 'Add an installer for at least one system'); const p = { id: id || 'p_' + rid(4), name, desc: str(b.desc, 300), targets, created: Date.now() }; db.packages[p.id] = p; audit(who, ip, 'Saved package ' + name + (Object.values(targets).some((t) => t.type === 'script') ? ' (custom script)' : '')); dirty(); return send(res, 200, { package: p }); }
      if (id && m === 'DELETE') { delete db.packages[id]; audit(who, ip, 'Deleted a package'); dirty(); return send(res, 200, { ok: true }); }
    }
    if (a === 'deploy' && m === 'POST') {
      const b = await readJson(req); const pk = db.packages[b.packageId]; if (!pk) return fail(res, 404, 'Choose a package'); const ids = [...new Set(Array.isArray(b.deviceIds) ? b.deviceIds : [])].slice(0, 200).filter((i) => db.devices[i] && db.devices[i].managed);
      if (!ids.length) return fail(res, 422, 'Choose at least one device'); if (b.dryRun !== true && b.confirm !== true) return fail(res, 422, 'Confirm the deployment first');
      for (const i of ids) { const d = db.devices[i]; if (!d.credId) return fail(res, 422, `“${d.name}” has no sign-in chosen`); if (!INV[d.os]) return fail(res, 422, `“${d.name}”: run an inventory first so the system type is known`); }
      const job = newJob('deploy', (b.dryRun ? 'Check: ' : 'Deploy: ') + pk.name, who, ids, { dryRun: !!b.dryRun, packageId: pk.id }); audit(who, ip, `${b.dryRun ? 'Dry run of' : 'Deployed'} “${pk.name}” to ${ids.length} device(s)`);
      runJob(job, async (d, r) => { const s = packageScript(pk, d.os); if (s.error) { r.status = 'skipped'; r.out = s.error; r.code = null; return; }
        if (b.dryRun) { const t = await run(d, d.os === 'windows' ? '"connected as " + $env:USERNAME' : 'echo "connected as $(id -un)"', d.os, 25000); r.out = (t.code === 0 ? t.out.trim() + '\nReady – the installer would run now.' : t.out.trim()) + (s.custom ? '\nThis package runs a custom script.' : ''); r.status = t.code === 0 ? 'ok' : 'failed'; r.code = t.code; return; }
        finish(r, await run(d, s.script, d.os, 20 * 60000)); });
      return send(res, 200, { job: { id: job.id } });
    }
    if (a === 'jobs') { const id = seg[3]; if (!id && m === 'GET') return send(res, 200, { jobs: Object.values(db.jobs).sort((x, y) => y.at - x.at).slice(0, 60).map((j) => ({ id: j.id, kind: j.kind, title: j.title, status: j.status, at: j.at, dryRun: !!j.dryRun, count: Object.keys(j.results).length, ok: Object.values(j.results).filter((r) => r.status === 'ok').length })) });
      if (id && m === 'GET') { const j = db.jobs[id]; if (!j) return fail(res, 404, 'Not found'); return send(res, 200, { job: { ...j, results: Object.fromEntries(Object.entries(j.results).map(([k, r]) => [k, { ...r, name: db.devices[k] ? db.devices[k].name : k }])) } }); } }
    if (a === 'inventory-all' && m === 'POST') { const ids = Object.values(db.devices).filter((d) => d.managed && d.credId).map((d) => d.id); if (!ids.length) return fail(res, 422, 'No managed device has a sign-in yet'); const job = newJob('inventory', 'Inventory of all devices', who, ids); audit(who, ip, `Inventory of ${ids.length} device(s)`); runJob(job, async (d, r) => { try { await inventoryOf(d); r.status = 'ok'; r.code = 0; r.out = 'Inventory updated'; } catch (e) { d.online = false; r.status = 'failed'; r.code = 1; r.out = e.message; } }); return send(res, 200, { job: { id: job.id } }); }
    /* --- tickets --- */
    if (a === 'tickets') {
      const id = seg[3], op = seg[4];
      if (!id && m === 'GET') { const q = (url.searchParams.get('q') || '').toLowerCase(), st = url.searchParams.get('status'); let l = Object.values(db.tickets); if (st === 'active') l = l.filter((t) => !['resolved', 'closed'].includes(t.status)); else if (st) l = l.filter((t) => t.status === st); if (q) l = l.filter((t) => (t.title + ' ' + t.body + ' ' + t.requester + ' #' + t.num).toLowerCase().includes(q)); return send(res, 200, { tickets: l.sort((x, y) => y.updated - x.updated).slice(0, 300).map(tkView) }); }
      if (!id && m === 'POST') { const b = await readJson(req); if (!str(b.title, 140).trim()) return fail(res, 422, 'Give the ticket a title'); const t = { id: 't_' + rid(5), num: ++db.seq, requester: str(b.requester, 40) || 'admin', status: 'open', priority: 'normal', assignee: '', deviceId: '', comments: [], created: Date.now() }; ticketFrom(b, t, who, true); db.tickets[t.id] = t; audit(who, ip, 'Opened ticket #' + t.num); dirty(); return send(res, 200, { ticket: tkView(t) }); }
      const t = db.tickets[id]; if (!t) return fail(res, 404, 'No such ticket');
      if (!op && m === 'PATCH') { const b = await readJson(req); const was = t.status; ticketFrom(b, t, who, true); if (was !== t.status) audit(who, ip, `Ticket #${t.num} ${was} → ${t.status}`); dirty(); return send(res, 200, { ticket: tkView(t) }); }
      if (!op && m === 'DELETE') { delete db.tickets[id]; audit(who, ip, 'Deleted ticket #' + t.num); dirty(); return send(res, 200, { ok: true }); }
      if (op === 'comment' && m === 'POST') { const b = await readJson(req); if (!str(b.text, 4000).trim()) return fail(res, 422, 'Write something'); t.comments.push({ by: who, at: Date.now(), text: str(b.text, 4000), internal: b.internal === true }); t.updated = Date.now(); dirty(); return send(res, 200, { ticket: tkView(t) }); }
    }
    /* --- exports --- */
    if (a === 'export' && m === 'GET') {
      const what = seg[3]; const head = (name) => ({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
      if (what === 'inventory.csv') { const rows = [['Name', 'Address', 'MAC', 'System', 'OS version', 'CPU', 'Cores', 'Memory GB', 'Serial', 'Vendor', 'Model', 'Last user', 'Last seen', 'Online']]; for (const d of Object.values(db.devices).filter((x) => x.managed)) { const i = d.inventory || {}; rows.push([d.name, d.host, d.mac, d.os, i.os, i.cpu, i.cores, i.memKB ? (i.memKB / 1048576).toFixed(1) : '', i.serial, i.vendor, i.model, i.user, d.lastSeen ? new Date(d.lastSeen).toISOString() : '', d.online ? 'yes' : 'no']); } return send(res, 200, rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', head('inventory.csv')); }
      if (what === 'software.csv') { const rows = [['Device', 'Software', 'Version', 'Publisher']]; for (const d of Object.values(db.devices).filter((x) => x.managed && x.inventory)) for (const s of d.inventory.software) rows.push([d.name, s.name, s.version, s.publisher]); return send(res, 200, rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', head('software.csv')); }
      if (what === 'tickets.csv') { const rows = [['#', 'Title', 'Status', 'Priority', 'Requester', 'Assignee', 'Opened', 'Due', 'Updated']]; for (const t of Object.values(db.tickets)) rows.push([t.num, t.title, t.status, t.priority, t.requester, t.assignee, new Date(t.created).toISOString(), new Date(t.due).toISOString(), new Date(t.updated).toISOString()]); return send(res, 200, rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', head('tickets.csv')); }
    }
    return fail(res, 404, 'Not found');
  }
  return { handle, flush, _t: { db: () => db, setRunner: (f) => { runner = f; }, seal, unseal, inventoryOf, runScan, scan, probe } };
};
Object.assign(module.exports, { parseCidr, localSubnets, parseArp, guessOs, parseInventory, packageScript, actionScript, INV, ACTIONS, sq, pq, csvCell, isPrivate, okHost, okUser, PORTS });
