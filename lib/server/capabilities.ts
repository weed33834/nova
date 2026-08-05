/**
 * 服务端能力检测 —— 探测可选依赖（Extras）是否已安装。
 *
 * 用 createRequire.resolve 判断包是否存在（不加载包体，开销极小）。
 * 只在 Next.js 服务端 / Node 环境调用（route handler）。
 */
import { createRequire } from 'node:module';
import { CAPABILITIES, type CapabilityId, type CapabilityInfo } from '@/lib/capabilities';

const requireFromRoot = createRequire(process.cwd() + '/');

/** 单个包是否已安装（解析 node_modules 入口，命中即 true）。 */
function isPackageInstalled(pkg: string): boolean {
  try {
    requireFromRoot.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

export interface CapabilityStatus {
  id: CapabilityId;
  installed: boolean;
  /** 已安装但未完成动态加载改造 —— 提示"当前为完整安装，未装包会编译失败" */
  downgradeable: boolean;
  deps: string[];
  installCmd: string;
}

export function detectCapabilities(): Record<CapabilityId, CapabilityStatus> {
  const result = {} as Record<CapabilityId, CapabilityStatus>;
  for (const info of Object.values(CAPABILITIES)) {
    result[info.id] = {
      id: info.id,
      installed: info.deps.some(isPackageInstalled),
      downgradeable: info.downgradeable,
      deps: info.deps,
      installCmd: info.installCmd,
    };
  }
  return result;
}

export function getCapabilityMeta(id: CapabilityId): CapabilityInfo {
  return CAPABILITIES[id];
}
