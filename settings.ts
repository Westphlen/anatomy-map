/**
 * 插件设置 - 分区编辑器
 * 允许用户在人体图上直观绘制多边形分区（类抠图形式）
 */

import { App, Modal, Plugin, Setting, PluginSettingTab, TFile, TFolder, FuzzySuggestModal, Notice } from 'obsidian';
import { BODY_REGIONS, AnatomyRegion, flattenAllRegions, findRegion } from './anatomy-data';
import { getBodySVG, getRegionSVG } from './svg-templates';
import { getAnnotationSVG, AnnotationSVGResult } from './view';
// 加固 #Q2-P1【S1】：引入 DOM 安全写入工具与 dataUrl 白名单
import { renderSvgInto, isImageDataUrl } from './dom-safe';

// ── 类型定义 ──

export interface RegionPolygon {
  regionId: string;
  regionLabel: string;
  aliases?: string[];
  points: { x: number; y: number }[];
  parentRegionId?: string;
}

/** 选点标注：在分区示意图上标记点位，关联笔记 */
export interface PointAnnotation {
  id: string;
  regionId: string;       // 所属分区ID
  x: number;              // SVG viewBox 坐标
  y: number;
  notePaths: string[];    // 关联笔记路径（支持多个）
  label: string;          // 图例名（可自定义）
}

export interface AnatomyMapSettings {
  regionPolygons: RegionPolygon[];
  hiddenRegionIds: string[];
  /** 已彻底删除的内置分区ID（回收站），不再显示在分区列表，但允许用相同ID重新创建自定义分区 */
  recycledRegionIds: string[];
  renamedRegions: Record<string, string>;
  /** 分区示意图（dataURL），key = regionId，value = { dataUrl, source: 'auto'|'upload' } */
  regionThumbnails: Record<string, { dataUrl: string; source: 'auto' | 'upload' }>;
  /** 选点标注列表（独立于 frontmatter anatomy 关联） */
  pointAnnotations: PointAnnotation[];
  /** 分区-笔记自定义排序：regionId → 有序笔记路径列表 */
  noteCustomOrder: Record<string, string[]>;
}

// ── 默认分区多边形（初始状态）──

const DEFAULT_REGION_POLYGONS: RegionPolygon[] = [
  {
    regionId: 'brain',
    regionLabel: '脑',
    aliases: ['脑', 'brain'],
    points: [
      { x: 244.52, y: 81.74 }, { x: 239.52, y: 73.74 }, { x: 234.52, y: 71.74 },
      { x: 228.52, y: 68.74 }, { x: 218.52, y: 68.74 }, { x: 216.52, y: 60.74 },
      { x: 217.52, y: 50.74 }, { x: 224.52, y: 44.74 }, { x: 236.52, y: 41.74 },
      { x: 244.52, y: 42.74 }, { x: 252.52, y: 45.74 }, { x: 256.52, y: 48.74 },
      { x: 262.52, y: 53.74 }, { x: 263.52, y: 61.74 }, { x: 263.52, y: 68.88 },
      { x: 258.52, y: 77.88 }, { x: 248.52, y: 80.88 },
    ],
  },
  {
    regionId: 'eye',
    regionLabel: '眼',
    aliases: ['眼', 'eye'],
    points: [
      { x: 212.52, y: 74.4 }, { x: 209.52, y: 71.4 }, { x: 212.52, y: 66.4 },
      { x: 215.52, y: 70.4 }, { x: 214.52, y: 72.4 },
    ],
  },
  {
    regionId: 'lung',
    regionLabel: '支气管树',
    aliases: ['肺', '气管', 'lung', '支气管树'],
    points: [],
  },
  {
    regionId: 'gut',
    regionLabel: '肠',
    aliases: ['肠', '小肠', '大肠', 'gut'],
    points: [
      { x: 219.52, y: 274.54 }, { x: 213.52, y: 267.54 }, { x: 206.52, y: 262.54 },
      { x: 203.52, y: 252.54 }, { x: 203.52, y: 243.54 }, { x: 205.52, y: 237.54 },
      { x: 207.52, y: 227.54 }, { x: 212.52, y: 217.54 }, { x: 219.52, y: 216.54 },
      { x: 225.52, y: 214.54 }, { x: 230.52, y: 218.54 }, { x: 238.52, y: 217.54 },
      { x: 245.52, y: 215.54 }, { x: 258.52, y: 211.54 }, { x: 270.52, y: 207.54 },
      { x: 280.52, y: 210.54 }, { x: 280.52, y: 226.54 }, { x: 280.52, y: 236.88 },
      { x: 281.52, y: 248.88 }, { x: 278.52, y: 259.88 }, { x: 273.52, y: 270.88 },
      { x: 264.52, y: 277.88 }, { x: 250.52, y: 278.88 }, { x: 245.52, y: 286.88 },
      { x: 243.52, y: 296.88 }, { x: 238.52, y: 284.88 }, { x: 239.52, y: 271.88 },
      { x: 228.52, y: 270.88 }, { x: 221.52, y: 262.88 },
    ],
  },
  {
    regionId: 'stomach',
    regionLabel: '胃',
    aliases: ['胃', 'stomach'],
    points: [
      { x: 263.52, y: 187.07 }, { x: 267.52, y: 191.07 }, { x: 272.52, y: 191.07 },
      { x: 273.52, y: 189.07 }, { x: 276.52, y: 187.07 }, { x: 275.52, y: 192.07 },
      { x: 274.52, y: 200.07 }, { x: 266.52, y: 205.07 }, { x: 259.52, y: 209.07 },
      { x: 246.52, y: 211.07 }, { x: 237.52, y: 208.07 }, { x: 229.52, y: 212.88 },
      { x: 247.52, y: 204.88 }, { x: 254.52, y: 199.88 }, { x: 258.52, y: 194.88 },
    ],
  },
];

// ── 已彻底删除的内置分区ID（初始状态）──

const DEFAULT_RECYCLED_IDS: string[] = [
  'head', 'ear', 'nose', 'mouth', 'neck', 'parathyroid', 'larynx',
  'cervical-esophagus', 'cervical-lymph', 'thorax', 'mediastinum',
  'breast', 'thoracic-esophagus', 'chest-wall', 'abdomen', 'biliary',
  'small-intestine', 'large-intestine', 'pancreas', 'spleen',
  'adrenal', 'peritoneum', 'abdominal-wall', 'pelvis', 'bladder',
  'prostate', 'uterus', 'ovary', 'rectum', 'pelvis-bone', 'spine',
  'cervical-spine', 'thoracic-spine', 'lumbar-spine', 'spinal-cord',
  'shoulder', 'arm', 'elbow', 'forearm-hand', 'hip', 'leg',
  'ankle-foot', 'knee', 'kidney',
];

export const DEFAULT_SETTINGS: AnatomyMapSettings = {
  regionPolygons: DEFAULT_REGION_POLYGONS,
  hiddenRegionIds: [],
  recycledRegionIds: DEFAULT_RECYCLED_IDS,
  renamedRegions: {},
  regionThumbnails: {},
  pointAnnotations: [],
  noteCustomOrder: {},
};

// ── 模块级设置引用（供 view.ts 和 svg-templates.ts 读取）──

let _settings: AnatomyMapSettings = DEFAULT_SETTINGS;

export function getSettings(): AnatomyMapSettings {
  return _settings;
}

export function setSettings(s: AnatomyMapSettings) {
  _settings = s;
}

// ── 保存回调（供 view.ts 等非插件类调用）──

let _saveCallback: (() => Promise<void>) | null = null;

export function setSaveCallback(cb: () => Promise<void>) {
  _saveCallback = cb;
}

export async function saveSettingsData() {
  if (_saveCallback) await _saveCallback();
}

// ── 辅助：展平区域树 ──

function flattenRegions(
  regions: AnatomyRegion[],
  depth = 0,
): { region: AnatomyRegion; depth: number }[] {
  const result: { region: AnatomyRegion; depth: number }[] = [];
  for (const r of regions) {
    result.push({ region: r, depth });
    if (r.children) result.push(...flattenRegions(r.children, depth + 1));
  }
  return result;
}

// ── 分区编辑器 Modal ──

class RegionEditorModal extends Modal {
  private regionId: string;
  private regionLabel: string;
  private aliases: string[];
  private newId: string;
  private newLabel: string;
  private newAliasesStr: string;
  private newParentRegionId: string;
  private points: { x: number; y: number }[];
  private svgEl: SVGSVGElement | null = null;
  private polygonPreview: SVGPolygonElement | null = null;
  private pointsGroup: SVGGElement | null = null;
  private onSave: (
    points: { x: number; y: number }[],
    newId: string,
    newLabel: string,
    newAliases: string[],
    newParentRegionId: string,
  ) => void | Promise<void>;

  constructor(
    app: App,
    regionId: string,
    regionLabel: string,
    aliases: string[],
    existingPoints: { x: number; y: number }[],
    parentRegionId: string,
    allRegionOptions: { id: string; label: string }[],
    onSave: (
      points: { x: number; y: number }[],
      newId: string,
      newLabel: string,
      newAliases: string[],
      newParentRegionId: string,
    ) => void | Promise<void>,
  ) {
    super(app);
    this.regionId = regionId;
    this.regionLabel = regionLabel;
    this.aliases = aliases;
    this.newId = regionId;
    this.newLabel = regionLabel;
    this.newAliasesStr = aliases.join(', ');
    this.newParentRegionId = parentRegionId;
    this.points = existingPoints.map((p) => ({ ...p }));
    this.onSave = onSave;
    this._allRegionOptions = allRegionOptions;
  }

  private _allRegionOptions: { id: string; label: string }[];

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(`编辑分区 — ${this.regionLabel}`);
    contentEl.empty();
    contentEl.addClass('anatomy-region-editor');

    // 操作说明
    const hintText = this.newParentRegionId
      ? '在父分区示意图上点击添加多边形顶点（至少3个）。双击或点击「完成」保存。'
      : '在人体图上点击添加多边形顶点（至少3个）。双击或点击「完成」保存。顶点会自动按顺序连接为闭合多边形。';
    contentEl.createEl('p', {
      text: hintText,
      cls: 'anatomy-editor-hint',
    });

