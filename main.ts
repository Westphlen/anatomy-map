/**
 * Anatomy Map Plugin - Main Entry
 * 注册左侧侧边栏的解剖定位视图，提供分区编辑器设置
 */

import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { AnatomyMapView, VIEW_TYPE_ANATOMY_MAP, getAnnotationSVG } from './src/view';
import { BODY_REGIONS, buildAliasMap, findRegion, flattenAllRegions } from './src/anatomy-data';
import {
  AnatomyMapSettings,
  DEFAULT_SETTINGS,
  AnatomyMapSettingTab,
  setSettings,
  setSaveCallback,
} from './src/settings';

export default class AnatomyMapPlugin extends Plugin {
  settings: AnatomyMapSettings;

  async onload() {
    // 加载设置
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // 迁移旧版 pointAnnotations：notePath(string) → notePaths(string[])
    if (Array.isArray(this.settings.pointAnnotations)) {
      for (const pa of this.settings.pointAnnotations) {
        if ((pa as any).notePath !== undefined && !pa.notePaths) {
          pa.notePaths = (pa as any).notePath ? [(pa as any).notePath] : [];
          delete (pa as any).notePath;
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
      this.activateView();
    });

    // 注册命令
    this.addCommand({
      id: 'open-anatomy-map',
      name: '打开人体解剖定位图',
      callback: () => this.activateView(),
    });

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
    const anatomyField = fm?.['anatomy'];
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
        const custom = settings.regionPolygons.find((p) => p.regionId === r.id);
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
      const poly = settings.regionPolygons.find((p) => p.regionId === regionId);
      const label = poly?.regionLabel || settings.renamedRegions[regionId] || region?.label || regionId;

      const container = el.createDiv({ cls: 'anatomy-codeblock-map' });
      const header = container.createDiv({ cls: 'anatomy-codeblock-header' });
      header.createEl('span', { text: label, cls: 'anatomy-codeblock-title' });

      const svgWrapper = container.createDiv({ cls: 'anatomy-codeblock-svg' });
      const annSvg = getAnnotationSVG(regionId);
      svgWrapper.innerHTML = annSvg.svg;

      // 渲染该分区的所有标点（与侧边栏选点标注栏一致），高亮当前笔记关联的
      const annotations = settings.pointAnnotations.filter((a) => a.regionId === regionId);
      const svgEl = svgWrapper.querySelector('svg');
      if (svgEl && annotations.length > 0) {
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];
        annotations.forEach((ann, i) => {
          const color = colors[i % colors.length];
          const [dx, dy] = annSvg.fromBody(ann.x, ann.y);
          const isCurrentNote = (ann.notePaths || []).includes(notePath);

          // 外圈光晕（当前笔记关联的标点用脉冲动画，其他标点静态半透明）
          const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          glow.setAttribute('cx', String(dx));
          glow.setAttribute('cy', String(dy));
          glow.setAttribute('r', isCurrentNote ? '12' : '8');
          glow.setAttribute('fill', color);
          glow.setAttribute('fill-opacity', isCurrentNote ? '0.3' : '0.15');
          if (isCurrentNote) glow.classList.add('anatomy-codeblock-glow');
          svgEl.appendChild(glow);

          // 主圆点
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', String(dx));
          circle.setAttribute('cy', String(dy));
          circle.setAttribute('r', isCurrentNote ? '6' : '4');
          circle.setAttribute('fill', color);
          circle.setAttribute('stroke', '#fff');
          circle.setAttribute('stroke-width', '1.5');
          if (isCurrentNote) {
            circle.setAttribute('stroke-width', '2.5');
            circle.classList.add('anatomy-codeblock-point-active');
          }
          svgEl.appendChild(circle);

          // 标注标签（仅当前笔记关联的标点显示标签）
          if (isCurrentNote) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', String(dx + 10));
            text.setAttribute('y', String(dy + 5));
            text.setAttribute('fill', color);
            text.setAttribute('font-size', '14');
            text.setAttribute('font-weight', '600');
            text.textContent = ann.label || `点${i + 1}`;
            svgEl.appendChild(text);
          }
        });
      }

      // 点击跳转到侧边栏完整视图
      container.classList.add('anatomy-codeblock-clickable');
      container.addEventListener('click', () => {
        this.activateView();
        setTimeout(() => {
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

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_ANATOMY_MAP);
  }

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
    if (leaf) workspace.revealLeaf(leaf);
  }
}
