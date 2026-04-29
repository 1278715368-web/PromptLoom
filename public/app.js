const state = {
  referenceImage: null,
  tasks: new Map(),
  pollers: new Map(),
  deletedTaskIds: new Set(),
  status: { model: "gpt-image-2", ratios: {} },
  templates: [],
  presets: [],
  presetCategories: [],
  selectedPresetId: "",
  presetCategory: "全部",
  presetSearch: "",
  currentPage: "createPage",
  loaded: { templates: false, presets: false, jobs: false, history: false },
  historySearch: "",
  historyFilter: "all",
  allHistory: [],
  lightbox: { images: [], currentIndex: 0, isOpen: false },
  batchMode: false,
  batchPage: "",
  batchSelected: new Set()
};

const els = {
  pageTitle: document.querySelector("#pageTitle"),
  tabButtons: document.querySelectorAll(".tab-button"),
  pages: document.querySelectorAll(".tab-page"),
  modelBadge: document.querySelector("#modelBadge"),
  themeToggle: document.querySelector("#themeToggle"),
  imageForm: document.querySelector("#imageForm"),
  strategyKind: document.querySelector("#strategyKind"),
  strategyTitle: document.querySelector("#strategyTitle"),
  strategySubtitle: document.querySelector("#strategySubtitle"),
  productLabel: document.querySelector("#productLabel"),
  sceneField: document.querySelector("#sceneField"),
  variantField: document.querySelector("#variantField"),
  categoryField: document.querySelector("#categoryField"),
  sceneLabel: document.querySelector("#sceneLabel"),
  variantLabel: document.querySelector("#variantLabel"),
  categoryLabel: document.querySelector("#categoryLabel"),
  brandColorsLabel: document.querySelector("#brandColorsLabel"),
  featureLabel: document.querySelector("#featureLabel"),
  sceneSelect: document.querySelector("#sceneSelect"),
  variantSelect: document.querySelector("#variantSelect"),
  categorySelect: document.querySelector("#categorySelect"),
  brandColors: document.querySelector("#brandColors"),
  productInput: document.querySelector("#productInput"),
  featureInput: document.querySelector("#featureInput"),
  imagePrompt: document.querySelector("#imagePrompt"),
  imageCount: document.querySelector("#imageCount"),
  imageRatio: document.querySelector("#imageRatio"),
  imageButton: document.querySelector("#imageButton"),
  openPresetsButton: document.querySelector("#openPresetsButton"),
  selectedPreset: document.querySelector("#selectedPreset"),
  dropZone: document.querySelector("#dropZone"),
  referenceImage: document.querySelector("#referenceImage"),
  referenceLabel: document.querySelector("#referenceLabel"),
  referencePreview: document.querySelector("#referencePreview"),
  presetSearch: document.querySelector("#presetSearch"),
  presetFilters: document.querySelector("#presetFilters"),
  presetList: document.querySelector("#presetList"),
  presetCount: document.querySelector("#presetCount"),
  addPresetButton: document.querySelector("#addPresetButton"),
  presetModal: document.querySelector("#presetModal"),
  presetModalTitle: document.querySelector("#presetModalTitle"),
  presetModalClose: document.querySelector("#presetModalClose"),
  presetModalForm: document.querySelector("#presetModalForm"),
  presetEditId: document.querySelector("#presetEditId"),
  presetFormTitle: document.querySelector("#presetFormTitle"),
  presetFormCategory: document.querySelector("#presetFormCategory"),
  presetFormPrompt: document.querySelector("#presetFormPrompt"),
  presetFormExample: document.querySelector("#presetFormExample"),
  presetFormTags: document.querySelector("#presetFormTags"),
  presetFormTemplateId: document.querySelector("#presetFormTemplateId"),
  presetFormRatio: document.querySelector("#presetFormRatio"),
  presetFormRequiresRef: document.querySelector("#presetFormRequiresRef"),
  taskList: document.querySelector("#taskList"),
  queueCount: document.querySelector("#queueCount"),
  taskSelectMode: document.querySelector("#taskSelectMode"),
  historyList: document.querySelector("#historyList"),
  historySearch: document.querySelector("#historySearch"),
  historyFilters: document.querySelector("#historyFilters"),
  historyCount: document.querySelector("#historyCount"),
  refreshHistoryButton: document.querySelector("#refreshHistoryButton"),
  historySelectMode: document.querySelector("#historySelectMode"),
  clearAllHistoryButton: document.querySelector("#clearAllHistoryButton"),
  toast: document.querySelector("#toast"),
  settingsForm: document.querySelector("#settingsForm"),
  settingApiBaseUrl: document.querySelector("#settingApiBaseUrl"),
  settingApiKey: document.querySelector("#settingApiKey"),
  settingImageModel: document.querySelector("#settingImageModel"),
  settingRequestTimeout: document.querySelector("#settingRequestTimeout"),
  settingDownloadTimeout: document.querySelector("#settingDownloadTimeout"),
  settingMaxAttempts: document.querySelector("#settingMaxAttempts"),
  settingMaxCompare: document.querySelector("#settingMaxCompare"),
  settingLanPassword: document.querySelector("#settingLanPassword"),
  lightbox: document.querySelector("#lightbox"),
  lightboxImage: document.querySelector("#lightboxImage"),
  lightboxCounter: document.querySelector("#lightboxCounter"),
  lightboxPrev: document.querySelector("#lightboxPrev"),
  lightboxNext: document.querySelector("#lightboxNext"),
  lightboxClose: document.querySelector("#lightboxClose"),
  authOverlay: document.querySelector("#authOverlay"),
  authForm: document.querySelector("#authForm"),
  authPassword: document.querySelector("#authPassword"),
  authError: document.querySelector("#authError"),
  batchBar: document.querySelector("#batchBar"),
  batchSelectAll: document.querySelector("#batchSelectAll"),
  batchCount: document.querySelector("#batchCount"),
  batchDownload: document.querySelector("#batchDownload"),
  batchDelete: document.querySelector("#batchDelete"),
  batchExit: document.querySelector("#batchExit")
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2800);
}

/* ── Form Draft Persistence ────────────────────────── */

const DRAFT_KEY = "imageForgeDraft";

function saveFormDraft() {
  try {
    const draft = {
      prompt: els.imagePrompt.value,
      product: els.productInput.value,
      count: els.imageCount.value,
      ratio: els.imageRatio.value,
      brandColors: els.brandColors.value,
      feature: els.featureInput.value,
      selectedPresetId: state.selectedPresetId,
      scene: els.sceneSelect.value,
      variant: els.variantSelect.value,
      category: els.categorySelect.value
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* quota exceeded, ignore */ }
}

function restoreFormDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft.prompt) els.imagePrompt.value = draft.prompt;
    if (draft.product) els.productInput.value = draft.product;
    if (draft.count) els.imageCount.value = draft.count;
    if (draft.ratio) els.imageRatio.value = draft.ratio;
    if (draft.brandColors) els.brandColors.value = draft.brandColors;
    if (draft.feature) els.featureInput.value = draft.feature;
    if (draft.selectedPresetId) {
      state.selectedPresetId = draft.selectedPresetId;
    }
  } catch { /* corrupted draft, ignore */ }
}

function clearFormDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

const saveFormDraftDebounced = debounce(saveFormDraft, 500);

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function initTheme() {
  const saved = localStorage.getItem("imageForgeTheme");
  if (saved) document.documentElement.dataset.theme = saved;
  updateThemeToggle();
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = current === "dark" || (!current && systemDark);
  const next = isDark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("imageForgeTheme", next);
  updateThemeToggle();
}

function updateThemeToggle() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const current = document.documentElement.dataset.theme;
  const isDark = current === "dark" || (!current && systemDark);
  els.themeToggle.textContent = isDark ? "☀️" : "🌙";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

