/**
 * 网络流量监控脚本 - 完整整合版
 * 功能：
 * 1. 每小时 01 分检查流量，超过阈值则发送报警（每小时触发）。
 * 2. 每天 23:59 发送当日流量汇总报告。
 * 3. 支持 Debug 模式，查看系统所有网口信息及详细执行流程。
 * 4. 月度统计从每月 28 日起算。
 * 在脚本根文件夹执行 npm install node-schedule 安装所需依赖
 * * v2026-06-15
 */

const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

//引入消息发送模块：
const { sendNotify, NOTIFY_CONFIG } = require('../sendNotify/sendNotify.js');

// --- 核心配置区域 (CONFIG) ---
const CONFIG = {
    debugMode: false,               // 调试模式：true 时输出详细过程并列出系统所有网口
    netName: "ens18",              // 要监控的网口名称（如 eth0, ens18）
    dailyLimitGB: 10,           // 每日流量阈值 (GB)，超过后每小时报警
    //ntfyTopic: "hotine",           // ntfy.sh 的主题名
    //ntfyServer: "https://ntfy.sh", // ntfy 服务器地址
    logFileName: 'network_traffic.log' // 流量记录文件名
};

/**
 * 调试输出助手：根据 debugMode 决定是否在控制台打印
 */
function debugLog(message, data = "") {
    if (CONFIG.debugMode) {
        const time = new Date().toLocaleString();
        console.log(`[DEBUG][${time}] ${message}`, data);
    }
}

/**
 * 读取 /proc/net/dev 获取网口实时流量
 */
function readNetworkStats() {
    const statsPath = '/proc/net/dev';
    if (!fs.existsSync(statsPath)) {
        console.error("[E] 错误：无法找到 /proc/net/dev，该脚本仅支持 Linux 系统。");
        return [];
    }

    const stats = fs.readFileSync(statsPath, 'utf-8');
    const lines = stats.split('\n');
    const result = [];

    debugLog("--- 开始扫描系统可用网口 ---");

    for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trimStart();
        const parts = line.split(/\s+/);
        if (parts.length > 1) {
            const interfaceName = parts[0].replace(':', '');
            const rxBytes = parseInt(parts[1]);
            const txBytes = parseInt(parts[9]);

            // Debug 模式下打印所有发现的网口
            debugLog(`发现网口: [${interfaceName}] | 接收: ${rxBytes} | 发送: ${txBytes}`);

            if (interfaceName === CONFIG.netName) {
                result.push([interfaceName, rxBytes, txBytes]);
            }
        }
    }

    if (result.length === 0) {
        console.warn(`[!] 警告：未找到配置的网口 "${CONFIG.netName}"，请检查 CONFIG 中的网口名。`);
    }

    return result;
}

/**
 * 获取日志文件绝对路径
 */
function getLogFilePath() {
    return path.join(__dirname, CONFIG.logFileName);
}

/**
 * 将当前流量快照写入日志
 */
function logTraffic(trafficData) {
    if (!trafficData || trafficData.length < 1) return;
    const now = new Date();
    // 格式: YYYY-MM-DD HH:mm:ss RX TX
    const logEntry = `${now.toISOString().slice(0, 19).replace('T', ' ')} ${trafficData[0][1]} ${trafficData[0][2]}\n`;
    fs.appendFileSync(getLogFilePath(), logEntry);
    debugLog("已成功写入当前流量快照到日志。");
}

/**
 * 从日志文件中计算当日及本月（28日起）的累计流量
 */
function calculateTrafficStats() {
    debugLog("正在分析日志并计算流量统计...");
    const logFile = getLogFilePath();
    let todayReceived = 0, todaySent = 0, monthlyReceived = 0, monthlySent = 0;
    
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    
    if (!fs.existsSync(logFile)) {
        debugLog("日志文件尚未创建，跳过统计。");
        return { todayReceived: 0, todaySent: 0, monthlyReceived: 0, monthlySent: 0 };
    }

    const logArray = fs.readFileSync(logFile, 'utf-8').split('\n').filter(line => line.trim() !== '');
    if (logArray.length === 0) return { todayReceived: 0, todaySent: 0, monthlyReceived: 0, monthlySent: 0 };

    // 1. 当日统计：找到今天的第一条和最后一条
    const todayEntries = logArray.filter(line => line.startsWith(todayStr));
    if (todayEntries.length > 0) {
        const firstData = todayEntries[0].split(' ').slice(2).map(Number);
        const lastData = todayEntries[todayEntries.length - 1].split(' ').slice(2).map(Number);
        todayReceived = lastData[0] - firstData[0];
        todaySent = lastData[1] - firstData[1];
    }

    // 2. 月度统计：从本月（或上月）28日开始
    const targetDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 28));
    if (now.getDate() < 28) {
        targetDay.setMonth(targetDay.getMonth() - 1);
    }
    const targetDateStr = targetDay.toISOString().substring(0, 10);
    
    const monthEntries = logArray.filter(line => line.startsWith(targetDateStr));
    if (monthEntries.length > 0) {
        const monthFirstData = monthEntries[0].split(' ').slice(2).map(Number);
        const lastTotalEntry = logArray[logArray.length - 1].split(' ').slice(2).map(Number);
        monthlyReceived = lastTotalEntry[0] - monthFirstData[0];
        monthlySent = lastTotalEntry[1] - monthFirstData[1];
    }

    return { todayReceived, todaySent, monthlyReceived, monthlySent };
}

