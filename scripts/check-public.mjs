// Review candidate source files only; ignored homes and Git credentials are never read.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
const forbiddenPaths = /^(?:data|runtime|\.local|node_modules|packages|downloads)\/|(?:^|\/)\.env(?:\..*)?$|\.(?:db|sqlite\d*|log|pem|key|pfx|p12)(?:-\w+)?$/i;
const rules = [
  ['private-host-path', /[A-Z]:[\\/](?:Users[\\/]|Programs_eson[\\/])/i],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['api-key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['account-binding', /\b(?:OWNER_QQ|BOT_QQ|ADMIN_QQ)\s*=\s*['"]?\d{5,}/],
];
const findings = [];
for (const name of new Set(names)) {
  if (forbiddenPaths.test(name)) { findings.push({ file: name, rule: 'private-or-generated-path' }); continue; }
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) { findings.push({ file: name, rule: 'unexpected-file' }); continue; }
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) { findings.push({ file: name, rule: 'binary' }); continue; }
  const content = buffer.toString('utf8');
  for (const [rule, pattern] of rules) if (pattern.test(content)) findings.push({ file: name, rule });
}
console.log(JSON.stringify({ status: findings.length ? 'blocked' : 'passed', files: new Set(names).size, findings }));
process.exitCode = findings.length ? 1 : 0;