const strategyProfiles = {
  电商: {
    kind: "电商策略",
    title: "电商策略",
    subtitle: "主图、卖点、品类",
    product: "商品",
    productPlaceholder: "磨砂玻璃精华瓶，银色泵头",
    promptPlaceholder: "例如：护肤品白底主图，高级感，黑金配色，柔和棚拍光",
    scene: "场景",
    variant: "变体",
    category: "品类",
    brand: "品牌色",
    brandPlaceholder: "黑金、奶油白、#EC4899",
    feature: "核心卖点",
    featurePlaceholder: "补水、轻盈、敏感肌可用、旅行装",
    showTemplateControls: true
  },
  广告: {
    kind: "广告策略",
    title: "广告策略",
    subtitle: "主视觉、文案、转化",
    product: "推广主体",
    productPlaceholder: "柑橘汽水、运动鞋、咖啡新品",
    promptPlaceholder: "例如：夏日饮料广告，强烈冰感，水果飞溅，社媒海报",
    scene: "广告场景",
    variant: "风格",
    category: "行业",
    brand: "主色",
    brandPlaceholder: "柠檬黄、海盐蓝、亮橙",
    feature: "标题/卖点",
    featurePlaceholder: "新品上市、冰爽、低糖、限时活动",
    showTemplateControls: false
  },
  海报: {
    kind: "海报策略",
    title: "海报策略",
    subtitle: "标题、版式、视觉隐喻",
    product: "主题",
    productPlaceholder: "活动名、电影名、城市、概念词",
    promptPlaceholder: "例如：为“疾风起”做一张 9:16 概念字体海报",
    scene: "版式",
    variant: "风格",
    category: "题材",
    brand: "色彩系统",
    brandPlaceholder: "黑白红、青绿金、低饱和蓝灰",
    feature: "标题/副标题",
    featurePlaceholder: "主标题、短副标题、少量日期或地点",
    showTemplateControls: false
  },
  信息图: {
    kind: "信息图策略",
    title: "信息图策略",
    subtitle: "结构、模块、数据点",
    product: "主题",
    productPlaceholder: "咖啡机工作原理、护肤成分、城市旅行路线",
    promptPlaceholder: "例如：生成咖啡机工作原理信息图，中文清晰，四个模块",
    scene: "图表结构",
    variant: "视觉风格",
    category: "主题域",
    brand: "配色",
    brandPlaceholder: "浅灰白、薄荷绿、科技蓝",
    feature: "模块/数据点",
    featurePlaceholder: "水路、研磨、萃取、奶泡；每项一句短说明",
    showTemplateControls: false
  },
  品牌: {
    kind: "品牌策略",
    title: "品牌策略",
    subtitle: "Logo、配色、应用触点",
    product: "品牌/业务",
    productPlaceholder: "本地咖啡品牌、AI 会议助手、运动服饰",
    promptPlaceholder: "例如：为本地咖啡品牌做品牌身份板，温暖、手作、城市感",
    scene: "应用触点",
    variant: "Logo方向",
    category: "行业",
    brand: "品牌色",
    brandPlaceholder: "咖啡棕、奶油白、城市绿",
    feature: "品牌关键词",
    featurePlaceholder: "温暖、可信、手作、通勤、年轻",
    showTemplateControls: false
  },
  UI: {
    kind: "UI策略",
    title: "UI策略",
    subtitle: "页面、功能、组件",
    product: "产品/页面",
    productPlaceholder: "健身 App、AI 工具首页、直播商品页",
    promptPlaceholder: "例如：健身 App 今日训练页，深色模式，底部 tab",
    scene: "页面类型",
    variant: "界面风格",
    category: "业务",
    brand: "界面色",
    brandPlaceholder: "黑、荧光绿、浅灰",
    feature: "核心功能",
    featurePlaceholder: "训练卡片、数据图、开始按钮、底部导航",
    showTemplateControls: false
  },
  角色: {
    kind: "角色策略",
    title: "角色策略",
    subtitle: "身份、服装、表情",
    product: "角色",
    productPlaceholder: "赛博快递员、品牌吉祥物、游戏 NPC",
    promptPlaceholder: "例如：赛博快递员角色设定表，三视图、表情、装备细节",
    scene: "设定表类型",
    variant: "画风",
    category: "角色类型",
    brand: "色彩",
    brandPlaceholder: "蓝橙、黑银、粉紫",
    feature: "服装/性格",
    featurePlaceholder: "装备、材质、表情、性格关键词",
    showTemplateControls: false
  },
  摄影: {
    kind: "摄影策略",
    title: "摄影策略",
    subtitle: "镜头、光线、场景",
    product: "拍摄主体",
    productPlaceholder: "人物、产品、街景、食物",
    promptPlaceholder: "例如：35mm 纪实风咖啡馆产品照，雨夜窗边，浅景深",
    scene: "拍摄场景",
    variant: "镜头风格",
    category: "题材",
    brand: "影调",
    brandPlaceholder: "暖金、低饱和、夜景霓虹",
    feature: "细节要求",
    featurePlaceholder: "胶片颗粒、皮肤纹理、水汽、真实瑕疵",
    showTemplateControls: false
  },
  人像修图: {
    kind: "人像修图",
    title: "人像修图策略",
    subtitle: "身份保留、修图方向、影调",
    product: "人物/用途",
    productPlaceholder: "本人头像、证件照、社媒头像、棚拍换装",
    promptPlaceholder: "例如：自然精修，肤色更干净，背景简洁，保留真实皮肤纹理",
    scene: "修图类型",
    variant: "影调",
    category: "用途",
    brand: "色调",
    brandPlaceholder: "自然肤色、暖光、低饱和",
    feature: "修图要求",
    featurePlaceholder: "保留本人五官、清理背景、发丝更整洁、不要磨皮过度",
    showTemplateControls: false
  },
  default: {
    kind: "通用策略",
    title: "创作策略",
    subtitle: "主体、风格、约束",
    product: "主体",
    productPlaceholder: "商品、人物、页面、海报主题",
    promptPlaceholder: "例如：说明你想要的画面、用途、风格和比例",
    scene: "结构",
    variant: "风格",
    category: "类型",
    brand: "色彩",
    brandPlaceholder: "主色、辅助色、品牌色",
    feature: "关键约束",
    featurePlaceholder: "必须保留的细节、文字、构图、材质",
    showTemplateControls: false
  }
};

const strategyCategoryOptions = {
  电商: [
    ["", "自动识别"],
    ["beauty", "美妆护肤"],
    ["electronics", "电子数码"],
    ["food", "食品饮料"],
    ["fashion", "服装配饰"],
    ["home", "家居生活"],
    ["jewelry", "珠宝腕表"],
    ["sports", "运动健身"]
  ],
  广告: [
    ["", "默认"],
    ["product-launch", "新品发布"],
    ["social-commerce", "社媒转化"],
    ["fashion-campaign", "时尚大片"],
    ["food-drink", "食品饮料"],
    ["seasonal", "节日活动"]
  ],
  海报: [
    ["", "默认"],
    ["campaign", "商业海报"],
    ["typography", "概念字体"],
    ["movie", "电影海报"],
    ["travel", "城市旅行"],
    ["festival", "节气活动"]
  ],
  信息图: [
    ["", "默认"],
    ["flow", "流程图"],
    ["comparison", "对比图"],
    ["timeline", "时间线"],
    ["science", "科普图鉴"],
    ["report", "报告图表"]
  ],
  品牌: [
    ["", "默认"],
    ["logo", "Logo方向"],
    ["identity", "品牌手册"],
    ["packaging", "包装应用"],
    ["social", "社媒模板"],
    ["app-icon", "App图标"]
  ],
  UI: [
    ["", "默认"],
    ["mobile-app", "手机 App"],
    ["dashboard", "仪表盘"],
    ["landing", "落地页"],
    ["social-ui", "社媒截图"],
    ["livestream", "直播界面"]
  ],
  角色: [
    ["", "默认"],
    ["character-sheet", "设定表"],
    ["avatar", "头像"],
    ["mascot", "品牌吉祥物"],
    ["game", "游戏角色"],
    ["anime", "动漫风格"]
  ],
  摄影: [
    ["", "默认"],
    ["portrait", "人像"],
    ["product", "产品"],
    ["lifestyle", "生活方式"],
    ["documentary", "纪实"],
    ["food", "食物"]
  ],
  人像修图: [
    ["social-avatar", "社媒头像"],
    ["id-photo", "证件/职业照"],
    ["pro-headshot", "职业形象照"],
    ["beauty-campaign", "美妆大片"],
    ["photo-set", "写真组图"],
    ["couple-shoot", "情侣写真"],
    ["wedding-shoot", "婚纱写真"],
    ["child-shoot", "宝宝写真"],
    ["guofeng-shoot", "古风写真"],
    ["age-transform", "年龄变换"],
    ["art-style", "艺术风格化"],
    ["body-reshape", "形象照修型"],
    ["pet-portrait", "宠物写真"],
    ["fashion-editorial", "棚拍换装"],
    ["restore-memory", "旧照修复"],
    ["style-reference", "风格复刻"],
    ["bg-remove", "抠图去背景"],
    ["bg-replace", "换背景"],
    ["object-remove", "消除杂物"],
    ["sky-replace", "换天空"],
    ["hdr-restore", "HDR修复"],
    ["scratch-fix", "划痕修复"]
  ],
  default: [
    ["", "默认"],
    ["creative", "创意"],
    ["commercial", "商业"],
    ["editorial", "编辑"],
    ["reference", "参考图"]
  ]
};

const strategySceneOptions = {
  广告: [
    ["product-launch", "新品发布"],
    ["social-commerce", "社媒转化"],
    ["fashion-campaign", "时尚 Campaign"],
    ["seasonal", "节日活动"],
    ["miniature", "微缩场景"]
  ],
  海报: [
    ["campaign", "商业活动"],
    ["typography", "概念字体"],
    ["movie", "电影/剧集"],
    ["travel", "城市旅行"],
    ["festival", "节气节日"]
  ],
  信息图: [
    ["flow", "流程说明"],
    ["comparison", "对比矩阵"],
    ["timeline", "时间线"],
    ["science", "科普图鉴"],
    ["product-board", "产品展示板"]
  ],
  品牌: [
    ["identity", "品牌身份板"],
    ["logo", "Logo 方向"],
    ["packaging", "包装应用"],
    ["social", "社媒模板"],
    ["app-icon", "App 图标"]
  ],
  UI: [
    ["mobile-app", "手机 App"],
    ["dashboard", "仪表盘"],
    ["landing", "落地页"],
    ["livestream", "直播界面"],
    ["commerce", "交易页面"]
  ],
  角色: [
    ["character-sheet", "角色设定表"],
    ["avatar", "头像"],
    ["mascot", "品牌吉祥物"],
    ["game", "游戏角色"],
    ["anime", "动漫角色"]
  ],
  摄影: [
    ["portrait", "人像摄影"],
    ["product", "产品摄影"],
    ["lifestyle", "生活方式"],
    ["documentary", "纪实街拍"],
    ["food", "食物摄影"]
  ],
  人像修图: [
    ["natural-retouch", "自然精修"],
    ["cinematic", "电影感重塑"],
    ["glam-beauty", "奢华美妆"],
    ["soft-film", "胶片黑雾"],
    ["idol-grid", "同脸九宫格"],
    ["outfit-transform", "棚拍换装"],
    ["vintage-restore", "旧照修复"],
    ["style-recreate", "照片风格复刻"],
    ["social-avatar", "社媒头像大片"],
    ["pro-id", "AI 证件照"],
    ["couple", "情侣写真"],
    ["guofeng", "古风写真"],
    ["age-shift", "年龄变换"],
    ["art-style", "艺术风格化"],
    ["body-reshape", "形象照修型"],
    ["pet", "宠物写真"],
    ["wedding", "婚纱写真"],
    ["child", "宝宝写真"],
    ["linkedin", "职业形象照"],
    ["bg-remove", "抠图去背景"],
    ["bg-replace", "换背景"],
    ["object-remove", "消除杂物"],
    ["sky-replace", "换天空"],
    ["hdr-restore", "HDR 修复"],
    ["scratch-fix", "划痕修复"]
  ],
  default: [
    ["creative", "创意画面"],
    ["commercial", "商业视觉"],
    ["editorial", "编辑视觉"],
    ["reference", "参考图工作流"]
  ]
};

