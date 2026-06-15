const { exec } = require('child_process');

// 在这里定义你的指令集，Key 为接收到的文本，Value 为执行的 shell 命令或处理函数
const commands = {
    //'start tmm': 'docker start tmm',
    //'stop tmm': 'docker stop tmm',
    // 方便你以后扩展：
    // 'status': 'docker ps',
    // 'reboot': 'echo "Rebooting..." && reboot'
};

/**
 * 检查并执行特定命令
 * @param {string} text 接收到的消息文本
 * @returns {Promise<string|null>} 如果是命令则返回执行结果，否则返回 null
 */
function handleCommand(text) {
    return new Promise((resolve) => {
        const trimmedText = text.trim();
        
        // 匹配指令
        const shellCmd = commands[trimmedText];
        
        if (!shellCmd) {
            return resolve(null); // 不是命令，正常跳过
        }

        console.log(`[Command] 检测到匹配指令，开始执行: ${shellCmd}`);
        
        // 💡 关键修改：如果是 Windows 系统，在命令前加上 chcp 65001 && 强转终端为 UTF-8
        const isWin = process.platform === 'win32';
        const finalCmd = isWin ? `chcp 65001 > nul && ${shellCmd}` : shellCmd;

        // 执行 Shell 命令
        exec(finalCmd, (error, stdout, stderr) => {
            if (error) {
                // 有时候错误信息在 stderr 里，有时候在 error.message 里
                // 这里统一做一下清理，防止把 chcp 的信息或者多余的乱码带出来
                return resolve(`❌ 执行失败:\n${stderr.trim() || error.message}`);
            }
            if (stderr) {
                return resolve(`⚠️ 执行完毕(有警告):\n${stderr.trim()}`);
            }
            return resolve(`✅ 执行成功:\n${stdout.trim() || '命令已触发，无输出'}`);
        });
    });
}

module.exports = { handleCommand };