const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 2333;

// --- 核心修改：使用 __dirname 自动获取当前脚本所在目录 ---
// 这样即使你把文件夹移动到 /var/www，代码也不需要修改路径
const BASE_DIR = __dirname; 
const DATA_DIR = path.join(BASE_DIR, 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json());

// 静态文件服务：托管 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'index.html'));
});

// API: 保存行程 (支持新建和覆盖)
app.post('/api/save', (req, res) => {
    try {
        const { id, data } = req.body;
        let tripId = id;

        // 如果没有传入 id，说明是新行程，生成一个新 ID
        if (!tripId) {
            tripId = Math.random().toString(36).substr(2, 8).toUpperCase();
        }

        const filePath = path.join(DATA_DIR, `${tripId}.json`);
        
        // 写入文件 (data 是前端传来的 title 和 points 对象)
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        
        res.json({ success: true, id: tripId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "服务器保存失败" });
    }
});

// API: 读取行程
app.get('/api/load/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, `${req.params.id}.json`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ success: false, message: "行程不存在" });
    }
});

// 路由：返回 HTML
app.get('/:id', (req, res) => {
    const id = req.params.id;
    if (id.includes('.')) return res.status(404).end();
    res.sendFile(path.join(BASE_DIR, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`服务已启动，数据存储在: ${DATA_DIR}`);
});