/**
 * 调用 ntfy 发送通知
 */
/*async function sendNtfyMessage(message, title, priority = 3, tags = []) {
    debugLog(`正在发送 Ntfy 推送: ${title}...`);
    try {
        const payload = { 
            topic: CONFIG.ntfyTopic, 
            message, 
            title, 
            priority, 
            tags 
        };
        const response = await fetch(CONFIG.ntfyServer, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        if (response.ok) {
            debugLog("推送发送成功。");
        } else {
            console.error(`[E] 推送失败，HTTP 状态码: ${response.status}`);
        }
    } catch (error) {
        console.error('[E] Ntfy 网络请求异常:', error.message);
    }
}
*/

// 单位转换助手
function bytesToMB(bytes) { return Math.round(bytes / (1024 * 1024)); }
function bytesToGB(bytes) { return (bytes / (1024 * 1024 * 1024)).toFixed(2); }

/**
 * 主执行函数
 * @param {boolean} isEndOfDay - 是否是日终汇总模式
 */
async function main(isEndOfDay = false) {
    debugLog(`--- [任务启动] 模式: ${isEndOfDay ? '日终汇总' : '常规检查'} ---`);
    
    const trafficData = readNetworkStats();
    if (trafficData.length === 0) return;

    // 记录最新数据
    logTraffic(trafficData);

    // 计算统计量
    const stats = calculateTrafficStats();
    const todayTotalGB = bytesToGB(stats.todaySent + stats.todayReceived);
    const monthlyTotalGB = bytesToGB(stats.monthlySent + stats.monthlyReceived);

    // 构造通用报告文本
    let report = `当日累计: ${todayTotalGB} GB (↑${bytesToGB(stats.todaySent)} / ↓${bytesToGB(stats.todayReceived)})\n`;
    report += `月度累计: ${monthlyTotalGB} GB (${(monthlyTotalGB / 1024).toFixed(1)}%,28日重置)`;

    // 分支 1: 日终汇总报告 (23:59 发送)
    if (isEndOfDay) {
        console.log(`[I] ${new Date().toLocaleDateString()} 日终汇总任务执行中...`);
        //await sendNtfyMessage(report, '🌙 每日流量终结报告', 3, ['calendar', 'BWG']);
        await sendNotify({
            title:'BWG流量日终报告🌙',
            message:report,
            priority: 2 ,
            tags: ['calendar', 'BWG']
        })
    } 
    // 分支 2: 常规超量报警检查 (每小时运行)
    else {
        if (todayTotalGB > CONFIG.dailyLimitGB) {
            debugLog(`警告触发：当前流量 ${todayTotalGB} GB > 阈值 ${CONFIG.dailyLimitGB} GB`);
            const alertMsg = `注意：今日流量已达 ${todayTotalGB} GB，已超过预设阈值！\n\n${report}`;
            //await sendNtfyMessage(alertMsg, '⚠️ 流量超限提醒', 4, ['warning', 'loudspeaker']);
            await sendNotify({
            title:'BWG流量警报🌙',
            message:alertMsg,
            priority: 3 ,
            tags: ['warning', 'loudspeaker']
        })
        } else {
            debugLog(`正常：当前流量 ${todayTotalGB} GB，未达阈值。`);
        }
    }
    
    debugLog("--- [任务结束] ---");
}

// --- 定时任务配置 ---

// 1. 每小时的 01 分：例行流量记录与超量报警
schedule.scheduleJob("1 * * * *", () => {
    main(false);
});

// 2. 每天的 23:59：发送当日最终汇总
schedule.scheduleJob("59 23 * * *", () => {
    main(true);
});

// 启动提示
console.log(`[I] 流量监控服务已启动！`);
console.log(`[I] 当前模式: ${CONFIG.debugMode ? 'DEBUG (输出详细信息)' : 'PRODUCTION (仅关键信息)'}`);
console.log(`[I] 监控网口: ${CONFIG.netName} | 报警阈值: ${CONFIG.dailyLimitGB} GB`);

// 如果是调试模式，启动时立即跑一遍，方便查看网口列表和连通性
if (CONFIG.debugMode) {
    console.log("[D] 调试模式：正在执行首次即时扫描...");
    main(false);
}