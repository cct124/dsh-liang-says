# 发布流程

## 自动触发规则

| 工作流 | 触发条件 | 结果 |
|---|---|---|
| `.github/workflows/ci.yml` | PR 合并到 `main` | 语录校验、类型检查、测试、构建，将 `.tgz` 和校验文件保存到 Actions Artifacts，保留 30 天 |
| `.github/workflows/release.yml` | 推送 `v*` 标签 | 校验版本与 main 提交关系，构建正式包，通过 OIDC 发布 npm，再公开 GitHub Release |

CI 使用 `pull_request_target: closed` 和 `merged == true` 条件，仅 checkout 已合并的提交，不执行 PR head；权限只有 `contents: read`。关闭但未合并的 PR 可能显示一次 skipped 记录，但不会执行构建。普通分支推送、直接 push main 和合并到其他分支不会触发 CI 打包。

正式发布的标签必须与 `package.json` 和 lockfile 版本一致，并指向 `origin/main` 已包含的提交。GitHub Release 与 npm 使用同一份构建产物。`v0.1.0` 发布到 npm `latest`；`v0.2.0-rc.1` 这类预发布版本使用 npm `next` 并标为 GitHub prerelease。

工作流使用 GitHub 托管的 Ubuntu runner、Node.js 24、固定 npm 11.21.1，以及固定提交 SHA 的官方 Actions。只有正式发布 job 具有 `contents: write` 和 `id-token: write`；不需要长期 `NPM_TOKEN`。

## 本地准备

使用 Node.js >= 24.9，在仓库根目录执行：

```powershell
npm ci --ignore-scripts
npm run release:metadata
npm run release:prepare
npm run build:dev
git diff --check
```

`release:prepare` 依次检查语录生成结果、TypeScript 和测试，再构建正式客户端，验证模块加载、开关/弹层注册、清理逻辑及资源内嵌，最后通过 npm pack 生成安装包。包内文件按明确清单核对，不包含源码、测试、开发日志、原始语录汇编、候选音效或开发面板。

输出文件：

- `dist/dsh-liang-says-0.1.0.tgz`：可安装和上传的正式包。
- `dist/SHA256SUMS`：安装包 SHA-256。
- `dist/release-info.json`：版本、文件清单、包大小及 npm integrity。
- `dist/release-notes.md`：`release:metadata` 从 CHANGELOG 当前版本段落提取的发布说明。

首次发布版本为 `0.1.0`。以后发版时同步更新 `package.json` 与 `package-lock.json` 的版本，添加 CHANGELOG，并更新安装示例后重新准备。不要手工编辑构建输出。

## 安装验证

在测试用 DSH profile 中安装 `.tgz` 并重启，确认默认开关、任务开始/结束、关闭音效、权限等待、会话切换、深浅色模式与面板边界。不要与开发包同时启用。

```powershell
dsh plugin --profile web add ./dist/dsh-liang-says-0.1.0.tgz
```

适配范围是 DSH `0.2.1-rc.3` Web；其他宿主版本及原生 Desktop 尚未验证，不扩大 `engines.dsh` 范围。

## 首次配置：需要维护者操作

1. 将代码与工作流通过 PR 合并到 `main`，在 GitHub 的 Actions 中确认 **Build after main merge** 成功。仓库需允许 GitHub Actions 及工作流声明的权限。工作流不需要你额外创建 GitHub PAT。
2. 首次创建 npm 包：登录有权使用 `dsh-liang-says` 名称的 npm 账号并完成账号验证/2FA。2026-10-28 检查时 npm registry 对该包返回 404。npm 官方文档要求配置 Trusted Publisher 前包已存在，所以首版需要先初始化一次。
3. 从上述成功 CI 的 Artifacts 下载并解压 `main-pr-...` 构建产物，在解压目录执行以下命令。使用 CI 打出的原包，避免本地不同换行符或 npm 版本产生另一份内容。

```powershell
npm login --registry https://registry.npmjs.org/
npm publish ./dsh-liang-says-0.1.0.tgz --access public --registry https://registry.npmjs.org/
```

4. 按下一节给同一个 CI 提交打 `v0.1.0` 标签。首版工作流会核对 npm 已有包的 integrity，一致则跳过重复发布，并完成 GitHub Release。
5. 在下一次需要自动发布 npm 前，打开 npm 包 **Settings → Trusted Publisher → GitHub Actions**，按下表设置。也可使用 npm CLI 的 `npm trust github dsh-liang-says --repo cct124/dsh-liang-says --file release.yml --allow-publish`，按提示完成认证。

| npm 配置项 | 值 |
|---|---|
| Organization or user | `cct124`（GitHub 仓库所有者，不是 npm 用户名） |
| Repository | `dsh-liang-says` |
| Workflow filename | `release.yml`，不包含目录 |
| Environment name | 留空，工作流未配置 environment |
| Allowed actions | 允许直接 `npm publish` |

不要只启用 `npm stage publish`，本流程使用直接发布。新 Trusted Publisher 配置需要在 **2 天内成功完成一次可信发布**才能验证生效；给已手工发布的 `0.1.0` 补 GitHub Release 会跳过 npm，不算这次验证。请在接近下一次自动发版时创建配置；若配置已过期，删除过期配置并重新创建。以上规则来自 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) 与 [npm trust 前提条件](https://docs.npmjs.com/cli/v11/commands/npm-trust/)。

## 日常发版

1. 同步修改 `package.json`、lockfile 版本与 CHANGELOG，提交 PR 并合并到 `main`。
2. 等待 CI 通过，下载测试包并完成安装验收。
3. 给通过验收的提交打版本标签并推送。例如首版：

```powershell
git fetch origin main
git switch main
git pull --ff-only
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

打标签前确认当前 HEAD 就是通过 CI 和验收的提交；若 main 又有更新，应明确将标签指向已验收的提交。不要移动已发布的标签。

4. **Publish release** 自动检查、打包、上传 Actions Artifact、发布 npm，最后生成 GitHub Release 及 `.tgz`、`SHA256SUMS`、`release-info.json` 附件。无需再手动运行 npm publish 或上传附件。

## 失败与重跑

- 测试、标签或版本校验失败：停止发布。修复后通过新的合并提交和正确版本标签发版。
- npm 返回已存在的版本：仅当 registry 的 `dist.integrity` 与当前 `.tgz` 完全一致时跳过；不同内容直接失败，不能覆盖同版本。
- npm 已成功、GitHub 失败：在 Actions 中重跑失败 job。它下载原构建产物，不重新打包，核对 npm 后继续 GitHub 发布。
- GitHub 草稿只传了一部分附件：保留并核对已有附件，补传缺少的文件，全部核对后公开。已经公开的 Release 仅验证，不覆盖或增删附件。
- registry/API 请求失败不会被当作“版本不存在”。OIDC 配置、认证或包名权限错误需要维护者修正后重跑。

构建产物保留 30 天，过期后需重跑完整工作流；仍会校验 npm 完整性。两处发布不是原子操作，npm 已公开的版本不会因为 GitHub 失败而撤销。

仓库根目录及开发包为 private，正式包清单包含 MIT 代码许可证及第三方音效来源说明。图片与引用文选维持各自的权利归属。
