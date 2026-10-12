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
export const BODY_REGIONS: AnatomyRegion[] = [
  {
    id: 'head',
    label: '头部',
    aliases: ['头', '头部', '脑', '颅', '眼', '耳', '鼻', '口腔'],
    children: [
      { id: 'brain', label: '脑', aliases: ['脑', '大脑', '小脑', '脑干', '间脑'] },
      { id: 'eye', label: '眼', aliases: ['眼', '眼球', '视网膜', '结膜', '角膜'] },
      { id: 'ear', label: '耳', aliases: ['耳', '外耳', '中耳', '内耳'] },
      { id: 'nose', label: '鼻', aliases: ['鼻', '鼻腔', '鼻窦'] },
      { id: 'mouth', label: '口腔', aliases: ['口腔', '牙', '舌', '唾液腺'] },
    ],
  },
  {
    id: 'neck',
    label: '颈部',
    aliases: ['颈', '颈部', '甲状腺', '甲状旁腺', '喉', '气管', '食管颈段'],
    children: [
      { id: 'thyroid', label: '甲状腺', aliases: ['甲状腺'] },
      { id: 'parathyroid', label: '甲状旁腺', aliases: ['甲状旁腺'] },
      { id: 'larynx', label: '喉', aliases: ['喉', '声带'] },
      { id: 'cervical-esophagus', label: '食管(颈段)', aliases: ['食管'] },
      { id: 'cervical-lymph', label: '颈部淋巴结', aliases: ['颈淋巴结', '颈部肿块'] },
    ],
  },
  {
    id: 'thorax',
    label: '胸部',
    aliases: ['胸', '胸部', '心', '肺', '纵隔', '胸膜', '胸壁', '乳腺', '食管胸段'],
    children: [
      { id: 'heart', label: '心', aliases: ['心', '心脏', '心房', '心室', '瓣膜', '冠状动脉', '心包'] },
      { id: 'lung', label: '肺', aliases: ['肺', '气管', '支气管', '胸膜', '肺大疱'] },
      { id: 'mediastinum', label: '纵隔', aliases: ['纵隔', '胸腺', '纵隔肿瘤'] },
      { id: 'breast', label: '乳腺', aliases: ['乳腺', '乳房', '乳腺癌'] },
      { id: 'thoracic-esophagus', label: '食管(胸段)', aliases: ['食管'] },
      { id: 'chest-wall', label: '胸壁', aliases: ['胸壁', '肋骨', '胸骨', '漏斗胸', '鸡胸'] },
    ],
  },
  {
    id: 'abdomen',
    label: '腹部',
    aliases: ['腹', '腹部', '肝', '胆', '胰', '脾', '胃', '肠', '肾', '肾上腺', '腹膜', '腹壁', '疝'],
    children: [
      { id: 'liver', label: '肝', aliases: ['肝', '肝脏', '肝细胞', '肝内胆管'] },
      { id: 'biliary', label: '胆道', aliases: ['胆道', '胆囊', '胆管', '胆石症', '胆道蛔虫'] },
      { id: 'stomach', label: '胃', aliases: ['胃', '十二指肠', '胃十二指肠'] },
      { id: 'small-intestine', label: '小肠', aliases: ['小肠', '空肠', '回肠', '肠扭转', '肠套叠'] },
      { id: 'large-intestine', label: '大肠', aliases: ['大肠', '结肠', '直肠', '肛管', '阑尾', '肠息肉'] },
      { id: 'pancreas', label: '胰腺', aliases: ['胰腺', '胰岛', '胰岛素瘤'] },
      { id: 'spleen', label: '脾', aliases: ['脾', '脾脏', '脾功能亢进'] },
      { id: 'kidney', label: '肾', aliases: ['肾', '肾脏', '肾盂', '输尿管'] },
      { id: 'adrenal', label: '肾上腺', aliases: ['肾上腺'] },
      { id: 'peritoneum', label: '腹膜', aliases: ['腹膜', '腹膜炎', '腹腔'] },
      { id: 'abdominal-wall', label: '腹壁', aliases: ['腹壁', '腹外疝', '腹股沟疝'] },
    ],
  },
  {
    id: 'pelvis',
    label: '盆部',
    aliases: ['盆', '盆腔', '膀胱', '前列腺', '子宫', '卵巢', '输卵管', '阴道', '直肠', '肛管'],
    children: [
      { id: 'bladder', label: '膀胱', aliases: ['膀胱'] },
      { id: 'prostate', label: '前列腺', aliases: ['前列腺', '精囊'] },
      { id: 'uterus', label: '子宫', aliases: ['子宫', '子宫内膜', '宫颈'] },
      { id: 'ovary', label: '卵巢', aliases: ['卵巢', '输卵管'] },
      { id: 'rectum', label: '直肠肛管', aliases: ['直肠', '肛管', '痔', '肛瘘', '肛裂'] },
      { id: 'pelvis-bone', label: '骨盆', aliases: ['骨盆', '骶骨', '尾骨'] },
    ],
  },
  {
    id: 'spine',
    label: '脊柱',
    aliases: ['脊柱', '脊椎', '椎管', '脊髓', '椎间盘', '颈椎', '腰椎', '胸椎'],
    children: [
      { id: 'cervical-spine', label: '颈椎', aliases: ['颈椎', '颈椎病'] },
      { id: 'thoracic-spine', label: '胸椎', aliases: ['胸椎'] },
      { id: 'lumbar-spine', label: '腰椎', aliases: ['腰椎', '腰椎间盘突出', '腰椎管狭窄'] },
      { id: 'spinal-cord', label: '脊髓', aliases: ['脊髓', '椎管', '马尾神经'] },
    ],
  },
  {
    id: 'upper-limb',
    label: '上肢',
    aliases: ['上肢', '肩', '臂', '肘', '前臂', '腕', '手', '锁骨', '肱骨', '桡骨', '尺骨'],
    children: [
      { id: 'shoulder', label: '肩部', aliases: ['肩', '肩关节', '锁骨'] },
      { id: 'arm', label: '上臂', aliases: ['臂', '肱骨', '肱骨干'] },
      { id: 'elbow', label: '肘部', aliases: ['肘', '肱骨髁上'] },
      { id: 'forearm-hand', label: '前臂与手', aliases: ['前臂', '腕', '手', '桡骨', '尺骨', '腕管'] },
    ],
  },
  {
    id: 'lower-limb',
    label: '下肢',
    aliases: ['下肢', '髋', '股', '膝', '胫', '腓', '踝', '足', '股骨', '髌骨'],
    children: [
      { id: 'hip', label: '髋部', aliases: ['髋', '股骨颈', '股骨干', '髋关节'] },
      { id: 'knee', label: '膝部', aliases: ['膝', '髌骨', '膝关节'] },
      { id: 'leg', label: '小腿', aliases: ['小腿', '胫骨', '腓骨'] },
      { id: 'ankle-foot', label: '踝足', aliases: ['踝', '足', '踝部'] },
    ],
  },
];

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
