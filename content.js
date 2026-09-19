// Sinh tự động từ userscript/autogame-farm.user.js — ĐỪNG SỬA TRỰC TIẾP.
// Sửa file nguồn rồi chạy:  node build-extension.js
// Phiên bản: 1.8.2

/*
 * Vì sao không cần chuột: nút trong Discord web là thẻ <button> thật.
 * Script gọi thẳng element.click() nên không đụng con trỏ, không cướp
 * focus, và chạy được cả khi tab bị che.
 *
 * Luồng chạy:
 *   Đầu mỗi vòng, ở màn hình Dược Viên: nút Múc Nước Giếng sáng thì bấm.
 *   Dược Viên -> phân khu -> vào Vườn
 *      Ở MÀN HÌNH VƯỜN: nút AOE chăm sóc nào sáng (và hợp linh căn) thì
 *      bấm cho tới khi hết sáng, xong mới mở danh sách ô đất.
 *      Vào Ô 1 -> Bắt Sâu / Bón Phân / Tưới Nước nào SÁNG thì bấm
 *              -> cả ba TỐI thì Cây Tiếp
 *              -> Cây Tiếp cũng TỐI thì Quay Lại Vườn
 *      Về màn hình vườn: nếu MỌI ô đất đều đang chín
 *           - hợp linh căn (Mộc) -> bấm Thu Hoạch AOE
 *           - không hợp         -> bỏ vườn này khỏi vòng lặp, để người khác hái
 *   Hết vườn -> Quay Lại Dược Viên -> dược viên kế tiếp
 *   Hết dược viên -> tính 1 vòng, lặp lại.
 *
 * KHÔNG bấm "Thu Hoạch" từng cây và KHÔNG bấm "Phá Cây Trồng".
 */

