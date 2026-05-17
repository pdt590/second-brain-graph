# Windows 一键安装说明

给 Windows 朋友使用时：

1. 把项目打成 zip 发给他。
2. 让他在 Windows 里解压。
3. 双击 `install-second-brain-windows.bat`。
4. 安装完成后浏览器会打开：

```text
http://localhost:3030
```

默认登录账号：

```text
用户名：admin
密码：123456
```

如果 `http://localhost:3030` 在 Windows 浏览器里打不开，看安装窗口最后输出的第二个地址，通常类似：

```text
http://172.xx.xx.xx:3030
```

这是 WSL 的局域地址，在某些 Windows/WSL 环境里比 `localhost` 更稳定。

## 前置条件

他的 Windows 电脑需要已经具备：

- WSL
- Hermes Agent
- Hermes 的 `llm-wiki` 已经配置或已有 wiki 目录
- WSL 里有 Node.js 18+ 和 npm，或 Hermes 自带 Node 位于 `~/.hermes/node/bin`

## 安装器会做什么

- 把项目复制到 WSL 的 `~/second-brain-graph-app`
- 自动寻找 wiki 目录：
  - `$HERMES_WIKI_DIR`
  - `~/.hermes/llm-wiki`
  - `~/wiki`
  - `~/llm-wiki`
- 从 `~/.hermes/.env` 读取 `API_SERVER_KEY`
- 自动探测 Hermes API：
  - `http://127.0.0.1:8643`
  - `http://127.0.0.1:8642`
- 安装 npm 依赖
- 构建前端
- 后台启动 Second Brain Graph

## 常用命令

在 WSL 里：

```bash
bash ~/second-brain-graph-app/status-second-brain.sh
bash ~/second-brain-graph-app/stop-second-brain.sh
bash ~/second-brain-graph-app/start-second-brain.sh
bash ~/second-brain-graph-app/reset-admin-password.sh 123456
```

配置文件：

```bash
~/second-brain-graph-app/.env
```

如果 wiki 路径没有自动识别，修改 `.env` 里的：

```bash
HERMES_WIKI_DIR=/path/to/wiki
```

然后重启：

```bash
bash ~/second-brain-graph-app/stop-second-brain.sh
bash ~/second-brain-graph-app/start-second-brain.sh
```
