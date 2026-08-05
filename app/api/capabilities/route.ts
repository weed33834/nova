import { NextRequest, NextResponse } from 'next/server';
import { detectCapabilities } from '@/lib/server/capabilities';

/**
 * GET /api/capabilities
 * 返回各可降级功能的安装状态，供前端设置面板/功能入口展示。
 *
 * 响应示例：
 * {
 *   "capabilities": {
 *     "charts":      { "id":"charts", "installed":true,  "downgradeable":false, ... },
 *     "codeHighlight": { "id":"codeHighlight", "installed":false, ... }
 *   },
 *   "missing": ["charts", "codeHighlight", ...],   // 未安装的功能 id
 *   "allInstalled": false
 * }
 */
export async function GET(_req: NextRequest) {
  const caps = detectCapabilities();
  const missing = Object.values(caps)
    .filter((c) => !c.installed)
    .map((c) => c.id);
  return NextResponse.json({
    capabilities: caps,
    missing,
    allInstalled: missing.length === 0,
  });
}
