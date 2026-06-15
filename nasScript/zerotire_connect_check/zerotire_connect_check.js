#!/usr/bin/env node
/**
 * V20260615
 * ZeroTier 网络监控脚本 (Node.js 版本)
 * 修改点：支持 IP 别名，增加 5 分钟复测机制
 * 功能: 多 IP 检测 → 失败等待5分复测 → 仍失败则重启容器 → ntfy 通知 → 1分钟后最终检测 → ntfy 通知
 */

const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const execAsync = util.promisify(exec);

//引入消息发送模块：
const { sendNotify, NOTIFY_CONFIG } = require('../sendNotify/sendNotify.js');

// ========== 配置区域 , 非常重要 ，请认真修改 ==========
const CONFIG = {
    // 检测目标：设置 IP 及其别名（不要检测本机的Zerotier IP！）
    targets: [
        //{ ip: '192.168.193.254', alias: '错误设备' }
        //{ ip: '192.168.193.1', alias: 'NAS100' },
        { ip: '192.168.193.2', alias: 'BWG服务器' },
        { ip: '192.168.193.4', alias: 'MINI-NAS' },
        { ip: '192.168.193.8', alias: 'QX-N1盒子' }
    ],
    
    // Docker 容器名称
    containerName: 'ZeroTier',
    
    // ntfy 配置
    // 使用了const { sendNotify, NOTIFY_CONFIG } = require('../sendNotify/sendNotify.js')消息模块，本处可删除
    /*ntfy: {
        topic: 'hotine',                // 替换为你的 ntfy topic
        server: 'https://ntfy.sh',      // ntfy 服务器地址
        priority: 'high',                // 优先级
        timeout: 10
    },*/
    
    // 主机标识
    hostname: 'NAS100',
    
    // ping 配置
    pingCount: 3,                      // 同一IP地址PING的次数
    pingTimeout: 5,                    // 超时的时间-秒
    
    // 第一次连通测试全部失败后，重试等待时间（毫秒）
    retryDelay: 5 * 60 * 1000,         // 第一次失败后等待 5 分钟再试
    recheckDelay: 2 * 60 * 1000,               // 重启容器后等待 2 分钟再检查
    
    // 日志配置
    log: {
        file: null,  // null 表示使用默认（脚本目录）
        console: true
    }
};

// ========== 初始化日志路径 ==========
function getLogFilePath() {
    if (CONFIG.log.file && typeof CONFIG.log.file === 'string') {
        return CONFIG.log.file;
    }
    return path.join(__dirname, 'zerotier-monitor.log');
}

const FINAL_LOG_FILE = (function() {
    const logFile = getLogFilePath();
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
        try {
            fs.mkdirSync(logDir, { recursive: true });
        } catch (err) {
            return '/tmp/zerotier-monitor.log';
        }
    }
    return logFile;
})();

// ========== 日志函数 ==========
function log(message) {
    const timestamp = new Date().toLocaleString('zh-CN');
    const logLine = `[${timestamp}] ${message}`;
    if (CONFIG.log.console) console.log(logLine);
    try {
        fs.appendFileSync(FINAL_LOG_FILE, logLine + '\n');
    } catch (err) {
        console.error(`写入日志失败: ${err.message}`);
    }
}

// ========== Ping 检测函数 ==========
async function pingHost(target) {
    try {
        // 执行 ping 命令
        const { stdout } = await execAsync(`ping -c ${CONFIG.pingCount} -W ${CONFIG.pingTimeout} ${target.ip}`);
        
        const lossMatch = stdout.match(/(\d+)% packet loss/);
        const lossPercent = lossMatch ? parseInt(lossMatch[1]) : 100;
        
        const isAlive = lossPercent < 100;
        log(`检测 ${target.alias}(${target.ip}): ${isAlive ? '✅ 通' : '❌ 不通'} (${lossPercent}% 丢包)`);
        return { ...target, alive: isAlive };
        
    } catch (error) {
        log(`检测 ${target.alias}(${target.ip}): ❌ 失败/超时`);
        return { ...target, alive: false };
    }
}

// ========== 检测所有目标 (修改为并行执行) ==========
async function checkAllTargets() {
    // 优化点：使用 Promise.all 并行测试所有 IP，防止串行累加超时时间
    const promises = CONFIG.targets.map(target => pingHost(target));
    const results = await Promise.all(promises);
    
    const allFailed = results.every(r => !r.alive);
    const details = results.map(r => `${r.alias}: ${r.alive ? '✅' : '❌'}`).join('\n');
    
    return { allFailed, details };
}

// ========== 重启 Docker 容器 ==========
async function restartContainer() {
    log(`[操作] 正在重启容器: ${CONFIG.containerName}...`);
    try {
        // 增加 30 秒强制超时，防止 docker daemon 卡死导致脚本永久挂起
        await execAsync(`docker restart ${CONFIG.containerName}`, { timeout: 30000 });
        log(`[成功] 容器 ${CONFIG.containerName} 已重启`);
        return true;
    } catch (error) {
        log(`[失败] 容器重启异常: ${error.message}`);
        return false;
    }
}

