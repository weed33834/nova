# Contributing to Nova

Thanks for your interest in contributing! This guide covers the basics.

## Development Setup

```bash
git clone https://github.com/weed33834/nova.git
cd nova
pnpm install
pnpm dev
```

See the [README](README.md) for full prerequisites and configuration.

## Workflow

1. **Fork** the repository
2. Create a branch: `git checkout -b feat/your-feature`
3. **Commit** with a clear message following [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` new feature
   - `fix:` bug fix
   - `docs:` documentation only
   - `refactor:` code restructuring without behavior change
   - `test:` adding or fixing tests
   - `chore:` build, deps, config
4. **Push** to your fork and open a Pull Request against `main`

## Code Style

- TypeScript strict mode is enforced
- Run `pnpm lint` and `pnpm typecheck` before pushing
- Follow existing formatting (Prettier config is in the repo)
- No `any` types without a justification comment

## Testing

- Every new feature needs tests
- Run `pnpm test` for unit/component tests
- Run `pnpm test:e2e` for end-to-end tests
- Aim to keep coverage stable or improving

## Pull Request Checklist

- [ ] Tests pass locally (`pnpm test`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Types check (`pnpm typecheck`)
- [ ] Commit messages follow Conventional Commits
- [ ] No debug logging left in the code
- [ ] Documentation updated if needed

## Reporting Issues

Use the [GitHub Issue Templates](https://github.com/weed33834/nova/issues/new/choose). Include:

- Steps to reproduce
- Expected vs actual behavior
- Browser/OS and Node.js version
- Screenshots if applicable

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the MIT License.