(function () {
  'use strict';

  // Discord là ứng dụng một trang: đổi kênh không tải lại trang. Chặn
  // trường hợp script bị nạp hai lần vào cùng một tab.
  if (window.__autogameFarm) return;
  window.__autogameFarm = true;

  // ---------------------------------------------------------------- //
  //  Cấu hình
  // ---------------------------------------------------------------- //
  const ELEMENTS = ['Kim', 'Mộc', 'Thủy', 'Hỏa', 'Thổ'];

  // --- bí cảnh ---
  // [tên, cảnh giới, khu vực (không ghi = Ngoại Vi / Nội Vi / Trung Tâm)]
  const ZONES = ['Ngoại Vi', 'Nội Vi', 'Trung Tâm'];
  const DUNGEONS = [
    ['Luyện Khí Cốc', 'Luyện Khí'],
    ['Trúc Cơ Động', 'Trúc Cơ'],
    ['Lôi Phạt Thánh Địa', 'Kết Tinh'],
    ['Xích Dũng Sa Mạc', 'Kim Đan'],
    ['Vạn Hồn Cốc', 'Nguyên Anh'],
    // hai bí cảnh này có màn "Chọn Đạo Giới" / "Chọn Khu Vực Thám Hiểm" thay cho 3 khu vực thường
    ['Ngũ Hành Đạo Giới', 'Hóa Thần', ['Kim Đạo Giới', 'Mộc Đạo Giới', 'Thủy Đạo Giới', 'Hỏa Đạo Giới', 'Thổ Đạo Giới']],
    ['Thượng Cổ Bí Cảnh', 'Luyện Hư', ['U Minh Cổ Mộ', 'Vạn Mộc Linh Cảnh', 'Kim Cương Thần Điện', 'Huyết Ma Uyên']],
  ];
  /** Danh sách khu vực của một bí cảnh. */
  const zonesOf = (name) => (DUNGEONS.find(([n]) => n === name) || [])[2] || ZONES;
  const DOORS = ['Hưu Môn', 'Cảnh Môn', 'Khai Môn', 'Sinh Môn',
                 'Tử Môn', 'Kinh Môn', 'Thương Môn', 'Đỗ Môn'];

  // Chốt an toàn cuối cùng: chế độ nào cũng KHÔNG BAO GIỜ bấm mấy nút này.
  const NEVER_CLICK = ['rời đội', 'rời nhóm', 'rời sành', 'rời bí cảnh', 'phá cây trồng', 'đạo chủ'];

  /** Ví dụ có sẵn - lấy từ đúng những màn hình đã thấy trong game. */
  const SAMPLE_PLANS = {
    'Lôi Phạt Thánh Địa|Trung Tâm': { stages: [{ type: 'event' }, { type: 'battle' }] },
  };
  // Kỳ ngộ ra ngẫu nhiên ở các ải kỳ ngộ, nên cài theo bí cảnh chứ không theo ải.
  const SAMPLE_EVENTS = {
    'Lôi Phạt Thánh Địa': [
      { name: 'Ngũ Sắc Linh Chi', choices: ['Cẩn thận thu hái', 'Để lại cho sinh linh khác'], pick: 0 },
    ],
  };
  const DEFAULTS = {
    tick: 1200,            // ms giữa 2 lần quét
    stepDelay: 2500,       // ms nghỉ sau khi bấm, chờ bot Discord trả lời
    uiDelay: 900,          // ms nghỉ cho thao tác cục bộ (mở dropdown, bỏ qua tin nhắn)
    maxRounds: 0,          // 0 = chạy mãi
    dryRun: true,          // chỉ ghi log, KHÔNG bấm
    mode: 'farm',          // farm = chăm cây | water = chỉ múc nước | boss = đánh boss
    waterWait: 615,        // giây chờ sau khi múc (10 phút 15 giây)
    waterRetry: 10,        // giây giữa 2 lần bấm Làm Mới khi chưa hồi
    refreshBtn: 'Làm Mới',
    // --- đánh boss ---
    bossAttack: 'Tấn Công Boss',
    bossSkip: 'Bỏ Qua Animation',
    bossBack: 'Quay Lại Sảnh Boss',
    bossHeal: 'Hồi Máu',
    bossCooldown: 30,      // giây chờ sau khi hồi máu, trước lượt đánh sau
    bossRetry: 10,         // giây thử lại khi nút Tấn Công Boss còn tối
    maxAttacks: 0,         // 0 = đánh mãi
    // --- đi bí cảnh ---
    dgName: 'Lôi Phạt Thánh Địa',
    dgZone: 'Trung Tâm',
    dgAuto: true,          // tự nhận bí cảnh + khu vực từ tên tổ đội
    doors: DOORS.slice(),  // thứ tự ưu tiên cửa Bát Môn
    plans: SAMPLE_PLANS,   // 'tên|khu vực' -> { stages: [{type}], stamina, gate: { door, action } }
    events: SAMPLE_EVENTS, // tên bí cảnh -> [{ name, choices, pick }], pick = -1 là chưa chọn
    dgMax: 0,              // số lượt bí cảnh rồi dừng, 0 = mãi
    dgFight: 'KHAI CHIẾN',
    dgStart: 'Bắt Đầu',
    dgNext: 'Chiến Tiếp',
    // nút đi tiếp: màn "HẬU QUẢ" sau kỳ ngộ, màn "CHIẾN LỢI PHẨM" sau trận
    dgContinue: ['Tiếp Tục', 'Tiếp Tục Khám Phá'],
    dgStamStop: true,      // có thành viên không đủ thể lực cho lượt sau thì dừng
    dgHeal: true,          // tự bấm Hồi Toàn Đội khi máu thấp
    dgHealBelow: 50,       // % máu - thành viên nào dưới mức này thì hồi
    dgHealBtn: 'Hồi Toàn Đội',
    elements: ['Kim'],     // các linh căn đang có -> quyết định nút AOE nào bấm được
    prelude: ['Múc Nước Giếng'],                   // bấm 1 lần đầu mỗi vòng nếu sáng
    aoeBug: 'Bắt Sâu AOE',                         // tối khi hết sâu
    aoeFert: 'Bón Phân AOE',                       // KHÔNG tối: bấm lại là "Thất bại", phải chờ cooldown
    aoeWater: 'Tưới Nước AOE',                     // như bón phân
    aoeHarvest: 'Thu Hoạch AOE',                   // chỉ bấm khi cả vườn đã chín / trống
    aoeSow: 'Gieo Hạt AOE',                        // gieo lại sau khi hái (cần linh căn Mộc)
    gardenCd: 240,         // giây: cooldown mặc định của tưới / bón AOE, sửa riêng từng vườn bên dưới
    idleWait: 60,          // giây: vòng vừa rồi không có việc gì thì nghỉ chừng này rồi đi vòng mới
    autoResume: true,      // trang tải lại (Chrome ngủ tab, mất mạng...) khi đang chạy -> tự chạy tiếp
    gardens: {},           // 'dược viên|vườn' -> { cd: giây, seed: 'tên hạt giống' ('' = hái xong thì rời vườn) }
    care: ['Bắt Sâu', 'Bón Phân', 'Tưới Nước'],    // trong từng ô đất
    plotHarvest: 'Thu Hoạch',                      // chỉ ĐỌC để biết ô đã chín chưa
    duocVien: ['Dược Viên Linh', 'Dược Viên Huyền', 'Dược Viên Tiên'],
    vuon: ['Vườn Chế Đan', 'Vườn Luyện Hóa', 'Vườn Quý Hiếm'],
    // phạm vi: tên dược viên -> danh sách vườn sẽ đi. Không có tên = đi tất cả.
    scope: {
      'Dược Viên Linh': ['Vườn Luyện Hóa', 'Vườn Quý Hiếm'],
      'Dược Viên Huyền': ['Vườn Luyện Hóa', 'Vườn Quý Hiếm'],
      'Dược Viên Tiên': [],
    },
  };
  const KEY = 'autogame.farm.cfg';

  /**
   * Chỗ lưu cài đặt. Discord xoá window.localStorage trong trang để chống
   * ăn cắp token, nên userscript chạy chung ngữ cảnh trang có thể không
   * dùng được. Bản extension chạy ngữ cảnh riêng nên luôn dùng được.
   * Không có thì lưu tạm trong bộ nhớ, mất khi tải lại trang.
   */
  const store = (() => {
    try {
      const t = '__ag_probe';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return {
        ok: true,
        get: (k) => localStorage.getItem(k),
        set: (k, v) => localStorage.setItem(k, v),
      };
    } catch (e) {
      const mem = {};
      return { ok: false, get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; } };
    }
  })();

  /** Bản sao sâu của mặc định - để không lỡ tay sửa vào chính hằng số DEFAULTS. */
  const freshDefaults = () => JSON.parse(JSON.stringify(DEFAULTS));

  let cfg = freshDefaults();
  try {
    Object.assign(cfg, JSON.parse(store.get(KEY) || '{}'));
  } catch (e) { /* cấu hình hỏng thì dùng mặc định */ }
  // file cài đặt cũ chưa có mấy mục này
  if (!Array.isArray(cfg.doors) || !cfg.doors.length) cfg.doors = DOORS.slice();
  if (!cfg.plans || typeof cfg.plans !== 'object') cfg.plans = freshDefaults().plans;
  if (!cfg.events || typeof cfg.events !== 'object') cfg.events = freshDefaults().events;
  // bản 1.6.1 lưu dgContinue là một chữ 'Tiếp Tục' - thiếu nút "Tiếp Tục Khám Phá" sau trận
  if (!Array.isArray(cfg.dgContinue)) cfg.dgContinue = freshDefaults().dgContinue;
  const saveCfg = () => {
    try { store.set(KEY, JSON.stringify(cfg)); } catch (e) { /* hết chỗ lưu thì thôi */ }
  };

  const listToText = (a) => (a || []).join(', ');
  const textToList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

  // ---------------------------------------------------------------- //
  //  Đọc DOM
  // ---------------------------------------------------------------- //
  // NFC: chữ Việt gõ từ bàn phím và chữ của game có thể dựng dấu theo hai kiểu khác nhau
  const norm = (s) => (s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

  /** Chỉ còn chữ + số: "👣 TIẾP TỤC" -> "tiếp tục". Để so TRỌN chữ, không so "có chứa". */
  const bareKey = (s) => norm(s).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

  /** Chữ ký một bộ lựa chọn - không kể hoa thường, khoảng trắng, thứ tự. */
  const choiceSig = (list) => (list || []).map(norm).filter(Boolean).sort().join('|');

  // Bản cũ cài lựa chọn kỳ ngộ theo từng ải. Giờ gom về danh sách kỳ ngộ của
  // bí cảnh (giữ nguyên lựa chọn bạn đã chấm); ải chỉ còn giữ loại.
  (function moveStageEvents() {
    let moved = false;
    for (const [key, plan] of Object.entries(cfg.plans)) {
      const name = key.split('|')[0];
      for (const s of (plan && plan.stages) || []) {
        if (!('choices' in s) && !('pick' in s)) continue;
        if (s.type === 'event' && choiceSig(s.choices)) {
          const pool = cfg.events[name] || (cfg.events[name] = []);
          const pick = Number.isInteger(s.pick) ? s.pick : 0;
          const same = pool.find((e) => choiceSig(e.choices) === choiceSig(s.choices));
          if (same) same.pick = same.choices.findIndex((c) => norm(c) === norm(s.choices[pick]));
          else pool.push({ name: '', choices: s.choices.slice(), pick });
        }
        delete s.choices; delete s.pick;
        moved = true;
      }
    }
    // Bản 1.6.0 lỡ học màn "HẬU QUẢ" (chỉ có nút TIẾP TỤC) thành một kỳ ngộ - dọn đi.
    const conts = cfg.dgContinue.map(bareKey);
    for (const name of Object.keys(cfg.events)) {
      const pool = cfg.events[name];
      if (!Array.isArray(pool)) continue;
      const keep = pool.filter((e) => {
        const cs = (e.choices || []).filter((c) => norm(c));
        return !cs.length || !cs.every((c) => conts.includes(bareKey(c)));
      });
      if (keep.length !== pool.length) { cfg.events[name] = keep; moved = true; }
    }
    if (moved) saveCfg();
  })();

  // Bản cũ của chế độ chăm cây: một linh căn (hoặc "tự chọn" + danh sách nút AOE),
  // và ba nút AOE chăm sóc gộp chung một danh sách. Giờ là nhiều linh căn + từng nút riêng.
  (function migrateFarm() {
    let moved = false;
    if ('element' in cfg || 'aoeAllowed' in cfg) {
      const el = typeof cfg.element === 'string' ? cfg.element.trim() : '';
      const fromAllowed = (Array.isArray(cfg.aoeAllowed) ? cfg.aoeAllowed : [])
        .map((n) => (String(n).match(/\(([^)]+)\)/) || [])[1])
        .map((e) => ELEMENTS.find((x) => norm(x) === norm(e)))
        .filter(Boolean);
      cfg.elements = el ? [el] : (fromAllowed.length ? [...new Set(fromAllowed)] : ['Kim']);
      delete cfg.element; delete cfg.aoeAllowed;
      moved = true;
    }
    if (!Array.isArray(cfg.elements) || !cfg.elements.length) cfg.elements = ['Kim'];
    if (Array.isArray(cfg.aoeCare)) {
      for (const n of cfg.aoeCare) {
        const k = norm(n);
        if (k.includes('sâu')) cfg.aoeBug = n;
        else if (k.includes('phân')) cfg.aoeFert = n;
        else if (k.includes('nước')) cfg.aoeWater = n;
      }
      delete cfg.aoeCare;
      moved = true;
    }
    if (!cfg.gardens || typeof cfg.gardens !== 'object') cfg.gardens = {};
    if (moved) saveCfg();
  })();

  function recentMessages(n = 6) {
    return Array.from(document.querySelectorAll('li[id^="chat-messages"]')).slice(-n);
  }

  function buttonsIn(msg) {
    const out = [];
    for (const b of msg.querySelectorAll('button')) {
      const label = norm(b.textContent);
      if (!label) continue;
      out.push({
        el: b,
        label: b.textContent.replace(/\s+/g, ' ').trim(),
        key: label,
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
      });
    }
    return out;
  }

  /** Nút của MÀN HÌNH HIỆN TẠI = nút của tin nhắn mới nhất còn nút. */
  function liveButtons() {
    const msgs = recentMessages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const b = buttonsIn(msgs[i]);
      if (b.length) return b;
    }
    return [];
  }

  const allButtons = () => recentMessages().flatMap(buttonsIn);

  /** Tìm nút theo tên. Khớp trọn trước, không có thì khớp chứa. */
  function findBtn(name, list) {
    const want = norm(name);
    const btns = list || liveButtons();
    return btns.find((b) => b.key === want)
        || btns.find((b) => b.key.includes(want))
        || null;
  }

  /**
   * Nút đi tiếp của bí cảnh: "TIẾP TỤC" (hậu quả kỳ ngộ), "TIẾP TỤC KHÁM PHÁ" (sau trận).
   * Khớp TRỌN tên trong danh sách. Biến thể lạ bắt đầu bằng "Tiếp tục" chỉ được nhận
   * khi nó là nút duy nhất - để không bấm nhầm lựa chọn kỳ ngộ kiểu "Tiếp tục tiến
   * lên" nằm cạnh các lựa chọn khác.
   */
  function continueBtn(btns) {
    const acts = btns.filter((b) => !NEVER_CLICK.some((n) => b.key.includes(n)));
    const names = cfg.dgContinue.map(bareKey);
    return acts.find((b) => names.includes(bareKey(b.key)))
      || (acts.length === 1 && bareKey(acts[0].key).startsWith('tiếp tục') ? acts[0] : null);
  }

  /** Khớp TRỌN tên nút (bỏ icon), cho nút dễ trùng với nút khác: "Quay Lại" vs "Quay Lại Vườn". */
  function findExact(name, list) {
    const want = bareKey(name);
    return (list || liveButtons()).find((b) => bareKey(b.key) === want) || null;
  }

  function plotOptions() {
    return Array.from(document.querySelectorAll('[role="option"]')).map((el) => ({
      el, label: el.textContent.replace(/\s+/g, ' ').trim(),
    }));
  }

  /** Ô xổ xuống "Chọn hạt giống để gieo trồng..." của màn gieo hạt diện rộng. */
  function seedSelect() {
    const msg = liveMsg();
    if (!msg) return null;
    for (const d of msg.querySelectorAll('div[role="button"], [role="combobox"]')) {
      if (norm(d.textContent).includes('chọn hạt giống')) return d;
    }
    return msg.querySelector('[class*="select"] [role="button"], [role="combobox"]');
  }

  function plotSelect() {
    for (const msg of recentMessages(3)) {
      const el = msg.querySelector('[class*="select"] [role="button"], [role="combobox"]');
      if (el) return el;
      for (const d of msg.querySelectorAll('div[role="button"]')) {
        if (norm(d.textContent).includes('chọn một ô đất')) return d;
      }
    }
    return null;
  }

  /**
   * Chữ "Bỏ qua tin nhắn" của tin nhắn riêng tư.
   *
   * CHỈ dẹp tin nhắn KHÔNG có nút bấm. Nhiều màn hình của game (sảnh boss,
   * kết quả...) cũng là tin nhắn riêng tư — dẹp nhầm là mất luôn màn hình
   * đang cần thao tác. Tin nhắn chen ngang kiểu "đã hồi phục ... HP" thì
   * không có nút nào, đúng thứ cần dẹp.
   */
  function dismissInfo() {
    for (const msg of recentMessages(4)) {
      if (msg.querySelector('button')) continue;
      for (const el of msg.querySelectorAll('a, [role="button"], span')) {
        if (norm(el.textContent) === 'bỏ qua tin nhắn') return { el, text: msg.textContent || '' };
      }
    }
    return null;
  }
  const dismissLink = () => (dismissInfo() || {}).el || null;

  function click(el) {
    if (cfg.dryRun) return false;
    const o = { bubbles: true, cancelable: true, view: window };
    try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (e) { /* trình duyệt cũ */ }
    el.dispatchEvent(new MouseEvent('mousedown', o));
    try { el.dispatchEvent(new PointerEvent('pointerup', o)); } catch (e) { /* bỏ qua */ }
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
    return true;
  }

  // ---------------------------------------------------------------- //
  //  Linh căn: nút AOE nào tài khoản này bấm được
  // ---------------------------------------------------------------- //
  /**
   * Tên nút AOE có sẵn thuộc tính trong ngoặc: "Bắt Sâu AOE (Kim)".
   * Tài khoản lên cấp có thể có thêm linh căn, nên cfg.elements là danh sách.
   */
  const hasEl = (e) => cfg.elements.some((x) => norm(x) === norm(e));
  function canUseAoe(btn) {
    const m = btn.label.match(/\(([^)]+)\)\s*$/);
    if (!m) return true;                     // nút không ghi thuộc tính -> cho phép
    return hasEl(m[1]);
  }
  /** Thiếu linh căn nào trong Kim/Thủy/Thổ thì AOE không lo hết được -> phải vào từng ô đất. */
  const needWalk = () => !(hasEl('Kim') && hasEl('Thủy') && hasEl('Thổ'));

  // ---- cooldown & hạt giống riêng từng vườn ----
  /** "4:30" / "4'30" / "4m30s" / "270" -> 270 giây. Sai định dạng -> 0. */
  function parseCd(s) {
    const t = String(s || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return +t;
    const m = t.match(/^(\d+)(?:[:'mp′](\d{0,2}))?[s"″]?$/);
    return m ? +m[1] * 60 + (+m[2] || 0) : 0;
  }
  const fmtCd = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  /** Cài đặt riêng của một vườn: cooldown (giây) và hạt giống gieo lại. */
  function gcfg(key) {
    const g = cfg.gardens[key] || {};
    const cd = +g.cd > 0 ? +g.cd : cfg.gardenCd;
    return { cd, seed: (g.seed || '').trim() };
  }
  /** Trạng thái chạy của một vườn: mốc hết cooldown + đã bấm chưa, cho tưới và bón riêng. */
  function gst(key) {
    if (!S.gd[key]) S.gd[key] = { fert: { until: 0, clicked: false }, water: { until: 0, clicked: false } };
    return S.gd[key];
  }
  const AOE_KIND = { fert: 'bón phân', water: 'tưới nước' };
  /** Nút chăm từng cây thuộc loại nào: "Bón Phân" -> fert, "Tưới Nước" -> water, khác -> null. */
  const careKind = (name) => (/phân/.test(norm(name)) ? 'fert' : /nước/.test(norm(name)) ? 'water' : null);
  // việc này có nút AOE theo linh căn nào: bắt sâu→Kim, bón phân→Thổ, tưới nước→Thủy
  const careEl = (name) => { const k = norm(name); return k.includes('sâu') ? 'Kim' : k.includes('phân') ? 'Thổ' : k.includes('nước') ? 'Thủy' : ''; };
  /** Còn sâu trong vườn? Nút Bắt Sâu AOE sáng = còn sâu (đúng kể cả khi tài khoản không có Kim). */
  const pestsHere = (btns) => { const b = findBtn(cfg.aoeBug, btns); return !!(b && !b.disabled); };

  const cdOK = (key, kind) => gst(key)[kind].until <= Date.now();
  /** Việc tưới/bón còn phải làm ở vườn này? (chưa AOE, chưa làm tay, hết cooldown) */
  const fertPend = (key) => !S.aoeDone.fert && !S.walkDone.fert && cdOK(key, 'fert');
  const waterPend = (key) => !S.aoeDone.water && !S.walkDone.water && cdOK(key, 'water');
  /**
   * Còn việc phải vào từng ô đất làm tay không? = việc nào KHÔNG có nút AOE (thiếu linh căn)
   * mà vẫn còn phải làm; hoặc còn sâu mà không có Kim để AOE bắt (phải vào bắt tay để mở khoá tưới/bón).
   */
  function manualLeft(key, btns) {
    if (!hasEl('Kim') && pestsHere(btns)) return 'bắt sâu';
    const need = [];
    if (!hasEl('Thổ') && fertPend(key)) need.push('bón phân');
    if (!hasEl('Thủy') && waterPend(key)) need.push('tưới nước');
    return need.join(' + ');
  }

  /**
   * Đọc bảng "Chi tiết từng ô đất" ngay trên màn hình vườn, khỏi phải vào từng ô:
   *   Ô 1: 🌿 Lam Tinh Hoa (Cây non) | 💧 ẩm: 2/5 | 🪱 phân: 3/6
   *   Ô 2: 🌸 Lam Tinh Hoa (Chín muồi) | ...
   *   Ô 3: 🟫 Đất trống
   * Không đọc được (game đổi cách ghi) thì trả về [] -> bot vào từng ô như cũ.
   */
  function readPlots(text) {
    let t = (text || '').normalize('NFC');
    // dòng kết quả phía trên ("Đã thu hoạch 20 ô đất (Ô số: 1, 2...)") không phải bảng -> chỉ đọc từ tiêu đề bảng
    const head = t.search(/Chi\s*tiết\s*từng\s*ô\s*đất/i);
    if (head >= 0) t = t.slice(head);
    const out = [];
    for (const m of t.matchAll(/Ô\s*(\d+)\s*:\s*([\s\S]*?)(?=Ô\s*\d+\s*:|👉|Chọn một ô đất|$)/g)) {
      const body = m[2];
      out.push({ n: +m[1], empty: /đất\s*trống/i.test(body), ripe: /chín\s*muồi/i.test(body) });
    }
    return out;
  }

  /** Màn "Gieo Hạt Giống Diện Rộng": chỉ có ô chọn hạt giống và nút Quay Lại. */
  function isSeedScreen(text, btns) {
    return /gieo\s*hạt\s*giống\s*diện\s*rộng|chọn\s*hạt\s*giống/i.test((text || '').normalize('NFC'))
      && !!findExact('Quay Lại', btns);
  }

  // ---------------------------------------------------------------- //
  //  Phạm vi chạy
  // ---------------------------------------------------------------- //
  const scopeFor = (dv) => {
    const picked = cfg.scope[dv] === undefined ? cfg.vuon.slice() : cfg.scope[dv];
    return picked.filter((v) => cfg.vuon.includes(v));
  };
  const gkey = (dv, v) => `${dv}|${v}`;
  /** Vườn còn phải đi của một dược viên (đã trừ vườn bị loại trong phiên này). */
  const remainingFor = (dv) => scopeFor(dv).filter((v) => !S.skip.has(gkey(dv, v)));
  const activeDv = () => cfg.duocVien.filter((d) => remainingFor(d).length > 0);
  const inScope = (dv, v) => (cfg.scope[dv] === undefined ? true : cfg.scope[dv].includes(v));
  function scopeSummary() {
    const dvs = cfg.duocVien.filter((d) => scopeFor(d).length > 0);
    const n = dvs.reduce((a, d) => a + scopeFor(d).length, 0);
    return `${n} vườn trong ${dvs.length} dược viên`;
  }

  // ---------------------------------------------------------------- //
  //  Máy trạng thái
  // ---------------------------------------------------------------- //
  const S = {
    running: false, paused: false,
    curDv: '', curVuon: '',
    doneDv: new Set(),        // dược viên đã xong trong vòng này
    doneVuon: new Set(),      // vườn đã xong trong dược viên hiện tại
    skip: new Set(),          // vườn bị loại khỏi vòng lặp (chín mà không hái được)
    preludeDone: new Set(),
    plotsHere: 0, ripeHere: 0, aoeTries: 0, harvested: false,
    gd: {},                   // trạng thái cooldown từng vườn (xem gst)
    aoeDone: {},              // trong lượt AOE này đã bấm tưới/bón chưa (đặt lại khi bắt sâu lại)
    walkDone: {},             // lúc đi từng ô của vườn này có tưới/bón ô nào không
    pestWalks: 0,             // số lần vào ra vườn (bắt sâu tay) trong một lần chăm vườn
    sowing: false, sowed: false, sowFail: false, gWaits: 0, selTries: 0, sawTable: false,
    roundWork: 0, idleUntil: 0,
    rounds: 0, plots: 0, clicks: 0,
    dropdownTries: 0, plotClicks: 0, busyUntil: 0, stopReason: '',
    wphase: 'check', waterUntil: 0, waters: 0,   // chế độ chỉ múc nước
    bphase: 'attack', bossUntil: 0, attacks: 0,  // chế độ đánh boss
    dgStage: 0, dgRuns: 0, dgSeen: '',           // chế độ đi bí cảnh
    dgInRun: false, dgHealed: false, dgTeam: null, dgWaiting: false,
  };

  /** Còn bao lâu tới mốc thời gian, dạng "8:12". */
  function leftText(until) {
    const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function act(btnObj, what) {
    if (NEVER_CLICK.some((n) => btnObj.key.includes(n))) {
      warn('never:' + btnObj.key, `⛔ Chặn không bấm [${btnObj.label}] — nút này nằm trong danh sách cấm.`);
      S.busyUntil = Date.now() + cfg.stepDelay;
      return;
    }
    log(`🖱 ${cfg.dryRun ? '[thử] sẽ bấm' : 'bấm'} ${btnObj.label}${what ? ' — ' + what : ''}`, 'ok');
    click(btnObj.el);
    S.clicks++;
    S.busyUntil = Date.now() + cfg.stepDelay;
    paint();
  }

  function finish(reason) {
    S.stopReason = reason;
    S.running = false; S.paused = false;
    markRunning(false);
    log(`🎯 ${reason} — dừng`, 'ok');
    paint();
  }

  /**
   * Ghi nhớ "đang chạy" để sau khi trang tải lại (Chrome ngủ tab để tiết kiệm RAM,
   * Discord tự tải lại...) bot tự bấm Chạy lại. Dừng tay hay xong việc thì xoá.
   */
  const RUN_KEY = 'autogame.farm.running';
  function markRunning(on) {
    try {
      if (on) store.set(RUN_KEY, JSON.stringify({ mode: cfg.mode, at: Date.now() }));
      else store.set(RUN_KEY, '');
    } catch (e) { /* không lưu được thì thôi */ }
  }

  function step() {
    if (!S.running) return;
    if (cfg.mode !== 'farm' || S.idleUntil > Date.now()) paint();   // cho đồng hồ đếm ngược chạy
    if (S.paused || Date.now() < S.busyUntil) return;

    // 0) tin nhắn riêng tư che nút -> dẹp trước
    const dis = dismissInfo();
    if (dis) {
      if (cfg.mode === 'farm' && /thất\s*bại/i.test(dis.text.normalize('NFC'))) aoeFailed(dis.text);
      else log('✉ Có tin nhắn riêng tư — bỏ qua', 'ok');
      click(dis.el);
      S.busyUntil = Date.now() + cfg.uiDelay;
      return;
    }

    if (cfg.mode === 'water') return stepWater();
    if (cfg.mode === 'boss') return stepBoss();
    if (cfg.mode === 'dungeon') return stepDungeon();

    settleAoe();
    const btns = liveButtons();
    const text = liveText();

    // 1) màn hình một ô đất
    const backVuon = findBtn('Quay Lại Vườn', btns);
    if (backVuon) return care(btns, backVuon);

    // 1b) màn chọn hạt giống sau khi bấm Gieo Hạt AOE
    if (isSeedScreen(text, btns)) return inSeedScreen(btns);

    // 2) danh sách ô đất đang xổ xuống
    const opts = plotOptions();
    if (opts.length) {
      const first = opts.find((o) => /^ô\s*1\b/i.test(o.label)) || opts[0];
      S.dropdownTries = 0; S.plotClicks = 0;
      log(`🌱 Chọn ô đất: ${first.label}`, 'ok');
      click(first.el);
      S.busyUntil = Date.now() + cfg.stepDelay;
      return;
    }

    // 3) màn hình vườn
    const backPk = findBtn('Quay Lại Phân Khu', btns);
    if (backPk) return inGarden(btns, backPk, text);

    // 4) màn hình phân khu (danh sách vườn)
    const backDv = findBtn('Quay Lại Dược Viên', btns);
    if (backDv) return inPhanKhu(btns, backDv);

    // 5) màn hình ngoài cùng (danh sách dược viên)
    if (inDuocVien(btns)) return;

    warn('lost', '⚠ Không nhận ra màn hình nào — bấm "Quét thử" xem script thấy gì.');
  }

  // ---------------------------------------------------------------- //
  //  Chế độ CHỈ MÚC NƯỚC - đứng yên ở màn hình Dược Viên
  //
  //    bấm Múc Nước  ->  chờ 10 phút 15 giây
  //                  ->  bấm Làm Mới, xem nút Múc Nước sáng chưa
  //                        chưa  -> 10 giây sau bấm Làm Mới lại
  //                        rồi   -> bấm Múc Nước, chờ tiếp
  // ---------------------------------------------------------------- //
  function stepWater() {
    const btns = liveButtons();
    const water = findBtn(cfg.prelude[0] || 'Múc Nước Giếng', btns);
    if (!water) {
      warn('water', '⚠ Không thấy nút múc nước — hãy để Discord ở màn hình Dược Viên.');
      return;
    }

    // đang đếm giờ -> tới hạn thì bấm Làm Mới rồi kiểm tra
    if (S.wphase === 'wait' || S.wphase === 'retry') {
      if (Date.now() < S.waterUntil) return;
      const rf = findBtn(cfg.refreshBtn, btns);
      if (!rf) { warn('refresh', `⚠ Không thấy nút ${cfg.refreshBtn}`); return; }
      S.wphase = 'check';
      return act(rf, 'kiểm tra nút múc nước');
    }

    // vừa làm mới xong -> đọc trạng thái nút
    if (!water.disabled) {
      S.waters++;
      S.wphase = 'wait';
      S.waterUntil = Date.now() + cfg.waterWait * 1000;
      return act(water, `lần múc thứ ${S.waters} — chờ ${leftText(S.waterUntil)} nữa`);
    }
    S.wphase = 'retry';
    S.waterUntil = Date.now() + cfg.waterRetry * 1000;
    log(`💧 Giếng chưa hồi — ${cfg.waterRetry}s nữa làm mới lại`, 'info');
  }

  // ---------------------------------------------------------------- //
  //  Chế độ ĐÁNH BOSS
  //
  //    Sảnh boss: Tấn Công Boss  ->  Bỏ Qua Animation
  //            -> Quay Lại Sảnh Boss  ->  Hồi Máu
  //            -> chờ hết cooldown  ->  Làm Mới  ->  đánh tiếp
  //
  //  Tin nhắn "đã tự động hồi phục ... HP" hiện ra sau khi hồi máu sẽ
  //  được dẹp bằng luật bỏ qua tin nhắn riêng tư ở step().
  //  KHÔNG bao giờ bấm "Rời Sành" hay "Sành Boss".
  // ---------------------------------------------------------------- //
  function stepBoss() {
    const btns = liveButtons();

    // 1) đang đánh -> bỏ qua animation cho nhanh
    const skip = findBtn(cfg.bossSkip, btns);
    if (skip && !skip.disabled) return act(skip, 'bỏ qua animation');

    // 2) màn tổng kết -> quay lại sảnh
    const back = findBtn(cfg.bossBack, btns);
    if (back && !back.disabled) {
      S.bphase = 'heal';
      return act(back, 'xong lượt đánh, về sảnh');
    }

    // 3) sảnh boss
    const atk = findBtn(cfg.bossAttack, btns);
    if (!atk) {
      warn('boss', `⚠ Không thấy nút ${cfg.bossAttack} — hãy để Discord ở Sảnh Boss.`);
      return;
    }

    if (S.bphase === 'heal') {
      const heal = findBtn(cfg.bossHeal, btns);
      S.bphase = 'cool';
      S.bossUntil = Date.now() + cfg.bossCooldown * 1000;
      if (heal && !heal.disabled) return act(heal, 'hồi máu');
      log(`❤ ${cfg.bossHeal} đang tối — bỏ qua, chờ ${cfg.bossCooldown}s`, 'info');
      return;
    }

    if (S.bphase === 'cool') {
      if (Date.now() < S.bossUntil) return;
      S.bphase = 'attack';
      const rf = findBtn(cfg.refreshBtn, btns);
      if (rf && !rf.disabled) return act(rf, 'làm mới sảnh boss');
      return;
    }

    // bphase = 'attack'
    if (!atk.disabled) {
      S.attacks++;
      if (cfg.maxAttacks > 0 && S.attacks > cfg.maxAttacks) {
        finish(`Đã đánh đủ ${cfg.maxAttacks} lượt`);
        return;
      }
      return act(atk, `lượt đánh thứ ${S.attacks}`);
    }
    S.bphase = 'cool';
    S.bossUntil = Date.now() + cfg.bossRetry * 1000;
    log(`⏳ ${cfg.bossAttack} đang tối — ${cfg.bossRetry}s nữa thử lại`, 'info');
  }

  // ---------------------------------------------------------------- //
  //  Chế độ ĐI BÍ CẢNH
  //
  //  Bot nhìn màn hình đang hiện để biết phải làm gì, không đi theo kịch
  //  bản mù. Kế hoạch từng ải chỉ dùng để TRẢ LỜI KỲ NGỘ.
  //
  //    Sảnh tổ đội     -> Bắt Đầu
  //    Chọn cửa        -> cửa đứng cao nhất trong thứ tự Bát Môn đã xếp
  //    Kỳ ngộ          -> lựa chọn đã cài cho ải đó
  //    Chuẩn bị đánh   -> KHAI CHIẾN
  //    Hết lượt        -> đếm 1 lượt, rồi Chiến Tiếp
  // ---------------------------------------------------------------- //
  const planKey = (name, zone) => `${name}|${zone}`;

  /** Kế hoạch của bí cảnh đang chạy (tạo rỗng nếu chưa có). */
  function currentPlan() {
    const k = planKey(cfg.dgName, cfg.dgZone);
    if (!cfg.plans[k]) cfg.plans[k] = { stages: [] };
    return cfg.plans[k];
  }

  /** Tin nhắn mới nhất còn nút = màn hình đang cần thao tác. */
  function liveMsg() {
    const msgs = recentMessages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].querySelector('button')) return msgs[i];
    }
    return null;
  }

  /** Chữ của tin nhắn đang có nút - để đọc "ẢI N", "KỲ NGỘ", tên tổ đội... */
  function liveText() {
    const msg = liveMsg();
    return msg ? msg.textContent || '' : '';
  }

  const DOOR_KEYS = () => cfg.doors.map(norm);

  /** Nút cửa có dạng "[Sinh Môn]" - bỏ ngoặc rồi so với 8 cửa đã biết. */
  function doorName(btn) {
    const k = btn.key.replace(/[[\]]/g, '').trim();
    return DOOR_KEYS().includes(k) ? k : null;
  }

  /** "TỔ ĐỘI: TRUNG TÂM - Lôi Phạt Thánh Địa (🔒 Riêng Tư)" -> tên + khu vực. */
  function detectDungeon(text) {
    const m = text.match(/TỔ\s*ĐỘI\s*:\s*(.+?)\s*[-–]\s*(.+?)\s*\(/i);
    if (!m) return;
    const [a, b] = [norm(m[1]), norm(m[2])];
    const dg = DUNGEONS.find(([n]) => b.includes(norm(n))) || DUNGEONS.find(([n]) => a.includes(norm(n)));
    if (!dg) return;
    const zoneTxt = b.includes(norm(dg[0])) ? a : b;
    const zone = zonesOf(dg[0]).find((z) => norm(z) === zoneTxt);
    if (!zone) return;
    const seen = planKey(dg[0], zone);
    if (seen === S.dgSeen) return;
    S.dgSeen = seen;
    if (cfg.dgAuto && (dg[0] !== cfg.dgName || zone !== cfg.dgZone)) {
      cfg.dgName = dg[0]; cfg.dgZone = zone; saveCfg();
      log(`🗺 Nhận ra bí cảnh: ${dg[0]} · ${zone} — dùng kế hoạch của nó.`, 'head');
      if ($('#ag-set').style.display === 'block') buildDungeon();
    }
  }

  /**
   * Đọc sảnh tổ đội: máu + thể lực từng thành viên và thể lực tốn mỗi lượt.
   *
   *   ⚡ Tiêu hao khi bắt đầu: 10 Thể Lực mỗi thành viên
   *   1. ✅ Tiền Tiểu Tiên [Kim Đan - Cửu Tầng]
   *      └ Sinh mệnh: ████ (449950/451864)
   *      └ Thể lực:  ████ (329/360)
   *
   * Dấu hai chấm ngay sau "Thể lực" là để khỏi khớp nhầm dòng "10 Thể Lực mỗi...".
   */
  function readTeam(text) {
    const num = (s) => +String(s).replace(/[^\d]/g, '');
    const pairs = (re) => [...text.matchAll(re)].map((m) => [num(m[1]), num(m[2])]);
    const hp = pairs(/Sinh\s*mệnh\s*:[^()]*\(\s*([\d.,]+)\s*\/\s*([\d.,]+)\s*\)/giu);
    const st = pairs(/Thể\s*lực\s*:[^()]*\(\s*([\d.,]+)\s*\/\s*([\d.,]+)\s*\)/giu);
    const names = [...text.matchAll(
      /(\d)\.\s*(?:\p{Extended_Pictographic}️?\s*)*([^[\]\d][^[\]]{0,38}?)\s*\[/gu)]
      .map((m) => m[2].trim());
    const members = [];
    for (let i = 0; i < Math.max(hp.length, st.length); i++) {
      members.push({ name: names[i] || `thành viên ${i + 1}`, hp: hp[i] || null, st: st[i] || null });
    }
    const cost = text.match(/Tiêu\s*hao[^:]*:\s*(\d+)\s*Thể\s*lực/iu);
    return { members, cost: cost ? +cost[1] : 0 };
  }

  const hpPct = (m) => (m.hp && m.hp[1] ? (m.hp[0] * 100) / m.hp[1] : 100);

  /** Thể lực mỗi lượt: số bạn cài cho bí cảnh này, không cài thì đọc trên màn hình. */
  function staminaCost(team) {
    const set = +currentPlan().stamina || 0;
    return set > 0 ? set : team.cost;
  }

  /**
   * Chốt ở sảnh, ngay trước khi bắt đầu một lượt.
   * Trả về true nghĩa là đã xử lý (dừng hẳn, hoặc vừa bấm hồi) - nhường lượt quét.
   */
  function lobbyGate(btns, text) {
    const team = readTeam(text);
    S.dgTeam = team;
    if (!team.members.length) {
      warn('noteam', '⚠ Không đọc được máu / thể lực của tổ đội — bỏ qua bước kiểm tra.');
      return false;
    }

    // 1) thể lực: ai không đủ cho lượt sau thì dừng hẳn
    if (cfg.dgStamStop) {
      const cost = staminaCost(team);
      if (!cost) {
        warn('nocost', '⚠ Không biết bí cảnh này tốn bao nhiêu thể lực — hãy cài ở ⚙ → Thể lực.');
      } else {
        const low = team.members.filter((m) => m.st && m.st[0] < cost);
        if (low.length) {
          finish(low.map((m) => `${m.name} còn ${m.st[0]} thể lực`).join(', ')
            + ` — cần ${cost} mỗi lượt`);
          return true;
        }
      }
    }

    // 2) máu: ai dưới ngưỡng thì bấm Hồi Toàn Đội (mỗi lần ở sảnh chỉ hồi 1 lần)
    if (cfg.dgHeal && !S.dgHealed) {
      const hurt = team.members.filter((m) => m.hp && hpPct(m) < cfg.dgHealBelow);
      if (hurt.length) {
        const who = hurt.map((m) => `${m.name} ${Math.floor(hpPct(m))}%`).join(', ');
        const heal = findBtn(cfg.dgHealBtn, btns);
        S.dgHealed = true;
        if (heal && !heal.disabled) {
          act(heal, `máu thấp: ${who}`);
          return true;
        }
        log(`❤ Máu thấp (${who}) nhưng nút ${cfg.dgHealBtn} đang tối — đi tiếp.`, 'warn');
      }
    }
    return false;
  }

  /** Nút khớp chữ của một lựa chọn đã cài. */
  const matchChoice = (btns, t) => {
    const want = norm(t);
    if (!want) return null;
    return btns.find((b) => b.key === want) || btns.find((b) => b.key.includes(want)) || null;
  };

  /**
   * Tin nhắn trận đấu: "ĐỆ 1 TRỌNG (Hiệp 1)", "Trận chiến bắt đầu! Đang giao chiến với
   * yêu thú", ĐỒNG MINH / KẺ ĐỊCH. Nó không có nút, nhưng tin nhắn cũ phía trên (KHAI
   * CHIẾN đã tối...) thì vẫn còn nút -> phải nhìn tin nhắn MỚI NHẤT chứ không phải tin
   * mới nhất còn nút. Trước nó là KHAI CHIẾN, sau nó là TIẾP TỤC KHÁM PHÁ.
   */
  const BATTLE_RE = /trận\s*chiến\s*bắt\s*đầu|đang\s*giao\s*chiến|kẻ\s*địch|\(\s*hiệp\s*\d+\s*\)/iu;
  function inBattle() {
    const msgs = recentMessages(4);
    // tin mới nhất còn nút SÁNG là màn đang thao tác; chỉ xét những tin mới hơn nó
    let live = -1;
    for (let k = msgs.length - 1; k >= 0; k--) {
      if (buttonsIn(msgs[k]).some((b) => !b.disabled)) { live = k; break; }
    }
    for (let k = msgs.length - 1; k > live; k--) {
      if (BATTLE_RE.test((msgs[k].textContent || '').normalize('NFC'))) return true;
    }
    return false;
  }

  /**
   * Màn "Chọn Đạo Giới" (Ngũ Hành Đạo Giới) / "Chọn Khu Vực Thám Hiểm" (Thượng Cổ Bí
   * Cảnh): nút là tên khu vực. Nhận ra bí cảnh nào qua chính các nút đó.
   */
  function zoneEntry(btns) {
    for (const [name, , zs] of DUNGEONS) {
      if (!zs) continue;
      const hits = btns.filter((b) => zs.some((z) => bareKey(z) === bareKey(b.key)));
      if (hits.length >= 2) return { name, hits };
    }
    return null;
  }

  /** Cửa ải đầu kiểu Vạn Hồn Cốc · Trung Tâm: "Ải Cầu Trần", "Ải Giao Long"... */
  const gateDoors = (btns) => btns.filter((b) => /^ải\s+\S/u.test(bareKey(b.key))
    && !NEVER_CLICK.some((n) => b.key.includes(n)));
  const isGuardFight = (b) => bareKey(b.key).includes('khiêu chiến thủ quan');
  const isGuardGive = (b) => bareKey(b.key).startsWith('giao nộp');

  function stepDungeon() {
    const btns = liveButtons();
    const text = liveText();
    const st = text.match(/ẢI\s*(\d+)/i);
    if (st) S.dgStage = +st[1];
    detectDungeon(text);

    // 0) đang đánh: tin nhắn trận đấu không có nút - chỉ việc chờ màn CHIẾN LỢI PHẨM
    if (!btns.length || inBattle()) {
      if (!S.dgWaiting) log(`⚔ Ải ${S.dgStage || '?'}: đang đánh — chờ kết quả trận.`, 'info');
      S.dgWaiting = true;
      return;
    }
    S.dgWaiting = false;

    // 0b) màn chọn khu vực của Ngũ Hành Đạo Giới / Thượng Cổ Bí Cảnh
    const entry = zoneEntry(btns);
    if (entry) {
      if (entry.name !== cfg.dgName) {
        if (!cfg.dgAuto) { warn('dgentry', `⚠ Đang ở màn vào ${entry.name} nhưng cài ${cfg.dgName} — bật "Tự nhận bí cảnh" hoặc chọn lại.`); return; }
        cfg.dgName = entry.name;
        if (!zonesOf(entry.name).includes(cfg.dgZone)) cfg.dgZone = zonesOf(entry.name)[0];
        saveCfg();
        log(`🗺 Nhận ra bí cảnh: ${cfg.dgName} · ${cfg.dgZone} — dùng kế hoạch của nó.`, 'head');
        if ($('#ag-set').style.display === 'block') buildDungeon();
      }
      const want = entry.hits.find((b) => bareKey(b.key) === bareKey(cfg.dgZone));
      if (!want) { warn('dgzone', `⚠ Màn vào ${entry.name} có ${entry.hits.map((b) => b.label).join(', ')} nhưng đang cài "${cfg.dgZone}" — vào ⚙ chọn lại.`); return; }
      if (want.disabled) { warn('dgzone2', `⏳ ${want.label} đang tối — chờ.`); return; }
      return act(want, `vào ${cfg.dgName} · ${cfg.dgZone}`);
    }

    // 0c) cửa ải đầu (Vạn Hồn Cốc · Trung Tâm): 5 cửa "Ải ..." rồi khiêu chiến / giao nộp
    const gates = gateDoors(btns);
    if (gates.length >= 2) {
      const plan = currentPlan();
      const names = gates.map((b) => b.label);
      if (JSON.stringify(plan.gateDoors || []) !== JSON.stringify(names)) {
        plan.gateDoors = names; saveCfg();
        if ($('#ag-set').style.display === 'block') buildDungeon();
      }
      const g = plan.gate || {};
      const want = g.door && gates.find((b) => bareKey(b.key) === bareKey(g.door));
      if (!want) {
        warn('dggate', `⚠ ${cfg.dgName} · ${cfg.dgZone} hỏi chọn cửa ải: ${names.join(', ')} — chưa cài. `
          + 'Vào ⚙ → "Cửa ải đầu" để chọn; bot chờ.');
        return;
      }
      if (want.disabled) { warn('dggate2', `⏳ ${want.label} đang tối — chờ.`); return; }
      S.dgInRun = true;
      return act(want, 'cửa ải đầu');
    }
    const gFight = btns.find(isGuardFight), gGive = btns.find(isGuardGive);
    if (gFight || gGive) {
      const g = currentPlan().gate || {};
      const give = g.action === 'give';
      const want = give ? gGive : gFight;
      if (!want) {
        warn('dgguard', `⚠ Cài "${give ? 'giao nộp' : 'khiêu chiến thủ quan'}" nhưng màn hình chỉ có `
          + `${[gFight, gGive].filter(Boolean).map((b) => b.label).join(', ')} — vào ⚙ đổi lại; bot chờ.`);
        return;
      }
      if (want.disabled) { warn('dgguard2', `⏳ ${want.label} đang tối${give ? ' (chưa đủ linh quả?)' : ''} — chờ.`); return; }
      S.dgInRun = true;
      return act(want, give ? 'giao nộp linh quả' : 'khiêu chiến thủ quan');
    }

    // 1) đang đánh có animation -> bỏ qua
    const skip = findBtn('Bỏ Qua Animation', btns);
    if (skip && !skip.disabled) return act(skip, 'bỏ qua animation');

    // 2) chuẩn bị chiến đấu
    const fight = findBtn(cfg.dgFight, btns);
    if (fight && !fight.disabled) return act(fight, `ải ${S.dgStage || '?'} — chiến đấu`);

    // 3) chọn cửa Bát Môn: lấy cửa đứng cao nhất trong thứ tự đã xếp
    const doors = btns.filter((b) => !b.disabled && doorName(b));
    if (doors.length) {
      S.dgInRun = true;               // bot bắt đầu giữa chừng thì lượt này vẫn được đếm
      const order = DOOR_KEYS();
      doors.sort((a, b) => order.indexOf(doorName(a)) - order.indexOf(doorName(b)));
      const pick = doors[0];
      const all = doors.map((d) => d.label.replace(/[[\]]/g, '')).join(', ');
      return act(pick, `ải ${S.dgStage || '?'} — có ${all}`);
    }

    // 4) sảnh tổ đội: lần đầu (Bắt Đầu) hoặc vừa xong một lượt (Chiến Tiếp)
    const next = findBtn(cfg.dgNext, btns);
    const start = findBtn(cfg.dgStart, btns);
    const hasNext = next && !next.disabled;
    if (hasNext || start) {
      // Chỉ đếm khi thật sự vừa đi xong - đứng ở sảnh bấm hồi máu rồi quay
      // lại đây thì không được đếm thêm lần nữa.
      if (hasNext && S.dgInRun) {
        S.dgInRun = false;
        S.dgRuns++;
        log(`🏁 Xong lượt bí cảnh thứ ${S.dgRuns}` + (cfg.dgMax ? `/${cfg.dgMax}` : ''), 'ok');
        if (cfg.dgMax > 0 && S.dgRuns >= cfg.dgMax) {
          finish(`Đã đi đủ ${S.dgRuns} lượt bí cảnh`);
          return;
        }
      }

      if (lobbyGate(btns, text)) return;

      const go = hasNext ? next : start;
      if (go.disabled) {
        warn('dgstart', `⏳ ${cfg.dgStart} đang tối — chờ cả đội sẵn sàng.`);
        return;
      }
      S.dgStage = 0; S.dgInRun = true; S.dgHealed = false;
      return act(go, hasNext ? 'lượt tiếp theo' : `bắt đầu ${cfg.dgName} · ${cfg.dgZone}`);
    }

    // 5) màn "HẬU QUẢ" sau kỳ ngộ / "CHIẾN LỢI PHẨM" sau trận: chỉ đội trưởng bấm được
    const cont = continueBtn(btns);
    if (cont) {
      if (!cont.disabled) return act(cont, `ải ${S.dgStage || '?'} — xong, đi tiếp`);
      warn('dgcont', `⏳ ${cont.label} đang tối — chỉ đội trưởng bấm được, bot chờ.`);
      return;
    }

    // 6) kỳ ngộ
    if (handleEvent(btns, text)) return;

    warn('dglost', '⚠ Không nhận ra màn hình bí cảnh — bấm "Quét thử" xem script thấy gì.');
  }

  // ---- kỳ ngộ ----
  // Mỗi bí cảnh có vài loại kỳ ngộ, ra ngẫu nhiên ở các ải kỳ ngộ. Nên bot
  // nhận diện kỳ ngộ theo tên + các lựa chọn đang hiện, không theo số ải.

  /** Danh sách kỳ ngộ của một bí cảnh - dùng chung cả 3 khu vực. */
  function eventPool(name = cfg.dgName) {
    if (!Array.isArray(cfg.events[name])) cfg.events[name] = [];
    return cfg.events[name];
  }

  const eventLabel = (e) => e.name || e.choices.filter((c) => norm(c)).join(' / ') || '(kỳ ngộ trống)';
  /** Chữ của lựa chọn đã chấm, '' nếu chưa chọn. */
  const pickOf = (e) => (e.pick >= 0 && norm(e.choices[e.pick]) ? e.choices[e.pick] : '');

  /** Nút đang hiện có thể là lựa chọn kỳ ngộ (bỏ cửa, nút điều hướng, nút cấm). */
  function choiceButtons(btns) {
    const skip = [cfg.dgFight, cfg.dgStart, cfg.dgNext, ...cfg.dgContinue, cfg.dgHealBtn,
                  'Bỏ Qua Animation', cfg.refreshBtn].map(bareKey);
    return btns.filter((b) => !doorName(b)
      && !skip.includes(bareKey(b.key))
      && !/^ải\s+\S/u.test(bareKey(b.key)) && !isGuardFight(b) && !isGuardGive(b)
      && !NEVER_CLICK.some((n) => b.key.includes(n)));
  }
  const choiceButtonsOnScreen = () => choiceButtons(liveButtons());

  /**
   * Kỳ ngộ nào trong danh sách đang hiện. Một kỳ ngộ khớp khi MỌI lựa chọn đã
   * cài của nó đều có trên màn hình - nên hai kỳ ngộ chung một nút "Bỏ đi" vẫn
   * không lẫn. Nhiều cái cùng khớp thì ưu tiên cái có tên xuất hiện trong tin
   * nhắn, rồi cái khớp đủ số nút, rồi cái cài nhiều lựa chọn hơn.
   * Trả về { event } | { tie: [...] } (trùng mà cài chọn khác nhau) | {}.
   */
  function whichEvent(opts, text) {
    const t = norm(text);
    const hits = [];
    for (const e of eventPool()) {
      const cs = e.choices.filter((c) => norm(c));
      if (!cs.length || !cs.every((c) => matchChoice(opts, c))) continue;
      const score = (e.name && t.includes(norm(e.name)) ? 100 : 0)
        + (cs.length === opts.length ? 10 : 0) + cs.length + (pickOf(e) ? 0.5 : 0);
      hits.push({ e, score });
    }
    if (!hits.length) return {};
    hits.sort((a, b) => b.score - a.score);
    const top = hits.filter((h) => h.score === hits[0].score).map((h) => h.e);
    // trùng nhau mà cùng bấm một nút thì cũng như nhau
    const picks = new Set(top.map((e) => norm(pickOf(e))));
    return picks.size > 1 ? { tie: top } : { event: top[0] };
  }

  /** Tên kỳ ngộ lấy từ dòng tiêu đề "KỲ NGỘ: Ngũ Sắc Linh Chi" của tin nhắn đang hiện. */
  function eventTitle() {
    const msg = liveMsg();
    if (!msg) return '';
    const heads = msg.querySelectorAll('h1, h2, h3, strong, [class*="embedTitle"], [class*="embedAuthor"]');
    for (const el of heads) {
      const line = el.textContent.normalize('NFC').replace(/\s+/g, ' ').trim();
      const m = line.match(/KỲ\s*NGỘ\s*[:：]\s*(.{1,60})$/iu);
      if (m) return m[1].trim();
    }
    return '';
  }

  /**
   * Trả lời kỳ ngộ. Chỉ bấm nút KHỚP với lựa chọn đã chấm, không bao giờ đoán
   * bừa - kỳ ngộ lạ thì ghi vào danh sách cho bạn chọn, lần này để game tự chọn.
   */
  function handleEvent(btns, text) {
    const opts = choiceButtons(btns);
    if (!opts.length) return false;
    const { event, tie } = whichEvent(opts, text);
    if (event) {
      const label = eventLabel(event);
      const want = pickOf(event);
      if (!want) {
        warn('evpick', `⚠ Kỳ ngộ "${label}" chưa chấm lựa chọn — để game tự chọn khi hết giờ. `
          + 'Vào ⚙ → Kỳ ngộ để chọn.');
        return true;
      }
      const b = matchChoice(opts, want);
      if (b && !b.disabled) return act(b, `kỳ ngộ ${label}`), true;
      warn('evdark', `⚠ Kỳ ngộ "${label}": lựa chọn "${want}" đang tối — để game tự chọn.`);
      return true;
    }
    if (tie) {
      warn('evtie', `⚠ ${tie.length} kỳ ngộ có cùng các lựa chọn nhưng chấm khác nhau `
        + `(${tie.map(eventLabel).join(', ')}) — đặt tên cho chúng để bot phân biệt. Lần này để game tự chọn.`);
      return true;
    }
    if (!/kỳ\s*ngộ/i.test(text.normalize('NFC'))) return false;
    learnEvent(opts);
    return true;
  }

  /** Gặp kỳ ngộ lạ: ghi tên + các lựa chọn vào danh sách, chờ bạn chấm. */
  function learnEvent(opts) {
    const e = { name: eventTitle(), choices: opts.map((b) => b.label), pick: -1 };
    eventPool().push(e);
    saveCfg();
    log(`📝 Kỳ ngộ mới ở ${cfg.dgName}: ${eventLabel(e)} — ${e.choices.join(' | ')}. `
      + 'Đã thêm vào ⚙ → Kỳ ngộ: chấm một lựa chọn là lần sau bot tự bấm. Lần này để game tự chọn.', 'warn');
    if ($('#ag-set').style.display === 'block') buildEvents();
  }

  // ---- màn hình một ô đất ----
  function care(btns, backVuon) {
    if (S.plotClicks >= 15) {
      log('⚠ Kẹt ở một ô đất — bỏ qua', 'warn');
      S.plotClicks = 0;
      return leaveGarden(backVuon, 'thoát ô kẹt');
    }
    for (const name of cfg.care) {
      const el = careEl(name);
      if (el && hasEl(el)) continue;                         // việc này để AOE lo, không làm tay từng ô
      const b = findBtn(name, btns);
      if (b && !b.disabled) {
        S.plotClicks++; S.roundWork++;
        const kind = careKind(name);                         // tưới/bón tay xong cũng tính cooldown vườn
        if (kind) {
          const key = gkey(S.curDv, S.curVuon);
          const st = gst(key)[kind];
          st.until = Date.now() + gcfg(key).cd * 1000; st.clicked = true;
          S.walkDone[kind] = true;
        }
        return act(b, 'đang sáng');
      }
    }

    // Hết việc ở ô này. Ghi nhận ô có đang chín không rồi mới đi tiếp.
    const hv = findBtn(cfg.plotHarvest, btns);
    const ripe = !!(hv && !hv.disabled);
    S.plotsHere++; S.plots++; S.plotClicks = 0;
    if (ripe) S.ripeHere++;

    const next = findBtn('Cây Tiếp', btns);
    if (next && !next.disabled) {
      return act(next, `xong ô đất #${S.plots}${ripe ? ' (đã chín)' : ''}`);
    }
    log(`🏁 Cây Tiếp đã tối — hết ô của vườn này (${S.ripeHere}/${S.plotsHere} ô đã chín)`, 'ok');
    leaveGarden(backVuon, 'quay lại vườn');
  }

  function leaveGarden(backVuon, why) {
    S.gardenWalked = true;
    // Đã đi hết ô một lượt: coi như xong phần làm tay của vườn này (tưới/bón cho các
    // linh căn không có AOE). Đánh dấu để khỏi vào lại trong cùng lần chăm; hẹn cooldown
    // để vòng sau chưa tới hạn thì không vào nữa.
    const key = gkey(S.curDv, S.curVuon), now = Date.now();
    for (const [kind, el] of [['fert', 'Thổ'], ['water', 'Thủy']]) {
      if (hasEl(el)) continue;
      S.walkDone[kind] = true;
      const st = gst(key)[kind];
      if (st.until <= now) st.until = now + gcfg(key).cd * 1000;
    }
    act(backVuon, why);
  }

  // ---- AOE tưới / bón: kết quả về sau khi bấm ----
  /**
   * Game trả lời AOE tưới/bón bằng một trong hai kiểu:
   *   - sửa tin nhắn vườn, thêm dòng "Bón phân diện rộng thành công! Đã bón phân cho 15 ô đất"
   *   - tin nhắn riêng "❌ Thất bại: Không có ô đất nào ... hoặc đã hết thời gian cooldown"
   * Bấm xong ta coi như thành công và bắt đầu tính cooldown ngay; "Thất bại" tới thì sửa lại.
   */
  function aoeFailed(text) {
    const t = text.normalize('NFC');
    const now = Date.now();
    const key = gkey(S.curDv, S.curVuon);
    const st = S.gd[key];
    // loại AOE: đọc từ chính câu báo lỗi; không rõ thì lấy cái vừa bấm chưa có kết quả
    let kind = /bón\s*phân/i.test(t) ? 'fert' : /tưới/i.test(t) ? 'water' : null;
    if (!kind && st) kind = ['fert', 'water'].find((k) => st[k].pending) || null;
    // chỉ nhận là của mình nếu vườn này vừa bấm AOE đó trong vòng 30 giây
    const a = kind && st ? st[kind] : null;
    if (!a || !a.at || now - a.at > 30000) {
      log(`✉ Game báo thất bại: ${t.replace(/\s+/g, ' ').trim().slice(0, 100)} — bỏ qua tin nhắn`, 'warn');
      return;
    }
    // thất bại = vườn còn cooldown -> bỏ qua, chờ trọn một cooldown rồi mới bấm lại
    const wait = gcfg(key).cd;
    a.until = now + wait * 1000;
    a.pending = false; a.at = 0;
    log(`⏳ [${S.curVuon}] ${AOE_KIND[kind]} AOE thất bại (còn cooldown) — bỏ qua tin nhắn, `
        + `${fmtCd(wait)} nữa thử lại.`, 'warn');
  }

  /** Không thấy "Thất bại" sau khi bấm -> thành công, cooldown đã tính từ lúc bấm. */
  function settleAoe() {
    for (const st of Object.values(S.gd)) {
      for (const k of ['fert', 'water']) {
        if (st[k].pending && Date.now() >= st[k].at + cfg.stepDelay) st[k].pending = false;
      }
    }
  }

  /** Vườn hết việc: ghi nhận rồi quay ra phân khu. */
  function leaveDone(backPk, why, skipWhy) {
    if (skipWhy) {
      S.skip.add(gkey(S.curDv, S.curVuon));
      log(`🍂 [${S.curVuon}] ${skipWhy} — bỏ vườn này khỏi vòng lặp (↺ Bỏ loại vườn để đi lại).`, 'warn');
    }
    S.doneVuon.add(S.curVuon);
    S.gardenWalked = false;
    return act(backPk, why);
  }

  /**
   * Cả vườn đã chín / trống / chín lẫn trống -> không còn gì để chăm:
   * có Mộc thì hái, có hạt giống thì gieo lại; không thì rời vườn.
   * Trả về true nếu đã xử lý (bấm gì đó hoặc quay ra), false = vườn vẫn còn cây để chăm.
   */
  /**
   * Vừa hái / gieo mà bảng ô đất chưa đổi (hoặc biến mất): game vẽ lại chậm. Nhịp lẻ chờ,
   * nhịp chẵn bấm Làm Mới để đọc lại, tối đa 3 lần làm mới. Trả về true = đang chờ.
   */
  function tableStale(btns, what) {
    if (++S.gWaits > 6) return false;
    if (S.gWaits % 2 === 0) {
      const rf = findBtn(cfg.refreshBtn, btns);
      if (rf && !rf.disabled) { act(rf, `${what} — bảng ô đất chưa cập nhật, làm mới để đọc lại`); return true; }
    }
    S.busyUntil = Date.now() + cfg.uiDelay;
    return true;
  }

  function finishGarden(plots, btns, backPk) {
    const key = gkey(S.curDv, S.curVuon);
    const ripe = plots.filter((p) => p.ripe).length;
    const empty = plots.filter((p) => p.empty).length;
    if (ripe + empty < plots.length) return false;          // còn cây đang lớn -> chăm tiếp

    const label = ripe && empty ? `${ripe} ô chín + ${empty} ô trống` : ripe ? `cả ${ripe} ô đã chín` : `cả ${empty} ô đều trống`;
    if (ripe) {
      if (S.harvested) {                                     // đã bấm hái mà bảng vẫn chín -> làm mới đọc lại
        if (tableStale(btns, 'vừa hái')) return true;
        leaveDone(backPk, 'hái không được', `${label} nhưng bấm thu hoạch rồi vẫn còn chín`);
        return true;
      }
      const hb = findBtn(cfg.aoeHarvest, btns);
      if (hb && !hb.disabled && canUseAoe(hb)) {
        S.harvested = true; S.gWaits = 0; S.roundWork++;
        act(hb, `${label} — thu hoạch cả vườn`);
        return true;
      }
      const why = hb ? (hb.disabled ? 'nút thu hoạch đang tối'
                                    : `linh căn ${cfg.elements.join('/')} không hái được`)
                     : 'không thấy nút thu hoạch AOE';
      leaveDone(backPk, 'không hái được', `${label} nhưng ${why}, để người khác hái`);
      return true;
    }

    // toàn bộ trống
    const { seed } = gcfg(key);
    if (!seed) { leaveDone(backPk, 'vườn trống', `${label}, không cài hạt giống gieo lại`); return true; }
    if (!hasEl('Mộc')) { leaveDone(backPk, 'vườn trống', `${label}, không có linh căn Mộc để gieo`); return true; }
    if (S.sowed) {                                           // đã gieo mà bảng vẫn trống -> làm mới đọc lại
      if (tableStale(btns, 'vừa gieo')) return true;
      leaveDone(backPk, 'gieo không được', `đã bấm gieo "${seed}" mà vườn vẫn trống`);
      return true;
    }
    if (S.sowFail) { leaveDone(backPk, 'không gieo được', `không gieo được "${seed}"`); return true; }
    const sb = findBtn(cfg.aoeSow, btns);
    if (!sb || sb.disabled || !canUseAoe(sb)) {
      leaveDone(backPk, 'không gieo được', `${label} nhưng nút ${cfg.aoeSow} ${sb ? 'đang tối' : 'không thấy'}`);
      return true;
    }
    S.sowing = true; S.gWaits = 0;
    act(sb, `${label} — gieo lại "${seed}"`);
    return true;
  }

  /**
   * Vòng AOE ở màn hình vườn: bắt sâu -> bón phân -> tưới nước. Bắt sâu tối khi hết
   * sâu; bón/tưới không tối nên mỗi vườn chỉ bấm 1 lần rồi tính cooldown. Sau khi
   * tưới, sâu có thể ra lại -> bắt sâu lần nữa (bón/tưới lúc đó còn cooldown, bỏ qua).
   * Trả về true nếu vừa bấm gì đó.
   */
  function aoePhase(btns) {
    if (S.aoeTries >= 12) { warn('aoe', '⚠ Bấm AOE quá nhiều lần một vườn — thôi, đi tiếp.'); return false; }
    const key = gkey(S.curDv, S.curVuon);
    const ok = (b) => b && !b.disabled && canUseAoe(b);

    const bug = findBtn(cfg.aoeBug, btns);
    const bugBright = bug && !bug.disabled;
    if (bugBright && canUseAoe(bug)) {                       // còn sâu + có Kim -> AOE bắt sâu
      S.aoeTries++; S.roundWork++;
      S.aoeDone = {};                                        // bắt sâu lại -> bón/tưới được xét lại
      act(bug, 'AOE bắt sâu cả vườn');
      return true;
    }
    // CÒN SÂU mà không có Kim: nút tưới/bón AOE tuy sáng nhưng bấm không ăn -> phải vào
    // từng ô bắt sâu trước. Nhường cho phần đi từng ô ở inGarden.
    if (bugBright) return false;
    for (const [kind, name] of [['fert', cfg.aoeFert], ['water', cfg.aoeWater]]) {
      if (S.aoeDone[kind] || !hasEl(kind === 'fert' ? 'Thổ' : 'Thủy')) continue;
      const b = findBtn(name, btns);
      if (!ok(b)) continue;                                  // tối / không có
      const st = gst(key)[kind];
      if (st.until > Date.now()) {
        S.aoeDone[kind] = true;
        log(`⏳ [${S.curVuon}] ${AOE_KIND[kind]} AOE còn cooldown ${leftText(st.until)} — bỏ qua.`, 'info');
        continue;
      }
      S.aoeDone[kind] = true; S.aoeTries++; S.roundWork++;
      st.clicked = true;
      st.at = Date.now(); st.pending = true;
      st.until = Date.now() + gcfg(key).cd * 1000;           // coi như thành công; "Thất bại" sẽ sửa lại
      act(b, `AOE ${AOE_KIND[kind]} cả vườn`);
      S.busyUntil += Math.round(cfg.stepDelay * 0.6);        // chờ thêm chút cho tin "Thất bại" kịp về
      return true;
    }
    return false;
  }

  // ---- màn chọn hạt giống (sau khi bấm Gieo Hạt AOE) ----
  function inSeedScreen(btns) {
    const back = findExact('Quay Lại', btns);
    if (!S.sowing) return act(back, S.sowFail ? 'không có hạt giống, quay lại vườn' : 'không định gieo, quay lại vườn');
    const opts = plotOptions();
    if (opts.length) return pickSeed(opts);
    if (S.dropdownTries >= 3) {
      S.dropdownTries = 0; S.sowing = false; S.sowFail = true;
      return act(back, 'không mở được danh sách hạt giống');
    }
    const sel = seedSelect();
    if (!sel) {
      if (++S.selTries <= 5) { warn('seedsel', '⚠ Không thấy ô "Chọn hạt giống" — chờ game vẽ lại.'); return; }
      S.sowing = false; S.sowFail = true;
      return act(back, 'chờ mãi không thấy ô chọn hạt giống — quay lại vườn');
    }
    S.dropdownTries++;
    log('📂 Mở danh sách hạt giống', 'ok');
    click(sel);
    S.busyUntil = Date.now() + cfg.uiDelay;
  }

  /** Chọn đúng hạt giống đã cài cho vườn này; hết hạt thì thôi, bỏ vườn. */
  function pickSeed(opts) {
    const { seed } = gcfg(gkey(S.curDv, S.curVuon));
    const want = norm(seed);
    const o = opts.find((x) => norm(x.label).includes(want));
    const left = o ? (o.label.match(/còn\s*:\s*(\d+)/i) || [])[1] : null;
    S.dropdownTries = 0; S.sowing = false;
    if (!o || left === '0') {
      S.sowFail = true;
      log(o ? `🌾 Hết hạt giống "${seed}" (còn 0) — không gieo, bỏ vườn này.`
            : `🌾 Không có "${seed}" trong túi (đang có: ${opts.map((x) => x.label.slice(0, 40)).join(' | ')}) — bỏ vườn này.`, 'warn');
      return;                                                // lượt sau bấm Quay Lại
    }
    S.sowed = true; S.roundWork++;
    log(`🌱 Chọn hạt giống: ${o.label.slice(0, 60)}${left ? ` (còn ${left})` : ''}`, 'ok');
    click(o.el);
    S.clicks++;
    S.busyUntil = Date.now() + cfg.stepDelay;
  }

  // ---- màn hình vườn ----
  function inGarden(btns, backPk, text) {
    const plots = readPlots(text);

    // (a) đọc được bảng ô đất: cả vườn chín / trống -> hái, gieo lại hoặc rời
    if (plots.length) {
      S.sawTable = true;
      if (finishGarden(plots, btns, backPk)) return;
    } else if (S.sawTable && (S.harvested || S.sowed || S.sowFail)) {
      // vừa hái / gieo mà bảng biến mất: game chưa vẽ lại -> làm mới rồi đọc lại,
      // để hái xong là gieo ngay trong lượt này chứ không đợi vòng sau
      if (tableStale(btns, S.harvested && !S.sowed ? 'vừa hái' : 'vừa gieo')) return;
      if (!S.sowed) return leaveDone(backPk, 'không đọc lại được bảng', 'hái xong nhưng làm mới mấy lần vẫn không đọc được bảng ô đất');
      // gieo rồi mà không đọc được bảng -> cứ chăm như thường
    } else if (S.gardenWalked) {
      // không đọc được bảng -> dựa vào lúc đi từng ô, như bản cũ
      const allRipe = S.plotsHere > 0 && S.ripeHere === S.plotsHere;
      if (allRipe && !S.harvested) {
        const hb = findBtn(cfg.aoeHarvest, btns);
        if (hb && !hb.disabled && canUseAoe(hb)) {
          S.harvested = true; S.roundWork++;
          return act(hb, `cả ${S.plotsHere} ô đều chín — thu hoạch toàn bộ`);
        }
        const why = hb ? (hb.disabled ? 'nút thu hoạch đang tối'
                                      : `linh căn ${cfg.elements.join('/')} không hái được`)
                       : 'không thấy nút thu hoạch AOE';
        return leaveDone(backPk, 'xong vườn này', `cả vườn đã chín nhưng ${why}, để người khác hái`);
      }
    }

    // (b) AOE làm được việc gì thì làm: bắt sâu (có Kim) -> bón -> tưới. Vừa đi từng ô về
    //     mà sâu đã sạch thì đây là chỗ AOE tưới/bón (giờ mới bấm ăn).
    if (aoePhase(btns)) return;

    // (c) còn việc phải vào từng ô làm tay? (thiếu linh căn, hoặc còn sâu mà không có Kim)
    const key = gkey(S.curDv, S.curVuon);
    const why = manualLeft(key, btns);
    if (!why) {
      const done = S.gardenWalked ? 'xong vườn này' : (needWalk() ? 'xong vườn này' : 'xong vườn này (AOE đủ)');
      return leaveDone(backPk, done);
    }
    if (S.pestWalks >= 5) { warn('walk', '⚠ Vào ra vườn quá nhiều lần — thôi, đi vườn khác.'); return leaveDone(backPk, 'vào ra quá nhiều lần'); }
    S.gardenWalked = false;

    // (d) mở danh sách ô đất, vào từng ô làm tay
    const sel = plotSelect();
    if (!sel) {
      // game tải chậm chưa vẽ ô chọn -> Làm Mới rồi tìm lại; vài lần vẫn không có thì bỏ qua vườn lượt này
      if (++S.selTries <= 3) {
        const rf = findBtn(cfg.refreshBtn, btns);
        if (rf && !rf.disabled) return act(rf, `không thấy ô "Chọn một ô đất" — làm mới rồi tìm lại (${S.selTries}/3)`);
        warn('sel', '⚠ Không thấy ô "Chọn một ô đất" lẫn nút Làm Mới — chờ game vẽ lại.');
        return;
      }
      return leaveDone(backPk, 'làm mới 3 lần vẫn không thấy ô chọn ô đất — bỏ qua vườn này lượt này');
    }
    if (S.dropdownTries >= 3) {
      S.dropdownTries = 0;
      S.doneVuon.add(S.curVuon);
      return act(backPk, 'vườn không mở được, bỏ qua');
    }
    S.dropdownTries++; S.pestWalks++;
    if (pestsHere(btns)) S.walkDone = {};   // pass để bắt sâu: cho tưới/bón tay được xét lại
    log(`📂 Mở danh sách ô đất — làm tay: ${why}`, 'ok');
    click(sel);
    S.busyUntil = Date.now() + cfg.uiDelay;
  }

  // ---- màn hình phân khu ----
  function inPhanKhu(btns, backDv) {
    const left = remainingFor(S.curDv).filter((v) => !S.doneVuon.has(v));
    if (left.length) {
      const name = left[0];
      const b = findBtn(name, btns);
      if (!b) { log(`⚠ Không thấy [${name}] — bỏ qua`, 'warn'); S.doneVuon.add(name); return; }
      S.curVuon = name;
      S.plotsHere = 0; S.ripeHere = 0; S.aoeTries = 0;
      S.harvested = false; S.gardenWalked = false;
      S.dropdownTries = 0; S.plotClicks = 0;
      S.aoeDone = {}; S.walkDone = {}; S.pestWalks = 0; S.sowing = false; S.sowed = false; S.sowFail = false; S.gWaits = 0; S.selTries = 0; S.sawTable = false;
      const total = remainingFor(S.curDv).length;
      return act(b, `vườn ${total - left.length + 1}/${total} của ${S.curDv}`);
    }
    S.doneDv.add(S.curDv);
    act(backDv, `xong ${S.curDv}`);
  }

  /** Mốc gần nhất mà một vườn trong phạm vi hết cooldown tưới/bón (0 = không có). */
  function nextCooldown() {
    const now = Date.now();
    let best = 0;
    for (const dv of cfg.duocVien) {
      for (const v of remainingFor(dv)) {
        const st = S.gd[gkey(dv, v)];
        if (!st) continue;
        for (const [kind, el] of [['fert', 'Thổ'], ['water', 'Thủy']]) {
          const u = st[kind].until;
          if (hasEl(el) && u > now && (!best || u < best)) best = u;
        }
      }
    }
    return best;
  }

  // ---- màn hình danh sách dược viên ----
  function inDuocVien(btns) {
    const dvs = activeDv();
    if (!dvs.length) {
      finish(S.skip.size ? 'Mọi vườn còn lại đều chín mà không hái được'
                         : 'Phạm vi chạy đang trống');
      return true;
    }
    if (!dvs.some((d) => findBtn(d, btns))) return false;   // không phải màn hình này

    let left = dvs.filter((d) => !S.doneDv.has(d));
    if (!left.length) {                                     // đi hết -> xong 1 vòng
      S.rounds++; S.doneDv.clear(); S.preludeDone.clear();
      log(`🔁 Xong vòng ${S.rounds} (${S.plots} ô đất` +
          (S.skip.size ? `, ${S.skip.size} vườn đã loại` : '') + ')', 'ok');
      if (cfg.maxRounds > 0 && S.rounds >= cfg.maxRounds) {
        finish(`Đã chăm đủ ${S.rounds} vòng`); return true;
      }
      left = activeDv();
      if (!left.length) { finish('Không còn vườn nào để đi'); return true; }
      // vòng vừa rồi không có việc gì -> nghỉ tới khi có vườn hết cooldown, khỏi bấm vô ích
      if (!S.roundWork) {
        S.idleUntil = nextCooldown() || Date.now() + cfg.idleWait * 1000;
        log(`💤 Vòng ${S.rounds} không có việc gì — nghỉ ${leftText(S.idleUntil)} rồi đi vòng ${S.rounds + 1}.`, 'info');
      }
      S.roundWork = 0;
    }
    if (S.idleUntil > Date.now()) return true;
    S.idleUntil = 0;

    // đầu vòng: nút đầu vòng nào sáng thì bấm, tối thì bỏ qua
    if (S.doneDv.size === 0) {
      for (const name of cfg.prelude) {
        if (S.preludeDone.has(name)) continue;
        S.preludeDone.add(name);
        const b = findBtn(name, btns);
        if (!b) { log(`⛲ Không thấy ${name} — bỏ qua`, 'info'); continue; }
        if (b.disabled) { log(`⛲ ${name} đang tối — bỏ qua`, 'info'); continue; }
        act(b, 'đầu vòng'); return true;
      }
    }

    const name = left[0];
    const b = findBtn(name, btns);
    if (!b) { log(`⚠ Không thấy [${name}] — bỏ qua`, 'warn'); S.doneDv.add(name); return true; }
    S.curDv = name;
    S.doneVuon.clear();
    S.curVuon = ''; S.gardenWalked = false;
    const picked = remainingFor(name);
    log(`🏵 Vào ${name} — ${picked.length} vườn: ${picked.join(', ')}`, 'ok');
    act(b, '');
    return true;
  }

  // ---------------------------------------------------------------- //
  //  Chẩn đoán
  // ---------------------------------------------------------------- //
  function diagnose() {
    const msgs = recentMessages();
    log(`— QUÉT THỬ — thấy ${msgs.length} tin nhắn gần nhất`, 'head');
    const live = liveButtons();
    if (!live.length) {
      log('✗ KHÔNG thấy nút nào. Kéo khung chat xuống dưới cùng rồi thử lại.', 'warn');
    } else {
      log(`Nút của màn hình hiện tại (${live.length}):`, 'head');
      for (const b of live) {
        const isAoe = /aoe/i.test(b.label);
        const tag = isAoe ? (canUseAoe(b) ? '  ⚡dùng được' : '  ✋không hợp linh căn') : '';
        log(`   ${b.disabled ? '🔒 TỐI ' : '✅ SÁNG'}  ${b.label}${tag}`, 'info');
      }
    }
    const extra = allButtons().length - live.length;
    if (extra > 0) log(`(còn ${extra} nút ở tin nhắn cũ phía trên — script bỏ qua)`, 'info');
    const sel = plotSelect();
    log(sel ? `Ô chọn đất: "${sel.textContent.trim().slice(0, 40)}"` : 'Ô chọn đất: không thấy', 'info');
    const opts = plotOptions();
    log(opts.length ? `Danh sách ô đất đang mở: ${opts.map((o) => o.label).join(' | ').slice(0, 120)}`
                    : 'Danh sách ô đất: đang đóng', 'info');
    log(dismissLink() ? 'Có tin nhắn riêng tư đang hiện' : 'Không có tin nhắn riêng tư', 'info');
    if (cfg.mode === 'dungeon') {
      const text = liveText();
      const st = text.match(/ẢI\s*(\d+)/i);
      const plan = currentPlan();
      log(`Chế độ: ĐI BÍ CẢNH — ${cfg.dgName} · ${cfg.dgZone}, ${plan.stages.length} ải, `
          + `${eventPool().length} kỳ ngộ đã biết`, 'head');
      log(`   ải đang hiện: ${st ? st[1] : 'không đọc được'}`
          + (/kỳ\s*ngộ/i.test(text) ? ' · có chữ KỲ NGỘ' : ''), 'info');
      const doors = live.filter((b) => doorName(b));
      if (doors.length) log(`   cửa đang hiện: ${doors.map((d) => d.label).join(', ')}`, 'info');
      if (!live.length) log('   màn hình chưa có nút nào — có thể đang đánh, bot chỉ chờ', 'info');
      const cont = continueBtn(live);
      if (cont) log(`   màn đi tiếp — sẽ bấm ${cont.label}${cont.disabled ? ' (đang tối)' : ''}`, 'info');
      const ch = choiceButtons(live);
      if (ch.length && !doors.length && !findBtn(cfg.dgStart, live) && !findBtn(cfg.dgNext, live)) {
        log(`   có thể là lựa chọn kỳ ngộ: ${ch.map((b) => b.label).join(' | ')}`, 'info');
        const { event, tie } = whichEvent(ch, text);
        if (event) {
          const want = pickOf(event);
          log(`   → nhận ra kỳ ngộ "${eventLabel(event)}"`
              + (want ? `, sẽ bấm: ${want}` : ' — chưa chấm lựa chọn'), want ? 'ok' : 'warn');
        } else if (tie) {
          log(`   → trùng ${tie.length} kỳ ngộ (${tie.map(eventLabel).join(', ')}) — đặt tên để phân biệt`, 'warn');
        } else {
          const t = eventTitle();
          log(`   → kỳ ngộ lạ${t ? ` "${t}"` : ''} — chưa có trong danh sách`, 'warn');
        }
      }
      const team = readTeam(text);
      if (team.members.length) {
        const cost = staminaCost(team);
        log(`   tổ đội ${team.members.length} người · tốn ${cost || '?'} thể lực/lượt`
            + (team.cost ? ` (màn hình ghi ${team.cost})` : ''), 'head');
        for (const m of team.members) {
          const st = m.st ? `${m.st[0]}/${m.st[1]}` : '?';
          const hp = m.hp ? `${Math.floor(hpPct(m))}%` : '?';
          const warnSt = cost && m.st && m.st[0] < cost ? '  ⚠ KHÔNG ĐỦ' : '';
          const warnHp = m.hp && hpPct(m) < cfg.dgHealBelow ? '  ❤ cần hồi' : '';
          log(`   • ${m.name}: máu ${hp}${warnHp} · thể lực ${st}${warnSt}`,
              warnSt || warnHp ? 'warn' : 'info');
        }
      }
      return;
    }
    if (cfg.mode === 'boss') {
      log(`Chế độ: ĐÁNH BOSS — cooldown ${cfg.bossCooldown}s, ` +
          `${cfg.maxAttacks || 'vô hạn'} lượt`, 'head');
      for (const [nhan, ten] of [['Tấn công', cfg.bossAttack], ['Bỏ animation', cfg.bossSkip],
                                 ['Về sảnh', cfg.bossBack], ['Hồi máu', cfg.bossHeal],
                                 ['Làm mới', cfg.refreshBtn]]) {
        const b = findBtn(ten, live);
        log(`   ${nhan}: ${b ? (b.disabled ? '🔒 đang tối' : '✅ đang sáng') : '✗ không thấy'}`,
            b ? 'info' : 'warn');
      }
      return;
    }
    if (cfg.mode === 'water') {
      const w = findBtn(cfg.prelude[0] || 'Múc Nước Giếng', live);
      const rf = findBtn(cfg.refreshBtn, live);
      log(`Chế độ: CHỈ MÚC NƯỚC — chờ ${cfg.waterWait}s, làm mới mỗi ${cfg.waterRetry}s`, 'head');
      log(`   nút múc nước: ${w ? (w.disabled ? '🔒 đang tối (giếng chưa hồi)' : '✅ đang sáng')
                               : '✗ KHÔNG THẤY'}`, w ? 'info' : 'warn');
      log(`   nút ${cfg.refreshBtn}: ${rf ? '✅ có' : '✗ KHÔNG THẤY'}`, rf ? 'info' : 'warn');
      return;
    }
    log(`Linh căn: ${cfg.elements.join(' + ')}` + (needWalk() ? ' — thiếu Kim/Thủy/Thổ nên vẫn vào từng ô đất' : ' — AOE lo hết'), 'head');
    log(`Phạm vi đang đặt: ${scopeSummary()}`, 'head');
    const text = liveText();
    const plots = readPlots(text);
    if (plots.length) {
      const ripe = plots.filter((p) => p.ripe).length, empty = plots.filter((p) => p.empty).length;
      log(`   bảng ô đất: ${plots.length} ô — ${ripe} chín, ${empty} trống, ${plots.length - ripe - empty} đang lớn`
          + (ripe + empty === plots.length ? ' → cả vườn xong: sẽ hái / gieo lại / rời' : ''), 'info');
    } else if (findBtn('Quay Lại Phân Khu', live)) {
      log('   không đọc được bảng "Chi tiết từng ô đất" — bot sẽ vào từng ô như cũ', 'warn');
    }
    if (isSeedScreen(text, live)) log('   đang ở màn chọn hạt giống', 'info');
    const cds = [];
    for (const [k, st] of Object.entries(S.gd)) {
      for (const kind of ['fert', 'water']) {
        if (st[kind].until > Date.now()) cds.push(`${k.split('|')[1]} ${AOE_KIND[kind]} ${leftText(st[kind].until)}`);
      }
    }
    if (cds.length) log(`   đang cooldown: ${cds.join(' · ')}`, 'info');
    if (S.skip.size) log(`Vườn đã loại khỏi vòng lặp: ${[...S.skip].join(' · ')}`, 'warn');
  }

  // ---------------------------------------------------------------- //
  //  Giao diện: bảng màu + kiểu dáng
  //
  //  Mọi luật CSS đều nằm dưới #ag-panel nên không đụng tới giao diện
  //  Discord. Riêng các thuộc tính bố cục (max-height, flex, overflow,
  //  display) vẫn để inline vì code còn bật/tắt chúng lúc chạy.
  // ---------------------------------------------------------------- //
  const CSS = `
#ag-panel,#ag-panel *{box-sizing:border-box}
#ag-panel{
  --bg2:#242c3a; --bg3:#2f394b; --line:rgba(255,255,255,.12);
  --fg:#f0f4fa; --dim:#a3aec4;
  --acc:#4ade80; --acc2:#22c55e; --blue:#60a5fa; --cyan:#38bdf8;
  --warn:#fbbf24; --danger:#f87171;
  font-family:'gg sans','Inter','Segoe UI',system-ui,sans-serif;
  font-size:12.5px;line-height:1.5;color:var(--fg);
  background:linear-gradient(180deg,#212836 0%,#171c26 100%);
  border:1px solid var(--line);border-radius:14px;
  box-shadow:0 22px 55px rgba(0,0,0,.5),0 2px 10px rgba(0,0,0,.35);
}
#ag-panel ::-webkit-scrollbar{width:8px;height:8px}
#ag-panel ::-webkit-scrollbar-thumb{background:#2c333f;border-radius:8px}
#ag-panel ::-webkit-scrollbar-thumb:hover{background:#3b4352}
#ag-panel ::-webkit-scrollbar-track{background:transparent}

/* ---- thanh tiêu đề ---- */
#ag-head{padding:11px 12px;user-select:none;
  background:linear-gradient(180deg,rgba(96,165,250,.10),rgba(255,255,255,.02));
  border-bottom:1px solid var(--line);border-radius:13px 13px 0 0}

/* ---- vùng: mỗi khối một nền riêng cho tách bạch ---- */
#ag-over{padding:12px;display:flex;flex-direction:column;gap:11px}
#ag-set{background:rgba(0,0,0,.22)}
#ag-sethead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;
  padding:11px 0 9px;margin-bottom:3px;
  background:linear-gradient(180deg,#1e2532 72%,rgba(30,37,50,0))}
#ag-sethead b{flex:1;font-size:12px;font-weight:650;letter-spacing:.4px}
#ag-panel .agcard{background:var(--bg2);border:1px solid var(--line);
  border-radius:11px;padding:11px 12px;margin-bottom:9px}
#ag-panel .agcard>.aghd:first-child{margin-top:0}
#ag-logo{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;
  font-size:15px;background:linear-gradient(135deg,#10b981,#3b82f6);
  box-shadow:0 3px 10px rgba(16,185,129,.32)}
#ag-title{font-weight:650;letter-spacing:.2px;line-height:1.15}
#ag-sub{font-size:10px;color:var(--dim);letter-spacing:.4px;text-transform:uppercase}
#ag-dot{width:8px;height:8px;border-radius:50%;background:#4b5563;transition:.25s}
#ag-panel.ag-run #ag-dot{background:var(--acc);animation:agpulse 1.9s infinite}
#ag-panel.ag-pause #ag-dot{background:var(--warn);animation:none}
@keyframes agpulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.55)}
  70%{box-shadow:0 0 0 7px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
#ag-fold{cursor:pointer;color:var(--dim);padding:2px 5px;border-radius:6px;transition:.15s}
#ag-fold:hover{color:var(--fg);background:rgba(255,255,255,.07)}

/* ---- chọn chế độ ---- */
#ag-modes{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;
  background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:11px}
#ag-modes label[data-mode=dungeon].on{color:#1e0a2e;background:linear-gradient(180deg,#d8b4fe,#a78bfa);
  box-shadow:0 2px 10px rgba(167,139,250,.32)}

/* ---- trình soạn ải + kỳ ngộ + thứ tự cửa ---- */
#ag-panel #ag-dgstages{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
#ag-panel .agst{display:flex;align-items:center;gap:6px;padding:4px 4px 4px 10px;
  border:1px solid var(--line);border-radius:9px;background:rgba(255,255,255,.035)}
#ag-panel .agst b{flex:1;font-weight:650;white-space:nowrap}
#ag-panel .agst select{width:auto;flex:none;padding:4px 6px}
#ag-panel .agst.event{background:rgba(167,139,250,.13);border-color:rgba(167,139,250,.35)}
#ag-panel .agstage{border:1px solid var(--line);border-radius:10px;margin-top:8px;overflow:hidden}
#ag-panel .agstage-h{display:flex;align-items:center;gap:8px;padding:7px 10px;
  background:rgba(255,255,255,.045)}
#ag-panel .agstage-h b{flex:1;font-weight:650}
#ag-panel .agstage-h input[type=text]{font-weight:650}
#ag-panel .agstage-h button{flex:none;padding:4px 9px}
#ag-panel .agstage.event .agstage-h{background:rgba(167,139,250,.13)}
#ag-panel .agstage.unset{border-color:rgba(251,191,36,.5)}
#ag-panel .agtag{margin-left:auto;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:650;
  color:var(--warn);background:rgba(251,191,36,.14);border:1px solid rgba(251,191,36,.4)}
#ag-panel .agstage-b{padding:9px 10px;display:flex;flex-direction:column;gap:6px}
#ag-panel .agchoice{display:flex;align-items:center;gap:8px}
#ag-panel .agchoice input[type=radio]{accent-color:#a78bfa;width:16px;height:16px;margin:0;flex:none;cursor:pointer}
#ag-panel .agchoice.on input[type=text]{border-color:rgba(167,139,250,.7);
  background:rgba(167,139,250,.1)}
#ag-panel .agdoor{display:flex;align-items:center;gap:8px;padding:5px 6px 5px 10px;
  border-radius:8px;background:rgba(255,255,255,.035);margin-bottom:4px;transition:.12s}
#ag-panel .agdoor:hover{background:rgba(255,255,255,.07)}
#ag-panel .agdoor b{width:18px;color:var(--cyan);font-size:11px}
#ag-panel .agdoor span{flex:1;font-weight:550}
#ag-panel .agdoor button{padding:2px 9px;border-radius:6px}
#ag-modes label{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
  padding:8px 6px;border-radius:8px;cursor:pointer;color:var(--dim);
  font-weight:600;transition:.16s}
#ag-modes label:hover{color:var(--fg);background:rgba(255,255,255,.05)}
#ag-modes label[data-mode=farm].on{color:#0b1b12;background:linear-gradient(180deg,#4ade80,#22c55e);
  box-shadow:0 2px 10px rgba(74,222,128,.3)}
#ag-modes label[data-mode=water].on{color:#08192b;background:linear-gradient(180deg,#7dd3fc,#38bdf8);
  box-shadow:0 2px 10px rgba(56,189,248,.3)}
#ag-modes label[data-mode=boss].on{color:#2b0a10;background:linear-gradient(180deg,#fca5a5,#f87171);
  box-shadow:0 2px 10px rgba(248,113,113,.3)}
#ag-modes input{display:none}

/* ---- nút ---- */
#ag-panel .agb{display:flex;align-items:center;justify-content:center;gap:6px;
  padding:9px 12px;border:1px solid transparent;border-radius:10px;
  font:inherit;font-weight:600;color:#fff;cursor:pointer;transition:.14s}
#ag-panel .agb:hover{filter:brightness(1.13)}
#ag-panel .agb:active{transform:translateY(1px)}
#ag-panel .agb:disabled{opacity:.38;cursor:default;filter:none;transform:none}
#ag-panel .agb-go{background:linear-gradient(180deg,#4ade80,#16a34a);color:#08210f;
  box-shadow:0 4px 14px rgba(74,222,128,.32)}
#ag-panel .agb-stop{background:linear-gradient(180deg,#fb7185,#e11d48);
  box-shadow:0 4px 14px rgba(244,63,94,.32)}
#ag-panel .agb-hold{background:linear-gradient(180deg,#fcd34d,#f59e0b);color:#2b1a02;
  box-shadow:0 4px 14px rgba(252,211,77,.3)}
#ag-panel .agb-ghost{background:var(--bg2);border-color:var(--line);color:var(--fg)}
#ag-panel .agb-ghost:hover{background:var(--bg3);filter:none}
#ag-panel .agb-ghost.on{background:linear-gradient(180deg,#60a5fa,#3b82f6);
  border-color:transparent;color:#04162e;box-shadow:0 4px 14px rgba(96,165,250,.3)}
#ag-panel .agb-sm{padding:6px 10px;font-size:11.5px;font-weight:550;border-radius:8px}

/* ---- công tắc ---- */
#ag-panel .agsw{position:relative;width:34px;height:19px;flex:none;display:inline-block}
#ag-panel .agsw input{opacity:0;width:100%;height:100%;margin:0;cursor:pointer;position:relative;z-index:1}
#ag-panel .agsw i{position:absolute;inset:0;border-radius:999px;background:#39404e;transition:.18s}
#ag-panel .agsw i:after{content:'';position:absolute;left:2px;top:2px;width:15px;height:15px;
  border-radius:50%;background:#fff;transition:.18s;box-shadow:0 1px 3px rgba(0,0,0,.4)}
#ag-panel .agsw input:checked+i{background:var(--warn)}
#ag-panel .agsw input:checked+i:after{transform:translateX(15px)}
#ag-panel .agrow{display:flex;align-items:center;gap:9px;cursor:pointer}

/* ---- ô số liệu ---- */
#ag-stat{display:flex;flex-wrap:wrap;gap:7px}
#ag-stat .chip{display:flex;flex-direction:column;gap:1px;padding:7px 11px;min-width:62px;
  background:var(--bg2);border:1px solid var(--line);border-radius:10px}
#ag-stat .chip b{font-size:14px;font-weight:700;letter-spacing:.2px}
#ag-stat .chip u{font-size:9px;color:var(--dim);letter-spacing:.7px;
  text-transform:uppercase;text-decoration:none}
#ag-stat .chip.acc{border-color:rgba(74,222,128,.4);background:rgba(74,222,128,.12)}
#ag-stat .chip.acc b{color:var(--acc)}
#ag-stat .chip.blue{border-color:rgba(56,189,248,.4);background:rgba(56,189,248,.12)}
#ag-stat .chip.blue b{color:var(--cyan)}
#ag-stat .chip.warn{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.14)}
#ag-stat .chip.warn b{color:var(--warn)}

/* ---- phần cài đặt ---- */
#ag-panel .aghd{display:flex;align-items:center;gap:9px;margin:15px 0 8px;
  font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--cyan)}
#ag-panel .aghd:after{content:'';flex:1;height:1px;
  background:linear-gradient(90deg,rgba(56,189,248,.35),transparent)}
#ag-panel input[type=text],#ag-panel input[type=number],#ag-panel select{
  width:100%;padding:6px 9px;background:var(--bg2);color:var(--fg);
  border:1px solid var(--line);border-radius:8px;font:inherit;outline:none;transition:.15s}
#ag-panel input[type=number]{width:72px}
#ag-panel input:focus,#ag-panel select:focus{
  border-color:var(--acc2);box-shadow:0 0 0 3px rgba(16,185,129,.15)}
#ag-panel .aggrid{display:grid;grid-template-columns:96px 1fr;gap:6px;align-items:center}
#ag-panel .aggrid .agnr{display:contents}
#ag-panel .agnum{display:flex;flex-direction:column;gap:3px}
#ag-panel .agnum span{font-size:10.5px;color:var(--dim)}
#ag-panel .agnote{font-size:11px;color:var(--dim);margin-top:5px}

/* ---- bảng tích chọn vườn ---- */
#ag-scope table{width:100%;border-collapse:separate;border-spacing:0 3px}
#ag-scope th{padding:0 4px 5px;font-size:9.5px;font-weight:650;letter-spacing:.6px;
  text-transform:uppercase;color:var(--dim);text-align:center}
#ag-scope td{padding:7px 4px;background:var(--bg2);text-align:center;transition:.13s}
#ag-scope tr td:first-child{text-align:left;padding-left:10px;font-weight:550;
  border-radius:8px 0 0 8px}
#ag-scope tr td:last-child{border-radius:0 8px 8px 0}
#ag-scope tbody tr:hover td{background:var(--bg3)}
#ag-panel .agels{display:flex;flex-wrap:wrap;gap:6px}
#ag-panel .agel{display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;
  border:1px solid var(--line);background:var(--bg2);cursor:pointer;font-weight:600;transition:.14s}
#ag-panel .agel input{display:none}
#ag-panel .agel:hover{background:var(--bg3)}
#ag-panel .agel.on{color:#08210f;background:linear-gradient(180deg,#4ade80,#22c55e);border-color:transparent}
#ag-gardens table{width:100%;border-collapse:separate;border-spacing:0 3px}
#ag-gardens th{padding:0 4px 4px;font-size:9.5px;font-weight:650;letter-spacing:.6px;
  text-transform:uppercase;color:var(--dim);text-align:left}
#ag-gardens td{padding:4px 4px;background:var(--bg2)}
#ag-gardens tr td:first-child{border-radius:8px 0 0 8px;padding-left:9px;font-weight:550;white-space:nowrap;font-size:11.5px}
#ag-gardens tr td:last-child{border-radius:0 8px 8px 0;padding-right:6px}
#ag-gardens tr.off td{opacity:.42}
#ag-gardens input[type=text]{padding:4px 7px;font-size:11.5px}
#ag-panel #ag-gardens input.ag-gcd{width:58px}
#ag-gardens td:nth-child(2){width:1%}
#ag-panel #ag-gardens input.ag-gseed{width:100%;min-width:120px}
#ag-panel .agcb{appearance:none;-webkit-appearance:none;position:relative;margin:0;
  width:17px;height:17px;border:1.5px solid #4d5665;border-radius:5px;
  background:transparent;cursor:pointer;transition:.14s;vertical-align:middle}
#ag-panel .agcb:hover{border-color:var(--acc)}
#ag-panel .agcb:checked{background:var(--acc2);border-color:var(--acc2)}
#ag-panel .agcb:checked:after{content:'';position:absolute;left:5px;top:1.5px;
  width:4px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}

/* ---- nhật ký ---- */
#ag-log{background:#0d1117;border-radius:0 0 13px 13px;
  font:11px/1.62 ui-monospace,'JetBrains Mono',Consolas,monospace}
#ag-log div{padding:2px 0 2px 9px;margin:1px 0;border-left:3px solid transparent;
  border-radius:0 5px 5px 0;white-space:pre-wrap;word-break:break-word}
#ag-log .t{color:#5b6678;margin-right:7px}
#ag-log .l-ok{color:#6ee7a0;border-left-color:#22c55e;background:rgba(74,222,128,.07)}
#ag-log .l-warn{color:#fcd34d;border-left-color:#f59e0b;background:rgba(251,191,36,.1)}
#ag-log .l-head{color:#93c5fd;border-left-color:#3b82f6;background:rgba(96,165,250,.09);
  font-weight:600}
#ag-log .l-info{color:#a3aec4;border-left-color:rgba(163,174,196,.25)}
`;
  if (!document.getElementById('ag-style')) {
    const st = document.createElement('style');
    st.id = 'ag-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------------------------------------------------------------- //
  //  Bảng điều khiển
  // ---------------------------------------------------------------- //
  const panel = document.createElement('div');
  panel.id = 'ag-panel';
  // max-height + cuộn bên trong: bảng có cao mấy cũng không tràn ra ngoài
  // màn hình, thanh tiêu đề luôn thấy được để còn kéo.
  panel.style.cssText = `position:fixed;right:16px;bottom:16px;width:400px;z-index:2147483000;
    max-height:calc(100vh - 24px);display:flex;flex-direction:column;overflow:hidden`;
  panel.innerHTML = `
    <div id="ag-head" style="display:flex;align-items:center;gap:10px;cursor:move;flex:none"
      title="Kéo để di chuyển · bấm đúp để đưa về góc dưới phải">
      <div id="ag-logo">🌿</div>
      <div style="flex:1;min-width:0">
        <div id="ag-title">AutoGame</div>
        <div id="ag-sub">Chăm cây · Dược Viên</div>
      </div>
      <div id="ag-dot" title="Trạng thái"></div>
      <div id="ag-fold" title="Thu gọn">▾</div>
    </div>

    <div id="ag-body" style="display:flex;flex-direction:column;min-height:0;flex:1 1 auto">
      <div id="ag-over">
        <div id="ag-modes">
          <label data-mode="farm"><input type="radio" name="ag-mode" value="farm">🌿 Chăm cây</label>
          <label data-mode="water"><input type="radio" name="ag-mode" value="water">💧 Múc nước</label>
          <label data-mode="boss"><input type="radio" name="ag-mode" value="boss">⚔ Đánh boss</label>
          <label data-mode="dungeon"><input type="radio" name="ag-mode" value="dungeon">🗺 Bí cảnh</label>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
          <button id="ag-run"   class="agb agb-go">▶ Chạy</button>
          <button id="ag-pause" class="agb agb-hold">⏸ Tạm dừng</button>
          <button id="ag-diag"  class="agb agb-ghost">🔍 Quét thử</button>
          <button id="ag-cog"   class="agb agb-ghost">⚙ Cài đặt</button>
        </div>

        <label class="agrow">
          <span class="agsw"><input type="checkbox" id="ag-dry"><i></i></span>
          <span style="flex:1">Chế độ thử — chỉ ghi log, <b>không bấm</b></span>
        </label>

        <div id="ag-stat"></div>
      </div>

      <div id="ag-set" style="display:none;flex:0 1 auto;overflow-y:auto;max-height:62vh;
        padding:0 12px 12px;border-top:1px solid var(--line)">
        <div id="ag-sethead">
          <b>⚙ CÀI ĐẶT</b>
          <button id="ag-close" class="agb agb-ghost agb-sm">✕ Xong</button>
        </div>

        <div id="ag-dgbox" style="display:none">
          <div class="agcard">
            <div class="aghd">Bí cảnh đang đi</div>
            <div style="display:flex;gap:8px">
              <select id="ag-dgname"></select>
              <select id="ag-dgzone" style="width:112px;flex:none"></select>
            </div>
            <div class="agnote" id="ag-dgrealm"></div>
            <label class="agrow" style="margin-top:9px">
              <span class="agsw"><input type="checkbox" id="ag-dgauto"><i></i></span>
              <span style="flex:1">Tự nhận bí cảnh từ tên tổ đội</span>
            </label>
          </div>

          <div class="agcard">
            <div class="aghd">Các ải</div>
            <div style="display:flex;align-items:center;gap:10px">
              <span>Số ải</span>
              <input id="ag-dgcount" type="number" min="0" max="30">
              <span class="agnote" style="margin:0" id="ag-dgsum"></span>
            </div>
            <div id="ag-dgstages"></div>
            <div class="agnote">Để theo dõi đang ở ải mấy. Bot tự nhận ra màn hình chiến đấu
              (bấm KHAI CHIẾN) hay kỳ ngộ.</div>
          </div>

          <div class="agcard">
            <div class="aghd">Kỳ ngộ</div>
            <div class="agnote" id="ag-evsum" style="margin-top:0"></div>
            <div id="ag-events"></div>
            <div style="display:flex;gap:8px;margin-top:9px">
              <button id="ag-evadd" class="agb agb-ghost agb-sm">＋ Thêm kỳ ngộ</button>
              <button id="ag-evgrab" class="agb agb-ghost agb-sm">📥 Lấy kỳ ngộ đang hiện</button>
            </div>
            <div class="agnote">Kỳ ngộ ra ngẫu nhiên ở ải nào cũng được — bot nhận ra theo tên và
              các lựa chọn đang hiện, rồi bấm lựa chọn có <b>chấm tím</b>. Gặp kỳ ngộ lạ, bot tự thêm
              vào đây và để game tự chọn; bạn chỉ cần chấm lựa chọn cho lần sau.</div>
          </div>

          <div class="agcard">
            <div class="aghd">Cửa ải đầu · nếu bí cảnh hỏi</div>
            <div style="display:flex;gap:8px">
              <input id="ag-gatedoor" type="text" list="ag-gatelist" placeholder="Tên cửa, vd: Ải Cầu Trần">
              <datalist id="ag-gatelist"></datalist>
              <select id="ag-gateact" style="width:190px;flex:none">
                <option value="fight">⚔ Khiêu chiến thủ quan</option>
                <option value="give">🎁 Giao nộp linh quả</option>
              </select>
            </div>
            <div class="agnote" id="ag-gatenote"></div>
          </div>

          <div class="agcard">
            <div class="aghd">Thứ tự cửa · Bát Môn</div>
            <div id="ag-doors"></div>
            <button id="ag-doorreset" class="agb agb-ghost agb-sm" style="margin-top:4px">↺ Thứ tự mặc định</button>
            <div class="agnote">Ải có nhiều cửa thì bot chọn cửa đứng cao nhất.</div>
          </div>

          <div class="agcard">
            <div class="aghd">Thể lực & sinh mệnh</div>
            <label class="agrow">
              <span class="agsw"><input type="checkbox" id="ag-dgstam"><i></i></span>
              <span style="flex:1">Dừng khi có thành viên <b>không đủ thể lực</b></span>
            </label>
            <div style="display:flex;align-items:center;gap:10px;margin:8px 0 0 43px">
              <span>Thể lực mỗi lượt</span>
              <input id="ag-dgcost" type="number" min="0" step="1">
            </div>
            <div class="agnote" id="ag-dgcostnote" style="margin-left:43px"></div>

            <label class="agrow" style="margin-top:12px">
              <span class="agsw"><input type="checkbox" id="ag-dgheal"><i></i></span>
              <span style="flex:1">Tự bấm <b>Hồi Toàn Đội</b> khi máu thấp</span>
            </label>
            <div style="display:flex;align-items:center;gap:10px;margin:8px 0 0 43px">
              <span>Hồi khi máu dưới</span>
              <input id="ag-dghealpct" type="number" min="1" max="99" step="5">
              <span>%</span>
            </div>
            <div class="agnote" style="margin-left:43px">Chỉ cần <b>một</b> thành viên dưới mức này là
              bấm hồi. Mỗi lần về sảnh hồi tối đa 1 lần.</div>
          </div>

          <div class="agcard">
            <div class="aghd">Giới hạn</div>
            <label class="agnum"><span>Số lượt bí cảnh rồi dừng (0 = ∞)</span>
              <input id="ag-dgmax" type="number" min="0"></label>
            <div class="agnote">Mỗi lần thấy nút "Chiến Tiếp" tính là xong 1 lượt.</div>
          </div>
        </div>

        <div id="ag-bossbox" class="agcard" style="display:none">
          <div class="aghd">Đánh boss</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px">
            <label class="agnum"><span>Cooldown sau hồi máu (giây)</span>
              <input id="ag-bcd" type="number" min="1" step="5"></label>
            <label class="agnum"><span>Thử lại khi nút tối (giây)</span>
              <input id="ag-bretry" type="number" min="2" step="1"></label>
            <label class="agnum" style="grid-column:1/3"><span>Số lượt đánh rồi dừng (0 = ∞)</span>
              <input id="ag-batk" type="number" min="0"></label>
          </div>
          <div class="aggrid" style="margin-top:10px">
            <span>Tấn công</span><input id="ag-bname-atk" type="text">
            <span>Bỏ animation</span><input id="ag-bname-skip" type="text">
            <span>Về sảnh</span><input id="ag-bname-back" type="text">
            <span>Hồi máu</span><input id="ag-bname-heal" type="text">
          </div>
          <div class="agnote">Bot không bao giờ bấm "Rời Sành" hay "Sành Boss".</div>
        </div>

        <div id="ag-waterbox" class="agcard" style="display:none">
          <div class="aghd">Chỉ múc nước</div>
          <div style="display:flex;gap:14px">
            <label class="agnum"><span>Chờ sau khi múc (giây)</span>
              <input id="ag-wwait" type="number" min="10" step="5"></label>
            <label class="agnum"><span>Nhịp làm mới (giây)</span>
              <input id="ag-wretry" type="number" min="3" step="1"></label>
          </div>
          <div class="agnote">615 giây = 10 phút 15 giây.</div>
        </div>

        <div id="ag-scopebox" class="agcard">
          <div class="aghd">Phạm vi chạy</div>
          <div id="ag-scope"></div>
          <div style="display:flex;gap:7px;align-items:center;margin-top:9px">
            <button id="ag-all"  class="agb agb-ghost agb-sm">Tích tất cả</button>
            <button id="ag-none" class="agb agb-ghost agb-sm">Bỏ tích</button>
            <span id="ag-sum" style="color:var(--acc);font-weight:600"></span>
          </div>
          <div class="agnote">Bỏ tích cả hàng = bỏ qua hẳn dược viên đó.</div>
        </div>

        <div id="ag-elbox" class="agcard">
          <div class="aghd">Linh căn đang có · khả năng AOE</div>
          <div id="ag-els" class="agels"></div>
          <div class="agnote" id="ag-elnote"></div>
        </div>

        <div id="ag-gdbox" class="agcard">
          <div class="aghd">Từng vườn · cooldown & hạt giống</div>
          <div id="ag-gardens"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;margin-top:10px">
            <label class="agnum"><span>Cooldown mặc định</span>
              <input id="ag-gcd" type="text" placeholder="4:00" style="width:100%"></label>
            <label class="agnum"><span>Vòng không việc, nghỉ (giây)</span>
              <input id="ag-gidle" type="number" min="5" step="5" style="width:100%"></label>
          </div>
          <div class="agnote">Tưới / bón AOE bấm xong là tính cooldown của vườn đó; game báo "Thất bại"
            thì chờ hết cooldown rồi bấm lại, vẫn thất bại thì cứ 30 giây thử lại. Cả vườn chín hoặc
            trống: có Mộc thì hái rồi gieo lại đúng hạt giống đã ghi; để trống ô hạt giống = hái xong
            rời vườn. Hết hạt giống thì bỏ vườn đó.</div>
        </div>

        <div class="agcard" id="ag-namebox">
          <div class="aghd">Tên nút · sửa nếu game đổi chữ</div>
          <div class="aggrid">
            <div class="agnr" data-modes="farm water"><span>Múc nước</span><input id="ag-prelude" type="text"></div>
            <div class="agnr" data-modes="farm water boss dungeon"><span>Làm mới</span><input id="ag-refresh" type="text"></div>
            <div class="agnr" data-modes="farm"><span>AOE bắt sâu</span><input id="ag-aoebug" type="text"></div>
            <div class="agnr" data-modes="farm"><span>AOE bón phân</span><input id="ag-aoefert" type="text"></div>
            <div class="agnr" data-modes="farm"><span>AOE tưới nước</span><input id="ag-aoewater" type="text"></div>
            <div class="agnr" data-modes="farm"><span>AOE thu hoạch</span><input id="ag-aoehv" type="text"></div>
            <div class="agnr" data-modes="farm"><span>AOE gieo hạt</span><input id="ag-aoesow" type="text"></div>
            <div class="agnr" data-modes="farm"><span>Chăm từng cây</span><input id="ag-care" type="text"></div>
            <div class="agnr" data-modes="farm"><span>Dược viên</span><input id="ag-dv" type="text"></div>
            <div class="agnr" data-modes="farm"><span>Vườn</span><input id="ag-vuon" type="text"></div>
          </div>
        </div>

        <div class="agcard">
          <div class="aghd">Thời gian</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px">
            <label class="agnum"><span>Nghỉ sau bấm (ms)</span>
              <input id="ag-delay" type="number" min="300" step="250"></label>
            <label class="agnum"><span>Nghỉ thao tác (ms)</span>
              <input id="ag-ui" type="number" min="100" step="100"></label>
            <label class="agnum"><span>Quét mỗi (ms)</span>
              <input id="ag-tick" type="number" min="300" step="100"></label>
            <label class="agnum agnr" data-modes="farm"><span>Số vòng (0 = ∞)</span>
              <input id="ag-rounds" type="number" min="0"></label>
          </div>
          <label class="agrow" style="margin-top:10px">
            <span class="agsw"><input type="checkbox" id="ag-resume"><i></i></span>
            <span style="flex:1">Trang tải lại khi đang chạy → <b>tự chạy tiếp</b></span>
          </label>
          <div class="agnote">Chrome hay "ngủ" tab Discord để tiết kiệm RAM rồi bắt tải lại trang. Bật cái này
            thì bot tự bấm Chạy lại sau khi trang lên. Muốn Chrome đừng ngủ tab: chrome://settings/performance →
            thêm discord.com vào "Luôn giữ các trang này hoạt động".</div>
        </div>

        <div style="display:flex;gap:7px">
          <button id="ag-save"   class="agb agb-go agb-sm" style="flex:1">💾 Lưu cài đặt</button>
          <button id="ag-unskip" class="agb agb-ghost agb-sm agnr" data-modes="farm">↺ Bỏ loại vườn</button>
          <button id="ag-reset"  class="agb agb-ghost agb-sm">↺ Mặc định</button>
        </div>
      </div>

      <div id="ag-log" style="flex:1 1 auto;min-height:96px;max-height:180px;overflow:auto;
        padding:8px 10px;border-top:1px solid var(--line)"></div>
    </div>`;

  (function mount() {
    if (document.body) document.body.appendChild(panel);
    else setTimeout(mount, 200);
  })();

  const $ = (id) => panel.querySelector(id);
  const logBox = $('#ag-log');
  const lastWarn = {};

  function log(msg, lvl = 'info') {
    const d = document.createElement('div');
    d.className = 'l-' + lvl;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = new Date().toLocaleTimeString();
    d.appendChild(t);
    d.appendChild(document.createTextNode(msg));
    logBox.appendChild(d);
    while (logBox.childNodes.length > 400) logBox.removeChild(logBox.firstChild);
    logBox.scrollTop = logBox.scrollHeight;
  }

  /** Cảnh báo lặp lại thì chỉ ghi 10 giây một lần cho đỡ ngập log. */
  function warn(key, msg) {
    const now = Date.now();
    if (now - (lastWarn[key] || 0) < 10000) return;
    lastWarn[key] = now;
    log(msg, 'warn');
  }

  /** Một ô số liệu nhỏ: giá trị lớn ở trên, nhãn nhỏ ở dưới. */
  function chip(value, label, cls) {
    return `<div class="chip${cls ? ' ' + cls : ''}"><b>${value}</b><u>${label}</u></div>`;
  }

  function paint() {
    const run = $('#ag-run');
    run.textContent = S.running ? '⏹ Dừng' : '▶ Chạy';
    run.className = 'agb ' + (S.running ? 'agb-stop' : 'agb-go');

    const p = $('#ag-pause');
    p.textContent = S.paused ? '▶ Tiếp tục' : '⏸ Tạm dừng';
    p.className = 'agb ' + (S.paused ? 'agb-go' : 'agb-hold');
    p.disabled = !S.running;

    panel.classList.toggle('ag-run', S.running && !S.paused);
    panel.classList.toggle('ag-pause', S.running && S.paused);

    let chips;
    if (cfg.mode === 'water') {
      const left = S.running && S.waterUntil > Date.now() ? leftText(S.waterUntil) : '—';
      chips = chip(S.waters, 'đã múc', 'blue')
            + chip(left, S.wphase === 'retry' ? 'chờ giếng hồi' : 'tới lần múc sau')
            + chip(S.clicks, 'lượt bấm');
    } else if (cfg.mode === 'dungeon') {
      const plan = currentPlan();
      chips = chip(S.dgRuns + (cfg.dgMax ? '/' + cfg.dgMax : ''), 'lượt xong', 'acc')
            + chip(S.dgStage ? `${S.dgStage}/${plan.stages.length || '?'}` : '—', 'ải hiện tại')
            + chip(S.clicks, 'lượt bấm');
      const team = S.dgTeam;
      if (team && team.members.length) {
        const sts = team.members.filter((m) => m.st).map((m) => m.st[0]);
        const cost = staminaCost(team);
        if (sts.length) {
          const lo = Math.min(...sts);
          chips += chip(lo + (cost ? ` · ${Math.floor(lo / cost)} lượt` : ''), 'thể lực thấp nhất',
                        cost && lo < cost * 2 ? 'warn' : 'blue');
        }
        const hps = team.members.filter((m) => m.hp).map(hpPct);
        if (hps.length) {
          const lo = Math.floor(Math.min(...hps));
          chips += chip(lo + '%', 'máu thấp nhất', lo < cfg.dgHealBelow ? 'warn' : '');
        }
      }
      chips += chip(cfg.dgZone, cfg.dgName.replace(/\s+/g, ' '));
    } else if (cfg.mode === 'boss') {
      const left = S.running && S.bossUntil > Date.now() ? leftText(S.bossUntil) : '—';
      const PHASE = { attack: 'sắp đánh', heal: 'chuẩn bị hồi máu', cool: 'chờ cooldown' };
      chips = chip(S.attacks + (cfg.maxAttacks ? '/' + cfg.maxAttacks : ''), 'lượt đánh', 'acc')
            + chip(left, PHASE[S.bphase] || 'chờ')
            + chip(S.clicks, 'lượt bấm');
    } else {
      chips = chip(S.rounds + (cfg.maxRounds ? '/' + cfg.maxRounds : ''), 'vòng', 'acc')
            + chip(S.plots, 'ô đất')
            + chip(S.clicks, 'lượt bấm')
            + (S.running && S.idleUntil > Date.now() ? chip(leftText(S.idleUntil), 'nghỉ tới vòng sau', 'blue') : '')
            + (S.skip.size ? chip(S.skip.size, 'vườn đã loại', 'warn') : '');
    }
    if (S.paused) chips += chip('⏸', 'ĐANG TẠM DỪNG', 'warn');
    if (cfg.dryRun) chips += chip('🧪', 'chế độ thử', 'warn');
    if (!S.running && S.stopReason) chips += chip('⏹', S.stopReason);
    $('#ag-stat').innerHTML = chips;
  }

  // ---- bảng tích chọn vườn ----
  function buildScope() {
    const box = $('#ag-scope');
    box.innerHTML = '';
    const t = document.createElement('table');

    const thead = t.createTHead().insertRow();
    thead.appendChild(document.createElement('th'));
    for (const v of cfg.vuon) {
      const th = document.createElement('th');
      th.textContent = v.replace(/^Vườn\s+/i, '');
      thead.appendChild(th);
    }

    const body = t.createTBody();
    for (const dv of cfg.duocVien) {
      const r = body.insertRow();
      r.insertCell().textContent = dv.replace(/^Dược Viên\s+/i, 'DV ');
      for (const v of cfg.vuon) {
        const c = r.insertCell();
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'agcb';
        cb.checked = inScope(dv, v);
        cb.onchange = applyScope;
        cb.dataset.dv = dv; cb.dataset.v = v;
        c.appendChild(cb);
      }
    }
    box.appendChild(t);
    $('#ag-sum').textContent = 'Sẽ đi: ' + scopeSummary();
  }

  function applyScope() {
    const rows = {};
    for (const dv of cfg.duocVien) rows[dv] = [];
    for (const cb of $('#ag-scope').querySelectorAll('input[type=checkbox]')) {
      if (cb.checked) rows[cb.dataset.dv].push(cb.dataset.v);
    }
    cfg.scope = rows;
    saveCfg();
    $('#ag-sum').textContent = 'Sẽ đi: ' + scopeSummary();
    saveGardens(); buildGardens();                 // giữ chữ đang gõ, mờ hàng vừa bỏ tích
  }

  function setAllScope(on) {
    for (const cb of $('#ag-scope').querySelectorAll('input[type=checkbox]')) cb.checked = on;
    applyScope();
    log(on ? 'Đã tích tất cả vườn.' : 'Đã bỏ tích tất cả — nhớ tích lại trước khi chạy.',
        on ? 'ok' : 'warn');
  }

  // ---- linh căn: tích những cái đang có ----
  function buildElements() {
    $('#ag-els').innerHTML = ELEMENTS.map((e) => `
      <label class="agel${hasEl(e) ? ' on' : ''}">
        <input type="checkbox" value="${esc(e)}"${hasEl(e) ? ' checked' : ''}>${esc(e)}</label>`).join('');
    for (const cb of $('#ag-els').querySelectorAll('input')) {
      cb.onchange = () => {
        const picked = [...$('#ag-els').querySelectorAll('input')].filter((x) => x.checked).map((x) => x.value);
        if (!picked.length) { cb.checked = true; log('⚠ Phải giữ ít nhất một linh căn.', 'warn'); return; }
        cfg.elements = picked; saveCfg(); buildElements();
      };
    }
    paintElementNote();
  }

  function paintElementNote() {
    const miss = ['Kim', 'Thủy', 'Thổ'].filter((e) => !hasEl(e));
    $('#ag-elnote').textContent = `Chỉ bấm nút AOE ghi (${cfg.elements.join(') / (')}). `
      + (miss.length ? `Thiếu ${miss.join(', ')} nên sau AOE bot vẫn vào từng ô đất làm tay.`
                     : 'Đủ Kim + Thủy + Thổ: AOE lo hết, không cần vào từng ô.')
      + (hasEl('Mộc') ? ' Có Mộc: cả vườn chín thì hái và gieo lại.' : ' Không có Mộc: cả vườn chín thì rời vườn.');
  }

  // ---- bảng cooldown + hạt giống từng vườn ----
  function buildGardens() {
    const rows = [];
    for (const dv of cfg.duocVien) {
      for (const v of cfg.vuon) {
        const key = gkey(dv, v);
        const g = cfg.gardens[key] || {};
        const on = inScope(dv, v);
        rows.push(`<tr class="${on ? '' : 'off'}">
          <td>${esc(dv.replace(/^Dược Viên\s+/i, ''))} · ${esc(v.replace(/^Vườn\s+/i, ''))}</td>
          <td><input type="text" class="ag-gcd" data-k="${esc(key)}" value="${+g.cd > 0 ? fmtCd(+g.cd) : ''}"
                placeholder="${fmtCd(cfg.gardenCd)}" title="Cooldown tưới / bón AOE của vườn này"></td>
          <td><input type="text" class="ag-gseed" data-k="${esc(key)}" value="${esc(g.seed || '')}"
                placeholder="— hái xong rời vườn —" title="Hạt giống gieo lại sau khi hái (cần Mộc)"></td>
        </tr>`);
      }
    }
    $('#ag-gardens').innerHTML = `<table><thead><tr><th>Vườn</th><th>Cooldown</th><th>Hạt giống gieo lại (cần Mộc)</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>`;
    $('#ag-gcd').value = fmtCd(cfg.gardenCd);
    $('#ag-gidle').value = cfg.idleWait;
  }

  function saveGardens() {
    const out = {};
    for (const inp of $('#ag-gardens').querySelectorAll('.ag-gcd')) {
      const cd = parseCd(inp.value);
      if (cd > 0) out[inp.dataset.k] = Object.assign(out[inp.dataset.k] || {}, { cd });
    }
    for (const inp of $('#ag-gardens').querySelectorAll('.ag-gseed')) {
      const seed = inp.value.trim();
      if (seed) out[inp.dataset.k] = Object.assign(out[inp.dataset.k] || {}, { seed });
    }
    cfg.gardens = out;
    cfg.gardenCd = parseCd($('#ag-gcd').value) || DEFAULTS.gardenCd;
    cfg.idleWait = Math.max(5, +$('#ag-gidle').value || DEFAULTS.idleWait);
  }

  // ---------------------------------------------------------------- //
  //  Cài đặt bí cảnh: chọn bí cảnh, soạn từng ải, xếp thứ tự cửa
  // ---------------------------------------------------------------- //
  const esc = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function buildDungeon() {
    const nameSel = $('#ag-dgname');
    nameSel.innerHTML = DUNGEONS.map(([n, r]) =>
      `<option value="${esc(n)}"${n === cfg.dgName ? ' selected' : ''}>${esc(n)} · ${esc(r)}</option>`).join('');
    const zs = zonesOf(cfg.dgName);
    if (!zs.includes(cfg.dgZone)) { cfg.dgZone = zs[0]; saveCfg(); }
    $('#ag-dgzone').innerHTML = zs.map((z) =>
      `<option${z === cfg.dgZone ? ' selected' : ''}>${esc(z)}</option>`).join('');
    buildGate();
    const realm = (DUNGEONS.find(([n]) => n === cfg.dgName) || [])[1];
    $('#ag-dgrealm').textContent = realm ? `Cảnh giới yêu cầu: ${realm}` : '';
    $('#ag-dgauto').checked = !!cfg.dgAuto;
    $('#ag-dgmax').value = cfg.dgMax;
    $('#ag-dgstam').checked = !!cfg.dgStamStop;
    $('#ag-dgheal').checked = !!cfg.dgHeal;
    $('#ag-dghealpct').value = cfg.dgHealBelow;
    $('#ag-dgcost').value = +currentPlan().stamina || 0;
    paintCostNote();
    buildStages();
    buildEvents();
    buildDoors();
  }

  /** Thẻ "Cửa ải đầu": cửa nào + khiêu chiến hay giao nộp, riêng từng bí cảnh + khu vực. */
  function buildGate() {
    const plan = currentPlan();
    const g = plan.gate || {};
    $('#ag-gatedoor').value = g.door || '';
    $('#ag-gateact').value = g.action === 'give' ? 'give' : 'fight';
    const doors = plan.gateDoors || [];
    $('#ag-gatelist').innerHTML = doors.map((d) => `<option value="${esc(d)}">`).join('');
    $('#ag-gatenote').textContent = doors.length
      ? `Cửa bot đã thấy ở ${cfg.dgName} · ${cfg.dgZone}: ${doors.join(', ')}.`
      : `Bí cảnh nào sau Bắt Đầu hỏi chọn cửa ải (như Vạn Hồn Cốc · Trung Tâm) thì cài ở đây. `
        + 'Gặp lần đầu bot tự ghi danh sách cửa vào ô này và chờ bạn chọn.';
  }

  function paintCostNote() {
    const set = +currentPlan().stamina || 0;
    const seen = S.dgTeam && S.dgTeam.cost;
    $('#ag-dgcostnote').textContent = set > 0
      ? `Riêng ${cfg.dgName} · ${cfg.dgZone}: ${set} thể lực mỗi lượt.`
      : `0 = tự đọc dòng "Tiêu hao khi bắt đầu" ở sảnh`
        + (seen ? ` (lần gần nhất đọc được: ${seen}).` : '.');
  }

  function buildStages() {
    const plan = currentPlan();
    const n = plan.stages.length;
    const ev = plan.stages.filter((s) => s.type === 'event').length;
    $('#ag-dgcount').value = n;
    $('#ag-dgsum').textContent = n ? `${n - ev} chiến đấu · ${ev} kỳ ngộ` : 'chưa có ải nào';

    $('#ag-dgstages').innerHTML = plan.stages.map((s, i) => `
      <div class="agst${s.type === 'event' ? ' event' : ''}"><b>Ải ${i + 1}</b>
        <select class="ag-stype" data-i="${i}">
          <option value="battle"${s.type === 'battle' ? ' selected' : ''}>⚔ Chiến đấu</option>
          <option value="event"${s.type === 'event' ? ' selected' : ''}>✨ Kỳ ngộ</option>
        </select></div>`).join('');
  }

  /** Danh sách kỳ ngộ của bí cảnh đang chọn: tên, các lựa chọn, chấm tím = lựa chọn sẽ bấm. */
  function buildEvents() {
    const pool = eventPool();
    const unset = pool.filter((e) => !pickOf(e)).length;
    $('#ag-evsum').innerHTML = `<b>${esc(cfg.dgName)}</b> · dùng chung cả ${zonesOf(cfg.dgName).length} khu vực · `
      + (pool.length ? `${pool.length} kỳ ngộ` : 'chưa có kỳ ngộ nào')
      + (unset ? ` · <span style="color:var(--warn)">${unset} chưa chấm</span>` : '');
    $('#ag-events').innerHTML = pool.map((e, i) => {
      const rows = e.choices.map((c, j) => `
        <label class="agchoice${j === e.pick ? ' on' : ''}">
          <input type="radio" name="ag-evpick-${i}" class="ag-pick" data-i="${i}" data-j="${j}"
            ${j === e.pick ? 'checked' : ''} title="Bấm lựa chọn này">
          <input type="text" class="ag-ctext" data-i="${i}" data-j="${j}"
            value="${esc(c)}" placeholder="Nội dung lựa chọn ${j + 1}">
        </label>`).join('');
      return `<div class="agstage event${pickOf(e) ? '' : ' unset'}">
        <div class="agstage-h">
          <input type="text" class="ag-evname" data-i="${i}" value="${esc(e.name)}"
            placeholder="Tên kỳ ngộ (không bắt buộc)">
          <button class="agb agb-ghost agb-sm ag-evdel" data-i="${i}" title="Xoá kỳ ngộ này">✕</button>
        </div>
        <div class="agstage-b">
          <div style="display:flex;align-items:center;gap:8px">
            <span>Số lựa chọn</span>
            <input type="number" class="ag-cn" data-i="${i}" min="1" max="8" value="${e.choices.length}">
            ${pickOf(e) ? '' : '<span class="agtag">chưa chấm</span>'}
          </div>
          ${rows}
        </div></div>`;
    }).join('');
  }

  function buildDoors() {
    $('#ag-doors').innerHTML = cfg.doors.map((d, i) => `
      <div class="agdoor"><b>${i + 1}</b><span>${esc(d)}</span>
        <button class="agb agb-ghost agb-sm ag-dup" data-i="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="agb agb-ghost agb-sm ag-ddn" data-i="${i}"
          ${i === cfg.doors.length - 1 ? 'disabled' : ''}>▼</button>
      </div>`).join('');
  }

  /** Đổi số ải: thêm ải chiến đấu ở cuối, hoặc cắt bớt. */
  function setStageCount(n) {
    const plan = currentPlan();
    n = Math.max(0, Math.min(30, n | 0));
    while (plan.stages.length < n) plan.stages.push({ type: 'battle' });
    plan.stages.length = n;
    saveCfg(); buildStages();
  }

  /** Đổi số lựa chọn của một kỳ ngộ. */
  function setChoiceCount(i, n) {
    const e = eventPool()[i];
    n = Math.max(1, Math.min(8, n | 0));
    while (e.choices.length < n) e.choices.push('');
    e.choices.length = n;
    if (e.pick >= n) e.pick = -1;
    saveCfg(); buildEvents();
  }

  /** 📥 Chép kỳ ngộ đang hiện (tên + các lựa chọn) vào danh sách. */
  function grabEvent() {
    const opts = choiceButtonsOnScreen();
    if (!opts.length) {
      log('📥 Không thấy lựa chọn nào trên màn hình — hãy mở đúng màn hình kỳ ngộ rồi bấm lại.', 'warn');
      return;
    }
    const title = eventTitle();
    const { event, tie } = whichEvent(opts, liveText());
    const have = event || (tie && tie[0]);
    if (have) {
      if (!have.name && title) { have.name = title; saveCfg(); buildEvents(); }
      log(`📥 Kỳ ngộ này đã có trong danh sách: ${eventLabel(have)}`, 'info');
      return;
    }
    const e = { name: title, choices: opts.map((b) => b.label), pick: -1 };
    eventPool().push(e);
    saveCfg(); buildEvents();
    log(`📥 Đã thêm kỳ ngộ ${eventLabel(e)}: ${e.choices.join(' | ')} — chấm lựa chọn sẽ bấm.`, 'ok');
  }

  // mọi thao tác trong trình soạn ải đi qua một chỗ
  function wireDungeonEditor() {
    $('#ag-dgname').onchange = (e) => {
      cfg.dgName = e.target.value; saveCfg(); buildDungeon();
    };
    $('#ag-dgzone').onchange = (e) => {
      cfg.dgZone = e.target.value; saveCfg(); buildDungeon();
    };
    $('#ag-dgauto').onchange = (e) => { cfg.dgAuto = e.target.checked; saveCfg(); };
    const saveGate = () => {
      const plan = currentPlan();
      plan.gate = { door: $('#ag-gatedoor').value.trim(), action: $('#ag-gateact').value === 'give' ? 'give' : 'fight' };
      saveCfg(); buildGate();
    };
    $('#ag-gatedoor').onchange = saveGate;
    $('#ag-gateact').onchange = saveGate;
    $('#ag-dgstam').onchange = (e) => { cfg.dgStamStop = e.target.checked; saveCfg(); };
    $('#ag-dgheal').onchange = (e) => { cfg.dgHeal = e.target.checked; saveCfg(); };
    $('#ag-dghealpct').onchange = (e) => {
      cfg.dgHealBelow = Math.max(1, Math.min(99, +e.target.value || 50));
      e.target.value = cfg.dgHealBelow; saveCfg();
    };
    $('#ag-dgcost').onchange = (e) => {
      currentPlan().stamina = Math.max(0, +e.target.value || 0);
      saveCfg(); paintCostNote();
    };
    $('#ag-dgcount').onchange = (e) => setStageCount(+e.target.value);
    $('#ag-dgmax').onchange = (e) => { cfg.dgMax = Math.max(0, +e.target.value || 0); saveCfg(); paint(); };
    $('#ag-doorreset').onclick = () => {
      cfg.doors = DOORS.slice(); saveCfg(); buildDoors();
      log('↺ Thứ tự cửa: ' + cfg.doors.join(' → '), 'ok');
    };

    $('#ag-dgstages').addEventListener('change', (e) => {
      const t = e.target;
      const s = currentPlan().stages[+t.dataset.i];
      if (!s || !t.classList.contains('ag-stype')) return;
      s.type = t.value; saveCfg(); buildStages();
    });

    const events = $('#ag-events');
    events.addEventListener('change', (ev) => {
      const t = ev.target, i = +t.dataset.i;
      const e = eventPool()[i];
      if (!e) return;
      if (t.classList.contains('ag-cn')) setChoiceCount(i, +t.value);
      else if (t.classList.contains('ag-pick')) { e.pick = +t.dataset.j; saveCfg(); buildEvents(); }
    });
    // gõ chữ thì lưu luôn nhưng không dựng lại, để khỏi mất con trỏ đang gõ
    events.addEventListener('input', (ev) => {
      const t = ev.target;
      const e = eventPool()[+t.dataset.i];
      if (!e) return;
      if (t.classList.contains('ag-ctext')) { e.choices[+t.dataset.j] = t.value; saveCfg(); }
      else if (t.classList.contains('ag-evname')) { e.name = t.value.trim(); saveCfg(); }
    });
    events.addEventListener('click', (ev) => {
      const t = ev.target.closest('.ag-evdel');
      if (!t) return;
      const [gone] = eventPool().splice(+t.dataset.i, 1);
      saveCfg(); buildEvents();
      if (gone) log(`🗑 Đã xoá kỳ ngộ ${eventLabel(gone)}`, 'info');
    });
    $('#ag-evadd').onclick = () => {
      eventPool().push({ name: '', choices: ['', ''], pick: -1 });
      saveCfg(); buildEvents();
    };
    $('#ag-evgrab').onclick = grabEvent;

    $('#ag-doors').addEventListener('click', (e) => {
      const up = e.target.closest('.ag-dup'), dn = e.target.closest('.ag-ddn');
      const b = up || dn;
      if (!b || b.disabled) return;
      const i = +b.dataset.i, j = up ? i - 1 : i + 1;
      [cfg.doors[i], cfg.doors[j]] = [cfg.doors[j], cfg.doors[i]];
      saveCfg(); buildDoors();
    });
  }

  /** Ẩn/hiện những phần chỉ dùng cho một chế độ. */
  function paintMode() {
    for (const r of panel.querySelectorAll('input[name=ag-mode]')) {
      r.checked = (r.value === cfg.mode);
      if (r.parentElement) r.parentElement.classList.toggle('on', r.checked);
    }
    const show = {
      '#ag-scopebox': cfg.mode === 'farm',
      '#ag-elbox': cfg.mode === 'farm',
      '#ag-gdbox': cfg.mode === 'farm',
      '#ag-waterbox': cfg.mode === 'water',
      '#ag-bossbox': cfg.mode === 'boss',
      '#ag-dgbox': cfg.mode === 'dungeon',
    };
    for (const id in show) {
      const el = $(id);
      if (el) el.style.display = show[id] ? 'block' : 'none';
    }
    // từng hàng lẻ (tên nút, số vòng, nút bỏ loại vườn) chỉ hiện ở chế độ ghi trong data-modes
    for (const el of panel.querySelectorAll('.agnr')) {
      const on = el.dataset.modes.split(' ').includes(cfg.mode);
      el.style.display = on ? (el.classList.contains('agb') ? '' : el.tagName === 'LABEL' ? 'flex' : 'contents') : 'none';
    }
    $('#ag-namebox').style.display = [...panel.querySelectorAll('#ag-namebox .agnr')]
      .some((el) => el.style.display !== 'none') ? 'block' : 'none';
    const SUB = { farm: 'Chăm cây · Dược Viên', water: 'Múc nước · Dược Viên',
                  boss: 'Đánh boss · Sảnh Boss', dungeon: 'Đi bí cảnh · Tổ đội' };
    $('#ag-sub').textContent = SUB[cfg.mode] || '';
    $('#ag-logo').textContent = { farm: '🌿', water: '💧', boss: '⚔', dungeon: '🗺' }[cfg.mode] || '🌿';
    if (cfg.mode === 'dungeon') buildDungeon();
    paint();
  }

  function fillSettings() {
    $('#ag-dry').checked = cfg.dryRun;
    $('#ag-wwait').value = cfg.waterWait;
    $('#ag-wretry').value = cfg.waterRetry;
    $('#ag-refresh').value = cfg.refreshBtn;
    $('#ag-bcd').value = cfg.bossCooldown;
    $('#ag-bretry').value = cfg.bossRetry;
    $('#ag-batk').value = cfg.maxAttacks;
    $('#ag-bname-atk').value = cfg.bossAttack;
    $('#ag-bname-skip').value = cfg.bossSkip;
    $('#ag-bname-back').value = cfg.bossBack;
    $('#ag-bname-heal').value = cfg.bossHeal;
    $('#ag-prelude').value = listToText(cfg.prelude);
    $('#ag-aoebug').value = cfg.aoeBug;
    $('#ag-aoefert').value = cfg.aoeFert;
    $('#ag-aoewater').value = cfg.aoeWater;
    $('#ag-aoehv').value = cfg.aoeHarvest;
    $('#ag-aoesow').value = cfg.aoeSow;
    $('#ag-care').value = listToText(cfg.care);
    $('#ag-dv').value = listToText(cfg.duocVien);
    $('#ag-vuon').value = listToText(cfg.vuon);
    $('#ag-delay').value = cfg.stepDelay;
    $('#ag-ui').value = cfg.uiDelay;
    $('#ag-tick').value = cfg.tick;
    $('#ag-rounds').value = cfg.maxRounds;
    $('#ag-resume').checked = cfg.autoResume !== false;
    buildElements();
    buildScope();
    buildGardens();
    paintMode();
  }

  function saveSettings() {
    cfg.waterWait = Math.max(5, +$('#ag-wwait').value || DEFAULTS.waterWait);
    cfg.waterRetry = Math.max(2, +$('#ag-wretry').value || DEFAULTS.waterRetry);
    cfg.refreshBtn = $('#ag-refresh').value.trim() || DEFAULTS.refreshBtn;
    cfg.bossCooldown = Math.max(1, +$('#ag-bcd').value || DEFAULTS.bossCooldown);
    cfg.bossRetry = Math.max(2, +$('#ag-bretry').value || DEFAULTS.bossRetry);
    cfg.maxAttacks = Math.max(0, +$('#ag-batk').value || 0);
    cfg.bossAttack = $('#ag-bname-atk').value.trim() || DEFAULTS.bossAttack;
    cfg.bossSkip = $('#ag-bname-skip').value.trim() || DEFAULTS.bossSkip;
    cfg.bossBack = $('#ag-bname-back').value.trim() || DEFAULTS.bossBack;
    cfg.bossHeal = $('#ag-bname-heal').value.trim() || DEFAULTS.bossHeal;
    cfg.prelude = textToList($('#ag-prelude').value);
    cfg.aoeBug = $('#ag-aoebug').value.trim() || DEFAULTS.aoeBug;
    cfg.aoeFert = $('#ag-aoefert').value.trim() || DEFAULTS.aoeFert;
    cfg.aoeWater = $('#ag-aoewater').value.trim() || DEFAULTS.aoeWater;
    cfg.aoeHarvest = $('#ag-aoehv').value.trim() || DEFAULTS.aoeHarvest;
    cfg.aoeSow = $('#ag-aoesow').value.trim() || DEFAULTS.aoeSow;
    saveGardens();
    cfg.care = textToList($('#ag-care').value);
    cfg.duocVien = textToList($('#ag-dv').value);
    cfg.vuon = textToList($('#ag-vuon').value);
    cfg.stepDelay = +$('#ag-delay').value || DEFAULTS.stepDelay;
    cfg.uiDelay = +$('#ag-ui').value || DEFAULTS.uiDelay;
    cfg.tick = +$('#ag-tick').value || DEFAULTS.tick;
    cfg.maxRounds = Math.max(0, +$('#ag-rounds').value || 0);
    // tên dược viên/vườn có thể vừa đổi -> lọc lại phạm vi cho khớp
    const s = {};
    for (const dv of cfg.duocVien) s[dv] = scopeFor(dv);
    cfg.scope = s;
    saveCfg();
    setTick(cfg.tick);
    fillSettings();
    if (cfg.mode === 'water') {
      log(`💾 Đã lưu. Chỉ múc nước: chờ ${cfg.waterWait}s, làm mới mỗi ${cfg.waterRetry}s.`, 'ok');
    } else if (cfg.mode === 'boss') {
      log(`💾 Đã lưu. Đánh boss: cooldown ${cfg.bossCooldown}s, ` +
          `${cfg.maxAttacks || 'vô hạn'} lượt.`, 'ok');
    } else {
      const seeds = Object.values(cfg.gardens).filter((g) => g.seed).length;
      log(`💾 Đã lưu. Linh căn ${cfg.elements.join(' + ')}, sẽ đi ${scopeSummary()}, `
          + `cooldown mặc định ${fmtCd(cfg.gardenCd)}, ${seeds} vườn có hạt giống gieo lại, `
          + `${cfg.maxRounds || 'vô hạn'} vòng.`, 'ok');
    }
  }

  /**
   * Bảng chỉ hiện một trang tại một thời điểm: tổng quan HOẶC cài đặt.
   * Nhờ vậy phần cài đặt có đủ chỗ thở thay vì bị nhét vào khe hẹp.
   */
  function showSettings(open) {
    // lúc bảng đóng, bot có thể vừa tự nhận bí cảnh hoặc học thêm kỳ ngộ
    if (open) buildDungeon();
    $('#ag-set').style.display = open ? 'block' : 'none';
    $('#ag-over').style.display = open ? 'none' : '';
    $('#ag-cog').classList.toggle('on', open);
    $('#ag-cog').textContent = open ? '✕ Đóng' : '⚙ Cài đặt';
  }

  $('#ag-diag').onclick = diagnose;
  $('#ag-cog').onclick = () => showSettings($('#ag-set').style.display === 'none');
  $('#ag-close').onclick = () => showSettings(false);
  $('#ag-fold').onclick = () => {
    const b = $('#ag-body');
    const hid = b.style.display === 'none';
    b.style.display = hid ? 'flex' : 'none';     // 'flex' chứ không phải 'block'
    $('#ag-fold').textContent = hid ? '▾' : '▸';
  };
  $('#ag-dry').onchange = (e) => { cfg.dryRun = e.target.checked; saveCfg(); paint(); };
  $('#ag-resume').onchange = (e) => { cfg.autoResume = e.target.checked; saveCfg(); };
  $('#ag-all').onclick = () => setAllScope(true);
  $('#ag-none').onclick = () => setAllScope(false);
  $('#ag-save').onclick = saveSettings;
  $('#ag-unskip').onclick = () => {
    if (!S.skip.size) { log('Chưa có vườn nào bị loại.', 'info'); return; }
    log(`↺ Cho đi lại ${S.skip.size} vườn đã loại: ${[...S.skip].join(' · ')}`, 'ok');
    S.skip.clear(); paint();
  };
  $('#ag-reset').onclick = () => {
    if (!confirm('Đưa toàn bộ cài đặt về mặc định?')) return;
    cfg = freshDefaults();
    saveCfg(); setTick(cfg.tick); fillSettings();
    log('↺ Đã đưa về mặc định.', 'ok');
  };
  $('#ag-pause').onclick = () => {
    if (!S.running) return;
    S.paused = !S.paused;
    log(S.paused ? '⏸ Tạm dừng — bấm "Tiếp tục" để chạy lại' : '▶ Tiếp tục', 'warn');
    paint();
  };
  for (const r of panel.querySelectorAll('input[name=ag-mode]')) {
    r.onchange = () => {
      if (S.running) { log('⚠ Hãy dừng trước khi đổi chế độ.', 'warn'); paintMode(); return; }
      cfg.mode = r.value; saveCfg(); paintMode();
      log(cfg.mode === 'water' ? '💧 Chế độ: CHỈ MÚC NƯỚC — không đi chăm cây'
                               : '🌿 Chế độ: CHĂM CÂY', 'ok');
    };
  }
  $('#ag-run').onclick = () => {
    if (!S.running) {
      if (cfg.mode !== 'water' && !cfg.duocVien.filter((d) => scopeFor(d).length).length) {
        log('⚠ Chưa tích vườn nào — mở ⚙ để chọn phạm vi.', 'warn');
        showSettings(true);
        return;
      }
      S.wphase = 'check'; S.waterUntil = 0; S.waters = 0;
      S.bphase = 'attack'; S.bossUntil = 0; S.attacks = 0;
      S.dgStage = 0; S.dgRuns = 0; S.dgSeen = ''; S.dgInRun = false; S.dgHealed = false; S.dgTeam = null;
      S.dgWaiting = false;
      S.doneDv.clear(); S.doneVuon.clear(); S.skip.clear(); S.preludeDone.clear();
      S.curDv = ''; S.curVuon = ''; S.gardenWalked = false;
      S.plotsHere = S.ripeHere = S.aoeTries = 0; S.harvested = false;
      S.dropdownTries = S.plotClicks = 0; S.busyUntil = 0;
      S.gd = {}; S.aoeDone = {}; S.walkDone = {}; S.pestWalks = 0;
      S.sowing = S.sowed = S.sowFail = false; S.gWaits = 0; S.selTries = 0; S.sawTable = false; S.roundWork = 0; S.idleUntil = 0;
      S.stopReason = ''; S.paused = false; S.running = true;
      markRunning(true);
      if (cfg.mode === 'water') {
        log(`▶ Bắt đầu CHỈ MÚC NƯỚC — múc xong chờ ${cfg.waterWait}s, ` +
            `chưa hồi thì ${cfg.waterRetry}s làm mới lại.`, 'head');
      } else if (cfg.mode === 'dungeon') {
        const plan = currentPlan();
        const ev = plan.stages.filter((s) => s.type === 'event').length;
        log(`▶ Bắt đầu ĐI BÍ CẢNH — ${cfg.dgName} · ${cfg.dgZone}, `
            + `${plan.stages.length} ải (${ev} kỳ ngộ). Cửa: ${cfg.doors.slice(0, 3).join(' → ')}…`, 'head');
        if (!plan.stages.length) {
          log('Chưa soạn ải nào: bot vẫn chọn cửa và khai chiến, nhưng kỳ ngộ sẽ để game tự chọn.', 'warn');
        }
      } else if (cfg.mode === 'boss') {
        log(`▶ Bắt đầu ĐÁNH BOSS — đánh → bỏ animation → về sảnh → hồi máu → ` +
            `chờ ${cfg.bossCooldown}s. Dừng sau ${cfg.maxAttacks || '∞'} lượt.`, 'head');
      } else {
        const plan = cfg.duocVien.filter((d) => scopeFor(d).length)
          .map((d) => `${d}: ${scopeFor(d).length} vườn`).join(' · ');
        log(`▶ Bắt đầu — ${plan} · linh căn ${cfg.elements.join(' + ')}`
            + (needWalk() ? ' (AOE xong vẫn vào từng ô)' : ' (AOE lo hết)'), 'head');
      }
      if (cfg.dryRun) log('Đang ở CHẾ ĐỘ THỬ, script sẽ không bấm gì cả.', 'warn');
    } else {
      S.running = false; S.paused = false; S.stopReason = 'bạn bấm dừng';
      markRunning(false);
      log('⏹ Đã dừng', 'warn');
    }
    paint();
  };

  // ---- kéo thả bảng, luôn giữ trong màn hình ----
  function moveTo(left, top) {
    const r = panel.getBoundingClientRect();
    // chừa lại ít nhất thanh tiêu đề trong màn hình để còn kéo tiếp
    const maxL = Math.max(4, window.innerWidth - r.width - 4);
    const maxT = Math.max(4, window.innerHeight - r.height - 4);
    panel.style.left = Math.max(4, Math.min(left, maxL)) + 'px';
    panel.style.top = Math.max(4, Math.min(top, maxT)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  /** Đưa bảng về góc dưới bên phải. */
  function homePanel() {
    panel.style.left = 'auto'; panel.style.top = 'auto';
    panel.style.right = '16px'; panel.style.bottom = '16px';
  }

  (function drag() {
    const head = $('#ag-head');
    let sx, sy, ox, oy, on = false;
    head.onmousedown = (e) => {
      if (e.target.id === 'ag-fold') return;
      on = true; sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
      e.preventDefault();
    };
    head.ondblclick = (e) => { if (e.target.id !== 'ag-fold') homePanel(); };
    document.addEventListener('mousemove', (e) => {
      if (!on) return;
      moveTo(ox + e.clientX - sx, oy + e.clientY - sy);
    });
    document.addEventListener('mouseup', () => { on = false; });
    // đổi cỡ cửa sổ mà bảng lọt ra ngoài thì kéo nó vào lại
    window.addEventListener('resize', () => {
      if (panel.style.left && panel.style.left !== 'auto') {
        const r = panel.getBoundingClientRect();
        moveTo(r.left, r.top);
      }
    });
  })();

  // ---------------------------------------------------------------- //
  //  Nhịp chạy - Chrome hãm setInterval ở tab nền nên ưu tiên Worker
  // ---------------------------------------------------------------- //
  let worker = null, timer = null;
  const safeStep = () => { try { step(); } catch (err) { log('Lỗi: ' + err.message, 'warn'); } };

  function setTick(ms) {
    if (worker) { worker.postMessage(ms); return; }
    if (timer) clearInterval(timer);
    timer = setInterval(safeStep, ms);
  }

  try {
    const src = 'let t;onmessage=e=>{clearInterval(t);t=setInterval(()=>postMessage(0),e.data)}';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = safeStep;
    worker.postMessage(cfg.tick);
  } catch (e) {
    worker = null;
    timer = setInterval(safeStep, cfg.tick);
  }

  wireDungeonEditor();
  fillSettings();
  log(worker ? 'Nhịp chạy: Web Worker (không bị hãm khi tab ở nền)'
             : 'Nhịp chạy: setInterval (tab nền có thể bị hãm)', 'info');
  if (!store.ok) {
    log('⚠ Không ghi được cài đặt vào trình duyệt (Discord chặn localStorage của trang). '
        + 'Cài đặt sẽ mất khi tải lại trang — nên dùng bản extension.', 'warn');
  }
  log('Sẵn sàng. Bấm ⚙ để chọn vườn và linh căn, 🔍 Quét thử để kiểm tra.', 'head');

  // Bản extension: nhờ service worker đặt autoDiscardable=false cho tab này,
  // để "Trình tiết kiệm bộ nhớ" của Chrome không ngủ tab Discord đang chạy bot.
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'keep-tab-alive' }, () => { void chrome.runtime.lastError; });
    }
  } catch (e) { /* userscript không có chrome.runtime */ }

  // Trang vừa tải lại giữa chừng? -> chờ Discord vẽ xong tin nhắn rồi tự chạy tiếp.
  (function autoResume() {
    let rec = null;
    try { rec = JSON.parse(store.get(RUN_KEY) || 'null'); } catch (e) { rec = null; }
    if (!rec || !rec.at || cfg.autoResume === false) return;
    if (Date.now() - rec.at > 6 * 3600 * 1000) { markRunning(false); return; }   // cũ quá, thôi
    if (rec.mode && rec.mode !== cfg.mode) { cfg.mode = rec.mode; saveCfg(); paintMode(); }
    log('↻ Trang vừa tải lại khi bot đang chạy — chờ Discord hiện tin nhắn rồi tự chạy tiếp '
        + '(bấm ⏹ Dừng nếu không muốn).', 'warn');
    const t0 = Date.now();
    const tryStart = () => {
      if (S.running) return;
      const ready = liveButtons().length > 0;
      if (!ready && Date.now() - t0 < 60000) { setTimeout(tryStart, 1500); return; }
      if (!ready) { log('↻ Chờ 60 giây không thấy nút nào của game — không tự chạy. Bấm ▶ Chạy khi sẵn sàng.', 'warn'); return; }
      $('#ag-run').onclick();
    };
    setTimeout(tryStart, 4000);
  })();
})();