// ========== 发送 ntfy 通知 (增加超时防护) ==========
/*async function sendNtfy(message, tags = ['computer'], priority = CONFIG.ntfy.priority) {
    const title = `${CONFIG.hostname} 网络监控`;
    try {
        // 优化点：增加了 --max-time 参数，防止发送通知时由于网络不可达导致脚本死锁
        const curlCmd = `curl -s --max-time ${CONFIG.ntfy.timeout} \
            -H "Title: ${title}" \
            -H "Priority: ${priority}" \
            -H "Tags: ${tags.join(',')}" \
            -d "${message}" \
            ${CONFIG.ntfy.server}/${CONFIG.ntfy.topic}`;
        
        await execAsync(curlCmd);
        log(`[通知] ntfy 消息已尝试发送`);
    } catch (error) {
        log(`[通知] ntfy 发送错误或超时: ${error.message}`);
    }
}*/

// ========== 延迟函数 ==========
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ========== 主逻辑 ==========
async function main() {
    log('>>> 启动 ZeroTier 连通性检查');

    log('--- 第一轮检测开始 ---');
    const firstCheck = await checkAllTargets();
    
    if (!firstCheck.allFailed) {
        log('结果: 部分或全部网络正常，脚本退出。');
        return;
    }

    log(`⚠️ 警告: 第一轮检测全部失败。等待 ${CONFIG.retryDelay / 1000 / 60} 分钟后进行复测...`);
    await sleep(CONFIG.retryDelay);

    log('--- 第二轮复测开始 ---');
    const secondCheck = await checkAllTargets();

    if (!secondCheck.allFailed) {
        log('结果: 复测通过，网络已自动恢复，无需重启。');
        return;
    }

    log('🚨 确认: 连续两次检测全部失败，准备重启容器并发送通知。');
    
    // 发送通知
    /*await sendNtfy(
        `🚨 ${CONFIG.hostname} 已离线\n` +
        `经过5分钟复测仍不通：\n${secondCheck.details}\n` +
        `正在尝试重启容器 ${CONFIG.containerName}...`,
        ['warning', 'skull'],
        'urgent'
    );*/
    await sendNotify({
        title: `🚨Zerotire检测异常`,
        message: `${CONFIG.hostname} 已离线\n`+ `且经过5分钟复测仍不通：\n${secondCheck.details}\n` + `正在尝试重启容器 ${CONFIG.containerName}...`,
        priority: 2,
        tags: ['warning', 'skull']
    });


    const restartSuccess = await restartContainer();

    if (!restartSuccess) {
        //await sendNtfy(`❌ ${CONFIG.hostname} 容器重启命令执行失败！请人工处理。`, ['x', 'fire'], 'urgent');
        await sendNotify({
            title: `❌Zerotire检测异常`,
            message: `${CONFIG.hostname} 上容器 ${CONFIG.containerName} 重启命令执行失败！请人工处理。`,
            priority: 3,
            tags: ['x', 'fire']
        });
        return;
    }

    log(`等待 ${CONFIG.recheckDelay / 1000} 秒后进行最终检测...`);
    await sleep(CONFIG.recheckDelay);

    const finalCheck = await checkAllTargets();

    if (finalCheck.allFailed) {
        /*await sendNtfy(
            `❌ ${CONFIG.hostname} 重启容器后依然无法连接！\n` +
            `检测详情:\n${finalCheck.details}`,
            ['heavy_exclamation_mark', 'sos'],
            'urgent'
        );*/
        await sendNotify({
            title: `❌Zerotire检测异常`,
            message:  `❌ ${CONFIG.hostname} 重启容器后依然无法连接！\n` + `检测详情:\n${finalCheck.details}`,
            priority: 3,
            tags: ['heavy_exclamation_mark', 'sos']
        });
        log('最终状态: 依然不通，可能存在物理网络或配置故障。');
    } else {
        /*await sendNtfy(
            `✅ ${CONFIG.hostname} 已恢复正常\n` +
            `重启容器后检测结果:\n${finalCheck.details}`,
            ['white_check_mark', 'tada'],
            'default'
        );*/
        await sendNotify({
            title: `✅Zerotire修复完成`,
            message: `✅ ${CONFIG.hostname} 已恢复正常\n` + `重启容器后检测结果:\n${finalCheck.details}`,
            priority: 2,
            tags: ['white_check_mark', 'tada']
        });
        log('最终状态: 已恢复正常。');
    }

    log('>>> 监控逻辑处理完毕\n');
}

// 执行
main().catch(error => {
    log(`脚本崩溃: ${error.stack}`);
    process.exit(1);
});