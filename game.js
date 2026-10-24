(function () {
  "use strict";

  /* ============================================================
     КОНСТАНТЫ БАЛАНСА
     ============================================================ */
  var SOLDIER_COST   = 2;
  var TANK_COST      = 5;
  var TANK_STEEL_COST = 3;

  var FACTORY_COST          = 50;
  var FACTORY_INCOME_BONUS  = 2;

  var STEEL_MILL_COST      = 150;
  var STEEL_MILL_INCOME    = 2;
  var STEEL_MILL_UPKEEP    = 3;

  var CAPITAL_INCOME_BONUS = 5;

  var FORT_BASE_COST     = 40;
  var FORT_MAX_LEVEL     = 3;
  var FORT_DEFENSE_BONUS = 0.25;

  var BARRACKS_BASE_COST   = 200;
  var BARRACKS_MAX_LEVEL   = 3;
  var BARRACKS_LIMIT_PER_LVL = 100;
  var BARRACKS_BUILD_TIME  = 2;

  var TANK_FACTORY_BASE_COST   = 500;
  var TANK_FACTORY_MAX_LEVEL   = 3;
  var TANK_FACTORY_LIMIT_PER_LVL = 50;
  var TANK_FACTORY_BUILD_TIME  = 3;

  var PROD_SOLDIER    = 1;
  var PROD_TANK       = 2;
  var PROD_FACTORY    = 3;
  var PROD_FORT       = 3;
  var PROD_STEEL_MILL = 3;

  var SOLDIER_ATTACK  = 1;
  var SOLDIER_DEFENSE = 1;
  var TANK_ATTACK     = 3;
  var TANK_DEFENSE    = 2;

  var INFLATION_THRESHOLD = 1000;
  var INFLATION_MAX = 150;
  var INFLATION_DAMPING_GOLD = 7500;

  var RESEARCH_TECHNOLOGIES = {
    military: { name: "Реформа Армии", branch: "Военная", description: "+1% к атаке всех собственных войск", cost: 250, turns: 30 },
    economy: { name: "Реформа Экономики", branch: "Экономическая", description: "+1% к общему доходу золота и стали", cost: 300, turns: 30 }
  };

  var BIOME_DATA = {
    forest: {
      name: "Лес", icon: "♧", goldBonus: -3, defenseMultiplier: 1.10,
      steelBonus: 0, recruitDelay: 0,
      summary: "−3 зол./ход · +10% оборона"
    },
    plains: {
      name: "Луга и равнины", icon: "⌁", goldBonus: 5, defenseMultiplier: 0.90,
      steelBonus: 0, recruitDelay: 0,
      summary: "+5 зол./ход · −10% оборона"
    },
    mountains: {
      name: "Горы", icon: "△", goldBonus: 0, defenseMultiplier: 1.30,
      steelBonus: 0, recruitDelay: 1,
      summary: "+30% оборона · сталелитейный цех в горах даёт +2 стали/ход · найм +1 ход"
    }
  };

  /* Computed from the actual SVG river centerlines after map geometry is initialized. */
  var RIVER_PROVINCE_IDS = [];

  function biomeForProvinceId(id) {
    /* Horizontal bands guarantee the same biome counts for left and right factions. */
    var row = Math.floor(id / GRID_COLS);
    if (row <= 1) return "forest";
    if (row >= GRID_ROWS - 2) return "mountains";
    return "plains";
  }

  function getBiome(province) {
    return province && BIOME_DATA[province.biome] ? BIOME_DATA[province.biome] : BIOME_DATA.plains;
  }

  /* A mountain province produces its extra two steel only after a steel mill is built. */
  function getProvinceSteelIncome(province) {
    if (!province) return 0;
    var mills = Math.max(0, Number(province.steelMills) || 0);
    if (mills <= 0) return 0;
    var millProduction = mills * STEEL_MILL_INCOME;
    var mountainBonus = province.biome === "mountains" ? 2 : 0;
    return millProduction + mountainBonus;
  }

  function recruitmentTurns(province, baseTurns) {
    return baseTurns + (getBiome(province).recruitDelay || 0);
  }

  var SETTLEMENT_MAX_LEVEL = 5;
  var SETTLEMENT_LEVELS = [
    { name: "Пустошь",   income: 0,   fortBonus: 0,  cost: 0,    time: 0 },
    { name: "Деревня",   income: 15,  fortBonus: 5,  cost: 100,  time: 1 },
    { name: "Поселок",   income: 19,  fortBonus: 8,  cost: 300,  time: 2 },
    { name: "ПГТ",       income: 25,  fortBonus: 12, cost: 900,  time: 2 },
    { name: "Город",     income: 55,  fortBonus: 25, cost: 2700, time: 3 },
    { name: "Мегаполис", income: 120, fortBonus: 38, cost: 8100, time: 4 }
  ];


  var IMPROVE_RELATIONS_COST = 30;
  var IMPROVE_RELATIONS_GAIN = 20;
  var AID_GOLD               = 40;
  var AID_RELATIONS_PENALTY  = 30;
  var AID_COOLDOWN_TURNS     = 5;
  var AID_RELATIONS_REQUIRED = 50;

  var NON_AGGRESSION_COST = 500;
  var NON_AGGRESSION_DURATION = 50;

  var VISUAL_SETTINGS_KEY = "province-strategy-visual-settings-v1";
  var DEFAULT_KEY_BINDINGS = {
    endTurn: "Space",
    move: "KeyM",
    navigateUp: "KeyW",
    navigateDown: "KeyS",
    navigateLeft: "KeyA",
    navigateRight: "KeyD",
    openJournal: "KeyJ",
    openForecast: "KeyP",
    openResearch: "KeyT",
    openMarches: "KeyG",
    cancel: "Escape"
  };

  function loadVisualSettings() {
    var defaults = {
      showFactories: true,
      showMilitary: true,
      showSettlements: true,
      showTerrain: true,
      showOcean: true,
      animateSmoke: true,
      theme: "dark",
      keyBindings: Object.assign({}, DEFAULT_KEY_BINDINGS)
    };
    try {
      var raw = window.localStorage.getItem(VISUAL_SETTINGS_KEY);
      if (!raw) return defaults;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return defaults;
      defaults.showFactories = saved.showFactories !== false;
      defaults.showMilitary = saved.showMilitary !== false;
      defaults.showSettlements = saved.showSettlements !== false;
      defaults.showTerrain = saved.showTerrain !== false;
      defaults.showOcean = saved.showOcean !== false;
      defaults.animateSmoke = saved.animateSmoke !== false;
      defaults.theme = saved.theme === "light" ? "light" : "dark";
      if (saved.keyBindings && typeof saved.keyBindings === "object") {
        Object.keys(DEFAULT_KEY_BINDINGS).forEach(function (action) {
          var savedCode = saved.keyBindings[action];
          if (typeof savedCode === "string" && savedCode.length > 0 && savedCode.length <= 32) {
            defaults.keyBindings[action] = savedCode;
          }
        });
      }
    } catch (error) {
      /* Storage can be unavailable in private or restricted browser contexts. */
    }
    return defaults;
  }

  function saveVisualSettings() {
    try {
      window.localStorage.setItem(VISUAL_SETTINGS_KEY, JSON.stringify(visualSettings));
    } catch (error) {
      /* The settings still apply for the current session if storage is blocked. */
    }
  }

  var BOT_TENSION_CHANCE = 0.15;
  var BOT_TENSION_DROP   = 10;
  var BOT_WAR_RELATIONS  = -50;

  var PLAYER = "player";
  var BOT    = "bot";
  var PEACE  = "peace";
  var WAR    = "war";

  var SVG_NS = "http://www.w3.org/2000/svg";

  /* ============================================================
     ГЕОМЕТРИЯ
     ============================================================ */
  var GRID_COLS = 8;
  var GRID_ROWS = 6;
  var PROVINCE_COUNT = GRID_COLS * GRID_ROWS;
  var SUBJECT_COLS = GRID_COLS / 2;
  var SUBJECT_ROWS = GRID_ROWS / 2;
  var BASE_VB_W = 1000;
  var BASE_VB_H = 760;
  var MIN_ZOOM  = 1.0;
  var MAX_ZOOM  = 6.0;

  var MIN_VBW = BASE_VB_W / MAX_ZOOM;
  var MAX_VBW = BASE_VB_W / MIN_ZOOM;

  var GEO_CX = 500;
  var GEO_CY = 380;
  var GEO_RX = 330;
  var GEO_RY = 330;

  /* Coastline points are kept on one exact circle; only interior boundaries are irregular. */
  var INTERIOR_JITTER_X = 12;
  var INTERIOR_JITTER_Y = 14;
  var MIDDLE_JITTER_X   = 24;

  var ZOOMED_OUT_THRESHOLD = 0.5;

  var FACTORY_EDGE_PADDING   = 4;
  var FACTORY_TEXT_HALF_W    = 26;
  var FACTORY_TEXT_UP        = 32;
  var FACTORY_TEXT_DOWN      = 14;
  var FACTORY_MIN_DIST       = 5;
  var MERGE_RADIUS           = 6;
  var CLUSTER_CHANCE         = 0.55;
  var BASE_ICON_SIZE         = 10;
  var SETTLEMENT_INNER_R     = 15;
  var SETTLEMENT_OFFSET      = 3;

  var CAM_LERP = 0.4;
  var CAM_MIN_VIS = 100;

  /* Порог начала панорамирования на СКМ. ЛКМ всегда используется для выбора провинций. */
  var DRAG_THRESHOLD_PX = 5;

  var NAMES = [
    "Нордмарк", "Вестмарк", "Грейвуд", "Рейнланд", "Остмарк", "Балтика",
    "Лузитания", "Вестгау", "Озерный", "Централия", "Дунай", "Карпатия"
  ];

  /* Every province has a persistent name, but province names are intentionally not drawn on the map. */
  var PROVINCE_NAMES_BY_SUBJECT = [
    ["Североград", "Белоречье", "Сосновый Бор", "Ветреный Мыс"],
    ["Западная Гавань", "Медный Холм", "Речной Край", "Каменный Яр"],
    ["Седолесье", "Туманная Долина", "Старый Брод", "Тихий Лог"],
    ["Рейнфельд", "Златоречье", "Мостовая", "Виноградная Долина"],
    ["Восточный Предел", "Яснополье", "Край Рассвета", "Медный Ключ"],
    ["Янтарный Берег", "Синяя Бухта", "Морская Застава", "Северный Порт"],
    ["Лузская Долина", "Солнечный Мыс", "Оливковый Холм", "Дальний Рубеж"],
    ["Вестгауский Перевал", "Старая Крепь", "Поле Туманов", "Гранитный Дол"],
    ["Озёрный Край", "Глубокое Озеро", "Тихая Заводь", "Берег Камышей"],
    ["Центроград", "Три Ручья", "Пшеничный Край", "Перекрёсток"],
    ["Дунайск", "Зелёные Поймы", "Славный Брод", "Нижний Причал"],
    ["Карпатский Перевал", "Орлиная Вершина", "Сосновый Склон", "Высокогорье"]
  ];

  var SUBJECT_DEFINITIONS = NAMES.map(function (name, index) {
    return { id: "subject-" + String(index + 1).padStart(2, "0"), name: name };
  });

  var NEIGHBORS = (function () {
    var n = {};
    for (var r = 0; r < GRID_ROWS; r++) {
      for (var c = 0; c < GRID_COLS; c++) {
        var id = r * GRID_COLS + c;
        var list = [];
        if (c > 0) list.push(r * GRID_COLS + (c - 1));
        if (c < GRID_COLS - 1) list.push(r * GRID_COLS + (c + 1));
        if (r > 0) list.push((r - 1) * GRID_COLS + c);
        if (r < GRID_ROWS - 1) list.push((r + 1) * GRID_COLS + c);
        n[id] = list;
      }
    }
    return n;
  })();

  var OWNER_MAP = (function () {
    var map = [];
    for (var r = 0; r < GRID_ROWS; r++) {
      for (var c = 0; c < GRID_COLS; c++) map.push(c < GRID_COLS / 2 ? PLAYER : BOT);
    }
    return map;
  })();

  function subjectIndexForCell(row, col) {
    return Math.floor(row / 2) * SUBJECT_COLS + Math.floor(col / 2);
  }

  function provinceNameForId(id) {
    var row = Math.floor(id / GRID_COLS);
    var col = id % GRID_COLS;
    var subjectIndex = subjectIndexForCell(row, col);
    var localIndex = (row % 2) * 2 + (col % 2);
    var names = PROVINCE_NAMES_BY_SUBJECT[subjectIndex];
    return names && names[localIndex] ? names[localIndex] : "Провинция " + String(id + 1).padStart(2, "0");
  }

  var SUBJECT_BY_PROVINCE = (function () {
    var result = {};
    for (var r = 0; r < GRID_ROWS; r++) {
      for (var c = 0; c < GRID_COLS; c++) {
        result[r * GRID_COLS + c] = SUBJECT_DEFINITIONS[subjectIndexForCell(r, c)].id;
      }
    }
    return result;
  })();

  /* ============================================================
     СОСТОЯНИЕ
     ============================================================ */
  var state = createInitialState();
  var selectedId    = null;
  var selectedProvinceIds = [];
  var batchActionInProgress = false;
  var moveFromId    = null;
  var pendingMoveTargetId = null;
  var rerouteMovementId = null;
  var gameOver      = false;
  var lastGameOverTitle = "";
  var lastGameOverMessage = "";

  var activeTab = "army";
  var visualSettings = loadVisualSettings();
  var waitingForKeyBinding = null;
  var capturedBindingKeyCode = null;
  var nonAggressionTurns = 0;
  var turnNoticeTimeout = null;
  var lastRenderedSelectedId = null;

  var cam       = { x: 0, y: 0, w: BASE_VB_W, h: BASE_VB_H };
  var camTarget = { x: 0, y: 0, w: BASE_VB_W, h: BASE_VB_H };
  var camAnimating = false;
  var lastAppliedZoom = -1;

  var dragData = null;
  var hasMoved = false;
  var hasMovedTimeout = null;

  var buildingsVersion = 0;
  var lastRenderedBuildingsVersion = -1;

  /* ============================================================
     DOM
     ============================================================ */
  var svgEl          = document.getElementById("map");
  var mapWorldEl     = document.getElementById("map-world");
  var provincesLayer = document.getElementById("provinces-layer");
  var factoriesLayer = document.getElementById("factories-layer");
  var industryLayer = document.getElementById("industry-layer");
  var militaryLayer = document.getElementById("military-layer");
  var settlementsLayer = document.getElementById("settlements-layer");
  var movementsLayer = document.getElementById("movements-layer");
  var borderLayer    = document.getElementById("border-layer");
  var biomeLayer     = document.getElementById("biome-layer");
  var riversLayer    = document.getElementById("rivers-layer");
  var islandClipShapeEl = document.getElementById("main-island-clip-shape");
  var riverProvinceClipShapeEl = document.getElementById("river-province-clip-shapes");
  var labelsLayer    = document.getElementById("labels-layer");
  var factionLabelsLayer = document.getElementById("faction-labels-layer");

  var hudEl          = document.querySelector(".hud");

  var overlayEl      = document.getElementById("province-overlay");
  var overlayCloseBtn = document.getElementById("overlay-close-btn");
  var overlayPanelEl = document.querySelector(".overlay-panel");

  var capitalBannerEl    = document.getElementById("capital-banner");
  var capitalBannerBonusEl = document.getElementById("capital-banner-bonus");

  var playerGoldEl   = document.getElementById("player-gold");
  var playerSteelEl  = document.getElementById("player-steel");
  var playerSoldiersEl = document.getElementById("player-soldiers");
  var playerSoldierLimitEl = document.getElementById("player-soldier-limit");
  var playerTanksEl = document.getElementById("player-tanks");
  var playerTankLimitEl = document.getElementById("player-tank-limit");
  var playerGoldIncEl = document.getElementById("player-gold-income");
  var playerSteelIncEl = document.getElementById("player-steel-income");
  var playerInflationEl = document.getElementById("player-inflation");

  var botGoldEl      = document.getElementById("bot-gold");
  var botSteelEl     = document.getElementById("bot-steel");
  var botSoldiersEl  = document.getElementById("bot-soldiers");
  var botSoldierLimitEl = document.getElementById("bot-soldier-limit");
  var botTanksEl     = document.getElementById("bot-tanks");
  var botTankLimitEl = document.getElementById("bot-tank-limit");
  var botGoldIncEl   = document.getElementById("bot-gold-income");
  var botSteelIncEl  = document.getElementById("bot-steel-income");
  var botInflationEl = document.getElementById("bot-inflation");

  var turnNumberEl   = document.getElementById("turn-number");
  var turnNoticeEl   = document.getElementById("turn-notice");
  var hudDiploCard   = document.getElementById("hud-diplo-card");
  var hudDiploStatus = document.getElementById("hud-diplo-status");

  var panelNameEl    = document.getElementById("panel-name");
  var panelOwnerEl   = document.getElementById("panel-owner");
  var countryCardEl = document.getElementById("country-card");
  var countryFlagBackgroundEl = document.getElementById("country-flag-background");
  var countryFlagSwordEl = document.getElementById("country-flag-sword");
  var countryFlagDragonEl = document.getElementById("country-flag-dragon");
  var countryNameEl = document.getElementById("country-name");
  var countryGovernmentEl = document.getElementById("country-government");
  var countryIdeologyEl = document.getElementById("country-ideology");
  var panelTerrainEl = document.getElementById("panel-terrain");
  var panelBiomeIconEl = document.getElementById("panel-biome-icon");
  var panelBiomeNameEl = document.getElementById("panel-biome-name");
  var panelBiomeEffectsEl = document.getElementById("panel-biome-effects");
  var panelSoldiersEl= document.getElementById("panel-soldiers");
  var panelTanksEl   = document.getElementById("panel-tanks");
  var panelFortEl    = document.getElementById("panel-fort");
  var panelDefenseEl = document.getElementById("panel-defense");
  var panelBarracksEl = document.getElementById("panel-barracks");
  var panelTankFactoryEl = document.getElementById("panel-tank-factory");
  var panelFactoriesEl = document.getElementById("panel-factories");
  var panelSteelMillsEl = document.getElementById("panel-steel-mills");
  var panelSettlementEl = document.getElementById("panel-settlement");
  var panelIncomeEl  = document.getElementById("panel-income");
  var panelNeighborsEl = document.getElementById("panel-neighbors");
  var panelMovementsEl = document.getElementById("panel-movements");

  var queueArmyBlockEl = document.getElementById("queue-army-block");
  var queueArmyListEl  = document.getElementById("queue-army-list");
  var queueEconBlockEl = document.getElementById("queue-econ-block");
  var queueEconListEl  = document.getElementById("queue-econ-list");

  var tabButtons     = document.querySelectorAll(".tab");
  var tabArmyEl      = document.getElementById("tab-army");
  var tabEconomyEl   = document.getElementById("tab-economy");
  var armyActionsEl = document.getElementById("army-actions");
  var economyBuildActionsEl = document.getElementById("economy-build-actions");
  var diplomacySectionEl = document.getElementById("diplomacy-section");

  var generalActionsEl = document.getElementById("general-actions");
  var foreignHintEl  = document.getElementById("foreign-hint");

  var hireBtn        = document.getElementById("hire-btn");
  var tankBtn        = document.getElementById("tank-btn");
  var factoryBtn     = document.getElementById("factory-btn");
  var steelMillBtn   = document.getElementById("steel-mill-btn");
  var settlementBtn  = document.getElementById("settlement-btn");
  var fortBtn        = document.getElementById("fort-btn");
  var barracksBtn    = document.getElementById("barracks-btn");
  var tankFactoryBtn = document.getElementById("tank-factory-btn");
  var moveBtn        = document.getElementById("move-btn");
  var declareWarBtn  = document.getElementById("declare-war-btn");

  var improveRelationsBtn = document.getElementById("improve-relations-btn");
  var peaceBtn       = document.getElementById("peace-btn");
  var aidBtn         = document.getElementById("aid-btn");
  var aidHintEl      = document.getElementById("aid-hint");
  var nonAggressionBtn = document.getElementById("non-aggression-btn");
  var nonAggressionStatusEl = document.getElementById("non-aggression-status");
  var diploStatusEl  = document.getElementById("diplo-status");
  var diploRelationsEl = document.getElementById("diplo-relations");
  var diploRelationsHintEl = document.getElementById("diplo-relations-hint");
  var relationsFillEl = document.getElementById("relations-fill");

  var endTurnBtn     = document.getElementById("end-turn-btn");
  var journalOpenBtn = document.getElementById("journal-open-btn");
  var journalModal = document.getElementById("journal-modal");
  var journalCloseBtn = document.getElementById("journal-close-btn");
  var journalPlayerList = document.getElementById("journal-player-list");
  var journalBotList = document.getElementById("journal-bot-list");
  var journalBattlesList = document.getElementById("journal-battles-list");
  var journalPlayerTab = document.getElementById("journal-player-tab");
  var journalBotTab = document.getElementById("journal-bot-tab");
  var journalBattlesTab = document.getElementById("journal-battles-tab");
  var journalPlayerPanel = document.getElementById("journal-player-panel");
  var journalBotPanel = document.getElementById("journal-bot-panel");
  var journalBattlesPanel = document.getElementById("journal-battles-panel");
  var journalTab = "player";
  var multiSelectionStatusEl = document.getElementById("multi-selection-status");
  var multiSelectionCopyEl = document.getElementById("multi-selection-copy");
  var clearMultiSelectionBtn = document.getElementById("clear-multi-selection-btn");
  var movementManagementOpenBtn = document.getElementById("movement-management-open-btn");
  var movementManagementModal = document.getElementById("movement-management-modal");
  var movementManagementCloseBtn = document.getElementById("movement-management-close-btn");
  var movementManagementListEl = document.getElementById("movement-management-list");
  var movementManagementOrdersListEl = document.getElementById("movement-management-orders-list");
  var movementRedirectHintEl = document.getElementById("movement-redirect-hint");
  var economyForecastOpenBtn = document.getElementById("economy-forecast-open-btn");
  var economyForecastModal = document.getElementById("economy-forecast-modal");
  var economyForecastCloseBtn = document.getElementById("economy-forecast-close-btn");
  var economyForecastOverviewEl = document.getElementById("economy-forecast-overview");
  var economyForecastTableEl = document.getElementById("economy-forecast-table");
  var economyPaybackListEl = document.getElementById("economy-payback-list");
  var researchOpenBtn = document.getElementById("research-open-btn");
  var researchModal = document.getElementById("research-modal");
  var researchCloseBtn = document.getElementById("research-close-btn");
  var researchMilitaryStatusEl = document.getElementById("research-military-status");
  var researchEconomyStatusEl = document.getElementById("research-economy-status");
  var researchMilitaryBtn = document.getElementById("research-military-btn");
  var researchEconomyBtn = document.getElementById("research-economy-btn");
  var researchSummaryEl = document.getElementById("research-summary");
  var moveBattleForecastEl = document.getElementById("move-battle-forecast");
  var moveBattleForecastContentEl = document.getElementById("move-battle-forecast-content");
  var moveBattleForecastNoteEl = document.getElementById("move-battle-forecast-note");

  var settingsOpenBtn = document.getElementById("settings-open-btn");
  var settingsModal = document.getElementById("settings-modal");
  var settingsCloseBtn = document.getElementById("settings-close-btn");
  var settingShowFactories = document.getElementById("setting-show-factories");
  var settingShowMilitary = document.getElementById("setting-show-military");
  var settingShowSettlements = document.getElementById("setting-show-settlements");
  var settingShowTerrain = document.getElementById("setting-show-terrain");
  var settingShowOcean = document.getElementById("setting-show-ocean");
  var settingSmokeAnimation = document.getElementById("setting-smoke-animation");
  var settingsThemeToggle = document.getElementById("settings-theme-toggle");
  var settingsThemeStatus = document.getElementById("settings-theme-status");
  var settingsVisualTab = document.getElementById("settings-visual-tab");
  var settingsControlsTab = document.getElementById("settings-controls-tab");
  var settingsVisualPanel = document.getElementById("settings-visual-panel");
  var settingsControlsPanel = document.getElementById("settings-controls-panel");
  var settingsKeybindingButtons = document.querySelectorAll(".keybinding-button[data-keybinding]");
  var settingsKeybindingStatus = document.getElementById("settings-keybinding-status");
  var settingsResetKeybindingsBtn = document.getElementById("settings-reset-keybindings");
  var settingsNewCampaignBtn = document.getElementById("settings-new-campaign-btn");
  var settingsMapLegendToggleBtn = document.getElementById("settings-map-legend-toggle");
  var settingsMapLegendEl = document.getElementById("map-legend");

  var moveModal      = document.getElementById("move-modal");
  var moveModalText  = document.getElementById("move-modal-text");
  var moveSoldiersInput = document.getElementById("move-soldiers");
  var moveTanksInput    = document.getElementById("move-tanks");
  var movePreviewEl  = document.getElementById("move-preview");
  var moveConfirmBtn = document.getElementById("move-confirm");
  var moveCancelBtn  = document.getElementById("move-cancel");

  var gameOverModal  = document.getElementById("game-over");
  var gameOverTitle  = document.getElementById("game-over-title");
  var gameOverText   = document.getElementById("game-over-text");
  var restartBtn     = document.getElementById("restart-btn");

  var legendBotTextEl = document.getElementById("legend-bot-text");

  var QUEUE_LABELS = {
    soldier: "Солдат", tank: "Танк", factory: "Фабрика",
    fort: "Укрепление", steelMill: "Сталелитейный цех",
    barracks: "Казарма", tankFactory: "Танковый завод",
    settlement: "Поселение"
  };

  function applyVisualSettings() {
    document.documentElement.setAttribute("data-theme", visualSettings.theme);
    document.documentElement.classList.toggle("smoke-disabled", !visualSettings.animateSmoke);
    document.documentElement.classList.toggle("ocean-disabled", !visualSettings.showOcean);
    if (industryLayer) industryLayer.style.display = visualSettings.showFactories ? "" : "none";
    if (militaryLayer) militaryLayer.style.display = visualSettings.showMilitary ? "" : "none";
    if (settlementsLayer) settlementsLayer.style.display = visualSettings.showSettlements ? "" : "none";
    if (biomeLayer) biomeLayer.style.display = visualSettings.showTerrain ? "" : "none";

    if (settingShowFactories) settingShowFactories.checked = visualSettings.showFactories;
    if (settingShowMilitary) settingShowMilitary.checked = visualSettings.showMilitary;
    if (settingShowSettlements) settingShowSettlements.checked = visualSettings.showSettlements;
    if (settingShowTerrain) settingShowTerrain.checked = visualSettings.showTerrain;
    if (settingShowOcean) settingShowOcean.checked = visualSettings.showOcean;
    if (settingSmokeAnimation) settingSmokeAnimation.checked = visualSettings.animateSmoke;
    if (settingsThemeStatus) {
      settingsThemeStatus.textContent = visualSettings.theme === "light" ? "Светлая тема" : "Тёмная тема";
    }
    if (settingsThemeToggle) {
      settingsThemeToggle.textContent = visualSettings.theme === "light" ? "Включить тёмную" : "Включить светлую";
      settingsThemeToggle.setAttribute("aria-label", settingsThemeToggle.textContent + " тему оформления");
    }
    renderKeyBindings();
  }

  function setVisualSetting(name, value) {
    if (!Object.prototype.hasOwnProperty.call(visualSettings, name)) return;
    visualSettings[name] = value;
    applyVisualSettings();
    if (name === "showFactories" || name === "showMilitary" || name === "showSettlements") {
      bumpBuildingsVersion();
      renderBuildingsIfNeeded();
    }
    if (name === "showTerrain") renderMap();
    saveVisualSettings();
  }

  function openSettings() {
    if (!settingsModal) return;
    settingsModal.classList.remove("hidden");
    if (settingsOpenBtn) settingsOpenBtn.setAttribute("aria-expanded", "true");
  }

  function closeSettings() {
    if (!settingsModal) return;
    waitingForKeyBinding = null;
    renderKeyBindings();
    settingsModal.classList.add("hidden");
    if (settingsOpenBtn) settingsOpenBtn.setAttribute("aria-expanded", "false");
  }

  function toggleSettings() {
    if (!settingsModal) return;
    if (settingsModal.classList.contains("hidden")) openSettings();
    else closeSettings();
  }

  function setSettingsTab(tabName) {
    var showControls = tabName === "controls";
    if (!showControls && waitingForKeyBinding) {
      waitingForKeyBinding = null;
      renderKeyBindings();
    }
    if (settingsVisualPanel) settingsVisualPanel.classList.toggle("hidden", showControls);
    if (settingsControlsPanel) settingsControlsPanel.classList.toggle("hidden", !showControls);
    if (settingsVisualTab) {
      settingsVisualTab.classList.toggle("active", !showControls);
      settingsVisualTab.setAttribute("aria-selected", String(!showControls));
    }
    if (settingsControlsTab) {
      settingsControlsTab.classList.toggle("active", showControls);
      settingsControlsTab.setAttribute("aria-selected", String(showControls));
    }
  }

  function keyBindingLabel(code) {
    var labels = {
      Space: "Пробел", Escape: "Esc", Enter: "Enter", Tab: "Tab",
      Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
      Home: "Home", End: "End", PageUp: "Page Up", PageDown: "Page Down",
      ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
      NumpadAdd: "Num +", NumpadSubtract: "Num −"
    };
    if (labels[code]) return labels[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return "Num " + code.slice(6);
    if (/^F([1-9]|1[0-2])$/.test(code)) return code;
    return code || "Не назначено";
  }

  function renderKeyBindings() {
    if (!visualSettings.keyBindings) visualSettings.keyBindings = Object.assign({}, DEFAULT_KEY_BINDINGS);
    Array.prototype.forEach.call(settingsKeybindingButtons, function (button) {
      var action = button.getAttribute("data-keybinding");
      if (!action || !Object.prototype.hasOwnProperty.call(DEFAULT_KEY_BINDINGS, action)) return;
      var waiting = waitingForKeyBinding === action;
      button.classList.toggle("waiting", waiting);
      button.textContent = waiting ? "Нажмите клавишу…" : keyBindingLabel(visualSettings.keyBindings[action]);
      button.setAttribute("aria-label", (waiting ? "Ожидается клавиша для действия " : "Изменить клавишу для действия ") + action);
    });
  }

  function startKeyBindingCapture(action) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_KEY_BINDINGS, action)) return;
    waitingForKeyBinding = waitingForKeyBinding === action ? null : action;
    if (settingsKeybindingStatus) {
      settingsKeybindingStatus.textContent = waitingForKeyBinding
        ? "Нажмите нужную клавишу. Повторный клик по той же кнопке «Изменить» отменяет назначение."
        : "Назначение клавиши отменено.";
    }
    renderKeyBindings();
  }

  function assignCapturedKey(event) {
    if (!waitingForKeyBinding) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    var code = event.code || "";
    var forbidden = ["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"];
    if (!code || forbidden.indexOf(code) !== -1) {
      if (settingsKeybindingStatus) settingsKeybindingStatus.textContent = "Выберите обычную клавишу, а не Shift, Ctrl, Alt или Win.";
      return true;
    }
    var action = waitingForKeyBinding;
    var duplicateAction = Object.keys(visualSettings.keyBindings).find(function (candidate) {
      return candidate !== action && visualSettings.keyBindings[candidate] === code;
    });
    if (duplicateAction) {
      if (settingsKeybindingStatus) settingsKeybindingStatus.textContent = "Клавиша «" + keyBindingLabel(code) + "» уже назначена другому действию. Выберите другую.";
      return true;
    }
    visualSettings.keyBindings[action] = code;
    capturedBindingKeyCode = code;
    waitingForKeyBinding = null;
    saveVisualSettings();
    renderKeyBindings();
    if (settingsKeybindingStatus) settingsKeybindingStatus.textContent = "Назначено: «" + keyBindingLabel(code) + "». Настройка сохранена.";
    render();
    return true;
  }

  function resetKeyBindings() {
    visualSettings.keyBindings = Object.assign({}, DEFAULT_KEY_BINDINGS);
    waitingForKeyBinding = null;
    saveVisualSettings();
    renderKeyBindings();
    if (settingsKeybindingStatus) settingsKeybindingStatus.textContent = "Восстановлены стандартные клавиши.";
    render();
  }

  function syncHudHeight() {
    if (!hudEl) return;
    var h = hudEl.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--hud-h", h + "px");
    void overlayPanelEl;
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /* ============================================================
     ИНИЦИАЛИЗАЦИЯ
     ============================================================ */
  function createInitialState() {
    var provinces = [];
    for (var id = 0; id < PROVINCE_COUNT; id++) {
      var row = Math.floor(id / GRID_COLS);
      var col = id % GRID_COLS;
      var soldiers   = 6 + ((id * 3 + 1) % 5);
      var tanks      = (id % 3 === 2) ? 1 : 0;
      var factories  = (id % 3 === 0) ? 1 : 0;
      var fort       = (id % 7 === 1) ? 1 : 0;
      var baseIncome = 6 + ((id * 5 + 3) % 7);

      provinces.push({
        id: id, name: provinceNameForId(id),
        owner: OWNER_MAP[id], countryId: OWNER_MAP[id] === PLAYER ? "dragon-power" : "sword-union",
        subjectId: SUBJECT_BY_PROVINCE[id],
        biome: biomeForProvinceId(id),
        terrainMarkerCount: 3 + Math.floor(Math.random() * 5),
        hasRiver: RIVER_PROVINCE_IDS.indexOf(id) !== -1,
        riverPointCount: 0,
        soldiers: soldiers, tanks: tanks, factories: factories,
        factoryPositions: [], steelMills: 0, steelMillPositions: [],
        barracks: 0, barracksPos: null,
        tankFactory: 0, tankFactoryPos: null,
        settlementLevel: 0, settlementPos: null,
        fort: fort, baseIncome: baseIncome,
        income: baseIncome + factories * FACTORY_INCOME_BONUS,
        isCapital: false, queue: []
      });
    }

    var playerIds = [], botIds = [];
    for (var i = 0; i < provinces.length; i++) {
      if (provinces[i].owner === PLAYER) playerIds.push(i); else botIds.push(i);
    }

    var pCap = playerIds[Math.floor(Math.random() * playerIds.length)];
    var bCap = botIds[Math.floor(Math.random() * botIds.length)];
    provinces[pCap].isCapital = true;
    provinces[bCap].isCapital = true;

    shuffleArray(playerIds).slice(0, 4).forEach(function (idx) { provinces[idx].steelMills += 1; });
    shuffleArray(botIds).slice(0, 4).forEach(function (idx) { provinces[idx].steelMills += 1; });

    shuffleArray(playerIds).slice(0, 4).forEach(function (idx) { provinces[idx].barracks = 1; });
    shuffleArray(botIds).slice(0, 4).forEach(function (idx) { provinces[idx].barracks = 1; });

    provinces.forEach(function (p) { recalcIncome(p); });

    var initialTankLimit = {
      player: provinces.reduce(function (sum, p) {
        return sum + (p.owner === PLAYER ? p.tanks : 0);
      }, 0),
      bot: provinces.reduce(function (sum, p) {
        return sum + (p.owner === BOT ? p.tanks : 0);
      }, 0)
    };

    return {
      turn: 1, gold: { player: 25, bot: 25 }, steel: { player: 2, bot: 2 },
      initialTankLimit: initialTankLimit,
      subjects: SUBJECT_DEFINITIONS.reduce(function (result, subject) {
        result[subject.id] = { id: subject.id, name: subject.name };
        return result;
      }, {}),
      countries: {
        "sword-union": {
          id: "sword-union", name: "Союз Мечей", owner: BOT,
          government: "Федеративное", ideology: "Стандартная — Без Идеологии",
          flagBackground: "url(#country-flag-bot-bg)", flagSymbol: "sword"
        },
        "dragon-power": {
          id: "dragon-power", name: "Драконья Мощь", owner: PLAYER,
          government: "Федеративное", ideology: "Стандартная — Без Идеологии",
          flagBackground: "url(#country-flag-player-bg)", flagSymbol: "dragon"
        }
      },
      diplomacy: { status: PEACE, relations: 0, lastAidTurn: 0 },
      provinces: provinces,
      movements: [],
      riverProvinceIds: [],
      riverPointCounts: {},
      nextMovementId: 1,
      research: {
        player: { completed: { military: false, economy: false }, active: null },
        bot: { completed: { military: false, economy: false }, active: null }
      },
      activityLog: [],
      battleReports: []
    };
  }

  function getProvince(id) { return state.provinces[id]; }
  function ownerLabel(owner) {
    var countryId = owner === PLAYER ? "dragon-power" : "sword-union";
    var country = state && state.countries ? state.countries[countryId] : null;
    if (country && typeof country.name === "string") return country.name;
    return owner === PLAYER ? "Драконья Мощь" : "Союз Мечей";
  }
  function isAtWar() { return state.diplomacy.status === WAR; }

  var EVENT_LOG_LIMIT = 250;
  var BATTLE_REPORT_LIMIT = 120;

  function inferLogActor(type, title, details) {
    var entryType = String(type || "");
    var titleText = String(title || "");
    var detailsText = String(details || "");
    var combined = titleText + " " + detailsText;
    if (entryType === "system" || entryType === "turn") return "system";
    if (/(Драконья Мощь|Дракония):\s*.*(Союз Мечей|Меченосцы):/i.test(detailsText)) return "system";
    if (/^(Союз Мечей|Меченосцы)\b/.test(detailsText) || /\bИИ\b|\bбот\b/i.test(combined)) return BOT;
    if (/^(Драконья Мощь|Дракония)\b/.test(detailsText) || /\bигрок\b/i.test(combined)) return PLAYER;
    return PLAYER;
  }

  function logEvent(type, title, details, actor) {
    if (!state) return;
    if (!Array.isArray(state.activityLog)) state.activityLog = [];
    var finalActor = actor === PLAYER || actor === BOT || actor === "system"
      ? actor : inferLogActor(type, title, details);
    state.activityLog.push({
      turn: Number.isFinite(state.turn) ? state.turn : 1,
      actor: finalActor,
      type: String(type || "general"),
      title: String(title || "Событие"),
      details: String(details || "")
    });
    if (state.activityLog.length > EVENT_LOG_LIMIT) {
      state.activityLog.splice(0, state.activityLog.length - EVENT_LOG_LIMIT);
    }
    if (!batchActionInProgress && journalModal && !journalModal.classList.contains("hidden")) renderJournal();
    if (!batchActionInProgress) saveGame();
  }

  function logBattleReport(report) {
    if (!state) return;
    if (!Array.isArray(state.battleReports)) state.battleReports = [];
    var savedReport = Object.assign({ turn: state.turn }, report || {});
    state.battleReports.push(savedReport);
    if (state.battleReports.length > BATTLE_REPORT_LIMIT) {
      state.battleReports.splice(0, state.battleReports.length - BATTLE_REPORT_LIMIT);
    }
    logEvent("battle", savedReport.title || "Сражение", savedReport.summary || "Боевой отчёт сформирован.",
      savedReport.attacker === BOT ? BOT : PLAYER);
  }

  function createJournalCard(entry, isBattle) {
    var card = document.createElement("article");
    card.className = "journal-entry" + (isBattle ? " journal-entry-battle" : "");
    var meta = document.createElement("div");
    meta.className = "journal-entry-meta";
    meta.textContent = "Ход " + (Number.isFinite(entry.turn) ? entry.turn : "—") +
      (entry.type ? " · " + entry.type : "");
    var title = document.createElement("h4");
    title.className = "journal-entry-title";
    title.textContent = entry.title || "Событие";
    var details = document.createElement("p");
    details.className = "journal-entry-details";
    details.textContent = entry.details || entry.summary || "Подробности отсутствуют.";
    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(details);

    if (isBattle) {
      var metrics = document.createElement("div");
      metrics.className = "journal-battle-grid";
      var outcome = document.createElement("div");
      outcome.className = "journal-battle-result" + (entry.result === "capture" ? " success" : " hold");
      outcome.textContent = entry.result === "capture" ? "Провинция захвачена" : "Провинция удержана";
      metrics.appendChild(outcome);

      function addBattleMetric(label, value) {
        var item = document.createElement("div");
        item.className = "journal-battle-stat";
        var name = document.createElement("span");
        name.className = "journal-battle-stat-label";
        name.textContent = label;
        var number = document.createElement("strong");
        number.textContent = String(value);
        item.appendChild(name);
        item.appendChild(number);
        metrics.appendChild(item);
      }
      addBattleMetric("Атакующая сторона", entry.attacker ? ownerLabel(entry.attacker) : "Неизвестно");
      addBattleMetric("Защитник", entry.defender ? ownerLabel(entry.defender) : "Неизвестно");
      addBattleMetric("Сила атаки", Number.isFinite(entry.attackPower) ? entry.attackPower : "—");
      addBattleMetric("Сила обороны", Number.isFinite(entry.defensePower) ? entry.defensePower : "—");
      addBattleMetric("Атакующие потери", (Number(entry.attackerLossSoldiers) || 0) + " солдат · " + (Number(entry.attackerLossTanks) || 0) + " танков");
      addBattleMetric("Потери защитников", (Number(entry.defenderLossSoldiers) || 0) + " солдат · " + (Number(entry.defenderLossTanks) || 0) + " танков");
      addBattleMetric("Силы атакующих", (Number(entry.attackerSoldiers) || 0) + " солдат · " + (Number(entry.attackerTanks) || 0) + " танков");
      addBattleMetric("Силы защитников", (Number(entry.defenderSoldiersBefore) || 0) + " солдат · " + (Number(entry.defenderTanksBefore) || 0) + " танков");
      if (Array.isArray(entry.sources) && entry.sources.length) {
        addBattleMetric("Атака из провинций", entry.sources.join(", "));
      }
      if (entry.capitalCaptured) addBattleMetric("Столица", "Захвачена; прежнему владельцу назначена новая столица");
      card.appendChild(metrics);
    }
    return card;
  }

  function renderJournalList(listElement, entries, isBattle, emptyMessage) {
    if (!listElement) return;
    listElement.textContent = "";
    if (!Array.isArray(entries) || entries.length === 0) {
      var empty = document.createElement("p");
      empty.className = "journal-empty";
      empty.textContent = emptyMessage || (isBattle ? "Сражений пока не было." : "Событий пока нет.");
      listElement.appendChild(empty);
      return;
    }
    entries.slice().reverse().forEach(function (entry) {
      listElement.appendChild(createJournalCard(entry, isBattle));
    });
  }

  function renderJournal() {
    if (!journalPlayerList || !journalBotList || !journalBattlesList) return;
    var entries = Array.isArray(state.activityLog) ? state.activityLog : [];
    renderJournalList(journalPlayerList, entries.filter(function (entry) { return entry.actor === PLAYER; }), false,
      "У игрока пока нет записанных действий.");
    renderJournalList(journalBotList, entries.filter(function (entry) { return entry.actor === BOT; }), false,
      "У бота пока нет записанных действий.");
    renderJournalList(journalBattlesList, state.battleReports || [], true);

    if (journalPlayerPanel) journalPlayerPanel.classList.toggle("hidden", journalTab !== "player");
    if (journalBotPanel) journalBotPanel.classList.toggle("hidden", journalTab !== "bot");
    if (journalBattlesPanel) journalBattlesPanel.classList.toggle("hidden", journalTab !== "battles");

    [[journalPlayerTab, "player"], [journalBotTab, "bot"], [journalBattlesTab, "battles"]].forEach(function (pair) {
      if (!pair[0]) return;
      pair[0].classList.toggle("active", journalTab === pair[1]);
      pair[0].setAttribute("aria-selected", journalTab === pair[1] ? "true" : "false");
    });
  }

  function openJournal() {
    if (!journalModal) return;
    renderJournal();
    journalModal.classList.remove("hidden");
  }

  function closeJournal() {
    if (journalModal) journalModal.classList.add("hidden");
  }
  function clampRelations(v) { return Math.max(-100, Math.min(100, v)); }
  function setRelations(v) { state.diplomacy.relations = clampRelations(v); }
  function statusLabel() { return isAtWar() ? "ВОЙНА" : "МИР"; }
  function round1(n) { return Math.round(n * 10) / 10; }

  function getInflation(owner) {
    return getInflationForGold(state.gold[owner]);
  }

  function inflateCost(baseCost, owner) {
    var inf = getInflation(owner);
    if (inf <= 0) return baseCost;
    return Math.round(baseCost * (1 + inf / 100));
  }

  function isResearchComplete(owner, technologyKey) {
    return !!(state && state.research && state.research[owner] &&
      state.research[owner].completed && state.research[owner].completed[technologyKey]);
  }

  function attackPower(soldiers, tanks, owner) {
    var basePower = soldiers * SOLDIER_ATTACK + tanks * TANK_ATTACK;
    return isResearchComplete(owner, "military") ? basePower * 1.01 : basePower;
  }

  function provinceDefense(province) {
    return provinceDefenseForUnits(province, province.soldiers, province.tanks);
  }

  function provinceDefenseForUnits(province, soldiers, tanks) {
    var base = soldiers * SOLDIER_DEFENSE + tanks * TANK_DEFENSE;
    var fortBonus = province.fort * FORT_DEFENSE_BONUS;
    var settlementBonus = 0;
    if (province.settlementLevel > 0 && SETTLEMENT_LEVELS[province.settlementLevel]) {
      settlementBonus = SETTLEMENT_LEVELS[province.settlementLevel].fortBonus / 100;
    }
    var terrain = getBiome(province);
    var riverPointCount = Number.isInteger(province.riverPointCount)
      ? Math.max(0, Math.min(3, province.riverPointCount))
      : (province.hasRiver ? 1 : 0);
    var riverDefenseBonus = riverPointCount * 0.10;
    return base * (1 + fortBonus + settlementBonus + riverDefenseBonus) * terrain.defenseMultiplier;
  }

  function armyPower(owner) {
    var stationedPower = provincesOf(owner).reduce(function (sum, p) {
      return sum + attackPower(p.soldiers, p.tanks, owner);
    }, 0);
    var movingPower = state.movements.reduce(function (sum, movement) {
      if (movement.owner !== owner) return sum;
      return sum + attackPower(movement.soldiers, movement.tanks, owner);
    }, 0);
    return stationedPower + movingPower;
  }

  function provincesOf(owner) {
    return state.provinces.filter(function (p) { return p.owner === owner; });
  }

  var BUILDING_QUEUE_TYPES = ["factory", "steelMill", "fort", "barracks", "tankFactory", "settlement"];

  function hasConstructionInQueue(province) {
    return !!(province && Array.isArray(province.queue) && province.queue.some(function (order) {
      return BUILDING_QUEUE_TYPES.indexOf(order.type) !== -1;
    }));
  }

  function selectedPlayerProvinces() {
    var ids = selectedProvinceIds.length ? selectedProvinceIds.slice() : (selectedId === null ? [] : [selectedId]);
    var seen = {};
    return ids.map(function (id) { return getProvince(id); }).filter(function (province) {
      if (!province || province.owner !== PLAYER || seen[province.id]) return false;
      seen[province.id] = true;
      return true;
    });
  }

  function getInflationForGold(gold) {
    var amount = Math.max(0, Number(gold) || 0);
    if (amount <= INFLATION_THRESHOLD) return 0;
    var excess = amount - INFLATION_THRESHOLD;
    var inflation = Math.round(INFLATION_MAX * (1 - Math.exp(-excess / INFLATION_DAMPING_GOLD)));
    return Math.max(0, Math.min(INFLATION_MAX, inflation));
  }

  function inflateCostFromGold(baseCost, gold) {
    return Math.round(baseCost * (1 + getInflationForGold(gold) / 100));
  }

  function estimatedConstructionCost(province, actionType) {
    if (!province || province.owner !== PLAYER || hasConstructionInQueue(province)) return null;
    var queuedLevel;
    var effectiveLevel;
    switch (actionType) {
      case "factory": return inflateCostFromGold(FACTORY_COST, state.gold.player);
      case "steelMill": return inflateCostFromGold(STEEL_MILL_COST, state.gold.player);
      case "fort":
        queuedLevel = province.queue.filter(function (item) { return item.type === "fort"; }).length;
        effectiveLevel = province.fort + queuedLevel;
        return effectiveLevel >= FORT_MAX_LEVEL ? null : inflateCostFromGold(FORT_BASE_COST * (effectiveLevel + 1), state.gold.player);
      case "barracks":
        queuedLevel = province.queue.filter(function (item) { return item.type === "barracks"; }).length;
        effectiveLevel = province.barracks + queuedLevel;
        return effectiveLevel >= BARRACKS_MAX_LEVEL ? null : inflateCostFromGold(Math.round(BARRACKS_BASE_COST * Math.pow(1.5, effectiveLevel)), state.gold.player);
      case "tankFactory":
        queuedLevel = province.queue.filter(function (item) { return item.type === "tankFactory"; }).length;
        effectiveLevel = province.tankFactory + queuedLevel;
        return effectiveLevel >= TANK_FACTORY_MAX_LEVEL ? null : inflateCostFromGold(Math.round(TANK_FACTORY_BASE_COST * Math.pow(1.5, effectiveLevel)), state.gold.player);
      case "settlement":
        queuedLevel = province.queue.filter(function (item) { return item.type === "settlement"; }).length;
        effectiveLevel = (province.settlementLevel || 0) + queuedLevel;
        if (effectiveLevel >= SETTLEMENT_MAX_LEVEL || !SETTLEMENT_LEVELS[effectiveLevel + 1]) return null;
        return inflateCostFromGold(SETTLEMENT_LEVELS[effectiveLevel + 1].cost, state.gold.player);
      default: return null;
    }
  }

  function countAffordableBatchTargets(actionType) {
    var targets = selectedPlayerProvinces();
    var availableGold = state.gold.player;
    var count = 0;
    targets.forEach(function (province) {
      if (hasConstructionInQueue(province)) return;
      var baseCost = null;
      var queuedLevel;
      var effectiveLevel;
      switch (actionType) {
        case "factory": baseCost = FACTORY_COST; break;
        case "steelMill": baseCost = STEEL_MILL_COST; break;
        case "fort":
          queuedLevel = province.queue.filter(function (item) { return item.type === "fort"; }).length;
          effectiveLevel = province.fort + queuedLevel;
          if (effectiveLevel >= FORT_MAX_LEVEL) return;
          baseCost = FORT_BASE_COST * (effectiveLevel + 1);
          break;
        case "barracks":
          queuedLevel = province.queue.filter(function (item) { return item.type === "barracks"; }).length;
          effectiveLevel = province.barracks + queuedLevel;
          if (effectiveLevel >= BARRACKS_MAX_LEVEL) return;
          baseCost = Math.round(BARRACKS_BASE_COST * Math.pow(1.5, effectiveLevel));
          break;
        case "tankFactory":
          queuedLevel = province.queue.filter(function (item) { return item.type === "tankFactory"; }).length;
          effectiveLevel = province.tankFactory + queuedLevel;
          if (effectiveLevel >= TANK_FACTORY_MAX_LEVEL) return;
          baseCost = Math.round(TANK_FACTORY_BASE_COST * Math.pow(1.5, effectiveLevel));
          break;
        case "settlement":
          queuedLevel = province.queue.filter(function (item) { return item.type === "settlement"; }).length;
          effectiveLevel = (province.settlementLevel || 0) + queuedLevel;
          if (effectiveLevel >= SETTLEMENT_MAX_LEVEL || !SETTLEMENT_LEVELS[effectiveLevel + 1]) return;
          baseCost = SETTLEMENT_LEVELS[effectiveLevel + 1].cost;
          break;
      }
      if (baseCost === null) return;
      var cost = inflateCostFromGold(baseCost, availableGold);
      if (availableGold < cost) return;
      availableGold -= cost;
      count += 1;
    });
    return count;
  }

  function applyBatchButtonState(button, actionType, label) {
    if (!button || selectedProvinceIds.length < 2) return;
    var targets = selectedPlayerProvinces();
    var affordableCount = countAffordableBatchTargets(actionType);
    button.disabled = gameOver || affordableCount === 0;
    setActionButtonLabel(button, label + " · доступно " + affordableCount + " из " + targets.length);
  }

  function executeBatchConstruction(actionFunction, actionLabel) {
    if (batchActionInProgress || selectedProvinceIds.length < 2) return false;
    var selectedIdsCopy = selectedProvinceIds.slice();
    var originalSelectedId = selectedId;
    var totalOwned = 0;
    var queuedCount = 0;
    batchActionInProgress = true;
    try {
      selectedIdsCopy.forEach(function (provinceId) {
        var province = getProvince(provinceId);
        if (!province || province.owner !== PLAYER) return;
        totalOwned += 1;
        selectedId = province.id;
        var previousQueueLength = province.queue.length;
        actionFunction();
        if (province.queue.length > previousQueueLength) queuedCount += 1;
      });
    } finally {
      batchActionInProgress = false;
      selectedId = originalSelectedId !== null && getProvince(originalSelectedId) ? originalSelectedId :
        (selectedIdsCopy.length ? selectedIdsCopy[0] : null);
    }
    logEvent("economy", "Групповое строительство", actionLabel + ": заказ поставлен в очередь в " + queuedCount + " из " + totalOwned +
      " выбранных провинций. Недоступные по цене или занятые строительством провинции пропущены.", PLAYER);
    render();
    saveGame();
    return true;
  }

  function findNearestOwnedProvince(startId, owner) {
    if (!Number.isInteger(startId) || startId < 0 || startId >= PROVINCE_COUNT) return null;
    var visited = {};
    var queue = [startId];
    visited[startId] = true;
    while (queue.length) {
      var id = queue.shift();
      var province = getProvince(id);
      if (province && province.owner === owner) return province;
      (NEIGHBORS[id] || []).forEach(function (neighborId) {
        if (!visited[neighborId]) {
          visited[neighborId] = true;
          queue.push(neighborId);
        }
      });
    }
    return null;
  }

  function relocateCapital(previousOwner, capturedProvince) {
    if (!capturedProvince || !capturedProvince.isCapital) return;
    capturedProvince.isCapital = false;
    recalcIncome(capturedProvince);
    var owned = provincesOf(previousOwner).filter(function (province) { return province.id !== capturedProvince.id; });
    if (owned.length === 0) return;
    owned.sort(function (a, b) {
      var scoreA = a.baseIncome + a.factories * FACTORY_INCOME_BONUS + (a.settlementLevel ? SETTLEMENT_LEVELS[a.settlementLevel].income : 0);
      var scoreB = b.baseIncome + b.factories * FACTORY_INCOME_BONUS + (b.settlementLevel ? SETTLEMENT_LEVELS[b.settlementLevel].income : 0);
      return scoreB - scoreA || a.id - b.id;
    });
    var replacement = owned[0];
    replacement.isCapital = true;
    recalcIncome(replacement);
    logEvent("politics", "Столица перенесена", ownerLabel(previousOwner) + " потеряли столицу " + capturedProvince.name + ". Новая столица: " + replacement.name + ".", previousOwner);
  }

  function getSoldierLimit(owner) {
    return provincesOf(owner).reduce(function (sum, p) {
      return sum + (p.barracks || 0) * BARRACKS_LIMIT_PER_LVL;
    }, 0);
  }

  function getTankLimit(owner) {
    var buildingCapacity = provincesOf(owner).reduce(function (sum, p) {
      return sum + (p.tankFactory || 0) * TANK_FACTORY_LIMIT_PER_LVL;
    }, 0);
    var startingCapacity = state.initialTankLimit && Number.isFinite(state.initialTankLimit[owner])
      ? state.initialTankLimit[owner] : 0;
    return Math.max(buildingCapacity, startingCapacity);
  }

  function getTotalSoldiers(owner) {
    var stationedAndQueued = provincesOf(owner).reduce(function (sum, p) {
      var queued = p.queue.filter(function (q) { return q.type === "soldier"; }).length;
      return sum + p.soldiers + queued;
    }, 0);
    var moving = state.movements.reduce(function (sum, movement) {
      return sum + (movement.owner === owner ? movement.soldiers : 0);
    }, 0);
    return stationedAndQueued + moving;
  }

  function getFieldedSoldierCount(owner) {
    var stationed = provincesOf(owner).reduce(function (sum, province) {
      return sum + Math.max(0, Number(province.soldiers) || 0);
    }, 0);
    var moving = state.movements.reduce(function (sum, movement) {
      return sum + (movement.owner === owner ? Math.max(0, Number(movement.soldiers) || 0) : 0);
    }, 0);
    return stationed + moving;
  }

  function getSoldierMaintenance(owner, grossGoldIncome) {
    var deployableSoldiers = getFieldedSoldierCount(owner);
    var positiveIncome = Math.max(0, Number(grossGoldIncome) || 0);
    /* Every 100 fielded soldiers cost 20% of the side's current gross gold income. */
    return round1(positiveIncome * deployableSoldiers * 0.002);
  }

  function getTotalTanks(owner) {
    var stationedAndQueued = provincesOf(owner).reduce(function (sum, p) {
      var queued = p.queue.filter(function (q) { return q.type === "tank"; }).length;
      return sum + p.tanks + queued;
    }, 0);
    var moving = state.movements.reduce(function (sum, movement) {
      return sum + (movement.owner === owner ? movement.tanks : 0);
    }, 0);
    return stationedAndQueued + moving;
  }

  function recalcIncome(province) {
    var settlementIncome = 0;
    if (province.settlementLevel > 0 && SETTLEMENT_LEVELS[province.settlementLevel]) {
      settlementIncome = SETTLEMENT_LEVELS[province.settlementLevel].income;
    }
    var terrain = getBiome(province);
    province.income = province.baseIncome
                    + province.factories * FACTORY_INCOME_BONUS
                    + (province.isCapital ? CAPITAL_INCOME_BONUS : 0)
                    - (province.steelMills || 0) * STEEL_MILL_UPKEEP
                    + settlementIncome
                    + terrain.goldBonus
                    + (province.hasRiver ? 4 : 0);
  }

  function relationsHint() {
    var v = state.diplomacy.relations;
    if (isAtWar()) {
      return v < 0
        ? "Идёт война. Улучшайте отношения до 0 или выше, чтобы предложить мир."
        : "Идёт война, но отношения восстановлены: теперь можно заключить мир.";
    }
    if (v > 50)  return "Дружественные отношения. Можно просить финансовую помощь.";
    if (v < -50) return "Отношения на грани разрыва. Бот может объявить войну, если его армия сильнее.";
    if (v < 0)   return "Холодный мир. Напряжение растёт.";
    return "Нейтралитет. Можно укреплять связи или готовиться к войне.";
  }

  function aidReady() {
    if (state.diplomacy.lastAidTurn === 0) return true;
    return state.turn >= state.diplomacy.lastAidTurn + AID_COOLDOWN_TURNS;
  }

  function aidCooldownLeft() {
    if (aidReady()) return 0;
    return state.diplomacy.lastAidTurn + AID_COOLDOWN_TURNS - state.turn;
  }

  function collectIncome() {
    var playerRates = getEconomyRates(PLAYER);
    var botRates = getEconomyRates(BOT);
    state.gold.player = Math.max(0, round1(state.gold.player + playerRates.gold));
    state.steel.player = Math.max(0, round1(state.steel.player + playerRates.steel));
    state.gold.bot = Math.max(0, round1(state.gold.bot + botRates.gold));
    state.steel.bot = Math.max(0, round1(state.steel.bot + botRates.steel));
  }

  function getIncomeForecast() {
    var playerRates = getEconomyRates(PLAYER);
    var botRates = getEconomyRates(BOT);
    return {
      playerGold: playerRates.gold,
      playerSteel: playerRates.steel,
      botGold: botRates.gold,
      botSteel: botRates.steel,
      playerSoldierMaintenance: playerRates.soldierMaintenance,
      botSoldierMaintenance: botRates.soldierMaintenance
    };
  }

  function defaultResearchOwnerState() {
    return { completed: { military: false, economy: false }, active: null };
  }

  function ensureResearchState() {
    if (!state.research || typeof state.research !== "object") state.research = {};
    [PLAYER, BOT].forEach(function (owner) {
      var research = state.research[owner];
      if (!research || typeof research !== "object") research = defaultResearchOwnerState();
      if (!research.completed || typeof research.completed !== "object") research.completed = {};
      research.completed.military = research.completed.military === true;
      research.completed.economy = research.completed.economy === true;
      if (research.active && (!RESEARCH_TECHNOLOGIES[research.active.key] ||
          !Number.isInteger(research.active.turnsLeft) || research.active.turnsLeft < 1 || research.active.turnsLeft > 100)) {
        research.active = null;
      }
      state.research[owner] = research;
    });
  }

  function queueResearch(technologyKey, owner) {
    owner = owner || PLAYER;
    var technology = RESEARCH_TECHNOLOGIES[technologyKey];
    if (!technology || gameOver || !state.research || !state.research[owner]) return false;
    var ownerResearch = state.research[owner];
    if (ownerResearch.completed[technologyKey] || ownerResearch.active) return false;
    var cost = inflateCost(technology.cost, owner);
    if (state.gold[owner] < cost) return false;
    state.gold[owner] -= cost;
    ownerResearch.active = { key: technologyKey, turnsLeft: technology.turns, costPaid: cost };
    logEvent("research", "Начато исследование", ownerLabel(owner) + " начали технологию «" + technology.name + "». Стоимость: " + cost + " золота; завершение через " + technology.turns + " игровых дней.", owner);
    if (researchModal && !researchModal.classList.contains("hidden")) renderResearchModal();
    render();
    saveGame();
    return true;
  }

  function processResearchProgress(owner) {
    var ownerResearch = state.research && state.research[owner];
    if (!ownerResearch || !ownerResearch.active) return;
    ownerResearch.active.turnsLeft -= 1;
    if (ownerResearch.active.turnsLeft > 0) return;
    var technologyKey = ownerResearch.active.key;
    var technology = RESEARCH_TECHNOLOGIES[technologyKey];
    ownerResearch.completed[technologyKey] = true;
    ownerResearch.active = null;
    logEvent("research", "Исследование завершено", ownerLabel(owner) + " завершили технологию «" + technology.name + "». Эффект: " + technology.description + ".", owner);
  }

  function botTryResearch() {
    ensureResearchState();
    var research = state.research[BOT];
    if (research.active || gameOver) return;
    var available = Object.keys(RESEARCH_TECHNOLOGIES).filter(function (key) { return !research.completed[key]; });
    if (!available.length) return;
    if (Math.random() > (isAtWar() ? 0.8 : 0.35)) return;
    var preferred = isAtWar() ? "military" : (Math.random() < 0.65 ? "economy" : "military");
    var chosen = available.indexOf(preferred) !== -1 ? preferred : available[0];
    queueResearch(chosen, BOT);
  }

  function renderResearchModal() {
    ensureResearchState();
    var playerResearch = state.research[PLAYER];
    var botResearch = state.research[BOT];
    var active = playerResearch.active;
    function updateTech(key, statusElement, button) {
      var technology = RESEARCH_TECHNOLOGIES[key];
      var completed = playerResearch.completed[key];
      if (completed) statusElement.textContent = "Изучено · эффект действует постоянно";
      else if (active && active.key === key) statusElement.textContent = "Исследуется · осталось " + active.turnsLeft + " игровых дней";
      else if (active) statusElement.textContent = "Ожидает: завершите «" + RESEARCH_TECHNOLOGIES[active.key].name + "»";
      else statusElement.textContent = "Не исследовано · " + technology.turns + " игровых дней";
      var cost = inflateCost(technology.cost, PLAYER);
      button.textContent = completed ? "Завершено" : (active && active.key === key ? "Идёт исследование" : "Исследовать · " + cost + " золота");
      button.disabled = gameOver || completed || !!active || state.gold.player < cost;
    }
    if (researchMilitaryStatusEl && researchMilitaryBtn) updateTech("military", researchMilitaryStatusEl, researchMilitaryBtn);
    if (researchEconomyStatusEl && researchEconomyBtn) updateTech("economy", researchEconomyStatusEl, researchEconomyBtn);
    if (researchSummaryEl) {
      var activeText = active ? "Сейчас исследуется: «" + RESEARCH_TECHNOLOGIES[active.key].name + "», осталось " + active.turnsLeft + " игровых дней." : "Сейчас исследования не ведутся.";
      var botText = botResearch.active ? "У бота: «" + RESEARCH_TECHNOLOGIES[botResearch.active.key].name + "», осталось " + botResearch.active.turnsLeft + " игровых дней." : "Бот: " + (botResearch.completed.military && botResearch.completed.economy ? "обе технологии изучены." : "может начать исследование в один из следующих ходов.");
      researchSummaryEl.textContent = activeText + " " + botText;
    }
  }

  function openResearch() {
    if (!researchModal) return;
    renderResearchModal();
    researchModal.classList.remove("hidden");
  }

  function closeResearch() {
    if (researchModal) researchModal.classList.add("hidden");
  }

  function getRawEconomyRates(owner) {
    var gold = 0;
    var steel = 0;
    provincesOf(owner).forEach(function (province) {
      gold += province.income;
      steel += getProvinceSteelIncome(province);
    });
    return { gold: gold, steel: steel };
  }

  function getEconomyRates(owner) {
    var raw = getRawEconomyRates(owner);
    var multiplier = isResearchComplete(owner, "economy") ? 1.01 : 1;
    var grossGoldIncome = raw.gold * multiplier;
    var steelIncome = raw.steel * multiplier;
    var soldierMaintenance = getSoldierMaintenance(owner, grossGoldIncome);
    return {
      gold: round1(grossGoldIncome - soldierMaintenance),
      steel: round1(steelIncome),
      grossGold: round1(grossGoldIncome),
      soldierMaintenance: soldierMaintenance
    };
  }


  function projectEconomy(horizon) {
    /* Simulate each future end-of-turn income tick instead of multiplying today's
       rate by the whole horizon. This includes building completion and a research
       effect beginning on the same turn that the research finishes. */
    var startingRates = getRawEconomyRates(PLAYER);
    var rawGoldRate = startingRates.gold;
    var rawSteelRate = startingRates.steel;
    var gold = state.gold.player;
    var steel = state.steel.player;
    var ownedProvinces = provincesOf(PLAYER);
    var settlementLevels = {};
    ownedProvinces.forEach(function (province) {
      settlementLevels[province.id] = province.settlementLevel || 0;
    });
    var playerResearch = state.research && state.research[PLAYER];
    var economyResearchComplete = isResearchComplete(PLAYER, "economy");
    var economyResearchTurnsLeft = playerResearch && !economyResearchComplete &&
      playerResearch.active && playerResearch.active.key === "economy"
      ? Math.max(1, playerResearch.active.turnsLeft) : Infinity;
    var projectedFieldedSoldiers = getFieldedSoldierCount(PLAYER);
    var projectedSteelMillCounts = {};
    ownedProvinces.forEach(function (province) {
      projectedSteelMillCounts[province.id] = Math.max(0, Number(province.steelMills) || 0);
    });

    for (var projectedTurn = 1; projectedTurn <= horizon; projectedTurn += 1) {
      ownedProvinces.forEach(function (province) {
        var queue = Array.isArray(province.queue) ? province.queue : [];
        queue.forEach(function (order) {
          var completionTurn = Math.max(1, Number(order.turnsLeft) || 1);
          if (completionTurn !== projectedTurn) return;
          if (order.type === "factory") {
            rawGoldRate += FACTORY_INCOME_BONUS;
          } else if (order.type === "steelMill") {
            rawGoldRate -= STEEL_MILL_UPKEEP;
            var previousMillCount = projectedSteelMillCounts[province.id] || 0;
            projectedSteelMillCounts[province.id] = previousMillCount + 1;
            var newMountainBonus = province.biome === "mountains" && previousMillCount === 0 ? 2 : 0;
            rawSteelRate += STEEL_MILL_INCOME + newMountainBonus;
          } else if (order.type === "soldier") {
            projectedFieldedSoldiers += 1;
          }
        });

        var highestCompletedSettlement = settlementLevels[province.id];
        queue.forEach(function (order) {
          if (order.type !== "settlement") return;
          var completionTurn = Math.max(1, Number(order.turnsLeft) || 1);
          if (completionTurn <= projectedTurn && Number.isInteger(order.targetLevel)) {
            highestCompletedSettlement = Math.max(highestCompletedSettlement, order.targetLevel);
          }
        });
        if (highestCompletedSettlement > settlementLevels[province.id]) {
          var oldSettlementIncome = SETTLEMENT_LEVELS[settlementLevels[province.id]]
            ? SETTLEMENT_LEVELS[settlementLevels[province.id]].income : 0;
          var newSettlementIncome = SETTLEMENT_LEVELS[highestCompletedSettlement]
            ? SETTLEMENT_LEVELS[highestCompletedSettlement].income : oldSettlementIncome;
          rawGoldRate += newSettlementIncome - oldSettlementIncome;
          settlementLevels[province.id] = highestCompletedSettlement;
        }
      });

      if (projectedTurn >= economyResearchTurnsLeft) economyResearchComplete = true;
      var multiplier = economyResearchComplete ? 1.01 : 1;
      var grossGoldForTurn = rawGoldRate * multiplier;
      var soldierMaintenanceForTurn = round1(Math.max(0, grossGoldForTurn) * projectedFieldedSoldiers * 0.002);
      gold = Math.max(0, round1(gold + grossGoldForTurn - soldierMaintenanceForTurn));
      steel = Math.max(0, round1(steel + rawSteelRate * multiplier));
    }

    var projectedMultiplier = economyResearchComplete ? 1.01 : 1;
    var projectedGrossGold = rawGoldRate * projectedMultiplier;
    var projectedMaintenance = round1(Math.max(0, projectedGrossGold) * projectedFieldedSoldiers * 0.002);
    return {
      horizon: horizon,
      gold: round1(gold),
      steel: round1(steel),
      incomeGold: round1(projectedGrossGold - projectedMaintenance),
      incomeSteel: round1(rawSteelRate * projectedMultiplier),
      soldierMaintenance: projectedMaintenance,
      fieldedSoldiers: projectedFieldedSoldiers
    };
  }

  function makeForecastMetric(label, value, note, tone) {
    var card = document.createElement("article");
    card.className = "forecast-summary-card" + (tone ? " forecast-tone-" + tone : "");
    var title = document.createElement("span");
    title.className = "forecast-summary-label";
    title.textContent = label;
    var strong = document.createElement("strong");
    strong.className = "forecast-summary-value";
    strong.textContent = value;
    var small = document.createElement("small");
    small.textContent = note || "";
    card.appendChild(title);
    card.appendChild(strong);
    card.appendChild(small);
    return card;
  }

  function appendForecastBreakdownRow(container, label, value, tone, note) {
    var row = document.createElement("div");
    row.className = "forecast-breakdown-row";
    var labelElement = document.createElement("span");
    labelElement.className = "forecast-breakdown-label forecast-label-" + (tone || "neutral");
    labelElement.textContent = label;
    var valueElement = document.createElement("strong");
    valueElement.className = "forecast-breakdown-value forecast-value-" + (tone || "neutral");
    valueElement.textContent = value;
    row.appendChild(labelElement);
    row.appendChild(valueElement);
    if (note) {
      var noteElement = document.createElement("small");
      noteElement.className = "forecast-breakdown-note";
      noteElement.textContent = note;
      row.appendChild(noteElement);
    }
    container.appendChild(row);
  }

  function renderEconomyForecast() {
    if (!economyForecastModal || !economyForecastOverviewEl || !economyForecastTableEl || !economyPaybackListEl) return;
    var rates = getEconomyRates(PLAYER);
    var millUpkeep = provincesOf(PLAYER).reduce(function (sum, province) {
      return sum + (province.steelMills || 0) * STEEL_MILL_UPKEEP;
    }, 0);
    var soldierUpkeep = rates.soldierMaintenance || 0;
    var inflation = getInflation(PLAYER);
    economyForecastOverviewEl.textContent = "";
    economyForecastOverviewEl.appendChild(makeForecastMetric("Запас золота", round1(state.gold.player).toString(), "Доступно сейчас", "gold-stock"));
    economyForecastOverviewEl.appendChild(makeForecastMetric("Доход золота", (rates.gold >= 0 ? "+" : "") + round1(rates.gold), "Чистое изменение за игровой день", "gold-income"));
    economyForecastOverviewEl.appendChild(makeForecastMetric("Запас стали", round1(state.steel.player).toString(), "Доступно сейчас", "steel-stock"));
    economyForecastOverviewEl.appendChild(makeForecastMetric("Доход стали", (rates.steel >= 0 ? "+" : "") + round1(rates.steel), "Изменение за игровой день", "steel-income"));
    economyForecastOverviewEl.appendChild(makeForecastMetric("Содержание цехов", "−" + round1(millUpkeep), "Золота за ход; уже учтено в доходе", "upkeep"));
    economyForecastOverviewEl.appendChild(makeForecastMetric("Содержание армии", "−" + round1(soldierUpkeep), String(getFieldedSoldierCount(PLAYER)) + " солдат · 20% дохода за каждые 100 солдат", "army-upkeep"));
    economyForecastOverviewEl.appendChild(makeForecastMetric("Инфляция", inflation + "%", "Влияет на будущие траты золота", "inflation"));
    economyForecastOverviewEl.appendChild(makeForecastMetric("Ваши армии в пути", String(state.movements.filter(function (movement) { return movement.owner === PLAYER; }).length), "Активные марши игрока", "marches"));

    economyForecastTableEl.textContent = "";
    [1, 3, 5].forEach(function (horizon) {
      var projected = projectEconomy(horizon);
      var row = document.createElement("tr");
      var cells = [
        { value: "Через " + horizon + " ход(а)", tone: "forecast-period" },
        { value: projected.gold.toString(), tone: "forecast-value-gold" },
        { value: projected.steel.toString(), tone: "forecast-value-steel" },
        { value: (projected.incomeGold >= 0 ? "+" : "") + projected.incomeGold.toString(), tone: "forecast-value-gold-income" },
        { value: (projected.incomeSteel >= 0 ? "+" : "") + projected.incomeSteel.toString(), tone: "forecast-value-steel-income" }
      ];
      cells.forEach(function (item) {
        var cell = document.createElement("td");
        var valueElement = document.createElement("span");
        valueElement.className = "forecast-table-value " + item.tone;
        valueElement.textContent = item.value;
        cell.appendChild(valueElement);
        row.appendChild(cell);
      });
      economyForecastTableEl.appendChild(row);
    });

    economyPaybackListEl.textContent = "";
    var targets = selectedPlayerProvinces();
    if (!targets.length) targets = provincesOf(PLAYER).slice(0, 3);
    if (!targets.length) {
      economyPaybackListEl.textContent = "Нет контролируемых провинций для расчёта.";
      return;
    }
    targets.slice(0, 6).forEach(function (province) {
      var article = document.createElement("article");
      article.className = "forecast-list-item";
      var title = document.createElement("strong");
      title.className = "forecast-province-title";
      title.textContent = province.name + (province.isCapital ? " · столица" : "");
      var breakdown = document.createElement("div");
      breakdown.className = "forecast-breakdown";
      appendForecastBreakdownRow(breakdown, "Текущий доход", round1(province.income) + " золота/ход", "gold", "С учётом текущих объектов и ландшафта.");

      var factoryCost = estimatedConstructionCost(province, "factory");
      if (factoryCost !== null) {
        var factoryPayback = factoryCost / FACTORY_INCOME_BONUS;
        appendForecastBreakdownRow(breakdown, "Фабрика", factoryCost + " золота", "factory", "+" + FACTORY_INCOME_BONUS + " золота/ход · простая окупаемость около " + factoryPayback.toFixed(1).replace(".", ",") + " ходов.");
      } else {
        appendForecastBreakdownRow(breakdown, "Фабрика", "Сейчас недоступна", "muted", "Есть ограничение или уже идёт соответствующий заказ.");
      }

      var settlementCost = estimatedConstructionCost(province, "settlement");
      if (settlementCost !== null) {
        var nextLevel = Math.min(SETTLEMENT_MAX_LEVEL, (province.settlementLevel || 0) + 1);
        var oldIncome = SETTLEMENT_LEVELS[province.settlementLevel || 0].income;
        var newIncome = SETTLEMENT_LEVELS[nextLevel].income;
        var gain = newIncome - oldIncome;
        var settlementPayback = gain > 0 ? (settlementCost / gain).toFixed(1).replace(".", ",") + " ходов" : "не окупается за счёт дохода";
        appendForecastBreakdownRow(breakdown, "Следующий уровень поселения", settlementCost + " золота", "settlement", (gain >= 0 ? "+" : "") + gain + " золота/ход · окупаемость: " + settlementPayback + ".");
      } else {
        appendForecastBreakdownRow(breakdown, "Поселение", "Улучшение недоступно", "muted", "Достигнут максимум уровня или занята очередь.");
      }
      article.appendChild(title);
      article.appendChild(breakdown);
      economyPaybackListEl.appendChild(article);
    });
    if (targets.length > 6) {
      var more = document.createElement("p");
      more.className = "feature-footnote";
      more.textContent = "Показаны первые 6 выбранных провинций. Уменьшите выделение, чтобы изучить другие.";
      economyPaybackListEl.appendChild(more);
    }
  }

  function openEconomyForecast() {
    if (!economyForecastModal) return;
    renderEconomyForecast();
    economyForecastModal.classList.remove("hidden");
  }

  function closeEconomyForecast() {
    if (economyForecastModal) economyForecastModal.classList.add("hidden");
  }

  /* ============================================================
     ГЕОМЕТРИЯ
     ============================================================ */
  function seededNoise(a, b) {
    var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }

  var GRID = (function () {
    var pts = [];
    for (var r = 0; r <= GRID_ROWS; r++) {
      pts[r] = [];
      for (var c = 0; c <= GRID_COLS; c++) {
        var u = (c / GRID_COLS) * 2 - 1, v = (r / GRID_ROWS) * 2 - 1;
        var t = Math.max(Math.abs(u), Math.abs(v));
        var angle = Math.atan2(v, u);
        var px = GEO_CX + Math.cos(angle) * t * GEO_RX;
        var py = GEO_CY + Math.sin(angle) * t * GEO_RY;
        var isBoundary = (c === 0 || c === GRID_COLS || r === 0 || r === GRID_ROWS);
        var n1 = seededNoise(c * 3 + 7, r * 5 + 11);
        var n2 = seededNoise(c * 5 + 13, r * 3 + 17);
        var n3 = seededNoise(c * 11 + 19, r * 7 + 23);
        if (!isBoundary) {
          px += n1 * 8 + n3 * 5;
          py += n2 * 8 - n3 * 4;
        } else {
          /* Boundary grid points lie exactly on the circular coast. */
          px = GEO_CX + Math.cos(angle) * GEO_RX;
          py = GEO_CY + Math.sin(angle) * GEO_RY;
        }
        pts[r][c] = { x: Math.round(px), y: Math.round(py) };
      }
    }
    return pts;
  })();

  function circularBoundaryMidpoint(pointA, pointB) {
    var angleA = Math.atan2(pointA.y - GEO_CY, pointA.x - GEO_CX);
    var angleB = Math.atan2(pointB.y - GEO_CY, pointB.x - GEO_CX);
    var angleDelta = angleB - angleA;
    if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
    if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
    var middleAngle = angleA + angleDelta / 2;
    return {
      x: Math.round(GEO_CX + Math.cos(middleAngle) * GEO_RX),
      y: Math.round(GEO_CY + Math.sin(middleAngle) * GEO_RY)
    };
  }

  var HORIZONTAL_EDGES = (function () {
    var edges = [];
    for (var r = 0; r <= GRID_ROWS; r++) {
      edges[r] = [];
      for (var c = 0; c < GRID_COLS; c++) {
        var a = GRID[r][c], b = GRID[r][c + 1];
        if (r === 0 || r === GRID_ROWS) {
          edges[r][c] = circularBoundaryMidpoint(a, b);
        } else {
          var dx = b.x - a.x, dy = b.y - a.y;
          var length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          var offset = seededNoise(c + 31, r + 71) * Math.min(12, length * 0.13);
          edges[r][c] = { x: (a.x + b.x) / 2 - dy / length * offset,
                          y: (a.y + b.y) / 2 + dx / length * offset };
        }
      }
    }
    return edges;
  })();

  var VERTICAL_EDGES = (function () {
    var edges = [];
    for (var r = 0; r < GRID_ROWS; r++) {
      edges[r] = [];
      for (var c = 0; c <= GRID_COLS; c++) {
        var a = GRID[r][c], b = GRID[r + 1][c];
        if (c === 0 || c === GRID_COLS) {
          edges[r][c] = circularBoundaryMidpoint(a, b);
        } else {
          var dx = b.x - a.x, dy = b.y - a.y;
          var length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          var offset = seededNoise(c + 131, r + 171) * Math.min(11, length * 0.12);
          edges[r][c] = { x: (a.x + b.x) / 2 - dy / length * offset,
                          y: (a.y + b.y) / 2 + dx / length * offset };
        }
      }
    }
    return edges;
  })();

  var PROVINCE_SHAPES = (function () {
    var shapes = {};
    for (var r = 0; r < GRID_ROWS; r++) {
      for (var c = 0; c < GRID_COLS; c++) {
        var id = r * GRID_COLS + c;
        var p1 = GRID[r][c], p2 = GRID[r][c + 1], p3 = GRID[r + 1][c + 1], p4 = GRID[r + 1][c];
        var corners = [p1, HORIZONTAL_EDGES[r][c], p2, VERTICAL_EDGES[r][c + 1],
          p3, HORIZONTAL_EDGES[r + 1][c], p4, VERTICAL_EDGES[r][c]];
        var points = corners.map(function (p) { return Math.round(p.x) + "," + Math.round(p.y); }).join(" ");
        var pathData = "M " + Math.round(corners[0].x) + " " + Math.round(corners[0].y);
        for (var edgeIndex = 0; edgeIndex < corners.length; edgeIndex++) {
          var currentPoint = corners[edgeIndex];
          var nextPoint = corners[(edgeIndex + 1) % corners.length];
          var followsCircularCoast =
            ((edgeIndex === 0 || edgeIndex === 1) && r === 0) ||
            ((edgeIndex === 2 || edgeIndex === 3) && c === GRID_COLS - 1) ||
            ((edgeIndex === 4 || edgeIndex === 5) && r === GRID_ROWS - 1) ||
            ((edgeIndex === 6 || edgeIndex === 7) && c === 0);
          if (followsCircularCoast) {
            pathData += " A " + GEO_RX + " " + GEO_RY + " 0 0 1 " + Math.round(nextPoint.x) + " " + Math.round(nextPoint.y);
          } else {
            pathData += " L " + Math.round(nextPoint.x) + " " + Math.round(nextPoint.y);
          }
        }
        pathData += " Z";
        var sum = corners.reduce(function (acc, p) { acc.x += p.x; acc.y += p.y; return acc; }, { x: 0, y: 0 });
        shapes[id] = {
          points: points, d: pathData, cx: Math.round(sum.x / corners.length), cy: Math.round(sum.y / corners.length),
          minX: Math.min.apply(null, corners.map(function (p) { return p.x; })),
          maxX: Math.max.apply(null, corners.map(function (p) { return p.x; })),
          minY: Math.min.apply(null, corners.map(function (p) { return p.y; })),
          maxY: Math.max.apply(null, corners.map(function (p) { return p.y; })),
          corners: corners
        };
      }
    }
    return shapes;
  })();

  /* ============================================================
     ПОЗИЦИИ ПОСТРОЕК
     ============================================================ */
  function pointInPolygon(px, py, corners) {
    var inside = false;
    for (var i = 0, j = corners.length - 1; i < corners.length; j = i++) {
      var xi = corners[i].x, yi = corners[i].y;
      var xj = corners[j].x, yj = corners[j].y;
      var intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function isFarEnough(px, py, positions, minDist) {
    var md2 = minDist * minDist;
    for (var i = 0; i < positions.length; i++) {
      var dx = positions[i].x - px, dy = positions[i].y - py;
      if (dx * dx + dy * dy < md2) return false;
    }
    return true;
  }

  function insideTextZone(px, py, cx, cy, hasFort, hasSettlement, settlementPos) {
    if (Math.abs(px - cx) < FACTORY_TEXT_HALF_W &&
        py > cy - FACTORY_TEXT_UP &&
        py < cy - FACTORY_TEXT_DOWN) return true;

    if (hasSettlement) {
      var sp = settlementPos || { x: cx, y: cy };
      var sdx = px - sp.x, sdy = py - sp.y;
      if (sdx * sdx + sdy * sdy < SETTLEMENT_INNER_R * SETTLEMENT_INNER_R) return true;
    }

    if (hasFort && Math.abs(px - cx) < 22 && py > cy + 20 && py < cy + 34) return true;

    return false;
  }

  function allBuildingPositions(province) {
    var all = [];
    if (province.factoryPositions) all = all.concat(province.factoryPositions);
    if (province.steelMillPositions) all = all.concat(province.steelMillPositions);
    if (province.barracksPos) all.push(province.barracksPos);
    if (province.tankFactoryPos) all.push(province.tankFactoryPos);
    return all;
  }

  function generateBuildingPosition(province, existing) {
    var shape = PROVINCE_SHAPES[province.id];
    var corners = shape.corners, cx = shape.cx, cy = shape.cy;
    var minX = shape.minX + FACTORY_EDGE_PADDING;
    var maxX = shape.maxX - FACTORY_EDGE_PADDING;
    var minY = shape.minY + FACTORY_EDGE_PADDING;
    var maxY = shape.maxY - FACTORY_EDGE_PADDING;
    var hasFort = province.fort > 0;
    var hasSettlement = province.settlementLevel > 0;

    if (existing.length > 0 && Math.random() < CLUSTER_CHANCE) {
      var anchor = existing[Math.floor(Math.random() * existing.length)];
      var angle = Math.random() * Math.PI * 2;
      var dist = 1 + Math.random() * 1.8;
      var ncx = anchor.x + Math.cos(angle) * dist;
      var ncy = anchor.y + Math.sin(angle) * dist;
      if (pointInPolygon(ncx, ncy, corners) &&
          !insideTextZone(ncx, ncy, cx, cy, hasFort, hasSettlement, province.settlementPos)) {
        return { x: Math.round(ncx), y: Math.round(ncy) };
      }
    }

    for (var i = 0; i < 200; i++) {
      var px = minX + Math.random() * (maxX - minX);
      var py = minY + Math.random() * (maxY - minY);
      if (!pointInPolygon(px, py, corners)) continue;
      if (insideTextZone(px, py, cx, cy, hasFort, hasSettlement, province.settlementPos)) continue;
      if (!isFarEnough(px, py, existing, FACTORY_MIN_DIST)) continue;
      return { x: Math.round(px), y: Math.round(py) };
    }

    for (var j = 0; j < 150; j++) {
      var px2 = minX + Math.random() * (maxX - minX);
      var py2 = minY + Math.random() * (maxY - minY);
      if (!pointInPolygon(px2, py2, corners)) continue;
      if (insideTextZone(px2, py2, cx, cy, hasFort, hasSettlement, province.settlementPos)) continue;
      return { x: Math.round(px2), y: Math.round(py2) };
    }

    return { x: Math.round(cx), y: Math.round(cy + 40) };
  }

  function ensureAllBuildingPositions(province) {
    if (!province.factoryPositions) province.factoryPositions = [];
    if (!province.steelMillPositions) province.steelMillPositions = [];

    var all = allBuildingPositions(province);

    while (province.factoryPositions.length < province.factories) {
      var posF = generateBuildingPosition(province, all);
      province.factoryPositions.push(posF);
      all.push(posF);
    }
    if (province.factoryPositions.length > province.factories) {
      province.factoryPositions.length = province.factories;
    }

    while (province.steelMillPositions.length < province.steelMills) {
      var posS = generateBuildingPosition(province, all);
      province.steelMillPositions.push(posS);
      all.push(posS);
    }
    if (province.steelMillPositions.length > province.steelMills) {
      province.steelMillPositions.length = province.steelMills;
    }

    if (province.barracks > 0 && !province.barracksPos) {
      province.barracksPos = generateBuildingPosition(province, all);
      all.push(province.barracksPos);
    }
    if (province.tankFactory > 0 && !province.tankFactoryPos) {
      province.tankFactoryPos = generateBuildingPosition(province, all);
      all.push(province.tankFactoryPos);
    }

    if (province.settlementLevel > 0 && !province.settlementPos) {
      var s = PROVINCE_SHAPES[province.id];
      province.settlementPos = {
        x: Math.round(s.cx + (Math.random() * 2 - 1) * SETTLEMENT_OFFSET),
        y: Math.round(s.cy + (Math.random() * 2 - 1) * SETTLEMENT_OFFSET)
      };
    }
  }

  /* ============================================================
     ГРАНИЦЫ
     ============================================================ */
  function buildOutlinePath() {
    var topY = GEO_CY - GEO_RY;
    var bottomY = GEO_CY + GEO_RY;
    return "M " + GEO_CX + " " + topY +
      " A " + GEO_RX + " " + GEO_RY + " 0 1 1 " + GEO_CX + " " + bottomY +
      " A " + GEO_RX + " " + GEO_RY + " 0 1 1 " + GEO_CX + " " + topY + " Z";
  }

  function renderBorderLayer() {
    while (borderLayer.firstChild) borderLayer.removeChild(borderLayer.firstChild);
    var outline = document.createElementNS(SVG_NS, "path");
    outline.setAttribute("d", buildOutlinePath());
    outline.setAttribute("class", "border-outline");
    outline.setAttribute("aria-hidden", "true");
    borderLayer.appendChild(outline);
    /* The old thick political front line is deliberately not drawn. */
  }

  /* ============================================================
     КАМЕРА (viewBox)
     ============================================================ */
  function applyCamera() {
    /* The SVG viewBox remains fixed. Pan/zoom only updates the one map-world group transform. */
    var scaleX = BASE_VB_W / Math.max(1, cam.w);
    var scaleY = BASE_VB_H / Math.max(1, cam.h);
    scaleX = Math.round(scaleX * 1000) / 1000;
    scaleY = Math.round(scaleY * 1000) / 1000;
    var tx = Math.round(-Math.round(cam.x) * scaleX);
    var ty = Math.round(-Math.round(cam.y) * scaleY);
    if (mapWorldEl) {
      mapWorldEl.setAttribute("transform",
        "translate(" + tx + " " + ty + ") scale(" + scaleX + " " + scaleY + ")");
    }

    var zoomPercent = Math.round((BASE_VB_W / Math.max(1, Math.round(cam.w))) * 100);
    var zoomLevel = zoomPercent / 100;
    if (Math.abs(zoomLevel - lastAppliedZoom) > 0.005) {
      lastAppliedZoom = zoomLevel;
      updateLabelsVisibilityFromZoom(zoomLevel);
    }
  }

  function camLoop() {
    var dx = camTarget.x - cam.x;
    var dy = camTarget.y - cam.y;
    var dw = camTarget.w - cam.w;
    var dh = camTarget.h - cam.h;

    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 &&
        Math.abs(dw) < 0.05 && Math.abs(dh) < 0.05) {
      cam.x = camTarget.x;
      cam.y = camTarget.y;
      cam.w = camTarget.w;
      cam.h = camTarget.h;
      applyCamera();
      svgEl.classList.remove("is-camera-active");
      camAnimating = false;
      if (!dragData) document.documentElement.classList.remove("camera-busy");
      return;
    }

    cam.x += dx * CAM_LERP;
    cam.y += dy * CAM_LERP;
    cam.w += dw * CAM_LERP;
    cam.h += dh * CAM_LERP;

    applyCamera();
    requestAnimationFrame(camLoop);
  }

  function requestCameraUpdate() {
    if (!camAnimating) {
      camAnimating = true;
      svgEl.classList.add("is-camera-active");
      document.documentElement.classList.add("camera-busy");
      requestAnimationFrame(camLoop);
    }
  }

  function updateLabelsVisibilityFromZoom(zoomLevel) {
    var t = (zoomLevel - 1.3) / (2.0 - 1.3);
    t = Math.max(0, Math.min(1, t));
    labelsLayer.style.opacity        = String(t);
    factoriesLayer.style.opacity     = String(t);
    factionLabelsLayer.style.opacity = "1";
    var countryNameLabels = factionLabelsLayer.querySelector("#country-name-labels");
    var subjectNameLabels = factionLabelsLayer.querySelector("#subject-name-labels");
    if (countryNameLabels) countryNameLabels.style.opacity = String(1 - t);
    if (subjectNameLabels) subjectNameLabels.style.opacity = String(t);
    settlementsLayer.style.opacity   = String(0.65 + 0.35 * t);
    document.body.classList.toggle("zoomed-out", t < ZOOMED_OUT_THRESHOLD);
  }

  function clampCameraTarget() {
    var cMinX = 0, cMaxX = BASE_VB_W, cMinY = 0, cMaxY = BASE_VB_H;

    if (camTarget.w < MIN_VBW) camTarget.w = MIN_VBW;
    if (camTarget.w > MAX_VBW) camTarget.w = MAX_VBW;

    var ratio = BASE_VB_H / BASE_VB_W;
    camTarget.w = Math.max(Math.ceil(MIN_VBW), Math.min(Math.floor(MAX_VBW), Math.round(camTarget.w)));
    camTarget.h = Math.round(camTarget.w * ratio);

    if (camTarget.w >= BASE_VB_W) {
      camTarget.x = Math.round((BASE_VB_W - camTarget.w) / 2);
    } else {
      var minX = cMinX + CAM_MIN_VIS - camTarget.w;
      var maxX = cMaxX - CAM_MIN_VIS;
      camTarget.x = Math.round(Math.max(minX, Math.min(maxX, camTarget.x)));
    }

    if (camTarget.h >= BASE_VB_H) {
      camTarget.y = Math.round((BASE_VB_H - camTarget.h) / 2);
    } else {
      var minY = cMinY + CAM_MIN_VIS - camTarget.h;
      var maxY = cMaxY - CAM_MIN_VIS;
      camTarget.y = Math.round(Math.max(minY, Math.min(maxY, camTarget.y)));
    }
  }

  function svgPointFromEvent(e) {
    var rect = svgEl.getBoundingClientRect();
    var baseW = rect.width, baseH = rect.height;
    var viewAspect = cam.w / cam.h;
    var elAspect = baseW / baseH;
    var scale, offsetX, offsetY;
    if (elAspect > viewAspect) {
      scale = baseH / cam.h;
      offsetX = (baseW - cam.w * scale) / 2;
      offsetY = 0;
    } else {
      scale = baseW / cam.w;
      offsetX = 0;
      offsetY = (baseH - cam.h * scale) / 2;
    }
    return {
      x: Math.round(cam.x + (e.clientX - rect.left - offsetX) / scale),
      y: Math.round(cam.y + (e.clientY - rect.top - offsetY) / scale)
    };
  }

  function resetView() {
    cam.x = 0; cam.y = 0; cam.w = BASE_VB_W; cam.h = BASE_VB_H;
    camTarget.x = 0; camTarget.y = 0; camTarget.w = BASE_VB_W; camTarget.h = BASE_VB_H;
    lastAppliedZoom = -1;
    svgEl.classList.remove("is-camera-active");
    svgEl.classList.remove("is-dragging");
    document.documentElement.classList.remove("camera-busy");
    dragData = null;
    applyCamera();
  }

  function onWheel(e) {
    var zoomingOut = e.deltaY > 0;
    if (zoomingOut && camTarget.w >= MAX_VBW - 0.1) return;
    if (!zoomingOut && camTarget.w <= MIN_VBW + 0.1) return;
    e.preventDefault();

    var mouseSvg = svgPointFromEvent(e);

    var factor = zoomingOut ? 1.15 : (1 / 1.15);
    var newW = Math.round(cam.w * factor);
    if (newW < Math.ceil(MIN_VBW)) newW = Math.ceil(MIN_VBW);
    if (newW > Math.floor(MAX_VBW)) newW = Math.floor(MAX_VBW);
    var newH = Math.round(newW * (BASE_VB_H / BASE_VB_W));

    var fx = (mouseSvg.x - cam.x) / cam.w;
    var fy = (mouseSvg.y - cam.y) / cam.h;

    camTarget.x = Math.round(mouseSvg.x - fx * newW);
    camTarget.y = Math.round(mouseSvg.y - fy * newH);
    camTarget.w = newW;
    camTarget.h = newH;

    clampCameraTarget();
    requestCameraUpdate();
  }

  /* ============================================================
     УПРАВЛЕНИЕ МЫШЬЮ — ЛКМ ВЫБОР И РАМКА, СКМ ПАНОРАМА
     ============================================================ */
  var selectionRectEl = null;

  function clientToMapWorld(clientX, clientY) {
    if (!svgEl || !mapWorldEl || typeof svgEl.createSVGPoint !== "function") return null;
    var screenPoint = svgEl.createSVGPoint();
    screenPoint.x = clientX;
    screenPoint.y = clientY;
    var matrix = mapWorldEl.getScreenCTM();
    if (!matrix) return null;
    try {
      return screenPoint.matrixTransform(matrix.inverse());
    } catch (error) {
      return null;
    }
  }

  function updateSelectionRectangle(pointA, pointB) {
    if (!pointA || !pointB || !mapWorldEl) return;
    if (!selectionRectEl) {
      selectionRectEl = document.createElementNS(SVG_NS, "rect");
      selectionRectEl.setAttribute("class", "area-selection-rect");
      selectionRectEl.setAttribute("aria-hidden", "true");
      selectionRectEl.setAttribute("pointer-events", "none");
      mapWorldEl.appendChild(selectionRectEl);
    }
    var left = Math.min(pointA.x, pointB.x);
    var top = Math.min(pointA.y, pointB.y);
    var width = Math.abs(pointB.x - pointA.x);
    var height = Math.abs(pointB.y - pointA.y);
    selectionRectEl.setAttribute("x", String(left));
    selectionRectEl.setAttribute("y", String(top));
    selectionRectEl.setAttribute("width", String(width));
    selectionRectEl.setAttribute("height", String(height));
  }

  function removeSelectionRectangle() {
    if (selectionRectEl && selectionRectEl.parentNode) selectionRectEl.parentNode.removeChild(selectionRectEl);
    selectionRectEl = null;
    svgEl.classList.remove("is-area-selecting");
  }

  function selectionPointInsideRectangle(point, rectangle) {
    return point.x >= rectangle.left && point.x <= rectangle.right &&
      point.y >= rectangle.top && point.y <= rectangle.bottom;
  }

  function segmentsIntersect(a, b, c, d) {
    function cross(p, q, r) {
      return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    }
    function onSegment(p, q, r) {
      return q.x >= Math.min(p.x, r.x) - 0.001 && q.x <= Math.max(p.x, r.x) + 0.001 &&
        q.y >= Math.min(p.y, r.y) - 0.001 && q.y <= Math.max(p.y, r.y) + 0.001;
    }
    var first = cross(a, b, c);
    var second = cross(a, b, d);
    var third = cross(c, d, a);
    var fourth = cross(c, d, b);
    if (((first > 0 && second < 0) || (first < 0 && second > 0)) &&
        ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))) return true;
    if (Math.abs(first) < 0.001 && onSegment(a, c, b)) return true;
    if (Math.abs(second) < 0.001 && onSegment(a, d, b)) return true;
    if (Math.abs(third) < 0.001 && onSegment(c, a, d)) return true;
    if (Math.abs(fourth) < 0.001 && onSegment(c, b, d)) return true;
    return false;
  }

  function provinceIntersectsSelectionRectangle(shape, rectangle) {
    if (!shape || shape.maxX < rectangle.left || shape.minX > rectangle.right ||
        shape.maxY < rectangle.top || shape.minY > rectangle.bottom) return false;
    var center = { x: shape.cx, y: shape.cy };
    if (selectionPointInsideRectangle(center, rectangle)) return true;
    var rectangleCorners = [
      { x: rectangle.left, y: rectangle.top },
      { x: rectangle.right, y: rectangle.top },
      { x: rectangle.right, y: rectangle.bottom },
      { x: rectangle.left, y: rectangle.bottom }
    ];
    for (var cornerIndex = 0; cornerIndex < shape.corners.length; cornerIndex++) {
      if (selectionPointInsideRectangle(shape.corners[cornerIndex], rectangle)) return true;
    }
    for (var rectangleCornerIndex = 0; rectangleCornerIndex < rectangleCorners.length; rectangleCornerIndex++) {
      if (pointInPolygon(rectangleCorners[rectangleCornerIndex].x, rectangleCorners[rectangleCornerIndex].y, shape.corners)) return true;
    }
    for (var edgeIndex = 0; edgeIndex < shape.corners.length; edgeIndex++) {
      var polygonStart = shape.corners[edgeIndex];
      var polygonEnd = shape.corners[(edgeIndex + 1) % shape.corners.length];
      for (var rectangleEdgeIndex = 0; rectangleEdgeIndex < rectangleCorners.length; rectangleEdgeIndex++) {
        var rectangleStart = rectangleCorners[rectangleEdgeIndex];
        var rectangleEnd = rectangleCorners[(rectangleEdgeIndex + 1) % rectangleCorners.length];
        if (segmentsIntersect(polygonStart, polygonEnd, rectangleStart, rectangleEnd)) return true;
      }
    }
    return false;
  }

  function finishAreaSelection(startPoint, endPoint, additive) {
    var rectangle = {
      left: Math.min(startPoint.x, endPoint.x),
      top: Math.min(startPoint.y, endPoint.y),
      right: Math.max(startPoint.x, endPoint.x),
      bottom: Math.max(startPoint.y, endPoint.y)
    };
    var hits = [];
    state.provinces.forEach(function (province) {
      if (province.owner !== PLAYER) return;
      if (provinceIntersectsSelectionRectangle(PROVINCE_SHAPES[province.id], rectangle)) hits.push(province.id);
    });
    var combined = additive ? selectedProvinceIds.slice() : [];
    if (additive && combined.length === 0 && selectedId !== null) {
      var previousSelection = getProvince(selectedId);
      if (previousSelection && previousSelection.owner === PLAYER) combined.push(selectedId);
    }
    hits.forEach(function (provinceId) {
      if (combined.indexOf(provinceId) === -1) combined.push(provinceId);
    });
    selectedProvinceIds = combined.filter(function (provinceId, index, all) {
      var province = getProvince(provinceId);
      return all.indexOf(provinceId) === index && province && province.owner === PLAYER;
    });
    if (selectedProvinceIds.length) selectedId = selectedProvinceIds[selectedProvinceIds.length - 1];
    else if (!additive) selectedId = null;
    render();
  }

  function onMouseDown(e) {
    if (e.button === 0) {
      if (hasMovedTimeout !== null) {
        window.clearTimeout(hasMovedTimeout);
        hasMovedTimeout = null;
      }
      hasMoved = false;
      if (gameOver || moveFromId !== null || rerouteMovementId !== null) return;
      var worldPoint = clientToMapWorld(e.clientX, e.clientY);
      if (!worldPoint) return;
      dragData = {
        button: 0,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWorldX: worldPoint.x,
        startWorldY: worldPoint.y,
        moved: false,
        additive: !!e.shiftKey
      };
      return;
    }

    if (e.button !== 1) return;
    if (hasMovedTimeout !== null) {
      window.clearTimeout(hasMovedTimeout);
      hasMovedTimeout = null;
    }
    hasMoved = false;
    e.preventDefault();
    dragData = {
      button: 1,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTargetX: camTarget.x,
      startTargetY: camTarget.y,
      moved: false
    };
    svgEl.classList.add("is-dragging");
  }

  function onMouseMove(e) {
    if (!dragData) return;
    var dx = e.clientX - dragData.startClientX;
    var dy = e.clientY - dragData.startClientY;
    if (!dragData.moved) {
      if (Math.abs(dx) <= DRAG_THRESHOLD_PX && Math.abs(dy) <= DRAG_THRESHOLD_PX) return;
      dragData.moved = true;
      hasMoved = true;
      if (dragData.button === 0) {
        svgEl.classList.add("is-area-selecting");
      } else {
        document.documentElement.classList.add("camera-busy");
      }
    }

    if (dragData.button === 0) {
      var currentWorldPoint = clientToMapWorld(e.clientX, e.clientY);
      if (!currentWorldPoint) return;
      updateSelectionRectangle(
        { x: dragData.startWorldX, y: dragData.startWorldY },
        { x: currentWorldPoint.x, y: currentWorldPoint.y }
      );
      e.preventDefault();
      return;
    }

    if (dragData.button !== 1) return;
    var rect = svgEl.getBoundingClientRect();
    var viewAspect = camTarget.w / camTarget.h;
    var elAspect = rect.width / rect.height;
    var pxPerUnit;
    if (elAspect > viewAspect) pxPerUnit = rect.height / camTarget.h;
    else pxPerUnit = rect.width / camTarget.w;
    if (pxPerUnit < 0.0001) return;
    camTarget.x = Math.round(dragData.startTargetX - dx / pxPerUnit);
    camTarget.y = Math.round(dragData.startTargetY - dy / pxPerUnit);
    clampCameraTarget();
    cam.x = camTarget.x;
    cam.y = camTarget.y;
    applyCamera();
  }

  function onMouseUp(e) {
    if (!dragData) return;
    var completedDrag = dragData;
    var suppressClickFromDrag = !!completedDrag.moved;
    dragData = null;

    if (completedDrag.button === 0) {
      if (completedDrag.moved) {
        var endWorldPoint = clientToMapWorld(e && Number.isFinite(e.clientX) ? e.clientX : completedDrag.startClientX,
          e && Number.isFinite(e.clientY) ? e.clientY : completedDrag.startClientY);
        var startPoint = { x: completedDrag.startWorldX, y: completedDrag.startWorldY };
        if (endWorldPoint) finishAreaSelection(startPoint, endWorldPoint, completedDrag.additive);
      }
      removeSelectionRectangle();
    }

    svgEl.classList.remove("is-dragging");
    if (!camAnimating) document.documentElement.classList.remove("camera-busy");
    if (hasMovedTimeout !== null) {
      window.clearTimeout(hasMovedTimeout);
      hasMovedTimeout = null;
    }
    if (suppressClickFromDrag) {
      hasMoved = true;
      hasMovedTimeout = window.setTimeout(function () {
        hasMoved = false;
        hasMovedTimeout = null;
      }, 100);
    } else {
      hasMoved = false;
    }
  }

  /* ============================================================
     ТАБЫ
     ============================================================ */
  function switchTab(tabName) {
    activeTab = tabName === "army" ? "army" : "economy";
    for (var i = 0; i < tabButtons.length; i++) {
      var tab = tabButtons[i];
      tab.classList.toggle("active", tab.dataset.tab === activeTab);
    }
    if (tabArmyEl)    tabArmyEl.classList.toggle("hidden", activeTab !== "army");
    if (tabEconomyEl) tabEconomyEl.classList.toggle("hidden", activeTab !== "economy");
    if (state && riversLayer) saveGame();
  }

  for (var t = 0; t < tabButtons.length; t++) {
    (function (tab) {
      tab.addEventListener("click", function () { switchTab(tab.dataset.tab); });
    })(tabButtons[t]);
  }

  /* ============================================================
     РЕНДЕР
     ============================================================ */
  function render() {
    var war = isAtWar();
    document.body.classList.toggle("diplomacy-war", war);
    playerGoldEl.textContent  = String(round1(state.gold.player));
    playerSteelEl.textContent = String(round1(state.steel.player));
    botGoldEl.textContent     = String(round1(state.gold.bot));
    botSteelEl.textContent    = String(round1(state.steel.bot));
    turnNumberEl.textContent  = String(state.turn);

    var forecast = getIncomeForecast();
    playerGoldIncEl.textContent  = "(" + (forecast.playerGold >= 0 ? "+" : "") + forecast.playerGold + ")";
    playerSteelIncEl.textContent = "(+" + forecast.playerSteel + ")";
    botGoldIncEl.textContent     = "(" + (forecast.botGold >= 0 ? "+" : "") + forecast.botGold + ")";
    botSteelIncEl.textContent    = "(+" + forecast.botSteel + ")";

    var pInfl = getInflation(PLAYER), bInfl = getInflation(BOT);
    playerInflationEl.textContent = "[Инфляция: " + pInfl + "%]";
    botInflationEl.textContent    = "[Инфляция: " + bInfl + "%]";
    playerInflationEl.classList.remove("medium", "high");
    botInflationEl.classList.remove("medium", "high");
    if (pInfl >= 30) playerInflationEl.classList.add("high");
    else if (pInfl >= 10) playerInflationEl.classList.add("medium");
    if (bInfl >= 30) botInflationEl.classList.add("high");
    else if (bInfl >= 10) botInflationEl.classList.add("medium");

    var pSol = getTotalSoldiers(PLAYER), pSolL = getSoldierLimit(PLAYER);
    var pTk  = getTotalTanks(PLAYER), pTkL = getTankLimit(PLAYER);
    var bSol = getTotalSoldiers(BOT), bSolL = getSoldierLimit(BOT);
    var bTk  = getTotalTanks(BOT), bTkL = getTankLimit(BOT);

    playerSoldiersEl.textContent = String(pSol);
    playerSoldierLimitEl.textContent = "/" + pSolL;
    playerSoldierLimitEl.classList.toggle("over", pSol > pSolL);
    playerTanksEl.textContent = String(pTk);
    playerTankLimitEl.textContent = "/" + pTkL;
    playerTankLimitEl.classList.toggle("over", pTk > pTkL);
    botSoldiersEl.textContent = String(bSol);
    botSoldierLimitEl.textContent = "/" + bSolL;
    botSoldierLimitEl.classList.toggle("over", bSol > bSolL);
    botTanksEl.textContent = String(bTk);
    botTankLimitEl.textContent = "/" + bTkL;
    botTankLimitEl.classList.toggle("over", bTk > bTkL);

    if (legendBotTextEl) {
      legendBotTextEl.textContent = war ? "Союз Мечей (война)" : "Союз Мечей";
    }

    renderDiplomacy();
    renderMap();
    renderPanel();
    if (economyForecastModal && !economyForecastModal.classList.contains("hidden")) renderEconomyForecast();
    if (researchModal && !researchModal.classList.contains("hidden")) renderResearchModal();
    if (movementManagementModal && !movementManagementModal.classList.contains("hidden")) renderMovementManagement();
    saveGame();
  }

  function renderDiplomacy() {
    var war = isAtWar();
    var relations = state.diplomacy.relations;
    var statusText = statusLabel();
    var statusClass = war ? "war" : "peace";

    hudDiploStatus.textContent = statusText;
    hudDiploCard.classList.remove("peace", "war");
    hudDiploCard.classList.add("diplo", statusClass);

    diploStatusEl.textContent = statusText;
    diploStatusEl.className = "diplo-badge " + statusClass;
    diploRelationsEl.textContent = String(relations);
    diploRelationsHintEl.textContent = relationsHint();
    relationsFillEl.style.width = ((relations + 100) / 200 * 100) + "%";

    var relCost = inflateCost(IMPROVE_RELATIONS_COST, PLAYER);
    improveRelationsBtn.disabled =
      gameOver || state.gold.player < relCost || relations >= 100;
    improveRelationsBtn.textContent = "Улучшить отношения (−" + relCost + " зол., +20)";

    var canAid = !gameOver && !war && relations > AID_RELATIONS_REQUIRED &&
      aidReady() && state.gold.bot >= AID_GOLD;
    aidBtn.disabled = !canAid;

    var pactActive = nonAggressionTurns > 0;
    if (nonAggressionStatusEl) {
      nonAggressionStatusEl.textContent = pactActive
        ? "Пакт о ненападении (Осталось: " + nonAggressionTurns + " ходов)"
        : "Пакт о ненападении не действует.";
      nonAggressionStatusEl.classList.toggle("pact-active", pactActive);
    }
    if (nonAggressionBtn) {
      nonAggressionBtn.disabled = gameOver || war || pactActive ||
        state.gold.player < NON_AGGRESSION_COST;
      nonAggressionBtn.textContent = pactActive
        ? "Пакт о ненападении заключён"
        : "Заключить пакт о ненападении (−" + NON_AGGRESSION_COST + " зол.)";
    }

    if (peaceBtn) {
      peaceBtn.classList.toggle("hidden", !war);
      peaceBtn.disabled = gameOver || !war || relations < 0;
      peaceBtn.textContent = relations < 0
        ? "Мир недоступен: отношения должны быть 0 или выше"
        : "Заключить мир";
    }

    if (war) {
      aidHintEl.textContent = "Во время войны финансовая помощь недоступна.";
    } else if (relations <= AID_RELATIONS_REQUIRED) {
      aidHintEl.textContent = "Помощь доступна при мире и отношениях выше 50. Сейчас: " + relations + ".";
    } else if (!aidReady()) {
      aidHintEl.textContent = "Помощь на перезарядке. Осталось ходов: " + aidCooldownLeft() + ".";
    } else if (state.gold.bot < AID_GOLD) {
      aidHintEl.textContent = "У бота недостаточно золота для помощи.";
    } else {
      aidHintEl.textContent = "Помощь готова: +40 золота, отношения −30. Раз в 5 ходов.";
    }
  }


  function setActionButtonLabel(button, label) {
    if (!button) return;
    var textNode = button.querySelector(".button-label");
    if (!textNode) {
      button.textContent = "";
      textNode = document.createElement("span");
      textNode.className = "button-label";
      button.appendChild(textNode);
    }
    textNode.textContent = label;
  }


  function setActionButtonIcon(button, iconId) {
    if (!button) return;
    var use = button.querySelector(".action-icon use");
    if (use) use.setAttribute("href", "#" + iconId);
  }

  function makeUseIcon(iconId, x, y, scale) {
    var use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "#" + iconId);
    use.setAttribute("transform", "translate(" + x + " " + y + ") scale(" + scale + ")");
    return use;
  }

  function makeArmyCounter(province) {
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "province-army-counter");
    g.setAttribute("transform", "translate(0 -18)");
    g.appendChild(makeUseIcon("icon-soldier", -13, -1.7, .68));
    g.appendChild(makeSvgText("prov-units", -5, 2.5, String(province.soldiers)));
    g.appendChild(makeUseIcon("icon-tank", 7, -1.0, .68));
    g.appendChild(makeSvgText("prov-units", 15, 2.5, String(province.tanks)));
    return g;
  }

  function findFriendlyPath(startId, targetId, owner) {
    if (startId === targetId) return [startId];
    var start = getProvince(startId), target = getProvince(targetId);
    if (!start || !target || start.owner !== owner || target.owner !== owner) return null;

    var distances = {};
    var previous = {};
    var visited = {};
    state.provinces.forEach(function (province) { distances[province.id] = Infinity; });
    distances[startId] = 0;
    previous[startId] = null;

    while (true) {
      var current = null;
      var bestDistance = Infinity;
      state.provinces.forEach(function (province) {
        if (!visited[province.id] && distances[province.id] < bestDistance) {
          bestDistance = distances[province.id];
          current = province.id;
        }
      });
      if (current === null) return null;
      if (current === targetId) break;
      visited[current] = true;

      var currentProvince = getProvince(current);
      var edgeCost = 1 + (currentProvince.hasRiver ? 1 : 0);
      NEIGHBORS[current].forEach(function (nextId) {
        if (visited[nextId]) return;
        var nextProvince = getProvince(nextId);
        if (!nextProvince || nextProvince.owner !== owner) return;
        var candidateDistance = distances[current] + edgeCost;
        if (candidateDistance < distances[nextId]) {
          distances[nextId] = candidateDistance;
          previous[nextId] = current;
        }
      });
    }

    var route = [];
    var cursor = targetId;
    while (cursor !== null && cursor !== undefined) {
      route.push(cursor);
      cursor = previous[cursor];
    }
    route.reverse();
    return route.length && route[0] === startId ? route : null;
  }

  function movementRouteFor(from, targetId) {
    if (!from) return null;
    var target = getProvince(targetId);
    if (!target) return null;
    if (target.owner === from.owner) return findFriendlyPath(from.id, targetId, from.owner);
    if (!isAtWar() || NEIGHBORS[from.id].indexOf(targetId) === -1) return null;
    return [from.id, targetId];
  }

  function calculateRouteTurns(route) {
    if (!route || route.length < 2) return 0;
    var total = 0;
    for (var i = 0; i < route.length - 1; i++) {
      var from = getProvince(route[i]);
      total += 1 + (from && from.hasRiver ? 1 : 0);
    }
    return total;
  }

  function formatTurns(count) {
    var lastDigit = count % 10;
    var lastTwoDigits = count % 100;
    var word = "ходов";
    if (lastDigit === 1 && lastTwoDigits !== 11) word = "ход";
    else if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) word = "хода";
    return count + " " + word;
  }

  function movementTurnsLeft(movement) {
    if (!movement.route || movement.route.length < 2) return 0;
    var total = 0;
    for (var i = movement.routeIndex; i < movement.route.length - 1; i++) {
      var from = getProvince(movement.route[i]);
      var edgeCost = 1 + (from && from.hasRiver ? 1 : 0);
      if (i === movement.routeIndex) edgeCost -= movement.stepProgress || 0;
      total += Math.max(0, edgeCost);
    }
    return total;
  }

  function movementCurrentProvince(movement) {
    if (!movement || !Array.isArray(movement.route)) return null;
    return getProvince(movement.route[movement.routeIndex]);
  }

  function renderMovementManagement() {
    if (!movementManagementListEl) return;
    movementManagementListEl.textContent = "";
    var movements = state.movements.filter(function (movement) {
      return movement.owner === PLAYER;
    }).sort(function (a, b) {
      return movementTurnsLeft(a) - movementTurnsLeft(b);
    });
    if (!movements.length) {
      var empty = document.createElement("p");
      empty.className = "journal-empty";
      empty.textContent = "Ваших активных армий в пути нет.";
      movementManagementListEl.appendChild(empty);
    } else movements.forEach(function (movement) {
      var card = document.createElement("article");
      card.className = "movement-management-entry own-movement";
      var heading = document.createElement("div"); heading.className = "movement-management-entry-heading";
      var title = document.createElement("strong");
      title.textContent = "Драконья Мощь · " + movement.soldiers + " солдат / " + movement.tanks + " танков";
      var badge = document.createElement("span"); badge.className = "movement-owner-badge"; badge.textContent = "Ваш приказ";
      heading.appendChild(title); heading.appendChild(badge);
      var current = movementCurrentProvince(movement);
      var target = getProvince(movement.to);
      var routeText = movement.route.slice(movement.routeIndex).map(function (id) { return getProvince(id).name; }).join(" → ");
      var details = document.createElement("p"); details.className = "movement-management-details";
      details.textContent = "Текущая позиция: " + (current ? current.name : "неизвестно") + ". Цель: " + (target ? target.name : "неизвестно") + ". Маршрут: " + routeText + ". Осталось примерно " + formatTurns(movementTurnsLeft(movement)) + ".";
      card.appendChild(heading); card.appendChild(details);
      if (movement.owner === PLAYER) {
        var actions = document.createElement("div"); actions.className = "movement-management-actions";
        var redirect = document.createElement("button"); redirect.type = "button"; redirect.className = "btn btn-primary"; redirect.textContent = "Перенаправить";
        redirect.addEventListener("click", function () { beginMovementRedirect(movement.id); });
        var recall = document.createElement("button"); recall.type = "button"; recall.className = "btn btn-ghost"; recall.textContent = "Отозвать";
        recall.addEventListener("click", function () { recallMovement(movement.id); });
        actions.appendChild(redirect); actions.appendChild(recall); card.appendChild(actions);
      }
      movementManagementListEl.appendChild(card);
    });
    if (movementRedirectHintEl) movementRedirectHintEl.classList.toggle("hidden", rerouteMovementId === null);
    if (movementManagementOrdersListEl) {
      movementManagementOrdersListEl.textContent = "";
      var queuedOrders = [];
      provincesOf(PLAYER).forEach(function (province) {
        province.queue.forEach(function (order, index) {
          queuedOrders.push({ province: province, order: order, index: index });
        });
      });
      if (!queuedOrders.length) {
        var noOrders = document.createElement("p"); noOrders.className = "journal-empty";
        noOrders.textContent = "Незавершённых производственных приказов нет.";
        movementManagementOrdersListEl.appendChild(noOrders);
      } else {
        queuedOrders.sort(function (a, b) { return a.order.turnsLeft - b.order.turnsLeft; }).forEach(function (item) {
          var card = document.createElement("article"); card.className = "movement-management-entry own-movement";
          var title = document.createElement("strong");
          var levelSuffix = item.order.targetLevel ? " · уровень " + item.order.targetLevel : "";
          title.textContent = item.province.name + " · " + (QUEUE_LABELS[item.order.type] || item.order.type) + levelSuffix;
          var details = document.createElement("p"); details.className = "movement-management-details";
          details.textContent = "Осталось " + formatTurns(item.order.turnsLeft) + ". Возврат при отмене: 75% оплаченных ресурсов.";
          var cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "btn btn-ghost"; cancel.textContent = "Отменить приказ";
          cancel.addEventListener("click", function () { cancelQueuedOrder(item.province.id, item.index); renderMovementManagement(); });
          card.appendChild(title); card.appendChild(details); card.appendChild(cancel);
          movementManagementOrdersListEl.appendChild(card);
        });
      }
    }
  }

  function openMovementManagement() {
    if (!movementManagementModal) return;
    renderMovementManagement();
    movementManagementModal.classList.remove("hidden");
  }

  function closeMovementManagement() {
    if (movementManagementModal) movementManagementModal.classList.add("hidden");
  }

  function findMovementById(movementId) {
    return state.movements.find(function (movement) { return movement.id === movementId; }) || null;
  }

  function recallMovement(movementId) {
    var movementIndex = state.movements.findIndex(function (item) { return item.id === movementId; });
    if (movementIndex < 0) return;
    var movement = state.movements[movementIndex];
    if (movement.owner !== PLAYER || gameOver) return;
    var currentProvince = movementCurrentProvince(movement);
    var originId = currentProvince ? currentProvince.id : movement.from;
    var safeProvince = findNearestOwnedProvince(originId, PLAYER);
    if (!safeProvince) return;
    safeProvince.soldiers += movement.soldiers;
    safeProvince.tanks += movement.tanks;
    state.movements.splice(movementIndex, 1);
    logEvent("military", "Марш отозван", "Игрок отозвал отряд из " + (currentProvince ? currentProvince.name : "маршрута") + ". Войска возвращены в провинцию " + safeProvince.name + ": " + movement.soldiers + " солдат и " + movement.tanks + " танков.", PLAYER);
    render();
    renderMovementManagement();
    saveGame();
  }

  function beginMovementRedirect(movementId) {
    var movement = findMovementById(movementId);
    if (!movement || movement.owner !== PLAYER || gameOver) return;
    rerouteMovementId = movementId;
    closeMovementManagement();
    if (moveFromId !== null) cancelMoveMode();
    if (turnNoticeEl) {
      turnNoticeEl.textContent = "ВЫБЕРИ НОВУЮ ЦЕЛЬ МАРША";
      turnNoticeEl.classList.add("show");
    }
    render();
  }

  function cancelMovementRedirect() {
    rerouteMovementId = null;
    if (movementRedirectHintEl) movementRedirectHintEl.classList.add("hidden");
    if (turnNoticeEl) turnNoticeEl.classList.remove("show");
  }

  function redirectMovementToProvince(targetId) {
    var movement = findMovementById(rerouteMovementId);
    if (!movement || movement.owner !== PLAYER) { cancelMovementRedirect(); return false; }
    var currentProvince = movementCurrentProvince(movement);
    var target = getProvince(targetId);
    if (!currentProvince || !target || currentProvince.id === target.id) return false;
    var route = movementRouteFor(currentProvince, targetId);
    if (!route || route.length < 2) {
      if (turnNoticeEl) {
        turnNoticeEl.textContent = "Недопустимая цель: путь должен проходить по своим провинциям, а атака — идти в соседнюю провинцию во время войны.";
        turnNoticeEl.classList.add("show");
      }
      return false;
    }
    movement.from = currentProvince.id;
    movement.to = targetId;
    movement.route = route.slice();
    movement.routeIndex = 0;
    movement.stepProgress = 0;
    logEvent("military", "Марш перенаправлен", "Игрок перенаправил армию из провинции " + currentProvince.name + " в провинцию " + target.name + ". Новый расчётный срок: " + formatTurns(calculateRouteTurns(route)) + ".", PLAYER);
    cancelMovementRedirect();
    render();
    saveGame();
    return true;
  }

  function expectedFriendlyReinforcements(targetProvince, arrivalTurns) {
    var result = { soldiers: 0, tanks: 0 };
    if (!targetProvince) return result;
    var horizon = Number.isFinite(arrivalTurns) ? arrivalTurns : 1;
    state.movements.forEach(function (movement) {
      if (movement.owner !== targetProvince.owner || movement.to !== targetProvince.id ||
          movement.route[movement.route.length - 1] !== targetProvince.id || movementTurnsLeft(movement) > horizon) return;
      var currentProvince = movementCurrentProvince(movement);
      if (!currentProvince || currentProvince.owner !== movement.owner) return;
      result.soldiers += movement.soldiers;
      result.tanks += movement.tanks;
    });
    return result;
  }

  function expectedAttackingReinforcements(targetProvince, arrivalTurns, attackerOwner) {
    var result = { soldiers: 0, tanks: 0, count: 0, groups: [] };
    if (!targetProvince || targetProvince.owner === attackerOwner) return result;
    state.movements.forEach(function (movement) {
      if (movement.owner !== attackerOwner || movement.to !== targetProvince.id || movementTurnsLeft(movement) !== arrivalTurns) return;
      if (!movement.route || movement.route.length < 2 || movement.route[movement.route.length - 1] !== targetProvince.id) return;
      var currentProvince = movementCurrentProvince(movement);
      if (!currentProvince || currentProvince.owner !== attackerOwner) return;
      var previousId = movement.route[movement.route.length - 2];
      if (!NEIGHBORS[previousId] || NEIGHBORS[previousId].indexOf(targetProvince.id) === -1) return;
      result.soldiers += movement.soldiers;
      result.tanks += movement.tanks;
      result.count += 1;
      result.groups.push({ soldiers: movement.soldiers, tanks: movement.tanks });
    });
    return result;
  }

  function renderPanelMovementStatus(province) {
    if (!panelMovementsEl) return;
    var relevant = state.movements.filter(function (mv) {
      var currentId = mv.route[mv.routeIndex];
      return mv.owner === province.owner &&
        (mv.from === province.id || mv.to === province.id || currentId === province.id);
    });
    if (!relevant.length) {
      panelMovementsEl.classList.add("hidden");
      panelMovementsEl.textContent = "";
      return;
    }
    panelMovementsEl.classList.remove("hidden");
    panelMovementsEl.innerHTML = "";
    relevant.forEach(function (mv) {
      var row = document.createElement("div");
      row.className = "movement-status-row";
      var title = document.createElement("strong");
      title.textContent = "Армия в пути к " + getProvince(mv.to).name;
      var detail = document.createElement("div");
      detail.textContent = "Осталось ходов: " + movementTurnsLeft(mv) +
        " · " + mv.soldiers + " солдат, " + mv.tanks + " танков";
      row.appendChild(title);
      row.appendChild(detail);
      panelMovementsEl.appendChild(row);
    });
  }

  function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function makeSvgText(className, x, y, text) {
    var t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", className);
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.textContent = text;
    return t;
  }

  function clusterPositions(positions, mergeRadius) {
    if (!positions || positions.length === 0) return [];
    var clusters = [];
    var used = new Array(positions.length);
    for (var u = 0; u < used.length; u++) used[u] = false;

    for (var i = 0; i < positions.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      var sx = positions[i].x, sy = positions[i].y;
      var count = 1;

      for (var j = i + 1; j < positions.length; j++) {
        if (used[j]) continue;
        var dx = positions[j].x - positions[i].x;
        var dy = positions[j].y - positions[i].y;
        if (dx * dx + dy * dy < mergeRadius * mergeRadius) {
          used[j] = true;
          sx += positions[j].x;
          sy += positions[j].y;
          count++;
        }
      }

      clusters.push({ x: Math.round(sx / count), y: Math.round(sy / count), count: count });
    }
    return clusters;
  }

  function makeMergedIcon(refId, cluster, layer) {
    var count = cluster.count;
    var extra = count - 1;
    var iconSize = BASE_ICON_SIZE + extra;
    var scale = iconSize / BASE_ICON_SIZE;

    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "building-icon");
    g.setAttribute("transform",
      "translate(" + Math.round(cluster.x) + "," + Math.round(cluster.y) +
      ") scale(" + Math.round(scale * 100) / 100 + ")");

    var u = document.createElementNS(SVG_NS, "use");
    u.setAttribute("href", "#" + refId);
    g.appendChild(u);
    layer.appendChild(g);

    if (count > 1) {
      var textY = 5 + scale * 3.5;
      var t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("class", "building-level");
      t.setAttribute("x", Math.round(cluster.x));
      t.setAttribute("y", Math.round(cluster.y + textY));
      t.textContent = "x" + count;
      layer.appendChild(t);
    }
  }

  function makeLeveledBuilding(refId, pos, level) {
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "building-icon");
    g.setAttribute("transform",
      "translate(" + Math.round(pos.x) + "," + Math.round(pos.y) + ")");

    var u = document.createElementNS(SVG_NS, "use");
    u.setAttribute("href", "#" + refId);
    g.appendChild(u);

    var t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", "building-level");
    t.setAttribute("x", "0");
    t.setAttribute("y", "7");
    t.textContent = String(level);
    g.appendChild(t);

    return g;
  }

  function makeSettlementIcon(level, pos) {
    var iconSize = 20 + (Math.max(1, Math.min(5, level)) - 1) * 2;
    var scale = iconSize / 10;

    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "settlement-icon");
    g.setAttribute("transform",
      "translate(" + Math.round(pos.x) + "," + Math.round(pos.y) + ")");

    var halo = document.createElementNS(SVG_NS, "circle");
    halo.setAttribute("class", "settlement-halo");
    halo.setAttribute("cx", "0");
    halo.setAttribute("cy", "0");
    halo.setAttribute("r", String(Math.round(iconSize * 0.5)));
    g.appendChild(halo);

    var inner = document.createElementNS(SVG_NS, "g");
    inner.setAttribute("transform", "scale(" + Math.round(scale * 100) / 100 + ")");
    var u = document.createElementNS(SVG_NS, "use");
    u.setAttribute("href", "#icon-settlement-" + level);
    inner.appendChild(u);
    g.appendChild(inner);

    var t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", "settlement-level");
    t.setAttribute("x", "0");
    t.setAttribute("y", String(Math.round(iconSize * 0.5 + 5)));
    t.textContent = "ур." + level;
    g.appendChild(t);

    return g;
  }

  function nearestFrontlineTarget(province) {
    var shape = PROVINCE_SHAPES[province.id];
    var directEnemies = NEIGHBORS[province.id].filter(function (nid) {
      return getProvince(nid).owner !== province.owner;
    });
    if (directEnemies.length) {
      var directX = 0, directY = 0;
      directEnemies.forEach(function (nid) {
        directX += PROVINCE_SHAPES[nid].cx;
        directY += PROVINCE_SHAPES[nid].cy;
      });
      return { x: directX / directEnemies.length, y: directY / directEnemies.length };
    }

    var frontier = state.provinces.filter(function (candidate) {
      return candidate.owner === province.owner && NEIGHBORS[candidate.id].some(function (nid) {
        return getProvince(nid).owner !== province.owner;
      });
    });
    if (frontier.length) {
      frontier.sort(function (a, b) {
        var sa = PROVINCE_SHAPES[a.id], sb = PROVINCE_SHAPES[b.id];
        var da = Math.hypot(sa.cx - shape.cx, sa.cy - shape.cy);
        var db = Math.hypot(sb.cx - shape.cx, sb.cy - shape.cy);
        return da - db;
      });
      var nearestFront = frontier[0];
      var frontShape = PROVINCE_SHAPES[nearestFront.id];
      var enemyIds = NEIGHBORS[nearestFront.id].filter(function (nid) {
        return getProvince(nid).owner !== province.owner;
      });
      if (enemyIds.length) {
        var ex = 0, ey = 0;
        enemyIds.forEach(function (nid) { ex += PROVINCE_SHAPES[nid].cx; ey += PROVINCE_SHAPES[nid].cy; });
        return { x: (ex / enemyIds.length + frontShape.cx) / 2, y: (ey / enemyIds.length + frontShape.cy) / 2 };
      }
      return { x: frontShape.cx, y: frontShape.cy };
    }

    /* Fallback for a campaign with no adjacent hostile cell yet: face outward toward the opposing half of the map. */
    return { x: province.owner === PLAYER ? BASE_VB_W : 0, y: shape.cy };
  }

  function fortPlacement(province) {
    var shape = PROVINCE_SHAPES[province.id];
    var target = nearestFrontlineTarget(province);
    var vx = target.x - shape.cx;
    var vy = target.y - shape.cy;
    var length = Math.hypot(vx, vy);
    if (length < 0.001) {
      vx = province.owner === PLAYER ? 1 : -1;
      vy = 0;
      length = 1;
    }
    var ux = vx / length, uy = vy / length;
    var halfW = (shape.maxX - shape.minX) / 2;
    var halfH = (shape.maxY - shape.minY) / 2;
    var edgeX = Math.abs(ux) > 0.001 ? halfW / Math.abs(ux) : Infinity;
    var edgeY = Math.abs(uy) > 0.001 ? halfH / Math.abs(uy) : Infinity;
    var inwardDistance = Math.min(edgeX, edgeY) * 0.68;
    inwardDistance = Math.max(10, Math.min(inwardDistance, 34));
    return {
      x: Math.round(shape.cx + ux * inwardDistance),
      y: Math.round(shape.cy + uy * inwardDistance),
      angle: 0
    };
  }

  function makeFortIcon(province) {
    var pos = fortPlacement(province);
    var group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "building-icon fort-icon");
    group.setAttribute("transform", "translate(" + Math.round(pos.x) + " " + Math.round(pos.y) + ") rotate(0)");
    var use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "#icon-fort");
    group.appendChild(use);
    return group;
  }

  function renderBuildings() {
    clearNode(industryLayer);
    clearNode(militaryLayer);
    clearNode(settlementsLayer);

    state.provinces.forEach(function (province) {
      ensureAllBuildingPositions(province);
    });

    state.provinces.forEach(function (province) {
      if (visualSettings.showFactories && province.factories > 0) {
        var fClusters = clusterPositions(province.factoryPositions, MERGE_RADIUS);
        fClusters.forEach(function (c) {
          makeMergedIcon("icon-factory", c, industryLayer);
        });
      }

      if (visualSettings.showFactories && province.steelMills > 0) {
        var sClusters = clusterPositions(province.steelMillPositions, MERGE_RADIUS);
        sClusters.forEach(function (c) {
          makeMergedIcon("icon-steel-mill", c, industryLayer);
        });
      }

      if (visualSettings.showMilitary && province.fort > 0) {
        militaryLayer.appendChild(makeFortIcon(province));
      }

      if (visualSettings.showMilitary && province.barracks > 0 && province.barracksPos) {
        militaryLayer.appendChild(
          makeLeveledBuilding("icon-barracks", province.barracksPos, province.barracks)
        );
      }

      if (visualSettings.showMilitary && province.tankFactory > 0 && province.tankFactoryPos) {
        militaryLayer.appendChild(
          makeLeveledBuilding("icon-tank-factory", province.tankFactoryPos, province.tankFactory)
        );
      }

      if (visualSettings.showSettlements && province.settlementLevel > 0 && province.settlementPos) {
        settlementsLayer.appendChild(
          makeSettlementIcon(province.settlementLevel, province.settlementPos)
        );
      }
    });
  }

  function bumpBuildingsVersion() {
    buildingsVersion++;
    lastRenderedBuildingsVersion = -1;
  }

  function renderBuildingsIfNeeded() {
    if (buildingsVersion === lastRenderedBuildingsVersion) return;
    lastRenderedBuildingsVersion = buildingsVersion;
    renderBuildings();
  }

  function renderMovements() {
    clearNode(movementsLayer);
    state.movements.forEach(function (mv) {
      if (!mv.route || mv.route.length < 2) return;
      var routePoints = mv.route.map(function (id) {
        var shape = PROVINCE_SHAPES[id];
        return Math.round(shape.cx) + "," + Math.round(shape.cy);
      });
      var path = document.createElementNS(SVG_NS, "polyline");
      path.setAttribute("points", routePoints.join(" "));
      path.setAttribute("class", "movement-route " + mv.owner);
      path.setAttribute("marker-end", "url(#arrow-" + mv.owner + ")");
      movementsLayer.appendChild(path);

      var currentId = mv.route[Math.min(mv.routeIndex, mv.route.length - 1)];
      var currentShape = PROVINCE_SHAPES[currentId];
      if (!currentShape) return;
      var token = document.createElementNS(SVG_NS, "g");
      token.setAttribute("class", "movement-token " + mv.owner);
      token.setAttribute("transform", "translate(" + Math.round(currentShape.cx) + " " + Math.round(currentShape.cy + 11) + ")");
      var disc = document.createElementNS(SVG_NS, "circle");
      disc.setAttribute("class", "movement-token-disc");
      disc.setAttribute("cx", "0");
      disc.setAttribute("cy", "0");
      disc.setAttribute("r", "9.2");
      token.appendChild(disc);
      if (mv.soldiers > 0) token.appendChild(makeUseIcon("icon-soldier", -3.0, -1.8, .36));
      if (mv.tanks > 0) token.appendChild(makeUseIcon("icon-tank", 3.2, -1.6, .34));
      var count = document.createElementNS(SVG_NS, "text");
      count.setAttribute("class", "movement-token-count");
      count.setAttribute("x", "0");
      count.setAttribute("y", "13");
      count.textContent = String(mv.soldiers + mv.tanks);
      token.appendChild(count);
      movementsLayer.appendChild(token);
    });
  }

  function makeBiomeMarkers(province, shape) {
    var layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", "biome-markers biome-" + province.biome);
    layer.setAttribute("data-id", String(province.id));

    var symbolId = province.biome === "forest" ? "biome-tree-icon" :
                   province.biome === "mountains" ? "biome-mountain-icon" : "biome-grass-icon";
    var targetCount = Number.isInteger(province.terrainMarkerCount) && province.terrainMarkerCount >= 3 && province.terrainMarkerCount <= 7
      ? province.terrainMarkerCount
      : 3 + (province.id % 5);

    /* The marker count is randomly selected at campaign creation and saved. A tiny
       province-specific generator keeps their positions stable between interface renders. */
    var randomSeed = (((province.id + 1) * 2654435761) + (targetCount * 1013904223)) >>> 0;
    function nextTerrainRandom() {
      randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
      return randomSeed / 4294967296;
    }

    var placed = [];
    var minimumDistanceSquared = 8.5 * 8.5;
    var attempts = 0;
    while (placed.length < targetCount && attempts < 1400) {
      attempts += 1;
      var x = Math.round(shape.minX + nextTerrainRandom() * Math.max(1, shape.maxX - shape.minX));
      var y = Math.round(shape.minY + nextTerrainRandom() * Math.max(1, shape.maxY - shape.minY));
      if (!pointInPolygon(x, y, shape.corners)) continue;
      var spaced = placed.every(function (point) {
        var dx = point.x - x;
        var dy = point.y - y;
        return dx * dx + dy * dy >= minimumDistanceSquared;
      });
      if (!spaced) continue;
      placed.push({ x: x, y: y });
    }

    /* A final low-spacing fallback guarantees three to seven markers even in narrow coastal provinces. */
    if (placed.length < targetCount) {
      var fallbackOffsets = [
        [0, 0], [-8, 0], [8, 0], [0, -8], [0, 8], [-8, -8], [8, 8],
        [-16, 0], [16, 0], [0, -16], [0, 16], [-16, 12], [16, -12],
        [-24, 0], [24, 0], [0, -24], [0, 24], [-22, -14], [22, 14]
      ];
      for (var fallbackIndex = 0; fallbackIndex < fallbackOffsets.length && placed.length < targetCount; fallbackIndex++) {
        var fallbackX = Math.round(shape.cx + fallbackOffsets[fallbackIndex][0]);
        var fallbackY = Math.round(shape.cy + fallbackOffsets[fallbackIndex][1]);
        if (!pointInPolygon(fallbackX, fallbackY, shape.corners)) continue;
        if (placed.some(function (point) {
          return Math.pow(point.x - fallbackX, 2) + Math.pow(point.y - fallbackY, 2) < 5 * 5;
        })) continue;
        placed.push({ x: fallbackX, y: fallbackY });
      }
    }

    placed.slice(0, targetCount).forEach(function (point, index) {
      var use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", "#" + symbolId);
      use.setAttribute("class", "biome-marker");
      use.setAttribute("transform", "translate(" + point.x + " " + point.y + ") scale(" + (0.66 + nextTerrainRandom() * 0.18).toFixed(2) + ")");
      use.setAttribute("aria-hidden", "true");
      layer.appendChild(use);
    });
    return layer;
  }

  function updateIslandClipPath() {
    if (islandClipShapeEl) islandClipShapeEl.setAttribute("d", buildOutlinePath());
  }

  function updateRiverProvinceClipPath() {
    if (!riverProvinceClipShapeEl || !state || !Array.isArray(state.riverProvinceIds)) return;
    var combinedPath = state.riverProvinceIds.map(function (provinceId) {
      var shape = PROVINCE_SHAPES[provinceId];
      return shape ? shape.d : "";
    }).filter(Boolean).join(" ");
    riverProvinceClipShapeEl.setAttribute("d", combinedPath);
  }

  function getIslandOutlinePoints() {
    var pts = [];
    for (var c = 0; c < GRID_COLS; c++) { pts.push(GRID[0][c]); pts.push(HORIZONTAL_EDGES[0][c]); }
    pts.push(GRID[0][GRID_COLS]);
    for (var r = 0; r < GRID_ROWS; r++) { pts.push(VERTICAL_EDGES[r][GRID_COLS]); pts.push(GRID[r + 1][GRID_COLS]); }
    for (var c2 = GRID_COLS - 1; c2 >= 0; c2--) { pts.push(HORIZONTAL_EDGES[GRID_ROWS][c2]); pts.push(GRID[GRID_ROWS][c2]); }
    for (var r2 = GRID_ROWS - 1; r2 >= 0; r2--) { pts.push(VERTICAL_EDGES[r2][0]); pts.push(GRID[r2][0]); }
    return pts;
  }

  function nearestIslandBoundaryPoint(point, avoidPoint, minSeparation) {
    var outline = getIslandOutlinePoints();
    var best = null;
    var bestDistance = Infinity;
    var separation2 = minSeparation ? minSeparation * minSeparation : 0;
    for (var i = 0; i < outline.length; i++) {
      var a = outline[i];
      var b = outline[(i + 1) % outline.length];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      var x = a.x + dx * t;
      var y = a.y + dy * t;
      if (avoidPoint && separation2 > 0) {
        var coastDx = x - avoidPoint.x;
        var coastDy = y - avoidPoint.y;
        if (coastDx * coastDx + coastDy * coastDy < separation2) continue;
      }
      var distX = point.x - x;
      var distY = point.y - y;
      var distance = distX * distX + distY * distY;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: Math.round(x), y: Math.round(y) };
      }
    }
    if (!best && avoidPoint) return nearestIslandBoundaryPoint(point, null, 0);
    return best || { x: point.x, y: point.y };
  }

  function randomPointInProvince(provinceId, avoidPoint) {
    var shape = PROVINCE_SHAPES[provinceId];
    if (!shape) return { x: GEO_CX, y: GEO_CY, provinceId: provinceId };
    var minDistance2 = 13 * 13;
    var avoidedPoints = Array.isArray(avoidPoint) ? avoidPoint : (avoidPoint ? [avoidPoint] : []);
    for (var attempt = 0; attempt < 900; attempt++) {
      var x = Math.round(shape.minX + Math.random() * (shape.maxX - shape.minX));
      var y = Math.round(shape.minY + Math.random() * (shape.maxY - shape.minY));
      if (!pointInPolygon(x, y, shape.corners)) continue;
      var tooClose = avoidedPoints.some(function (avoided) {
        var dx = x - avoided.x;
        var dy = y - avoided.y;
        return dx * dx + dy * dy < minDistance2;
      });
      if (tooClose) continue;
      return { x: x, y: y, provinceId: provinceId };
    }

    /* Small fallback set for unusually narrow or highly angled provinces. */
    var fallbacks = [
      { x: shape.cx, y: shape.cy },
      { x: shape.cx - 12, y: shape.cy },
      { x: shape.cx + 12, y: shape.cy },
      { x: shape.cx, y: shape.cy - 12 },
      { x: shape.cx, y: shape.cy + 12 },
      { x: shape.cx - 12, y: shape.cy + 8 },
      { x: shape.cx + 12, y: shape.cy - 8 }
    ];
    for (var f = 0; f < fallbacks.length; f++) {
      var candidate = fallbacks[f];
      if (!pointInPolygon(candidate.x, candidate.y, shape.corners)) continue;
      var fallbackTooClose = avoidedPoints.some(function (avoided) {
        var fx = candidate.x - avoided.x;
        var fy = candidate.y - avoided.y;
        return fx * fx + fy * fy < minDistance2;
      });
      if (fallbackTooClose) continue;
      return { x: Math.round(candidate.x), y: Math.round(candidate.y), provinceId: provinceId };
    }
    return { x: Math.round(shape.cx), y: Math.round(shape.cy), provinceId: provinceId };
  }

  function bezierRiverD(a, b, seed, gentle) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    var normalX = -dy / length;
    var normalY = dx / length;
    var amplitude = gentle ? Math.min(14, length * 0.10) : Math.min(27, length * 0.22);
    var phaseA = Number(seed) * 1.731 + Math.random() * 2.0;
    var phaseB = Number(seed) * 2.173 + Math.random() * 2.0;

    function pointAt(progress, offsetScale) {
      var wave = Math.sin(phaseA + progress * 8.7) * amplitude +
        Math.cos(phaseB + progress * 5.3) * amplitude * 0.38;
      var offset = wave * (offsetScale == null ? 1 : offsetScale);
      return {
        x: a.x + dx * progress + normalX * offset,
        y: a.y + dy * progress + normalY * offset
      };
    }

    var pathData = "M " + a.x + " " + a.y;
    var segmentStart = 0;
    for (var segment = 1; segment <= 3; segment++) {
      var segmentEnd = segment / 3;
      var controlOne = pointAt(segmentStart + (segmentEnd - segmentStart) * 0.30, 0.82);
      var controlTwo = pointAt(segmentStart + (segmentEnd - segmentStart) * 0.72, 0.72);
      var endpoint = segment === 3 ? { x: b.x, y: b.y } : pointAt(segmentEnd, 0.62);
      pathData += " C " + Math.round(controlOne.x) + " " + Math.round(controlOne.y) +
        " " + Math.round(controlTwo.x) + " " + Math.round(controlTwo.y) +
        " " + Math.round(endpoint.x) + " " + Math.round(endpoint.y);
      segmentStart = segmentEnd;
    }
    return pathData;
  }

  function appendRiverPath(a, b, kind, seed) {
    if (!riversLayer || !a || !b) return null;
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", "river-path " + (kind || "river-tributary"));
    path.setAttribute("d", bezierRiverD(a, b, Number(seed || 0) + Math.random() * 10000, kind === "river-outlet"));
    path.setAttribute("data-from-province", a.provinceId == null ? "" : String(a.provinceId));
    path.setAttribute("data-to-province", b.provinceId == null ? "" : String(b.provinceId));
    path.setAttribute("aria-hidden", "true");
    riversLayer.appendChild(path);
    return path;
  }

  function getPointInsideIsland(point) {
    for (var id = 0; id < state.provinces.length; id++) {
      var shape = PROVINCE_SHAPES[id];
      if (shape && pointInPolygon(point.x, point.y, shape.corners)) return true;
    }
    return false;
  }

  function generateRiverNetwork() {
    if (!riversLayer) return;
    clearNode(riversLayer);
    updateIslandClipPath();

    var targetRiverProvinceCount = 15;
    var allProvinceIds = state.provinces.map(function (province) { return province.id; });
    var southernCandidates = allProvinceIds.filter(function (provinceId) {
      return Math.floor(provinceId / GRID_COLS) === GRID_ROWS - 1;
    });
    shuffleArray(southernCandidates);
    var startingProvinceId = southernCandidates[0] == null ? allProvinceIds[0] : southernCandidates[0];
    var selectedProvinceIds = [startingProvinceId];
    var selectedLookup = Object.create(null);
    var parentByProvince = Object.create(null);
    selectedLookup[startingProvinceId] = true;
    parentByProvince[startingProvinceId] = null;

    function chooseWeighted(items) {
      var totalWeight = items.reduce(function (sum, item) { return sum + item.weight; }, 0);
      var choice = Math.random() * totalWeight;
      for (var index = 0; index < items.length; index++) {
        choice -= items[index].weight;
        if (choice <= 0) return items[index];
      }
      return items[items.length - 1];
    }

    while (selectedProvinceIds.length < targetRiverProvinceCount) {
      var currentId = selectedProvinceIds[selectedProvinceIds.length - 1];
      var currentRow = Math.floor(currentId / GRID_COLS);
      var adjacentAvailable = NEIGHBORS[currentId].filter(function (neighborId) {
        return !selectedLookup[neighborId];
      });
      var nextChoice = null;

      if (adjacentAvailable.length) {
        nextChoice = chooseWeighted(adjacentAvailable.map(function (provinceId) {
          var row = Math.floor(provinceId / GRID_COLS);
          var weight = row < currentRow ? 3.4 : (row === currentRow ? 1.55 : 0.42);
          return { provinceId: provinceId, parentId: currentId, weight: weight + Math.random() * 0.65 };
        }));
      } else {
        var frontierById = Object.create(null);
        selectedProvinceIds.forEach(function (selectedId) {
          NEIGHBORS[selectedId].forEach(function (neighborId) {
            if (selectedLookup[neighborId]) return;
            var row = Math.floor(neighborId / GRID_COLS);
            var parentRow = Math.floor(selectedId / GRID_COLS);
            var weight = row < parentRow ? 3.0 : (row === parentRow ? 1.45 : 0.45);
            weight += Math.random() * 0.7;
            if (!frontierById[neighborId] || frontierById[neighborId].weight < weight) {
              frontierById[neighborId] = { provinceId: neighborId, parentId: selectedId, weight: weight };
            }
          });
        });
        var frontier = Object.keys(frontierById).map(function (key) { return frontierById[key]; });
        if (!frontier.length) break;
        nextChoice = chooseWeighted(frontier);
      }

      selectedLookup[nextChoice.provinceId] = true;
      selectedProvinceIds.push(nextChoice.provinceId);
      parentByProvince[nextChoice.provinceId] = nextChoice.parentId;
    }

    /* The exact 15 province IDs are persisted so river bonuses remain stable after loading. */
    state.riverProvinceIds = selectedProvinceIds.slice();
    RIVER_PROVINCE_IDS = selectedProvinceIds.slice();
    updateRiverProvinceClipPath();

    var pointsByProvince = Object.create(null);
    var allNodes = [];
    state.riverPointCounts = {};
    selectedProvinceIds.forEach(function (provinceId) {
      var pointCount = 1 + Math.floor(Math.random() * 3);
      state.riverPointCounts[String(provinceId)] = pointCount;
      var points = [];
      for (var pointIndex = 0; pointIndex < pointCount; pointIndex++) {
        points.push(randomPointInProvince(provinceId, points));
      }
      pointsByProvince[provinceId] = points;
      allNodes = allNodes.concat(points);
    });

    /* Connect the selected adjacent provinces into a winding river network. */
    selectedProvinceIds.forEach(function (provinceId, index) {
      if (index === 0) return;
      var parentId = parentByProvince[provinceId];
      var parentPoints = pointsByProvince[parentId];
      var provincePoints = pointsByProvince[provinceId];
      if (parentPoints && parentPoints[0] && provincePoints && provincePoints[0]) {
        appendRiverPath(parentPoints[0], provincePoints[0], "river-main", 100 + index + Math.random() * 9000);
      }
    });

    /* Each additional random point creates a small local meander/tributary in its own river province. */
    selectedProvinceIds.forEach(function (provinceId, provinceIndex) {
      var points = pointsByProvince[provinceId];
      for (var extraIndex = 1; extraIndex < points.length; extraIndex++) {
        appendRiverPath(points[extraIndex], points[0], "river-tributary", 500 + provinceIndex * 7 + extraIndex + Math.random() * 9000);
      }
    });

    /* Give the network a pair of coastline connections while clipping every stroke to the chosen 15 provinces. */
    var coastCandidates = selectedProvinceIds.map(function (provinceId) {
      var point = pointsByProvince[provinceId][0];
      var coast = nearestIslandBoundaryPoint(point);
      var dx = point.x - coast.x;
      var dy = point.y - coast.y;
      return { provinceId: provinceId, point: point, coast: coast, distance: dx * dx + dy * dy };
    }).sort(function (a, b) { return a.distance - b.distance; });
    if (coastCandidates.length) {
      var firstCoast = coastCandidates[0];
      if (firstCoast.distance > 1) {
        appendRiverPath(firstCoast.point, { x: firstCoast.coast.x, y: firstCoast.coast.y, provinceId: null }, "river-outlet", 9001 + Math.random() * 9000);
      }
      var secondCoast = null;
      for (var coastIndex = coastCandidates.length - 1; coastIndex >= 0; coastIndex--) {
        var candidate = coastCandidates[coastIndex];
        var separationX = candidate.coast.x - firstCoast.coast.x;
        var separationY = candidate.coast.y - firstCoast.coast.y;
        if (candidate.distance > 1 && separationX * separationX + separationY * separationY > 120 * 120) {
          secondCoast = candidate;
          break;
        }
      }
      if (secondCoast) {
        appendRiverPath(secondCoast.point, { x: secondCoast.coast.x, y: secondCoast.coast.y, provinceId: null }, "river-outlet", 17001 + Math.random() * 9000);
      }
    }

    refreshRiverProvinceFlags();
  }

  function computeRiverProvinceIds() {
    if (state && Array.isArray(state.riverProvinceIds)) {
      var savedIds = state.riverProvinceIds.filter(function (provinceId, index, ids) {
        return Number.isInteger(provinceId) && provinceId >= 0 && provinceId < PROVINCE_COUNT && ids.indexOf(provinceId) === index;
      });
      if (savedIds.length === 15) return savedIds.slice().sort(function (a, b) { return a - b; });
    }
    var found = {};
    if (!riversLayer || typeof document.createElementNS !== "function") return [];
    var paths = riversLayer.querySelectorAll("path.river-path");
    for (var p = 0; p < paths.length; p++) {
      var river = paths[p];
      var totalLength = 0;
      try {
        totalLength = river.getTotalLength();
      } catch (error) {
        totalLength = 0;
      }
      if (!totalLength || typeof river.getPointAtLength !== "function") continue;
      var samples = Math.max(1, Math.ceil(totalLength / 3));
      for (var sample = 0; sample <= samples; sample++) {
        var point;
        try {
          point = river.getPointAtLength((totalLength * sample) / samples);
        } catch (error) {
          continue;
        }
        for (var id = 0; id < state.provinces.length; id++) {
          var shape = PROVINCE_SHAPES[id];
          if (!shape || point.x < shape.minX || point.x > shape.maxX || point.y < shape.minY || point.y > shape.maxY) continue;
          if (pointInPolygon(point.x, point.y, shape.corners)) found[id] = true;
        }
      }
    }
    return Object.keys(found).map(function (id) { return Number(id); }).sort(function (a, b) { return a - b; });
  }

  function refreshRiverProvinceFlags() {
    RIVER_PROVINCE_IDS = computeRiverProvinceIds();
    if (!Array.isArray(state.riverProvinceIds) || state.riverProvinceIds.length !== 15) {
      state.riverProvinceIds = RIVER_PROVINCE_IDS.slice();
    }
    if (!state.riverPointCounts || typeof state.riverPointCounts !== "object" || Array.isArray(state.riverPointCounts)) {
      state.riverPointCounts = {};
    }
    updateRiverProvinceClipPath();
    state.provinces.forEach(function (province) {
      province.hasRiver = state.riverProvinceIds.indexOf(province.id) !== -1;
      if (province.hasRiver) {
        var savedCount = Number(state.riverPointCounts[String(province.id)]);
        if (!Number.isInteger(savedCount) || savedCount < 1 || savedCount > 3) {
          savedCount = 1 + Math.floor(Math.random() * 3);
          state.riverPointCounts[String(province.id)] = savedCount;
        }
        province.riverPointCount = savedCount;
      } else {
        province.riverPointCount = 0;
        delete state.riverPointCounts[String(province.id)];
      }
      recalcIncome(province);
    });
  }

  function renderMap() {
    clearNode(provincesLayer);
    clearNode(labelsLayer);
    clearNode(biomeLayer);

    state.provinces.forEach(function (province) {
      var shape = PROVINCE_SHAPES[province.id];
      var poly = document.createElementNS(SVG_NS, "path");
      poly.setAttribute("d", shape.d);
      poly.setAttribute("class", "province-shape " + province.owner);
      poly.setAttribute("data-id", String(province.id));
      poly.setAttribute("data-province-name", province.name);
      poly.setAttribute("data-biome", province.biome);
      if (selectedId === province.id) poly.classList.add("selected");
      else if (selectedProvinceIds.indexOf(province.id) !== -1) poly.classList.add("group-selected");
      if (isValidMoveTarget(province.id)) poly.classList.add("valid-target");

      poly.addEventListener("click", function (e) {
        if (e.button === 1 || e.button === 2) return;
        onProvinceClick(province.id, e);
      });
      provincesLayer.appendChild(poly);

      if (visualSettings.showTerrain) {
        biomeLayer.appendChild(makeBiomeMarkers(province, shape));
      }
    });

    renderBuildingsIfNeeded();
    renderMovements();

    state.provinces.forEach(function (province) {
      var shape = PROVINCE_SHAPES[province.id];
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "province-label");
      g.setAttribute("transform",
        "translate(" + Math.round(shape.cx) + " " + Math.round(shape.cy) + ")");

      g.appendChild(makeArmyCounter(province));
      if (province.isCapital) {
        var crown = document.createElementNS(SVG_NS, "path");
        crown.setAttribute("class", "capital-crown");
        crown.setAttribute("transform", "translate(0, -38)");
        crown.setAttribute("d", "M-5,3 L-5,0 L-3,1.5 L0,-2 L3,1.5 L5,0 L5,3 Z");
        g.appendChild(crown);
        var capitalName = makeSvgText("capital-province-name", 0, 15, province.name);
        g.appendChild(capitalName);
      }
      labelsLayer.appendChild(g);
    });

    clearNode(factionLabelsLayer);
    var countryLabelsLayer = document.createElementNS(SVG_NS, "g");
    countryLabelsLayer.setAttribute("id", "country-name-labels");
    countryLabelsLayer.setAttribute("class", "country-name-labels");
    var subjectLabelsLayer = document.createElementNS(SVG_NS, "g");
    subjectLabelsLayer.setAttribute("id", "subject-name-labels");
    subjectLabelsLayer.setAttribute("class", "subject-name-labels");

    [PLAYER, BOT].forEach(function (owner) {
      var ownedProvinces = state.provinces.filter(function (province) { return province.owner === owner; });
      if (!ownedProvinces.length) return;
      var countryCenter = ownedProvinces.reduce(function (accumulator, province) {
        var shape = PROVINCE_SHAPES[province.id];
        accumulator.x += shape.cx;
        accumulator.y += shape.cy;
        return accumulator;
      }, { x: 0, y: 0 });
      countryCenter.x /= ownedProvinces.length;
      countryCenter.y /= ownedProvinces.length;
      var countryId = owner === PLAYER ? "dragon-power" : "sword-union";
      var country = state.countries[countryId];
      var countryLabel = makeSvgText(
        "faction-label " + (owner === PLAYER ? "player-label country-name-label" : "bot-label country-name-label"),
        countryCenter.x,
        countryCenter.y,
        state.countries[countryId].name
      );
      countryLabel.style.fontSize = "34px";
      countryLabel.style.strokeWidth = "4px";
      countryLabel.setAttribute("data-country-id", countryId);
      countryLabelsLayer.appendChild(countryLabel);
    });

    Object.keys(state.subjects).forEach(function (subjectId) {
      var members = state.provinces.filter(function (province) { return province.subjectId === subjectId; });
      if (members.length !== 4) return;
      var center = members.reduce(function (accumulator, province) {
        var shape = PROVINCE_SHAPES[province.id];
        accumulator.x += shape.cx;
        accumulator.y += shape.cy;
        return accumulator;
      }, { x: 0, y: 0 });
      center.x /= members.length;
      center.y /= members.length;
      var playerCount = members.filter(function (province) { return province.owner === PLAYER; }).length;
      var botCount = members.length - playerCount;
      var labelClass = playerCount === botCount ? "mixed-label" : (playerCount > botCount ? "player-label" : "bot-label");
      var label = makeSvgText("faction-label subject-name-label " + labelClass, center.x, center.y, state.subjects[subjectId].name);
      label.style.fontSize = "17px";
      label.style.strokeWidth = "2.5px";
      label.setAttribute("data-subject-id", subjectId);
      subjectLabelsLayer.appendChild(label);
    });

    factionLabelsLayer.appendChild(countryLabelsLayer);
    factionLabelsLayer.appendChild(subjectLabelsLayer);
    var zl = Math.round((BASE_VB_W / Math.max(1, Math.round(cam.w))) * 100) / 100;
    updateLabelsVisibilityFromZoom(zl);
  }

  function neighborNames(id) {
    return NEIGHBORS[id].map(function (nid) { return getProvince(nid).name; }).join(", ");
  }

  function groupQueueItems(items) {
    var groups = [];
    var groupsByKey = Object.create(null);
    items.forEach(function (order) {
      var key = [
        order.type,
        Number(order.turnsLeft) || 0,
        Number(order.targetLevel) || 0,
        order.queueOwner || "unspecified",
        Number(order.costPaid) || 0,
        Number(order.steelPaid) || 0
      ].join("|");
      var group = groupsByKey[key];
      if (!group) {
        group = {
          type: order.type,
          turnsLeft: order.turnsLeft,
          targetLevel: order.targetLevel,
          queueOwner: order.queueOwner,
          costPaid: order.costPaid,
          steelPaid: order.steelPaid,
          count: 0,
          orders: []
        };
        groupsByKey[key] = group;
        groups.push(group);
      }
      group.count += 1;
      group.orders.push(order);
    });
    groups.sort(function (a, b) {
      if (a.turnsLeft !== b.turnsLeft) return a.turnsLeft - b.turnsLeft;
      return String(a.type).localeCompare(String(b.type), "ru");
    });
    return groups;
  }

  function renderQueueList(blockEl, listEl, items, province) {
    if (!blockEl || !listEl) return;
    if (items.length === 0) {
      blockEl.classList.add("hidden");
      listEl.textContent = "";
      return;
    }
    blockEl.classList.remove("hidden");
    listElementClear(listEl);
    groupQueueItems(items).forEach(function (group) {
      var li = document.createElement("li");
      li.className = "queue-item" + (group.count > 1 ? " queue-item-stacked" : "");
      var copy = document.createElement("div");
      copy.className = "queue-item-copy";
      var nameSpan = document.createElement("span");
      nameSpan.className = "queue-item-name";
      if (group.type === "fort") nameSpan.textContent = "Укрепление ур. " + group.targetLevel;
      else if (group.type === "barracks") nameSpan.textContent = "Казарма ур. " + group.targetLevel;
      else if (group.type === "tankFactory") nameSpan.textContent = "Танковый завод ур. " + group.targetLevel;
      else if (group.type === "settlement") {
        var settlementName = (SETTLEMENT_LEVELS[group.targetLevel] && SETTLEMENT_LEVELS[group.targetLevel].name) || "Поселение";
        nameSpan.textContent = settlementName + " (ур. " + group.targetLevel + ")";
      } else {
        nameSpan.textContent = QUEUE_LABELS[group.type] || group.type;
      }
      if (group.count > 1) nameSpan.textContent += " × " + group.count;
      var turnsSpan = document.createElement("span");
      turnsSpan.className = "queue-turns";
      turnsSpan.textContent = "Осталось: " + group.turnsLeft + " х." + (group.count > 1 ? " · в очереди " + group.count + " заказов" : "");
      copy.appendChild(nameSpan);
      copy.appendChild(turnsSpan);
      li.appendChild(copy);

      if (province.owner === PLAYER && (group.queueOwner === PLAYER || group.queueOwner === undefined)) {
        var cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "queue-cancel-btn";
        cancelButton.textContent = group.count > 1 ? "Отменить 1" : "Отменить";
        cancelButton.title = group.count > 1
          ? "Отменить один заказ из этой группы и вернуть 75% его стоимости"
          : "Отменить приказ и вернуть 75% потраченных ресурсов";
        cancelButton.addEventListener("click", function (event) {
          event.stopPropagation();
          var orderToCancel = group.orders[group.orders.length - 1];
          var globalIndex = province.queue.indexOf(orderToCancel);
          cancelQueuedOrder(province.id, globalIndex);
        });
        li.appendChild(cancelButton);
      }
      listEl.appendChild(li);
    });
  }

  function listElementClear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function cancelQueuedOrder(provinceId, orderIndex) {
    var province = getProvince(provinceId);
    if (!province || province.owner !== PLAYER || !Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex >= province.queue.length || gameOver) return;
    var order = province.queue[orderIndex];
    if (order.queueOwner && order.queueOwner !== PLAYER) return;
    var goldRefund = Math.floor(Math.max(0, Number(order.costPaid) || 0) * 0.75);
    var steelRefund = Math.floor(Math.max(0, Number(order.steelPaid) || 0) * 0.75);
    province.queue.splice(orderIndex, 1);
    state.gold.player += goldRefund;
    state.steel.player += steelRefund;
    logEvent("orders", "Приказ отменён", "В провинции " + province.name + " отменён приказ «" + (QUEUE_LABELS[order.type] || order.type) + ". Возвращено: " + goldRefund + " золота и " + steelRefund + " стали (75% стоимости).", PLAYER);
    render();
    saveGame();
  }

  function renderQueueBlocks(province) {
    var armyQueue = province.queue.filter(function (q) {
      return q.type === "soldier" || q.type === "tank" || q.type === "fort" ||
             q.type === "barracks" || q.type === "tankFactory";
    });
    var econQueue = province.queue.filter(function (q) {
      return q.type === "factory" || q.type === "steelMill" || q.type === "settlement";
    });
    renderQueueList(queueArmyBlockEl, queueArmyListEl, armyQueue, province);
    renderQueueList(queueEconBlockEl, queueEconListEl, econQueue, province);
  }

  function renderPanel() {
    if (selectedId === null) {
      overlayEl.classList.remove("open");
      lastRenderedSelectedId = null;
      if (multiSelectionStatusEl) multiSelectionStatusEl.classList.add("hidden");
      return;
    }

    overlayEl.classList.add("open");
    if (lastRenderedSelectedId !== selectedId) {
      lastRenderedSelectedId = selectedId;
      switchTab(activeTab);
    }

    var province = getProvince(selectedId);
    var war = isAtWar();

    panelNameEl.textContent = province.isCapital ? "⭐ " + province.name : province.name;
    if (multiSelectionStatusEl && multiSelectionCopyEl) {
      var ownedSelectedCount = selectedPlayerProvinces().length;
      var groupSelected = selectedProvinceIds.length > 1 && ownedSelectedCount > 1;
      multiSelectionStatusEl.classList.toggle("hidden", !groupSelected);
      if (groupSelected) {
        multiSelectionCopyEl.textContent = "Выбрано " + ownedSelectedCount + " провинций. Строительство и улучшения применяются ко всем доступным выбранным провинциям.";
      }
    }
    panelOwnerEl.textContent = ownerLabel(province.owner);
    panelOwnerEl.className = "owner-badge " + province.owner;

    /* Каждая провинция принадлежит стране своего текущего владельца.
       Это обновляется и после захвата территории. */
    var countryKey = province.owner === PLAYER ? "dragon-power" : "sword-union";
    province.countryId = countryKey;
    var country = state.countries[countryKey];
    if (countryCardEl && country) {
      countryCardEl.classList.remove("country-player", "country-bot", "country-bot-war");
      countryCardEl.classList.add(country.owner === PLAYER ? "country-player" : (isAtWar() ? "country-bot-war" : "country-bot"));
      countryNameEl.textContent = country.name;
      countryGovernmentEl.textContent = country.government;
      countryIdeologyEl.textContent = country.ideology;
      countryFlagSwordEl.style.display = country.flagSymbol === "sword" ? "inline" : "none";
      countryFlagDragonEl.style.display = country.flagSymbol === "dragon" ? "inline" : "none";
      countryFlagBackgroundEl.setAttribute("fill", country.owner === PLAYER
        ? "url(#country-flag-player-bg)"
        : (isAtWar() ? "url(#country-flag-bot-war-bg)" : "url(#country-flag-bot-bg)"));
      var flagLabel = "Флаг государства «" + country.name + "»";
      var countryFlagEl = document.getElementById("country-flag");
      if (countryFlagEl) countryFlagEl.setAttribute("aria-label", flagLabel);
    }

    var terrain = getBiome(province);
    if (panelTerrainEl) {
      panelTerrainEl.classList.toggle("terrain-river", !!province.hasRiver);
      panelTerrainEl.classList.remove("terrain-forest", "terrain-plains", "terrain-mountains");
      panelTerrainEl.classList.add("terrain-" + province.biome);
    }
    if (panelBiomeIconEl) panelBiomeIconEl.textContent = terrain.icon;
    if (panelBiomeNameEl) panelBiomeNameEl.textContent = terrain.name + (province.hasRiver ? " · Река" : "");
    if (panelBiomeEffectsEl) {
      var terrainEffects = [terrain.summary];
      if (province.biome === "mountains" && province.steelMills > 0) terrainEffects.push("+2 стали/ход за горный сталелитейный цех");
      if (province.hasRiver) terrainEffects.push("+4 зол./ход · +" + (province.riverPointCount * 10) + "% оборона · " + province.riverPointCount + " речн. точк. · выход +1 ход");
      panelBiomeEffectsEl.textContent = terrainEffects.join(" · ");
    }

    if (province.isCapital) {
      capitalBannerEl.classList.remove("hidden");
      capitalBannerEl.classList.toggle("player-capital", province.owner === PLAYER);
      capitalBannerEl.classList.toggle("bot-capital", province.owner === BOT);
      capitalBannerBonusEl.textContent = "+" + CAPITAL_INCOME_BONUS + " зол./ход";
    } else {
      capitalBannerEl.classList.add("hidden");
      capitalBannerEl.classList.remove("player-capital", "bot-capital");
    }

    panelSoldiersEl.textContent = String(province.soldiers);
    panelTanksEl.textContent    = String(province.tanks);
    panelFortEl.textContent     = province.fort + " / " + FORT_MAX_LEVEL +
                                  (province.fort > 0 ? " (+" + (province.fort * 25) + "%)" : "");
    panelDefenseEl.textContent  = String(round1(provinceDefense(province)));

    panelBarracksEl.textContent = province.barracks > 0
      ? "Ур. " + province.barracks + " (+" + (province.barracks * BARRACKS_LIMIT_PER_LVL) + ")"
      : "—";
    panelTankFactoryEl.textContent = province.tankFactory > 0
      ? "Ур. " + province.tankFactory + " (+" + (province.tankFactory * TANK_FACTORY_LIMIT_PER_LVL) + ")"
      : "—";

    var settLevel = province.settlementLevel || 0;
    var settData = SETTLEMENT_LEVELS[settLevel];
    panelSettlementEl.textContent = settLevel > 0
      ? settData.name + " (ур. " + settLevel + ", +" + settData.income + " з., +" + settData.fortBonus + "%)"
      : "Пустошь";

    panelIncomeEl.textContent = (province.income >= 0 ? "+" : "") + province.income;
    panelFactoriesEl.textContent = String(province.factories);
    panelSteelMillsEl.textContent = String(province.steelMills);
    panelNeighborsEl.textContent = neighborNames(province.id);

    renderQueueBlocks(province);
    renderPanelMovementStatus(province);

    var isPlayerOwned = province.owner === PLAYER;

    /* На чужой территории оставляем характеристики и дипломатию,
       но полностью скрываем военные/строительные действия. На своей
       территории скрываем дипломатию, сохраняя привычные действия. */
    if (armyActionsEl) armyActionsEl.classList.toggle("hidden", !isPlayerOwned);
    if (economyBuildActionsEl) economyBuildActionsEl.classList.toggle("hidden", !isPlayerOwned);
    if (diplomacySectionEl) diplomacySectionEl.classList.toggle("hidden", isPlayerOwned);
    if (moveBtn) moveBtn.classList.toggle("hidden", !isPlayerOwned);

    var pSoldiers = getTotalSoldiers(PLAYER);
    var pSoldierLimit = getSoldierLimit(PLAYER);
    var pTanks = getTotalTanks(PLAYER);
    var pTankLimit = getTankLimit(PLAYER);

    var soldierCost = inflateCost(SOLDIER_COST, PLAYER);
    var soldierTime = recruitmentTurns(province, PROD_SOLDIER);
    var hasBarracks = province.barracks >= 1;
    var soldierLimitReached = pSoldiers >= pSoldierLimit;
    var canHireSoldier = isPlayerOwned && hasBarracks && !soldierLimitReached &&
                         state.gold.player >= soldierCost;
    hireBtn.disabled = gameOver || !canHireSoldier;
    if (!isPlayerOwned) setActionButtonLabel(hireBtn, "Нанять солдата (−" + soldierCost + " зол., " + soldierTime + " х.)");
    else if (!hasBarracks) setActionButtonLabel(hireBtn, "Нанять солдата (требуется казарма)");
    else if (soldierLimitReached) setActionButtonLabel(hireBtn, "Лимит солдат: " + pSoldiers + "/" + pSoldierLimit);
    else setActionButtonLabel(hireBtn, "Нанять солдата (−" + soldierCost + " зол., " + soldierTime + " х.)");

    var tankCost = inflateCost(TANK_COST, PLAYER);
    var tankTime = recruitmentTurns(province, PROD_TANK);
    var hasTankFactory = province.tankFactory >= 1;
    var tankLimitReached = pTanks >= pTankLimit;
    var canHireTank = isPlayerOwned && hasTankFactory && !tankLimitReached &&
                      state.gold.player >= tankCost && state.steel.player >= TANK_STEEL_COST;
    tankBtn.disabled = gameOver || !canHireTank;
    if (!isPlayerOwned) setActionButtonLabel(tankBtn, "Нанять танк (−" + tankCost + " зол., −3 стали, " + tankTime + " х.)");
    else if (!hasTankFactory) setActionButtonLabel(tankBtn, "Нанять танк (требуется танк. завод)");
    else if (tankLimitReached) setActionButtonLabel(tankBtn, "Лимит танков: " + pTanks + "/" + pTankLimit);
    else setActionButtonLabel(tankBtn, "Нанять танк (−" + tankCost + " зол., −3 стали, " + tankTime + " х.)");

    var constructionBusy = hasConstructionInQueue(province);
    var factoryCost = inflateCost(FACTORY_COST, PLAYER);
    var steelMillCost = inflateCost(STEEL_MILL_COST, PLAYER);
    factoryBtn.disabled = gameOver || !isPlayerOwned || constructionBusy || state.gold.player < factoryCost;
    steelMillBtn.disabled = gameOver || !isPlayerOwned || constructionBusy || state.gold.player < steelMillCost;
    setActionButtonLabel(factoryBtn, constructionBusy ? "Строительство уже идёт" : "Построить фабрику (−" + factoryCost + " зол., 3 х.)");
    setActionButtonLabel(steelMillBtn, constructionBusy ? "Строительство уже идёт" : "Построить сталелитейный цех (−" + steelMillCost + " зол., 3 х.)");

    var qForts = province.queue.filter(function (q) { return q.type === "fort"; }).length;
    var eFLvl = province.fort + qForts;
    var fortMaxed = eFLvl >= FORT_MAX_LEVEL;
    var fCost = inflateCost(FORT_BASE_COST * (eFLvl + 1), PLAYER);
    fortBtn.disabled = gameOver || !isPlayerOwned || constructionBusy || fortMaxed || state.gold.player < fCost;
    if (fortMaxed) setActionButtonLabel(fortBtn, "Укрепление максимум (" + FORT_MAX_LEVEL + ")");
    else if (constructionBusy) setActionButtonLabel(fortBtn, "Строительство уже идёт");
    else if (eFLvl === 0) setActionButtonLabel(fortBtn, "Построить укрепление (−" + fCost + " зол., 3 х.)");
    else setActionButtonLabel(fortBtn, "Улучшить до " + (eFLvl + 1) + " (−" + fCost + " зол., 3 х.)");

    var qBar = province.queue.filter(function (q) { return q.type === "barracks"; }).length;
    var eBar = province.barracks + qBar;
    var barMaxed = eBar >= BARRACKS_MAX_LEVEL;
    var bCost = barMaxed ? -1 : inflateCost(Math.round(BARRACKS_BASE_COST * Math.pow(1.5, eBar)), PLAYER);
    if (barMaxed) {
      barracksBtn.disabled = true;
      setActionButtonLabel(barracksBtn, "Казарма: МАКС. УРОВЕНЬ");
    } else {
      barracksBtn.disabled = gameOver || !isPlayerOwned || constructionBusy || state.gold.player < bCost;
      if (constructionBusy) setActionButtonLabel(barracksBtn, "Строительство уже идёт");
      else if (eBar === 0) setActionButtonLabel(barracksBtn, "Построить казарму (−" + bCost + " з., 2 х.)");
      else setActionButtonLabel(barracksBtn, "Улучшить казарму до ур. " + (eBar + 1) + " (−" + bCost + " з., 2 х.)");
    }

    var qTF = province.queue.filter(function (q) { return q.type === "tankFactory"; }).length;
    var eTF = province.tankFactory + qTF;
    var tfMaxed = eTF >= TANK_FACTORY_MAX_LEVEL;
    var tfCost = tfMaxed ? -1 : inflateCost(Math.round(TANK_FACTORY_BASE_COST * Math.pow(1.5, eTF)), PLAYER);
    if (tfMaxed) {
      tankFactoryBtn.disabled = true;
      setActionButtonLabel(tankFactoryBtn, "Танк. завод: МАКС. УРОВЕНЬ");
    } else {
      tankFactoryBtn.disabled = gameOver || !isPlayerOwned || constructionBusy || state.gold.player < tfCost;
      if (constructionBusy) setActionButtonLabel(tankFactoryBtn, "Строительство уже идёт");
      else if (eTF === 0) setActionButtonLabel(tankFactoryBtn, "Построить Танк. завод (−" + tfCost + " з., 3 х.)");
      else setActionButtonLabel(tankFactoryBtn, "Улучшить Танк. завод до ур. " + (eTF + 1) + " (−" + tfCost + " з., 3 х.)");
    }

    var qSet = province.queue.filter(function (q) { return q.type === "settlement"; }).length;
    var eSet = (province.settlementLevel || 0) + qSet;
    setActionButtonIcon(settlementBtn, "icon-settlement-" + Math.max(1, Math.min(5, eSet + 1)));
    var setMaxed = eSet >= SETTLEMENT_MAX_LEVEL;
    if (setMaxed) {
      settlementBtn.disabled = true;
      setActionButtonLabel(settlementBtn, "Поселение: МАКС. УРОВЕНЬ");
    } else {
      var nextData = SETTLEMENT_LEVELS[eSet + 1];
      var settCost = inflateCost(nextData.cost, PLAYER);
      settlementBtn.disabled = gameOver || !isPlayerOwned || constructionBusy || state.gold.player < settCost;
      var verb = eSet === 0 ? "Построить" : "Улучшить";
      setActionButtonLabel(settlementBtn, constructionBusy ? "Строительство уже идёт" : verb + ": " + nextData.name +
                                  " (" + settCost + " з., " + nextData.time + " х.)");
    }

    if (selectedProvinceIds.length > 1 && isPlayerOwned) {
      var batchTotal = selectedPlayerProvinces().length;
      applyBatchButtonState(factoryBtn, "factory", "Фабрика");
      applyBatchButtonState(steelMillBtn, "steelMill", "Сталелитейный цех");
      applyBatchButtonState(fortBtn, "fort", "Укрепление");
      applyBatchButtonState(barracksBtn, "barracks", "Казарма");
      applyBatchButtonState(tankFactoryBtn, "tankFactory", "Танковый завод");
      applyBatchButtonState(settlementBtn, "settlement", "Поселение");
    }

    var hasTroops = (province.soldiers + province.tanks) > 0;
    var hasValidTarget = state.provinces.some(function (target) {
      if (target.id === province.id) return false;
      if (target.owner === PLAYER) return !!findFriendlyPath(province.id, target.id, PLAYER);
      return isAtWar() && NEIGHBORS[province.id].indexOf(target.id) !== -1;
    });
    var canStartMove = isPlayerOwned && hasTroops && hasValidTarget;
    moveBtn.disabled = gameOver || !canStartMove || (moveFromId !== null && moveFromId !== province.id);
    var moveKeyLabel = keyBindingLabel((visualSettings.keyBindings || DEFAULT_KEY_BINDINGS).move);
    if (moveFromId === province.id) setActionButtonLabel(moveBtn, "↩ Отменить выбор цели [" + moveKeyLabel + "]");
    else setActionButtonLabel(moveBtn, "Переместить войска [" + moveKeyLabel + "]");

    var showGeneral = !isPlayerOwned || war || moveFromId !== null;
    generalActionsEl.classList.toggle("hidden", !showGeneral);

    foreignHintEl.classList.add("hidden");
    foreignHintEl.textContent = "";
    if (moveFromId !== null) {
      foreignHintEl.classList.remove("hidden");
      foreignHintEl.textContent = "Выберите любую достижимую свою провинцию для марша; атаковать можно только соседнюю вражескую провинцию. ПКМ или Esc — отмена.";
    } else if (!isPlayerOwned) {
      foreignHintEl.classList.remove("hidden");
      foreignHintEl.textContent = war
        ? "Вражеская территория. Захватите её через Перемещение войск из своей соседней провинции."
        : (nonAggressionTurns > 0
          ? "Действует пакт о ненападении: объявление войны и атаки запрещены ещё " + nonAggressionTurns + " ходов."
          : "Мир: чужие провинции нельзя атаковать, пока не объявлена война.");
    } else if (war) {
      foreignHintEl.classList.remove("hidden");
      foreignHintEl.textContent = "Атакуйте вражеские провинции кнопкой «Переместить войска» только из непосредственно соседней провинции.";
    }

    declareWarBtn.classList.toggle("hidden", war || isPlayerOwned);
    declareWarBtn.disabled = gameOver || war || nonAggressionTurns > 0;
    declareWarBtn.textContent = nonAggressionTurns > 0
      ? "Объявить войну — пакт действует"
      : "Объявить войну";

    var inflation = getInflation(PLAYER);
    if (isPlayerOwned && inflation > 0 && !foreignHintEl.textContent) {
      foreignHintEl.classList.remove("hidden");
      foreignHintEl.textContent = "⚠ Инфляция " + inflation +
        "%: цены в золоте повышены. Потратьте излишки!";
    }
  }

  function isValidMoveTarget(targetId) {
    if (moveFromId === null || moveFromId === targetId) return false;
    var source = getProvince(moveFromId);
    var target = getProvince(targetId);
    if (!source || !target) return false;
    if (target.owner === source.owner) return !!findFriendlyPath(source.id, target.id, source.owner);
    return isAtWar() && NEIGHBORS[source.id].indexOf(targetId) !== -1;
  }

  function onProvinceClick(id, event) {
    /* Suppress only the click associated with a middle-button pan. */
    if (hasMoved) {
      hasMoved = false;
      if (hasMovedTimeout !== null) {
        window.clearTimeout(hasMovedTimeout);
        hasMovedTimeout = null;
      }
      return;
    }
    if (gameOver) return;
    if (rerouteMovementId !== null) {
      redirectMovementToProvince(id);
      return;
    }
    if (moveFromId !== null) {
      if (id === moveFromId) { cancelMoveMode(); render(); return; }
      if (isValidMoveTarget(id)) { openMoveModal(id); return; }
      return;
    }

    var province = getProvince(id);
    var useMultiSelection = !!(event && event.shiftKey);
    if (useMultiSelection && province && province.owner === PLAYER) {
      var baseSelection = selectedProvinceIds.length ? selectedProvinceIds.slice() : [];
      if (baseSelection.length === 0 && selectedId !== null) {
        var currentlySelected = getProvince(selectedId);
        if (currentlySelected && currentlySelected.owner === PLAYER) baseSelection.push(selectedId);
      }
      if (baseSelection.indexOf(id) === -1) baseSelection.push(id);
      else baseSelection = baseSelection.filter(function (provinceId) { return provinceId !== id; });
      selectedProvinceIds = baseSelection.filter(function (provinceId, index, all) {
        var candidate = getProvince(provinceId);
        return all.indexOf(provinceId) === index && candidate && candidate.owner === PLAYER;
      });
      if (selectedProvinceIds.length === 0) selectedId = null;
      else selectedId = selectedProvinceIds.indexOf(id) !== -1 ? id : selectedProvinceIds[selectedProvinceIds.length - 1];
      render();
      return;
    }

    /* Shift-click on foreign territory leaves an owned-province group unchanged. */
    if (useMultiSelection && selectedProvinceIds.length > 0 && province && province.owner !== PLAYER) return;
    selectedId = id;
    selectedProvinceIds = province && province.owner === PLAYER ? [id] : [];
    render();
  }

  function navigateDirection(dir) {
    if (gameOver) return;
    if (selectedId === null) {
      var playerProvs = provincesOf(PLAYER);
      if (playerProvs.length === 0) return;
      selectedId = playerProvs[Math.floor(Math.random() * playerProvs.length)].id;
      selectedProvinceIds = [selectedId];
      render();
      return;
    }
    var cur = PROVINCE_SHAPES[selectedId];
    var best = null, bestScore = Infinity, EDGE = 5;
    state.provinces.forEach(function (p) {
      if (p.id === selectedId) return;
      var s = PROVINCE_SHAPES[p.id];
      var dx = s.cx - cur.cx, dy = s.cy - cur.cy;
      var score = Infinity;
      if (dir === "up"    && dy < -EDGE) score = Math.hypot(dx, dy) + 1.5 * Math.abs(dx);
      if (dir === "down"  && dy >  EDGE) score = Math.hypot(dx, dy) + 1.5 * Math.abs(dx);
      if (dir === "left"  && dx < -EDGE) score = Math.hypot(dx, dy) + 1.5 * Math.abs(dy);
      if (dir === "right" && dx >  EDGE) score = Math.hypot(dx, dy) + 1.5 * Math.abs(dy);
      if (score < bestScore) { bestScore = score; best = p; }
    });
    if (best) { selectedId = best.id; selectedProvinceIds = best.owner === PLAYER ? [best.id] : []; render(); }
  }

  function startMoveMode() {
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER) return;
    if (province.soldiers + province.tanks < 1) return;
    var hasTarget = state.provinces.some(function (target) {
      if (target.id === province.id) return false;
      if (target.owner === PLAYER) return !!findFriendlyPath(province.id, target.id, PLAYER);
      return isAtWar() && NEIGHBORS[province.id].indexOf(target.id) !== -1;
    });
    if (!hasTarget) return;
    moveFromId = province.id;
    selectedProvinceIds = [province.id];
    render();
  }

  function cancelMoveMode() {
    moveFromId = null;
    pendingMoveTargetId = null;
    moveModal.classList.add("hidden");
  }

  function openMoveModal(targetId) {
    var from = getProvince(moveFromId);
    var target = getProvince(targetId);
    pendingMoveTargetId = targetId;
    var route = movementRouteFor(from, targetId);
    if (!route) { pendingMoveTargetId = null; return; }
    var routeTurns = calculateRouteTurns(route);
    moveConfirmBtn.textContent = "Отправить (" + formatTurns(routeTurns) + ")";
    moveModalText.textContent = from.name + " → " + target.name +
      ". Маршрут: " + route.map(function (id) { return getProvince(id).name; }).join(" → ") +
      ". В пути: " + formatTurns(routeTurns) + ". У вас: " +
      from.soldiers + " солдат, " + from.tanks + " танков.";
    moveSoldiersInput.max = String(from.soldiers);
    moveTanksInput.max = String(from.tanks);
    moveSoldiersInput.value = String(Math.max(0, from.soldiers - 1));
    moveTanksInput.value = String(from.tanks);
    updateMovePreview();
    moveModal.classList.remove("hidden");
    moveSoldiersInput.focus();
    moveSoldiersInput.select();
  }

  function appendBattleForecastMetric(label, value) {
    if (!moveBattleForecastContentEl) return;
    var card = document.createElement("div"); card.className = "forecast-metric";
    var title = document.createElement("span"); title.className = "forecast-metric-label"; title.textContent = label;
    var strong = document.createElement("strong"); strong.textContent = value;
    card.appendChild(title); card.appendChild(strong); moveBattleForecastContentEl.appendChild(card);
  }

  function renderBattleForecast(soldiers, tanks, target, incoming, alliedAttackers) {
    if (!moveBattleForecastEl || !moveBattleForecastContentEl || !moveBattleForecastNoteEl) return;
    moveBattleForecastContentEl.textContent = "";
    if (!target || target.owner === PLAYER) {
      moveBattleForecastEl.classList.add("hidden");
      return;
    }
    moveBattleForecastEl.classList.remove("hidden");
    var defenderSoldiers = target.soldiers + incoming.soldiers;
    var defenderTanks = target.tanks + incoming.tanks;
    var attackingSoldiers = soldiers + (alliedAttackers ? alliedAttackers.soldiers : 0);
    var attackingTanks = tanks + (alliedAttackers ? alliedAttackers.tanks : 0);
    var attack = attackPower(attackingSoldiers, attackingTanks, PLAYER);
    var defense = provinceDefenseForUnits(target, defenderSoldiers, defenderTanks);
    var captured = attack > defense;
    var attackerLossSoldiers = attackingSoldiers;
    var attackerLossTanks = attackingTanks;
    var defenderLossSoldiers = 0;
    var defenderLossTanks = 0;
    var survivingSoldiers = 0;
    var survivingTanks = 0;
    if (captured) {
      var survivalRatio = (attack - defense) / Math.max(1, attack);
      var attackerGroups = [{ soldiers: soldiers, tanks: tanks }].concat(alliedAttackers && Array.isArray(alliedAttackers.groups) ? alliedAttackers.groups : []);
      attackerGroups.forEach(function (group) {
        survivingSoldiers += Math.floor(group.soldiers * survivalRatio);
        survivingTanks += Math.floor(group.tanks * survivalRatio);
      });
      if (survivingSoldiers + survivingTanks < 1) {
        if (attackingSoldiers > 0) survivingSoldiers = 1;
        else if (attackingTanks > 0) survivingTanks = 1;
      }
      attackerLossSoldiers = Math.max(0, attackingSoldiers - survivingSoldiers);
      attackerLossTanks = Math.max(0, attackingTanks - survivingTanks);
      defenderLossSoldiers = defenderSoldiers;
      defenderLossTanks = defenderTanks;
    } else {
      var lossRatio = Math.min(0.8, (attack / Math.max(1, defense)) * 0.6);
      var remainingDefenderSoldiers = Math.max(0, defenderSoldiers - Math.floor(defenderSoldiers * lossRatio));
      var remainingDefenderTanks = Math.max(0, defenderTanks - Math.floor(defenderTanks * lossRatio));
      defenderLossSoldiers = defenderSoldiers - remainingDefenderSoldiers;
      defenderLossTanks = defenderTanks - remainingDefenderTanks;
      if (remainingDefenderSoldiers + remainingDefenderTanks < 1) remainingDefenderSoldiers = 1;
    }
    appendBattleForecastMetric("Предварительный результат", captured ? "Вероятный захват" : "Вероятное отражение");
    appendBattleForecastMetric("Сила атаки", round1(attack).toString());
    appendBattleForecastMetric("Сила обороны", round1(defense).toString());
    appendBattleForecastMetric("Атакующие", attackingSoldiers + " солдат · " + attackingTanks + " танков");
    if (alliedAttackers && alliedAttackers.count > 0) appendBattleForecastMetric("Другие ваши армии, прибывающие одновременно", alliedAttackers.soldiers + " солдат · " + alliedAttackers.tanks + " танков");
    appendBattleForecastMetric("Защитники с подкреплениями", defenderSoldiers + " солдат · " + defenderTanks + " танков");
    appendBattleForecastMetric("Потери атакующих", attackerLossSoldiers + " солдат · " + attackerLossTanks + " танков");
    appendBattleForecastMetric("Потери защитников", defenderLossSoldiers + " солдат · " + defenderLossTanks + " танков");
    appendBattleForecastMetric("Выживут атакующие", survivingSoldiers + " солдат · " + survivingTanks + " танков");
    appendBattleForecastMetric("Укрепление", target.fort + " ур. · +" + Math.round(target.fort * FORT_DEFENSE_BONUS * 100) + "%");
    var settlementLevel = target.settlementLevel || 0;
    var settlementDefenseBonus = SETTLEMENT_LEVELS[settlementLevel] ? SETTLEMENT_LEVELS[settlementLevel].fortBonus : 0;
    appendBattleForecastMetric("Поселение", settlementLevel > 0 ? SETTLEMENT_LEVELS[settlementLevel].name + " · +" + settlementDefenseBonus + "% к обороне" : "Нет бонуса поселения");
    var terrain = getBiome(target);
    appendBattleForecastMetric("Ландшафт", terrain.name + " · ×" + terrain.defenseMultiplier.toFixed(2).replace(".", ","));
    appendBattleForecastMetric("Река", target.hasRiver ? "Оборона ×0,85" : "Нет речного штрафа атакующему");
    appendBattleForecastMetric("Военная реформа", isResearchComplete(PLAYER, "military") ? "+1% к атаке применяется" : "Не изучена");
    moveBattleForecastNoteEl.textContent = captured
      ? "Предварительный прогноз по текущей формуле предсказывает захват. Потери оценочные: округление нескольких отдельных отрядов может слегка изменить итог. Состав гарнизона может измениться до прибытия."
      : "Предварительный прогноз предсказывает отражение атаки. По текущему правилу атакующий отряд будет потерян, защитники понесут ограниченные потери. Новые приказы и смена контроля могут изменить результат.";
    moveBattleForecastEl.classList.toggle("forecast-success", captured);
    moveBattleForecastEl.classList.toggle("forecast-failure", !captured);
  }

  function updateMovePreview() {
    if (moveFromId === null || pendingMoveTargetId === null) return;
    var target = getProvince(pendingMoveTargetId);
    var s = Number(moveSoldiersInput.value);
    var t = Number(moveTanksInput.value);
    var source = getProvince(moveFromId);
    if (!Number.isInteger(s) || !Number.isInteger(t) || s < 0 || t < 0 ||
        s > source.soldiers || t > source.tanks || s + t < 1) {
      movePreviewEl.textContent = "Укажите целое положительное количество войск, не превышающее доступные силы в исходной провинции.";
      movePreviewEl.className = "hint bad";
      if (moveBattleForecastEl) moveBattleForecastEl.classList.add("hidden");
      moveConfirmBtn.textContent = "Проверьте количество войск";
      moveConfirmBtn.disabled = true;
      return;
    }

    var route = movementRouteFor(source, target.id);
    if (!route) {
      movePreviewEl.textContent = "Маршрут недоступен: путь должен проходить по своим провинциям; атаковать можно только соседнюю вражескую провинцию во время войны.";
      movePreviewEl.className = "hint bad";
      if (moveBattleForecastEl) moveBattleForecastEl.classList.add("hidden");
      moveConfirmBtn.textContent = "Маршрут недоступен";
      moveConfirmBtn.disabled = true;
      return;
    }
    moveConfirmBtn.disabled = false;
    var routeTurns = calculateRouteTurns(route);
    moveConfirmBtn.textContent = "Отправить (" + formatTurns(routeTurns) + ")";
    if (target.owner === PLAYER) {
      if (moveBattleForecastEl) moveBattleForecastEl.classList.add("hidden");
      var turns = routeTurns;
      movePreviewEl.textContent = "Подкрепление: " + s + " солдат и " + t + " танков. Маршрут: " +
        route.map(function (id) { return getProvince(id).name; }).join(" → ") +
        ". Прибытие через " + turns + " ход(а).";
      movePreviewEl.className = "hint good";
    } else {
      var estimatedArrivalTurns = calculateRouteTurns(route);
      var incoming = expectedFriendlyReinforcements(target, estimatedArrivalTurns);
      var alliedAttackers = expectedAttackingReinforcements(target, estimatedArrivalTurns, PLAYER);
      var atk = attackPower(s + alliedAttackers.soldiers, t + alliedAttackers.tanks, PLAYER);
      var defenseSoldiers = target.soldiers + incoming.soldiers;
      var defenseTanks = target.tanks + incoming.tanks;
      var def = provinceDefenseForUnits(target, defenseSoldiers, defenseTanks);
      var win = atk > def;
      var supportText = incoming.soldiers + incoming.tanks > 0
        ? " с учётом прибывающих подкреплений защитника (ещё " + incoming.soldiers + " солдат и " + incoming.tanks + " танков)"
        : "";
      if (alliedAttackers.count > 0) supportText += " и ещё " + alliedAttackers.soldiers + " солдат / " + alliedAttackers.tanks + " танков вашей стороны, прибывающих одновременно";
      movePreviewEl.textContent = "Атака из соседней провинции (" + formatTurns(calculateRouteTurns(route)) + "): " + round1(atk) +
        " · Оборона: " + round1(def) + supportText + " — " + (win ? "расчётная атака успешна" : "расчётная атака будет отбита") + ".";
      movePreviewEl.className = "hint " + (win ? "good" : "bad");
      renderBattleForecast(s, t, target, incoming, alliedAttackers);
    }
  }

  function confirmMove() {
    if (moveFromId === null || pendingMoveTargetId === null) return;
    var from = getProvince(moveFromId);
    var s = Number(moveSoldiersInput.value);
    var t = Number(moveTanksInput.value);
    if (!Number.isInteger(s) || !Number.isInteger(t)) return;
    if (s < 0 || t < 0) return;
    if (s + t < 1) return;
    if (s > from.soldiers) return;
    if (t > from.tanks) return;
    var route = movementRouteFor(from, pendingMoveTargetId);
    if (!route) return;
    queueMovementFromProvince(from, pendingMoveTargetId, s, t, route);
    cancelMoveMode();
    render();
  }

  function queueMovementFromProvince(from, toId, soldiers, tanks, routeOverride) {
    if (!from) return;
    if (soldiers < 0) soldiers = 0;
    if (tanks < 0) tanks = 0;
    if (soldiers > from.soldiers) soldiers = from.soldiers;
    if (tanks > from.tanks) tanks = from.tanks;
    if (soldiers + tanks < 1) return;
    var route = routeOverride || movementRouteFor(from, toId);
    if (!route || route.length < 2 || route[0] !== from.id || route[route.length - 1] !== toId) return;
    from.soldiers -= soldiers;
    from.tanks -= tanks;
    if (!Number.isInteger(state.nextMovementId) || state.nextMovementId < 1) state.nextMovementId = 1;
    state.movements.push({
      id: state.nextMovementId++,
      from: from.id,
      to: toId,
      route: route.slice(),
      routeIndex: 0,
      stepProgress: 0,
      soldiers: soldiers,
      tanks: tanks,
      owner: from.owner
    });
    logEvent("military", "Армия отправлена", ownerLabel(from.owner) + " отправили " + soldiers + " солдат и " + tanks + " танков из провинции " + from.name + " в провинцию " + getProvince(toId).name + ". Расчётный маршрут: " + calculateRouteTurns(route) + " ход(а).", from.owner);
  }

  function resolveMovements() {
    if (state.movements.length === 0) return;
    var movements = state.movements.slice();
    var arrivals = [];
    state.movements = [];
    movements.forEach(function (movement) { advanceMovement(movement, arrivals); });
    if (arrivals.length > 0) resolveArrivals(arrivals);
  }

  function retreatMovementToFriendlyProvince(movement, currentId, reason) {
    var safeProvince = findNearestOwnedProvince(currentId, movement.owner);
    if (safeProvince) {
      safeProvince.soldiers += movement.soldiers;
      safeProvince.tanks += movement.tanks;
      logEvent("military", "Марш изменён", ownerLabel(movement.owner) + " отряд был остановлен: " + reason + " Войска отступили в провинцию " + safeProvince.name + ".", movement.owner);
    } else {
      logEvent("military", "Армия потеряна", ownerLabel(movement.owner) + " не смогли найти контролируемую провинцию для отступления. Отряд численностью " + movement.soldiers + " солдат и " + movement.tanks + " танков потерян.", movement.owner);
    }
  }

  function advanceMovement(mv, arrivals) {
    if (!mv.route || mv.route.length < 2 || !Number.isInteger(mv.routeIndex) ||
        mv.routeIndex < 0 || mv.routeIndex >= mv.route.length - 1) {
      retreatMovementToFriendlyProvince(mv, Number.isInteger(mv.from) ? mv.from : 0, "маршрут повреждён");
      return;
    }
    var currentId = mv.route[mv.routeIndex];
    var nextIndex = mv.routeIndex + 1;
    var nextId = mv.route[nextIndex];
    var currentProvince = getProvince(currentId);
    var nextProvince = getProvince(nextId);
    if (!currentProvince || !nextProvince) {
      retreatMovementToFriendlyProvince(mv, currentId, "провинция маршрута недоступна");
      return;
    }
    if (currentProvince.owner !== mv.owner) {
      retreatMovementToFriendlyProvince(mv, currentId, "провинция, где находился отряд, перешла противнику");
      return;
    }

    var isFinalEnemyStep = nextIndex === mv.route.length - 1 && nextProvince.owner !== mv.owner &&
      isAtWar() && NEIGHBORS[currentId].indexOf(nextId) !== -1;
    if (nextProvince.owner !== mv.owner && !isFinalEnemyStep) {
      retreatMovementToFriendlyProvince(mv, currentId, "маршрут перекрыт сменой владельца территории");
      return;
    }

    var edgeCost = 1 + (currentProvince.hasRiver ? 1 : 0);
    mv.stepProgress = (mv.stepProgress || 0) + 1;
    if (mv.stepProgress < edgeCost) {
      state.movements.push(mv);
      return;
    }
    mv.stepProgress = 0;
    mv.routeIndex = nextIndex;
    if (mv.routeIndex >= mv.route.length - 1) {
      arrivals.push(mv);
    } else {
      state.movements.push(mv);
    }
  }

  function resolveArrivals(arrivals) {
    var groups = {};
    arrivals.forEach(function (movement) {
      var key = String(movement.to);
      if (!groups[key]) groups[key] = [];
      groups[key].push(movement);
    });

    Object.keys(groups).forEach(function (key) {
      var targetId = Number(key);
      var target = getProvince(targetId);
      var group = groups[key];
      if (!target) {
        group.forEach(function (movement) {
          retreatMovementToFriendlyProvince(movement, movement.from, "цель маршрута больше не существует");
        });
        return;
      }

      var ownerAtResolution = target.owner;
      var friendlyArrivals = [];
      var hostileArrivals = [];
      group.forEach(function (movement) {
        if (movement.owner === ownerAtResolution) {
          friendlyArrivals.push(movement);
          return;
        }
        var previousId = movement.route[movement.route.length - 2];
        var validEnemyArrival = isAtWar() && NEIGHBORS[previousId] && NEIGHBORS[previousId].indexOf(target.id) !== -1;
        if (validEnemyArrival) hostileArrivals.push(movement);
        else retreatMovementToFriendlyProvince(movement, previousId, "атака стала недоступна до прибытия");
      });

      var friendlySoldiers = friendlyArrivals.reduce(function (sum, movement) { return sum + movement.soldiers; }, 0);
      var friendlyTanks = friendlyArrivals.reduce(function (sum, movement) { return sum + movement.tanks; }, 0);
      var defenderSoldiersBefore = target.soldiers;
      var defenderTanksBefore = target.tanks;
      var defenderSoldiers = defenderSoldiersBefore + friendlySoldiers;
      var defenderTanks = defenderTanksBefore + friendlyTanks;

      if (hostileArrivals.length === 0) {
        target.soldiers = defenderSoldiers;
        target.tanks = defenderTanks;
        if (friendlyArrivals.length > 0) {
          logEvent("military", "Подкрепление прибыло", ownerLabel(ownerAtResolution) + " усилили провинцию " + target.name + ": " + friendlySoldiers + " солдат и " + friendlyTanks + " танков.", ownerAtResolution);
        }
        return;
      }

      var attackerOwner = hostileArrivals[0].owner;
      var attackerSoldiers = hostileArrivals.reduce(function (sum, movement) { return sum + movement.soldiers; }, 0);
      var attackerTanks = hostileArrivals.reduce(function (sum, movement) { return sum + movement.tanks; }, 0);
      var attack = attackPower(attackerSoldiers, attackerTanks, attackerOwner);
      var defense = provinceDefenseForUnits(target, defenderSoldiers, defenderTanks);
      var attackerSourceNames = hostileArrivals.map(function (movement) {
        return getProvince(movement.route[movement.route.length - 2]).name;
      });
      var attackerLossSoldiers = 0;
      var attackerLossTanks = 0;
      var defenderLossSoldiers = 0;
      var defenderLossTanks = 0;
      var wasCapital = target.isCapital;
      var captured = attack > defense;
      var queuedOrdersCancelled = 0;
      var refundedGold = 0;
      var refundedSteel = 0;

      if (captured) {
        defenderLossSoldiers = defenderSoldiers;
        defenderLossTanks = defenderTanks;
        var survivalRatio = (attack - defense) / Math.max(1, attack);
        var survivingSoldiers = 0;
        var survivingTanks = 0;
        hostileArrivals.forEach(function (movement) {
          var survivorsSoldiers = Math.floor(movement.soldiers * survivalRatio);
          var survivorsTanks = Math.floor(movement.tanks * survivalRatio);
          survivingSoldiers += survivorsSoldiers;
          survivingTanks += survivorsTanks;
          attackerLossSoldiers += movement.soldiers - survivorsSoldiers;
          attackerLossTanks += movement.tanks - survivorsTanks;
        });
        if (survivingSoldiers + survivingTanks < 1) {
          if (attackerSoldiers > 0) survivingSoldiers = 1;
          else if (attackerTanks > 0) survivingTanks = 1;
          attackerLossSoldiers = Math.max(0, attackerSoldiers - survivingSoldiers);
          attackerLossTanks = Math.max(0, attackerTanks - survivingTanks);
        }

        var previousOwner = target.owner;
        if (target.isCapital) relocateCapital(previousOwner, target);
        queuedOrdersCancelled = target.queue.length;
        target.queue.forEach(function (order) {
          var refundOwner = order.queueOwner === BOT || order.queueOwner === PLAYER ? order.queueOwner : previousOwner;
          var goldRefund = Math.floor(Math.max(0, Number(order.costPaid) || 0) * 0.5);
          var steelRefund = Math.floor(Math.max(0, Number(order.steelPaid) || 0) * 0.5);
          if (refundOwner === PLAYER || refundOwner === BOT) {
            state.gold[refundOwner] += goldRefund;
            state.steel[refundOwner] += steelRefund;
          }
          if (refundOwner === previousOwner) {
            refundedGold += goldRefund;
            refundedSteel += steelRefund;
          }
        });
        target.owner = attackerOwner;
        target.countryId = attackerOwner === PLAYER ? "dragon-power" : "sword-union";
        target.soldiers = survivingSoldiers;
        target.tanks = survivingTanks;
        target.fort = Math.max(0, target.fort - 1);
        target.queue = [];
        recalcIncome(target);
        bumpBuildingsVersion();
        logEvent("war", "Провинция захвачена", ownerLabel(attackerOwner) + " захватили провинцию " + target.name + ". Укрепление снижено на один уровень." +
          (queuedOrdersCancelled ? " Отменено заказов: " + queuedOrdersCancelled + ". Возвращено прежнему владельцу: " + refundedGold + " золота и " + refundedSteel + " стали." : ""), attackerOwner);
      } else {
        var lossRatio = Math.min(0.8, (attack / Math.max(1, defense)) * 0.6);
        var newDefenderSoldiers = Math.max(0, defenderSoldiers - Math.floor(defenderSoldiers * lossRatio));
        var newDefenderTanks = Math.max(0, defenderTanks - Math.floor(defenderTanks * lossRatio));
        defenderLossSoldiers = defenderSoldiers - newDefenderSoldiers;
        defenderLossTanks = defenderTanks - newDefenderTanks;
        if (newDefenderSoldiers + newDefenderTanks < 1) newDefenderSoldiers = 1;
        target.soldiers = newDefenderSoldiers;
        target.tanks = newDefenderTanks;
        attackerLossSoldiers = attackerSoldiers;
        attackerLossTanks = attackerTanks;
        logEvent("war", "Атака отражена", ownerLabel(attackerOwner) + " не смогли захватить провинцию " + target.name + ". Защита удержала территорию.", attackerOwner);
      }

      var outcome = captured ? "Победа атакующих: провинция захвачена." : "Поражение атакующих: провинция удержана защитниками.";
      var summary = ownerLabel(attackerOwner) + " атаковали провинцию " + target.name + " силами " + attackerSoldiers + " солдат и " + attackerTanks +
        " танков. Атака: " + round1(attack) + ", оборона с подкреплениями: " + round1(defense) + ". " + outcome +
        " Потери атакующих: " + attackerLossSoldiers + " солдат и " + attackerLossTanks + " танков. Потери защитников: " + defenderLossSoldiers +
        " солдат и " + defenderLossTanks + " танков.";
      logBattleReport({
        type: "Сражение",
        title: (captured ? "Захват" : "Оборона") + " провинции " + target.name,
        provinceId: target.id,
        attacker: attackerOwner,
        defender: ownerAtResolution,
        sources: attackerSourceNames,
        attackPower: round1(attack),
        defensePower: round1(defense),
        result: captured ? "capture" : "repelled",
        attackerSoldiers: attackerSoldiers,
        attackerTanks: attackerTanks,
        defenderSoldiersBefore: defenderSoldiersBefore + friendlySoldiers,
        defenderTanksBefore: defenderTanksBefore + friendlyTanks,
        attackerLossSoldiers: attackerLossSoldiers,
        attackerLossTanks: attackerLossTanks,
        defenderLossSoldiers: defenderLossSoldiers,
        defenderLossTanks: defenderLossTanks,
        capitalCaptured: wasCapital,
        summary: summary
      });
    });
  }

  function processAllProduction() {
    var changed = false;
    state.provinces.forEach(function (p) {
      if (!p.queue || p.queue.length === 0) return;
      p.queue.forEach(function (q) { q.turnsLeft -= 1; });
      var completed = p.queue.filter(function (q) { return q.turnsLeft <= 0; });
      p.queue = p.queue.filter(function (q) { return q.turnsLeft > 0; });
      completed.forEach(function (q) {
        logEvent("production", "Заказ завершён", ownerLabel(p.owner) + " завершили: " + (QUEUE_LABELS[q.type] || q.type) + " в провинции " + p.name + ".", p.owner);
        switch (q.type) {
          case "soldier": p.soldiers += 1; break;
          case "tank":    p.tanks += 1; break;
          case "factory": p.factories += 1; recalcIncome(p); changed = true; break;
          case "fort":    p.fort = Math.min(FORT_MAX_LEVEL, p.fort + 1); break;
          case "steelMill": p.steelMills += 1; recalcIncome(p); changed = true; break;
          case "barracks": p.barracks = Math.max(p.barracks, q.targetLevel); changed = true; break;
          case "tankFactory": p.tankFactory = Math.max(p.tankFactory, q.targetLevel); changed = true; break;
          case "settlement":
            p.settlementLevel = Math.max(p.settlementLevel || 0, q.targetLevel);
            recalcIncome(p); changed = true; break;
        }
      });
    });
    if (changed) bumpBuildingsVersion();
  }

  function hireSoldier() {
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER || !province.barracks) return;
    var cost = inflateCost(SOLDIER_COST, PLAYER);
    if (state.gold.player < cost) return;
    if (getTotalSoldiers(PLAYER) >= getSoldierLimit(PLAYER)) return;
    state.gold.player -= cost;
    province.queue.push({ type: "soldier", turnsLeft: recruitmentTurns(province, PROD_SOLDIER), costPaid: cost, steelPaid: 0, queueOwner: PLAYER });
    logEvent("military", "Найм начат", ownerLabel(PLAYER) + " заказали солдата в провинции " + province.name + ".", PLAYER);
    render();
  }

  function hireTank() {
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER || !province.tankFactory) return;
    var cost = inflateCost(TANK_COST, PLAYER);
    if (state.gold.player < cost) return;
    if (state.steel.player < TANK_STEEL_COST) return;
    if (getTotalTanks(PLAYER) >= getTankLimit(PLAYER)) return;
    state.gold.player -= cost;
    state.steel.player -= TANK_STEEL_COST;
    province.queue.push({ type: "tank", turnsLeft: recruitmentTurns(province, PROD_TANK), costPaid: cost, steelPaid: TANK_STEEL_COST, queueOwner: PLAYER });
    logEvent("military", "Производство танка начато", ownerLabel(PLAYER) + " заказали танк в провинции " + province.name + ".", PLAYER);
    render();
  }

  function buildFactory() {
    if (selectedProvinceIds.length > 1 && !batchActionInProgress) { executeBatchConstruction(buildFactory, "Фабрика"); return; }
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER || hasConstructionInQueue(province)) return;
    var cost = inflateCost(FACTORY_COST, PLAYER);
    if (state.gold.player < cost) return;
    state.gold.player -= cost;
    province.queue.push({ type: "factory", turnsLeft: PROD_FACTORY, costPaid: cost, steelPaid: 0, queueOwner: PLAYER });
    logEvent("economy", "Строительство начато", ownerLabel(PLAYER) + " заказали фабрику в провинции " + province.name + ". Стоимость: " + cost + " золота.", PLAYER);
    if (!batchActionInProgress) render();
  }

  function buildSteelMill() {
    if (selectedProvinceIds.length > 1 && !batchActionInProgress) { executeBatchConstruction(buildSteelMill, "Сталелитейный цех"); return; }
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER || hasConstructionInQueue(province)) return;
    var cost = inflateCost(STEEL_MILL_COST, PLAYER);
    if (state.gold.player < cost) return;
    state.gold.player -= cost;
    province.queue.push({ type: "steelMill", turnsLeft: PROD_STEEL_MILL, costPaid: cost, steelPaid: 0, queueOwner: PLAYER });
    logEvent("economy", "Строительство начато", ownerLabel(PLAYER) + " заказали сталелитейный цех в провинции " + province.name + ". Стоимость: " + cost + " золота.", PLAYER);
    if (!batchActionInProgress) render();
  }

  function buildFort() {
    if (selectedProvinceIds.length > 1 && !batchActionInProgress) { executeBatchConstruction(buildFort, "Укрепление"); return; }
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER || hasConstructionInQueue(province)) return;
    var qf = province.queue.filter(function (q) { return q.type === "fort"; }).length;
    var eff = province.fort + qf;
    if (eff >= FORT_MAX_LEVEL) return;
    var cost = inflateCost(FORT_BASE_COST * (eff + 1), PLAYER);
    if (state.gold.player < cost) return;
    state.gold.player -= cost;
    province.queue.push({ type: "fort", turnsLeft: PROD_FORT, targetLevel: eff + 1, costPaid: cost, steelPaid: 0, queueOwner: PLAYER });
    logEvent("economy", "Строительство начато", ownerLabel(PLAYER) + " заказали укрепление уровня " + (eff + 1) + " в провинции " + province.name + ".", PLAYER);
    if (!batchActionInProgress) render();
  }

  function buildBarracks() {
    if (selectedProvinceIds.length > 1 && !batchActionInProgress) { executeBatchConstruction(buildBarracks, "Казарма"); return; }
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER || hasConstructionInQueue(province)) return;
    var q = province.queue.filter(function (x) { return x.type === "barracks"; }).length;
    var eff = province.barracks + q;
    if (eff >= BARRACKS_MAX_LEVEL) return;
    var cost = inflateCost(Math.round(BARRACKS_BASE_COST * Math.pow(1.5, eff)), PLAYER);
    if (state.gold.player < cost) return;
    state.gold.player -= cost;
    province.queue.push({ type: "barracks", turnsLeft: BARRACKS_BUILD_TIME, targetLevel: eff + 1, costPaid: cost, steelPaid: 0, queueOwner: PLAYER });
    logEvent("economy", "Строительство начато", ownerLabel(PLAYER) + " заказали казарму уровня " + (eff + 1) + " в провинции " + province.name + ".", PLAYER);
    if (!batchActionInProgress) render();
  }

  function buildTankFactory() {
    if (selectedProvinceIds.length > 1 && !batchActionInProgress) { executeBatchConstruction(buildTankFactory, "Танковый завод"); return; }
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER || hasConstructionInQueue(province)) return;
    var q = province.queue.filter(function (x) { return x.type === "tankFactory"; }).length;
    var eff = province.tankFactory + q;
    if (eff >= TANK_FACTORY_MAX_LEVEL) return;
    var cost = inflateCost(Math.round(TANK_FACTORY_BASE_COST * Math.pow(1.5, eff)), PLAYER);
    if (state.gold.player < cost) return;
    state.gold.player -= cost;
    province.queue.push({ type: "tankFactory", turnsLeft: TANK_FACTORY_BUILD_TIME, targetLevel: eff + 1, costPaid: cost, steelPaid: 0, queueOwner: PLAYER });
    logEvent("economy", "Строительство начато", ownerLabel(PLAYER) + " заказали танковый завод уровня " + (eff + 1) + " в провинции " + province.name + ".", PLAYER);
    if (!batchActionInProgress) render();
  }

  function buildSettlement() {
    if (selectedProvinceIds.length > 1 && !batchActionInProgress) { executeBatchConstruction(buildSettlement, "Поселение"); return; }
    if (gameOver || selectedId === null) return;
    var province = getProvince(selectedId);
    if (province.owner !== PLAYER || hasConstructionInQueue(province)) return;
    var q = province.queue.filter(function (x) { return x.type === "settlement"; }).length;
    var eff = (province.settlementLevel || 0) + q;
    if (eff >= SETTLEMENT_MAX_LEVEL) return;
    var data = SETTLEMENT_LEVELS[eff + 1];
    if (!data) return;
    var cost = inflateCost(data.cost, PLAYER);
    if (state.gold.player < cost) return;
    state.gold.player -= cost;
    province.queue.push({ type: "settlement", turnsLeft: data.time, targetLevel: eff + 1, costPaid: cost, steelPaid: 0, queueOwner: PLAYER });
    logEvent("economy", "Строительство начато", ownerLabel(PLAYER) + " заказали улучшение поселения до уровня " + (eff + 1) + " в провинции " + province.name + ".", PLAYER);
    if (!batchActionInProgress) render();
  }

  function declareWar(actor) {
    if (isAtWar() || nonAggressionTurns > 0) return false;
    cancelMoveMode();
    state.diplomacy.status = WAR;
    setRelations(-100);
    logEvent("diplomacy", "Объявлена война", "Между Драконией и Меченосцами началась война.", actor === BOT ? BOT : PLAYER);
    return true;
  }

  function playerDeclareWar() {
    if (gameOver || isAtWar() || nonAggressionTurns > 0) return;
    declareWar(PLAYER);
    render();
  }

  function signNonAggressionPact() {
    if (gameOver || isAtWar() || nonAggressionTurns > 0) return;
    if (state.gold.player < NON_AGGRESSION_COST) return;
    state.gold.player -= NON_AGGRESSION_COST;
    nonAggressionTurns = NON_AGGRESSION_DURATION;
    logEvent("diplomacy", "Пакт о ненападении заключён", "Пакт действует " + NON_AGGRESSION_DURATION + " ходов. Потрачено " + NON_AGGRESSION_COST + " золота.", PLAYER);
    render();
  }

  function improveRelations() {
    if (gameOver) return;
    var cost = inflateCost(IMPROVE_RELATIONS_COST, PLAYER);
    if (state.gold.player < cost) return;
    if (state.diplomacy.relations >= 100) return;
    state.gold.player -= cost;
    setRelations(state.diplomacy.relations + IMPROVE_RELATIONS_GAIN);
    logEvent("diplomacy", "Отношения улучшены", "Отношения изменены на +" + IMPROVE_RELATIONS_GAIN + ". Текущее значение: " + state.diplomacy.relations + ".", PLAYER);
    render();
  }

  function makePeace() {
    if (gameOver || !isAtWar() || state.diplomacy.relations < 0) return;
    state.diplomacy.status = PEACE;
    nonAggressionTurns = 0;
    logEvent("diplomacy", "Мирный договор", "Война завершена при отношениях " + state.diplomacy.relations + ".", PLAYER);
    render();
  }

  function requestAid() {
    if (gameOver || isAtWar()) return;
    if (state.diplomacy.relations <= AID_RELATIONS_REQUIRED) return;
    if (!aidReady()) return;
    if (state.gold.bot < AID_GOLD) return;
    state.gold.bot -= AID_GOLD;
    state.gold.player += AID_GOLD;
    setRelations(state.diplomacy.relations - AID_RELATIONS_PENALTY);
    state.diplomacy.lastAidTurn = state.turn;
    logEvent("diplomacy", "Финансовая помощь получена", "Игрок получил 40 золота от Меченосцев. Отношения снизились на " + AID_RELATIONS_PENALTY + ".", PLAYER);
    render();
  }

  /* ============================================================
     ХОД БОТА
     ============================================================ */
  function botTurn() {
    if (!isAtWar()) botPeaceDiplomacy();
    if (state.turn >= 200 && getInflation(BOT) > 30) {
      botLateGameInflationSpending();
    } else if (state.gold.bot > INFLATION_THRESHOLD) {
      botEmergencySpending();
    }
    if (isAtWar()) {
      botWarEconomy();
      botWarMovements();
    } else {
      botPeaceEconomy();
    }
    botTryResearch();
    botReinforceFrontline();
  }

  function botPeaceDiplomacy() {
    if (nonAggressionTurns > 0) return;
    if (Math.random() < BOT_TENSION_CHANCE) {
      setRelations(state.diplomacy.relations - BOT_TENSION_DROP);
      logEvent("diplomacy", "Отношения ухудшились", "Союз Мечей снизил отношения на " + BOT_TENSION_DROP + ". Теперь: " + state.diplomacy.relations + ".", BOT);
    }
    if (!isAtWar() && state.diplomacy.relations < BOT_WAR_RELATIONS &&
        armyPower(BOT) > armyPower(PLAYER)) {
      declareWar(BOT);
    }
  }

  function botEmergencySpending() {
    var owned = provincesOf(BOT);
    if (owned.length === 0) return;
    var guard = 0;
    while (state.gold.bot > INFLATION_THRESHOLD && guard < 30) {
      guard++;
      var before = state.gold.bot;
      if (botTryBuildSettlement(owned) && state.gold.bot < before) continue;
      if (botTryBuildFactory(owned) && state.gold.bot < before) continue;
      if (botTryBuildTankFactory(owned) && state.gold.bot < before) continue;
      if (botTryBuildBarracks(owned) && state.gold.bot < before) continue;
      if (botTryBuildSteelMill(owned) && state.gold.bot < before) continue;
      if (botHireUnits(owned, 5) > 0 && state.gold.bot < before) continue;
      if (state.gold.bot === before) break;
    }
  }

  function botReinforceFrontline() {
    var owned = provincesOf(BOT);
    if (owned.length === 0) return;
    var border = owned.filter(function (p) {
      return NEIGHBORS[p.id].some(function (nid) {
        return getProvince(nid).owner === PLAYER;
      });
    });
    if (border.length === 0) return;
    var rear = owned.filter(function (p) {
      return !border.some(function (b) { return b.id === p.id; });
    });
    if (rear.length === 0) return;

    rear.forEach(function (rp) {
      if (rp.soldiers + rp.tanks < 3) return;
      if (state.movements.some(function (m) { return m.from === rp.id || m.route[m.routeIndex] === rp.id; })) return;
      var rs = PROVINCE_SHAPES[rp.id];
      var nearest = null, nd = Infinity;
      border.forEach(function (b) {
        var bs = PROVINCE_SHAPES[b.id];
        var d = Math.hypot(bs.cx - rs.cx, bs.cy - rs.cy);
        if (d < nd) { nd = d; nearest = b; }
      });
      if (!nearest) return;
      var sendS = Math.max(0, rp.soldiers - 1);
      var sendT = rp.tanks;
      if (sendS + sendT < 1) return;
      queueMovementFromProvince(rp, nearest.id, sendS, sendT);
    });
  }

  function botFactoryLimit(owned) {
    var minF = owned.reduce(function (min, p) {
      var c = p.factories + p.queue.filter(function (q) { return q.type === "factory"; }).length;
      return Math.min(min, c);
    }, Infinity);
    return minF < 5 ? 5 : minF + 1;
  }

  function botPickFactoryTarget(owned) {
    if (owned.length === 0) return null;
    var limit = botFactoryLimit(owned);
    var countFn = function (p) {
      return p.factories + p.queue.filter(function (q) { return q.type === "factory"; }).length;
    };
    var candidates = owned.filter(function (p) { return countFn(p) < limit && !hasConstructionInQueue(p); });
    if (candidates.length === 0) return null;
    var minF = candidates.reduce(function (m, p) { return Math.min(m, countFn(p)); }, Infinity);
    var lowest = candidates.filter(function (p) { return countFn(p) === minF; });
    return lowest[Math.floor(Math.random() * lowest.length)];
  }

  function botTryBuildFactory(owned) {
    var cost = inflateCost(FACTORY_COST, BOT);
    if (state.gold.bot < cost) return false;
    var t = botPickFactoryTarget(owned);
    if (!t) return false;
    state.gold.bot -= cost;
    t.queue.push({ type: "factory", turnsLeft: PROD_FACTORY, costPaid: cost, steelPaid: 0, queueOwner: BOT });
    logEvent("economy", "ИИ начал строительство", ownerLabel(BOT) + " заказали фабрику в провинции " + t.name + ".", BOT);
    return true;
  }

  function botTryBuildSteelMill(owned) {
    var cost = inflateCost(STEEL_MILL_COST, BOT);
    if (state.gold.bot < cost) return false;
    var cands = owned.map(function (p) {
      var q = p.queue.filter(function (it) { return it.type === "steelMill"; }).length;
      return { p: p, total: p.steelMills + q };
    }).filter(function (c) { return c.total < 2 && !hasConstructionInQueue(c.p); });
    if (cands.length === 0) return false;
    cands.sort(function (a, b) { return a.total - b.total; });
    state.gold.bot -= cost;
    cands[0].p.queue.push({ type: "steelMill", turnsLeft: PROD_STEEL_MILL, costPaid: cost, steelPaid: 0, queueOwner: BOT });
    logEvent("economy", "ИИ начал строительство", ownerLabel(BOT) + " заказали сталелитейный цех в провинции " + cands[0].p.name + ".", BOT);
    return true;
  }

  function botTryBuildBarracks(owned) {
    if (owned.length === 0) return false;
    var cands = owned.map(function (p) {
      var q = p.queue.filter(function (x) { return x.type === "barracks"; }).length;
      return { p: p, eff: p.barracks + q };
    }).filter(function (c) { return c.eff < BARRACKS_MAX_LEVEL && !hasConstructionInQueue(c.p); });
    if (cands.length === 0) return false;
    cands.sort(function (a, b) { return a.eff - b.eff; });
    var t = cands[0];
    var cost = inflateCost(Math.round(BARRACKS_BASE_COST * Math.pow(1.5, t.eff)), BOT);
    if (state.gold.bot < cost) return false;
    state.gold.bot -= cost;
    t.p.queue.push({ type: "barracks", turnsLeft: BARRACKS_BUILD_TIME, targetLevel: t.eff + 1, costPaid: cost, steelPaid: 0, queueOwner: BOT });
    logEvent("economy", "ИИ начал строительство", ownerLabel(BOT) + " заказали казарму уровня " + (t.eff + 1) + " в провинции " + t.p.name + ".", BOT);
    return true;
  }

  function botTryBuildTankFactory(owned) {
    if (owned.length === 0) return false;
    var cands = owned.map(function (p) {
      var q = p.queue.filter(function (x) { return x.type === "tankFactory"; }).length;
      return { p: p, eff: p.tankFactory + q };
    }).filter(function (c) { return c.eff < TANK_FACTORY_MAX_LEVEL && !hasConstructionInQueue(c.p); });
    if (cands.length === 0) return false;
    cands.sort(function (a, b) { return a.eff - b.eff; });
    var t = cands[0];
    var cost = inflateCost(Math.round(TANK_FACTORY_BASE_COST * Math.pow(1.5, t.eff)), BOT);
    if (state.gold.bot < cost) return false;
    state.gold.bot -= cost;
    t.p.queue.push({ type: "tankFactory", turnsLeft: TANK_FACTORY_BUILD_TIME, targetLevel: t.eff + 1, costPaid: cost, steelPaid: 0, queueOwner: BOT });
    logEvent("economy", "ИИ начал строительство", ownerLabel(BOT) + " заказали танковый завод уровня " + (t.eff + 1) + " в провинции " + t.p.name + ".", BOT);
    return true;
  }

  function botTryBuildSettlement(owned, maxSpend) {
    if (owned.length === 0) return false;
    var cands = owned.map(function (p) {
      var q = p.queue.filter(function (x) { return x.type === "settlement"; }).length;
      return { p: p, eff: (p.settlementLevel || 0) + q };
    }).filter(function (c) { return c.eff < SETTLEMENT_MAX_LEVEL && !hasConstructionInQueue(c.p); });
    if (cands.length === 0) return false;
    cands.sort(function (a, b) { return a.eff - b.eff; });
    var t = cands[0];
    var data = SETTLEMENT_LEVELS[t.eff + 1];
    if (!data) return false;
    var cost = inflateCost(data.cost, BOT);
    if (state.gold.bot < cost) return false;
    if (maxSpend !== undefined && cost > maxSpend) return false;
    state.gold.bot -= cost;
    t.p.queue.push({ type: "settlement", turnsLeft: Math.max(1, data.time), targetLevel: t.eff + 1, costPaid: cost, steelPaid: 0, queueOwner: BOT });
    logEvent("economy", "ИИ начал строительство", ownerLabel(BOT) + " заказали улучшение поселения до уровня " + (t.eff + 1) + " в провинции " + t.p.name + ".", BOT);
    return true;
  }

  function botTryHireTankForBudget(owned, maxSpend) {
    if (!owned || !owned.length) return false;
    var candidates = owned.filter(function (p) {
      return p.tankFactory > 0 &&
        getTotalTanks(BOT) < getTankLimit(BOT) &&
        p.queue.filter(function (q) { return q.type === "tank"; }).length < TANK_FACTORY_LIMIT_PER_LVL;
    });
    if (!candidates.length || state.steel.bot < TANK_STEEL_COST) return false;
    candidates.sort(function (a, b) {
      return (a.tanks + a.queue.filter(function (q) { return q.type === "tank"; }).length) -
        (b.tanks + b.queue.filter(function (q) { return q.type === "tank"; }).length);
    });
    var target = candidates[0];
    var cost = inflateCost(TANK_COST, BOT);
    if (state.gold.bot < cost || cost > maxSpend) return false;
    state.gold.bot -= cost;
    state.steel.bot -= TANK_STEEL_COST;
    target.queue.push({ type: "tank", turnsLeft: recruitmentTurns(target, PROD_TANK), costPaid: cost, steelPaid: TANK_STEEL_COST, queueOwner: BOT });
    logEvent("military", "ИИ начал производство танка", ownerLabel(BOT) + " заказали танк в провинции " + target.name + ".", BOT);
    return true;
  }

  function botLateGameInflationSpending() {
    var owned = provincesOf(BOT);
    if (!owned.length || state.gold.bot <= 0) return;
    var budget = Math.floor(state.gold.bot * 0.70);
    var spent = 0;
    var guard = 0;
    while (spent < budget && guard < 64) {
      guard++;
      var remaining = budget - spent;
      var before = state.gold.bot;
      var builtSettlement = botTryBuildSettlement(owned, remaining);
      if (!builtSettlement) {
        var hiredTank = botTryHireTankForBudget(owned, remaining);
        if (!hiredTank) break;
      }
      spent += before - state.gold.bot;
    }
  }

  function botPeaceEconomy() {
    var owned = provincesOf(BOT);
    if (owned.length === 0) return;
    if (Math.random() < 0.32) botTryBuildFactory(owned);
    if (Math.random() < 0.12) botTryBuildSteelMill(owned);
    if (Math.random() < 0.22) botTryBuildBarracks(owned);
    if (Math.random() < 0.15) botTryBuildTankFactory(owned);
    if (Math.random() < 0.35) botTryBuildSettlement(owned);

    if (state.gold.bot >= FORT_BASE_COST && Math.random() < 0.22) {
      var fc = owned.filter(function (p) {
        var qf = p.queue.filter(function (q) { return q.type === "fort"; }).length;
        return p.fort + qf < FORT_MAX_LEVEL && !hasConstructionInQueue(p);
      }).sort(function (a, b) { return a.fort - b.fort; });
      if (fc.length > 0) {
        var w = fc[0];
        var qf = w.queue.filter(function (q) { return q.type === "fort"; }).length;
        var cost = inflateCost(FORT_BASE_COST * (w.fort + qf + 1), BOT);
        if (state.gold.bot >= cost) {
          state.gold.bot -= cost;
          w.queue.push({ type: "fort", turnsLeft: PROD_FORT, targetLevel: w.fort + qf + 1, costPaid: cost, steelPaid: 0, queueOwner: BOT });
          logEvent("economy", "ИИ начал строительство", ownerLabel(BOT) + " заказали укрепление в провинции " + w.name + ".", BOT);
        }
      }
    }
    if (state.gold.bot >= SOLDIER_COST && Math.random() < 0.55) botHireUnits(owned, 4);
  }

  function botWarEconomy() {
    var owned = provincesOf(BOT);
    if (owned.length === 0) return;
    if (Math.random() < 0.15) botTryBuildFactory(owned);
    if (Math.random() < 0.08) botTryBuildSteelMill(owned);
    if (Math.random() < 0.10) botTryBuildTankFactory(owned);
    if (Math.random() < 0.15) botTryBuildSettlement(owned);
    var guard = 0;
    while (state.gold.bot >= SOLDIER_COST && guard < 14) {
      if (botHireUnits(owned, 3) < 1) break;
      guard++;
    }
  }

  function botHireUnits(owned, maxHires) {
    var sProvs = owned.filter(function (p) { return p.barracks >= 1; });
    var tProvs = owned.filter(function (p) { return p.tankFactory >= 1; });
    if (sProvs.length === 0 && tProvs.length === 0) return 0;

    function pickBorder(pool) {
      var b = pool.filter(function (p) {
        return NEIGHBORS[p.id].some(function (nid) {
          return getProvince(nid).owner === PLAYER;
        });
      });
      var fp = b.length > 0 ? b : pool;
      return fp[Math.floor(Math.random() * fp.length)];
    }

    var tTarget = tProvs.length > 0 ? pickBorder(tProvs) : null;
    var sTarget = sProvs.length > 0 ? pickBorder(sProvs) : null;
    var tGold = inflateCost(TANK_COST, BOT);
    var sGold = inflateCost(SOLDIER_COST, BOT);
    var hired = 0;

    while (hired < maxHires) {
      var canTank = tTarget && state.gold.bot >= tGold && state.steel.bot >= TANK_STEEL_COST &&
                    getTotalTanks(BOT) < getTankLimit(BOT);
      var canSold = sTarget && state.gold.bot >= sGold &&
                    getTotalSoldiers(BOT) < getSoldierLimit(BOT);
      if (!canTank && !canSold) break;
      if (canTank && Math.random() < 0.42) {
        state.gold.bot -= tGold;
        state.steel.bot -= TANK_STEEL_COST;
        tTarget.queue.push({ type: "tank", turnsLeft: recruitmentTurns(tTarget, PROD_TANK), costPaid: tGold, steelPaid: TANK_STEEL_COST, queueOwner: BOT });
        logEvent("military", "ИИ начал производство танка", ownerLabel(BOT) + " заказали танк в провинции " + tTarget.name + ".", BOT);
        hired++;
      } else if (canSold) {
        state.gold.bot -= sGold;
        sTarget.queue.push({ type: "soldier", turnsLeft: recruitmentTurns(sTarget, PROD_SOLDIER), costPaid: sGold, steelPaid: 0, queueOwner: BOT });
        logEvent("military", "ИИ начал найм", ownerLabel(BOT) + " заказали солдата в провинции " + sTarget.name + ".", BOT);
        hired++;
      } else break;
    }
    return hired;
  }

  function botWarMovements() {
    var planned = {};
    provincesOf(BOT).forEach(function (from) {
      if (from.soldiers + from.tanks < 2) return;
      if (planned[from.id]) return;
      if (state.movements.some(function (mv) { return mv.from === from.id || mv.route[mv.routeIndex] === from.id; })) return;
      var best = null, bd = Infinity;
      NEIGHBORS[from.id].forEach(function (nid) {
        var t = getProvince(nid);
        if (t.owner !== PLAYER) return;
        var def = provinceDefense(t);
        if (def < bd) { bd = def; best = t; }
      });
      if (!best) return;
      var sS = Math.max(0, from.soldiers - 1);
      var sT = from.tanks;
      if (attackPower(sS, sT, BOT) <= bd) return;
      planned[from.id] = true;
      queueMovementFromProvince(from, best.id, sS, sT);
    });
  }

  function checkVictory() {
    var pC = provincesOf(PLAYER).length;
    var bC = provincesOf(BOT).length;
    if (pC === 0) { endGame("Поражение", "Союз Мечей контролирует все 48 провинций."); return true; }
    if (bC === 0) { endGame("Победа", "Все провинции перешли под ваш контроль."); return true; }
    return false;
  }

  function endGame(title, text) {
    if (!gameOver) logEvent("system", title, text);
    gameOver = true;
    lastGameOverTitle = title;
    lastGameOverMessage = text;
    cancelMoveMode();
    selectedId = null;
    selectedProvinceIds = [];
    gameOverTitle.textContent = title;
    gameOverText.textContent = text;
    gameOverModal.classList.remove("hidden");
    endTurnBtn.disabled = true;
  }

  function endTurn() {
    if (gameOver) return;
    cancelMoveMode();
    logEvent("turn", "Ход завершён", "Завершается ход " + state.turn + ".");
    /* Resolve the bot's orders before advancing any march. This gives the player's
       and the bot's movements the same one-turn advancement rule. It also means
       all attacks arriving this turn are collected before battles are resolved. */
    botTurn();
    resolveMovements();
    if (checkVictory()) { render(); return; }
    /* Both sides' existing and newly submitted production orders advance together. */
    processAllProduction();
    processResearchProgress(PLAYER);
    processResearchProgress(BOT);
    if (checkVictory()) { render(); return; }
    if (nonAggressionTurns > 0) {
      nonAggressionTurns = Math.max(0, nonAggressionTurns - 1);
      if (nonAggressionTurns === 0) logEvent("diplomacy", "Пакт завершён", "Срок действия пакта о ненападении истёк.", PLAYER);
    }
    state.turn += 1;
    var beforePlayerGold = state.gold.player;
    var beforePlayerSteel = state.steel.player;
    var beforeBotGold = state.gold.bot;
    var beforeBotSteel = state.steel.bot;
    collectIncome();
    logEvent("economy", "Доход начислен", "Драконья Мощь получила " + round1(state.gold.player - beforePlayerGold) + " золота и " + (state.steel.player - beforePlayerSteel) + " стали.", PLAYER);
    logEvent("economy", "Доход начислен", "Союз Мечей получил " + round1(state.gold.bot - beforeBotGold) + " золота и " + (state.steel.bot - beforeBotSteel) + " стали.", BOT);
    render();
    showTurnNotification(state.turn);
  }

  function showTurnNotification(turnNumber) {
    if (!turnNoticeEl) return;
    if (turnNoticeTimeout !== null) {
      clearTimeout(turnNoticeTimeout);
      turnNoticeTimeout = null;
    }
    turnNoticeEl.classList.remove("show");
    turnNoticeEl.textContent = "--- НАСТУПИЛ ХОД " + turnNumber + " ---";
    void turnNoticeEl.offsetWidth;
    turnNoticeEl.classList.add("show");
    turnNoticeTimeout = setTimeout(function () {
      turnNoticeEl.classList.remove("show");
      turnNoticeTimeout = null;
    }, 2800);
  }

  var GAME_SAVE_KEY = "province-strategy-campaign-save-v1";

  function isValidSavedState(candidate) {
    if (!candidate || typeof candidate !== "object") return false;
    if (!Array.isArray(candidate.provinces) || candidate.provinces.length !== PROVINCE_COUNT) return false;
    if (!candidate.gold || !candidate.steel || !candidate.diplomacy || !Array.isArray(candidate.movements)) return false;
    if (!Number.isInteger(candidate.turn) || candidate.turn < 1 || candidate.turn > 10000000) return false;
    if (!Number.isFinite(candidate.gold.player) || candidate.gold.player < 0 || candidate.gold.player > 1e12 ||
        !Number.isFinite(candidate.gold.bot) || candidate.gold.bot < 0 || candidate.gold.bot > 1e12 ||
        !Number.isFinite(candidate.steel.player) || candidate.steel.player < 0 || candidate.steel.player > 1e12 ||
        !Number.isFinite(candidate.steel.bot) || candidate.steel.bot < 0 || candidate.steel.bot > 1e12) return false;
    if (candidate.diplomacy.status !== PEACE && candidate.diplomacy.status !== WAR) return false;
    if (!Number.isFinite(candidate.diplomacy.relations) || candidate.diplomacy.relations < -100 || candidate.diplomacy.relations > 100) return false;
    if (candidate.diplomacy.lastAidTurn !== undefined &&
        (!Number.isInteger(candidate.diplomacy.lastAidTurn) || candidate.diplomacy.lastAidTurn < 0 || candidate.diplomacy.lastAidTurn > candidate.turn)) return false;
    if (!candidate.initialTankLimit || !Number.isInteger(candidate.initialTankLimit.player) || candidate.initialTankLimit.player < 0 ||
        !Number.isInteger(candidate.initialTankLimit.bot) || candidate.initialTankLimit.bot < 0) return false;
    if (candidate.movements.length > 25000) return false;
    if (candidate.riverPointCounts !== undefined &&
        (!candidate.riverPointCounts || typeof candidate.riverPointCounts !== "object" || Array.isArray(candidate.riverPointCounts))) return false;
    if (candidate.riverPointCounts && Object.keys(candidate.riverPointCounts).length > 15) return false;
    if (candidate.riverPointCounts) {
      var riverCountKeys = Object.keys(candidate.riverPointCounts);
      for (var riverCountIndex = 0; riverCountIndex < riverCountKeys.length; riverCountIndex++) {
        var riverCountValue = candidate.riverPointCounts[riverCountKeys[riverCountIndex]];
        if (!Number.isInteger(riverCountValue) || riverCountValue < 1 || riverCountValue > 3) return false;
      }
    }

    var validQueueTypes = Object.keys(QUEUE_LABELS);
    for (var i = 0; i < candidate.provinces.length; i++) {
      var province = candidate.provinces[i];
      if (!province || province.id !== i || (province.owner !== PLAYER && province.owner !== BOT)) return false;
      if (!Array.isArray(province.queue) || province.queue.length > 25000) return false;
      var numericFields = ["soldiers", "tanks", "factories", "steelMills", "barracks", "tankFactory", "settlementLevel", "fort", "baseIncome"];
      for (var n = 0; n < numericFields.length; n++) {
        var field = numericFields[n];
        if (!Number.isInteger(province[field]) || province[field] < 0 || province[field] > 1000000) return false;
      }
      if (province.biome !== "forest" && province.biome !== "plains" && province.biome !== "mountains") return false;
      if (province.fort > FORT_MAX_LEVEL || province.barracks > BARRACKS_MAX_LEVEL ||
          province.tankFactory > TANK_FACTORY_MAX_LEVEL || province.settlementLevel > SETTLEMENT_MAX_LEVEL) return false;
      if (typeof province.isCapital !== "boolean" || typeof province.hasRiver !== "boolean") return false;
      if (typeof province.name !== "string" || province.name.length > 120) return false;
      for (var q = 0; q < province.queue.length; q++) {
        var order = province.queue[q];
        if (!order || validQueueTypes.indexOf(order.type) === -1 || !Number.isInteger(order.turnsLeft) || order.turnsLeft < 0 || order.turnsLeft > 1000) return false;
        if (order.queueOwner !== undefined && order.queueOwner !== PLAYER && order.queueOwner !== BOT) return false;
        if (order.costPaid !== undefined && (!Number.isFinite(order.costPaid) || order.costPaid < 0 || order.costPaid > 1e12)) return false;
        if (order.steelPaid !== undefined && (!Number.isFinite(order.steelPaid) || order.steelPaid < 0 || order.steelPaid > 1e12)) return false;
        if (order.targetLevel !== undefined && (!Number.isInteger(order.targetLevel) || order.targetLevel < 1 || order.targetLevel > SETTLEMENT_MAX_LEVEL)) return false;
      }
    }
    for (var j = 0; j < candidate.movements.length; j++) {
      var movement = candidate.movements[j];
      if (!movement || (movement.owner !== PLAYER && movement.owner !== BOT) ||
          !Number.isInteger(movement.from) || movement.from < 0 || movement.from >= PROVINCE_COUNT ||
          !Number.isInteger(movement.to) || movement.to < 0 || movement.to >= PROVINCE_COUNT ||
          !Array.isArray(movement.route) || movement.route.length < 2 || movement.route.length > PROVINCE_COUNT ||
          !Number.isInteger(movement.soldiers) || movement.soldiers < 0 || movement.soldiers > 1000000 ||
          !Number.isInteger(movement.tanks) || movement.tanks < 0 || movement.tanks > 1000000 ||
          movement.soldiers + movement.tanks < 1 ||
          !Number.isInteger(movement.routeIndex) || movement.routeIndex < 0 || movement.routeIndex >= movement.route.length - 1 ||
          !Number.isInteger(movement.stepProgress) || movement.stepProgress < 0 || movement.stepProgress > 1) return false;
      for (var r = 0; r < movement.route.length; r++) {
        var provinceId = movement.route[r];
        if (!Number.isInteger(provinceId) || provinceId < 0 || provinceId >= PROVINCE_COUNT) return false;
        if (r > 0 && NEIGHBORS[movement.route[r - 1]].indexOf(provinceId) === -1) return false;
      }
      if (movement.route[0] !== movement.from || movement.route[movement.route.length - 1] !== movement.to) return false;
    }
    if (candidate.activityLog !== undefined && (!Array.isArray(candidate.activityLog) || candidate.activityLog.length > EVENT_LOG_LIMIT)) return false;
    if (candidate.battleReports !== undefined && (!Array.isArray(candidate.battleReports) || candidate.battleReports.length > BATTLE_REPORT_LIMIT)) return false;
    var logs = candidate.activityLog || [];
    for (var logIndex = 0; logIndex < logs.length; logIndex++) {
      var logEntry = logs[logIndex];
      if (!logEntry || !Number.isInteger(logEntry.turn) || logEntry.turn < 1 ||
          typeof logEntry.type !== "string" || logEntry.type.length > 60 ||
          typeof logEntry.title !== "string" || logEntry.title.length > 240 ||
          typeof logEntry.details !== "string" || logEntry.details.length > 5000 ||
          (logEntry.actor !== undefined && logEntry.actor !== PLAYER && logEntry.actor !== BOT && logEntry.actor !== "system")) return false;
    }
    var reports = candidate.battleReports || [];
    for (var reportIndex = 0; reportIndex < reports.length; reportIndex++) {
      var report = reports[reportIndex];
      if (!report || !Number.isInteger(report.turn) || report.turn < 1 ||
          typeof report.title !== "string" || report.title.length > 240 ||
          typeof report.summary !== "string" || report.summary.length > 5000 ||
          !Array.isArray(report.sources) || report.sources.length > PROVINCE_COUNT) return false;
    }
    if (!candidate.research || !candidate.research[PLAYER] || !candidate.research[BOT]) return false;
    var playerResearch = candidate.research[PLAYER];
    var botResearch = candidate.research[BOT];
    if (!playerResearch.completed || typeof playerResearch.completed.military !== "boolean" || typeof playerResearch.completed.economy !== "boolean" ||
        !botResearch.completed || typeof botResearch.completed.military !== "boolean" || typeof botResearch.completed.economy !== "boolean") return false;
    function isResearchRecordValid(research) {
      return !research.active || (
        !!RESEARCH_TECHNOLOGIES[research.active.key] &&
        Number.isInteger(research.active.turnsLeft) && research.active.turnsLeft >= 1 && research.active.turnsLeft <= 100 &&
        Number.isFinite(research.active.costPaid) && research.active.costPaid >= 0 && research.active.costPaid <= 1e12
      );
    }
    if (!isResearchRecordValid(playerResearch) || !isResearchRecordValid(botResearch)) return false;
    return true;
  }

  function freshInitialSubjects() {
    return SUBJECT_DEFINITIONS.reduce(function (result, subject) {
      result[subject.id] = { id: subject.id, name: subject.name };
      return result;
    }, {});
  }

  function freshInitialCountries() {
    return {
      "sword-union": {
        id: "sword-union", name: "Союз Мечей", owner: BOT,
        government: "Федеративное", ideology: "Стандартная — Без Идеологии",
        flagBackground: "url(#country-flag-bot-bg)", flagSymbol: "sword"
      },
      "dragon-power": {
        id: "dragon-power", name: "Драконья Мощь", owner: PLAYER,
        government: "Федеративное", ideology: "Стандартная — Без Идеологии",
        flagBackground: "url(#country-flag-player-bg)", flagSymbol: "dragon"
      }
    };
  }

  function migrateSavedState(saved) {
    if (!saved || !saved.state) return false;
    state = saved.state;
    ensureResearchState();
    if (!Number.isInteger(state.nextMovementId) || state.nextMovementId < 1) state.nextMovementId = 1;
    if (!state.subjects || typeof state.subjects !== "object" || Array.isArray(state.subjects)) {
      state.subjects = freshInitialSubjects();
    }
    if (!state.countries || typeof state.countries !== "object" || Array.isArray(state.countries) ||
        !state.countries["dragon-power"] || !state.countries["sword-union"]) {
      state.countries = freshInitialCountries();
    }
    if (!state.diplomacy || typeof state.diplomacy !== "object") return false;
    if (!Array.isArray(state.riverProvinceIds)) state.riverProvinceIds = [];
    state.riverProvinceIds = state.riverProvinceIds.filter(function (provinceId, index, ids) {
      return Number.isInteger(provinceId) && provinceId >= 0 && provinceId < PROVINCE_COUNT && ids.indexOf(provinceId) === index;
    });
    if (state.riverProvinceIds.length !== 15) state.riverProvinceIds = [];
    if (!state.riverPointCounts || typeof state.riverPointCounts !== "object" || Array.isArray(state.riverPointCounts)) state.riverPointCounts = {};
    var sanitizedRiverPointCounts = {};
    state.riverProvinceIds.forEach(function (provinceId) {
      var existingCount = Number(state.riverPointCounts[String(provinceId)]);
      sanitizedRiverPointCounts[String(provinceId)] = Number.isInteger(existingCount) && existingCount >= 1 && existingCount <= 3
        ? existingCount : 1 + Math.floor(Math.random() * 3);
    });
    state.riverPointCounts = sanitizedRiverPointCounts;
    if (!Number.isInteger(state.diplomacy.lastAidTurn) || state.diplomacy.lastAidTurn < 0) state.diplomacy.lastAidTurn = 0;
    if (!Array.isArray(state.activityLog)) state.activityLog = [];
    state.activityLog = state.activityLog.filter(function (entry) {
      return entry && Number.isInteger(entry.turn) && entry.turn >= 1 &&
        typeof entry.title === "string" && typeof entry.details === "string";
    }).slice(-EVENT_LOG_LIMIT).map(function (entry) {
      return {
        turn: entry.turn,
        type: String(entry.type || "general").slice(0, 60),
        title: String(entry.title || "Событие").slice(0, 240),
        details: String(entry.details || "").slice(0, 5000),
        actor: entry.actor === PLAYER || entry.actor === BOT || entry.actor === "system"
          ? entry.actor : inferLogActor(entry.type, entry.title, entry.details)
      };
    });
    if (!Array.isArray(state.battleReports)) state.battleReports = [];
    state.battleReports = state.battleReports.filter(function (report) {
      return report && Number.isInteger(report.turn) && report.turn >= 1 &&
        typeof report.title === "string" && typeof report.summary === "string";
    }).slice(-BATTLE_REPORT_LIMIT).map(function (report) {
      report.title = report.title.slice(0, 240);
      report.summary = report.summary.slice(0, 5000);
      if (!Array.isArray(report.sources)) report.sources = [];
      report.sources = report.sources.filter(function (source) { return typeof source === "string"; }).slice(0, PROVINCE_COUNT);
      return report;
    });
    if (!state.initialTankLimit || !Number.isFinite(state.initialTankLimit.player) || !Number.isFinite(state.initialTankLimit.bot)) {
      state.initialTankLimit = {
        player: state.provinces.reduce(function (sum, province) { return sum + (province.owner === PLAYER ? province.tanks : 0); }, 0),
        bot: state.provinces.reduce(function (sum, province) { return sum + (province.owner === BOT ? province.tanks : 0); }, 0)
      };
    }
    var usedMovementIds = {};
    state.movements.forEach(function (movement) {
      if (!Number.isInteger(movement.id) || movement.id < 1 || usedMovementIds[movement.id]) {
        while (usedMovementIds[state.nextMovementId]) state.nextMovementId += 1;
        movement.id = state.nextMovementId++;
      }
      usedMovementIds[movement.id] = true;
      if (!Number.isInteger(movement.routeIndex)) movement.routeIndex = 0;
      if (!Number.isFinite(movement.stepProgress)) movement.stepProgress = 0;
    });
    state.nextMovementId = Math.max(state.nextMovementId, state.movements.reduce(function (maxId, movement) { return Math.max(maxId, movement.id + 1); }, 1));
    state.provinces.forEach(function (province) {
      /* Migrate old saves to canonical province names and the fair biome layout. */
      province.name = provinceNameForId(province.id);
      province.biome = biomeForProvinceId(province.id);
      if (!Number.isInteger(province.terrainMarkerCount) || province.terrainMarkerCount < 3 || province.terrainMarkerCount > 7) {
        province.terrainMarkerCount = 3 + Math.floor(Math.random() * 5);
      }
      province.hasRiver = RIVER_PROVINCE_IDS.indexOf(province.id) !== -1;
      province.queue.forEach(function (order) {
        if (order.queueOwner !== PLAYER && order.queueOwner !== BOT) order.queueOwner = province.owner;
        if (!Number.isFinite(order.costPaid)) order.costPaid = 0;
        if (!Number.isFinite(order.steelPaid)) order.steelPaid = 0;
      });
      recalcIncome(province);
    });
    var playerCapital = state.provinces.filter(function (province) { return province.owner === PLAYER && province.isCapital; })
      .sort(function (a, b) { return b.baseIncome - a.baseIncome; })[0];
    var botCapital = state.provinces.filter(function (province) { return province.owner === BOT && province.isCapital; })
      .sort(function (a, b) { return b.baseIncome - a.baseIncome; })[0];
    if (!playerCapital) playerCapital = provincesOf(PLAYER).slice().sort(function (a, b) { return b.baseIncome - a.baseIncome; })[0];
    if (!botCapital) botCapital = provincesOf(BOT).slice().sort(function (a, b) { return b.baseIncome - a.baseIncome; })[0];
    state.provinces.forEach(function (province) { province.isCapital = false; });
    if (playerCapital) playerCapital.isCapital = true;
    if (botCapital) botCapital.isCapital = true;
    state.provinces.forEach(recalcIncome);
    return isValidSavedState(state);
  }

  function saveGame() {
    try {
      if (!state || !riversLayer) return;
      var riverPaths = Array.prototype.slice.call(riversLayer.querySelectorAll("path.river-path")).map(function (path) {
        return {
          className: path.getAttribute("class") || "river-path river-tributary",
          d: path.getAttribute("d") || "",
          from: path.getAttribute("data-from-province") || "",
          to: path.getAttribute("data-to-province") || ""
        };
      });
      var payload = {
        version: 8,
        state: state,
        nonAggressionTurns: nonAggressionTurns,
        gameOver: gameOver,
        gameOverTitle: lastGameOverTitle,
        gameOverMessage: lastGameOverMessage,
        activeTab: activeTab,
        journalTab: journalTab,
        riverPaths: riverPaths,
        riverProvinceIds: Array.isArray(state.riverProvinceIds) ? state.riverProvinceIds.slice() : []
      };
      window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(payload));
    } catch (error) {
      /* The campaign continues normally when browser storage is disabled or full. */
    }
  }

  function loadSavedGame() {
    var freshCampaignState = state;
    try {
      var raw = window.localStorage.getItem(GAME_SAVE_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved || (saved.version !== 1 && saved.version !== 2 && saved.version !== 3 && saved.version !== 4 && saved.version !== 5 && saved.version !== 6 && saved.version !== 7 && saved.version !== 8)) return null;
      if (!migrateSavedState(saved)) {
        state = freshCampaignState;
        return null;
      }
      nonAggressionTurns = Number.isFinite(saved.nonAggressionTurns)
        ? Math.max(0, Math.min(NON_AGGRESSION_DURATION, Math.floor(saved.nonAggressionTurns))) : 0;
      gameOver = saved.gameOver === true;
      lastGameOverTitle = typeof saved.gameOverTitle === "string" ? saved.gameOverTitle : "";
      lastGameOverMessage = typeof saved.gameOverMessage === "string" ? saved.gameOverMessage : "";
      if (provincesOf(PLAYER).length === 0) {
        gameOver = true;
        lastGameOverTitle = "Поражение";
        lastGameOverMessage = "Союз Мечей контролирует все 48 провинций.";
      } else if (provincesOf(BOT).length === 0) {
        gameOver = true;
        lastGameOverTitle = "Победа";
        lastGameOverMessage = "Все провинции перешли под ваш контроль.";
      }
      activeTab = saved.activeTab === "economy" ? "economy" : "army";
      journalTab = saved.journalTab === "battles" ? "battles" : (saved.journalTab === "bot" ? "bot" : "player");
      return saved;
    } catch (error) {
      /* Ignore unreadable saves and start a fresh campaign without keeping partially migrated data. */
      state = freshCampaignState;
      return null;
    }
  }

  function restoreRiverNetwork(paths, riverProvinceIds) {
    if (!riversLayer || !Array.isArray(paths) || paths.length < 1 || paths.length > 64) return false;
    if (!Array.isArray(riverProvinceIds)) return false;
    var validProvinceIds = riverProvinceIds.filter(function (provinceId, index, ids) {
      return Number.isInteger(provinceId) && provinceId >= 0 && provinceId < PROVINCE_COUNT && ids.indexOf(provinceId) === index;
    });
    if (validProvinceIds.length !== 15) return false;
    var validated = [];
    for (var i = 0; i < paths.length; i++) {
      var record = paths[i];
      if (!record || typeof record.d !== "string" || record.d.length > 5000 || !/^M\s*[-\d.]/.test(record.d)) return false;
      var className = typeof record.className === "string" ? record.className : "";
      if (!/^river-path river-(main|tributary|outlet)$/.test(className)) return false;
      validated.push({ className: className, d: record.d, from: String(record.from || ""), to: String(record.to || "") });
    }
    clearNode(riversLayer);
    state.riverProvinceIds = validProvinceIds.slice();
    RIVER_PROVINCE_IDS = validProvinceIds.slice();
    updateRiverProvinceClipPath();
    validated.forEach(function (record) {
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("class", record.className);
      path.setAttribute("d", record.d);
      path.setAttribute("data-from-province", record.from);
      path.setAttribute("data-to-province", record.to);
      path.setAttribute("aria-hidden", "true");
      riversLayer.appendChild(path);
    });
    return validated.length > 0;
  }

  function restart() {
    state = createInitialState();
    generateRiverNetwork();
    refreshRiverProvinceFlags();
    logEvent("system", "Новая кампания", "Началась новая кампания: 48 провинций, две стороны и 12 субъектов.");
    nonAggressionTurns = 0;
    if (turnNoticeTimeout !== null) {
      clearTimeout(turnNoticeTimeout);
      turnNoticeTimeout = null;
    }
    if (turnNoticeEl) turnNoticeEl.classList.remove("show");
    selectedId = null;
    selectedProvinceIds = [];
    moveFromId = null;
    pendingMoveTargetId = null;
    rerouteMovementId = null;
    gameOver = false;
    lastGameOverTitle = "";
    lastGameOverMessage = "";
    hasMoved = false;
    if (hasMovedTimeout !== null) {
      window.clearTimeout(hasMovedTimeout);
      hasMovedTimeout = null;
    }
    dragData = null;
    svgEl.classList.remove("is-dragging");
    svgEl.classList.remove("is-camera-active");
    document.documentElement.classList.remove("camera-busy");
    lastRenderedSelectedId = null;
    bumpBuildingsVersion();
    gameOverModal.classList.add("hidden");
    moveModal.classList.add("hidden");
    endTurnBtn.disabled = false;
    resetView();
    collectIncome();
    render();
  }

  /* ============================================================
     ОБРАБОТЧИКИ
     ============================================================ */
  hireBtn.addEventListener("click", hireSoldier);
  tankBtn.addEventListener("click", hireTank);
  factoryBtn.addEventListener("click", buildFactory);
  steelMillBtn.addEventListener("click", buildSteelMill);
  settlementBtn.addEventListener("click", buildSettlement);
  fortBtn.addEventListener("click", buildFort);
  barracksBtn.addEventListener("click", buildBarracks);
  tankFactoryBtn.addEventListener("click", buildTankFactory);

  if (journalOpenBtn) journalOpenBtn.addEventListener("click", openJournal);
  if (journalCloseBtn) journalCloseBtn.addEventListener("click", closeJournal);
  if (journalModal) {
    journalModal.addEventListener("click", function (event) {
      if (event.target === journalModal) closeJournal();
    });
  }
  if (journalPlayerTab) journalPlayerTab.addEventListener("click", function () {
    journalTab = "player";
    renderJournal();
    saveGame();
  });
  if (journalBotTab) journalBotTab.addEventListener("click", function () {
    journalTab = "bot";
    renderJournal();
    saveGame();
  });
  if (journalBattlesTab) journalBattlesTab.addEventListener("click", function () {
    journalTab = "battles";
    renderJournal();
    saveGame();
  });

  if (movementManagementOpenBtn) movementManagementOpenBtn.addEventListener("click", openMovementManagement);
  if (movementManagementCloseBtn) movementManagementCloseBtn.addEventListener("click", closeMovementManagement);
  if (movementManagementModal) movementManagementModal.addEventListener("click", function (event) {
    if (event.target === movementManagementModal) closeMovementManagement();
  });
  if (economyForecastOpenBtn) economyForecastOpenBtn.addEventListener("click", openEconomyForecast);
  if (economyForecastCloseBtn) economyForecastCloseBtn.addEventListener("click", closeEconomyForecast);
  if (economyForecastModal) economyForecastModal.addEventListener("click", function (event) {
    if (event.target === economyForecastModal) closeEconomyForecast();
  });
  if (researchOpenBtn) researchOpenBtn.addEventListener("click", openResearch);
  if (researchCloseBtn) researchCloseBtn.addEventListener("click", closeResearch);
  if (researchModal) researchModal.addEventListener("click", function (event) {
    if (event.target === researchModal) closeResearch();
  });
  if (researchMilitaryBtn) researchMilitaryBtn.addEventListener("click", function () { queueResearch("military", PLAYER); });
  if (researchEconomyBtn) researchEconomyBtn.addEventListener("click", function () { queueResearch("economy", PLAYER); });

  if (settingsOpenBtn) settingsOpenBtn.addEventListener("click", toggleSettings);
  if (settingsCloseBtn) settingsCloseBtn.addEventListener("click", closeSettings);
  if (settingsVisualTab) settingsVisualTab.addEventListener("click", function () { setSettingsTab("visual"); });
  if (settingsControlsTab) settingsControlsTab.addEventListener("click", function () { setSettingsTab("controls"); });
  Array.prototype.forEach.call(settingsKeybindingButtons, function (button) {
    button.addEventListener("click", function () {
      startKeyBindingCapture(button.getAttribute("data-keybinding"));
    });
  });
  if (settingsResetKeybindingsBtn) settingsResetKeybindingsBtn.addEventListener("click", resetKeyBindings);
  if (settingsModal) {
    settingsModal.addEventListener("click", function (event) {
      if (event.target === settingsModal) closeSettings();
    });
  }
  if (settingShowFactories) settingShowFactories.addEventListener("change", function () {
    setVisualSetting("showFactories", settingShowFactories.checked);
  });
  if (settingShowMilitary) settingShowMilitary.addEventListener("change", function () {
    setVisualSetting("showMilitary", settingShowMilitary.checked);
  });
  if (settingShowSettlements) settingShowSettlements.addEventListener("change", function () {
    setVisualSetting("showSettlements", settingShowSettlements.checked);
  });
  if (settingShowTerrain) settingShowTerrain.addEventListener("change", function () {
    setVisualSetting("showTerrain", settingShowTerrain.checked);
  });
  if (settingShowOcean) settingShowOcean.addEventListener("change", function () {
    setVisualSetting("showOcean", settingShowOcean.checked);
  });
  if (settingSmokeAnimation) settingSmokeAnimation.addEventListener("change", function () {
    setVisualSetting("animateSmoke", settingSmokeAnimation.checked);
  });
  if (settingsMapLegendToggleBtn && settingsMapLegendEl) {
    settingsMapLegendToggleBtn.addEventListener("click", function () {
      var shouldOpen = settingsMapLegendEl.classList.contains("hidden");
      settingsMapLegendEl.classList.toggle("hidden", !shouldOpen);
      settingsMapLegendToggleBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      settingsMapLegendToggleBtn.querySelector(".settings-legend-chevron").textContent = shouldOpen ? "⌃" : "⌄";
    });
  }
  if (settingsThemeToggle) settingsThemeToggle.addEventListener("click", function () {
    setVisualSetting("theme", visualSettings.theme === "dark" ? "light" : "dark");
  });

  moveBtn.addEventListener("click", function () {
    if (moveFromId !== null) { cancelMoveMode(); render(); return; }
    startMoveMode();
  });

  declareWarBtn.addEventListener("click", playerDeclareWar);
  if (nonAggressionBtn) nonAggressionBtn.addEventListener("click", signNonAggressionPact);
  improveRelationsBtn.addEventListener("click", improveRelations);
  if (peaceBtn) peaceBtn.addEventListener("click", makePeace);
  aidBtn.addEventListener("click", requestAid);
  endTurnBtn.addEventListener("click", endTurn);

  moveConfirmBtn.addEventListener("click", confirmMove);
  moveCancelBtn.addEventListener("click", function () {
    pendingMoveTargetId = null;
    moveModal.classList.add("hidden");
  });

  moveSoldiersInput.addEventListener("input", updateMovePreview);
  moveTanksInput.addEventListener("input", updateMovePreview);

  moveSoldiersInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") confirmMove();
    if (e.key === "Escape") { pendingMoveTargetId = null; moveModal.classList.add("hidden"); }
  });
  moveTanksInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") confirmMove();
    if (e.key === "Escape") { pendingMoveTargetId = null; moveModal.classList.add("hidden"); }
  });

  restartBtn.addEventListener("click", restart);

  if (settingsNewCampaignBtn) {
    settingsNewCampaignBtn.addEventListener("click", function () {
      var confirmed = window.confirm("Начать новую кампанию? Текущее сохранение будет заменено.");
      if (!confirmed) return;
      if (settingsModal) settingsModal.classList.add("hidden");
      if (settingsOpenBtn) settingsOpenBtn.setAttribute("aria-expanded", "false");
      restart();
    });
  }

  overlayCloseBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    selectedId = null;
    selectedProvinceIds = [];
    render();
  });

  if (clearMultiSelectionBtn) clearMultiSelectionBtn.addEventListener("click", function () {
    selectedProvinceIds = selectedId !== null && getProvince(selectedId).owner === PLAYER ? [selectedId] : [];
    render();
  });

  document.addEventListener("keydown", function (e) {
    if (capturedBindingKeyCode && e.code === capturedBindingKeyCode && e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (waitingForKeyBinding) {
      assignCapturedKey(e);
      return;
    }

    var code = e.code || "";
    var key = (e.key || "").toLowerCase();
    var bindings = visualSettings.keyBindings || DEFAULT_KEY_BINDINGS;

    if (code === (bindings.cancel || DEFAULT_KEY_BINDINGS.cancel)) {
      if (journalModal && !journalModal.classList.contains("hidden")) {
        closeJournal();
        return;
      }
      if (movementManagementModal && !movementManagementModal.classList.contains("hidden")) { closeMovementManagement(); return; }
      if (economyForecastModal && !economyForecastModal.classList.contains("hidden")) { closeEconomyForecast(); return; }
      if (researchModal && !researchModal.classList.contains("hidden")) { closeResearch(); return; }
      if (rerouteMovementId !== null) { cancelMovementRedirect(); render(); return; }
      if (settingsModal && !settingsModal.classList.contains("hidden")) {
        closeSettings();
        return;
      }
      if (!moveModal.classList.contains("hidden")) {
        pendingMoveTargetId = null;
        moveModal.classList.add("hidden");
        return;
      }
      if (moveFromId !== null) { cancelMoveMode(); render(); return; }
      if (selectedId !== null) { selectedId = null; selectedProvinceIds = []; render(); }
      return;
    }

    var el = document.activeElement;
    var inInput = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
                         el.tagName === "SELECT" || el.isContentEditable);
    if (inInput) return;
    if (settingsModal && !settingsModal.classList.contains("hidden")) return;
    if (journalModal && !journalModal.classList.contains("hidden")) return;
    if (movementManagementModal && !movementManagementModal.classList.contains("hidden")) return;
    if (economyForecastModal && !economyForecastModal.classList.contains("hidden")) return;
    if (researchModal && !researchModal.classList.contains("hidden")) return;
    if (!moveModal.classList.contains("hidden")) return;
    if (!gameOverModal.classList.contains("hidden")) return;

    if (code === bindings.openJournal) {
      e.preventDefault();
      openJournal();
      return;
    }
    if (code === bindings.openForecast) {
      e.preventDefault();
      openEconomyForecast();
      return;
    }
    if (code === bindings.openResearch) {
      e.preventDefault();
      openResearch();
      return;
    }
    if (code === bindings.openMarches) {
      e.preventDefault();
      openMovementManagement();
      return;
    }

    if (code === bindings.endTurn) {
      if (el && el.tagName === "BUTTON") return;
      if (gameOver) return;
      e.preventDefault();
      endTurn();
      return;
    }

    if (code === bindings.move) {
      e.preventDefault();
      if (moveFromId !== null) { cancelMoveMode(); render(); }
      else startMoveMode();
      return;
    }

    if (gameOver) return;
    if (moveFromId !== null) return;

    if (code === bindings.navigateUp) { e.preventDefault(); navigateDirection("up"); }
    else if (code === bindings.navigateDown) { e.preventDefault(); navigateDirection("down"); }
    else if (code === bindings.navigateLeft) { e.preventDefault(); navigateDirection("left"); }
    else if (code === bindings.navigateRight) { e.preventDefault(); navigateDirection("right"); }
  });

  window.addEventListener("keyup", function (event) {
    if (capturedBindingKeyCode && event.code === capturedBindingKeyCode) capturedBindingKeyCode = null;
  });

  document.addEventListener("contextmenu", function (e) {
    if (journalModal && !journalModal.classList.contains("hidden")) {
      e.preventDefault();
      closeJournal();
      return;
    }
    if (settingsModal && !settingsModal.classList.contains("hidden")) {
      e.preventDefault();
      closeSettings();
      return;
    }
    if (movementManagementModal && !movementManagementModal.classList.contains("hidden")) { e.preventDefault(); closeMovementManagement(); return; }
    if (economyForecastModal && !economyForecastModal.classList.contains("hidden")) { e.preventDefault(); closeEconomyForecast(); return; }
    if (researchModal && !researchModal.classList.contains("hidden")) { e.preventDefault(); closeResearch(); return; }
    if (rerouteMovementId !== null) { e.preventDefault(); cancelMovementRedirect(); render(); return; }
    var anyOpen = selectedId !== null || moveFromId !== null || !moveModal.classList.contains("hidden");
    if (anyOpen) {
      e.preventDefault();
      selectedId = null;
      selectedProvinceIds = [];
      cancelMoveMode();
      render();
      return;
    }
    var target = e.target;
    while (target) {
      if (target === svgEl) { e.preventDefault(); return; }
      target = target.parentNode;
    }
  });

  svgEl.addEventListener("wheel", onWheel, { passive: false });
  svgEl.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("blur", function () {
    dragData = null;
    removeSelectionRectangle();
    hasMoved = false;
    if (hasMovedTimeout !== null) {
      window.clearTimeout(hasMovedTimeout);
      hasMovedTimeout = null;
    }
    svgEl.classList.remove("is-dragging");
    if (!camAnimating) document.documentElement.classList.remove("camera-busy");
  });

  svgEl.addEventListener("auxclick", function (e) {
    if (e.button === 1) e.preventDefault();
  });

  svgEl.addEventListener("dragstart", function (e) { e.preventDefault(); });

  window.addEventListener("resize", syncHudHeight);
  window.addEventListener("orientationchange", syncHudHeight);

  syncHudHeight();
  applyVisualSettings();
  setSettingsTab("visual");
  renderBorderLayer();
  updateIslandClipPath();
  var loadedCampaign = loadSavedGame();
  if (!loadedCampaign || loadedCampaign.version < 8 || !restoreRiverNetwork(loadedCampaign.riverPaths, loadedCampaign.riverProvinceIds)) {
    generateRiverNetwork();
  }
  switchTab(activeTab);
  resetView();
  bumpBuildingsVersion();
  refreshRiverProvinceFlags();
  if (!loadedCampaign) {
    collectIncome();
    logEvent("system", "Кампания началась", "Новая кампания создана. Карта содержит 48 провинций, 12 субъектов и две противоборствующие стороны.");
  } else {
    logEvent("system", "Кампания восстановлена", "Загружено сохранение хода " + state.turn + ".");
  }
  render();
  if (gameOver) {
    gameOverTitle.textContent = lastGameOverTitle || "Кампания завершена";
    gameOverText.textContent = lastGameOverMessage || "Результат кампании сохранён в браузере.";
    gameOverModal.classList.remove("hidden");
    endTurnBtn.disabled = true;
  }
})();
