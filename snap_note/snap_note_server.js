const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 2334;
const DATA_DIR = path.join(__dirname, 'data');
const MAX_SIZE = 1 * 1024 * 1024; // 限制 1MB，防止恶意撑爆硬盘

// 启动检查
console.log("--- SnapNote Server Starting ---");
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // 1. 处理 API 获取数据
    if (pathname === '/api/get' && req.method === 'GET') {
        const noteName = parsedUrl.query.name;
        // 正则校验：只允许字母数字下划线，且长度在 6-64 位，防止路径穿透和超长请求
        if (!noteName || !/^\w{6,64}$/.test(noteName)) {
            res.writeHead(400);
            return res.end('Invalid Name');
        }

        const filePath = path.join(DATA_DIR, noteName);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('');
        }
        return;
    }

    // 2. 处理 API 保存数据
    if (pathname === '/api/save' && req.method === 'POST') {
        const noteName = parsedUrl.query.name;
        if (!noteName || !/^\w{6,64}$/.test(noteName)) {
            res.writeHead(400);
            return res.end('Invalid Name');
        }

        // --- 新增：预检 Content-Length ---
        const clen = parseInt(req.headers['content-length'], 10);
        if (!isNaN(clen) && clen > MAX_SIZE) {
            res.writeHead(413);
            return res.end('Content too large (header check)');
        }

        const filePath = path.join(DATA_DIR, noteName);
        let body = '';
        let bodyLen = 0;

        req.on('data', chunk => {
            bodyLen += chunk.length;

            // 实时检查大小
            if (bodyLen > MAX_SIZE) {
                console.log(`[Blocked]: ${noteName} exceeded size limit.`);
                res.writeHead(413);
                res.end('Content too large');
                // 销毁请求，不再接收后续数据，防止带宽浪费
                req.destroy();
                return;
            }
            body += chunk.toString();
        });

        req.on('end', () => {
            // 如果连接已被 destroy()，end 事件仍可能触发，这里加个保护
            if (res.writableEnded || bodyLen > MAX_SIZE) return;

            try {
                const trimmedBody = body.trim();
                if (trimmedBody === '') {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`[Delete]: ${noteName}`);
                    }
                    res.writeHead(200);
                    res.end('Deleted');
                } else {
                    fs.writeFileSync(filePath, body); // 写入完整的 body
                    console.log(`[Save]: ${noteName} (${(bodyLen / 1024).toFixed(1)} KB)`);
                    res.writeHead(200);
                    res.end('Success');
                }
            } catch (err) {
                console.error(`[IO Error]: ${err.message}`);
                res.writeHead(500);
                res.end('IO Error');
            }
        });
        return;
    }

    // 3. 静态页面逻辑
    if (pathname === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
    }

    const htmlPath = path.join(__dirname, 'index.html');
    fs.readFile(htmlPath, (err, html) => {
        if (err) {
            res.writeHead(500);
            res.end('index.html missing');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Internal server ready on http://127.0.0.1:${PORT}`);
});