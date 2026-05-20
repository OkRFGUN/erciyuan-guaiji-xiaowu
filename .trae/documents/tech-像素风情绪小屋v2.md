# 像素风情绪小屋 v2 实验版 - 技术架构文档

## 技术栈

- **渲染**：Canvas 2D API（主场景全Canvas渲染）
- **UI框架**：原生HTML/CSS/JS（无框架依赖）
- **音乐**：APlayer 1.10.1 + 本地 NeteaseCloudMusicApi
- **存储**：localStorage（游戏存档、设置、缓存）
- **像素资源**：程序化Canvas生成 + 在线像素画API

## 架构设计

### 渲染架构

```
GameLoop (requestAnimationFrame)
  ├── SceneRenderer
  │   ├── BackgroundRenderer（天空、墙壁、地板）
  │   ├── WindowRenderer（窗户场景、天气效果）
  │   ├── FurnitureRenderer（家具、装饰品）
  │   ├── CatRenderer（猫咪精灵动画）
  │   ├── ParticleRenderer（粒子特效）
  │   └── LightingRenderer（光影、氛围）
  ├── GameState.update()
  │   ├── CatAI.update()
  │   ├── IdleSystem.update()
  │   └── EventSystem.update()
  └── UIRenderer.update()
```

### 数据模型

```javascript
GameState {
  mood: 'happy' | 'sad' | 'calm' | 'night' | 'lonely',
  moodIntensity: 0-2,  // 情绪阶段
  starlight: Number,    // 星光货币
  cat: {
    x, y,               // 位置
    frame, frameTimer,   // 动画帧
    state: 'idle'|'walk'|'sleep'|'play'|'eat'|'groom',
    affection: 0-100,    // 好感度
    hunger: 0-100,       // 饥饿度
    energy: 0-100,       // 精力
    isHome: Boolean,     // 是否在家
    adventureTimer: Number,
    gifts: []
  },
  furniture: {
    desk: { level: 1-4, state: {} },
    recordPlayer: { level: 1-3, state: {} },
    plant: { level: 1-4, waterLevel: 0-100, growthTimer: 0 },
    catBed: { level: 1-3 },
    figureShelf: { collection: [], rotating: false },
    // ...
  },
  achievements: { [id]: { unlocked: Boolean, progress: Number } },
  idleEvents: [],
  stats: {
    totalPlayTime: Number,
    totalInteractions: Number,
    totalSongsPlayed: Number,
    catPets: Number,
    catFeeds: Number
  }
}
```

### Canvas渲染策略

- **主Canvas**：全场景渲染，60fps
- **精灵图集**：所有像素资源预渲染到离屏Canvas，运行时drawImage
- **分层渲染**：
  1. 背景层（墙壁、地板、窗户天空）
  2. 家具层（后排放置的家具）
  3. 猫咪层
  4. 前景层（前排家具、粒子）
  5. 光影层（叠加混合模式）

### 像素资源生成

使用程序化Canvas生成所有精灵：

```javascript
SpriteFactory {
  // 基础绘制
  drawPixel(ctx, x, y, color)
  drawRect(ctx, x, y, w, h, color)
  drawOutline(ctx, x, y, w, h, color)
  
  // 预渲染精灵
  generateCatFrames() → 8帧 × 4方向
  generateFurniture(type, level) → 每个家具4级
  generateWindowScene(weather, time) → 动态场景
  generateParticles(type) → 粒子模板
  
  // 外部资源
  loadPixelArt(url) → 从像素画API加载
}
```

### 挂机系统

```
IdleSystem {
  tickInterval: 60000,      // 每分钟tick
  starlightPerTick: 1,      // 基础收入
  catEventInterval: 600000, // 10分钟猫咪事件
  visitorInterval: 1800000, // 30分钟访客
  
  events: [
    { type: 'cat_adventure', trigger: 'time', reward: 'random' },
    { type: 'visitor', trigger: 'time', reward: 'starlight' },
    { type: 'weather', trigger: 'random', effect: 'visual' },
    { type: 'cat_dream', trigger: 'idle>30min', effect: 'dream_scene' }
  ]
}
```

### 存档系统

```javascript
SaveSystem {
  key: 'pixel-room-v2-save',
  autoSaveInterval: 30000,
  
  save(state) {
    localStorage.setItem(key, JSON.stringify({
      version: 2,
      timestamp: Date.now(),
      state: state
    }));
  },
  
  load() → GameState | null,
  
  calculateOfflineEarnings(lastTimestamp) {
    // 计算离线期间的星光收入和猫咪事件
  }
}
```

## 文件结构

```
index.html          ← 实验版主文件（单文件）
APlayer.min.js      ← 音乐播放器
APlayer.min.css     ← 播放器样式
Meting.min.js       ← Meting备用
netease-api/        ← 本地网易云API
```

## 性能目标

- 主场景渲染：稳定60fps
- 内存占用：< 100MB
- 首次加载：< 3秒
- 精灵图集缓存后：< 1秒

## 兼容性

- Chrome 90+
- Edge 90+
- Firefox 90+
- Safari 15+
