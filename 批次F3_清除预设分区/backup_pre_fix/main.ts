/**
 * Anatomy Map Plugin - Main Entry
 * 注册左侧侧边栏的解剖定位视图，提供分区编辑器设置
 */

import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
// 加固 #P1【S1】：修正模块路径（文件实际位于仓库根目录，非 ./src/）；加固 #P4【S3】：移除未使用的 buildAliasMap 导入
import { AnatomyMapView, VIEW_TYPE_ANATOMY_MAP, getAnnotationSVG } from './view';
import { BODY_REGIONS, findRegion, flattenAllRegions } from './anatomy-data';
// 加固 #P2【S1】：显式导入 RegionPolygon / PointAnnotation，为回调参数补全类型注解
import {
  AnatomyMapSettings,
  DEFAULT_SETTINGS,
  AnatomyMapSettingTab,
  setSettings,
  setSaveCallback,
  RegionPolygon,
  PointAnnotation,
} from './settings';
// 加固 #Q2-P1【S1】：引入 DOM 安全写入工具，替代 innerHTML 直接赋值
import { renderSvgInto } from './dom-safe';

export default class AnatomyMapPlugin extends Plugin {
  settings: AnatomyMapSettings;

  async onload() {
    // 加载设置
    // 加固 #Q3-P1【S2】：loadData(): Promise<any> 显式断言为 Partial<AnatomyMapSettings>，
    // 阻断 any 向 this.settings 的污染
    const loaded = (await this.loadData()) as Partial<AnatomyMapSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    // 迁移旧版 pointAnnotations：notePath(string) → notePaths(string[])
    // 加固 #Q3-P1【S2】：以 LegacyPointAnnotation 精确描述旧字段，消除 (pa as any) ×4
    if (Array.isArray(this.settings.pointAnnotations)) {
      for (const pa of this.settings.pointAnnotations) {
        const legacy = pa as PointAnnotation & { notePath?: string };
        if (legacy.notePath !== undefined && !legacy.notePaths) {
          legacy.notePaths = legacy.notePath ? [legacy.notePath] : [];
          delete legacy.notePath;
        }
      }
    }
    setSettings(this.settings);
    setSaveCallback(async () => { await this.saveSettings(); });

    // 注册设置面板
    this.addSettingTab(new AnatomyMapSettingTab(this.app, this));

    // 注册视图
    this.registerView(
      VIEW_TYPE_ANATOMY_MAP,
      (leaf) => new AnatomyMapView(leaf),
    );

    // 添加左侧边栏图标
    this.addRibbonIcon('heart', '人体解剖定位图', () => {
      // 加固 #Q3-P2【S2】：显式 void 标记 UI 事件回调中不等待的 Promise
      void this.activateView();
    });

    // 注册命令
    // 加固 #Q3-P6【S2】：review 要求命令 ID 不含插件 ID（Obsidian 自动加前缀防冲突）。
    // 采用方案 B 双注册：新增合规 id 'open'，同时保留旧 id 以兼容用户已绑定的热键，
    // 旧命令名称标注"（兼容）"，后续版本移除；两者指向同一 callback。
    const openCommand = {
      name: '打开人体解剖定位图',
      callback: () => { void this.activateView(); },
    };
    this.addCommand({ id: 'open', ...openCommand });
    this.addCommand({ id: 'open-anatomy-map', name: `${openCommand.name}（兼容旧热键）`, callback: openCommand.callback });

    // 注册 codeblock 处理器：在笔记中嵌入解剖分区小地图
    this.registerMarkdownCodeBlockProcessor('anatomy-map', (source, el, ctx) => {
      this.renderCodeblockMap(el, ctx.sourcePath);
    });
  }

  /** 渲染 codeblock 小地图：通过 frontmatter 和 pointAnnotations 两条路径收集关联分区 */
  private renderCodeblockMap(el: HTMLElement, notePath: string) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;

