# Nova Importer

`@nova/importer` 是 Nova 平台的文档导入子包，负责将 `.pptx` 文件解析为 Nova 画布可直接消费的幻灯片数据结构（`Slide[]`）。

> 本包为浏览器端运行环境设计：解析过程依赖 `XMLHttpRequest`、`DOMMatrix`、`Path2D` 等 DOM API，以及一个面向浏览器的 `pdf.js` 构建。请在客户端代码中使用，不要在纯 Node.js 进程里加载。

## 主要功能

- **PPTX 解析**：解压 `.pptx`（zip），解析 OOXML，产出结构化中间 JSON（`parse()`）。
- **文本提取**：段落与 run 的七级样式继承，输出 HTML 富文本，覆盖字体、字号、颜色、渐变、下划线、删除线、斜体、加粗、阴影、上下标、超链接等。
- **形状与线条**：200+ OOXML preset 几何、自定义几何、连接线（含箭头、弯曲连接器的贝塞尔近似）。
- **媒体转换**：将 TIFF/EMF/JXR/WDP 等非 Web 安全格式统一转 PNG；图片可裁切、带滤镜、带柔边。
- **表格序列化**：单元格样式级联、合并单元格、逐边描边、行高/列宽归一化。
- **图表序列化**：柱状/折线/面积/饼/环/雷达/散点/气泡等图表类型的数据提取与选项归一化。
- **公式渲染**：OMML → LaTeX（KaTeX），并支持把公式图片上传到远端存储。
- **导入管线**：`importPptx()` 一站式把 `.pptx` 转成 Nova `Slide[]`，并可选地把所有 base64 图片 / blob 媒体交给你提供的上传函数落盘到 OSS。

## 安装

本包通过 Nova workspace 引用，依赖 `pptxtojson` 作为底层解析能力之一。

```
pnpm add @nova/importer
```

## API 一览

| 导出 | 类型 | 用途 |
|------|------|------|
| `importPptx(input, options?)` | `(File \| Blob \| ArrayBuffer, ImportPptxOptions?) => Promise<Slide[]>` | 一站式：`.pptx` → `Slide[]`，等所有上传 settle 后再 resolve |
| `parsedToSlides(json, options?)` | `(Output, ImportPptxOptions?) => Promise<Slide[]>` | 只做「中间 JSON → `Slide[]`」，给已经用 `parse()` 拿到 JSON 的场景 |
| `parse(buffer, options?)` | `(ArrayBuffer, ParseOptions?) => Promise<Output>` | `.pptx` → 中间 JSON（PPT 语义、单位 `pt`、媒体为 base64 / `blob:` URL） |
| `normalizeImportedSlides(slides)` | `(Slide[]) => Slide[]` | DSL 合同边界：补默认值、丢弃无法修复的元素（`console.warn` 上报）。`parsedToSlides` / `importPptx` 已自动应用；直接调用 `transformParsedToSlides` 的消费方需要自己跑一遍以获得相同的输出契约 |
| `OssUpload` | `(blob: Blob, filename: string, dir?: string) => Promise<string>` | 上传回调签名 |
| `ImportPptxOptions` | `{ upload?: OssUpload }` | 选项对象 |
| `CanvasSlide` | Nova `Slide` 类型 | 用于消费方做类型注解 |

`importPptx` 内部就是 `parse(buffer, { mediaMode: 'base64' })` + `parsedToSlides(...)`，两者任选其一即可。

## 完整签名

```ts
import {
  importPptx,
  parsedToSlides,
  normalizeImportedSlides,
  type OssUpload,
  type ImportPptxOptions,
  type CanvasSlide,
} from '@nova/importer';

export type OssUpload = (
  blob: Blob,
  filename: string,
  dir?: string,
) => Promise<string>;

export interface ImportPptxOptions {
  /**
   * 上传媒体（图片 / 音频 / 视频）到远程存储并返回公网 URL。
   * - 提供：所有 base64 图片会先转成 Blob，再调用此函数，URL 写回 slide。
   * - 不提供：图片保留 base64 data URL；音视频保留临时 `blob:` URL（仅当前 tab 有效）。
   */
  upload?: OssUpload;
}

export function importPptx(
  input: File | Blob | ArrayBuffer,
  options?: ImportPptxOptions,
): Promise<CanvasSlide[]>;

export function parsedToSlides(
  json: Output,
  options?: ImportPptxOptions,
): Promise<CanvasSlide[]>;

export function normalizeImportedSlides(slides: CanvasSlide[]): CanvasSlide[];
```

## 用法

### 1. 不传 `upload` —— 本地预览 / 调试

媒体留在内存，slide 可以直接在当前 tab 里渲染，但**刷新就失效**（音视频）/ **JSON 体积大**（图片）。

```ts
import { importPptx } from '@nova/importer';

const slides = await importPptx(file);
// slides[*].elements 里的 image.src 还是 data:image/png;base64,…
// audio/video.src 是 blob:http://… URL
```

### 2. 传 `upload` —— 生产场景

把媒体上传到你自己的 OSS / classroom-media / S3 / 任意存储，slide 里只剩 URL：