const strategyVariantOptions = {
  广告: [
    ["premium", "高级商业"],
    ["energetic", "明亮高能"],
    ["streetwear", "街头编辑"],
    ["cinematic", "电影感"],
    ["playful", "趣味创意"]
  ],
  海报: [
    ["premium-editorial", "高级编辑"],
    ["bold-type", "强字体"],
    ["minimal", "极简留白"],
    ["cinematic", "电影海报"],
    ["retro", "复古印刷"]
  ],
  信息图: [
    ["clean-modular", "清晰模块"],
    ["apple-minimal", "Apple 式极简"],
    ["technical", "技术展示"],
    ["friendly-illustration", "友好插画"],
    ["data-dense", "数据密度高"]
  ],
  品牌: [
    ["warm-craft", "温暖手作"],
    ["premium-minimal", "高级极简"],
    ["tech-clean", "科技清爽"],
    ["playful", "年轻活泼"],
    ["heritage", "经典传承"]
  ],
  UI: [
    ["ios-light", "iOS 浅色"],
    ["dark-pro", "深色专业"],
    ["commerce-bright", "电商高转化"],
    ["calm-saas", "克制 SaaS"],
    ["social-native", "社媒原生"]
  ],
  角色: [
    ["realistic", "写实"],
    ["anime", "动漫"],
    ["stylized-3d", "3D 风格化"],
    ["cyberpunk", "赛博朋克"],
    ["soft-cute", "柔和可爱"]
  ],
  摄影: [
    ["35mm-documentary", "35mm 纪实"],
    ["cinematic-night", "电影夜景"],
    ["soft-daylight", "自然日光"],
    ["editorial", "编辑棚拍"],
    ["macro-detail", "微距细节"]
  ],
  人像修图: [
    ["natural-soft", "自然柔光"],
    ["cinematic-neon", "霓虹电影"],
    ["cinematic-day", "日间电影"],
    ["cinematic-rain", "雨天电影"],
    ["glam-studio", "高级棚拍"],
    ["glam-natural", "自然美妆"],
    ["soft-film", "日系胶片"],
    ["soft-portra", "Portra 400"],
    ["editorial-fashion", "时装编辑"],
    ["clean-business", "职业干净"],
    ["hanfu-classic", "汉服古典"],
    ["qipao-shanghai", "旗袍海派"],
    ["guochao-modern", "国潮混搭"],
    ["ink-wash", "水墨意境"],
    ["watercolor", "水彩风格"],
    ["oil-painting", "油画风格"],
    ["sketch", "素描风格"],
    ["pop-art", "波普艺术"],
    ["couple-cinematic", "电影感情侣"],
    ["couple-japanese", "日系情侣"],
    ["couple-korean", "韩式情侣"],
    ["wedding-classic", "经典婚纱"],
    ["wedding-chinese", "中式婚礼"],
    ["beach-sunset", "海边日落"],
    ["city-night", "都市夜景"],
    ["flower-sea", "花海"]
  ],
  default: [
    ["balanced", "均衡"],
    ["premium", "高级"],
    ["playful", "活泼"],
    ["minimal", "极简"]
  ]
};

const categoryStrategyDefaults = {
  电商: {
    scene: "hero-image",
    styleVariant: "luxury",
    category: "beauty",
    brandColors: "黑金、奶油白、品牌主色",
    features: "材质质感、核心功效、信任背书"
  },
  广告: {
    scene: "product-launch",
    styleVariant: "premium",
    category: "product-launch",
    brandColors: "品牌主色、强对比辅助色、干净留白",
    features: "主标题、核心利益点、转化动作"
  },
  海报: {
    scene: "campaign",
    styleVariant: "premium-editorial",
    category: "campaign",
    brandColors: "主色、辅助色、少量高亮色",
    features: "主标题、副标题、日期/地点等必要信息"
  },
  信息图: {
    scene: "flow",
    styleVariant: "clean-modular",
    category: "flow",
    brandColors: "浅灰白、科技蓝、薄荷绿",
    features: "3-5 个模块，每个模块一句短说明"
  },
  品牌: {
    scene: "identity",
    styleVariant: "premium-minimal",
    category: "identity",
    brandColors: "品牌主色、辅助色、背景中性色",
    features: "品牌关键词、应用触点、可复用视觉规则"
  },
  UI: {
    scene: "mobile-app",
    styleVariant: "ios-light",
    category: "mobile-app",
    brandColors: "界面主色、强调色、浅灰背景",
    features: "核心页面、关键组件、底部导航、可读中文 UI"
  },
  角色: {
    scene: "character-sheet",
    styleVariant: "realistic",
    category: "character-sheet",
    brandColors: "主色、辅助色、材质高光色",
    features: "身份、服装、道具、表情、三视图一致性"
  },
  摄影: {
    scene: "portrait",
    styleVariant: "35mm-documentary",
    category: "portrait",
    brandColors: "暖金、低饱和、自然肤色",
    features: "镜头、光线方向、环境线索、真实瑕疵"
  },
  人像修图: {
    scene: "natural-retouch",
    styleVariant: "natural-soft",
    category: "social-avatar",
    brandColors: "自然肤色、柔和暖光、低饱和米白",
    features: "保留本人五官和脸型，清理背景与杂乱元素，肤色更干净但保留真实皮肤纹理，不要过度磨皮。"
  },
  default: {
    scene: "creative",
    styleVariant: "balanced",
    category: "creative",
    brandColors: "主色、辅助色、背景色",
    features: "主体、风格、构图、必须保留的细节"
  }
};

