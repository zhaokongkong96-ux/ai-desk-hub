# 独立加密同步服务

用途：仅传输用户确认加入的跨设备加密数据，不复用飞书 Worker、数据库或密钥。

## 结构

`worker.mjs` 为 Cloudflare Worker，`schema.sql` 为独立 D1 表。浏览器 AES-256-GCM 加密记录，服务只保存密文、单调递增版本、设备名称、随机标识、令牌哈希和配对过期时间；服务不持有内容解密密钥。设备名称是用户填写的普通标签，非加密正文。

创建需持有创建授权码，服务只存其 SHA-256 哈希。每个设备独立随机凭据，数据库只存凭据哈希。配对内容包含客户端解密密钥与一次性配对码，配对码 5 分钟有效，数据库原子消费；请只交给自己的设备，不放入URL、二维码第三方生成器或公开聊天。

`GET /v1/data`、`PUT /v1/data` 均需设备凭据。PUT 采用预期版本号条件写入，版本不符返回 409。只接受密文封装，有大小限制。不同空间按设备归属隔离。撤销设备后其后续请求返回 401，且由其创建的未使用邀请失效；不能撤回已下载的本机副本。服务未开启请求日志，不记录正文或凭据。

免费计划配置，未改变账单。不承诺网络/额度/后台常驻送达。最多允许创建 8 个空间，日常同一空间内配对设备即可，不应反复新建。

## 开发与部署

先复制 `wrangler.example.jsonc` 为本机忽略的 `wrangler.jsonc`，填入专用数据库绑定。实际账户和数据库配置不随公开仓库提交。

- `node --test sync-service/worker.test.mjs` 使用内存 SQLite 的 D1 替身，不访问真实用户数据。
- `node sync-service/local.mjs` 监听本机 8789，SQLite 和创建授权码在已忽略的 `.private/`，码不打印。
- `wrangler d1 create ai-desk-hub-sync --config sync-service/wrangler.jsonc` 创建独立数据库。
- `wrangler d1 execute ai-desk-hub-sync --remote --file sync-service/schema.sql --config sync-service/wrangler.jsonc` 仅初始化新同步数据库。
- `CREATE_CODE_HASH` 用 Wrangler Secret 设置为创建授权码哈希。不要提交 `.private/`，不要把原始码写进前端或终端日志。
- `wrangler deploy --config sync-service/wrangler.jsonc` 部署，`sync-config.json` 仅存公开服务地址。

本轮部署记录见 `../docs/DEVICE_SYNC_V014.md`。创建授权码供用户本人本机查看，位于 `.private/create-code.txt`；密钥不进入测试输出或共享截图。

## 运行界限

全部配对设备被清除或丢失后，服务不能恢复加密密钥；请保留自己的本机备份和至少一台受保护的已配对设备。初版提供设备撤销，不提供远程抹除本机数据、跨用户家庭协作或任意外部日历写回。