    // 分区ID输入
    const idSetting = new Setting(contentEl)
      .setName('分区ID')
      .setDesc('唯一标识符（英文），修改后会同步更新所有引用')
      .addText((text) => {
        text.setValue(this.regionId);
        text.onChange((v) => (this.newId = v.trim()));
      });

    // 分区名称输入
    const nameSetting = new Setting(contentEl)
      .setName('分区名称')
      .setDesc('显示名称，修改后点击「完成」保存')
      .addText((text) => {
        text.setValue(this.regionLabel);
        text.onChange((v) => (this.newLabel = v.trim()));
      });

    // 关联别名输入
    const aliasSetting = new Setting(contentEl)
      .setName('关联别名')
      .setDesc('逗号分隔，匹配笔记 frontmatter anatomy 字段。如：心,心脏,heart')
      .addText((text) => {
        text.setValue(this.newAliasesStr);
        text.onChange((v) => (this.newAliasesStr = v));
      });

    // 父分区选择
    new Setting(contentEl)
      .setName('父分区')
      .setDesc('选择父分区以创建子分区，留空为顶级分区')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '（顶级分区）');
        for (const opt of this._allRegionOptions) {
          // 排除自身，避免自引用
          if (opt.id === this.regionId) continue;
          dropdown.addOption(opt.id, opt.label);
        }
        dropdown.setValue(this.newParentRegionId);
        dropdown.onChange((v) => (this.newParentRegionId = v));
      });

    // 编辑器容器：底图（upload/auto 缩略图）+ SVG 叠加层（用于捕获点击并在全局坐标系上绘制）
    const editorContainer = contentEl.createDiv({
      cls: 'anatomy-editor-svg-wrapper anatomy-editor-stack',
    });

    // 底图选择逻辑：上传缩略图 > 自动缩略图（需 polygon）> 主图
    // - upload: viewBox=0 0 500 500，坐标沿用 500x500 空间
    // - auto + polygon: viewBox=parentBBox（无 pad），底图为自动缩略图
    // - 无缩略图 + polygon: viewBox=parentBBox+pad，无底图，主图可见
    // - 无父分区: viewBox=人体总图，无底图
    let parentBBox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
    let useUploadViewBox = false; // 上传图：viewBox=0 0 500 500
    if (this.newParentRegionId) {
      const parentPoly = getSettings().regionPolygons.find(
        (p) => p.regionId === this.newParentRegionId,
      );
      const parentThumb = getSettings().regionThumbnails[this.newParentRegionId];

      if (parentThumb && parentThumb.source === 'upload') {
        // 优先级1：上传缩略图（无需 polygon，viewBox=500x500）
        useUploadViewBox = true;
        const bgImg = editorContainer.createEl('img', {
          cls: 'anatomy-editor-bg-img',
          attr: { src: parentThumb.dataUrl },
        });
        bgImg.dataset.bboxMinX = '0';
        bgImg.dataset.bboxMinY = '0';
        bgImg.dataset.bboxMaxX = '500';
        bgImg.dataset.bboxMaxY = '500';
      } else if (parentPoly && parentPoly.points.length >= 3) {
        // 优先级2/3：自动缩略图 + polygon / 无缩略图 + polygon
        const pts = parentPoly.points;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        parentBBox = { minX, minY, maxX, maxY };
        if (parentThumb && parentThumb.source === 'auto') {
          // 优先级2：自动缩略图作底图
          const bgImg = editorContainer.createEl('img', {
            cls: 'anatomy-editor-bg-img',
            attr: { src: parentThumb.dataUrl },
          });
          bgImg.dataset.bboxMinX = String(minX);
          bgImg.dataset.bboxMinY = String(minY);
          bgImg.dataset.bboxMaxX = String(maxX);
          bgImg.dataset.bboxMaxY = String(maxY);
        }
      }
      // 其余情况：父分区无缩略图且无 polygon → 退化为主图
    }

    // SVG 叠加层：用于全局坐标系点捕获和多边形绘制
    const svgContainer = editorContainer.createDiv();
    // 加固 #Q2-P1【S1】：innerHTML → DOMParser 安全渲染（dom-safe.ts）
    renderSvgInto(svgContainer, getBodySVG());
    this.svgEl = svgContainer.querySelector('svg');

    if (this.svgEl) {
      // 批次4 Q4-P1：cursor 已由 .anatomy-editor-svg CSS 类接管
      this.svgEl.classList.add('anatomy-editor-svg');

      // 是否有底图（upload / auto）
      const hasBgImg = editorContainer.querySelector('img.anatomy-editor-bg-img') !== null;

      // 1) viewBox 设置
      if (useUploadViewBox) {
        // 上传图：viewBox=0 0 500 500，与缩略图像素一一对应
        const vb = this.svgEl.viewBox.baseVal;
        vb.x = 0; vb.y = 0; vb.width = 500; vb.height = 500;
        this.svgEl.setAttribute('preserveAspectRatio', 'none');
      } else if (parentBBox) {
        // 自动缩略图/无底图：viewBox=parentBBox（有底图无 pad，无底图加 pad 20）
        const pad = hasBgImg ? 0 : 20;
        const vb = this.svgEl.viewBox.baseVal;
        vb.x = parentBBox.minX - pad;
        vb.y = parentBBox.minY - pad;
        vb.width = (parentBBox.maxX - parentBBox.minX) + pad * 2;
        vb.height = (parentBBox.maxY - parentBBox.minY) + pad * 2;
        if (hasBgImg) {
          this.svgEl.setAttribute('preserveAspectRatio', 'none');
        }
      }

      // 2) 批次4 Q4-P1：内部元素 pointer-events/opacity 改由 CSS 类接管
      //    .anatomy-editor-svg *:not(.anatomy-overlay *) { pointer-events: none }
      //    .anatomy-has-bg > *:not(.anatomy-overlay) { opacity: 0 }
      if (hasBgImg) {
        this.svgEl.classList.add('anatomy-has-bg');
      }

      // 3) 批次4 Q4-P1：透明背景已由 .anatomy-editor-svg CSS 类接管
      if (hasBgImg) {
        this.svgEl.classList.add('anatomy-editor-svg-overlay');
      }

      // 创建叠加层（加固 #Q3-P4【S2】：createSvg 替代 createElementNS，创建即追加）
      // 批次4 Q4-P1：anatomy-overlay 类豁免内部元素事件屏蔽
      const overlay = this.svgEl.createSvg('g', { cls: 'anatomy-overlay', attr: { id: 'editor-overlay' } });

      // 多边形预览（批次4 Q4-P1：pointer-events/display 由 .anatomy-editor-preview CSS 类接管）
      this.polygonPreview = overlay.createSvg('polygon', {
        cls: 'anatomy-editor-preview',
        attr: {
          fill: 'rgba(250, 200, 0, 0.2)',
          stroke: 'rgba(250, 200, 0, 0.8)',
          'stroke-width': '1.5',
          'stroke-dasharray': '4,2',
        },
      });

      // 顶点标记组
      this.pointsGroup = overlay.createSvg('g', { attr: { id: 'editor-points' } });

      // 点击添加顶点
      this.svgEl.addEventListener('click', (e: MouseEvent) =>
        this.handleClick(e),
      );
      // 双击完成
      this.svgEl.addEventListener('dblclick', (e: MouseEvent) => {
        e.preventDefault();
        // 加固 #Q3-P2【S2】：finish() 返回 Promise，void 显式标记
        void this.finish();
      });

      this.updatePreview();
    }

    // 工具栏
    const toolbar = contentEl.createDiv({
      cls: 'anatomy-editor-toolbar',
    });

    const undoBtn = toolbar.createEl('button', { text: '撤销' });
    undoBtn.addEventListener('click', () => {
      this.points.pop();
      this.updatePreview();
      this.updateCount();
    });

    const clearBtn = toolbar.createEl('button', { text: '清除' });
    clearBtn.addEventListener('click', () => {
      this.points = [];
      this.updatePreview();
      this.updateCount();
    });

    const countSpan = toolbar.createEl('span', {
      cls: 'anatomy-editor-count',
    });
    countSpan.id = 'editor-count';

    const finishBtn = toolbar.createEl('button', {
      text: '完成',
      cls: 'mod-cta',
    });
    finishBtn.addEventListener('click', () => {
      // 加固 #Q3-P3【S2】：回调签名保持 void，Promise 以 void 标记
      void this.finish();
    });

    this.updateCount();
  }

  /** 将屏幕坐标转换为 SVG viewBox 坐标 */
  private handleClick(e: MouseEvent) {
    if (!this.svgEl) return;
    const rect = this.svgEl.getBoundingClientRect();
    const vb = this.svgEl.viewBox.baseVal;
    if (!vb || vb.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * vb.width + vb.x;
    const y = ((e.clientY - rect.top) / rect.height) * vb.height + vb.y;
    this.points.push({
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    });
    this.updatePreview();
    this.updateCount();
  }

  /** 更新多边形预览与顶点标记 */
  private updatePreview() {
    if (!this.polygonPreview || !this.pointsGroup || !this.svgEl) return;

    // 加固 #F2-P4：统一选点尺寸策略——viewBox 短边百分比 + 上下限钳制（二次调小）
    const vb = this.svgEl.viewBox.baseVal;
    const vbShort = Math.min(vb.width, vb.height) || 500;
    const dotR = Math.min(6, Math.max(1, vbShort * 0.01));
    const dotStroke = Math.max(0.3, dotR * 0.3);
    const fontSize = Math.min(9, Math.max(5, dotR * 1.8));
    const textOffset = dotR * 1.5;

    // 多边形
    if (this.points.length >= 2) {
      this.polygonPreview.setAttribute(
        'points',
        this.points.map((p) => `${p.x},${p.y}`).join(' '),
      );
      // 批次4 Q4-P1：display 切换改 classList
      this.polygonPreview.classList.add('is-visible');
    } else {
      this.polygonPreview.classList.remove('is-visible');
    }

    // 顶点圆点 + 编号
    // 加固 #Q2-P1【S1】：innerHTML 清空 → replaceChildren()
    this.pointsGroup.replaceChildren();
    this.points.forEach((pt, i) => {
      // 加固 #Q3-P4【S2】：createSvg 创建即追加到 pointsGroup
      // 批次4 Q4-P1：pointer-events 由 .anatomy-editor-static CSS 类接管
      const c = this.pointsGroup!.createSvg('circle', {
        cls: 'anatomy-editor-static',
        attr: {
          cx: String(pt.x),
          cy: String(pt.y),
          r: String(dotR),
          fill: '#fac800',
          stroke: '#fff',
          'stroke-width': String(dotStroke),
        },
      });

      const t = this.pointsGroup!.createSvg('text', {
        cls: 'anatomy-editor-static',
        attr: {
          x: String(pt.x + textOffset),
          y: String(pt.y - textOffset),
          fill: '#fac800',
          'font-size': String(fontSize),
        },
      });
      t.textContent = String(i + 1);
    });
  }

  private updateCount() {
    const el = this.contentEl.querySelector('#editor-count');
    if (el) el.textContent = `${this.points.length} 个顶点`;
  }

  /** 显示/清除错误提示 */
  private showError(msg: string) {
    let err = this.contentEl.querySelector('.anatomy-editor-error') as HTMLElement | null;
    if (!err) {
      err = this.contentEl.createEl('p', { cls: 'anatomy-editor-error anatomy-add-error' });
      // 插在操作说明之后
      const hint = this.contentEl.querySelector('.anatomy-editor-hint');
      if (hint && hint.nextSibling) {
        this.contentEl.insertBefore(err, hint.nextSibling);
      } else {
        this.contentEl.prepend(err);
      }
    }
    err.textContent = msg;
  }

  private clearError() {
    const err = this.contentEl.querySelector('.anatomy-editor-error');
    if (err) err.remove();
  }

  /** 完成：去除双击产生的重复末尾点，保存 */
  private async finish() {
    this.clearError();

    // 验证ID
    if (!this.newId) {
      this.showError('请输入分区ID');
      return;
    }

    // 验证名称
    if (!this.newLabel) {
      this.showError('请输入分区名称');
      return;
    }

    // 去除双击末尾重复点
    while (this.points.length >= 2) {
      const a = this.points[this.points.length - 1];
      const b = this.points[this.points.length - 2];
      if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) {
        this.points.pop();
      } else break;
    }

    // 解析别名
    const aliases = this.newAliasesStr
      ? this.newAliasesStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    // 至少保证ID和名称在别名中（用于anatomy匹配）
    if (aliases.length === 0) {
      aliases.push(this.newId, this.newLabel);
    } else {
      if (!aliases.includes(this.newId)) aliases.push(this.newId);
      if (!aliases.includes(this.newLabel)) aliases.push(this.newLabel);
    }

    await this.onSave(
      this.points.map((p) => ({ ...p })),
      this.newId,
      this.newLabel,
      aliases,
      this.newParentRegionId,
    );
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** 强制确认对话框（返回 Promise） */
function showConfirmDialog(app: App, title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.titleEl.setText(title);
    const { contentEl } = modal;
    contentEl.createEl('p', { text: message, cls: 'anatomy-confirm-message' });
    const btnContainer = contentEl.createDiv({ cls: 'anatomy-confirm-buttons' });
    btnContainer.createEl('button', { text: '取消' }).addEventListener('click', () => {
      modal.close();
      resolve(false);
    });
    const confirmBtn = btnContainer.createEl('button', { text: '确认', cls: 'mod-warning' });
    confirmBtn.addEventListener('click', () => {
      modal.close();
      resolve(true);
    });
    modal.open();
  });
}