const presetFormDefaults = {
  "ff-ecommerce-hero": {
    scene: "hero-image",
    styleVariant: "luxury",
    category: "beauty",
    brandColors: "黑金、奶油白、少量品牌主色",
    features: "核心功效、材质质感、适用人群、可信背书"
  },
  "ff-beauty-report": {
    scene: "infographic",
    category: "beauty",
    brandColors: "黑金、裸粉、奶油白",
    features: "肤色分析、妆效对比、3-5 个推荐色号、同一张脸保持一致"
  },
  "ev-luxury-perfume": {
    scene: "hero-image",
    styleVariant: "luxury",
    category: "beauty",
    brandColors: "黑色大理石、暖金高光、琥珀色",
    features: "瓶身玻璃质感、反射真实、奢华氛围、包装文字少而清楚"
  },
  "ev-skincare-studio": {
    scene: "hero-image",
    styleVariant: "fresh",
    category: "beauty",
    brandColors: "米白、淡黄色、柔和植物绿",
    features: "柔光棚拍、植物成分、泡沫水润感、标签清晰"
  },
  "ev-earbuds-infographic": {
    scene: "infographic",
    category: "electronics",
    brandColors: "科技蓝、浅灰白、少量黑色",
    features: "降噪、续航、佩戴舒适、防水、音质卖点"
  },
  "ev-motherboard-studio": {
    scene: "hero-image",
    styleVariant: "tech",
    category: "electronics",
    brandColors: "黑灰金属、冷蓝轮廓光",
    features: "接口细节、散热片材质、芯片结构、科技感克制"
  },
  "ff-commercial-poster": {
    scene: "campaign",
    styleVariant: "premium-editorial",
    category: "campaign",
    brandColors: "品牌主色、深色标题、少量高亮色",
    features: "主标题、副标题、核心活动信息、强视觉隐喻"
  },
  "ff-typography-poster": {
    scene: "typography",
    styleVariant: "bold-type",
    category: "typography",
    brandColors: "4-6 个克制色，主色明确",
    features: "标题必须可读，字体是主视觉，只保留少量必要文字"
  },
  "ff-infographic": {
    scene: "flow",
    styleVariant: "clean-modular",
    category: "flow",
    brandColors: "白底、浅灰、科技蓝",
    features: "标题区、3-5 个模块、短句中文、图标化提示"
  },
  "ff-science-poster": {
    scene: "science",
    styleVariant: "apple-minimal",
    category: "science",
    brandColors: "纯白、浅灰、少量主题色",
    features: "一个高清主体、底部四列信息、大量留白、科普感"
  },
  "ff-brand-identity": {
    scene: "identity",
    styleVariant: "premium-minimal",
    category: "identity",
    brandColors: "品牌主色、辅助色、背景中性色",
    features: "Logo 方向、字体方向、辅助图形、3-4 个应用触点"
  },
  "ff-photo-real": {
    scene: "lifestyle",
    styleVariant: "35mm-documentary",
    category: "lifestyle",
    brandColors: "暖金、低饱和、自然环境色",
    features: "镜头参数、自然瑕疵、光线方向、真实环境线索"
  },
  "ff-ui-interface": {
    scene: "mobile-app",
    styleVariant: "ios-light",
    category: "mobile-app",
    brandColors: "界面主色、强调色、浅灰背景",
    features: "顶部导航、内容卡片、底部 Tab、中文 UI 文案清晰"
  },
  "ff-character-sheet": {
    scene: "character-sheet",
    styleVariant: "realistic",
    category: "character-sheet",
    brandColors: "主色、辅助色、装备高光色",
    features: "正面/侧面/背面、3-5 个表情、服装材质标注、同一角色一致"
  },
  "ev-citrus-soda": {
    scene: "product-launch",
    styleVariant: "energetic",
    category: "food-drink",
    brandColors: "柠檬黄、橙色、冰蓝",
    features: "冰感水珠、柑橘飞溅、产品名可读、夏日高能"
  },
  "ev-fashion-campaign": {
    scene: "fashion-campaign",
    styleVariant: "streetwear",
    category: "fashion-campaign",
    brandColors: "黑白、深红、城市灰",
    features: "服装轮廓清楚、动作强、湿地反光、编辑大片构图"
  },
  "ev-industrial-board": {
    scene: "product-board",
    styleVariant: "technical",
    category: "science",
    brandColors: "中性灰、工业蓝、黑色文字",
    features: "主渲染、爆炸结构、材料说明、尺寸/使用图"
  },
  "ev-livestream-commerce": {
    scene: "livestream",
    styleVariant: "commerce-bright",
    category: "livestream",
    brandColors: "平台红、亮粉、白底",
    features: "主播区、商品卡、弹幕、价格徽标、限时 CTA"
  },
  "ev-landing-mockup": {
    scene: "landing",
    styleVariant: "calm-saas",
    category: "landing",
    brandColors: "品牌主色、深色文字、浅灰背景",
    features: "导航、产品首屏、价值主张、CTA、功能块"
  },
  "ev-miniature-diorama": {
    scene: "miniature",
    styleVariant: "playful",
    category: "social-commerce",
    brandColors: "奶油白、鲜橙、产品主色",
    features: "微缩人物、道具比例、产品主体清晰、创意场景"
  },
  "ev-portrait-natural-retouch": {
    scene: "natural-retouch",
    styleVariant: "natural-soft",
    category: "social-avatar",
    brandColors: "自然肤色、柔和暖光、干净米白",
    features: "保留本人五官和脸型，肤色更均匀，眼神更干净，背景简洁，保留真实皮肤纹理，不要过度磨皮。"
  },
  "ev-portrait-cinematic": {
    scene: "cinematic",
    styleVariant: "cinematic-neon",
    category: "photo-set",
    brandColors: "霓虹蓝、暗红、夜景暖光",
    features: "保留本人五官，增加夜晚街头电影感、霓虹侧光、浅景深和胶片颗粒，表情自然。"
  },
  "ev-portrait-glam-beauty": {
    scene: "glam-beauty",
    styleVariant: "glam-studio",
    category: "beauty-campaign",
    brandColors: "高级裸粉、象牙白、香槟金",
    features: "保留本人五官，妆面干净高级，发丝精致，棚拍柔光，适合口红/护肤广告，不改变身份。"
  },
  "ev-portrait-soft-film": {
    scene: "soft-film",
    styleVariant: "soft-film",
    category: "photo-set",
    brandColors: "日系米白、浅棕、柔和绿色",
    features: "保留本人五官，窗边柔光、黑雾高光、细腻颗粒、自然表情，整体像日系胶片写真。"
  },
  "ev-portrait-idol-grid": {
    scene: "idol-grid",
    styleVariant: "editorial-fashion",
    category: "photo-set",
    brandColors: "奶油白、浅灰、柔粉",
    features: "保持同一张脸一致，生成正脸、侧脸、回眸、坐姿、近景等九宫格写真，姿态变化但身份不变。"
  },
  "ev-portrait-outfit-transform": {
    scene: "outfit-transform",
    styleVariant: "editorial-fashion",
    category: "fashion-editorial",
    brandColors: "黑白灰、少量品牌强调色",
    features: "保留本人脸部身份，转换为高级棚拍造型，可选择西装、晚礼服、运动风或品牌大片，不改变体态比例。"
  },
  "ev-portrait-vintage-restore": {
    scene: "vintage-restore",
    styleVariant: "natural-soft",
    category: "restore-memory",
    brandColors: "自然肤色、旧照片暖棕、柔和米色",
    features: "修复划痕和褪色，提升清晰度，自然上色，保留旧照片年代感和人物真实身份。"
  },
  "ev-portrait-analyze-recreate": {
    scene: "style-recreate",
    styleVariant: "editorial-fashion",
    category: "style-reference",
    brandColors: "复刻参考图的主色、光线和背景色",
    features: "先分析参考图的镜头、光线、构图和影调，再用同样风格生成新头像，保留人物身份。"
  },
  "ev-portrait-social-avatar": {
    scene: "social-avatar",
    styleVariant: "clean-business",
    category: "social-avatar",
    brandColors: "干净浅灰、自然肤色、少量高级蓝",
    features: "保留本人五官，生成微信、小红书、LinkedIn 可用头像，背景干净，眼神清晰，职业但不僵硬。"
  },
  "portrait-pro-id": {
    scene: "pro-id",
    styleVariant: "natural-soft",
    category: "id-photo",
    brandColors: "纯白、浅蓝、浅灰",
    features: "白色背景、正装、正面免冠、光线均匀、符合证件照规范"
  },
  "portrait-couple": {
    scene: "couple",
    styleVariant: "couple-cinematic",
    category: "couple-shoot",
    brandColors: "暖金、霓虹蓝、城市灰",
    features: "保留两人身份，自然互动姿态，手指和手部不能变形，光影统一"
  },
  "portrait-guofeng": {
    scene: "guofeng",
    styleVariant: "hanfu-classic",
    category: "guofeng-shoot",
    brandColors: "朱红、鎏金、墨色、月白",
    features: "汉服形制正确、丝绸面料质感、古典园林或宫殿背景、灯笼暖光"
  },
  "portrait-age-shift": {
    scene: "age-shift",
    styleVariant: "natural-soft",
    category: "age-transform",
    brandColors: "自然肤色、柔和光线",
    features: "保留面部骨骼结构和标志性特征，衰老/年轻化符合解剖学，不要整容脸"
  },
  "portrait-art-style": {
    scene: "art-style",
    styleVariant: "oil-painting",
    category: "art-style",
    brandColors: "根据风格自动匹配",
    features: "水彩/油画/素描/波普艺术，身份必须可识别，介质质感要真实"
  },
  "portrait-body-reshape": {
    scene: "body-reshape",
    styleVariant: "natural-soft",
    category: "body-reshape",
    brandColors: "干净中性色",
    features: "轻微体态优化不超过8%，改善姿势和比例，像专业摄影师拍出来的效果"
  },
  "portrait-pet": {
    scene: "pet",
    styleVariant: "natural-soft",
    category: "pet-portrait",
    brandColors: "柔和暖色、纯色背景",
    features: "品种特征准确、毛发纹理精细、眼睛有神有锐度、自然姿态"
  },
  "portrait-wedding": {
    scene: "wedding",
    styleVariant: "wedding-classic",
    category: "wedding-shoot",
    brandColors: "象牙白、香槟金、玫瑰粉",
    features: "服装细节精致、浪漫柔光、不要影楼过度PS感、保留本人身份"
  },
  "portrait-child": {
    scene: "child",
    styleVariant: "natural-soft",
    category: "child-shoot",
    brandColors: "柔和粉彩、奶油白、淡蓝",
    features: "保留宝宝真实特征、不要成人化修图、表情自然真实、道具安全"
  },
  "portrait-linkedin": {
    scene: "linkedin",
    styleVariant: "clean-business",
    category: "pro-headshot",
    brandColors: "深灰、浅灰、白色",
    features: "商务正装、干净背景、专业光线、自信但不死板、适合简历和职场"
  },
  "retouch-bg-remove": {
    scene: "bg-remove",
    styleVariant: "natural-soft",
    category: "bg-remove",
    brandColors: "透明背景",
    features: "精确抠出主体、发丝边缘精细、输出透明背景 PNG、不要白边"
  },
  "retouch-bg-replace": {
    scene: "bg-replace",
    styleVariant: "beach-sunset",
    category: "bg-replace",
    brandColors: "根据目标场景自动匹配",
    features: "海边日落、都市夜景、办公室、花海，主体光线匹配新背景"
  },
  "retouch-object-remove": {
    scene: "object-remove",
    styleVariant: "natural-soft",
    category: "object-remove",
    brandColors: "保持原图",
    features: "背景路人、杂物、电线、垃圾桶，前景主体完全不动"
  },
  "retouch-sky-replace": {
    scene: "sky-replace",
    styleVariant: "natural-soft",
    category: "sky-replace",
    brandColors: "根据天空场景自动匹配",
    features: "晴空、晚霞、乌云、星空，地平线无接缝，前景光线匹配"
  },
  "retouch-hdr-restore": {
    scene: "hdr-restore",
    styleVariant: "natural-soft",
    category: "hdr-restore",
    brandColors: "保持原图",
    features: "修复过曝/欠曝、恢复细节和动态范围、不要HDR过度感"
  },
  "retouch-scratch-fix": {
    scene: "scratch-fix",
    styleVariant: "natural-soft",
    category: "scratch-fix",
    brandColors: "保持原图",
    features: "修复划痕、折痕、水渍、霉斑、保留原始颗粒和年代感"
  }
};

const categoryPriority = ["人像修图", "电商", "广告", "海报", "信息图", "摄影", "品牌", "UI", "角色"];

function orderedCategories(categories = []) {
  const priority = new Map(categoryPriority.map((category, index) => [category, index]));
  return [...categories].sort((a, b) => {
    const rankA = priority.has(a) ? priority.get(a) : categoryPriority.length;
    const rankB = priority.has(b) ? priority.get(b) : categoryPriority.length;
    return rankA - rankB || String(a).localeCompare(String(b), "zh-CN");
  });
}

function orderedPresets(presets = []) {
  const priority = new Map(categoryPriority.map((category, index) => [category, index]));
  return presets
    .map((preset, index) => ({ preset, index }))
    .sort((a, b) => {
      const rankA = priority.has(a.preset.category) ? priority.get(a.preset.category) : categoryPriority.length;
      const rankB = priority.has(b.preset.category) ? priority.get(b.preset.category) : categoryPriority.length;
      return rankA - rankB || a.index - b.index;
    })
    .map(({ preset }) => preset);
}

function presetProfile(preset = selectedPreset()) {
  const category = preset?.category || "";
  if (category === "电商") return strategyProfiles.电商;
  return strategyProfiles[category] || strategyProfiles.default;
}

function strategyKey(profile) {
  return Object.entries(strategyProfiles).find(([, value]) => value === profile)?.[0] || "default";
}

function setSelectOptions(select, options, preferred = "") {
  const previous = select.value;
  select.innerHTML = "";
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  const values = options.map(([value]) => value);
  const next = values.includes(preferred) ? preferred : values.includes(previous) ? previous : values[0] || "";
  select.value = next;
}

function presetDefaults(preset) {
  const category = preset?.category || "default";
  const base = categoryStrategyDefaults[category] || categoryStrategyDefaults.default;
  const specific = presetFormDefaults[preset?.id] || {};
  const defaults = { ...base, ...specific };
  if (category === "电商") {
    defaults.scene = specific.scene || preset?.templateId || base.scene;
    defaults.styleVariant = specific.styleVariant || preset?.variant || base.styleVariant;
  }
  return defaults;
}

function renderCategoryOptions(profile, preferred = "") {
  const key = strategyKey(profile);
  const options = strategyCategoryOptions[key] || strategyCategoryOptions.default;
  setSelectOptions(els.categorySelect, options, preferred);
}

