/**
 * Nova 功能能力注册表 —— 前后端共享。
 *
 * 每个"可降级功能"映射到它依赖的 npm 包。服务端检测包是否安装，
 * 前端据此展示：已安装 → 正常可用；未安装 → 灰色 + 安装引导。
 *
 * 判定标准：包若被组件**静态 import**，构建期就会解析失败，无法降级。
 * 只有改为**动态 import + 运行时降级**的功能才能真正"未安装仍可启动"。
 * 本注册表同时作为改造清单：条目在 `downgradeable` 为 true 时才真正可降级。
 */
export type CapabilityId =
  | 'charts'          // echarts —— 数据图表（用量仪表盘 / 幻灯片图表）
  | 'codeHighlight'   // shiki —— 代码高亮
  | 'math'            // katex / temml —— 数学公式渲染
  | 'agentFramework'  // @langchain/* —— 智能体编排框架
  | 'mcp'             // @modelcontextprotocol/sdk —— MCP 工具接入
  | 'docParse'        // @alicloud/docmind / unpdf —— 文档解析
  | 'objectStorage'   // @aws-sdk/client-s3 —— S3 对象存储
  | 'zipExport'       // jszip —— 压缩导出
  | 'fonts'           // @fontsource/* 扩展字体（非核心字体）

/**
 * 产品核心交互依赖（@assistant-ui 聊天 / @xyflow 流程图 / prosemirror 编辑器 /
 * streamdown 流式 Markdown 渲染）属于 Core（必装），不参与降级 ——
 * 未装会直接砍掉产品核心能力。不在此注册表内，避免"能力状态"卡片误显示为可选。
 */

export interface CapabilityInfo {
  id: CapabilityId;
  label: string;          // 展示名（设置面板 / 提示用）
  description: string;    // 一句话说明
  deps: string[];         // 依赖包名（任一存在即视为已安装）
  /** 是否已完成"动态 import + 降级"改造。false = 仍是静态 import，未装包会编译失败。 */
  downgradeable: boolean;
  installCmd: string;     // 安装命令提示
}

export const CAPABILITIES: Record<CapabilityId, CapabilityInfo> = {
  charts: {
    id: 'charts',
    label: '数据图表',
    description: '用量仪表盘、幻灯片中的图表元素（ECharts）',
    deps: ['echarts'],
    downgradeable: true, // 已改造：动态加载 + 未安装降级
    installCmd: 'pnpm add echarts',
  },
  codeHighlight: {
    id: 'codeHighlight',
    label: '代码高亮',
    description: '幻灯片中代码块的语法高亮（Shiki）',
    deps: ['shiki'],
    downgradeable: true, // 已改造：动态 import，未安装降级为纯文本 <pre>
    installCmd: 'pnpm add shiki',
  },
  math: {
    id: 'math',
    label: '数学公式',
    description: '幻灯片 / 测验中的数学公式渲染（KaTeX / Temml）',
    deps: ['katex', 'temml'],
    downgradeable: true, // 已改造：动态加载 + 未安装降级
    installCmd: 'pnpm add katex temml',
  },
  agentFramework: {
    id: 'agentFramework',
    label: '智能体编排框架',
    description: '多智能体讨论编排（LangGraph）',
    deps: ['@langchain/core', '@langchain/langgraph'],
    downgradeable: true, // 已改造：动态加载 + 未安装降级
    installCmd: 'pnpm add @langchain/core @langchain/langgraph',
  },
  mcp: {
    id: 'mcp',
    label: 'MCP 工具接入',
    description: '通过 Model Context Protocol 接入外部工具',
    deps: ['@modelcontextprotocol/sdk'],
    downgradeable: true, // 已改造：动态加载 + 未安装降级
    installCmd: 'pnpm add @modelcontextprotocol/sdk',
  },
  docParse: {
    id: 'docParse',
    label: '文档解析',
    description: 'PDF / Office 文档内容提取（阿里云 DocMind、unpdf）',
    deps: ['@alicloud/docmind-api20220711', 'unpdf'],
    downgradeable: true, // 已改造：动态加载 + 未安装降级
    installCmd: 'pnpm add @alicloud/docmind-api20220711 unpdf',
  },
  objectStorage: {
    id: 'objectStorage',
    label: '对象存储',
    description: 'S3 兼容对象存储上传（AWS SDK）',
    deps: ['@aws-sdk/client-s3'],
    downgradeable: true, // 已改造：动态加载 + 未安装降级
    installCmd: 'pnpm add @aws-sdk/client-s3',
  },
  zipExport: {
    id: 'zipExport',
    label: '压缩导出',
    description: '课程 / 素材打包为 zip 导出（JSZip）',
    deps: ['jszip'],
    downgradeable: true, // 已改造：动态加载 + 未安装降级
    installCmd: 'pnpm add jszip',
  },
  fonts: {
    id: 'fonts',
    label: '扩展字体',
    description: '多语言 / 装饰字体（非核心中英文字体）',
    deps: [
      '@fontsource/jetbrains-mono', '@fontsource/literata', '@fontsource/lxgw-wenkai',
      '@fontsource/merriweather', '@fontsource/montserrat', '@fontsource/open-sans',
      '@fontsource/roboto', '@fontsource/source-sans-3', '@fontsource/source-serif-4',
      '@fontsource/zcool-kuaile',
    ],
    downgradeable: true, // 字体缺失不阻断运行（浏览器回退默认字体）
    installCmd: 'pnpm add @fontsource/*',
  },
};

export const CAPABILITY_LIST: CapabilityInfo[] = Object.values(CAPABILITIES);
