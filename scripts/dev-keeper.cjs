// 启动 dev server 并保持进程存活（供 debug-generate.mjs 使用）
const { spawn } = require('child_process');
const path = require('path');

const NEXT = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const server = spawn(process.execPath, [NEXT, 'dev', '--webpack', '-p', '3100'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stdout.write(d));
server.on('exit', (c, s) => console.log('[dev-server] exited', c, s));

console.log('[keeper] dev server PID', server.pid);
// 保持进程存活，等待外部杀掉
setInterval(() => {}, 60000);