    const settings = this.settings;
    const hidden = new Set([...settings.hiddenRegionIds, ...settings.recycledRegionIds]);

    // ===== 1. 通过 pointAnnotations 收集关联分区（标点关联，不依赖 frontmatter）=====
    const matchedRegionIds: string[] = [];
    for (const ann of settings.pointAnnotations) {
      if ((ann.notePaths || []).includes(notePath) && !hidden.has(ann.regionId)) {
        if (!matchedRegionIds.includes(ann.regionId)) matchedRegionIds.push(ann.regionId);
      }
    }

    // ===== 2. 通过 frontmatter anatomy 字段补充收集关联分区 =====
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    // 加固 #Q3-P1【S2】：frontmatter 索引签名为 any，先收为 unknown 再窄化
    const anatomyField: unknown = fm?.['anatomy'];
    if (anatomyField) {
      const aliases: string[] = Array.isArray(anatomyField)
        ? anatomyField.map(String)
        : [String(anatomyField)];

      // 构建 label/alias → regionId 的完整映射（含自定义多边形、重命名）
      const labelToRegionId = new Map<string, string>();
      for (const r of flattenAllRegions(BODY_REGIONS)) {
        if (hidden.has(r.id)) continue;
        let label = r.label;
        if (settings.renamedRegions[r.id]) label = settings.renamedRegions[r.id];
        const custom = settings.regionPolygons.find((p: RegionPolygon) => p.regionId === r.id);
        if (custom) {
          label = custom.regionLabel || label;
          const allAliases = [...r.aliases];
          if (custom.aliases) for (const a of custom.aliases) if (!allAliases.includes(a)) allAliases.push(a);
          for (const a of allAliases) labelToRegionId.set(a, r.id);
        } else {
          for (const a of r.aliases) labelToRegionId.set(a, r.id);
        }
        labelToRegionId.set(label, r.id);
      }
      for (const poly of settings.regionPolygons) {
        if (hidden.has(poly.regionId)) continue;
        if (labelToRegionId.has(poly.regionId)) continue;
        labelToRegionId.set(poly.regionLabel, poly.regionId);
        if (poly.aliases) for (const a of poly.aliases) labelToRegionId.set(a, poly.regionId);
        labelToRegionId.set(poly.regionId, poly.regionId);
      }

      for (const alias of aliases) {
        const rid = labelToRegionId.get(String(alias).trim());
        if (rid && !matchedRegionIds.includes(rid)) matchedRegionIds.push(rid);
      }
    }

    if (matchedRegionIds.length === 0) {
      el.createEl('p', { text: '该笔记未关联任何解剖分区或标点', cls: 'anatomy-codeblock-empty' });
      return;
    }

