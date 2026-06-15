const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { handleCommand } = require('./commandHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 重要配置文件：
const PORT = 3000;
const NTFY_TOPIC_URL = 'https://ntfy.sh/hotine';
const NTFY_TITLE = 'NAS消息中心';
const DATA_FILE = path.join(__dirname, 'data', 'messages.json');

// 确保数据目录存在
if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 消息管理逻辑 ---
let messageList = [];

// 从本地加载历史消息
if (fs.existsSync(DATA_FILE)) {
    try {
        messageList = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        cleanOldMessages(); // 启动时清理一次过期的
    } catch (e) {
        console.error('加载历史数据失败，初始化为空', e);
    }
}

// 清理超过 5 天的消息
function cleanOldMessages() {
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const originalLength = messageList.length;

    messageList = messageList.filter(msg => (now - msg.time) < FIVE_DAYS_MS);

    if (messageList.length !== originalLength) {
        saveMessages();
    }
}

// 保存到本地
function saveMessages() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messageList, null, 2), 'utf-8');
}

// 广播消息给所有打开的网页前端
function broadcast(msgObject) {
    const data = JSON.stringify(msgObject);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// --- WebSocket 连接（前端一打开就发送最近5天的历史消息） ---
wss.on('connection', (ws) => {
    cleanOldMessages();
    ws.send(JSON.stringify({ type: 'history', data: messageList }));
});

// --- 核心：监听 ntfy.sh 的实时消息 (SSE 长连接) ---
let ntfyTimeoutTimer = null;
let retryCount = 0; // 指数退避计数器

async function listenToNtfy() {
    console.log(`正在连接到 ntfy 监听流: ${NTFY_TOPIC_URL}/json?since=all`);

    if (ntfyTimeoutTimer) clearTimeout(ntfyTimeoutTimer);

    const controller = new AbortController();

    const resetTimeout = () => {
        if (ntfyTimeoutTimer) clearTimeout(ntfyTimeoutTimer);
        ntfyTimeoutTimer = setTimeout(() => {
            console.warn('⚠️ 超过 45 秒未收到 ntfy 心跳或消息，判定为僵死连接，正在主动断开重连...');
            controller.abort(); 
        }, 45000);
    };

    resetTimeout();

    try {
        const response = await fetch(`${NTFY_TOPIC_URL}/json?since=all`, {
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP 错误! 状态码: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        retryCount = 0; // 成功连接，计数归零

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                console.log('ntfy 连接正常结束或断开，3秒后重试...');
                setTimeout(listenToNtfy, 3000);
                break;
            }

            resetTimeout();

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const ntfyMsg = JSON.parse(line);
                    if (ntfyMsg.event !== 'message') continue;

                    const newMsg = {
                        id: ntfyMsg.id,
                        text: ntfyMsg.message,
                        time: ntfyMsg.time * 1000,
                        title: ntfyMsg.title || '',
                        // 🌟 完美捕获 ntfy 官方发过来的优先级字段
                        priority: ntfyMsg.priority || 3
                    };

                    if (!messageList.some(m => m.id === newMsg.id)) {
                        messageList.push(newMsg);

                        // 按时间戳从小到大排序
                        messageList.sort((a, b) => a.time - b.time);

                        cleanOldMessages();
                        saveMessages();

                        // 实时推送到网页端
                        broadcast({ type: 'message', data: newMsg });

                        // 检查并执行指令
                        const cmdResult = await handleCommand(newMsg.text);
                        if (cmdResult) {
                            // 🌟 核心改进：命令执行完毕后的反馈，我们固定按默认优先级（3级）发回，显示为漂亮的深灰色卡片
                            await sendToNtfy(`[执行结果]\n${cmdResult}`, 3);
                        }
                    }
                } catch (e) {
                    // 忽略单行 JSON 解析错误
                }
            }
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('🔄 连接已被成功中止，正在准备重建通道...');
        } else {
            console.error('❌ 连接 ntfy 遇到错误:', err.message);
        }

        if (ntfyTimeoutTimer) clearTimeout(ntfyTimeoutTimer);

        retryCount++;
        let delay = Math.min(Math.pow(2, retryCount), 60) * 1000;
        const jitter = Math.random() * 1000;
        const finalDelay = delay + jitter;

        console.log(`将在 ${(finalDelay / 1000).toFixed(1)} 秒后尝试重新连接...`);
        setTimeout(listenToNtfy, finalDelay);
    }
}

// --- 发送消息到 ntfy ---
// 🌟 核心升级：函数新增支持接收 priority 参数（不传默认是 3）
async function sendToNtfy(text, priority = 3) {
    try {
        const base64Title = Buffer.from(NTFY_TITLE).toString('base64');
        const encodedTitle = `=?utf-8?B?${base64Title}?=`;

        await fetch(NTFY_TOPIC_URL, {
            method: 'POST',
            body: text, 
            headers: {
                'Title': encodedTitle,
                'X-Priority': String(priority) // 🌟 核心补全：将优先级打包进 HTTP 头，通知 ntfy 服务端
            }
        });
    } catch (e) {
        console.error('发送消息到 ntfy 失败:', e.message);
    }
}

// --- API 路由升级 ---
// 网页端发送消息的接口：完美兼容前端可能上传的 priority 字段
app.post('/api/send', async (req, res) => {
    const { text, priority } = req.body; // 🌟 核心升级：允许解析前端传来的优先级
    if (!text) return res.status(400).json({ error: '消息不能为空' });
    
    // 如果前端传了 priority 就用前端的（转成数字类型），否则默认 3 级
    const pLevel = priority ? parseInt(priority, 10) : 3;
    
    await sendToNtfy(text, pLevel);
    res.json({ success: true });
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`服务器已运行在 http://localhost:${PORT}`);
    listenToNtfy();
});