function renderStrategySelects(profile, defaults = {}) {
  const key = strategyKey(profile);
  els.sceneField.hidden = false;
  els.variantField.hidden = false;
  els.categoryField.hidden = false;

  if (key === "电商") {
    renderTemplates(defaults.scene, defaults.styleVariant);
  } else {
    setSelectOptions(els.sceneSelect, strategySceneOptions[key] || strategySceneOptions.default, defaults.scene);
    setSelectOptions(
      els.variantSelect,
      strategyVariantOptions[key] || strategyVariantOptions.default,
      defaults.styleVariant
    );
  }

  renderCategoryOptions(profile, defaults.category);
}

function applyStrategyProfile(defaults = {}) {
  const preset = selectedPreset();
  const profile = presetProfile(preset);
  els.strategyKind.textContent = profile.kind;
  els.strategyTitle.textContent = profile.title;
  els.strategySubtitle.textContent = profile.subtitle;
  els.productLabel.textContent = profile.product;
  els.productInput.placeholder = profile.productPlaceholder;
  els.imagePrompt.placeholder = profile.promptPlaceholder;
  els.sceneLabel.textContent = profile.scene;
  els.variantLabel.textContent = profile.variant;
  els.categoryLabel.textContent = profile.category;
  els.brandColorsLabel.textContent = profile.brand;
  els.brandColors.placeholder = profile.brandPlaceholder;
  els.featureLabel.textContent = profile.feature;
  els.featureInput.placeholder = profile.featurePlaceholder;
  renderStrategySelects(profile, defaults);
}

function switchPage(pageId, title) {
  state.currentPage = pageId;
  els.pages.forEach((page) => page.classList.toggle("is-active", page.id === pageId));
  els.tabButtons.forEach((button) => {
    const active = button.dataset.page === pageId;
    button.classList.toggle("is-active", active);
    if (active) els.pageTitle.textContent = title || button.dataset.title || "Image Forge";
  });
  if (pageId === "historyPage" && !state.loaded.history) {
    loadHistory().catch((error) => showToast(error.message || "历史读取失败。"));
  }
  if (pageId === "tasksPage" && !state.loaded.jobs) {
    loadJobs().catch((error) => showToast(error.message || "任务读取失败。"));
  }
  if (pageId === "presetsPage" && !state.loaded.presets) {
    loadPresets().catch((error) => showToast(error.message || "预设读取失败。"));
  }
  if (pageId === "settingsPage") {
    loadSettings().catch((error) => showToast(error.message || "设置读取失败。"));
  }
}

