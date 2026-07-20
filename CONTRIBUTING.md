# 贡献指南

感谢你对 Nova 项目的兴趣！本文档描述了参与开发的工作流程。

## 开发流程

1. Fork 仓库并从 `main` 创建分支
2. 进行修改并在本地测试
3. 运行检查：`pnpm lint && pnpm typecheck`
4. 提交 Pull Request

## 提交 Pull Request 前

运行完整测试套件：

```bash
pnpm test          # 全部测试（312 个文件，约 2700 个测试）
pnpm typecheck     # TypeScript 类型检查
pnpm lint          # ESLint
```

如果添加或修改了提示词模板，请运行 prompt-config 测试验证 `config.json` sidecar 是否有效：

```bash
pnpm test tests/prompts/prompt-config.test.ts
```

## 提示词模板开发

提示词位于 `lib/prompts/templates/<id>/`，包含 `system.md` 和可选的 `user.md`。
每个模板目录必须包含 `config.json` sidecar（version, description, tags, deprecated）。

角色指南基于 snippet 系统 —— 编辑 `lib/prompts/snippets/role-guidelines-*.md`
即可修改智能体行为文本，无需重新编译。

详见 `lib/prompts/README.md`。

## 提交消息规范

使用 Conventional Commits 格式：

```
<type>: <description>

类型包括: feat, fix, docs, refactor, test, chore, perf
```

示例：
- `feat: 添加知识图谱导出功能`
- `fix: 修复 SSRF 防护在测试环境下的 DNS 解析问题`
- `docs: 更新 README 安装说明`

## 代码规范

- TypeScript 严格模式
- 使用 `lib/logger` 而非 `console.log`
- 新增的 `<img>` 标签需添加 `loading="lazy"` 和 `decoding="async"`
- 新增的 Context provider 需使用 `useMemo` / `useCallback` 优化
- 所有用户可见文本需通过 i18n 的 `t()` 函数

## 测试规范

- 单元测试放在 `tests/` 目录下，文件名 `*.test.ts`
- E2E 测试放在 `e2e/tests/` 目录下，文件名 `*.spec.ts`
- 组件测试使用 React 19 的 `act` + `globalThis.IS_REACT_ACT_ENVIRONMENT`
- 测试不应依赖外部网络服务（使用 mock）

## 许可证

提交的代码将在 MIT 许可证下发布。
