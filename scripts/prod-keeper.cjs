// 启动生产 dev/start server 并保持进程存活（供 walkthrough BASE_URL 模式使用）
// 用法: node scripts/prod-keeper.cjs
const { spawn } = require('child_process');
const path = require('path');

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const mode = process.env.NOVA_KEEPER_MODE || 'start'; // 'start' = next start, 'dev' = next dev
const args = mode === 'start' ? [nextBin, 'start', '-p', '3100'] : [nextBin, 'dev', '--webpack', '-p', '3100'];

const server = spawn(process.execPath, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_OPTIONS: '--max-old-space-size=8192',
    NEXT_TELEMETRY_DISABLED: '1',
    NOVA_DIST_DIR: process.env.NOVA_DIST_DIR || '.next-prod',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stdout.write(d));
server.on('exit', (c, s) => console.log('[prod-keeper] server exited', c, s));

console.log('[prod-keeper] mode=' + mode, 'PID', server.pid);
// 保持进程存活，等待外部杀掉
setInterval(() => {}, 60000);