function authHeaders() {
  const token = localStorage.getItem("imageForgeToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  if (response.status === 401) { showAuthScreen(); throw new Error("请先登录。"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

async function getJson(url) {
  const response = await fetch(url, { headers: authHeaders() });
  if (response.status === 401) { showAuthScreen(); throw new Error("请先登录。"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

async function deleteJson(url) {
  const response = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (response.status === 401) { showAuthScreen(); throw new Error("请先登录。"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

/* ── Auth ─────────────────────────────────────────── */

function showAuthScreen() {
  els.authOverlay.hidden = false;
}

function hideAuthScreen() {
  els.authOverlay.hidden = true;
}

async function checkAuth() {
  try {
    const data = await fetch("/api/auth/check").then((r) => r.json()).catch(() => ({}));
    if (!data.authRequired) return true;
    const token = localStorage.getItem("imageForgeToken");
    if (!token) { showAuthScreen(); return false; }
    await getJson("/api/status");
    return true;
  } catch {
    showAuthScreen();
    return false;
  }
}

/* ── Lightbox ─────────────────────────────────────── */

function openLightbox(images, startIndex = 0) {
  state.lightbox.images = images;
  state.lightbox.currentIndex = startIndex;
  state.lightbox.isOpen = true;
  updateLightboxImage();
  els.lightbox.hidden = false;
  requestAnimationFrame(() => els.lightbox.classList.add("is-open"));
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  state.lightbox.isOpen = false;
  els.lightbox.classList.remove("is-open");
  document.body.style.overflow = "";
  setTimeout(() => { els.lightbox.hidden = true; }, 200);
}

function updateLightboxImage() {
  const { images, currentIndex } = state.lightbox;
  const image = images[currentIndex];
  if (!image) return;
  els.lightboxImage.src = image.src;
  els.lightboxCounter.textContent = `${currentIndex + 1}/${images.length}`;
  els.lightboxPrev.hidden = currentIndex <= 0;
  els.lightboxNext.hidden = currentIndex >= images.length - 1;
}

function lightboxPrev() {
  if (state.lightbox.currentIndex > 0) {
    state.lightbox.currentIndex--;
    updateLightboxImage();
  }
}

function lightboxNext() {
  if (state.lightbox.currentIndex < state.lightbox.images.length - 1) {
    state.lightbox.currentIndex++;
    updateLightboxImage();
  }
}

/* ── Download ─────────────────────────────────────── */

async function downloadImage(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename || "image.png";
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank");
  }
}

/* ── Use as Reference ─────────────────────────────── */

async function useAsReference(imageSrc) {
  try {
    showToast("正在加载参考图...");
    const response = await fetch(imageSrc);
    const blob = await response.blob();
    const file = new File([blob], "reference.png", { type: blob.type || "image/png" });
    const prepared = await fileToDataUrl(file);
    state.referenceImage = { dataUrl: prepared.dataUrl, name: prepared.name, type: prepared.type };
    els.referenceLabel.textContent = "来自历史图库";
    els.referencePreview.innerHTML = "";
    const img = document.createElement("img");
    img.src = prepared.dataUrl;
    img.alt = "参考图";
    els.referencePreview.append(img);
    switchPage("createPage", "创作");
    showToast("已设为参考图。");
  } catch (error) {
    showToast(error.message || "参考图加载失败。");
  }
}

/* ── History Filter ───────────────────────────────── */

function filterHistory(items) {
  const query = normalizeSearch(state.historySearch);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 6 * 86400000;

  return items.filter((item) => {
    if (state.historyFilter === "ref" && item.mode !== "reference") return false;
    if (state.historyFilter === "text" && item.mode === "reference") return false;
    const itemTime = new Date(item.completedAt || item.updatedAt).getTime();
    if (state.historyFilter === "today" && itemTime < todayStart) return false;
    if (state.historyFilter === "week" && itemTime < weekStart) return false;
    if (query) {
      const terms = query.split(" ").filter(Boolean);
      const haystack = normalizeSearch([item.prompt, item.preset?.title, item.template?.name, item.template?.id, item.category, item.variant].join(" "));
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
}

function renderFilteredHistory() {
  const filtered = filterHistory(state.allHistory);
  els.historyCount.textContent = String(filtered.length);
  renderHistory(filtered);
}

/* ── Custom Presets ───────────────────────────────── */

function openPresetModal(preset = null) {
  els.presetEditId.value = preset?.id || "";
  els.presetModalTitle.textContent = preset ? "编辑预设" : "新建预设";
  els.presetFormTitle.value = preset?.title || "";
  els.presetFormCategory.value = preset?.category || "";
  els.presetFormPrompt.value = preset?.prompt || "";
  els.presetFormExample.value = preset?.example || "";
  els.presetFormTags.value = (preset?.tags || []).join(", ");
  els.presetFormTemplateId.value = preset?.templateId || "";
  els.presetFormRatio.value = preset?.ratio || "";
  els.presetFormRequiresRef.checked = Boolean(preset?.requiresReference);
  els.presetModal.hidden = false;
}

function closePresetModal() {
  els.presetModal.hidden = true;
}

async function saveCustomPreset(event) {
  event.preventDefault();
  const id = els.presetEditId.value;
  const body = {
    title: els.presetFormTitle.value.trim(),
    category: els.presetFormCategory.value.trim() || "自定义",
    prompt: els.presetFormPrompt.value.trim(),
    example: els.presetFormExample.value.trim(),
    tags: els.presetFormTags.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
    templateId: els.presetFormTemplateId.value.trim(),
    ratio: els.presetFormRatio.value,
    requiresReference: els.presetFormRequiresRef.checked
  };
  if (!body.title) { showToast("请输入预设标题。"); return; }
  try {
    if (id) {
      await fetch(`/api/presets/custom/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(body)
      });
      showToast("预设已更新。");
    } else {
      await postJson("/api/presets/custom", body);
      showToast("预设已创建。");
    }
    closePresetModal();
    state.loaded.presets = false;
    await loadPresets();
  } catch (error) {
    showToast(error.message || "保存失败。");
  }
}

async function deleteCustomPreset(id) {
  if (!window.confirm("删除这个自定义预设？")) return;
  try {
    await deleteJson(`/api/presets/custom/${encodeURIComponent(id)}`);
    showToast("预设已删除。");
    state.loaded.presets = false;
    await loadPresets();
  } catch (error) {
    showToast(error.message || "删除失败。");
  }
}

/* ── Batch Operations ─────────────────────────────── */

function enterBatchMode(page) {
  state.batchMode = true;
  state.batchPage = page;
  state.batchSelected.clear();
  els.batchBar.hidden = false;
  updateBatchCount();
  if (page === "history") renderFilteredHistory();
  else renderTasks();
}

function exitBatchMode() {
  const page = state.batchPage;
  state.batchMode = false;
  state.batchPage = "";
  state.batchSelected.clear();
  els.batchBar.hidden = true;
  if (page === "history") renderFilteredHistory();
  else renderTasks();
}

function updateBatchCount() {
  els.batchCount.textContent = `已选 ${state.batchSelected.size} 项`;
  els.batchDelete.disabled = state.batchSelected.size === 0;
  els.batchDownload.disabled = state.batchSelected.size === 0;
}

function toggleBatchItem(id) {
  if (state.batchSelected.has(id)) state.batchSelected.delete(id);
  else state.batchSelected.add(id);
  updateBatchCount();
  const card = document.querySelector(`[data-batch-id="${id}"]`);
  if (card) card.classList.toggle("is-batch-selected", state.batchSelected.has(id));
  const checkbox = document.querySelector(`[data-batch-checkbox="${id}"]`);
  if (checkbox) checkbox.checked = state.batchSelected.has(id);
}

function selectAllBatch() {
  const items = state.batchPage === "history"
    ? filterHistory(state.allHistory)
    : [...state.tasks.values()];
  const allSelected = items.every((item) => state.batchSelected.has(item.id));
  if (allSelected) state.batchSelected.clear();
  else items.forEach((item) => state.batchSelected.add(item.id));
  updateBatchCount();
  if (state.batchPage === "history") renderFilteredHistory();
  else renderTasks();
}

async function batchDelete() {
  const ids = [...state.batchSelected];
  if (!ids.length) return;
  if (!window.confirm(`确定删除 ${ids.length} 项？`)) return;
  let successCount = 0;
  for (const id of ids) {
    try {
      if (state.batchPage === "history") {
        await deleteJson(`/api/history/${encodeURIComponent(id)}`);
      } else {
        await deleteJson(`/api/jobs/${encodeURIComponent(id)}`);
        state.deletedTaskIds.add(id);
        state.tasks.delete(id);
        stopPolling(id);
      }
      successCount++;
    } catch { /* continue */ }
  }
  showToast(`已删除 ${successCount} 项。`);
  state.batchSelected.clear();
  updateBatchCount();
  if (state.batchPage === "history") {
    state.loaded.history = false;
    await loadHistory();
  } else {
    renderTasks();
  }
}

async function batchDownload() {
  const ids = [...state.batchSelected];
  if (!ids.length) return;
  const items = state.batchPage === "history"
    ? state.allHistory.filter((h) => ids.includes(h.id))
    : [...state.tasks.values()].filter((t) => ids.includes(t.id));
  let count = 0;
  for (const item of items) {
    for (const image of (item.images || [])) {
      const filename = image.src.split("/").pop() || `image-${count + 1}.png`;
      await downloadImage(image.src, filename);
      count++;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  showToast(`已下载 ${count} 张图片。`);
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("参考图读取失败。"));
    });
    image.src = url;
  });
}

async function fileToDataUrl(file) {
  const fallback = async () => ({
    dataUrl: await blobToDataUrl(file),
    name: file.name,
    type: file.type,
    size: file.size,
    originalSize: file.size,
    compressed: false
  });

  if (!file.type.startsWith("image/")) return fallback();

  try {
    const image = await loadImageFile(file);
    const maxSide = 1600;
    const side = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
    if (side <= maxSide && file.size <= 1800000) {
      return {
        ...(await fallback()),
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height
      };
    }

    const scale = Math.min(1, maxSide / side);
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) return fallback();

    const basename = file.name.replace(/\.[^.]+$/, "") || "reference";
    return {
      dataUrl: await blobToDataUrl(blob),
      name: `${basename}-compressed.jpg`,
      type: "image/jpeg",
      size: blob.size,
      originalSize: file.size,
      width,
      height,
      compressed: true
    };
  } catch {
    return fallback();
  }
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function statusText(status) {
  return {
    queued: "排队中",
    running: "生成中",
    completed: "已完成",
    failed: "失败"
  }[status] || status;
}

function selectedOptionText(select) {
  return select.selectedOptions?.[0]?.textContent || "";
}

function renderImages(images = []) {
  if (!images.length) return '<div class="image-placeholder">等待图片返回</div>';
  return images
    .map(
      (image) => `
        <div class="result-tile" data-image-src="${escapeHtml(image.src)}" data-image-index="${escapeHtml(image.index)}">
          <img src="${escapeHtml(image.src)}" alt="生成结果 ${escapeHtml(image.index)}" loading="lazy" />
          <span>#${escapeHtml(image.index)}</span>
          <a class="download-btn" href="${escapeHtml(image.src)}" download="${escapeHtml(image.src.split("/").pop() || "image.png")}" title="下载">↓</a>
          <button class="use-ref-button" data-ref-src="${escapeHtml(image.src)}" type="button">用作参考</button>
        </div>
      `
    )
    .join("");
}

function renderStrategy(item) {
  const parts = [
    item.template?.name || item.template?.id,
    item.preset?.title ? `预设 ${item.preset.title}` : "",
    item.variant ? `变体 ${item.variant}` : "",
    item.category ? `品类 ${item.category}` : ""
  ].filter(Boolean);
  if (!parts.length) return "";
  return `<div class="strategy-row">${parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("")}</div>`;
}

function renderWarnings(item) {
  const warnings = item.warnings || [];
  if (!warnings.length) return "";
  return `<div class="warning-row">${warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}</div>`;
}

function copyPrompt(text) {
  const prompt = String(text || "");
  if (navigator.clipboard) {
    navigator.clipboard.writeText(prompt).then(() => showToast("提示词已复制。")).catch(() => fallbackCopy(prompt));
  } else {
    fallbackCopy(prompt);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.append(ta);
  ta.select();
  try { document.execCommand("copy"); showToast("提示词已复制。"); }
  catch { showToast("复制失败，请手动复制。"); }
  ta.remove();
}

function retryJob(task) {
  els.imagePrompt.value = task.prompt || "";
  if (task.ratio) els.imageRatio.value = task.ratio;
  if (task.count) els.imageCount.value = String(task.count);
  if (task.preset?.id) state.selectedPresetId = task.preset.id;
  renderSelectedPreset(task.preset?.id ? presetDefaults(task.preset) : {});
  switchPage("createPage", "创作");
  showToast("已恢复任务参数，请重新提交。");
}

function renderTasks() {
  const tasks = [...state.tasks.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  els.queueCount.textContent = String(tasks.length);
  if (!tasks.length) {
    els.taskList.innerHTML = '<p class="empty-copy">后台生成任务会显示在这里。</p>';
    return;
  }

  els.taskList.innerHTML = tasks
    .map(
      (task) => `
        <article class="task-card ${task.status} ${state.batchMode && state.batchSelected.has(task.id) ? "is-batch-selected" : ""}" data-batch-id="${escapeHtml(task.id)}">
          ${state.batchMode ? `<input type="checkbox" class="batch-select-checkbox" data-batch-checkbox="${escapeHtml(task.id)}" ${state.batchSelected.has(task.id) ? "checked" : ""} />` : ""}
          <div class="card-top">
            <div class="task-meta">
              <strong>${statusText(task.status)}</strong>
              <span>${task.count} 张 · ${task.ratio} · ${task.mode === "reference" ? "参考图" : "文生图"}</span>
            </div>
            ${state.batchMode ? "" : `<button class="danger-button" data-delete-task="${escapeHtml(task.id)}" type="button" aria-label="删除任务">删除</button>`}
          </div>
          ${renderStrategy(task)}
          <p>${escapeHtml(task.prompt)}</p>
          ${task.statusNote ? `<p class="status-copy">${escapeHtml(task.statusNote)}</p>` : ""}
          <div class="progress"><i style="width:${task.progress || 0}%"></i></div>
          ${task.error ? `<p class="error-copy">${escapeHtml(task.error)}</p>` : ""}
          ${renderWarnings(task)}
          ${state.batchMode ? "" : `<div class="card-actions"><button class="mini-button" data-copy-prompt="${escapeHtml(task.prompt)}" type="button">复制提示词</button>${task.status === "failed" ? `<button class="mini-button" data-retry-task="${escapeHtml(task.id)}" type="button">重试</button>` : ""}</div>`}
          <div class="result-grid">${renderImages(task.images)}</div>
        </article>
      `
    )
    .join("");
}

function renderHistory(items = []) {
  if (!items.length) {
    els.historyList.innerHTML = '<p class="empty-copy">生成完成后会自动保存在历史里。</p>';
    return;
  }

  els.historyList.innerHTML = items
    .map(
      (item) => `
        <article class="history-card ${state.batchMode && state.batchSelected.has(item.id) ? "is-batch-selected" : ""}" data-batch-id="${escapeHtml(item.id)}">
          ${state.batchMode ? `<input type="checkbox" class="batch-select-checkbox" data-batch-checkbox="${escapeHtml(item.id)}" ${state.batchSelected.has(item.id) ? "checked" : ""} />` : ""}
          <div class="card-top">
            <div class="history-head">
              <strong>${item.ratio} · ${item.count} 张</strong>
              <span>${formatTime(item.completedAt || item.updatedAt)}</span>
            </div>
            ${state.batchMode ? "" : `<button class="danger-button" data-delete-history="${escapeHtml(item.id)}" type="button" aria-label="删除历史记录">删除</button>`}
          </div>
          ${renderStrategy(item)}
          <p>${escapeHtml(item.prompt)}</p>
          ${item.error ? `<p class="error-copy">${escapeHtml(item.error)}</p>` : ""}
          ${renderWarnings(item)}
          ${state.batchMode ? "" : `<div class="card-actions"><button class="mini-button" data-copy-prompt="${escapeHtml(item.prompt)}" type="button">复制提示词</button>${item.error ? `<button class="mini-button" data-retry-history="${escapeHtml(item.id)}" type="button">重试</button>` : ""}</div>`}
          <div class="result-grid">${renderImages(item.images)}</div>
        </article>
      `
    )
    .join("");
}

async function loadStatus() {
  const data = await getJson("/api/status");
  state.status = data;
  els.modelBadge.textContent = data.model || "gpt-image-2";
}

async function loadHistory() {
  const data = await getJson("/api/history");
  state.loaded.history = true;
  state.allHistory = data.history || [];
  renderFilteredHistory();
}

function isActiveJob(job) {
  return job?.status === "queued" || job?.status === "running";
}

async function loadJobs() {
  const data = await getJson("/api/jobs");
  state.loaded.jobs = true;
  const jobs = (data.jobs || []).filter((job) => !state.deletedTaskIds.has(job.id));
  state.tasks = new Map(jobs.map((job) => [job.id, job]));
  renderTasks();
  jobs.filter(isActiveJob).forEach((job) => startPolling(job.id));
}

function renderTemplates(preferredScene = "", preferredVariant = "") {
  const options = [["", "自动匹配"], ...state.templates.map((template) => [template.id, template.name])];
  setSelectOptions(els.sceneSelect, options, preferredScene);
  renderVariants(preferredVariant);
}

function renderVariants(preferred = "") {
  const selected = state.templates.find((template) => template.id === els.sceneSelect.value);
  const options = [
    ["", "默认"],
    ...(selected?.variants || []).map((variant) => [variant.id, variant.description || variant.id])
  ];
  setSelectOptions(els.variantSelect, options, preferred);
}

async function loadTemplates() {
  const data = await getJson("/api/templates");
  state.templates = data.templates || [];
  state.loaded.templates = true;
  const preset = selectedPreset();
  applyStrategyProfile(preset ? presetDefaults(preset) : {});
}

function selectedPreset() {
  return state.presets.find((preset) => preset.id === state.selectedPresetId) || null;
}

function renderSelectedPreset(defaults = {}) {
  const preset = selectedPreset();
  if (!preset) {
    els.selectedPreset.innerHTML = `
      <strong>自动策略</strong>
      <p>根据画面需求自动匹配场景与结构。</p>
    `;
    applyStrategyProfile();
    return;
  }

  els.selectedPreset.innerHTML = `
    <div>
      <strong>${escapeHtml(preset.title)}</strong>
      <p>${preset.requiresReference ? "建议上传参考图 · " : ""}${escapeHtml(preset.example || preset.prompt)}</p>
    </div>
    <button class="mini-button" id="clearPresetButton" type="button">清除</button>
  `;
  document.querySelector("#clearPresetButton")?.addEventListener("click", () => {
    state.selectedPresetId = "";
    renderSelectedPreset();
    renderPresetList();
  });
  applyStrategyProfile(defaults);
}

function categoryLabel(category) {
  return category === "全部" ? "全部" : category;
}

function renderPresetFilters() {
  const categories = ["全部", ...state.presetCategories];
  els.presetFilters.innerHTML = categories
    .map(
      (category) => `
        <button class="filter-chip ${state.presetCategory === category ? "is-active" : ""}" data-category="${escapeHtml(
          category
        )}" type="button">${escapeHtml(categoryLabel(category))}</button>
      `
    )
    .join("");

  els.presetFilters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.presetCategory = button.dataset.category;
      renderPresetFilters();
      renderPresetList();
    });
  });
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function presetMatchesSearch(preset, query) {
  if (!query) return true;
  const terms = query.split(" ").filter(Boolean);
  const haystack = normalizeSearch(
    [
      preset.title,
      preset.category,
      preset.source,
      preset.example,
      preset.prompt,
      preset.templateId,
      preset.variant,
      ...(preset.tags || []),
      ...(preset.guardrails || [])
    ].join(" ")
  );
  return terms.every((term) => haystack.includes(term));
}

function renderPresetList() {
  const query = normalizeSearch(state.presetSearch);
  const presets = state.presets.filter((preset) => {
    const categoryMatch = state.presetCategory === "全部" || preset.category === state.presetCategory;
    return categoryMatch && presetMatchesSearch(preset, query);
  });
  els.presetCount.textContent = String(presets.length);
  if (!presets.length) {
    els.presetList.innerHTML = `<p class="empty-copy">${query ? "没有匹配的灵感。试试“电商”“人像”“海报”“信息图”。" : "没有匹配的预设。"}</p>`;
    return;
  }

  els.presetList.innerHTML = presets
    .map(
      (preset) => `
        <article class="preset-card ${preset.id === state.selectedPresetId ? "is-selected" : ""}">
          <div class="preset-head">
            <div>
              <span>${escapeHtml(preset.category)}</span>
              <strong>${escapeHtml(preset.title)}</strong>
            </div>
            <em>${preset.requiresReference ? "需参考图" : preset.source === "custom" ? "自定义" : escapeHtml(preset.source)}</em>
          </div>
          <p>${escapeHtml(preset.example || preset.prompt)}</p>
          <div class="tag-row">${[
            ...(preset.requiresReference ? ["参考图"] : []),
            ...(preset.tags || [])
          ]
            .map((tag) => `<span>${escapeHtml(tag)}</span>`)
            .join("")}</div>
          <button class="ghost-button apply-preset" data-preset="${escapeHtml(preset.id)}" type="button">套用</button>
          ${preset.source === "custom" ? `
            <div class="preset-actions">
              <button class="mini-button" data-edit-preset="${escapeHtml(preset.id)}" type="button">编辑</button>
              <button class="mini-button" data-delete-preset="${escapeHtml(preset.id)}" type="button" style="color:var(--danger)">删除</button>
            </div>
          ` : ""}
        </article>
      `
    )
    .join("");

  els.presetList.querySelectorAll(".apply-preset").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset, true));
  });
}

async function loadPresets() {
  const data = await getJson("/api/presets");
  state.presets = orderedPresets(data.presets || []);
  state.presetCategories = orderedCategories(data.categories || []);
  state.loaded.presets = true;
  renderPresetFilters();
  renderPresetList();
  renderSelectedPreset();
}

function applyPreset(id, switchToCreate = false) {
  const preset = state.presets.find((item) => item.id === id);
  if (!preset) return;
  const defaults = presetDefaults(preset);
  state.selectedPresetId = preset.id;
  if (!els.imagePrompt.value.trim() && preset.example) {
    els.imagePrompt.value = preset.example;
  }
  if (preset.ratio) {
    els.imageRatio.value = preset.ratio;
  }
  if (defaults.brandColors) {
    els.brandColors.value = defaults.brandColors;
  }
  if (defaults.features) {
    els.featureInput.value = defaults.features;
  }
  renderSelectedPreset(defaults);
  renderPresetList();
  if (switchToCreate) switchPage("createPage", "创作");
  showToast(preset.requiresReference ? `已套用：${preset.title}，建议上传参考图。` : `已套用：${preset.title}`);
}

function stopPolling(id) {
  const timer = state.pollers.get(id);
  if (timer) window.clearInterval(timer);
  state.pollers.delete(id);
}

async function pollJob(id) {
  try {
    const data = await getJson(`/api/jobs/${id}`);
    if (state.deletedTaskIds.has(id)) return;
    state.tasks.set(id, data.job);
    renderTasks();
    if (data.job.status === "completed" || data.job.status === "failed") {
      stopPolling(id);
      await loadHistory();
    }
  } catch (error) {
    stopPolling(id);
    showToast(error.message || "任务状态读取失败。");
  }
}

function startPolling(id) {
  stopPolling(id);
  pollJob(id);
  state.pollers.set(id, window.setInterval(() => pollJob(id), 1800));
}

async function deleteTask(id, button) {
  if (!id || !window.confirm("删除这个任务？正在生成的任务会从本地列表移除。")) return;
  state.deletedTaskIds.add(id);
  stopPolling(id);
  if (button) button.disabled = true;
  try {
    await deleteJson(`/api/jobs/${encodeURIComponent(id)}`);
    state.tasks.delete(id);
    renderTasks();
    loadStatus().catch(() => {});
    showToast("任务已删除。");
  } catch (error) {
    state.deletedTaskIds.delete(id);
    if (button) button.disabled = false;
    showToast(error.message || "任务删除失败。");
  }
}

async function deleteHistoryItem(id, button) {
  if (!id || !window.confirm("删除这条历史记录？已生成的图片文件会保留在本机。")) return;
  if (button) button.disabled = true;
  try {
    await deleteJson(`/api/history/${encodeURIComponent(id)}`);
    await loadHistory();
    loadStatus().catch(() => {});
    showToast("历史记录已删除。");
  } catch (error) {
    if (button) button.disabled = false;
    showToast(error.message || "历史记录删除失败。");
  }
}

async function handleReferenceChange() {
  const file = els.referenceImage.files?.[0];
  if (!file) {
    state.referenceImage = null;
    els.referenceLabel.textContent = "添加参考图";
    els.referencePreview.innerHTML = "<p>未添加参考图</p>";
    return;
  }

  const prepared = await fileToDataUrl(file);
  state.referenceImage = {
    dataUrl: prepared.dataUrl,
    name: prepared.name,
    type: prepared.type
  };

  els.referenceLabel.textContent = prepared.compressed ? `${file.name} · 已压缩` : file.name;
  els.referencePreview.innerHTML = "";
  const img = document.createElement("img");
  img.src = prepared.dataUrl;
  img.alt = "参考图";
  els.referencePreview.append(img);
  if (prepared.compressed) {
    const note = document.createElement("p");
    note.textContent = `${Math.round(prepared.originalSize / 1024)}KB -> ${Math.round(prepared.size / 1024)}KB`;
    els.referencePreview.append(note);
  }
}

async function submitGeneration(event) {
  event.preventDefault();
  const prompt = els.imagePrompt.value.trim();
  if (!prompt) {
    showToast("先写提示词。");
    return;
  }
  const preset = selectedPreset();
  if (preset?.requiresReference && !state.referenceImage?.dataUrl) {
    showToast("这个人像修图预设需要先上传参考图。");
    return;
  }

  els.imageButton.disabled = true;
  els.imageButton.textContent = "已加入后台";

  try {
    const data = await postJson("/api/generate", {
      prompt,
      product: els.productInput.value.trim(),
      features: els.featureInput.value.trim(),
      scene: els.sceneSelect.value,
      styleVariant: els.variantSelect.value,
      category: els.categorySelect.value,
      brandColors: els.brandColors.value.trim(),
      strategyKind: els.strategyKind.textContent,
      strategyType: selectedOptionText(els.sceneSelect),
      strategyTone: selectedOptionText(els.variantSelect),
      strategyUse: selectedOptionText(els.categorySelect),
      presetId: state.selectedPresetId,
      count: Number(els.imageCount.value || 1),
      ratio: els.imageRatio.value,
      referenceImage: state.referenceImage
    });
    state.tasks.set(data.job.id, data.job);
    renderTasks();
    startPolling(data.job.id);
    state.referenceImage = null;
    els.referenceImage.value = "";
    els.referenceLabel.textContent = "添加参考图";
    els.referencePreview.innerHTML = "<p>未添加参考图</p>";
    clearFormDraft();
    switchPage("tasksPage", "任务");
    showToast("任务已开始生成。");
  } catch (error) {
    showToast(error.message || "提交失败。");
  } finally {
    els.imageButton.disabled = false;
    els.imageButton.textContent = "开始生成";
  }
}

async function loadSettings() {
  const data = await getJson("/api/settings");
  const s = data.settings || {};
  els.settingApiBaseUrl.value = s.apiBaseUrl || "";
  // Don't overwrite with redacted key
  if (s.apiKey && /^\*{3}/.test(s.apiKey)) {
    els.settingApiKey.placeholder = s.apiKey;
    els.settingApiKey.value = "";
  } else {
    els.settingApiKey.value = s.apiKey || "";
  }
  els.settingImageModel.value = s.imageModel || "";
  els.settingRequestTimeout.value = Math.round((s.imageRequestTimeoutMs || 600000) / 1000);
  els.settingDownloadTimeout.value = Math.round((s.imageDownloadTimeoutMs || 90000) / 1000);
  els.settingMaxAttempts.value = s.imageRequestMaxAttempts || 4;
  els.settingMaxCompare.value = s.maxCompareCount || 4;
  els.settingLanPassword.value = "";
}

async function saveSettings(event) {
  event.preventDefault();
  const button = els.settingsForm.querySelector(".generate-button");
  button.disabled = true;
  button.textContent = "保存中...";
  try {
    const apiKeyVal = els.settingApiKey.value.trim();
    const body = {
      apiBaseUrl: els.settingApiBaseUrl.value.trim(),
      apiKey: apiKeyVal || undefined, // don't send empty string which would clear the key
      imageModel: els.settingImageModel.value.trim(),
      imageRequestTimeoutMs: Number(els.settingRequestTimeout.value) * 1000,
      imageDownloadTimeoutMs: Number(els.settingDownloadTimeout.value) * 1000,
      imageRequestMaxAttempts: Number(els.settingMaxAttempts.value),
      maxCompareCount: Number(els.settingMaxCompare.value)
    };
    const lanPw = els.settingLanPassword.value;
    if (lanPw !== undefined) body.lanPassword = lanPw;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body)
    });
    showToast("设置已保存。");
    loadStatus().catch(() => {});
  } catch (error) {
    showToast(error.message || "保存失败。");
  } finally {
    button.disabled = false;
    button.textContent = "保存设置";
  }
}

/* ── Event Listeners ──────────────────────────────── */

els.themeToggle.addEventListener("click", toggleTheme);

/* Form draft persistence */
els.imagePrompt.addEventListener("input", saveFormDraftDebounced);
els.productInput.addEventListener("input", saveFormDraftDebounced);
els.imageCount.addEventListener("change", saveFormDraft);
els.imageRatio.addEventListener("change", saveFormDraft);
els.brandColors.addEventListener("input", saveFormDraftDebounced);
els.featureInput.addEventListener("input", saveFormDraftDebounced);
els.sceneSelect.addEventListener("change", saveFormDraft);
els.variantSelect.addEventListener("change", saveFormDraft);
els.categorySelect.addEventListener("change", saveFormDraft);

els.referenceImage.addEventListener("change", () => {
  handleReferenceChange().catch((error) => showToast(error.message || "参考图读取失败。"));
});
els.imageForm.addEventListener("submit", submitGeneration);
els.settingsForm.addEventListener("submit", saveSettings);
els.sceneSelect.addEventListener("change", () => {
  if (presetProfile() === strategyProfiles.电商) renderVariants();
});
els.openPresetsButton.addEventListener("click", () => switchPage("presetsPage", "灵感"));
els.presetSearch.addEventListener("input", () => {
  state.presetSearch = els.presetSearch.value;
  renderPresetList();
});
els.tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchPage(button.dataset.page, button.dataset.title));
});
els.refreshHistoryButton.addEventListener("click", () => {
  state.loaded.history = false;
  loadHistory().catch((error) => showToast(error.message || "历史读取失败。"));
});
els.taskList.addEventListener("click", (event) => {
  const deleteBtn = event.target instanceof Element ? event.target.closest("[data-delete-task]") : null;
  if (deleteBtn) { deleteTask(deleteBtn.dataset.deleteTask, deleteBtn); return; }
  const copyBtn = event.target instanceof Element ? event.target.closest("[data-copy-prompt]") : null;
  if (copyBtn) { copyPrompt(copyBtn.dataset.copyPrompt); return; }
  const retryBtn = event.target instanceof Element ? event.target.closest("[data-retry-task]") : null;
  if (retryBtn) {
    const task = state.tasks.get(retryBtn.dataset.retryTask);
    if (task) retryJob(task);
  }
});
els.historyList.addEventListener("click", (event) => {
  const deleteBtn = event.target instanceof Element ? event.target.closest("[data-delete-history]") : null;
  if (deleteBtn) { deleteHistoryItem(deleteBtn.dataset.deleteHistory, deleteBtn); return; }
  const copyBtn = event.target instanceof Element ? event.target.closest("[data-copy-prompt]") : null;
  if (copyBtn) { copyPrompt(copyBtn.dataset.copyPrompt); return; }
  const retryBtn = event.target instanceof Element ? event.target.closest("[data-retry-history]") : null;
  if (retryBtn) {
    const item = state.allHistory.find((h) => h.id === retryBtn.dataset.retryHistory);
    if (item) retryJob(item);
  }
});

/* Drag-drop */
els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  els.dropZone.classList.add("is-dragover");
});
els.dropZone.addEventListener("dragleave", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("is-dragover");
});
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("is-dragover");
  const file = event.dataTransfer.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("请拖入图片文件（PNG、JPEG、WebP）。");
    return;
  }
  const dt = new DataTransfer();
  dt.items.add(file);
  els.referenceImage.files = dt.files;
  handleReferenceChange().catch((error) => showToast(error.message || "参考图读取失败。"));
});

/* Lightbox */
els.lightboxClose.addEventListener("click", closeLightbox);
els.lightboxPrev.addEventListener("click", lightboxPrev);
els.lightboxNext.addEventListener("click", lightboxNext);
els.lightbox.querySelector(".lightbox-backdrop").addEventListener("click", closeLightbox);
document.addEventListener("keydown", (event) => {
  if (!state.lightbox.isOpen) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") lightboxPrev();
  if (event.key === "ArrowRight") lightboxNext();
});
let touchStartX = 0;
els.lightbox.addEventListener("touchstart", (event) => {
  touchStartX = event.touches[0].clientX;
}, { passive: true });
els.lightbox.addEventListener("touchend", (event) => {
  const dx = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 50) {
    if (dx > 0) lightboxPrev();
    else lightboxNext();
  }
});

/* Result tile click delegation (lightbox + download + use-ref) */
document.addEventListener("click", (event) => {
  const downloadBtn = event.target.closest(".download-btn");
  if (downloadBtn) {
    event.preventDefault();
    event.stopPropagation();
    downloadImage(downloadBtn.href, downloadBtn.download || "image.png");
    return;
  }
  const useRefBtn = event.target.closest(".use-ref-button");
  if (useRefBtn) {
    event.preventDefault();
    event.stopPropagation();
    useAsReference(useRefBtn.dataset.refSrc);
    return;
  }
  const tile = event.target.closest(".result-tile");
  if (tile && !event.target.closest(".batch-select-checkbox")) {
    event.preventDefault();
    const grid = tile.closest(".result-grid");
    const tiles = [...grid.querySelectorAll(".result-tile")];
    const images = tiles.map((t) => ({ src: t.dataset.imageSrc }));
    const index = tiles.indexOf(tile);
    openLightbox(images, index);
  }
});

/* Batch checkbox delegation */
document.addEventListener("click", (event) => {
  const checkbox = event.target.closest("[data-batch-checkbox]");
  if (!checkbox) return;
  toggleBatchItem(checkbox.dataset.batchCheckbox);
});

/* History search and filter */
els.historySearch.addEventListener("input", () => {
  state.historySearch = els.historySearch.value;
  renderFilteredHistory();
});
els.historyFilters.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-hfilter]");
  if (!chip) return;
  state.historyFilter = chip.dataset.hfilter;
  els.historyFilters.querySelectorAll(".filter-chip").forEach((c) => {
    c.classList.toggle("is-active", c.dataset.hfilter === state.historyFilter);
  });
  renderFilteredHistory();
});
els.clearAllHistoryButton.addEventListener("click", async () => {
  if (!window.confirm("确定清空所有历史记录？已生成的图片文件会保留在本机。")) return;
  try {
    await deleteJson("/api/history");
    state.allHistory = [];
    renderFilteredHistory();
    showToast("历史已清空。");
  } catch (error) {
    showToast(error.message || "清空失败。");
  }
});

/* Custom presets */
els.addPresetButton.addEventListener("click", () => openPresetModal());
els.presetModalClose.addEventListener("click", closePresetModal);
els.presetModalForm.addEventListener("submit", saveCustomPreset);
els.presetModal.addEventListener("click", (event) => {
  if (event.target === els.presetModal) closePresetModal();
});
els.presetList.addEventListener("click", (event) => {
  const editBtn = event.target.closest("[data-edit-preset]");
  if (editBtn) {
    const preset = state.presets.find((p) => p.id === editBtn.dataset.editPreset);
    if (preset) openPresetModal(preset);
    return;
  }
  const deleteBtn = event.target.closest("[data-delete-preset]");
  if (deleteBtn) {
    deleteCustomPreset(deleteBtn.dataset.deletePreset);
  }
});

/* Auth */
els.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = els.authPassword.value;
  els.authError.textContent = "";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await response.json();
    if (!response.ok) {
      els.authError.textContent = data.error || "登录失败。";
      return;
    }
    localStorage.setItem("imageForgeToken", data.token);
    hideAuthScreen();
    els.authPassword.value = "";
    loadStatus().then(() =>
      Promise.all([loadTemplates(), loadPresets(), loadJobs(), loadHistory()])
    ).catch(() => {});
  } catch (error) {
    els.authError.textContent = error.message || "网络错误。";
  }
});

/* Batch mode */
els.historySelectMode.addEventListener("click", () => enterBatchMode("history"));
els.taskSelectMode.addEventListener("click", () => enterBatchMode("tasks"));
els.batchSelectAll.addEventListener("click", selectAllBatch);
els.batchDelete.addEventListener("click", batchDelete);
els.batchDownload.addEventListener("click", batchDownload);
els.batchExit.addEventListener("click", exitBatchMode);

/* ── Init ─────────────────────────────────────────── */

initTheme();
restoreFormDraft();
renderTasks();
renderHistory();
renderSelectedPreset();

checkAuth().then((authenticated) => {
  if (authenticated) {
    loadStatus().then(() =>
      Promise.all([loadTemplates(), loadPresets(), loadJobs(), loadHistory()])
    ).catch(() => {});
  }
});
