# 像素风情绪小屋 - 完整版部署指南

## 本地运行

### 前置要求
- Node.js 16+ 环境

### 步骤

1. 安装依赖：
```bash
npm install
```

2. 启动服务：
```bash
npm start
```

3. 浏览器访问 `http://127.0.0.1:8080`

---

## 云服务器部署

### 方案一：基础 Node.js 部署（适合小型服务器）

1. 在服务器上 clone 项目：
```bash
git clone <你的仓库地址>
cd erciyuan-guaiji-xiaowu
npm install
```

2. 使用 PM2 管理进程（推荐）：
```bash
npm install -g pm2
pm2 start server.js --name "emotion-room"
pm2 save
pm2 startup
```

3. 配置 Nginx 反向代理（可选，推荐配置域名和 HTTPS）：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 方案二：Docker 部署

1. 创建 `Dockerfile`：
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

2. 创建 `docker-compose.yml`：
```yaml
version: '3'
services:
  emotion-room:
    build: .
    ports:
      - "8080:8080"
    restart: unless-stopped
    volumes:
      - ./audio-cache:/app/audio-cache
```

3. 启动：
```bash
docker-compose up -d
```

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `STATIC_PORT` | `8080` | 主服务端口 |
| `API_PORT` | `3001` | 网易云 API 内部端口 |
| `CACHE_PORT` | `3002` | 音频缓存服务内部端口 |

---

## 注意事项

- 音频缓存会占用服务器磁盘空间，请定期清理或配置足够的磁盘
- 网易云音乐 API 有请求频率限制，请勿恶意刷接口
- 如需 HTTPS，请配置 Nginx 或使用云服务商的 CDN/SSL 证书服务
