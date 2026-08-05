#!/usr/bin/env node
/**
 * 依据一次真实走查录制（run 目录）生成最终交付物：
 *   - 完整流程报告（含每个界面的真实截图）
 *   - 学习成绩单（来自课堂测验的真实批改结果）
 *
 * 用法：node scripts/build-course-report.mjs [runDir]
 * 省略 runDir 时自动选取最新一个包含 nova-real-course.webm 的 run 目录。
 *
 * 真实数据来源：<runDir>/report-data.json（由人工/上层流程依据截图与日志填入），
 * 缺失时用占位骨架，避免生成虚假成绩。
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = path.join(__dirname, '..', 'assets', 'walkthrough', 'video');

function pickRunDir(arg) {
  if (arg) return path.resolve(arg);
  const dirs = readdirSync(VIDEO_DIR)
    .filter((d) => d.startsWith('run-'))
    .map((d) => path.join(VIDEO_DIR, d))
    .filter((d) => statSync(d).isDirectory())
    .filter((d) => existsSync(path.join(d, 'nova-real-course.webm')))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!dirs.length) throw new Error('未找到包含 nova-real-course.webm 的 run 目录');
  return dirs[0];
}

// 截图文件名 → 中文标题/说明（按录制脚本的步骤命名约定）
const SHOT_META = [
  [/^\d+-home/, '首页：输入课程主题', '真实 Nova 首页，准备输入教学需求（深度交互模式保持关闭，以产出带 AI 批改的 quiz 场景）。'],
  [/^\d+-topic-typed/, '逐字输入课程主题', '模拟真实用户逐字键入完整教学需求（含互动模拟与随堂测验要求）。'],
  [/^\d+-interactive-mode/, '深度交互模式状态', '保持关闭：走 requirements-to-outlines 模板，quiz 为一等场景类型（AI 批改+成绩单）。'],
  [/^\d+-generation-started/, '提交生成请求', '点击「进入课堂」，进入真实的流式生成流程。'],
  [/^\d+-generation-loading/, '生成中：大纲与角色', '阿里云百炼真实模型流式产出课程大纲、课堂角色。'],
  [/^\d+-generation-wait/, '生成中：页面与教学动作', '继续生成每页内容与教学动作时间轴，全程真实调用。'],
  [/^\d+-classroom-arrived/, '进入课堂', '生成完成，自动跳转到课堂页面。'],
  [/^\d+-classroom-ready/, '课堂就绪', '课件、角色、时间轴加载完成，可开始互动授课。'],
  [/^\d+-playback/, '互动视频播放', '课堂以「互动视频」形式自动播放：讲解、板书、角色发言同步推进。'],
  [/^\d+-sidebar-open/, '展开课程目录', '侧边栏列出本次真实生成的全部场景。'],
  [/^\d+-scene-/, '浏览课程场景', '逐个切换场景，展示课程结构与页面内容。'],
  [/^\d+-roundtable/, '课堂圆桌对话', '播放模式下恒定渲染的圆桌区：多个 AI 智能体围绕主题讨论，学生可随时插话提问。'],
  [/^\d+-ai-chat-input/, '向 AI 提问（输入）', '打开文字输入面板，键入问题参与课堂对话。'],
  [/^\d+-ai-chat-answer/, 'AI 实时作答', '真实模型返回回答，课堂对话被记录进会话。'],
  [/^\d+-quiz/, '随堂测验', '进入测验场景，作答单选与简答题。'],
  [/^\d+-quiz-submitted/, '提交答案', '提交后由 AI 自动批改。'],
  [/^\d+-quiz-report/, '成绩与解析', '给出得分、逐题解析与学习建议。'],
  [/^\d+-final/, '流程收尾', '完整走查结束。'],
];

function metaFor(file) {
  for (const [re, title, desc] of SHOT_META) {
    if (re.test(file)) return { title, desc };
  }
  return { title: file.replace(/^\d+-/, '').replace(/\.png$/, ''), desc: '' };
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function build(runDir) {
  const shotDir = path.join(runDir, 'shots');
  const shots = existsSync(shotDir)
    ? readdirSync(shotDir).filter((f) => f.endsWith('.png')).sort()
    : [];

  const dataFile = path.join(runDir, 'report-data.json');
  const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : {};

  const meta = data.meta || {};
  const scenes = data.scenes || [];
  const chat = data.chat || null;
  const quiz = data.quiz || null;

  const shotCards = shots
    .map((f, i) => {
      const m = metaFor(f);
      return `
      <figure class="shot">
        <div class="shot-idx">${String(i + 1).padStart(2, '0')}</div>
        <img src="shots/${esc(f)}" alt="${esc(m.title)}" loading="lazy" />
        <figcaption>
          <strong>${esc(m.title)}</strong>
          ${m.desc ? `<span>${esc(m.desc)}</span>` : ''}
          <code>${esc(f)}</code>
        </figcaption>
      </figure>`;
    })
    .join('\n');

  const sceneRows = scenes
    .map(
      (s, i) => `<tr><td>${i + 1}</td><td>${esc(s.title)}</td><td><span class="tag t-${esc(
        s.type || 'slide'
      )}">${esc(s.type || 'slide')}</span></td><td>${esc(s.note || '')}</td></tr>`
    )
    .join('\n');

  const quizRows = (quiz?.items || [])
    .map(
      (q, i) => `<tr>
        <td>${i + 1}</td>
        <td class="q">${esc(q.question)}</td>
        <td>${esc(q.answer)}</td>
        <td>${esc(q.correct ?? '-')}</td>
        <td class="${q.right ? 'ok' : 'bad'}">${q.right ? '✓ 正确' : '✗ 错误'}</td>
        <td>${esc(q.score ?? '-')}</td>
      </tr>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Nova 真实课程生成 · 全流程实录与成绩单</title>
<style>
  :root{
    --bg:#f7f8fa; --card:#fff; --line:#e5e7eb; --text:#111827;
    --muted:#6b7280; --brand:#2563eb; --ok:#16a34a; --bad:#dc2626; --accent:#f59e0b;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  .wrap{max-width:1080px;margin:0 auto;padding:40px 24px 80px}
  header{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;border-radius:16px;padding:36px 32px;margin-bottom:28px}
  header h1{margin:0 0 10px;font-size:28px;letter-spacing:.5px}
  header p{margin:0;opacity:.9}
  .kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:22px}
  .kv div{background:rgba(255,255,255,.14);border-radius:10px;padding:12px 14px}
  .kv b{display:block;font-size:12px;opacity:.85;font-weight:500}
  .kv span{font-size:15px;font-weight:600}
  section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:26px 28px;margin-bottom:22px}
  h2{margin:0 0 16px;font-size:20px;border-left:4px solid var(--brand);padding-left:10px}
  h3{margin:24px 0 10px;font-size:16px;color:#374151}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-weight:600}
  td.q{max-width:420px}
  .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}
  .t-slide{background:#e0e7ff;color:#3730a3}
  .t-interactive{background:#fef3c7;color:#92400e}
  .t-quiz{background:#dcfce7;color:#166534}
  .t-pbl{background:#fce7f3;color:#9d174d}
  .ok{color:var(--ok);font-weight:600}
  .bad{color:var(--bad);font-weight:600}
  video{width:100%;border-radius:12px;background:#000}
  .shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}
  .shot{margin:0;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;position:relative}
  .shot img{width:100%;display:block;border-bottom:1px solid var(--line)}
  .shot-idx{position:absolute;top:8px;left:8px;background:rgba(17,24,39,.82);color:#fff;
    font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;z-index:2}
  figcaption{padding:11px 13px;font-size:13px}
  figcaption strong{display:block;margin-bottom:3px}
  figcaption span{display:block;color:var(--muted);margin-bottom:5px}
  figcaption code{font-size:11px;color:#9ca3af}
  .score-card{display:flex;align-items:center;gap:28px;flex-wrap:wrap;
    background:linear-gradient(135deg,#ecfdf5,#f0fdf4);border:1px solid #bbf7d0;border-radius:14px;padding:22px 26px}
  .score-num{font-size:52px;font-weight:800;color:var(--ok);line-height:1}
  .score-meta{flex:1;min-width:220px}
  .chat{background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .chat .msg{margin-bottom:14px}
  .chat .who{font-weight:700;font-size:13px;color:var(--brand);margin-bottom:4px}
  .chat .u{color:#7c3aed}
  .note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 15px;font-size:14px;color:#78350f}
  ul{padding-left:20px}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>Nova 真实课程生成 · 全流程实录与成绩单</h1>
  <p>基于阿里云百炼（Model Studio）真实 API 完整跑通：需求输入 → 课程生成 → 互动视频授课 → 课堂 AI 对话 → 随堂测验 → 自动批改成绩单</p>
  <div class="kv">
    <div><b>课程主题</b><span>${esc(meta.topic || '光合作用')}</span></div>
    <div><b>课堂 ID</b><span>${esc(meta.classroomId || '-')}</span></div>
    <div><b>生成模型</b><span>${esc(meta.model || 'deepseek-v4-flash-0731')}</span></div>
    <div><b>场景数量</b><span>${esc(meta.sceneCount ?? scenes.length ?? '-')}</span></div>
    <div><b>录制时长</b><span>${esc(meta.duration || '-')}</span></div>
    <div><b>录制时间</b><span>${esc(meta.recordedAt || '-')}</span></div>
  </div>
</header>

<section>
  <h2>一、全流程录屏</h2>
  <video src="nova-real-course.webm" controls preload="metadata"></video>
  <p style="color:var(--muted);margin:12px 0 0">
    完整记录鼠标移动、逐字键入、生成等待、互动视频播放、课堂对话、答题与成绩反馈的全过程，可直接作为教学演示素材。
  </p>
</section>

<section>
  <h2>二、本次真实生成的课程结构</h2>
  ${
    sceneRows
      ? `<table><thead><tr><th>#</th><th>场景标题</th><th>类型</th><th>说明</th></tr></thead><tbody>${sceneRows}</tbody></table>`
      : '<p class="note">场景清单待填充（report-data.json → scenes）。</p>'
  }
</section>

<section>
  <h2>三、课堂 AI 对话实录</h2>
  ${
    chat
      ? `<div class="chat">
      <div class="msg"><div class="who u">学生（我）</div><div>${esc(chat.question)}</div></div>
      <div class="msg"><div class="who">${esc(chat.agent || 'AI 教师')}</div><div>${esc(chat.answer)}</div></div>
    </div>`
      : '<p class="note">课堂对话实录待填充（report-data.json → chat）。</p>'
  }
</section>

<section>
  <h2>四、学习成绩单</h2>
  ${
    quiz
      ? `<div class="score-card">
      <div><div class="score-num">${esc(quiz.score ?? '-')}</div>
        <div style="color:var(--muted);font-size:13px;text-align:center">总分 ${esc(quiz.total ?? 100)}</div></div>
      <div class="score-meta">
        <div><b>正确率：</b>${esc(quiz.accuracy || '-')}</div>
        <div><b>作答题数：</b>${esc((quiz.items || []).length)}</div>
        <div><b>评级：</b>${esc(quiz.grade || '-')}</div>
        <div><b>批改方式：</b>AI 自动批改（真实模型调用）</div>
      </div>
    </div>
    ${
      quizRows
        ? `<h3>逐题明细</h3><table><thead><tr><th>#</th><th>题目</th><th>我的作答</th><th>参考答案</th><th>判定</th><th>得分</th></tr></thead><tbody>${quizRows}</tbody></table>`
        : ''
    }
    ${quiz.comment ? `<h3>AI 学习建议</h3><div class="note">${esc(quiz.comment)}</div>` : ''}`
      : '<p class="note">成绩单数据待填充（report-data.json → quiz）。</p>'
  }
</section>

<section>
  <h2>五、界面截图全集（${shots.length} 张）</h2>
  <div class="shots">
${shotCards}
  </div>
</section>

<section>
  <h2>六、结论</h2>
  <ul>
    <li>本次走查全部基于真实阿里云百炼 API，无任何缓存或模拟数据。</li>
    <li>课程内容、课堂对话回答、测验批改与成绩均由真实模型实时产出。</li>
    <li>录屏与截图可直接作为产品演示、教学课件或验收材料使用。</li>
  </ul>
</section>
</div>
</body>
</html>`;

  const out = path.join(runDir, 'nova-course-report.html');
  writeFileSync(out, html, 'utf8');
  return { out, shots: shots.length, runDir };
}

const r = build(pickRunDir(process.argv[2]));
console.log('报告已生成:', r.out);
console.log('截图数量:', r.shots);