    // 为每个匹配的分区渲染小地图（含所有标点，高亮当前笔记关联的）
    for (const regionId of matchedRegionIds) {
      const region = findRegion(regionId);
      const poly = settings.regionPolygons.find((p: RegionPolygon) => p.regionId === regionId);
      const label = poly?.regionLabel || settings.renamedRegions[regionId] || region?.label || regionId;

      const container = el.createDiv({ cls: 'anatomy-codeblock-map' });
      const header = container.createDiv({ cls: 'anatomy-codeblock-header' });
      header.createEl('span', { text: label, cls: 'anatomy-codeblock-title' });

      const svgWrapper = container.createDiv({ cls: 'anatomy-codeblock-svg' });
      const annSvg = getAnnotationSVG(regionId);
      // 加固 #Q2-P1【S1】：innerHTML → DOMParser 安全渲染（dom-safe.ts）
      renderSvgInto(svgWrapper, annSvg.svg);

      // 渲染该分区的所有标点（与侧边栏选点标注栏一致），高亮当前笔记关联的
      const annotations = settings.pointAnnotations.filter((a: PointAnnotation) => a.regionId === regionId);
      // 加固 #Q3-P4【S2】：querySelector 显式泛型 + createSvg 替代 document.createElementNS
      const svgRoot = svgWrapper.querySelector<SVGSVGElement>('svg');
      if (svgRoot && annotations.length > 0) {
        // v1.2.2：选点尺寸改为 viewBox 短边动态计算（与主界面缩略图对齐）
        const vb = svgRoot.viewBox.baseVal;
        const vbShort = Math.min(vb.width || 500, vb.height || 500);
        const baseR = Math.min(5, Math.max(1, vbShort * 0.005));
        const fontSize = Math.min(7, Math.max(4, baseR * 1.5));
        const textOffset = baseR * 1.2;

        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];
        annotations.forEach((ann: PointAnnotation, i: number) => {
          const color = colors[i % colors.length];
          const [dx, dy] = annSvg.fromBody(ann.x, ann.y);
          const isCurrentNote = (ann.notePaths || []).includes(notePath);

          // 当前笔记关联的标点尺寸倍率（1.0），其他标点略小（0.67）
          const scale = isCurrentNote ? 1 : 0.67;
          const glowR = baseR * 1.6 * scale;
          const dotR = baseR * scale;
          const strokeW = Math.max(0.6, baseR * 0.3 * scale);

          // 外圈光晕（当前笔记关联的标点用脉冲动画，其他标点静态半透明）
          // createSvg 创建即追加到父节点，故先建光晕再建圆点以保持"光晕在下"的层叠顺序
          svgRoot.createSvg('circle', {
            attr: {
              cx: String(dx),
              cy: String(dy),
              r: String(glowR),
              fill: color,
              'fill-opacity': isCurrentNote ? '0.3' : '0.15',
            },
            cls: isCurrentNote ? 'anatomy-codeblock-glow' : undefined,
          });

          // 主圆点
          svgRoot.createSvg('circle', {
            attr: {
              cx: String(dx),
              cy: String(dy),
              r: String(dotR),
              fill: color,
              stroke: '#fff',
              'stroke-width': String(strokeW),
            },
            cls: isCurrentNote ? 'anatomy-codeblock-point-active' : undefined,
          });

          // 标注标签（仅当前笔记关联的标点显示标签）
          if (isCurrentNote) {
            const text = svgRoot.createSvg('text', {
              attr: {
                x: String(dx + textOffset),
                y: String(dy + textOffset * 0.5),
                fill: color,
                'font-size': String(fontSize),
                'font-weight': '600',
              },
            });
            text.textContent = ann.label || `点${i + 1}`;
          }
        });
      }

      // 点击跳转到侧边栏完整视图
      container.classList.add('anatomy-codeblock-clickable');
      container.addEventListener('click', () => {
        // 加固 #Q3-P2【S2】：void 标记不等待的 Promise；加固 #Q3-P5【S2】：window.setTimeout 兼容 popout window
        void this.activateView();
        window.setTimeout(() => {
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ANATOMY_MAP);
          if (leaves.length > 0) {
            const view = leaves[0].view;
            if (view instanceof AnatomyMapView) {
              view.navigateToRegion(regionId);
            }
          }
        }, 150);
      });
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    setSettings(this.settings);
    // 刷新已打开的视图
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ANATOMY_MAP).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof AnatomyMapView) {
        view.refreshView();
      }
    });
  }

  // 加固 #Q2-P2【S1】：删除 onunload 中的 detachLeavesOfType——Obsidian 卸载插件时
  // 自动关闭其视图并恢复用户自定义工作区布局，手动 detach 会强制重置用户布局
  // （review Error "Don't detach leaves in onunload"）；无其余清理职责，整个方法移除。

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_ANATOMY_MAP);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeftLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_ANATOMY_MAP, active: true });
    }
    // 加固 #Q2-P3【S1】：revealLeaf @since 1.7.2 高于 manifest minAppVersion 1.1.0，
    // 改用 setActiveLeaf（@since 0.16.3 ≤ 1.1.0 兼容）
    if (leaf) workspace.setActiveLeaf(leaf, { focus: true });
  }
}
