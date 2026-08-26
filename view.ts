/**
 * Anatomy Map View - 左侧侧边栏视图
 * 渲染SVG人体图，支持区域点击下钻，关联笔记列表
 */

import { ItemView, WorkspaceLeaf, TFile, Menu } from 'obsidian';
import { BODY_REGIONS, AnatomyRegion, buildAliasMap, findRegion, flattenAllRegions } from './anatomy-data';
import { getBodySVG, getRegionSVG } from './svg-templates';
import { getSettings, setSettings, AnatomyMapSettings, PointAnnotation, PointAnnotationEditorModal, saveSettingsData, AnatomyMapSettingTab } from './settings';

export const VIEW_TYPE_ANATOMY_MAP = 'anatomy-map-view';

/** 返回标注用的 SVG 及坐标映射函数 */
export interface AnnotationSVGResult {
  svg: string;
  /** 将 SVG 显示坐标转为人体坐标（存储时调用） */
  toBody: (x: number, y: number) => [number, number];
  /** 将人体坐标转为 SVG 显示坐标（渲染时调用） */
  fromBody: (x: number, y: number) => [number, number];
}

/** 父分区 points → body 坐标 bbox（无 padding，用于坐标空间换算） */
function parentBodyBBox(points: { x: number; y: number }[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return { x: minX, y: minY, w, h };
}

/** 获取用于标注的 SVG，支持自动缩略图/上传缩略图的坐标映射
 *  核心规则：子分区若有父分区且父分区有缩略图（上传/自动），则底图采用父分区缩略图而非人体总图裁剪。
 *  优先级：上传缩略图 > 父缩略图渲染子分区 > 自动框选缩略图（人体总图）> 预设SVG > 人体总图
 */
export function getAnnotationSVG(regionId: string): AnnotationSVGResult {
  const settings = getSettings();
  const thumb = settings.regionThumbnails[regionId];
  const polygon = settings.regionPolygons.find((p) => p.regionId === regionId);

  // 收集直接子分区的可点击多边形（parentRegionId === regionId）
  const hidden = new Set([...settings.hiddenRegionIds, ...settings.recycledRegionIds]);
  const childPolys = settings.regionPolygons.filter(
    (p) => p.parentRegionId === regionId && p.points.length >= 3 && !hidden.has(p.regionId),
  );
  const childPolyHTML = (convert?: (x: number, y: number) => [number, number]) =>
    childPolys
      .map((p) => {
        const pts = p.points
          .map((pt) => {
            const [cx, cy] = convert ? convert(pt.x, pt.y) : [pt.x, pt.y];
            return `${cx},${cy}`;
          })
          .join(' ');
        return `<g class="region" data-region="${p.regionId}"><polygon points="${pts}" fill="transparent" stroke="none" pointer-events="all"/></g>`;
      })
      .join('\n');

  /** 当前区域自身多边形的界域框选线（蓝色虚线、不可交互），用于在子分区图中明确其界域 */
  const ownOutlineHTML = (convert?: (x: number, y: number) => [number, number]): string => {
    if (!polygon || polygon.points.length < 3) return '';
    const pts = polygon.points
      .map((pt) => {
        const [cx, cy] = convert ? convert(pt.x, pt.y) : [pt.x, pt.y];
        return `${cx},${cy}`;
      })
      .join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#3498db" stroke-width="2.5" stroke-dasharray="4,2" stroke-opacity="0.85" stroke-linejoin="round" pointer-events="none"/>`;
  };

  // ===== 上传缩略图（最高优先级）：以图片为底图，坐标沿用 500x500 SVG 坐标 =====
  // 用户上传缩略图时不再标注界域框选线（图片本身已明确界域）
  if (thumb && thumb.source === 'upload') {
    const cp = childPolyHTML((x, y) => [x, y]);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" preserveAspectRatio="xMidYMid meet">
      <image href="${thumb.dataUrl}" x="0" y="0" width="500" height="500" preserveAspectRatio="xMidYMid meet"/>
      ${cp}
    </svg>`;
    return { svg, toBody: (x, y) => [x, y], fromBody: (x, y) => [x, y] };
  }

  // ===== 子分区：基于父分区缩略图渲染底图（上传 > 自动）=====
  if (polygon && polygon.parentRegionId) {
    const parentPoly = settings.regionPolygons.find((p) => p.regionId === polygon!.parentRegionId);
    const parentThumb = settings.regionThumbnails[polygon!.parentRegionId];

    // 子分区可点击多边形 HTML（若点数不足则不注入）
    const subLocalPts = polygon!.points;
    let cp: string;
    if (subLocalPts.length >= 3) {
      cp = childPolyHTML((bx: number, by: number): [number, number] => [bx, by]);
    } else {
      cp = '';
    }

    // ---- 分支A：父分区是上传缩略图（子分区 points 已在 0-500 空间，无需坐标换算）----
    if (parentThumb && parentThumb.source === 'upload') {
      const bb = subLocalPts.length >= 3
        ? AnatomyMapSettingTab.bbox(subLocalPts)
        : { x: 0, y: 0, w: 500, h: 500 };
      const outline = ownOutlineHTML((x, y) => [x, y]);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}" width="100%" preserveAspectRatio="xMidYMid meet">
        <image href="${parentThumb.dataUrl}" x="0" y="0" width="500" height="500" preserveAspectRatio="xMidYMid meet"/>
        ${outline}
        ${cp}
      </svg>`;
      return {
        svg,
        toBody: (x, y) => [x + bb.x, y + bb.y],
        fromBody: (x, y) => [x - bb.x, y - bb.y],
      };
    }

    // ---- 分支B：父分区是自动缩略图（需 parentPoly.points 做坐标换算）----
    if (parentPoly && parentPoly.points.length >= 3 && parentThumb && parentThumb.source === 'auto') {
      const pbb = parentBodyBBox(parentPoly.points);
      const bodyToParentLocal = (bx: number, by: number): [number, number] => [
        ((bx - pbb.x) / pbb.w) * 500,
        ((by - pbb.y) / pbb.h) * 500,
      ];
      const parentLocalToBody = (lx: number, ly: number): [number, number] => [
        (lx / 500) * pbb.w + pbb.x,
        (ly / 500) * pbb.h + pbb.y,
      ];
      const subLocalPts2 = polygon!.points.map((pt) => ({
        x: bodyToParentLocal(pt.x, pt.y)[0],
        y: bodyToParentLocal(pt.x, pt.y)[1],
      }));
      const bb = subLocalPts2.length >= 3
        ? AnatomyMapSettingTab.bbox(subLocalPts2)
        : { x: 0, y: 0, w: 500, h: 500 };
      const cp2 = subLocalPts2.length >= 3
        ? childPolyHTML((bx, by) => {
            const [lx, ly] = bodyToParentLocal(bx, by);
            return [lx, ly];
          })
        : '';
      const outline = ownOutlineHTML((bx, by) => {
        const [lx, ly] = bodyToParentLocal(bx, by);
        return [lx, ly];
      });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}" width="100%" preserveAspectRatio="xMidYMid meet">
        <image href="${parentThumb.dataUrl}" x="0" y="0" width="500" height="500" preserveAspectRatio="xMidYMid meet"/>
        ${outline}
        ${cp2}
      </svg>`;
      return {
        svg,
        toBody: (x, y) => parentLocalToBody(x, y),
        fromBody: (x, y) => bodyToParentLocal(x, y),
      };
    }
  }

  // ===== 自动框选缩略图：基于多边形 bbox 裁剪人体 SVG（顶级分区 / 无父缩略图）=====
  if (thumb && thumb.source === 'auto' && polygon && polygon.points.length >= 3) {
    const bb = AnatomyMapSettingTab.bbox(polygon.points);
    const cleanSvg = getBodySVG([], [...settings.hiddenRegionIds, ...settings.recycledRegionIds]);
    const croppedSvg = cleanSvg.replace(
      /viewBox="([^"]*)"/,
      `viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}"`,
    );
    const cp = childPolyHTML((x, y) => [x, y]);
    const outline = ownOutlineHTML((x, y) => [x, y]);
    const svg = croppedSvg.replace('</svg>', `${outline}\n${cp}\n</svg>`);
    return {
      svg,
      toBody: (x, y) => [x + bb.x, y + bb.y],
      fromBody: (x, y) => [x - bb.x, y - bb.y],
    };
  }

  // ===== 预设 SVG 详图 =====
  const preset = getRegionSVG(regionId);
  if (preset) {
    const cp = childPolyHTML((x, y) => [x, y]);
    const outline = ownOutlineHTML((x, y) => [x, y]);
    const inject = `${outline}\n${cp}`;
    const svg = inject.trim() ? preset.replace('</svg>', `${inject}\n</svg>`) : preset;
    return { svg, toBody: (x, y) => [x, y], fromBody: (x, y) => [x, y] };
  }

  // ===== 兜底：人体总图 =====
  const fallback = getBodySVG();
  const cp = childPolyHTML((x, y) => [x, y]);
  const outline = ownOutlineHTML((x, y) => [x, y]);
  const inject = `${outline}\n${cp}`;
  const svg = inject.trim() ? fallback.replace('</svg>', `${inject}\n</svg>`) : fallback;
  return { svg, toBody: (x, y) => [x, y], fromBody: (x, y) => [x, y] };
}

