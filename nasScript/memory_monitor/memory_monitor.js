/**
 * 安装依赖：npm install systeminformation dockerode
 * 运行脚本：node memory_monitor.js
 * 
 * 代码如果需要自动执行，需要forever进程守护
 * 全局安装:
 * npm install forever -g
 * 定位到app.js所在文件夹后，开启进程守护
 * forever start memory_monitor.js
 */


const si = require('systeminformation');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');

// Configure logging
const logFile = path.join(__dirname, 'memory_monitor.log');
const maxLogSize = 20 * 1024 * 1024; // 20 MB

function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp}: ${message}\n`;

    // Check log file size and rotate if necessary
    checkAndRotateLogFile(logFile, maxLogSize);

    logStream.write(logEntry);
    console.log(logEntry);
}

function checkAndRotateLogFile(filePath, maxSize) {
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > maxSize) {
            const oldFilePath = path.join(__dirname, 'memory_monitor.old.log');
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath); // Delete the old log file if it exists
            }
            fs.renameSync(filePath, oldFilePath); // Rename current log file to old log file
            logStream = fs.createWriteStream(filePath, { flags: 'a' }); // Create a new log file
            logMessage(`日志文件已超过 ${maxSize / (1024 * 1024)} MB，已重命名为 memory_monitor.old.log 并创建新的日志文件。`);
        }
    }
}

let logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Initialize Docker client
const docker = new Docker();

async function getTopProcesses(n = 3) {
    try {
        const processes = await si.processes();
        const topProcesses = processes.list
            .filter(proc => proc.mem > 0)
            .sort((a, b) => b.mem - a.mem)
            .slice(0, n);
        return topProcesses.map(proc => ({
            pid: proc.pid,
            name: proc.name,
            mem: proc.mem
        }));
    } catch (error) {
        logMessage(`获取进程信息时出错: ${error.message}`);
        return [];
    }
}

async function getTopDockerContainers(n = 3) {
    try {
        const memData = await si.mem();
        const totalSystemMemory = memData.total;
        const containers = await docker.listContainers({ all: false }); // Only running containers
        const containersInfo = [];
        for (const container of containers) {
            try {
                const stats = await docker.getContainer(container.Id).stats({ stream: false });
                const memoryUsage = stats.memory_stats.usage;
                const memoryUsagePercent = (memoryUsage / totalSystemMemory) * 100;
                containersInfo.push({ id: container.Id.slice(0, 12), name: container.Names[0].replace('/', ''), mem: memoryUsage, memPercent: memoryUsagePercent });
            } catch (error) {
                logMessage(`获取容器 ${container.Id} 统计信息时出错: ${error.message}`);
                containersInfo.push({ id: container.Id.slice(0, 12), name: container.Names[0].replace('/', ''), mem: 'undefined', memPercent: 'undefined' });
            }
        }
        containersInfo.sort((a, b) => {
            if (a.mem === 'undefined') return 1;
            if (b.mem === 'undefined') return -1;
            return b.mem - a.mem;
        });
        return containersInfo.slice(0, n);
    } catch (error) {
        logMessage(`获取 Docker 容器信息时出错: ${error.message}`);
        return [];
    }
}

async function stopContainer(containerId) {
    try {
        const container = docker.getContainer(containerId);
        await container.stop();
        logMessage(`已停止 Docker 容器 ID: ${containerId}`);
        sendMSG(`已停止 Docker 容器 ID: ${containerId}`);
    } catch (error) {
        logMessage(`停止 Docker 容器 ID ${containerId} 时出错: ${error.message}`);
    }
}

async function monitorMemory() {
    sendMSG('启用memory_monitor.js内存监控程序');
    let interval = 300000; // 5 minutes
    while (true) {
        try {
            const memData = await si.mem();
            const memoryUsagePercent = ((memData.total - memData.available) / memData.total) * 100;

            if (memoryUsagePercent > 80) {
                logMessage(`[异常]当前内存使用率: ${memoryUsagePercent.toFixed(2)}%`);
                sendMSG(`[异常]当前内存使用率: ${memoryUsagePercent.toFixed(2)}%`);
            } else {
                logMessage(`当前内存使用率: ${memoryUsagePercent.toFixed(2)}%`);
            }

            const topProcesses = await getTopProcesses();
            const topContainers = await getTopDockerContainers();

            logMessage("内存使用最多的前 3 个进程:");
            topProcesses.forEach(proc => logMessage(`PID: ${proc.pid}, 名称: ${proc.name}, 内存: ${proc.mem.toFixed(2)}%`));

            logMessage("内存使用最多的前 3 个 Docker 容器:");
            topContainers.forEach(cont => logMessage(`ID: ${cont.id}, 名称: ${cont.name}, 内存: ${cont.mem === 'undefined' ? '未定义' : (cont.mem / (1024 * 1024)).toFixed(2)} MB, 内存使用率: ${cont.memPercent === 'undefined' ? '未定义' : cont.memPercent.toFixed(2)}%`));

            if (memoryUsagePercent > 80) {
                if (topContainers.length > 0 && topContainers[0].mem !== 'undefined') {
                    await stopContainer(topContainers[0].id);
                }
                interval = 60000; // 每分钟检查一次
            } else if (memoryUsagePercent > 60) {
                interval = 60000; // 每分钟检查一次
            } else {
                interval = 300000; // 每 5 分钟检查一次
            }
        } catch (error) {
            logMessage(`监控内存时出错: ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

monitorMemory();



/**
 * 发送推送消息到ntfy服务
 * @param {string} topic - 消息的主题
 * @param {string} message - 要发送的消息内容
 * @param {string} title - 消息的大标题(默认不使用大标题)
 * @param {int} [priority=3] - 消息的优先级，可以是1-5的整数，分别是最小、小、默认、大、最大
 * @param {array} [tags] - 消息的标签,字符串数组。
 * @param {array} [attach] - 附件、图片URL。
 * @param {array} [click] - 消息被点击时跳转的url。
 * @param {string} [serverUrl='https://ntfy.sh'] - ntfy服务的URL,默认为官方服务器
 */
async function sendNtfyMessage(topic, message, title = null,  priority = 3, tags = null, attach = null , click = null , serverUrl = 'https://ntfy.sh') {
    try {
      if(topic==null || message==null || priority >5 ||priority <1){
        console.error("topic、message不能为空，priority的值只能取1、2、3、4、5!");
      }
  
      // 构建请求的headers
      const headers = new Headers({
        'Content-Type': 'application/json',
      });
  
      // 创建消息Object
      const payload={topic,message,priority};
      if(title)  payload.title = title;
      if(tags) payload.tags = tags;
      if(attach) payload.attach = attach;
      if(click) payload.click = click;
  
      // 构建请求的body
      const body = JSON.stringify(payload);
      console.log('拟发出的消息body:', body);
  
      // 发送POST请求到ntfy服务
      const response = await fetch(serverUrl, { method: 'POST', headers: headers, body: body });
  
      // 检查响应状态
      if (!response.ok) {
        throw new Error(`HTTP 错误! 状态: ${response.status}`);
      }
  
      // 获取响应数据
      const data = await response.json();
      console.log('消息发送成功:\n', data);
    } catch (error) {
      console.error('消息发送失败:\n', error);
    }
  }
  

  function sendMSG(text=""){
    sendNtfyMessage('hotine',text,'NAS异常报告',5,["nas","warning","skull_and_crossbones"]);
  }
  // 使用示例
  //sendNtfyMessage('hotine','这是一条测试用的MSG', '测试信息',4,['loudspeaker','skull','hugging_face','hotine']);