// ── 辅助：获取所有预定义区域ID ──

function getAllKnownRegionIds(): Set<string> {
  const ids = new Set<string>();
  function walk(regions: AnatomyRegion[]) {
    for (const r of regions) {
      ids.add(r.id);
      if (r.children) walk(r.children);
    }
  }
  walk(BODY_REGIONS);
  return ids;
}

// ── 新增分区 Modal ──

class AddRegionModal extends Modal {
  private idValue = '';
  private labelValue = '';
  private aliasesValue = '';
  private parentValue = '';
  private onCreate: (id: string, label: string, aliases: string[], parentRegionId: string) => void;

  constructor(
    app: App,
    existingIds: Set<string>,
    allRegionOptions: { id: string; label: string }[],
    onCreate: (id: string, label: string, aliases: string[], parentRegionId: string) => void,
  ) {
    super(app);
    this._existingIds = existingIds;
    this._allRegionOptions = allRegionOptions;
    this.onCreate = onCreate;
  }

  private _existingIds: Set<string>;
  private _allRegionOptions: { id: string; label: string }[];

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('新增分区');
    contentEl.empty();

    new Setting(contentEl)
      .setName('分区ID')
      .setDesc('唯一标识符（英文），如 my-region')
      .addText((text) => {
        text.setPlaceholder('my-region');
        text.onChange((v) => (this.idValue = v.trim()));
      });

    new Setting(contentEl)
      .setName('分区名称')
      .setDesc('显示名称，如 心脏')
      .addText((text) => {
        text.setPlaceholder('心脏');
        text.onChange((v) => (this.labelValue = v.trim()));
      });

    new Setting(contentEl)
      .setName('关联别名')
      .setDesc('逗号分隔，匹配笔记 frontmatter anatomy 字段。如：心,心脏,heart')
      .addText((text) => {
        text.setPlaceholder('心,心脏,heart');
        text.onChange((v) => (this.aliasesValue = v.trim()));
      });

    // 父分区选择
    new Setting(contentEl)
      .setName('父分区')
      .setDesc('选择父分区以创建子分区，留空为顶级分区')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '（顶级分区）');
        for (const opt of this._allRegionOptions) {
          dropdown.addOption(opt.id, opt.label);
        }
        dropdown.onChange((v) => (this.parentValue = v));
      });

    const errorEl = contentEl.createEl('p', {
      cls: 'anatomy-add-error',
      text: '',
    });

    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText('创建并编辑分区')
        .setCta()
        .onClick(() => {
          if (!this.idValue) {
            errorEl.textContent = '请输入分区ID';
            return;
          }
          if (!this.labelValue) {
            errorEl.textContent = '请输入分区名称';
            return;
          }
          if (this._existingIds.has(this.idValue)) {
            errorEl.textContent = `ID「${this.idValue}」已存在，请使用其他ID`;
            return;
          }
          const aliases = this.aliasesValue
            ? this.aliasesValue
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [this.idValue, this.labelValue];
          this.onCreate(this.idValue, this.labelValue, aliases, this.parentValue);
          this.close();
        });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── 笔记选择 Modal ──

class NoteSuggestModal extends FuzzySuggestModal<TFile> {
  private onChooseCallback: (file: TFile) => void;
  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChooseCallback = onChoose;
    this.setPlaceholder('搜索笔记...');
  }
  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }
  getItemText(item: TFile): string {
    return item.path;
  }
  onChooseItem(item: TFile): void {
    this.onChooseCallback(item);
  }
}

// ── 选点标注编辑器 Modal ──

export class PointAnnotationEditorModal extends Modal {
  private regionId: string;
  private regionLabel: string;
  private points: PointAnnotation[];
  private onSave: (points: PointAnnotation[]) => void | Promise<void>;
  private svgEl: SVGSVGElement | null = null;
  private overlay: SVGGElement | null = null;
  private listContainer: HTMLElement | null = null;
  private selectedId: string | null = null;
  private annSvg: AnnotationSVGResult | null = null;

  constructor(
    app: App,
    regionId: string,
    regionLabel: string,
    existingPoints: PointAnnotation[],
    onSave: (points: PointAnnotation[]) => void | Promise<void>,
  ) {
    super(app);
    this.regionId = regionId;
    this.regionLabel = regionLabel;
    this.points = existingPoints
      .filter((p) => p.regionId === regionId)
      .map((p) => ({ ...p }));
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(`编辑 — ${this.regionLabel}`);
    contentEl.empty();
    contentEl.addClass('anatomy-annotation-editor');

    // 操作说明
    contentEl.createEl('p', {
      text: '在分区示意图上点击添加标注点，每个标注点可关联一篇笔记并自定义图例名。',
      cls: 'anatomy-editor-hint',
    });

    // SVG 容器
    const svgContainer = contentEl.createDiv({
      cls: 'anatomy-editor-svg-wrapper',
    });
    this.annSvg = getAnnotationSVG(this.regionId);
    // 加固 #Q2-P1【S1】：innerHTML → DOMParser 安全渲染
    renderSvgInto(svgContainer, this.annSvg.svg);
    this.svgEl = svgContainer.querySelector('svg');

    if (this.svgEl) {
      // 批次4 Q4-P1：cursor 已由 .anatomy-editor-svg CSS 类接管
      this.svgEl.classList.add('anatomy-editor-svg');

      // 批次4 Q4-P1：内部元素 pointer-events 已由 .anatomy-editor-svg CSS 选择器接管

      // 创建叠加层 <g> 用于渲染标注点（加固 #Q3-P4【S2】：createSvg 创建即追加）
      // 批次4 Q4-P1：anatomy-overlay 类豁免内部元素事件屏蔽
      this.overlay = this.svgEl.createSvg('g', { cls: 'anatomy-overlay', attr: { id: 'annotation-overlay' } });

      // 点击添加/选择标注点
      this.svgEl.addEventListener('click', (e: MouseEvent) =>
        this.handleClick(e),
      );
    }

    // 标注点列表容器（可滚动）
    this.listContainer = contentEl.createDiv({
      cls: 'anatomy-annotation-list',
    });

    // 工具栏
    const toolbar = contentEl.createDiv({
      cls: 'anatomy-editor-toolbar',
    });

    const clearBtn = toolbar.createEl('button', {
      text: '清除全部',
      cls: 'mod-warning',
    });
    clearBtn.addEventListener('click', () => {
      this.points = [];
      this.selectedId = null;
      this.renderPoints();
      this.renderPointList();
    });

    const finishBtn = toolbar.createEl('button', {
      text: '完成',
      cls: 'mod-cta',
    });
    finishBtn.addEventListener('click', () => {
      // 加固 #Q3-P3【S2】：回调签名保持 void，Promise 以 void 标记
      void this.finish();
    });

    this.renderPoints();
    this.renderPointList();
  }

