// 一体化流水线：启动 dev server → 等待就绪 → 运行录屏 → 生成报告 → 关闭 server。
// 用 node 进程树把整条链路包在一个后台任务里，避免"回合切换杀掉半途任务"的问题。
// 用法: node scripts/run-full-pipeline.cjs  [--no-report]
'use strict';
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath; // 当前 node 绝对路径（managed 22.22.2）
const NEXT = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
const WALK = path.join(ROOT, 'scripts', 'real-course-walkthrough.mjs');
const REPORT = path.join(ROOT, 'scripts', 'build-course-report.mjs');
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

const NO_REPORT = process.argv.includes('--no-report');
// 每次运行使用全新 distDir（如 .next-run-<ts>）：沙箱"文件出身"规则下，
// 只有本次进程亲手创建的目录才可写；复用旧 distDir 会因前次进程（尤其分离进程）
// 创建的文件触发 EPERM。通过环境变量传给 next dev（next.config.ts 读取）。
const DIST_DIR = process.env.NOVA_DIST_DIR || `.next-run-${Date.now()}`;
const log = (...a) => console.log(`[pipeline ${new Date().toISOString()}]`, ...a);

function waitPort(url, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let n = 0;
    const probe = () => {
      n += 1;
      // 探测超时放宽到 15s：Next/Turbopack 首次请求 /api/health 需要现场编译该路由
      // （慢文件系统下可达 10s+），4s 超时必然误判"未就绪"。
      fetch(url, { signal: AbortSignal.timeout(15000) })
        .then((r) => {
          log(`health probe #${n}: status=${r.status}`);
          return r.ok ? resolve(true) : schedule();
        })
        .catch((e) => {
          log(`health probe #${n}: ERR ${e.name}: ${e.message.slice(0, 80)}`);
          schedule();
        });
    };
    const schedule = () => {
      if (Date.now() - t0 > timeoutMs) return resolve(false);
      setTimeout(probe, 3000);
    };
    probe();
  });
}

function waitProcessExit(child, label) {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      try {
        process.kill(child.pid, 0); // 存活检查（0 信号不杀进程）
      } catch {
        clearInterval(timer);
        resolve();
      }
    }, 3000);
    child.once('exit', () => {
      clearInterval(timer);
      resolve();
    });
  });
}

(async () => {
  // 启动标记（供外部跨回合确认进程已起来）
  try {
    fs.mkdirSync(path.join(ROOT, '.detach-test'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '.detach-test', `pipeline-started-${process.pid}.txt`), `${new Date().toISOString()}\n`);
  } catch {}

  // 0) 清理可能残留的 3100 端口占用（本机只有这个 dev server 用 3100）
  try {
    execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf8' });
    log(`端口 ${PORT} 已被占用，先结束旧 server 进程`);
    const out = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf8' });
    const pids = new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean));
    for (const pid of pids) {
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); log(`killed PID ${pid}`); } catch {}
    }
  } catch {}

  // 1) 启动 dev server（子进程，保持在同一进程树）
  log(`启动 dev server... distDir=${DIST_DIR}`);
  const server = spawn(NODE, [NEXT, 'dev', '--turbopack', '-p', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development', NOVA_DIST_DIR: DIST_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => {
    const s = d.toString();
    // 过滤已知的无害模块缺失告警，保留其余
    if (!s.includes('@upstash') && !s.includes('rate-limit.ts') && !s.includes('Module not found') && !s.includes('Import trace') && !s.includes('App Route')) {
      process.stderr.write(`[server-err] ${s}`);
    }
  });
  server.once('error', (e) => log('server spawn error:', e.message));
  server.once('exit', (code, sig) => log(`server exited early: code=${code} sig=${sig}`));

  const ready = await waitPort(`${BASE}/api/health`, 180_000);
  if (!ready) {
    log('服务器未就绪，中止');
    server.kill();
    process.exit(1);
  }
  log('服务器就绪');

  // 2) 跑录屏 walkthrough（串行等它结束）
  log('开始录屏 walkthrough...');
  const walk = spawn(NODE, [WALK], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  const walkCode = await new Promise((resolve) => walk.once('exit', (c) => resolve(c ?? -1)));
  log(`walkthrough 退出码: ${walkCode}`);

  // 3) walkthrough 结束后停在这里——报告数据（quiz/chat 实录）需人工从截图 OCR 后填入，
  //    build-course-report.mjs 由主流程另行调用，避免流水线里生成"待填充"占位报告。
  log('walkthrough 完成，跳过自动报告生成（等待主流程 OCR 填数据）');

  // 4) 收尾：关掉 dev server，让进程树干净退出
  log('关闭 dev server...');
  try { server.kill(); } catch {}
  await waitProcessExit(server, 'server');
  log('PIPELINE DONE');
  // 完成标记（供外部跨回合轮询判定）
  try {
    fs.mkdirSync(path.join(ROOT, '.detach-test'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '.detach-test', `pipeline-done-${process.pid}.txt`), `${new Date().toISOString()} code=${walkCode}\n`);
  } catch {}
  process.exit(walkCode === 0 ? 0 : 1);
})().catch((e) => {
  console.error('[pipeline] FATAL:', e);
  process.exit(2);
});