export class AnatomyMapView extends ItemView {
  private currentView: 'body' | 'region' = 'body';
  private currentRegionId: string | null = null;
  private aliasMap: Map<string, string>;
  private anatomyIndex: Map<string, TFile[]> = new Map();
  private mapRootEl: HTMLElement;
  /** 排序模式状态 */
  private annotationSortMode = false;
  private noteSortMode = false;
  /** 关联笔记 添加/删除 模式 */
  private noteAddMode = false;
  private noteRemoveMode = false;
  /** 添加关联模式的搜索词（跨重渲染保持） */
  private noteAddSearchQuery = '';
  private draggedAnnId: string | null = null;
  private draggedNotePath: string | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.aliasMap = buildAliasMap(BODY_REGIONS);
    this.mapRootEl = this.containerEl.children[1] as HTMLElement;
  }

  getViewType() { return VIEW_TYPE_ANATOMY_MAP; }
  getDisplayText() { return '人体解剖定位图'; }
  getIcon() { return 'heart'; }

  /** 从笔记 codeblock 跳转到指定分区 */
  public navigateToRegion(regionId: string) {
    this.currentView = 'region';
    this.currentRegionId = regionId;
    this.renderView();
  }

  async onOpen() {
    // 先构建索引，再渲染视图，确保首次加载即显示正确的笔记数
    this.refreshIndex();
    this.renderView();
    this.registerEvent(
      this.app.metadataCache.on('changed', () => this.refreshIndex())
    );
    this.registerEvent(
      this.app.vault.on('create', () => this.refreshIndex())
    );
    this.registerEvent(
      this.app.vault.on('delete', () => this.refreshIndex())
    );
    this.registerEvent(
      this.app.vault.on('rename', () => this.refreshIndex())
    );
  }

  /** 扫描全部笔记的frontmatter anatomy字段，构建索引 */
  private refreshIndex() {
    this.anatomyIndex.clear();
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const anatomy = cache?.frontmatter?.anatomy;
      if (!anatomy) continue;
      const values = Array.isArray(anatomy) ? anatomy : [anatomy];
      for (const val of values) {
        const key = String(val).trim();
        if (!key) continue;
        if (!this.anatomyIndex.has(key)) this.anatomyIndex.set(key, []);
        this.anatomyIndex.get(key)!.push(file);
      }
    }
    // 如果当前在区域视图，刷新笔记列表
    if (this.currentView === 'region' && this.currentRegionId) {
      this.updateNoteList(this.currentRegionId);
    } else if (this.currentView === 'body') {
      // 主视图：更新已关联笔记数统计
      const statsEl = this.mapRootEl.querySelector('.anatomy-stats span');
      if (statsEl) {
        const totalNotes = Array.from(this.anatomyIndex.values()).reduce((a, b) => a + b.length, 0);
        statsEl.textContent = `已关联 ${totalNotes} 篇笔记`;
      }
    }
  }

  /** 渲染主视图 */
  private renderView(skipResetSort = false) {
    const root = this.mapRootEl;
    root.empty();
    root.addClass('anatomy-map-container');
    // 切换视图时重置排序模式（排序按钮触发的重渲染不重置）
    if (!skipResetSort) {
      this.annotationSortMode = false;
      this.noteSortMode = false;
      this.noteAddMode = false;
      this.noteRemoveMode = false;
      this.noteAddSearchQuery = '';
    }

    if (this.currentView === 'body') {
      this.renderBodyView(root);
    } else {
      this.renderRegionView(root, this.currentRegionId!);
    }
  }

  /** 全身图视图 */
  private renderBodyView(root: HTMLElement) {
    // 标题栏
    const header = root.createDiv({ cls: 'anatomy-header' });
    header.createEl('span', { text: '人体解剖定位图', cls: 'anatomy-title' });

    // SVG容器（默认正面）
    const svgContainer = root.createDiv({ cls: 'anatomy-svg-wrapper' });
    const settings = getSettings();
    svgContainer.innerHTML = getBodySVG(
      settings.regionPolygons,
      [...settings.hiddenRegionIds, ...settings.recycledRegionIds],
    );
    const svgEl = svgContainer.querySelector('svg');
    if (svgEl) svgEl.classList.add('anatomy-svg');

    // 统计信息
    const stats = root.createDiv({ cls: 'anatomy-stats' });
    const totalNotes = Array.from(this.anatomyIndex.values()).reduce((a, b) => a + b.length, 0);
    stats.createEl('span', { text: `已关联 ${totalNotes} 篇笔记` });

    // 绑定区域点击
    this.bindRegionClicks(svgContainer);

    // 独立分区：未在总图中划定界域的分区
    this.renderDeepRegions(root);
  }

  /** 渲染独立分区列表（未在总图中划定界域的分区） */
  private renderDeepRegions(root: HTMLElement) {
    const settings = getSettings();
    const hidden = new Set([...settings.hiddenRegionIds, ...settings.recycledRegionIds]);

    // 总图中可直接点击的分区ID（内置 data-region + 顶级用户多边形 >=3 点）
    const clickable = new Set<string>([
      'lower-limb', 'upper-limb', 'lung', 'thyroid', 'liver',
    ]);
    for (const p of settings.regionPolygons) {
      // 总图中只显示顶级自定义分区的多边形（无 parentRegionId 或父分区被回收/隐藏的）
      const isTopLevel = !p.parentRegionId ||
        hidden.has(p.parentRegionId) ||
        settings.recycledRegionIds.includes(p.parentRegionId);
      if (p.points.length >= 3 && isTopLevel) clickable.add(p.regionId);
    }

    // 候选分区ID：只选顶级分区（无父分区 或 父分区被隐藏/回收）
    const candidateIds = new Set<string>();
    // 预定义分区：展平整棵树，根据其父节点状态判断是否视为顶级
    function findBuiltInParent(regionId: string, regions: AnatomyRegion[] = BODY_REGIONS): string | null {
      for (const r of regions) {
        if (r.children) {
          for (const c of r.children) {
            if (c.id === regionId) return r.id;
          }
          const found = findBuiltInParent(regionId, r.children);
          if (found !== null) return found;
        }
      }
      return null;
    }
    for (const r of flattenAllRegions(BODY_REGIONS)) {
      const parentId = findBuiltInParent(r.id);
      if (!parentId || hidden.has(parentId) || settings.recycledRegionIds.includes(parentId)) {
        candidateIds.add(r.id);
      }
    }
    // 自定义分区：根据 polygon parentRegionId 判断（自定义 parentRegionId 优先级高于预定义树结构）
    for (const p of settings.regionPolygons) {
      if (!p.parentRegionId) {
        candidateIds.add(p.regionId);
      } else if (hidden.has(p.parentRegionId) || settings.recycledRegionIds.includes(p.parentRegionId)) {
        candidateIds.add(p.regionId);
      } else {
        // 自定义 polygon 指定了有效的父分区 → 不是顶级，不论预定义树怎么说都移除
        candidateIds.delete(p.regionId);
      }
    }

    // 未隐藏、不可直接点击的分区
    const independentRegions = Array.from(candidateIds)
      .filter((id) => !hidden.has(id) && !clickable.has(id))
      .map((id) => {
        const region = this.getRegion(id);
        return region ? { id, label: region.label, region } : null;
      })
      .filter((x): x is { id: string; label: string; region: AnatomyRegion } => x !== null);

    if (independentRegions.length === 0) return;

    const section = root.createDiv({ cls: 'anatomy-deep-regions' });
    section.createEl('div', {
      text: '独立分区',
      cls: 'anatomy-deep-regions-title',
    });
    section.createEl('p', {
      text: '以下分区未在总图中划定界域，点击查看详情',
      cls: 'anatomy-deep-regions-hint',
    });
    const grid = section.createDiv({ cls: 'anatomy-subregion-grid' });
    for (const { id, label, region } of independentRegions) {
      const btn = grid.createEl('button', { cls: 'anatomy-subregion-btn' });
      btn.createEl('span', { text: label, cls: 'anatomy-subregion-label' });
      const notes = this.countNotesForRegion(region);
      if (notes > 0) {
        btn.createEl('span', { text: String(notes), cls: 'anatomy-subregion-count' });
      }
      btn.addEventListener('click', () => {
        this.currentView = 'region';
        this.currentRegionId = id;
        this.renderView();
      });
    }
  }

  /** 区域下钻视图 */
  private renderRegionView(root: HTMLElement, regionId: string) {
    const region = this.getRegion(regionId);
    if (!region) {
      this.renderBodyView(root);
      return;
    }

    // 面包屑导航（多级）
    const breadcrumb = root.createDiv({ cls: 'anatomy-breadcrumb' });
    const backBtn = breadcrumb.createEl('button', { cls: 'anatomy-back-btn' });
    backBtn.createEl('span', { text: '‹ ' });
    backBtn.createEl('span', { text: '返回全身图' });
    backBtn.addEventListener('click', () => {
      this.currentView = 'body';
      this.currentRegionId = null;
      this.renderView();
    });

    // 构建完整路径面包屑
    const path = this.getRegionPath(regionId);
    path.forEach((pathRegion, i) => {
      if (i < path.length - 1) {
        // 非最后一级：可点击跳转
        const crumb = breadcrumb.createEl('button', { cls: 'anatomy-breadcrumb-link' });
        crumb.textContent = pathRegion.label;
        crumb.addEventListener('click', () => {
          this.currentRegionId = pathRegion.id;
          this.renderView();
        });
        breadcrumb.createEl('span', { text: '›', cls: 'anatomy-breadcrumb-sep' });
      }
    });

    breadcrumb.createEl('span', { text: region.label, cls: 'anatomy-breadcrumb-current' });

    // 分区示意图头部（已标注时分区示意图由标注区域统一显示，避免重复）
    const settings = getSettings() as AnatomyMapSettings;
    const thumb = settings.regionThumbnails[regionId];
    const hasAnnotations = settings.pointAnnotations.some((a) => a.regionId === regionId);
    if (thumb && !hasAnnotations) {
      // 有缩略图但无标注：渲染交互式SVG（缩略图作底图 + 子分区可点击多边形），替代静态图片
      const header = root.createDiv({ cls: 'anatomy-region-header' });
      const svgWrapper = header.createDiv({ cls: 'anatomy-svg-wrapper' });
      const annSvg = getAnnotationSVG(regionId);
      svgWrapper.innerHTML = annSvg.svg;
      const svgEl = svgWrapper.querySelector('svg');
      if (svgEl) svgEl.classList.add('anatomy-svg');
      this.bindRegionClicks(svgWrapper);
      header.createEl('div', { cls: 'anatomy-region-title', text: region.label });
    }

    // SVG详图（自定义缩略图或标注存在时跳过预设SVG）
    const svgHTML = (thumb || hasAnnotations) ? '' : getRegionSVG(regionId);
    if (svgHTML) {
      // 注入直接子分区可点击多边形
      const hiddenSet = new Set([...settings.hiddenRegionIds, ...settings.recycledRegionIds]);
      const childPolys = settings.regionPolygons.filter(
        (p) => p.parentRegionId === regionId && p.points.length >= 3 && !hiddenSet.has(p.regionId),
      );
      const childPolyHTML = childPolys
        .map((p) => {
          const pts = p.points.map((pt) => `${pt.x},${pt.y}`).join(' ');
          return `<g class="region" data-region="${p.regionId}"><polygon points="${pts}" fill="transparent" stroke="none" pointer-events="all"/></g>`;
        })
        .join('\n');
      // 当前区域自身多边形的界域框选线（蓝色虚线、不可交互）
      const ownPoly = settings.regionPolygons.find((p) => p.regionId === regionId);
      const ownOutline = ownPoly && ownPoly.points.length >= 3
        ? `<polygon points="${ownPoly.points.map((pt) => `${pt.x},${pt.y}`).join(' ')}" fill="none" stroke="#3498db" stroke-width="3.5" stroke-dasharray="4,2" stroke-opacity="0.85" stroke-linejoin="round" pointer-events="none"/>`
        : '';
      const inject = `${ownOutline}\n${childPolyHTML}`.trim();
      const finalHTML = inject ? svgHTML.replace('</svg>', `${inject}\n</svg>`) : svgHTML;

      const svgContainer = root.createDiv({ cls: 'anatomy-svg-wrapper' });
      svgContainer.innerHTML = finalHTML;
      const svgEl = svgContainer.querySelector('svg');
      if (svgEl) svgEl.classList.add('anatomy-svg');
      this.bindRegionClicks(svgContainer);
    }

    // 笔记列表区域（上移至选点标注上方）
    const listContainer = root.createDiv({ cls: 'anatomy-note-list-container' });
    this.updateNoteList(regionId);

    // 选点标注区域（独立于 frontmatter anatomy 关联）
    this.renderAnnotationSection(root, regionId, region.label);
  }

  /** 创建双列布局容器，返回 [左列, 右列] */
  private createTwoColLayout(parent: HTMLElement, cls: string): [HTMLElement, HTMLElement] {
    const wrapper = parent.createDiv({ cls: cls + ' anatomy-two-col' });
    const leftCol = wrapper.createDiv({ cls: 'anatomy-note-col' });
    const rightCol = wrapper.createDiv({ cls: 'anatomy-note-col' });
    return [leftCol, rightCol];
  }

  /** 将条目按索引分配到左/右列（先左后右，左列 ceil(n/2) 条） */
  private distToCols<T>(items: T[]): { colIdx: 0 | 1; item: T }[] {
    const mid = Math.ceil(items.length / 2);
    return items.map((item, i) => ({ colIdx: (i < mid ? 0 : 1) as 0 | 1, item }));
  }

  /** 渲染子分区按钮网格（如果有子分区） */
  private renderSubregionSection(root: HTMLElement, region: AnatomyRegion) {
    if (!region.children || region.children.length === 0) return;
    const visibleChildren = region.children.filter((c) => !this.isRegionHidden(c.id));
    if (visibleChildren.length === 0) return;
    const grid = root.createDiv({ cls: 'anatomy-subregion-grid' });
    for (const child of visibleChildren) {
      const childNotes = this.countNotesForRegion(child);
      const btn = grid.createEl('button', { cls: 'anatomy-subregion-btn' });
      btn.createEl('span', { text: child.label, cls: 'anatomy-subregion-label' });
      if (childNotes > 0) {
        btn.createEl('span', { text: String(childNotes), cls: 'anatomy-subregion-count' });
      }
      btn.addEventListener('click', () => {
        this.currentRegionId = child.id;
        this.renderView();
      });
    }
  }

  /** 关联笔记：将分区标签写入笔记的 anatomy frontmatter 字段 */
  private async associateNote(file: TFile, region: AnatomyRegion): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      const current = fm['anatomy'];
      const values: string[] = Array.isArray(current)
        ? current.map(String)
        : current != null
          ? [String(current)]
          : [];
      if (!values.includes(region.label)) {
        values.push(region.label);
      }
      fm['anatomy'] = values.length === 1 ? values[0] : values;
    });
  }

  /** 取消关联：从笔记的 anatomy frontmatter 中移除该分区的所有别名 */
  private async disassociateNote(file: TFile, region: AnatomyRegion): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      const current = fm['anatomy'];
      if (current == null) return;
      const values: string[] = Array.isArray(current)
        ? current.map(String)
        : [String(current)];
      const regionAliases = new Set(region.aliases.map((a) => String(a).trim()));
      const remaining = values.filter((v) => !regionAliases.has(String(v).trim()));
      if (remaining.length === 0) {
        delete fm['anatomy'];
      } else {
        fm['anatomy'] = remaining.length === 1 ? remaining[0] : remaining;
      }
    });
  }

  /** 更新笔记列表 */
  private updateNoteList(regionId: string) {
    const listContainer = this.mapRootEl.querySelector('.anatomy-note-list-container') as HTMLElement;
    if (!listContainer) return;
    listContainer.empty();

    const region = this.getRegion(regionId);
    if (!region) return;

    const settings = getSettings() as AnatomyMapSettings;

    // 收集该区域自身别名对应的笔记（不含下级子分区，避免上级笔记过多影响阅读）
    const notes = new Map<string, TFile[]>();
    const allAliases = this.collectAliases(region, false);
    for (const alias of allAliases) {
      const files = this.anatomyIndex.get(alias);
      if (files && files.length > 0) {
        notes.set(alias, files);
      }
    }

    // 收集所有笔记文件的扁平列表（去重）
    const rawFiles: TFile[] = [];
    const seen = new Set<string>();
    for (const files of notes.values()) {
      for (const f of files) {
        if (!seen.has(f.path)) {
          seen.add(f.path);
          rawFiles.push(f);
        }
      }
    }

    // 如果有自定义顺序，按自定义顺序排列
    const customOrder = settings.noteCustomOrder[regionId];
    let allFiles: TFile[];
    if (customOrder && customOrder.length > 0) {
      const fileMap = new Map(rawFiles.map((f) => [f.path, f]));
      allFiles = [];
      for (const path of customOrder) {
        const f = fileMap.get(path);
        if (f) allFiles.push(f);
      }
      // 追加自定义顺序中未包含的新笔记
      for (const f of rawFiles) {
        if (!customOrder.includes(f.path)) allFiles.push(f);
      }
    } else {
      allFiles = rawFiles;
    }

    // 笔记列表标题栏（含 添加关联 / 删除关联 / 排序 按钮）— 始终渲染，保证入口可见
    const noteHeader = listContainer.createDiv({ cls: 'anatomy-note-list-header' });
    noteHeader.createEl('span', { text: '关联笔记', cls: 'anatomy-note-list-title' });

    const headerBtns = noteHeader.createDiv({ cls: 'anatomy-note-list-btns' });

    // 添加关联按钮（始终显示）
    const addBtn = headerBtns.createEl('button', {
      text: this.noteAddMode ? '完成' : '添加',
      cls: 'anatomy-note-add-btn' + (this.noteAddMode ? ' is-active' : ''),
    });
    addBtn.addEventListener('click', () => {
      this.noteAddMode = !this.noteAddMode;
      if (this.noteAddMode) { this.noteRemoveMode = false; this.noteSortMode = false; }
      else { this.noteAddSearchQuery = ''; }
      this.updateNoteList(regionId);
    });

    // 删除关联按钮（有关联笔记时才显示）
    if (allFiles.length > 0) {
      const removeBtn = headerBtns.createEl('button', {
        text: this.noteRemoveMode ? '完成' : '删除',
        cls: 'anatomy-note-remove-btn' + (this.noteRemoveMode ? ' is-active' : ''),
      });
      removeBtn.addEventListener('click', () => {
        this.noteRemoveMode = !this.noteRemoveMode;
        if (this.noteRemoveMode) { this.noteAddMode = false; this.noteSortMode = false; }
        this.updateNoteList(regionId);
      });
    }

    // 排序按钮（>1 篇且非添加/删除模式时显示）
    if (allFiles.length > 1 && !this.noteAddMode && !this.noteRemoveMode) {
      const sortBtn = headerBtns.createEl('button', {
        text: this.noteSortMode ? '完成排序' : '排序',
        cls: 'anatomy-note-sort-btn' + (this.noteSortMode ? ' is-active' : ''),
      });
      sortBtn.addEventListener('click', () => {
        this.noteSortMode = !this.noteSortMode;
        this.updateNoteList(regionId);
      });
    }

    // 无关联笔记且非添加模式：显示空状态并返回，保证 header + 添加按钮已渲染
    if (allFiles.length === 0 && !this.noteAddMode) {
      listContainer.createEl('p', { text: '该区域暂无关联笔记', cls: 'anatomy-empty-hint' });
      return;
    }

    const useCustomOrder = !this.noteSortMode && customOrder && customOrder.length > 0;

    if (this.noteAddMode) {
      // 添加关联模式：搜索 + 未关联笔记列表
      const associatedPaths = new Set(allFiles.map((f) => f.path));
      const allNotes = this.app.vault.getMarkdownFiles();
      // 预计算小写文件名，避免每次按键重复 toLowerCase
      const unassociated = allNotes
        .filter((f) => !associatedPaths.has(f.path))
        .map((f) => ({ file: f, lowerName: f.basename.toLowerCase() }));

      const addSection = listContainer.createDiv({ cls: 'anatomy-note-add-section' });
      const searchInput = addSection.createEl('input', {
        cls: 'anatomy-note-add-search',
        attr: { type: 'text', placeholder: '搜索笔记名称…', value: this.noteAddSearchQuery },
      });
      const addList = addSection.createDiv({ cls: 'anatomy-note-add-list' });

      const MAX_RESULTS = 50;
      const renderAddList = (filter: string) => {
        addList.empty();
        const lower = filter.toLowerCase().trim();
        let filtered;
        if (lower) {
          // 过滤后按匹配优先级排序：完全匹配 > 前缀匹配 > 包含匹配
          const exact: typeof unassociated = [];
          const prefix: typeof unassociated = [];
          const contains: typeof unassociated = [];
          for (const n of unassociated) {
            if (n.lowerName === lower) exact.push(n);
            else if (n.lowerName.startsWith(lower)) prefix.push(n);
            else if (n.lowerName.includes(lower)) contains.push(n);
          }
          filtered = [...exact, ...prefix, ...contains];
        } else {
          filtered = unassociated;
        }
        if (filtered.length === 0) {
          addList.createEl('p', { text: '无匹配笔记', cls: 'anatomy-empty-hint' });
          return;
        }
        const displayed = filtered.slice(0, MAX_RESULTS);
        for (const { file: note } of displayed) {
          const item = addList.createDiv({ cls: 'anatomy-note-add-item' });
          item.createEl('span', { text: note.basename, cls: 'anatomy-note-name' });
          item.createEl('span', { text: '+', cls: 'anatomy-note-add-icon' });
          item.addEventListener('click', async () => {
            await this.associateNote(note, region);
            this.refreshIndex();
            this.updateNoteList(regionId);
          });
        }
        if (filtered.length > MAX_RESULTS) {
          addList.createEl('p', {
            text: `仅显示前 ${MAX_RESULTS} 条，共 ${filtered.length} 条匹配，请细化搜索`,
            cls: 'anatomy-empty-hint',
          });
        }
      };

      // 防抖：停止输入 150ms 后才渲染列表，避免每次按键都重建 DOM
      let searchTimer: number | null = null;
      searchInput.addEventListener('input', () => {
        this.noteAddSearchQuery = searchInput.value;
        if (searchTimer !== null) clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
          renderAddList(this.noteAddSearchQuery);
          searchTimer = null;
        }, 150);
      });
      renderAddList(this.noteAddSearchQuery);
    } else if (this.noteRemoveMode) {
      // 删除关联模式：双列布局 + × 按钮
      const [leftCol, rightCol] = this.createTwoColLayout(listContainer, 'anatomy-note-list anatomy-remove-mode');
      allFiles.forEach((file, i) => {
        const col = i < Math.ceil(allFiles.length / 2) ? leftCol : rightCol;
        const item = col.createDiv({ cls: 'anatomy-note-item' });
        const removeBtn = item.createEl('button', { cls: 'anatomy-note-remove-item-btn', text: '×' });
        removeBtn.addEventListener('click', async (e: MouseEvent) => {
          e.stopPropagation();
          await this.disassociateNote(file, region);
          this.refreshIndex();
          this.updateNoteList(regionId);
        });
        item.createEl('span', { text: `${i + 1}.`, cls: 'anatomy-note-index' });
        item.createEl('span', { text: file.basename, cls: 'anatomy-note-name' });
        item.addEventListener('click', () => {
          this.app.workspace.getLeaf(false).openFile(file);
        });
      });
    } else if (this.noteSortMode) {
      // 排序模式：双列布局 + 拖拽
      const [leftCol, rightCol] = this.createTwoColLayout(listContainer, 'anatomy-note-list anatomy-sort-mode');
      const getCol = (i: number) => i < Math.ceil(allFiles.length / 2) ? leftCol : rightCol;
      allFiles.forEach((file, i) => {
        const col = getCol(i);
        const item = col.createDiv({ cls: 'anatomy-note-item' });
        item.setAttribute('data-note-path', file.path);
        item.draggable = true;
        item.createDiv({ cls: 'anatomy-drag-handle', text: '⠿' });
        item.createEl('span', { text: `${i + 1}.`, cls: 'anatomy-note-index' });
        item.createEl('span', { text: file.basename, cls: 'anatomy-note-name' });

        item.addEventListener('dragstart', (e: DragEvent) => {
          this.draggedNotePath = file.path;
          item.classList.add('anatomy-dragging');
          e.dataTransfer?.setData('text/plain', file.path);
        });
        item.addEventListener('dragend', () => {
          item.classList.remove('anatomy-dragging');
          listContainer.querySelectorAll('.anatomy-drag-over').forEach((el: Element) => el.classList.remove('anatomy-drag-over'));
        });
        item.addEventListener('dragover', (e: DragEvent) => {
          e.preventDefault();
          if (this.draggedNotePath && this.draggedNotePath !== file.path) {
            item.classList.add('anatomy-drag-over');
          }
        });
        item.addEventListener('dragleave', () => {
          item.classList.remove('anatomy-drag-over');
        });
        item.addEventListener('drop', async (e: DragEvent) => {
          e.preventDefault();
          item.classList.remove('anatomy-drag-over');
          if (!this.draggedNotePath || this.draggedNotePath === file.path) return;
          // 重新排序
          const orderedPaths = allFiles.map((f) => f.path);
          const fromIdx = orderedPaths.indexOf(this.draggedNotePath);
          const toIdx = orderedPaths.indexOf(file.path);
          if (fromIdx < 0 || toIdx < 0) return;
          const [moved] = orderedPaths.splice(fromIdx, 1);
          orderedPaths.splice(toIdx, 0, moved);
          const s = getSettings() as AnatomyMapSettings;
          s.noteCustomOrder[regionId] = orderedPaths;
          setSettings(s);
          await saveSettingsData();
          this.draggedNotePath = null;
          this.updateNoteList(regionId);
        });
      });
    } else if (useCustomOrder) {
      // 自定义顺序：双列布局
      const [leftCol, rightCol] = this.createTwoColLayout(listContainer, 'anatomy-note-list');
      const fileMap = new Map(allFiles.map((f) => [f.path, f]));
      let idx = 0;
      const orderedFiles: TFile[] = [];
      for (const path of customOrder) {
        const file = fileMap.get(path);
        if (!file) continue;
        orderedFiles.push(file);
      }
      for (const file of allFiles) {
        if (!customOrder.includes(file.path)) orderedFiles.push(file);
      }
      const mid = Math.ceil(orderedFiles.length / 2);
      orderedFiles.forEach((file, i) => {
        idx++;
        const col = i < mid ? leftCol : rightCol;
        const item = col.createDiv({ cls: 'anatomy-note-item' });
        item.createEl('span', { text: `${idx}.`, cls: 'anatomy-note-index' });
        item.createEl('span', { text: file.basename, cls: 'anatomy-note-name' });
        item.addEventListener('click', () => {
          this.app.workspace.getLeaf(false).openFile(file);
        });
      });
    } else {
      // 默认：扁平双列布局（所有笔记汇总后统一分列）
      const [leftCol, rightCol] = this.createTwoColLayout(listContainer, 'anatomy-note-list');
      const mid = Math.ceil(allFiles.length / 2);
      allFiles.forEach((file, i) => {
        const col = i < mid ? leftCol : rightCol;
        const item = col.createDiv({ cls: 'anatomy-note-item' });
        item.createEl('span', { text: `${i + 1}.`, cls: 'anatomy-note-index' });
        item.createEl('span', { text: file.basename, cls: 'anatomy-note-name' });
        item.addEventListener('click', () => {
          this.app.workspace.getLeaf(false).openFile(file);
        });
      });
    }
  }

  /** 渲染选点标注区域（独立于 frontmatter anatomy 关联） */
  private renderAnnotationSection(root: HTMLElement, regionId: string, regionLabel: string) {
    const settings = getSettings() as AnatomyMapSettings;
    const annotations = settings.pointAnnotations.filter((a) => a.regionId === regionId);

    const section = root.createDiv({ cls: 'anatomy-annotation-section' });

    // 标题栏
    const header = section.createDiv({ cls: 'anatomy-annotation-header' });
    header.createEl('span', { text: '选点标注', cls: 'anatomy-annotation-title' });
    const headerBtns = header.createDiv({ cls: 'anatomy-annotation-btns' });
    const editBtn = headerBtns.createEl('button', { text: '编辑', cls: 'anatomy-annotation-edit-btn' });
    editBtn.addEventListener('click', () => {
      new PointAnnotationEditorModal(
        this.app,
        regionId,
        regionLabel,
        annotations,
        async (points) => {
          settings.pointAnnotations = settings.pointAnnotations.filter((a) => a.regionId !== regionId);
          settings.pointAnnotations.push(...points);
          setSettings(settings);
          await saveSettingsData();
          this.renderView();
        },
      ).open();
    });
    // 排序按钮
    if (annotations.length > 1) {
      const sortBtn = headerBtns.createEl('button', {
        text: this.annotationSortMode ? '完成排序' : '排序',
        cls: 'anatomy-annotation-sort-btn' + (this.annotationSortMode ? ' is-active' : ''),
      });
      sortBtn.addEventListener('click', () => {
        this.annotationSortMode = !this.annotationSortMode;
        this.renderView(true);
      });
    }

    if (annotations.length === 0) {
      section.createEl('p', { text: '暂无标注点，点击「编辑」添加', cls: 'anatomy-empty-hint' });
      return;
    }

    // 标注颜色循环
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];

    // 标注SVG（使用分区示意图 + 坐标映射）
    const svgWrapper = section.createDiv({ cls: 'anatomy-annotation-svg-wrapper' });
    const annSvg = getAnnotationSVG(regionId);
    svgWrapper.innerHTML = annSvg.svg;
    const svgEl = svgWrapper.querySelector('svg');
    if (svgEl) {
      // 同时添加 anatomy-svg 以复用分区悬浮高亮样式（支持子分区下钻时的 hover 提示）
      svgEl.classList.add('anatomy-annotation-svg', 'anatomy-svg');

      // 绑定子分区多边形点击（下钻），保留 data-region
      this.bindRegionClicks(svgWrapper);

      // 创建标注点叠加层
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.id = 'annotation-overlay';
      svgEl.appendChild(overlay);

      annotations.forEach((ann, i) => {
        const color = colors[i % colors.length];
        // 人体坐标 → SVG 显示坐标
        const [dx, dy] = annSvg.fromBody(ann.x, ann.y);

        // 外圈光晕（高亮效果）
        const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        glow.setAttribute('cx', String(dx));
        glow.setAttribute('cy', String(dy));
        glow.setAttribute('r', '10');
        glow.setAttribute('fill', color);
        glow.setAttribute('fill-opacity', '0.25');
        glow.classList.add('anatomy-annotation-glow');
        overlay.appendChild(glow);

        // 主圆点
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(dx));
        circle.setAttribute('cy', String(dy));
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '1.5');
        circle.style.cursor = 'pointer';
        circle.classList.add('anatomy-annotation-point');

        // 点击打开关联笔记（多个时弹出菜单）
        circle.addEventListener('click', (ev: MouseEvent) => {
          ev.stopPropagation();
          const paths = ann.notePaths || [];
          if (paths.length === 0) return;
          if (paths.length === 1) {
            const file = this.app.vault.getAbstractFileByPath(paths[0]);
            if (file instanceof TFile) {
              this.app.workspace.getLeaf(false).openFile(file);
            }
            return;
          }
          // 多个笔记：弹出菜单
          const menu = new Menu();
          for (const p of paths) {
            const f = this.app.vault.getAbstractFileByPath(p);
            const name = f instanceof TFile ? f.basename : p;
            menu.addItem((item) => {
              item.setTitle(name);
              item.onClick(() => {
                if (f instanceof TFile) {
                  this.app.workspace.getLeaf(false).openFile(f);
                }
              });
            });
          }
          menu.showAtMouseEvent(ev);
        });

        // 悬浮提示
        circle.addEventListener('mouseenter', () => {
          circle.setAttribute('r', '7');
        });
        circle.addEventListener('mouseleave', () => {
          circle.setAttribute('r', '5');
        });

        overlay.appendChild(circle);

        // 编号标签
        const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        numText.setAttribute('x', String(dx + 8));
        numText.setAttribute('y', String(dy - 6));
        numText.setAttribute('fill', color);
        numText.setAttribute('font-size', '13');
        numText.setAttribute('font-weight', 'bold');
        numText.style.pointerEvents = 'none';
        numText.textContent = `${i + 1}`;
        overlay.appendChild(numText);
      });
    }

    // 图例列表（仿分区-笔记列表：每个标注独立成组，笔记逐行展示）
    const legend = section.createDiv({ cls: 'anatomy-annotation-legend' });
    if (this.annotationSortMode) legend.classList.add('anatomy-sort-mode');
    annotations.forEach((ann, i) => {
      const color = colors[i % colors.length];
      const group = legend.createDiv({ cls: 'anatomy-annotation-legend-item' });
      group.setAttribute('data-ann-id', ann.id);

      // 排序模式：添加拖拽手柄
      if (this.annotationSortMode) {
        group.draggable = true;
        const handle = group.createDiv({ cls: 'anatomy-drag-handle', text: '⠿' });
        group.addEventListener('dragstart', (e: DragEvent) => {
          this.draggedAnnId = ann.id;
          group.classList.add('anatomy-dragging');
          e.dataTransfer?.setData('text/plain', ann.id);
        });
        group.addEventListener('dragend', () => {
          group.classList.remove('anatomy-dragging');
          legend.querySelectorAll('.anatomy-drag-over').forEach((el) => el.classList.remove('anatomy-drag-over'));
        });
        group.addEventListener('dragover', (e: DragEvent) => {
          e.preventDefault();
          if (this.draggedAnnId && this.draggedAnnId !== ann.id) {
            group.classList.add('anatomy-drag-over');
          }
        });
        group.addEventListener('dragleave', () => {
          group.classList.remove('anatomy-drag-over');
        });
        group.addEventListener('drop', async (e: DragEvent) => {
          e.preventDefault();
          group.classList.remove('anatomy-drag-over');
          if (!this.draggedAnnId || this.draggedAnnId === ann.id) return;
          // 重新排序
          const s = getSettings() as AnatomyMapSettings;
          const regionAnns = s.pointAnnotations.filter((a) => a.regionId === regionId);
          const fromIdx = regionAnns.findIndex((a) => a.id === this.draggedAnnId);
          const toIdx = regionAnns.findIndex((a) => a.id === ann.id);
          if (fromIdx < 0 || toIdx < 0) return;
          const [moved] = regionAnns.splice(fromIdx, 1);
          regionAnns.splice(toIdx, 0, moved);
          // 重建全局数组
          const regionIdSet = new Set(regionAnns.map((a) => a.id));
          s.pointAnnotations = [
            ...s.pointAnnotations.filter((a) => !regionIdSet.has(a.id)),
            ...regionAnns,
          ];
          setSettings(s);
          await saveSettingsData();
          this.draggedAnnId = null;
          this.renderView(true);
        });
      }

      // 组标题：编号圆点 + 可编辑图例名
      const header = group.createDiv({ cls: 'anatomy-annotation-legend-header' });
      const dot = header.createDiv({ cls: 'anatomy-annotation-legend-dot' });
      dot.style.backgroundColor = color;
      dot.textContent = String(i + 1);
      const labelInput = header.createEl('input', {
        cls: 'anatomy-annotation-legend-input',
        attr: { type: 'text', value: ann.label },
      });
      if (this.annotationSortMode) labelInput.setAttribute('disabled', 'true');
      labelInput.addEventListener('change', async () => {
        const s = getSettings() as AnatomyMapSettings;
        const target = s.pointAnnotations.find((a) => a.id === ann.id);
        if (target) {
          target.label = labelInput.value.trim() || `标注 ${i + 1}`;
          labelInput.value = target.label;
          await saveSettingsData();
        }
      });

      // 笔记列表（双列布局）
      const notesWrap = group.createDiv({ cls: 'anatomy-annotation-legend-notes anatomy-two-col' });
      const paths = ann.notePaths || [];
      if (paths.length === 0) {
        notesWrap.createEl('div', {
          text: '未关联笔记',
          cls: 'anatomy-annotation-legend-note-empty',
        });
      } else {
        const mid = Math.ceil(paths.length / 2);
        const leftCol = notesWrap.createDiv({ cls: 'anatomy-note-col' });
        const rightCol = notesWrap.createDiv({ cls: 'anatomy-note-col' });
        paths.forEach((np, ni) => {
          const col = ni < mid ? leftCol : rightCol;
          const noteFile = this.app.vault.getAbstractFileByPath(np);
          const noteName = noteFile instanceof TFile ? noteFile.basename : np;
          const noteItem = col.createDiv({ cls: 'anatomy-annotation-legend-note-item' });
          noteItem.createEl('span', { text: `${ni + 1}.`, cls: 'anatomy-annotation-legend-note-index' });
          noteItem.createEl('span', {
            text: noteName,
            cls: 'anatomy-annotation-legend-note-name',
          });
          if (noteFile instanceof TFile) {
            noteItem.addEventListener('click', () => {
              this.app.workspace.getLeaf(false).openFile(noteFile);
            });
          }
        });
      }

      // 位置序号提示
      group.setAttribute('title', `坐标: (${Math.round(ann.x)}, ${Math.round(ann.y)})`);
    });
  }

  /** 绑定SVG区域点击事件 */
  private bindRegionClicks(container: HTMLElement) {
    const regions = container.querySelectorAll('[data-region]');
    regions.forEach((el) => {
      const regionId = el.getAttribute('data-region');
      if (!regionId) return;
      el.addEventListener('click', () => {
        // 检查是否是叶子区域（无子区域）
        const region = this.getRegion(regionId);
        if (region && (!region.children || region.children.length === 0)) {
          // 叶子区域：直接在该视图显示笔记
          this.currentView = 'region';
          this.currentRegionId = regionId;
          this.renderView();
        } else if (region) {
          // 有子区域：下钻
          this.currentView = 'region';
          this.currentRegionId = regionId;
          this.renderView();
        }
      });
      // 悬浮提示
      el.addEventListener('mouseenter', () => {
        const region = this.getRegion(regionId);
        if (region) {
          const count = this.countNotesForRegion(region);
          if (count > 0) {
            el.setAttribute('title', `${region.label} (${count}篇笔记)`);
          } else {
            el.setAttribute('title', region.label);
          }
        }
      });
    });
  }

  /** 检查区域是否被隐藏（含回收站彻底删除的内置分区） */
  private isRegionHidden(regionId: string): boolean {
    const s = getSettings();
    return s.hiddenRegionIds.includes(regionId) || s.recycledRegionIds.includes(regionId);
  }

  /** 查找区域：统一从预定义和自定义多边形中查找，合并别名与标签，递归构建子分区树 */
  private getRegion(regionId: string, visited: Set<string> = new Set()): AnatomyRegion | null {
    if (visited.has(regionId)) return null;
    // 已彻底删除/隐藏的分区本身不再返回（避免 recycled 分区仍作为父节点参与层级构建）
    if (this.isRegionHidden(regionId)) return null;
    visited.add(regionId);

    let region = findRegion(regionId);
    const custom = getSettings().regionPolygons.find(
      (p) => p.regionId === regionId,
    );
    if (region) {
      // 预定义分区：若存在自定义多边形，合并别名并使用自定义标签
      if (custom) {
        const mergedAliases = [...region.aliases];
        if (custom.aliases && custom.aliases.length > 0) {
          for (const a of custom.aliases) {
            if (!mergedAliases.includes(a)) mergedAliases.push(a);
          }
        }
        region = {
          ...region,
          label: custom.regionLabel || region.label,
          aliases: mergedAliases,
        };
      }
    } else {
      // 自定义分区：从 regionPolygons 构造
      if (custom) {
        region = {
          id: custom.regionId,
          label: custom.regionLabel,
          aliases: custom.aliases || [custom.regionId, custom.regionLabel],
        };
      }
    }
    // 应用重命名（向后兼容）
    if (region && getSettings().renamedRegions[regionId]) {
      region = { ...region, label: getSettings().renamedRegions[regionId] };
    }
    // 递归构建子分区（预定义 children + 自定义子分区）
    if (region) {
      const children: AnatomyRegion[] = [];
      // 预定义子分区
      if (region.children) {
        for (const child of region.children) {
          if (this.isRegionHidden(child.id)) continue;
          const built = this.getRegion(child.id, visited);
          if (built) children.push(built);
        }
      }
      // 自定义子分区（parentRegionId 指向当前分区）
      const customChildren = getSettings().regionPolygons.filter(
        (p) => p.parentRegionId === regionId && !this.isRegionHidden(p.regionId),
      );
      for (const cc of customChildren) {
        if (!children.find((c) => c.id === cc.regionId)) {
          const built = this.getRegion(cc.regionId, visited);
          if (built) children.push(built);
        }
      }
      if (children.length > 0) {
        region = { ...region, children };
      } else if (region.children) {
        region = { ...region, children: undefined };
      }
    }
    return region;
  }

  /** 获取分区的父分区ID（父分区已被隐藏/回收时返回 null，视为顶级） */
  private getParentRegionId(regionId: string): string | null {
    // 自定义分区：查 parentRegionId
    const custom = getSettings().regionPolygons.find((p) => p.regionId === regionId);
    if (custom?.parentRegionId && !this.isRegionHidden(custom.parentRegionId)) {
      return custom.parentRegionId;
    }
    // 预定义分区：在 BODY_REGIONS 树中找父节点
    for (const r of BODY_REGIONS) {
      if (r.id === regionId) return null;
      if (r.children) {
        for (const c of r.children) {
          if (c.id === regionId && !this.isRegionHidden(r.id)) return r.id;
        }
      }
    }
    return null;
  }

  /** 获取从根到当前分区的完整路径 */
  private getRegionPath(regionId: string): AnatomyRegion[] {
    const path: AnatomyRegion[] = [];
    const visited = new Set<string>();
    let currentId: string | null = regionId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const region = this.getRegion(currentId);
      if (!region) break;
      path.unshift(region);
      currentId = this.getParentRegionId(currentId);
    }
    return path;
  }

  /** 收集区域别名；includeChildren=false 时仅收集自身别名（不含下级子分区），避免上级笔记列表过多 */
  private collectAliases(region: AnatomyRegion, includeChildren = true): string[] {
    const aliases = [...region.aliases];
    if (includeChildren && region.children) {
      for (const child of region.children) {
        if (!this.isRegionHidden(child.id)) {
          aliases.push(...this.collectAliases(child));
        }
      }
    }
    return aliases;
  }

  /** 统计区域关联笔记数 */
  private countNotesForRegion(region: AnatomyRegion): number {
    const aliases = this.collectAliases(region);
    const allFiles = new Set<TFile>();
    for (const alias of aliases) {
      const files = this.anatomyIndex.get(alias);
      if (files) {
        for (const f of files) allFiles.add(f);
      }
    }
    return allFiles.size;
  }

  /** 设置变更后刷新视图 */
  refreshView() {
    // 保留排序模式状态（数据保存触发的刷新不应中断排序编辑）
    this.renderView(true);
  }

  async onClose() {
    // 清理
  }
}
