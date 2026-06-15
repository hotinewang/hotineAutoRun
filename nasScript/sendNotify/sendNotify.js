/**
 * 推送配置中心
 * v2026.06.15
 */
const NOTIFY_CONFIG = {
    timeout: 20000, // 全局超时（毫秒）
    
    ntfy: {
        enabled: true,
        server: 'https://ntfy.sh',
        topic: 'hotine',
        defaultPriority: 2, // 默认：中
    },
    gotify: {
        enabled: true,
        server: 'http://gotify.hotine.wang',
        token: 'Aw_fbAwyOvGJOt_',
        defaultPriority: 2, // 默认：中
    }
};

function debugLog(message) {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[Debug] ${message}`);
    }
}

/**
 * 渠道处理器集合
 */
const PROVIDERS = {
    // 1. Ntfy 渠道 (三档映射)
    async ntfy(config, { title, message, priority, tags }, signal) {
        if (!config.server || !config.topic) {
            throw new Error('Ntfy 配置不完整，缺少 server 或 topic');
        }

        // 映射关系：1->2(低), 2->3(中), 3->5(紧急)
        const ntfyPriorityMap = { 1: 2, 2: 3, 3: 5 };
        const finalPriority = ntfyPriorityMap[priority] || ntfyPriorityMap[config.defaultPriority] || 3;

        const payload = {
            topic: config.topic,
            message,
            title,
            priority: finalPriority,
            tags: tags || []
        };
        
        const response = await fetch(config.server, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });

        if (!response.ok) {
            throw new Error(`HTTP 状态码: ${response.status}`);
        }
    },

    // 2. Gotify 渠道 (三档映射)
    async gotify(config, { title, message, priority }, signal) {
        if (!config.token || !config.server) {
            throw new Error('Gotify 配置不完整，缺少 token 或 server');
        }
        
        // 映射关系：1->3(低), 2->5(中), 3->9(红字高亮报警)
        const gotifyPriorityMap = { 1: 3, 2: 5, 3: 9 };
        const finalPriority = gotifyPriorityMap[priority] || gotifyPriorityMap[config.defaultPriority] || 5;

        const baseUrl = config.server.replace(/\/$/, "");
        const fullUrl = `${baseUrl}/message?token=${config.token}`;
        
        const payload = {
            message,
            priority: finalPriority
        };
        if (title) payload.title = title;

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });

        if (!response.ok) {
            throw new Error(`HTTP 状态码: ${response.status}`);
        }
    }
};

/**
 * 统一发送通知函数
 * @param {Object} options 
 * @param {number} [options.priority=2] - 优先级：1(低), 2(中), 3(高)
 */
async function sendNotify({ title, message, priority = 2, tags }) {
    if (!message) {
        console.error('[E] 发送失败：消息正文(message)不能为空');
        return;
    }

    // 限制输入必须在 1~3 之间
    const safePriority = Math.max(1, Math.min(3, parseInt(priority) || 2));

    debugLog(`开始广播通知: [${title || '无标题'}], 统一等级: ${safePriority}`);
    
    const activeProviders = Object.keys(PROVIDERS).filter(key => NOTIFY_CONFIG[key]?.enabled);

    if (activeProviders.length === 0) {
        console.warn('[W] 没有启用任何推送渠道，请检查 NOTIFY_CONFIG');
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, NOTIFY_CONFIG.timeout || 10000);

    const tasks = activeProviders.map(async (key) => {
        try {
            debugLog(`正在通过 [${key}] 发送...`);
            await PROVIDERS[key](
                NOTIFY_CONFIG[key], 
                { title, message, priority: safePriority, tags }, 
                controller.signal
            );
            console.log(`[✓] [${key}] 推送成功`);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error(`[X] [${key}] 推送失败: 请求超时`);
            } else {
                console.error(`[X] [${key}] 推送失败:`, error.message);
            }
        }
    });

    try {
        await Promise.all(tasks);
    } finally {
        clearTimeout(timeoutId);
    }
    
    debugLog('所有通知处理完毕。');
}

module.exports = {
    NOTIFY_CONFIG,
    sendNotify
};