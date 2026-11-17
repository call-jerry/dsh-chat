# DSH-Chat

基于 DeepSeek Harness 构建的 DeepSeek Chat 集成插件：在 DSH 主界面里直接使用 `chat.deepseek.com`，无需在 DSH 和浏览器之间来回切换。

> 在 DSH 里，打开即聊。

## 功能一览

| 功能 | 说明 |
|---|---|
| 内嵌 DeepSeek Chat | 左侧栏增加「聊天」入口，点击后在主区域打开 DeepSeek |
| 保持登录 | 首次登录后保存登录状态，重启 DSH 仍可继续使用 |
| 恢复上次会话 | 再次打开时自动回到上次浏览的 DeepSeek 对话 |
| 保留页面状态 | 切换 DSH 会话、工作区或其他面板时，DeepSeek 页面不会重新加载 |
| 自动让出主区域 | 打开「插件」「自动化任务」等内置面板时，聊天面板会自动关闭 |
| 公网分享链接 | 创建分享后得到 `https://chat.deepseek.com/share/...`，可直接发给其他人 |
| 快捷操作 | 顶栏提供「刷新」和「在浏览器打开」按钮 |

## 安装

需要 DeepSeek Harness 桌面版或 Web GUI。仓库已经包含构建好的文件，不需要安装依赖或自行编译。

### 1. 下载插件

下载本仓库并放到一个固定目录，例如：

```text
D:\plugins\dsh-chat-deepseek
```

### 2. 添加到 DSH Profile

打开 DSH Desktop Profile 的 `package.json`：

```text
%USERPROFILE%\.dsh\profiles\desktop\package.json
```

> 插件在 DSH 里的包名和目录名仍是 `dsh-chat-deepseek`，与本仓库标题无关，请勿改名。

把插件加入 `dependencies` 和 `bundles`。请追加到已有内容中，不要覆盖其他插件：

```json
{
  "dependencies": {
    "dsh-chat-deepseek": "file:D:/plugins/dsh-chat-deepseek"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-base", "dsh-chat-deepseek"]
    }
  }
}
```

### 3. 创建插件链接

在 PowerShell 中运行：

```powershell
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-chat-deepseek" `
  -Target "D:\plugins\dsh-chat-deepseek"
```

如果插件放在其他目录，请修改 `-Target` 后面的路径。

### 4. 重启 DSH

完全退出并重新启动 DSH，左侧栏会出现「聊天」入口。

## 使用

1. 点击左侧栏的「聊天」。
2. 首次打开时登录 DeepSeek。
3. 登录后即可像在官网一样新建、查看和继续对话。
4. 点击其他 DSH 会话或面板即可暂时收起，重新打开时页面状态仍会保留。

「聊天」是 GUI 的原生面板，行为与「插件」「自动化任务」一致：点它是**选中**而不是开关。回到对话请点左侧栏的会话行或「＋ 新会话」。

支持手机号、验证码、密码和 Apple 账号登录。

> 微信扫码登录暂不可用。需要使用微信登录时，请点击顶栏的「在浏览器打开」，在系统浏览器中完成登录。

## 分享会话

在 DeepSeek 会话中创建分享链接后，插件会将链接处理为官方公网地址：

```text
https://chat.deepseek.com/share/<分享 ID>
```

这个链接可以直接发送给其他人，不需要对方安装本插件。

## 隐私说明

- 使用你自己的 DeepSeek 账号，聊天请求直接发送到 `chat.deepseek.com`。
- 插件不使用第三方中转服务，也不记录聊天内容。
- 聊天面板和登录状态只在本机使用，不会开放给局域网或公网。

## 已知限制

- 仅支持在安装插件的这台电脑上使用聊天面板。
- 微信扫码登录不可用，其他登录方式不受影响。
- 如果本地服务端口发生变化，可能需要重新登录。
- DeepSeek 官网更新后，插件可能需要同步适配。

## 许可

Apache-2.0
