# 小游戏

用 Godot 4.5.1 做的网页小游戏，共用同一份引擎，每个游戏只加载自己的 `.pck`。

## 目录结构

```
index.html                 游戏列表
sw.js                      Service Worker：把分片的引擎 wasm 拼回一条流
engine/4.5.1/              共享引擎（Godot 4.5.1, GL Compatibility, no-threads）
  index.js
  index.wasm.0 … .6        wasm 被切成 7 片（GitHub 单文件上传限制）
  index.png
games/fox-quest/
  index.html               加载器：指定 executable 与 mainPack
  game.pck                 狐狸闯关的全部游戏内容
```

## 加一个新游戏

1. 在 Godot 里用 **同一个版本（4.5.1）+ GL Compatibility + 关闭线程** 导出 Web，只取 `index.pck`；
2. 上传为 `games/<slug>/game.pck`，复制 `games/fox-quest/index.html` 改两处路径和 `fileSizes`；
3. 在根 `index.html` 加一张卡片。

引擎不用再传，用户也已经缓存过。
