# 自动问候、语音和后台通知 v0.8.0

v0.8.0 发行说明。独立 Railway 通知服务已部署；前端公开发布结果以对应 GitHub Pages 工作流与线上版本检查为准，真实 iPad 授权/声音/锁屏送达尚未验收。

## 使用流程（前端发布后）

1. 在 iPad Safari 打开正式 Pages 地址，通过分享菜单「添加到主屏幕」，从主屏幕图标进入。旧 Safari 页签中的授权不替代主屏幕 APP 授权。
2. 打开「设置」。自动问候默认开启，08:00–23:00 北京时间，间隔 2 小时；冷启动或离开至少 5 分钟后返回触发。没有人体/身份感知。
3. 点击「开启语音并试听」。仅本次页面可自动播报，刷新后重新点击；不请求麦克风。前台、未编辑、未播放网页/本地音频且未免打扰时播报通用文字。原生网易云播放状态无法读取，仍可手动停播/关闭语音。
4. 在独立 Railway 项目 `ai-desk-hub-notifications` → `notifications` → Variables，私下复制 `PAIRING_CODE`，填入 APP。不要发送到聊天或提交 Git。点击「检查服务」后「开启后台通知」，在系统弹窗允许。
5. 勾选「重要日程开始前 10 分钟提醒」。仅非示例、非全天、状态为重要的未来日程同步，最多 30 天/100 条。普通/已完成日程不提醒。
6. 点击「发送测试通知」，把 APP 放后台并查看通知中心。测试提交成功只代表推送服务接受请求，不代表设备收到。
7. 新建约 12 分钟后的重要日程，确认显示已同步；锁屏约 2 分钟，核对系统通知；再测试修改/删除、RETURN 免打扰、关闭并删除订阅。

后台仅系统通知，不支持后台自定义语音。系统声音/专注模式由 iPadOS 管理。前台问候冷却跨刷新保留；前台已健康连接推送服务时由服务端统一重要提醒。断网前台轻提示作为备用，不能保证操作系统通知精确到秒。

## 独立服务

- 项目：https://railway.com/project/f750de47-06e1-42c6-868c-ac5b50e1f93a
- 公共服务：https://notifications-production-0458.up.railway.app
- `/health` 返回配置健康状态；公共 `/api/push/public-key` 只提供 VAPID 公钥。
- 单实例常驻 Node 24；每 15 秒扫描到期提醒。SQLite 在独立 `/data` volume 中持久化。无其他项目连接。
- 私有 Railway 变量：`PAIRING_CODE`、`VAPID_PRIVATE_KEY`、`VAPID_PUBLIC_KEY`、`DATA_DIR`、`ALLOWED_ORIGINS`。密钥生成于进程内并经 CLI stdin 写入，未写入前端或仓库。保持 VAPID 密钥稳定，否则已有订阅需重新配对。
- 服务端只存推送订阅、设备令牌哈希、日程标识哈希和提醒/过期时间，不收集日程标题/笔记/定位。关闭时先删除服务端设备和任务，再取消浏览器订阅。断网关闭失败不能宣称已经停止。
- 每设备 bearer token、初次配对码、Origin 白名单、请求大小/频率限制、五设备上限；推送端点仅允许已知浏览器厂商。404/410 订阅自动清理，临时错误有限重试。
- 修改日历、重要提醒开关、RETURN 免打扰会同步；隐私遮挡临时暂停，退出后恢复。APP 关闭后其他来源的日历变动不会自动同步；飞书仍未接入。
- Pages 构建只复制前端白名单，排除整个通知服务及本地数据库。Git 忽略 `.env*`、SQLite、node_modules、Railway 本地元数据和截图。
- Railway Config as Code 当前仍生效，CLI 提示在 2026-12-01 前迁移到 Infrastructure as Code；需安排迁移。不得假定永久免费或无限可用。

## 验证

- `node scripts/prepare-site.mjs`：JS 语法、PWA 路径、十张横构图壁纸、feed 结构与前端白名单。
- `npm test --prefix notification-service`：端点限制、鉴权、定时/暂停/取消/去重、过期订阅清理、SQLite 重启持久性、SW 通用通知和点击返回。推送发送器替身，无真实外发。
- 先运行 `node scripts/preview.mjs`，再执行 `node scripts/test-attention.cjs` 与 `node scripts/test-push-ui.cjs`。需 Playwright/Chrome/WebKit。语音、系统权限与推送订阅均使用替身，不发声，不使用登录资料。
- Chrome + 桌面 WebKit 在 1366×1024、1024×1366 检查设置与溢出；不是实机验收。云端部署成功及 HTTPS 健康响应已验证，真实订阅和 Apple 推送链路未验证。
