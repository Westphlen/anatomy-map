/**
 * 解剖区域定义与映射
 * 每个区域包含：中文名、英文别名（匹配frontmatter anatomy字段）、下钻子区域
 */

export interface AnatomyRegion {
  id: string;
  label: string;        // 中文显示名
  aliases: string[];    // frontmatter anatomy字段可能出现的值
  children?: AnatomyRegion[];
}

// 全身一级区域
// 批次F3（2026-10-12）：用户裁定清除全部预设分区，BODY_REGIONS 置空，地图仅保留用户自定义分区
export const BODY_REGIONS: AnatomyRegion[] = [];

// 构建快速查找映射：alias -> regionId
export function buildAliasMap(regions: AnatomyRegion[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(region: AnatomyRegion) {
    for (const alias of region.aliases) {
      map.set(alias, region.id);
    }
    if (region.children) {
      for (const child of region.children) {
        walk(child);
      }
    }
  }
  for (const r of regions) walk(r);
  return map;
}

// 根据regionId查找区域
export function findRegion(regionId: string, regions: AnatomyRegion[] = BODY_REGIONS): AnatomyRegion | null {
  for (const r of regions) {
    if (r.id === regionId) return r;
    if (r.children) {
      const found = findRegion(regionId, r.children);
      if (found) return found;
    }
  }
  return null;
}

/** 展平所有区域（含父子），返回扁平列表 */
export function flattenAllRegions(regions: AnatomyRegion[] = BODY_REGIONS): AnatomyRegion[] {
  const result: AnatomyRegion[] = [];
  function walk(r: AnatomyRegion) {
    result.push(r);
    if (r.children) for (const c of r.children) walk(c);
  }
  for (const r of regions) walk(r);
  return result;
}