```ts
import { importPptx, type OssUpload } from '@nova/importer';

const upload: OssUpload = async (blob, filename, dir) => {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('dir', dir ?? 'pptx-import');

  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const { url } = await res.json();
  return url; // ← 必须返回最终可访问 URL
};

const slides = await importPptx(file, { upload });
// 此时 slides[*].elements 里的 src 全是 OSS URL
```

### 3. 已经用 `parse()` 拿到 JSON 时

```ts
import { parse, parsedToSlides } from '@nova/importer';

const json = await parse(buffer, { mediaMode: 'base64' });
const slides = await parsedToSlides(json, { upload });
```

> 必须用 `mediaMode: 'base64'`。`blob` 模式产出的 URL 只在当前 tab 有效，无法上传后跨页面使用。

## `upload` 回调被调用的时机

| 元素类型 | 源数据 | filename 示例 | dir |
|---------|--------|---------------|-----|
| 背景图片 | base64 → Blob | `background_<timestamp>.png` | `a2m` |
| 图片元素 | base64 → Blob | `image_<timestamp>.png` | `a2m` |
| 数学公式渲染图 | base64 → Blob | `math_<timestamp>.png` | `a2m` |
| 形状的图案填充 | base64 → Blob | `pattern_<timestamp>.png` | `a2m` |
| 音频 | 直接是 Blob | `audio_<timestamp>.mp3` | `a2m/audio` |
| 视频 | 直接是 Blob | `video_<timestamp>.mp4` | `a2m/video` |

并发：内部用 6 路并发上传图片，避免一次性打满网络。

## 错误处理

- **单个媒体上传失败** → transform 内部 `.catch` 吞掉错误（控制台 `console.error`），该元素的 `src` 仍是原始 base64 / 空字符串。整体 import **不会失败**。
- **`parse()` 解析失败**（坏文件等）→ `importPptx` 直接 `throw`，调用方自己 `try/catch`。
- 内部用 `Promise.allSettled` 等所有上传 settle 后才 resolve，调用方拿到的 `Slide[]` 不需要再 await 任何东西。

## 当前限制

| 模块 | 状态 | 影响 |
|------|------|------|
| 字体白名单（`resolveFont`） | **stub，透传** | 中文字体保留原名，浏览器找不到字体时会回退到默认。 |
| 视频编码检测（`videoCodec`） | **stub，永远视为支持** | HEVC 等浏览器不支持的编码会变成坏的 `<video>`，而不是降级到占位图标。 |
| SVG path bbox（`svgPathParser`） | 自实现 tokenizer | 标准命令（M L H V C S Q T A Z 大小写）都覆盖；弧线 bbox 用端点近似，可能略小。 |

## 在 Next.js (Turbopack) 里用

`importer` 源码依赖 `pdfjs-dist`，其动态 `require()` 模式会被 Turbopack 拒绝。Nova 的做法：

1. `pnpm run build` 把整个包（含 importPptx）打成 `dist/`。
2. `scripts/sync-importer.mjs` 把 `dist/` 复制到 `public/vendor/importer/`。
3. 在客户端组件里用**静态 URL 动态 import**，bundler 完全看不到：

```ts
import type * as NovaImporter from '@nova/importer';

const mod = (await import(
  /* webpackIgnore: true */
  /* turbopackIgnore: true */
  /* @vite-ignore */
  '/vendor/importer/index.js'
)) as typeof NovaImporter;

const slides = await mod.importPptx(file, { upload });
```

类型仍走 workspace 包，IntelliSense 不丢。

### 部署依赖（必读）

`public/vendor/importer/` 是 **gitignored 的构建产物**，不进仓库，由 `postinstall`
现生成（`pnpm --filter @nova/importer build` + `node scripts/sync-importer.mjs`）。
因此部署流水线**必须执行 `postinstall`**（或显式跑这两步），否则运行时
`/vendor/importer/index.js` 会 404，PPTX 导入功能失效。

两道防护已就位：

- **构建期断言**：根 `build` 脚本前置 `node scripts/assert-vendor-importer.mjs`，
  若 vendor 产物缺失则**构建直接失败**并给出修复提示，避免把必崩版本部署上线。
- **运行期守卫**：`use-import-pptx.ts` 在动态 import 前先 `HEAD` 预检该 URL，
  404 时抛出明确错误并提示 `import.error.parserUnavailable`，而不是把 404 HTML
  当 JS 解析出诡异的 `SyntaxError`。

> 另注：`git pull` 后若未重新 `pnpm install`，workspace 类型会更新但 URL 加载的
> 仍是旧 `dist`，二者可能静默漂移——拉取后请重新安装。

## 开发

| 命令 | 用途 |
|---|---|
| `npx tsx scripts/transvert.ts <file.pptx> [out.json]` | 用本库解析（开发主力，直接跑源码无需构建） |
| `node scripts/extract-pptx-structure.js <file.pptx> [outDir]` | 解压 .pptx 查看源 XML |
| `pnpm build` | Rollup 打包 + 生成 .d.ts → dist/ |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | 运行单元测试 |

架构与分层职责详见 `DESIGN.md`。

## 开源协议

MIT License | Copyright © 2026 Nova
