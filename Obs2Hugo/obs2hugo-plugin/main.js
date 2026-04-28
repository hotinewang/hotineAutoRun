const { Plugin, Notice, TFile, PluginSettingTab, Setting, normalizePath } = require('obsidian');
const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_SETTINGS = {
    HUGO_PATH: 'C:\\hugo_blog\\',
    HUGO_STATIC_PATH: 'static\\blog',
    HUGO_POSTS_PATH: 'content\\posts',
    HUGO_TAG: 'blog'
}

module.exports = class HugoExporterPlugin extends Plugin {
    async onload() {
        console.log('Hugo Exporter 插件已加载');

        // 加载用户保存的设置
        await this.loadSettings();

        // 添加设置选项卡
        this.addSettingTab(new HugoExporterSettingTab(this.app, this));

        // 在侧边栏添加图标
        this.addRibbonIcon('rocket', '导出 Hugo 博客', async (evt) => {
            new Notice('正在开始导出 Hugo 博客...');
            try {
                await this.exportToHugo();
                new Notice('导出完成！');
            } catch (err) {
                console.error(err);
                new Notice('导出失败，请查看控制台错误详情');
            }
        });
    }

    // 核心导出逻辑
    async exportToHugo() {
        const { vault } = this.app;
        const files = vault.getMarkdownFiles();
        const allFiles = vault.getFiles();

        for (const file of files) {
            let content = await vault.read(file);
            
            // 简单的 Frontmatter 解析
            const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
            if (!fmMatch) continue;

            const fmContent = fmMatch[1];
            const bodyContent = content.slice(fmMatch[0].length);
            
            // 检查标签（匹配 "- blog" 或 "tags: [blog]" 这种形式）
            const tagRegex = new RegExp(`(-\\s+${this.settings.HUGO_TAG}|\\s+${this.settings.HUGO_TAG})`, 'g');
            if (!tagRegex.test(fmContent)) continue;

            console.log(`正在处理: ${file.path}`);

            // 1. 处理分类
            let updatedFm = fmContent;
            if (!fmContent.includes('categories:')) {
                const folderName = file.parent.name || "Uncategorized";
                updatedFm += `categories: ["${folderName}"]\n`;
            }

            // 2. 处理内容中的链接和图片
            let newBody = bodyContent;
            newBody = newBody.replace(/!\[\[(.*?)\]\]|\[\[(.*?)\]\]/g, (match, p1, p2) => {
                const linkText = p1 || p2;
                const isImage = !!p1;
                const fileName = linkText.split('|')[0].split('/').pop();
                
                const targetFile = allFiles.find(f => f.name.includes(fileName));
                if (targetFile) {
                    if (isImage) {
                        const destPath = path.join(this.settings.HUGO_PATH, this.settings.HUGO_STATIC_PATH, targetFile.name);
                        this.copyFileSync(targetFile, destPath);
                        // 生成 Hugo 标准的图片路径 (去除 static 部分)
                        const webPath = `/${this.settings.HUGO_STATIC_PATH.replace(/\\/g, '/')}/${targetFile.name}`.replace(/\/static\//, '/');
                        return `![${targetFile.name}](${webPath})`;
                    } else {
                        const cleanName = targetFile.basename.replace(/[.,!?;:'"(){}[\]<>/?！，。？；：“”‘’（）【】《》、|]/g, '').toLowerCase();
                        return `[${targetFile.basename}](/posts/${cleanName})`;
                    }
                }
                return match;
            });

            // 3. 写入文件
            const finalContent = `---\n${updatedFm}---\n${newBody}`;
            // 保持文件夹结构
            const relativePath = file.parent.path === '/' ? '' : file.parent.path;
            const fullDestDir = path.join(this.settings.HUGO_PATH, this.settings.HUGO_POSTS_PATH, relativePath);
            
            if (!fs.existsSync(fullDestDir)) fs.mkdirSync(fullDestDir, { recursive: true });
            fs.writeFileSync(path.join(fullDestDir, file.name), finalContent, 'utf8');
        }
    }

    copyFileSync(tFile, destPath) {
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        const adapter = this.app.vault.adapter;
        const realPath = adapter.getFullPath(tFile.path);
        fs.copyFileSync(realPath, destPath);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// 设置界面类
class HugoExporterSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Hugo 导出插件设置' });

        new Setting(containerEl)
            .setName('Hugo 根目录')
            .setDesc('你 Hugo 项目的本地绝对路径')
            .addText(text => text
                .setPlaceholder('例如 D:\\HugoSite')
                .setValue(this.plugin.settings.HUGO_PATH)
                .onChange(async (value) => {
                    this.plugin.settings.HUGO_PATH = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('附件存储路径')
            .setDesc('相对于 Hugo 根目录的附件目录')
            .addText(text => text
                .setPlaceholder('static\\blog')
                .setValue(this.plugin.settings.HUGO_STATIC_PATH)
                .onChange(async (value) => {
                    this.plugin.settings.HUGO_STATIC_PATH = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('文章存储路径')
            .setDesc('相对于 Hugo 根目录的文章目录')
            .addText(text => text
                .setPlaceholder('content\\posts')
                .setValue(this.plugin.settings.HUGO_POSTS_PATH)
                .onChange(async (value) => {
                    this.plugin.settings.HUGO_POSTS_PATH = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('识别标签')
            .setDesc('只有带有此标签的文章才会被导出')
            .addText(text => text
                .setPlaceholder('blog')
                .setValue(this.plugin.settings.HUGO_TAG)
                .onChange(async (value) => {
                    this.plugin.settings.HUGO_TAG = value;
                    await this.plugin.saveSettings();
                }));
    }
}