  /** 将屏幕坐标转换为 SVG viewBox 坐标，并处理点击 */
  private handleClick(e: MouseEvent) {
    if (!this.svgEl || !this.annSvg) return;
    const rect = this.svgEl.getBoundingClientRect();
    const vb = this.svgEl.viewBox.baseVal;
    if (!vb || vb.width === 0) return;
    const sx = ((e.clientX - rect.left) / rect.width) * vb.width + vb.x;
    const sy = ((e.clientY - rect.top) / rect.height) * vb.height + vb.y;
    // SVG 显示坐标 → 人体坐标
    const [bx, by] = this.annSvg.toBody(sx, sy);

    // 检查是否点击在已有标注点附近（用 SVG 显示坐标比较）
    const hit = this.points.find((p) => {
      const [px, py] = this.annSvg!.fromBody(p.x, p.y);
      return Math.hypot(px - sx, py - sy) <= 10;
    });
    if (hit) {
      // 选中已有标注点进行编辑
      this.selectedId = hit.id;
    } else {
      // 添加新标注点（存储人体坐标）
      const newPoint: PointAnnotation = {
        id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        regionId: this.regionId,
        x: Math.round(bx * 100) / 100,
        y: Math.round(by * 100) / 100,
        notePaths: [],
        label: `标注 ${this.points.length + 1}`,
      };
      this.points.push(newPoint);
      this.selectedId = newPoint.id;
    }
    this.renderPoints();
    this.renderPointList();
  }

  /** 渲染 SVG 上的标注点 */
  private renderPoints() {
    if (!this.overlay || !this.annSvg || !this.svgEl) return;
    // 加固 #Q2-P1【S1】：innerHTML 清空 → replaceChildren()
    this.overlay.replaceChildren();

    // 加固 #F2-P4：统一选点尺寸策略——viewBox 短边百分比 + 上下限钳制（二次调小）
    const vb = this.svgEl.viewBox.baseVal;
    const vbShort = Math.min(vb.width, vb.height) || 500;
    // 批次4 微调：选点直径/字号减半（用户 2026-10-12 批示）
    // v1.2.2+ 用户裁定动态倍数增大一倍
    const dotR = Math.min(4, Math.max(1, vbShort * 0.004));
    const dotRSelected = Math.min(6, dotR * 3.0);
    const dotStroke = Math.max(0.8, dotR * 0.7);
    const fontSize = Math.min(8, Math.max(5, dotR * 1.6));
    const textOffset = dotR * 3.2;

    for (const point of this.points) {
      const isSelected = point.id === this.selectedId;
      const [dx, dy] = this.annSvg.fromBody(point.x, point.y);

      // 加固 #Q3-P4【S2】：createSvg 创建即追加到 overlay；圆点保留引用以绑定事件
      const c = this.overlay.createSvg('circle', {
        attr: {
          cx: String(dx),
          cy: String(dy),
          r: isSelected ? String(dotRSelected) : String(dotR),
          fill: isSelected ? '#c0392b' : '#e74c3c',
          stroke: '#fff',
          'stroke-width': String(dotStroke),
        },
        // 批次4 Q4-P1：pointer-events/cursor 由 .anatomy-editor-dot CSS 类接管
        cls: 'anatomy-editor-dot',
      });
      // 批次4 Q4-P1 自纠：createSvg cls 不接受空格多类名，选中态脉冲类单独 add
      if (isSelected) {
        c.classList.add('anatomy-annotation-pulse');
      }
      c.addEventListener('click', (ev: MouseEvent) => {
        ev.stopPropagation();
        this.selectedId = point.id;
        this.renderPoints();
        this.renderPointList();
      });

      const t = this.overlay.createSvg('text', {
        cls: 'anatomy-editor-static',
        attr: {
          x: String(dx + textOffset),
          y: String(dy - textOffset),
          fill: '#e74c3c',
          'font-size': String(fontSize),
        },
      });
      t.textContent = point.label;
    }
  }

  /** 渲染标注点列表 */
  private renderPointList() {
    if (!this.listContainer) return;
    // 加固 #Q2-P1【S1】：innerHTML 清空 → replaceChildren()
    this.listContainer.replaceChildren();

    this.points.forEach((point, i) => {
      const row = this.listContainer!.createDiv({
        cls: 'anatomy-annotation-row',
      });
      if (!point.notePaths || point.notePaths.length === 0) {
        row.addClass('anatomy-annotation-row-warning');
      }
      if (point.id === this.selectedId) {
        row.addClass('anatomy-annotation-row-selected');
      }

      // 组标题：编号 + 图例名输入 + 删除按钮
      const header = row.createDiv({ cls: 'anatomy-annotation-row-header' });
      header.createEl('span', {
        cls: 'anatomy-annotation-num',
        text: String(i + 1),
      });
      const labelInput = header.createEl('input', {
        cls: 'anatomy-annotation-label-input',
        type: 'text',
      });
      labelInput.value = point.label;
      labelInput.addEventListener('change', () => {
        point.label = labelInput.value;
        this.renderPoints();
      });
      const delBtn = header.createEl('button', {
        text: '删除',
        cls: 'mod-warning anatomy-annotation-del-btn',
      });
      delBtn.addEventListener('click', () => {
        this.points = this.points.filter((p) => p.id !== point.id);
        if (this.selectedId === point.id) this.selectedId = null;
        this.renderPoints();
        this.renderPointList();
      });

      // 笔记列表（每条独立成行）
      const notesWrap = row.createDiv({ cls: 'anatomy-annotation-notes-wrap' });

      const renderNotes = () => {
        notesWrap.empty();
        if (point.notePaths.length === 0) {
          notesWrap.createEl('div', {
            text: '未关联笔记',
            cls: 'anatomy-annotation-note-empty',
          });
        } else {
          point.notePaths.forEach((np, ni) => {
            const noteFile = this.app.vault.getAbstractFileByPath(np) as TFile | null;
            const noteName = noteFile?.basename || np;
            const noteItem = notesWrap.createDiv({ cls: 'anatomy-annotation-note-item' });
            noteItem.createEl('span', { text: noteName, cls: 'anatomy-annotation-note-name' });
            const rmBtn = noteItem.createEl('button', {
              text: '×',
              cls: 'anatomy-annotation-note-remove',
              attr: { title: '移除此笔记' },
            });
            rmBtn.addEventListener('click', () => {
              point.notePaths.splice(ni, 1);
              renderNotes();
              if (point.notePaths.length === 0) {
                row.addClass('anatomy-annotation-row-warning');
              }
            });
          });
        }
        // 添加笔记按钮
        const addBtn = notesWrap.createEl('button', {
          text: '+ 关联笔记',
          cls: 'anatomy-annotation-add-note-btn',
        });
        addBtn.addEventListener('click', () => {
          new NoteSuggestModal(this.app, (file: TFile) => {
            if (!point.notePaths.includes(file.path)) {
              point.notePaths.push(file.path);
            }
            renderNotes();
            if (point.notePaths.length > 0) {
              row.removeClass('anatomy-annotation-row-warning');
            }
          }).open();
        });
      };
      renderNotes();
    });
  }

  /** 显示错误提示 */
  private showError(msg: string) {
    let err = this.contentEl.querySelector('.anatomy-editor-error') as HTMLElement | null;
    if (!err) {
      err = this.contentEl.createEl('p', { cls: 'anatomy-editor-error anatomy-add-error' });
      const hint = this.contentEl.querySelector('.anatomy-editor-hint');
      if (hint && hint.nextSibling) {
        this.contentEl.insertBefore(err, hint.nextSibling);
      } else {
        this.contentEl.prepend(err);
      }
    }
    err.textContent = msg;
  }

  private clearError() {
    const err = this.contentEl.querySelector('.anatomy-editor-error');
    if (err) err.remove();
  }

