# Anatomy Map · 人体解剖定位图

> Interactive 2D human body map for Obsidian. Click anatomical regions in the sidebar to find notes linked via the `anatomy` frontmatter field.
>
> Obsidian 侧边栏交互式 2D 人体定位图。点击解剖分区即可检索通过 frontmatter `anatomy` 字段关联的笔记。

---

## Table of Contents · 目录

- [Introduction · 简介](#introduction--简介)
- [Features · 功能特性](#features--功能特性)
- [Installation · 安装](#installation--安装)
- [Quick Start · 快速上手](#quick-start--快速上手)
- [Linking Notes · 笔记关联](#linking-notes--笔记关联)
- [Point Annotations · 选点标注](#point-annotations--选点标注)
- [Inline Mini Map · 内联小地图](#inline-mini-map--内联小地图)
- [Settings · 设置](#settings--设置)
- [Backup & Restore · 备份与恢复](#backup--restore--备份与恢复)
- [Data Storage · 数据存储](#data-storage--数据存储)
- [License · 许可证](#license--许可证)

---

## Introduction · 简介

**Anatomy Map** renders a stylized 2D human body silhouette in an Obsidian sidebar view. Every anatomical region (head, thorax, abdomen, pelvis, limbs, spine, …) is a clickable hotzone. Click a region to drill down, browse sub-regions, and list all notes related to it — perfect for medical students building a personal anatomy knowledge base.

**Anatomy Map** 在 Obsidian 侧边栏中渲染一幅风格化的人体二维轮廓图。每个解剖分区（头部、胸部、腹部、盆部、四肢、脊柱等）都是可点击的热区。点击分区即可下钻查看子分区，并列出与之关联的全部笔记——非常适合医学生构建个人解剖学知识库。

---

## Features · 功能特性

| Feature | Description |
| --- | --- |
| Full-body map · 全身定位图 | Clickable body silhouette with all major anatomical regions. |
| Region drill-down · 分区下钻 | Click any region to enter its detail view, with breadcrumb navigation. |
| Note association · 笔记关联 | Notes are auto-linked via the `anatomy` frontmatter field, with alias matching. |
| Note management · 笔记管理 | Add / remove associations, drag-and-drop sorting, two-column layout. |
| Point annotations · 选点标注 | Place numbered color-coded points on a region image, each linked to notes. |
| Region editor · 分区编辑器 | Visually draw polygon hotzones on the body map; create custom regions. |
| Region thumbnails · 分区示意图 | Auto-generated crops from the body map, or upload custom images. |
| Hidden / recycle · 隐藏与回收 | Hide regions from the map, or move them to a recycle bin. |
| Inline mini map · 内联小地图 | `anatomy-map` code block renders every region linked to the current note. |
| Backup & restore · 备份与恢复 | Export all plugin data to JSON files and restore from them. |

---

## Installation · 安装

This is a community-style plugin installed in the vault's plugin folder.

这是一个安装在 Vault 插件目录下的社区风格插件。

1. Open your vault's `.obsidian/plugins` folder (enable "Show hidden files" if needed).
   打开 Vault 的 `.obsidian/plugins` 文件夹（如需请开启"显示隐藏文件"）。
2. Copy the `anatomy-map` folder (containing `main.js`, `styles.css`, `manifest.json`) into it.
   将 `anatomy-map` 文件夹（包含 `main.js`、`styles.css`、`manifest.json`）复制进去。
3. In Obsidian, go to **Settings → Community plugins**, enable **Anatomy Map**, then restart Obsidian.
   在 Obsidian 中进入 **设置 → 第三方插件**，启用 **Anatomy Map**，然后重启 Obsidian。

> **Requirements · 环境要求**: Obsidian v1.0.0 or above. Works on both desktop and mobile.
>
> **环境要求**：Obsidian v1.0.0 及以上版本。桌面端与移动端均可使用。

---

## Quick Start · 快速上手

Open the anatomy map in any of three ways:

可通过以下任一方式打开人体定位图：

1. **Ribbon icon · 侧边栏图标**: Click the heart icon in the left ribbon.
   点击左侧功能区的"心形"图标。
2. **Command palette · 命令面板**: Run the command **Anatomy Map · 打开人体解剖定位图**.
   运行命令 **打开人体解剖定位图**。
3. **Inline code block · 内联代码块**: Add an `anatomy-map` code block to any note (see below).
   在任意笔记中添加 `anatomy-map` 代码块（见下文）。

In the full-body view, regions are highlighted on hover. Click a region to open its detail view, which shows:

在全身图中，分区在悬停时高亮。点击分区进入详情视图，其中包含：

- Region thumbnail / schematic · 分区示意图
- Sub-region grid (with note counts) · 子分区网格（含笔记数角标）
- Related notes list · 关联笔记列表
- Point annotations (if any) · 选点标注（如有）

Use the breadcrumb bar or the **返回全身图** button to navigate back. Regions without a drawn boundary on the full-body map are listed under **独立分区** (Independent Regions).

使用面包屑栏或 **返回全身图** 按钮返回上级。未在全身图中划定界域的分区会列在 **独立分区** 中。

---

## Linking Notes · 笔记关联

### Frontmatter field · Frontmatter 字段

Add the `anatomy` field to a note's frontmatter. The value can be a string or a list of strings:

在笔记的 frontmatter 中添加 `anatomy` 字段，值为字符串或字符串数组：

```yaml
---
anatomy: 心
---
```

```yaml
---
anatomy: [心, 肺, 冠状动脉]
---
```

### Alias matching · 别名匹配

Every region ships with a set of aliases. For example, the **Heart · 心** region matches `心`, `心脏`, `心房`, `心室`, `瓣膜`, `冠状动脉`, `心包`, etc. Any alias used in the `anatomy` field links the note to that region. Custom aliases can be added in the region editor.

每个分区内置一组别名。例如 **心** 分区可匹配 `心`、`心脏`、`心房`、`心室`、`瓣膜`、`冠状动脉`、`心包` 等。`anatomy` 字段中的任意别名都会将笔记关联到对应分区，并可在分区编辑器中补充自定义别名。

### Manage associations in the view · 在视图中管理关联

Inside a region's detail view, the note list header provides three tools:

在分区详情视图的笔记列表标题栏中提供三个工具：

| Button | Function |
| --- | --- |
| 添加 / Add | Enter add mode, search the vault and attach notes to this region (writes back to frontmatter). 进入添加模式，搜索并关联笔记（写回 frontmatter）。 |
| 删除 / Remove | Enter remove mode and detach notes from this region. 进入删除模式，取消关联笔记。 |
| 排序 / Sort | Drag and drop to reorder notes; the order is persisted. 拖拽排序，顺序会被持久化保存。 |

---

## Point Annotations · 选点标注

Point annotations are **independent** of the frontmatter `anatomy` field. They let you place precise markers on a region's image.

选点标注 **独立于** frontmatter `anatomy` 字段，可在分区示意图上放置精确的标记点。

- Add numbered, color-coded points directly on the region schematic · 在分区示意图上直接添加带编号的彩色标注点。
- Each point can be linked to one or more notes · 每个标注点可关联一篇或多篇笔记。
- Edit legend labels and note bindings in the annotation editor modal · 在标注编辑器中编辑图例名称与笔记绑定。
- Reorder points by drag-and-drop · 支持拖拽排序。
- Annotations are also honored by the inline mini map · 标注同样会被内联小地图识别。

---

## Inline Mini Map · 内联小地图

Insert an `anatomy-map` code block anywhere in a note to render a mini map of every region associated with that note:

在任意笔记中插入 `anatomy-map` 代码块，即可渲染与该笔记关联的所有分区的小地图：

````markdown
```anatomy-map
```
````

The mini map shows:

小地图会展示：

- All regions matched via the `anatomy` frontmatter field · 通过 `anatomy` frontmatter 字段匹配的所有分区。
- All regions linked by point annotations · 通过选点标注关联的所有分区。
- Glowing point markers (the current note's points pulse) · 高亮的标注点（当前笔记的标注点会闪烁）。
- Click a mini map card to jump to that region in the sidebar view · 点击小地图卡片可跳转到侧边栏视图中对应分区。

---

## Settings · 设置

Open **Settings → Anatomy Map** to manage the plugin. All changes are saved to `data.json`.

打开 **设置 → Anatomy Map** 即可管理插件。所有更改都会保存到 `data.json`。

### Region editor · 分区编辑器

- Draw clickable polygon hotzones on the human body map by clicking to add vertices · 通过点击添加顶点，在人体图上绘制可点击的多边形热区。
- Create custom regions with a unique English ID, display name, aliases and an optional parent region · 创建自定义分区，包含唯一英文 ID、显示名称、关联别名及可选父分区。
- Edit a region's polygon, name, aliases and parent; ID changes are auto-migrated across all references · 编辑分区的多边形、名称、别名和父分区；ID 变更会自动迁移所有相关引用。
- **Hidden regions · 隐藏分区**: temporarily hide a region from the map · 将分区从图中临时隐藏。
- **Recycle bin · 回收站**: soft-delete a region; it can be restored later · 软删除分区，后续可恢复。

### Region thumbnails · 分区示意图

- **Auto · 自动**: thumbnails are cropped automatically from the body map based on the polygon bounds · 根据多边形边界自动从人体图裁剪生成。
- **Upload · 上传**: provide a custom image for the region · 为分区上传自定义图片。
- Thumbnails appear in the region detail view and in the settings list · 示意图显示在分区详情视图及设置列表中。

### Point annotations management · 选点标注管理

- Review and edit all point annotations across regions · 查看并编辑所有分区的选点标注。

### Backup & restore · 备份与恢复

See the next section. · 见下一节。

---

## Backup & Restore · 备份与恢复

All configuration and association data can be exported to a standalone JSON file.

所有配置与关联数据均可导出为独立的 JSON 文件。

- **Create backup · 创建备份**: choose a backup name and a vault folder; a `*.json` file is written there · 自定义备份名称与存储位置，在 Vault 内生成 `*.json` 文件。
- **Restore backup · 恢复备份**: pick a JSON backup file to restore from (current data is overwritten) · 选择 JSON 备份文件进行恢复（当前数据将被覆盖）。

---

## Data Storage · 数据存储

The plugin persists everything in `data.json` under the plugin folder, including:

插件将所有数据持久化在插件目录下的 `data.json` 中，包括：

| Key | Meaning |
| --- | --- |
| `regionPolygons` | Custom / drawn polygon hotzones with points and aliases · 自定义/绘制的多边形热区及其顶点与别名 |
| `hiddenRegionIds` | Regions hidden from the map · 从图中隐藏的分区 |
| `recycledRegionIds` | Regions in the recycle bin · 回收站中的分区 |
| `renamedRegions` | Region display name overrides · 分区显示名覆盖 |
| `regionThumbnails` | Auto / uploaded region images · 自动生成或上传的分区示意图 |
| `pointAnnotations` | Point annotation data · 选点标注数据 |
| `noteCustomOrder` | Custom note ordering per region · 各分区笔记的自定义排序 |

> The `anatomy` field itself lives in your notes' frontmatter, so it survives plugin re-installation. · `anatomy` 字段本身存在于笔记的 frontmatter 中，卸载重装插件也不会丢失。

---

## License · 许可证

**MIT License**

Copyright (c) 2026 漫云湖

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

**MIT 许可证**

版权所有 (c) 2026 漫云湖

特此免费授予任何获得本软件及相关文档文件（"软件"）副本的人，不受限制地
处理本软件，包括但不限于使用、复制、修改、合并、发布、分发、再许可和/或
出售本软件的副本，并允许向其提供本软件的人这样做，但须满足以下条件：

上述版权声明和本许可声明应包含在本软件的所有副本或实质性部分中。

本软件按"原样"提供，不作任何明示或暗示的保证，包括但不限于适销性、特定
用途适用性和非侵权性的保证。在任何情况下，作者或版权持有人均不对因本软件
或本软件的使用或其他交易而产生或与之相关的任何索赔、损害或其他责任负责，
无论是合同、侵权或其他行为。
