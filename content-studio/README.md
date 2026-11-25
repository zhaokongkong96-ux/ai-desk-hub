# AI Content Studio 本机版本 0.1

在原 AI Desk Hub 增补内容工作室，使用独立 FastAPI、SQLite 和本机素材目录。原日程、同步和环境屏继续走各自已有模块。

## 运行

首次安装时在本目录执行以下命令。

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd render
npm ci
cd ..
./run.sh
```

依赖 Mac 系统中文语音、Google Chrome 和 Node。FFmpeg 由 imageio-ffmpeg 提供。渲染默认使用已安装的 Google Chrome，避免重复下载浏览器。可通过 STUDIO_CHROME 配置浏览器可执行文件，通过 STUDIO_FONT 配置中文字体。

打开 http://localhost:8876/ 。双击 copy-access.command 将本机访问令牌复制到剪贴板，在页面粘贴后连接。令牌存放于忽略目录 data，禁止放到网址、前端或仓库。

iPad 与 Mac 同网时，在 Safari 打开 http://Mac局域网IP:8876/ 。界面会自动带入后台地址，输入这台 Mac 的访问令牌。设备 IP 可在 Mac 系统设置的网络详情中查看。HTTP 入口仅适合可信局域网，远程使用需额外提供受保护 HTTPS 入口。

GitHub Pages 的入口为 content-studio.html。HTTPS Pages 远程连接 Mac 需要 HTTPS 后台。当前交付以 Mac 同源局域网审核入口为准，远程隧道与 iPad 真机验收仍待完成。

## 每日执行与后台运行

STUDIO_SCHEDULE=true 开启每日北京时间 08:00 之后的首次采集，Mac 睡眠或关机期间暂停，醒来后补执行。当天成功标记持久化，失败五分钟后重试。手工采集与后台采集共享进程锁。

```sh
STUDIO_SCHEDULE=true ./run.sh
```

需要登录后持续运行时，先停止占用 8876 的手工进程，再执行以下命令。安装脚本会注册当前用户的 LaunchAgent。

```sh
.venv/bin/python install-background.py
```

安装器把运行副本部署到 ~/Library/Application Support/AIContentStudio，避免 macOS 后台进程读取“文稿”目录受限。正式后台的数据库、令牌、生产视频位于该运行副本的 data 目录。后续安装保留这些数据，仅更新代码。原项目的 data 是本次开发测试快照。修改项目代码后重新执行安装器，使后台使用新代码。

查看状态与停止后台服务。

```sh
launchctl print gui/$(id -u)/com.aideskhub.content-studio
launchctl bootout gui/$(id -u)/com.aideskhub.content-studio
```

网络需要代理时在启动前配置 STUDIO_PROXY。它只影响 Mac 采集，不会替 iPad 设置代理。改变后台环境时重新安装 LaunchAgent。服务日志在 data，未上传。启动时将上次意外中断的排队和运行任务标为失败，可以在页面重试，避免伪显示生产中。

## 采集与选题

真实 RSS 来源包括 NASA、Dezeen、Guardian Travel、BBC World。Last30Days 为项目内独立检出，版本固定见 VERIFICATION.md。其 Hacker News 免费通道参与 A 类来源池。失败逐源记录，缺一类时减少候选并显示 partial，不生成虚构采集内容。

完整批次为 A 4、B 3、C 3，总计 10 条。每类最高分各推荐一条，合计 3 条。规则评分使用发布日期、来源可追溯、摘要信息量、近七天是否已展示和可用 HN 互动数。该分数用于编辑筛选，不能当作跨平台全网热度。

Last30Days 安装在 .tools/last30days，Python 3.12 由项目 uv 提供。重装时运行以下命令，再启动采集。

```sh
.venv/bin/pip install uv
.venv/bin/uv python install 3.12
git clone https://github.com/mvanhorn/last30days-skill.git .tools/last30days
```

## 制作与审核

采集候选 → 你选择选题 → 讨论并确认切入角度 → 按该方向研究与起草 → 你修改并确认当前脚本 → 手动开始制作 → 播放审核视频 → 通过或退回这条成片。

今日选题卡片包含概述、来源与两个角度。点击“讨论这个选题”打开详情，可选候选角度或自定方向、保存讨论要求。只有“确认这个选题与角度”之后，才能按方向研究起草。确认脚本与开始制作是两个动作。更改方向会清除当前脚本和批准状态，修改脚本需要重新确认。已有成片及其快照保留。

页面负责保存选择、讨论要求和确认结果。当前具体讨论可在 Codex 对话中继续，尚未接入页面内自动对话模型。

无需连接后台即可打开 /?preview=1 体验完整操作过程。演示使用当日真实来源快照，只在页面内预览选择和审核步骤；正式模式的数据与任务通过鉴权接口保存。

取证保存原文段落、来源、采集时间。默认脚本由规则整理，包含事实摘录和标记为问题的编辑提问，完整深度分析尚需文本模型接入和人工核验。页面可以修改每镜标题和口播。

当前视频默认从原始来源的视频或配图取材。月球核电样片使用审核过的 NASA 素材清单，全屏 1080p 剪辑，短句字幕直接显示在画面中，并记录每镜来源。素材升级详见 FOOTAGE_UPGRADE.md。默认配音仍为 macOS 合成语音。STUDIO_VOICE=edge 可选在线免费语音，尚未验证其网络可用性。图片生成 API 和 OpenAI 兼容文本接口已预留，配置见 .env.example。文件是配置示例，run.sh 不会自动读取它，请自行 export 所需变量。

图片、WAV、SRT、脚本与 MP4 按任务独立保存。Remotion 渲染 H.264 画面，FFmpeg 合成 AAC 音轨、可选择的中文字幕轨和 faststart MP4。字幕按短句与配音字符比例分配时间，精确逐字对齐暂未完成。

审核按成片任务保存，脚本审核与成片审核各有记录。修改脚本不会改写既有成片或其审核结果。生成中的同一选题请求会复用任务，失败可创建新的任务重试。

## 成本与边界

本次实测使用免费公共采集、本机图形、本机语音和本机渲染，未调用收费模型接口。电力、网络和磁盘由本机承担。远程文本、图片提供商需在 Mac 本地配置密钥并显式启用 STUDIO_ALLOW_PAID=true，费用取决于选择的提供商，当前没有计费实测。

Remotion 按使用主体及团队规模有不同许可条件，请在商业团队使用前核对官方许可 https://www.remotion.dev/docs/license 。本轮没有购买订阅或许可证。

采集摘要、照片及原文的可访问性不等于转载授权。首条测试仅用于内部审核。当前版本未包含自动对外发布入口。

## 数据与备份

SQLite 与所有私有生产结果存于 data，访问令牌只在 Mac 和用户本机浏览器会话中使用。备份时先停止后台再复制整个 data 目录，保留 SQLite 相关文件。前端构建使用显式白名单，后台源码、数据库、令牌和视频不会进入公开站点。

改动前原工作台入口与构建文件的备份位于上级工作区 outputs/content-studio-backups。