  /** 完成：校验并保存 */
  private async finish() {
    this.clearError();
    const missing = this.points.find((p) => !p.notePaths || p.notePaths.length === 0);
    if (missing) {
      this.showError(`标注「${missing.label}」尚未关联笔记，请先选择笔记。`);
      return;
    }
    await this.onSave(this.points.map((p) => ({ ...p })));
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── 备份 Modal ──

class BackupModal extends Modal {
  private backupName: string;
  private folderPath: string;
  private folderSuggestions: TFolder[];
  private onSave: (name: string, folder: string) => Promise<void>;

  constructor(app: App, folderSuggestions: TFolder[], onSave: (name: string, folder: string) => Promise<void>) {
    super(app);
    this.folderSuggestions = folderSuggestions;
    this.onSave = onSave;
    const now = new Date();
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.backupName = `anatomy-map-backup-${d}`;
    this.folderPath = '/';
  }

  onOpen() {
    const { contentEl } = this;
    // 批次4 Q4-P2：heading 改用 Setting.setHeading
    new Setting(contentEl).setName('创建备份').setHeading();
    contentEl.createEl('p', {
      text: '将当前所有分区数据、标注、缩略图和排序设置导出为 JSON 备份文件。',
      cls: 'setting-item-description',
    });

    new Setting(contentEl)
      .setName('备份名称')
      .setDesc('备份文件名（不含 .json 扩展名）')
      .addText((text) => {
        text.setValue(this.backupName).onChange((v) => { this.backupName = v.trim() || this.backupName; });
      });

    const folderSetting = new Setting(contentEl)
      .setName('存储位置')
      .setDesc('Vault 内的文件夹路径（留空或 / 为根目录）')
      .addText((text) => {
        text.setValue(this.folderPath).onChange((v) => { this.folderPath = v.trim(); });
      });

    // 文件夹快捷选择按钮
    if (this.folderSuggestions.length > 0) {
      const suggestContainer = folderSetting.infoEl.createDiv({ cls: 'anatomy-backup-folder-hint' });
      const hint = suggestContainer.createEl('span', {
        text: '常用：',
        cls: 'setting-item-description',
      });
      for (const folder of this.folderSuggestions.slice(0, 8)) {
        const btn = suggestContainer.createEl('a', {
          text: folder.path,
          cls: 'anatomy-folder-suggest-link',
        });
        // 批次4 Q4-P1：cursor/marginRight 已由 CSS 类接管
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.folderPath = folder.path;
          folderSetting.controlEl.querySelector('input')!.value = folder.path;
        });
      }
    }

    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText('取消').onClick(() => this.close());
      })
      .addButton((btn) => {
        btn.setButtonText('创建备份').setCta().onClick(async () => {
          await this.onSave(this.backupName, this.folderPath);
          this.close();
        });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── 恢复备份 Modal（选择 JSON 文件）──

class RestoreBackupModal extends FuzzySuggestModal<TFile> {
  private onChoose: (file: TFile) => void;

  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('选择备份文件...');
    this.setInstructions([{ command: '', purpose: '仅显示 .json 文件' }]);
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((f) => f.extension === 'json');
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    this.onChoose(item);
  }
}

// ── 设置面板 ──

interface AnatomyMapPluginLike {
  settings: AnatomyMapSettings;
  saveSettings: () => Promise<void>;
}

export class AnatomyMapSettingTab extends PluginSettingTab {
  plugin: AnatomyMapPluginLike;

  constructor(app: App, plugin: AnatomyMapPluginLike) {
    // 加固 #Q3-P1【S2】：PluginSettingTab 构造要求 Plugin，而此处刻意只依赖结构子集
    // AnatomyMapPluginLike（避免与 main.ts 具体类循环耦合）；unknown 双断言显式表达该结构兼容，
    // 消除 as any 的隐式逃生口
    super(app, plugin as unknown as Plugin);
    this.plugin = plugin;
  }

  /**
   * 处理分区ID变更：同步迁移所有相关数据引用。
   * @param oldId 原分区ID
   * @param newId 新分区ID
   * @returns 是否成功（ID冲突会失败）
   */
  private migrateRegionId(oldId: string, newId: string): boolean {
    if (oldId === newId) return true;

    // 检查新ID是否与现有ID冲突（已回收的内置ID允许使用）
    const recycled = new Set(this.plugin.settings.recycledRegionIds);
    const allExistingIds = new Set<string>([
      ...getAllKnownRegionIds(),
      ...this.plugin.settings.regionPolygons.map((p) => p.regionId),
      ...this.plugin.settings.hiddenRegionIds,
    ]);
    allExistingIds.delete(oldId);
    // 排除已回收的ID
    for (const r of recycled) allExistingIds.delete(r);
    if (allExistingIds.has(newId)) return false;

    const s = this.plugin.settings;

    // 1. 迁移 regionPolygons 中的 regionId
    for (const p of s.regionPolygons) {
      if (p.regionId === oldId) p.regionId = newId;
    }

    // 2. 迁移 renamedRegions 的 key
    if (oldId in s.renamedRegions) {
      s.renamedRegions[newId] = s.renamedRegions[oldId];
      delete s.renamedRegions[oldId];
    }

    // 3. 迁移 hiddenRegionIds 数组
    const hi = s.hiddenRegionIds.indexOf(oldId);
    if (hi >= 0) s.hiddenRegionIds[hi] = newId;

    // 4. 迁移 regionThumbnails 的 key
    if (oldId in s.regionThumbnails) {
      s.regionThumbnails[newId] = s.regionThumbnails[oldId];
      delete s.regionThumbnails[oldId];
    }

    // 5. 如果新ID是回收的内置ID，清除回收标记并清除旧示意图
    if (recycled.has(newId)) {
      s.recycledRegionIds = s.recycledRegionIds.filter((r) => r !== newId);
      if (newId in s.regionThumbnails) {
        delete s.regionThumbnails[newId];
      }
    }

    // 6. 迁移子分区的 parentRegionId 引用
    for (const p of s.regionPolygons) {
      if (p.parentRegionId === oldId) p.parentRegionId = newId;
    }

    return true;
  }

  /** 获取所有可选的父分区列表（含自定义分区，排除已隐藏/回收）。自定义 polygon 的 regionLabel 优先覆盖预定义 label。 */
  private getAllRegionOptions(): { id: string; label: string }[] {
    const hidden = new Set(this.plugin.settings.hiddenRegionIds);
    const recycled = new Set(this.plugin.settings.recycledRegionIds);
    const optionMap = new Map<string, string>();
    // 预定义分区
    for (const r of flattenAllRegions(BODY_REGIONS)) {
      if (!hidden.has(r.id) && !recycled.has(r.id)) {
        optionMap.set(r.id, r.label);
      }
    }
    // 自定义分区：已存在则用自定义 regionLabel 覆盖，不存在则新增
    for (const p of this.plugin.settings.regionPolygons) {
      if (hidden.has(p.regionId) || recycled.has(p.regionId)) continue;
      optionMap.set(p.regionId, p.regionLabel || optionMap.get(p.regionId) || p.regionId);
    }
    return Array.from(optionMap.entries()).map(([id, label]) => ({ id, label }));
  }

  /** 递归收集某分区的所有后代ID（自定义子分区） */
  private collectDescendantIds(regionId: string): string[] {
    const result: string[] = [];
    const children = this.plugin.settings.regionPolygons.filter(
      (p) => p.parentRegionId === regionId,
    );
    for (const child of children) {
      result.push(child.regionId);
      result.push(...this.collectDescendantIds(child.regionId));
    }
    return result;
  }

  // ── 分区示意图工具函数 ──

  /**
   * 计算一组点的 bounding box，加上 padding（SVG坐标）
   */
  static bbox(
    points: { x: number; y: number }[],
    pad = 8,
    viewBoxW = 500,
    viewBoxH = 500,
  ): { x: number; y: number; w: number; h: number } {
    if (points.length === 0) return { x: 0, y: 0, w: viewBoxW, h: viewBoxH };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = Math.max(10, maxX - minX);
    const h = Math.max(10, maxY - minY);
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    // 以较长边为准做正方形 padding，避免细长区域
    const size = Math.max(w, h) + pad * 2;
    let x = cx - size / 2;
    let y = cy - size / 2;
    // 边界裁剪
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    const sw = Math.min(size, viewBoxW - x);
    const sh = Math.min(size, viewBoxH - y);
    return { x, y, w: Math.max(10, sw), h: Math.max(10, sh) };
  }

  /**
   * 自动生成分区示意图：
   * 顶级分区：基于人体 SVG 裁剪
   * 子分区且父分区有缩略图：基于父分区缩略图（上传/自动 PNG）按坐标映射裁剪
   */
  async generateAutoThumbnail(
    regionId: string,
    points: { x: number; y: number }[],
  ): Promise<string | null> {
    if (points.length < 3) return null;
    const OUT = 160; // 输出正方形尺寸
    const s = this.plugin.settings as AnatomyMapSettings;
    const poly = s.regionPolygons.find((p) => p.regionId === regionId);

    // ========= 子分区且父分区有缩略图：基于父分区缩略图裁剪 =========
    if (poly && poly.parentRegionId) {
      const parentPoly = s.regionPolygons.find((p) => p.regionId === poly.parentRegionId);
      const parentThumb = s.regionThumbnails[poly.parentRegionId];

      // ---- 分支A：父分区是上传缩略图（子分区 points 已在 0-500 空间，无需坐标换算）----
      if (parentThumb && parentThumb.source === 'upload') {
        try {
          // 子分区 points 已在 0-500 空间（编辑时 viewBox=0 0 500 500），直接用 bbox 裁剪
          const localBB = AnatomyMapSettingTab.bbox(points);
          const parentImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = parentThumb.dataUrl;
          });
          const natW = parentImg.naturalWidth || 160;
          const natH = parentImg.naturalHeight || 160;
          const mScale = Math.min(500 / natW, 500 / natH);
          const mScaledW = natW * mScale;
          const mScaledH = natH * mScale;
          const mOffsetX = (500 - mScaledW) / 2;
          const mOffsetY = (500 - mScaledH) / 2;
          const srcX = (localBB.x - mOffsetX) / mScale;
          const srcY = (localBB.y - mOffsetY) / mScale;
          const srcW = localBB.w / mScale;
          const srcH = localBB.h / mScale;
          // 加固 #Q3-P4【S2】：离屏 div 承载 createEl('canvas')，canvas 不入 DOM 仅用于 toDataURL
          const canvas = createDiv().createEl('canvas');
          canvas.width = OUT;
          canvas.height = OUT;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.clearRect(0, 0, OUT, OUT);
          ctx.drawImage(parentImg, srcX, srcY, srcW, srcH, 0, 0, OUT, OUT);
          // 叠加金色边框（子分区在 0-500 空间的 bbox → canvas 坐标）
          ctx.save();
          ctx.strokeStyle = 'rgba(250, 200, 0, 0.75)';
          ctx.lineWidth = 2;
          const sxP = (lx: number) => ((lx - localBB.x) / localBB.w) * OUT;
          const syP = (ly: number) => ((ly - localBB.y) / localBB.h) * OUT;
          ctx.beginPath();
          points.forEach((pt, i) => {
            const X = sxP(pt.x);
            const Y = syP(pt.y);
            if (i === 0) ctx.moveTo(X, Y);
            else ctx.lineTo(X, Y);
          });
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
          return canvas.toDataURL('image/png');
        } catch (e) {
          console.warn('[anatomy-map] generateAutoThumbnail (upload-parent) failed:', e);
          return null;
        }
      }

      // ---- 分支B：父分区是自动缩略图（需 parentPoly.points 做坐标换算）----
      if (parentPoly && parentPoly.points.length >= 3 && parentThumb && parentThumb.source === 'auto') {
        let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
        for (const p of parentPoly.points) {
          if (p.x < pMinX) pMinX = p.x;
          if (p.y < pMinY) pMinY = p.y;
          if (p.x > pMaxX) pMaxX = p.x;
          if (p.y > pMaxY) pMaxY = p.y;
        }
        const pW = Math.max(1, pMaxX - pMinX);
        const pH = Math.max(1, pMaxY - pMinY);
        const toLocal = (bx: number, by: number) => [
          ((bx - pMinX) / pW) * 500,
          ((by - pMinY) / pH) * 500,
        ];
        const subLocalPts = points.map((pt) => ({
          x: toLocal(pt.x, pt.y)[0],
          y: toLocal(pt.x, pt.y)[1],
        }));
        const localBB = AnatomyMapSettingTab.bbox(subLocalPts);
        try {
          const parentImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = parentThumb.dataUrl;
          });
          const natW = parentImg.naturalWidth || 160;
          const natH = parentImg.naturalHeight || 160;
          const mScale = Math.min(500 / natW, 500 / natH);
          const mScaledW = natW * mScale;
          const mScaledH = natH * mScale;
          const mOffsetX = (500 - mScaledW) / 2;
          const mOffsetY = (500 - mScaledH) / 2;
          const srcX = (localBB.x - mOffsetX) / mScale;
          const srcY = (localBB.y - mOffsetY) / mScale;
          const srcW = localBB.w / mScale;
          const srcH = localBB.h / mScale;
          // 加固 #Q3-P4【S2】：离屏 div 承载 createEl('canvas')，canvas 不入 DOM 仅用于 toDataURL
          const canvas = createDiv().createEl('canvas');
          canvas.width = OUT;
          canvas.height = OUT;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.clearRect(0, 0, OUT, OUT);
          ctx.drawImage(parentImg, srcX, srcY, srcW, srcH, 0, 0, OUT, OUT);
          ctx.save();
          ctx.strokeStyle = 'rgba(250, 200, 0, 0.75)';
          ctx.lineWidth = 2;
          const sxP = (lx: number) => ((lx - localBB.x) / localBB.w) * OUT;
          const syP = (ly: number) => ((ly - localBB.y) / localBB.h) * OUT;
          ctx.beginPath();
          subLocalPts.forEach((pt, i) => {
            const X = sxP(pt.x);
            const Y = syP(pt.y);
            if (i === 0) ctx.moveTo(X, Y);
            else ctx.lineTo(X, Y);
          });
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
          return canvas.toDataURL('image/png');
        } catch (e) {
          console.warn('[anatomy-map] generateAutoThumbnail (auto-parent) failed:', e);
          return null;
        }
      }
    }

    // ========= 顶级分区 / 无父缩略图：基于人体 SVG 裁剪 =========
    const bb = AnatomyMapSettingTab.bbox(points);
    const svgHTML = getBodySVG([
      {
        regionId,
        regionLabel: regionId,
        points,
      },
    ]);
    const sizedSVG = svgHTML.replace(
      /viewBox="([^"]*)"/,
      `viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}" width="${OUT}" height="${OUT}" preserveAspectRatio="xMidYMid meet"`,
    );
    const svgBlob = new Blob([sizedSVG], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
      // 加固 #Q3-P4【S2】：离屏 div 承载 createEl('canvas')，canvas 不入 DOM 仅用于 toDataURL
      const canvas = createDiv().createEl('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, OUT, OUT);
      ctx.drawImage(img, 0, 0, OUT, OUT);
      // 叠加半透明金色边框（提示多边形范围）— 坐标：points → canvas，viewBox=bb
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 200, 0, 0.75)';
      ctx.lineWidth = 2;
      const sx = (ptX: number) => ((ptX - bb.x) / bb.w) * OUT;
      const sy = (ptY: number) => ((ptY - bb.y) / bb.h) * OUT;
      ctx.beginPath();
      points.forEach((pt, i) => {
        const X = sx(pt.x);
        const Y = sy(pt.y);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('[anatomy-map] generateAutoThumbnail failed:', e);
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** 打开文件选择框，读取上传的图片为 dataURL（限制大小） */
  static async pickAndReadImage(container: HTMLElement): Promise<string | null> {
    return new Promise((resolve) => {
      // 加固 #Q3-P4【S2】：container.createEl 替代 document.createElement（创建即追加到 container）
      const input = container.createEl('input', {
        cls: 'anatomy-hidden-input',
        attr: { type: 'file', accept: 'image/*' },
      });
      // 批次4 Q4-P1：display 已由 .anatomy-hidden-input CSS 类接管
      input.onchange = async () => {
        const f = input.files?.[0];
        input.remove();
        if (!f) return resolve(null);
        if (f.size > 2 * 1024 * 1024) {
          // >2MB 拒绝并提示
          alert(`图片过大（${Math.round(f.size / 1024)}KB），请使用小于2MB的图片`);
          return resolve(null);
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(f);
      };
      // 用户取消时清理（加固 #Q3-P5【S2】：window.setTimeout 兼容 popout window）
      window.setTimeout(() => {
        window.addEventListener(
          'focus',
          () => {
            if (input.parentElement) window.setTimeout(() => input.remove(), 800);
          },
          { once: true },
        );
      }, 0);
      input.click();
    });
  }

  /** 写入/保存 分区示意图到设置 */
  private saveThumbnail(
    regionId: string,
    dataUrl: string | null,
    source: 'auto' | 'upload',
  ) {
    if (!dataUrl) {
      delete this.plugin.settings.regionThumbnails[regionId];
    } else if (isImageDataUrl(dataUrl)) {
      // 加固 #Q2-P1【S1】：dataUrl 白名单校验（仅 PNG/JPEG/GIF/WebP base64），
      // 不合格式拒绝持久化，阻断 data:text/html 等恶意载荷经 data.json 注入
      this.plugin.settings.regionThumbnails[regionId] = { dataUrl, source };
    } else {
      alert('示意图格式不受支持（仅支持 PNG/JPEG/GIF/WebP），已取消保存');
    }
    setSettings(this.plugin.settings);
    // 加固 #Q3-P2【S2】：void 显式标记保存 Promise
    void this.plugin.saveSettings();
  }

  /**
   * 在 setting-item 中附加分区示意图预览和操作按钮。
   * 左侧：小图预览；右侧小按钮：上传自定义图、自动框选生成、清除。
   */
  private appendThumbnailControl(
    infoEl: HTMLElement,
    regionId: string,
    regionLabel: string,
    pointsForAuto: { x: number; y: number }[],
    onChanged?: () => void,
  ) {
    const wrap = infoEl.createDiv({ cls: 'anatomy-thumb-wrap' });
    const thumb = this.plugin.settings.regionThumbnails[regionId];
    const previewImg = wrap.createEl('img', {
      cls: 'anatomy-thumb-preview',
      attr: {
        src: thumb?.dataUrl || '',
        alt: `${regionLabel} 示意图`,
      },
    });
    if (!thumb) {
      previewImg.addClass('anatomy-thumb-empty');
      previewImg.src =
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="6" fill="var(--background-modifier-hover)" stroke="var(--background-modifier-border)" stroke-dasharray="3,3"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="14" fill="var(--text-muted)">暂无</text></svg>`,
        );
    }
    const meta = wrap.createDiv({ cls: 'anatomy-thumb-meta' });
    if (thumb) {
      const tag = meta.createEl('span', {
        cls:
          thumb.source === 'upload'
            ? 'anatomy-badge-custom anatomy-thumb-tag'
            : 'anatomy-badge-built-in anatomy-thumb-tag',
        text: thumb.source === 'upload' ? '自定义上传' : '自动框选',
      });
    }
    const btnGroup = meta.createDiv({ cls: 'anatomy-thumb-btns' });

    const uploadBtn = btnGroup.createEl('button', {
      text: '上传示意图',
      cls: 'mod-cta anatomy-thumb-btn',
    });
    // 加固 #Q3-P3【S2】：async click 改 void IIFE + catch 兜底
    uploadBtn.addEventListener('click', () => {
      void (async () => {
        const dataUrl = await AnatomyMapSettingTab.pickAndReadImage(
          this.containerEl,
        );
        if (dataUrl) {
          this.saveThumbnail(regionId, dataUrl, 'upload');
          onChanged?.();
        }
      })().catch((err) => console.error('thumbnail upload failed:', err));
    });

    const hasPoints = pointsForAuto.length >= 3;
    const autoBtn = btnGroup.createEl('button', {
      text: '自动框选生成',
      cls: 'anatomy-thumb-btn',
    });
    if (!hasPoints) {
      autoBtn.disabled = true;
      autoBtn.title = '先绘制≥3个顶点后才能自动生成';
    }
    // 加固 #Q3-P3【S2】：async click 改 void IIFE + catch 兜底
    autoBtn.addEventListener('click', () => {
      void (async () => {
        autoBtn.disabled = true;
        autoBtn.setText('生成中…');
        try {
          const dataUrl = await this.generateAutoThumbnail(
            regionId,
            pointsForAuto,
          );
          if (dataUrl) this.saveThumbnail(regionId, dataUrl, 'auto');
        } finally {
          autoBtn.setText('自动框选生成');
          autoBtn.disabled = !hasPoints;
          onChanged?.();
        }
      })().catch((err) => console.error('auto thumbnail failed:', err));
    });

    if (thumb) {
      const clearBtn = btnGroup.createEl('button', {
        text: '清除',
        cls: 'mod-warning anatomy-thumb-btn',
      });
      clearBtn.addEventListener('click', () => {
        this.saveThumbnail(regionId, null, 'auto');
        onChanged?.();
      });
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 批次4 Q4-P2：heading 改用 Setting.setHeading（官方审核规范）
    new Setting(containerEl).setName('分区编辑器').setHeading();
    containerEl.createEl('p', {
      text:
        '为各解剖区域绘制可点击的多边形分区。点击「编辑」打开可视化编辑器，在人体图上点击添加顶点，直观地勾勒区域边界。',
      cls: 'setting-item-description',
    });

    // ── 新增分区按钮 ──
    const knownIds = getAllKnownRegionIds();
    // 已回收的内置分区ID允许重新创建，从 knownIds 中排除
    for (const id of this.plugin.settings.recycledRegionIds) {
      knownIds.delete(id);
    }
    for (const p of this.plugin.settings.regionPolygons) {
      knownIds.add(p.regionId);
    }

    new Setting(containerEl)
      .setName('新增分区')
      .setDesc('创建一个全新的分区，自定义ID、名称和关联别名')
      .addButton((btn) => {
        btn.setButtonText('新增分区')
          .setCta()
          .onClick(() => {
            // 构建父分区选项列表
            const allRegionOptions = this.getAllRegionOptions();
            new AddRegionModal(
              this.app,
              knownIds,
              allRegionOptions,
              (id, label, aliases, parentRegionId) => {
                // 如果是回收的内置分区ID，清除回收标记并清除旧示意图以重新生成
                this.plugin.settings.recycledRegionIds =
                  this.plugin.settings.recycledRegionIds.filter((r) => r !== id);
                if (this.plugin.settings.regionThumbnails[id]) {
                  delete this.plugin.settings.regionThumbnails[id];
                }
                const np: RegionPolygon = {
                  regionId: id,
                  regionLabel: label,
                  aliases,
                  points: [],
                  parentRegionId: parentRegionId || undefined,
                };
                this.plugin.settings.regionPolygons.push(np);
                setSettings(this.plugin.settings);
                // 加固 #Q3-P2【S2】：void 显式标记保存 Promise
                void this.plugin.saveSettings();
                new RegionEditorModal(
                  this.app,
                  id,
                  label,
                  aliases,
                  [],
                  parentRegionId,
                  this.getAllRegionOptions(),
                  async (pts, newId, newLabel, newAliases, newParentId) => {
                    this.migrateRegionId(id, newId);
                    const idx =
                      this.plugin.settings.regionPolygons.findIndex(
                        (p) => p.regionId === newId,
                      );
                    if (idx >= 0) {
                      this.plugin.settings.regionPolygons[idx].points = pts;
                      this.plugin.settings.regionPolygons[idx].regionLabel = newLabel;
                      this.plugin.settings.regionPolygons[idx].aliases = newAliases;
                      this.plugin.settings.regionPolygons[idx].parentRegionId = newParentId || undefined;
                      setSettings(this.plugin.settings);
                      await this.plugin.saveSettings();
                    }
                    const thumb = this.plugin.settings.regionThumbnails[newId];
                    if (pts.length >= 3 && (!thumb || thumb.source === 'auto')) {
                      const dataUrl = await this.generateAutoThumbnail(newId, pts);
                      if (dataUrl) this.saveThumbnail(newId, dataUrl, 'auto');
                    }
                    this.display();
                  },
                ).open();
                this.display();
              },
            ).open();
          });
      });

    // ── 分区列表（统一显示所有分区）──
    // 批次4 Q4-P2：heading 改用 Setting.setHeading
    new Setting(containerEl).setName('分区列表').setHeading().setClass('anatomy-settings-section-title');

    const hidden = new Set(this.plugin.settings.hiddenRegionIds);
    const recycled = new Set(this.plugin.settings.recycledRegionIds);

    // 构建统一分区树（预定义 + 自定义，按层级展平）
    const allEntries: { regionId: string; defaultLabel: string; defaultAliases: string[]; depth: number }[] = [];
    const visited = new Set<string>();
    const walkTree = (regionId: string, depth: number) => {
      if (visited.has(regionId)) return;
      visited.add(regionId);
      if (hidden.has(regionId) || recycled.has(regionId)) return;

      const predefined = findRegion(regionId);
      const custom = this.plugin.settings.regionPolygons.find((p) => p.regionId === regionId);
      const label = custom?.regionLabel || predefined?.label || regionId;
      const aliases = custom?.aliases || predefined?.aliases || [regionId, label];

      allEntries.push({ regionId, defaultLabel: label, defaultAliases: aliases, depth });

      // 预定义子分区
      if (predefined?.children) {
        for (const child of predefined.children) {
          walkTree(child.id, depth + 1);
        }
      }
      // 自定义子分区
      for (const p of this.plugin.settings.regionPolygons) {
        if (p.parentRegionId === regionId && !visited.has(p.regionId)) {
          walkTree(p.regionId, depth + 1);
        }
      }
    };

    // 从顶级开始遍历：BODY_REGIONS 根 + 未被访问到的自定义分区（父分区可能已回收/隐藏）
    for (const r of BODY_REGIONS) {
      walkTree(r.id, 0);
    }
    for (const p of this.plugin.settings.regionPolygons) {
      if (!visited.has(p.regionId) && !hidden.has(p.regionId) && !recycled.has(p.regionId)) {
        walkTree(p.regionId, 0);
      }
    }

    for (const entry of allEntries) {
      const poly = this.plugin.settings.regionPolygons.find(
        (p) => p.regionId === entry.regionId,
      );
      const hasPoly = poly && poly.points.length >= 3;
      const displayLabel = poly?.regionLabel || entry.defaultLabel;

      const item = containerEl.createDiv({ cls: 'setting-item' });

      const info = item.createDiv({ cls: 'setting-item-info' });
      const name = info.createDiv({ cls: 'setting-item-name' });
      name.style.paddingLeft = `${entry.depth * 16}px`;
      name.textContent = displayLabel;

      const desc = info.createDiv({ cls: 'setting-item-description' });
      if (hasPoly) {
        desc.textContent = `已定义 ${poly!.points.length} 个顶点`;
      } else {
        desc.textContent = '未定义多边形';
      }

      this.appendThumbnailControl(
        info,
        entry.regionId,
        displayLabel,
        poly?.points || [],
        () => this.display(),
      );

      const ctrl = item.createDiv({ cls: 'setting-item-control' });

      const editBtn = ctrl.createEl('button', { text: '编辑' });
      editBtn.addEventListener('click', () => {
        new RegionEditorModal(
          this.app,
          entry.regionId,
          displayLabel,
          poly?.aliases || entry.defaultAliases,
          poly?.points || [],
          poly?.parentRegionId || '',
          this.getAllRegionOptions(),
          async (pts, newId, newLabel, newAliases, newParentId) => {
            this.migrateRegionId(entry.regionId, newId);
            const finalId = newId;
            const idx = this.plugin.settings.regionPolygons.findIndex(
              (p) => p.regionId === finalId,
            );
            const np: RegionPolygon = {
              regionId: finalId,
              regionLabel: newLabel,
              aliases: newAliases,
              points: pts,
              parentRegionId: newParentId || undefined,
            };
            if (idx >= 0) this.plugin.settings.regionPolygons[idx] = np;
            else this.plugin.settings.regionPolygons.push(np);
            delete this.plugin.settings.renamedRegions[finalId];
            setSettings(this.plugin.settings);
            await this.plugin.saveSettings();
            const thumb = this.plugin.settings.regionThumbnails[finalId];
            if (pts.length >= 3 && (!thumb || thumb.source === 'auto')) {
              const dataUrl = await this.generateAutoThumbnail(finalId, pts);
              if (dataUrl) this.saveThumbnail(finalId, dataUrl, 'auto');
            }
            this.display();
          },
        ).open();
      });

      const delBtn = ctrl.createEl('button', { text: '删除' });
      delBtn.addClass('mod-warning');
      delBtn.addEventListener('click', () => {
        // 递归隐藏当前分区及其所有自定义子分区
        const toHide = [entry.regionId, ...this.collectDescendantIds(entry.regionId)];
        for (const id of toHide) {
          if (!this.plugin.settings.hiddenRegionIds.includes(id)) {
            this.plugin.settings.hiddenRegionIds.push(id);
          }
        }
        setSettings(this.plugin.settings);
        // 加固 #Q3-P2【S2】：void 显式标记保存 Promise
        void this.plugin.saveSettings();
        this.display();
      });
    }

    // ── 回收站（已隐藏分区，可恢复或彻底删除，默认折叠）──
    const recycleIds = this.plugin.settings.hiddenRegionIds;
    if (recycleIds.length > 0) {
      const header = containerEl.createDiv({ cls: 'anatomy-collapse-header' });
      const triangle = header.createEl('span', {
        cls: 'anatomy-collapse-triangle anatomy-triangle-collapsed',
      });
      header.createEl('span', {
        text: `回收站 (${recycleIds.length})`,
        cls: 'anatomy-settings-section-title',
      });

      // 全部删除按钮（右上角）
      const clearAllBtn = header.createEl('button', {
        text: '全部删除',
        cls: 'mod-warning anatomy-recycle-clear-all-btn',
      });
      // 加固 #Q3-P3【S2】：async click 改 void IIFE + catch 兜底
      clearAllBtn.addEventListener('click', (e: MouseEvent) => {
        void (async () => {
          e.stopPropagation();
          const confirmed = await showConfirmDialog(
            this.app,
            `清空回收站？`,
            `将彻底删除回收站中的全部 ${recycleIds.length} 个分区，此操作无法撤销。`,
          );
          if (!confirmed) return;

          const recycleIdsSet = new Set(recycleIds);
          for (const id of recycleIds) {
            // 移除多边形
            this.plugin.settings.regionPolygons =
              this.plugin.settings.regionPolygons.filter((p) => p.regionId !== id);
            // 移除示意图
            if (this.plugin.settings.regionThumbnails[id]) {
              delete this.plugin.settings.regionThumbnails[id];
            }
            // 移除选点标注
            this.plugin.settings.pointAnnotations =
              this.plugin.settings.pointAnnotations.filter((a) => a.regionId !== id);
            // 移除重命名记录
            if (this.plugin.settings.renamedRegions[id]) {
              delete this.plugin.settings.renamedRegions[id];
            }
            // 从回收站中移除
            this.plugin.settings.hiddenRegionIds =
              this.plugin.settings.hiddenRegionIds.filter((x) => x !== id);
            // 内置分区：加入 recycledRegionIds
            if (getAllKnownRegionIds().has(id) && !this.plugin.settings.recycledRegionIds.includes(id)) {
              this.plugin.settings.recycledRegionIds.push(id);
            }
          }
          // 清理所有其他分区 polygon 的 parentRegionId 引用
          this.plugin.settings.regionPolygons.forEach((p) => {
            if (p.parentRegionId && recycleIdsSet.has(p.parentRegionId)) {
              p.parentRegionId = undefined;
            }
          });
          setSettings(this.plugin.settings);
          await this.plugin.saveSettings();
          this.display();
        })().catch((err) => console.error('clear recycle bin failed:', err));
      });

      const content = containerEl.createDiv({
        cls: 'anatomy-collapse-content anatomy-collapse-hidden anatomy-hidden-regions-content',
      });

      let collapsed = true;
      header.addEventListener('click', () => {
        collapsed = !collapsed;
        triangle.toggleClass('anatomy-triangle-collapsed', collapsed);
        triangle.toggleClass('anatomy-triangle-expanded', !collapsed);
        content.toggleClass('anatomy-collapse-hidden', collapsed);
      });

      for (const hiddenId of recycleIds) {
        const allRegions = flattenRegions(BODY_REGIONS);
        const regionInfo = allRegions.find(
          (r) => r.region.id === hiddenId,
        );
        const customPoly = this.plugin.settings.regionPolygons.find(
          (p) => p.regionId === hiddenId,
        );
        const label = customPoly?.regionLabel || regionInfo?.region.label || hiddenId;
        const isCustom = !!customPoly;

        const item = content.createDiv({ cls: 'setting-item' });
        const info = item.createDiv({ cls: 'setting-item-info' });
        info.createDiv({ cls: 'setting-item-name' }).textContent = label;
        info.createDiv({
          cls: 'setting-item-description',
          text: isCustom ? '自定义分区，已隐藏' : '预定义分区，已隐藏',
        });

        const ctrl = item.createDiv({ cls: 'setting-item-control' });
        const restoreBtn = ctrl.createEl('button', { text: '恢复' });
        restoreBtn.addEventListener('click', () => {
          this.plugin.settings.hiddenRegionIds =
            this.plugin.settings.hiddenRegionIds.filter(
              (id) => id !== hiddenId,
            );
          setSettings(this.plugin.settings);
          // 加固 #Q3-P2【S2】：void 显式标记保存 Promise
          void this.plugin.saveSettings();
          this.display();
        });

        const deleteBtn = ctrl.createEl('button', {
          text: '彻底删除',
          cls: 'mod-warning',
        });
        // 加固 #Q3-P3【S2】：async click 改 void IIFE + catch 兜底
        deleteBtn.addEventListener('click', () => {
          void (async () => {
            const isBuiltIn = getAllKnownRegionIds().has(hiddenId);
            // 收集所有后代ID一起彻底删除
            const allIds = [hiddenId, ...this.collectDescendantIds(hiddenId)];
            const confirmed = await showConfirmDialog(
              this.app,
              `彻底删除「${label}」？`,
              allIds.length > 1
                ? `将彻底删除此分区及其 ${allIds.length - 1} 个子分区，释放所有ID，清除自定义数据。`
                : '将释放此分区ID，清除所有自定义数据（多边形、示意图、标注、重命名），可用相同ID重新创建。',
            );
            if (!confirmed) return;

            const allIdsSet = new Set(allIds);
            for (const id of allIds) {
              // 移除多边形
              this.plugin.settings.regionPolygons =
                this.plugin.settings.regionPolygons.filter((p) => p.regionId !== id);
              // 移除示意图
              if (this.plugin.settings.regionThumbnails[id]) {
                delete this.plugin.settings.regionThumbnails[id];
              }
              // 移除选点标注
              this.plugin.settings.pointAnnotations =
                this.plugin.settings.pointAnnotations.filter((a) => a.regionId !== id);
              // 移除重命名记录
              if (this.plugin.settings.renamedRegions[id]) {
                delete this.plugin.settings.renamedRegions[id];
              }
              // 从回收站中移除
              this.plugin.settings.hiddenRegionIds =
                this.plugin.settings.hiddenRegionIds.filter((x) => x !== id);
              // 内置分区：加入 recycledRegionIds
              if (getAllKnownRegionIds().has(id) && !this.plugin.settings.recycledRegionIds.includes(id)) {
                this.plugin.settings.recycledRegionIds.push(id);
              }
            }
            // 清理所有其他分区 polygon 的 parentRegionId 引用（若父在 allIds 中则清空，提升为顶级）
            this.plugin.settings.regionPolygons.forEach((p) => {
              if (p.parentRegionId && allIdsSet.has(p.parentRegionId)) {
                p.parentRegionId = undefined;
              }
            });
            setSettings(this.plugin.settings);
            await this.plugin.saveSettings();
            this.display();
          })().catch((err) => console.error('delete hidden region failed:', err));
        });
      }
    }

    // ── 选点标注管理 ──
    // 批次4 Q4-P2：heading 改用 Setting.setHeading
    new Setting(containerEl).setName('选点标注管理').setHeading();
    containerEl.createEl('p', {
      text: '在分区示意图上添加自定义标注点，每个点可关联一篇笔记并设置图例名。此功能独立于 frontmatter anatomy 字段关联。',
      cls: 'setting-item-description',
    });

    // Group annotations by regionId
    const annotationGroups = new Map<string, PointAnnotation[]>();
    for (const ann of this.plugin.settings.pointAnnotations) {
      if (!annotationGroups.has(ann.regionId)) {
        annotationGroups.set(ann.regionId, []);
      }
      annotationGroups.get(ann.regionId)!.push(ann);
    }

    // 显示所有可见分区（BODY_REGIONS + 自定义分区）
    const allRegions = flattenRegions(BODY_REGIONS);
    for (const p of this.plugin.settings.regionPolygons) {
      if (!getAllKnownRegionIds().has(p.regionId)) {
        allRegions.push({ region: { id: p.regionId, label: p.regionLabel, aliases: p.aliases || [] }, depth: 0 });
      }
    }

    for (const { region, depth } of allRegions) {
      if (hidden.has(region.id) || recycled.has(region.id)) continue;
      const poly = this.plugin.settings.regionPolygons.find((p) => p.regionId === region.id);
      const displayLabel = poly?.regionLabel || region.label;
      const anns = annotationGroups.get(region.id) || [];

      const item = containerEl.createDiv({ cls: 'setting-item' });
      const info = item.createDiv({ cls: 'setting-item-info' });
      info.createDiv({ cls: 'setting-item-name' }).textContent = displayLabel;
      info.createDiv({
        cls: 'setting-item-description',
        text: anns.length > 0 ? `${anns.length} 个标注点` : '无标注点',
      });

      const ctrl = item.createDiv({ cls: 'setting-item-control' });
      const editBtn = ctrl.createEl('button', { text: '编辑' });
      editBtn.addEventListener('click', () => {
        new PointAnnotationEditorModal(
          this.app,
          region.id,
          displayLabel,
          anns,
          async (points) => {
            // Remove old annotations for this region, add new ones
            this.plugin.settings.pointAnnotations =
              this.plugin.settings.pointAnnotations.filter(a => a.regionId !== region.id);
            this.plugin.settings.pointAnnotations.push(...points);
            setSettings(this.plugin.settings);
            await this.plugin.saveSettings();
            this.display();
          },
        ).open();
      });
    }

    // ── 备份与恢复 ──

    // 批次4 Q4-P2：heading 改用 Setting.setHeading
    new Setting(containerEl).setName('备份与恢复').setHeading();
    containerEl.createEl('p', {
      text: '将所有分区数据、标注、缩略图和排序设置导出为 JSON 文件，或从备份文件恢复数据。',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('创建备份')
      .setDesc('导出当前数据为 JSON 备份文件，可自定义名称和存储位置')
      .addButton((btn) => {
        btn.setButtonText('创建备份').setCta().onClick(() => {
          const folders = this.app.vault.getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder)
            .sort((a, b) => a.path.localeCompare(b.path));
          new BackupModal(
            this.app,
            folders,
            async (name, folder) => { await this.createBackup(name, folder); },
          ).open();
        });
      });

    new Setting(containerEl)
      .setName('恢复备份')
      .setDesc('从 JSON 备份文件恢复数据（当前数据将被覆盖）')
      .addButton((btn) => {
        btn.setButtonText('选择备份文件').setWarning().onClick(() => {
          // 加固 #Q3-P3【S2】：构造器回调签名为 void，恢复 Promise 以 void + catch 兜底
          new RestoreBackupModal(
            this.app,
            (file) => {
              void this.restoreBackup(file).catch((err) => console.error('restore backup failed:', err));
            },
          ).open();
        });
      });
  }

  /** 创建备份文件 */
  private async createBackup(name: string, folder: string): Promise<void> {
    const backupData = {
      version: 1,
      plugin: 'anatomy-map',
      timestamp: new Date().toISOString(),
      settings: this.plugin.settings,
    };
    const json = JSON.stringify(backupData, null, 2);

    // 规范化文件夹路径
    let dir = folder.trim().replace(/\\/g, '/');
    if (dir === '/' || dir === '') dir = '';
    else if (!dir.endsWith('/')) dir += '/';

    const filePath = `${dir}${name}.json`;

    try {
      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, json);
      } else {
        await this.app.vault.create(filePath, json);
      }
      new Notice(`备份已保存到 ${filePath}`);
    } catch (err: unknown) {
      // 加固 #Q3-P1【S2】：catch 变量为 unknown，窄化后再取 message
      const reason = err instanceof Error ? err.message : String(err);
      new Notice(`备份失败：${reason}`);
    }
  }

  /** 从备份文件恢复 */
  private async restoreBackup(file: TFile): Promise<void> {
    let data: { version?: number; plugin?: string; timestamp?: string; settings?: AnatomyMapSettings };

    try {
      const content = await this.app.vault.read(file);
      // 加固 #Q3-P1【S2】：JSON.parse 返回 any，断言为已声明的备份数据类型后赋值
      data = JSON.parse(content) as typeof data;
    } catch {
      new Notice('备份文件解析失败，请确认是有效的 JSON 文件');
      return;
    }

    if (!data.settings) {
      new Notice('无效的备份文件：缺少 settings 字段');
      return;
    }

    // 确认覆盖
    const confirmModal = new Modal(this.app);
    confirmModal.titleEl.setText('确认恢复');
    confirmModal.contentEl.createEl('p', {
      text: `将从「${file.path}」恢复数据，当前所有分区数据将被覆盖。此操作不可撤销，确定继续？`,
    });
    const ts = data.timestamp ? new Date(data.timestamp).toLocaleString('zh-CN') : '未知时间';
    confirmModal.contentEl.createEl('p', {
      text: `备份时间：${ts}`,
      cls: 'setting-item-description',
    });

    new Setting(confirmModal.contentEl)
      .addButton((btn) => btn.setButtonText('取消').onClick(() => confirmModal.close()))
      .addButton((btn) => {
        btn.setButtonText('确认恢复').setWarning().onClick(async () => {
          this.plugin.settings = data.settings!;
          setSettings(this.plugin.settings);
          await this.plugin.saveSettings();
          confirmModal.close();
          this.display();
          new Notice('备份已恢复');
        });
      });
    confirmModal.open();
  }
}
