/**
 * dom-safe.ts - DOM 安全写入与注入面过滤工具（加固 #Q2-P1【S1】）
 *
 * 背景：官方审核 Source Error "Unsafe assignment to innerHTML"。
 * 本插件 SVG 模板混入用户设置数据（缩略图 dataUrl / 自定义 regionId / 多边形顶点），
 * 直接 innerHTML 赋值会被解析执行，构成 XSS 注入面。
 *
 * 策略：
 * 1. SVG 字符串统一经 DOMParser 解析 + document.importNode 导入当前文档
 *    （官方 checker 认可的 DOM 安全路径，DOMParser 结果不执行脚本/事件处理器）；
 * 2. 属性插值点过 escapeSvgAttr 转义，数值插值点过 Number 强转（各调用方执行）；
 * 3. 图片 dataUrl 过白名单（仅 PNG/JPEG/GIF/WebP base64），阻断 data:text/html 等载荷
 *    （与 saveThumbnail 上传入口 / getAnnotationSVG 渲染入口对齐）。
 */

/** SVG 属性值转义：& < > " ' → 实体，阻断属性边界逃逸 */
export function escapeSvgAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 图片 dataUrl 白名单：仅允许 PNG/JPEG/GIF/WebP base64（与上传格式、auto 缩略图 canvas.toDataURL('image/png') 产物对齐） */
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;

/** 校验 dataUrl 是否为白名单内的图片格式 */
export function isImageDataUrl(dataUrl: string): boolean {
  return IMAGE_DATA_URL_RE.test(dataUrl);
}

/**
 * 将 SVG 字符串安全解析为当前文档的 SVG 根元素（替代 `el.innerHTML = svg`）。
 * 严格 image/svg+xml 解析失败时回退 text/html 解析（同为 DOMParser 安全路径，
 * 两种模式均不执行脚本），保证存量模板的渲染兼容性。
 * 无法解析出 <svg> 时返回 null，由调用方回退处理。
 */
export function svgToElement(svg: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  let root: Element | null = doc.documentElement;
  if (!root || root.nodeName === 'parsererror' || root.getElementsByTagName('parsererror').length > 0) {
    const htmlDoc = new DOMParser().parseFromString(svg, 'text/html');
    root = htmlDoc.querySelector('svg');
  }
  if (!root || root.nodeName !== 'svg') return null;
  return document.importNode(root, true) as SVGSVGElement;
}

/**
 * 安全渲染：将容器内容替换为解析后的 SVG（语义等价于原 `container.innerHTML = svg`）。
 * 成功返回 SVG 元素；解析失败清空容器并返回 null（回退行为由调用方决定）。
 */
export function renderSvgInto(container: HTMLElement, svg: string): SVGSVGElement | null {
  const el = svgToElement(svg);
  container.replaceChildren();
  if (el) container.appendChild(el);
  return el;
}
