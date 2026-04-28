//v20260428
const Docker = require('dockerode');
const express = require('express');
const path = require('path');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();

app.use(express.json());

//-------------------设置----------------------------
//该网页运行的端口：
const WEB_PORT = 3876;

// 格式化运行时间
function formatUptime(status) {
    return status.replace('Up ', '').replace('Exited ', '已停止 ');
}

async function getContainerStats(container) {
    try {
        const stats = await container.stats({ stream: false });
        const memUsage = stats.memory_stats.usage || 0;
        const memLimit = stats.memory_stats.limit || 1;
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuPercent = systemDelta > 0 ? ((cpuDelta / systemDelta) * 100).toFixed(2) : "0.00";
        return {
            cpu: parseFloat(cpuPercent),
            memory: memUsage,
            memoryStr: `${(memUsage / 1024 / 1024).toFixed(2)} MB`
        };
    } catch (e) { return { cpu: 0, memory: 0, memoryStr: "-" }; }
}

app.get('/api/containers', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true });
        const data = await Promise.all(containers.map(async (info) => {
            const container = docker.getContainer(info.Id);
            let stats = { cpu: 0, memory: 0, memoryStr: "0 MB" };
            if (info.State === 'running') stats = await getContainerStats(container);
            return {
                id: info.Id,
                name: info.Names[0].replace(/^\//, ''),
                state: info.State,
                uptime: formatUptime(info.Status),
                cpu: stats.cpu,
                memory: stats.memory,
                memoryStr: stats.memoryStr
            };
        }));
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    const container = docker.getContainer(id);
    try {
        if (action === 'start') await container.start();
        else if (action === 'stop') await container.stop();
        else if (action === 'restart') await container.restart();
        else if (action === 'unpause') await container.unpause(); 
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(WEB_PORT, '0.0.0.0', () => console.log(`管理面板运行在: http://localhost:${WEB_PORT}`));