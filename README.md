# AI Desk Hub v0.3.1

延续 v0.3 的 iPad 桌面工作台，保留 TODAY、AI RADAR、AI INSIGHT 和 QUICK CAPTURE。

## 当前状态（2026-10-20）

- 本地代码审查和浏览器验证已完成，尚未推送、尚未部署。
- 现有 `zhaokongkong96-ux/ai-desk-hub` 是公开空仓库；GitHub API 报告当前连接有管理员和推送权限，Actions 已允许运行。尚未执行实际写入。
- Pages 未配置；线上 HTTPS、GitHub Actions 实际运行、iPad Pro Safari 和主屏幕安装均待验证。
- TODAY 日程和 AI INSIGHT 是明确标记的示例；无真实日历、LLM 摘要、后台采集或云同步。

## 本次修复

- Service Worker 改用本应用 scope 专属缓存和网络优先更新，仅缓存 7 个外壳资源中的必要应用文件，不再缓存任意请求或为缺失资源返回 HTML。
- 构建脚本校验 JS、manifest、16 个种子项目、PNG 尺寸，发布时只打包 7 个白名单文件。交接资料、备份 ZIP、测试记录不会进入网站产物。
- 专注计时改按结束时间计算，页面后台暂停后回前台会校准；结束后不再产生负数。刷新页面仍会重置计时，未实现系统后台通知。
- GitHub 默认搜索使用简单关键词/短语；README 命中结果不再被卡片文字二次过滤。精选库异步返回不再覆盖实时搜索结果和状态。
- 外部项目链接只允许 HTTPS GitHub 地址；异常本地数据不会直接中断启动，保存失败显示持续提示。
- 版本标记和核验状态文字已纠正；主要按钮触控区域加大，保留原有视觉框架。

## 本地预览与发布产物

需要 Node.js 22+ 和 Python 3。应用本身不依赖 npm 包。

```sh
node scripts/prepare-site.mjs
python3 -m http.server 8766 --bind 127.0.0.1 --directory _site
```

打开 `http://localhost:8766/`。不要使用 `file://` 检验 PWA。

`_site/` 只包含 `index.html`、`manifest.webmanifest`、`projects-seed.json`、`sw.js`、两个 PNG 图标和 `.nojekyll`。相对资源路径、manifest start_url/scope 和 SW 路径同时兼容根站点与 `/ai-desk-hub/` 子路径。

## 发布到 GitHub Pages

详细操作见 `DEPLOY_TO_GITHUB_PAGES.md`。当前等待用户确认公开推送和发布；本地修复分支为 `codex/pages-readiness`。

工作流在 main/master 推送或手动运行时，校验并暂存白名单资源，随后通过 GitHub Actions 部署。不要把整个交接包作为仓库根目录上传。每次发布修改外壳资源后应更新 `sw.js` 的缓存版本，确保已安装客户端离线缓存完整更新。

## 已验证与限制

- 本地 Chrome、桌面 WebKit：新增/完成待办与刷新保留、记录持久化、JSON 导出、计时开始/暂停/重置/休息、后台时间跳变校准、项目加入待办。
- 两种引擎在 1366×1024、1194×834、1024×768、834×1194、390×844 下的三个页面均无横向页面溢出；已有桌面截图检查。尺寸检查不代表 iPad 实机通过。
- Chrome：Service Worker 实际控制页面，根路径和仓库子路径离线刷新可用。SW 独立测试覆盖缓存隔离、在线新版本和离线回退。
- 真实浏览器匿名 GitHub 搜索：自定义 ESP32 和默认 AI hardware 查询均曾返回 20 个仓库；真实上游目录曾同步 25 个项目。结果与网络、上游变化和匿名限额有关，未逐个核验许可及复现性。
- 模拟响应：搜索正常结果、README 命中保留、429 限流与精选库异步完成不覆盖实时状态。
- GitHub Actions、线上缓存更新、iPad 安装、锁屏恢复、软键盘、触控舒适度、长期常亮均尚未实测。

## 数据边界

待办、笔记、目录缓存存于当前浏览器 localStorage，不含云端同步。请导出备份；PWA 与 Safari 是否共享数据需要在实际设备确认。专注计时不跨刷新保存。搜索直接访问 GitHub API；打开页面会尝试更新上游目录，离线使用本地 16 项快照。内置项目描述和许可来自交接资料与上游数据，尚未独立验证。

公开仓库与 Pages 不得包含个人日程、私密笔记、凭据或导出记录。当前发布文件只含通用示例与公开项目线索。
