// storage.js — Google Sheets backend via Apps Script
// All data lives in your Google Sheet. This layer handles API calls + local caching.

const WW = {
  // SET THIS to your deployed Google Apps Script URL
  API_URL: localStorage.getItem('ww_api_url') || '',

  // Local cache (refreshed on each app open)
  _transactions: [],
  _queue: [],
  _settings: null,
  _loaded: false,

  // ========== INITIALIZATION ==========
  async load() {
    if (!this.API_URL) {
      console.warn('No API_URL set — using localStorage fallback');
      this._loadFromLocalStorage();
      return;
    }
    try {
      const res = await fetch(this.API_URL + '?action=getAll');
      const data = await res.json();
      this._transactions = data.transactions || [];
      this._queue = data.queue || [];
      this._settings = data.settings || this.defaultSettings();
      this._loaded = true;
      // Also cache locally as backup
      this._saveToLocalStorage();
    } catch (err) {
      console.warn('Failed to fetch from API, using local cache', err);
      this._loadFromLocalStorage();
    }
  },

  _saveToLocalStorage() {
    localStorage.setItem('ww_cache_txns', JSON.stringify(this._transactions));
    localStorage.setItem('ww_cache_queue', JSON.stringify(this._queue));
    localStorage.setItem('ww_cache_settings', JSON.stringify(this._settings));
  },

  _loadFromLocalStorage() {
    try {
      this._transactions = JSON.parse(localStorage.getItem('ww_cache_txns')) || [];
      this._queue = JSON.parse(localStorage.getItem('ww_cache_queue')) || [];
      this._settings = JSON.parse(localStorage.getItem('ww_cache_settings')) || this.defaultSettings();
    } catch {
      this._transactions = [];
      this._queue = [];
      this._settings = this.defaultSettings();
    }
    this._loaded = true;
  },

  // ========== API HELPERS ==========
  async _post(data) {
    if (!this.API_URL) return { success: false };
    try {
      const res = await fetch(this.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      return result;
    } catch (err) {
      console.warn('API POST failed', err);
      return { success: false };
    }
  },

  // ========== DEFAULT SETTINGS ==========
  defaultSettings() {
    return {
      ignoredMerchants: [],
      weeklyBudget: null,
      weeklyTotalBudget: null,
      customTags: { necessary: [], indulgence: [], waste: [] },
      subcategoryFrequency: {}
    };
  },

  // ========== DEFAULT SUBCATEGORIES ==========
  defaultSubcategories: {
    necessary: ['Healthy groceries', 'Clothes', 'Electronics', 'Gas', 'WFH coffee', 'Gifts', 'Work expense'],
    indulgence: ['Books', 'Movie rental', 'Sports gear', 'Nice-to-have merchandise', 'Date night', 'Social meal/drinks', 'Chipotle'],
    waste: ['Junk food', 'Fast food', 'Solo eating out', 'Nicotine', 'Alcohol']
  },

  // ========== HELPERS ==========
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  getTodayStart() {
    const now = new Date();
    const today3am = new Date(now);
    today3am.setHours(3, 0, 0, 0);
    if (now < today3am) today3am.setDate(today3am.getDate() - 1);
    return today3am;
  },

  getCurrentWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + diff);
    monday.setHours(3, 0, 0, 0);
    if (now < monday) monday.setDate(monday.getDate() - 7);
    return monday;
  },

  // ========== TRANSACTIONS ==========
  getAllTransactions() {
    return this._transactions;
  },

  async addTransaction(merchant, amount, category, subcategory, queueId) {
    const txn = {
      id: this.generateId(),
      date: new Date().toISOString(),
      merchant: merchant.trim(),
      amount: parseFloat(amount),
      category,
      subcategory: subcategory || ''
    };

    // Add to local cache immediately
    this._transactions.push(txn);
    this._saveToLocalStorage();

    // Update subcategory frequency locally
    if (subcategory && category !== 'ignore') {
      this.incrementSubcategoryFrequency(category, subcategory);
    }

    // If "ignore", also update local ignored merchants list
    if (category === 'ignore') {
      const s = this.getSettings();
      const normalized = txn.merchant.trim();
      if (!s.ignoredMerchants.some(m => m.toLowerCase() === normalized.toLowerCase())) {
        s.ignoredMerchants.push(normalized);
        this._settings = s;
        this._saveToLocalStorage();
      }
    }

    // POST to API
    this._post({
      action: 'categorize',
      merchant: txn.merchant,
      amount: txn.amount,
      category: txn.category,
      subcategory: txn.subcategory,
      queueId: queueId || null
    });

    return txn;
  },

  async deleteTransaction(id) {
    this._transactions = this._transactions.filter(t => t.id !== id);
    this._saveToLocalStorage();
    this._post({ action: 'deleteTransaction', id });
  },

  getTodayTransactions() {
    const start = this.getTodayStart();
    return this._transactions.filter(t => new Date(t.date) >= start);
  },

  getTransactionsInRange(startDate, endDate) {
    return this._transactions.filter(t => {
      const d = new Date(t.date);
      return d >= startDate && d < endDate;
    });
  },

  // ========== WEEK HELPERS ==========
  getThisWeekTransactions() {
    const start = this.getCurrentWeekStart();
    return this._transactions.filter(t => new Date(t.date) >= start);
  },

  getWeekWasteSummary() {
    const waste = this.getThisWeekTransactions().filter(t => t.category === 'waste');
    return {
      total: waste.reduce((s, t) => s + t.amount, 0),
      count: waste.length
    };
  },

  getWeekTotalSummary() {
    // All categorized spending this week, except reimbursable work expenses
    const all = this.getThisWeekTransactions().filter(t => t.subcategory !== 'Work expense');
    return {
      total: all.reduce((s, t) => s + t.amount, 0),
      count: all.length
    };
  },

  getWeeklyTotalBudget() { return this.getSettings().weeklyTotalBudget; },

  async setWeeklyTotalBudget(amount) {
    const s = this.getSettings();
    s.weeklyTotalBudget = amount ? parseFloat(amount) : null;
    this.saveSettings(s);
  },

  // ========== TODAY SUMMARY ==========
  getTodaySummary() {
    const today = this.getTodayTransactions();
    const byCategory = { waste: [], indulgence: [], necessary: [], ignore: [] };
    today.forEach(t => { if (byCategory[t.category]) byCategory[t.category].push(t); });

    const sumCount = arr => ({
      total: arr.reduce((s, t) => s + t.amount, 0),
      count: arr.length
    });

    return {
      waste: sumCount(byCategory.waste),
      indulgence: sumCount(byCategory.indulgence),
      necessary: sumCount(byCategory.necessary),
      ignored: sumCount(byCategory.ignore),
      transactions: today.sort((a, b) => new Date(b.date) - new Date(a.date))
    };
  },

  // ========== QUEUE ==========
  getQueue() { return this._queue; },
  getQueueCount() { return this._queue.length; },

  getNextInQueue() {
    return this._queue.length > 0 ? this._queue[0] : null;
  },

  async removeFromQueue(id) {
    this._queue = this._queue.filter(q => q.id !== id);
    this._saveToLocalStorage();
    this._post({ action: 'removeFromQueue', id });
  },

  // ========== SETTINGS ==========
  getSettings() {
    return this._settings || this.defaultSettings();
  },

  async saveSettings(settings) {
    this._settings = settings;
    this._saveToLocalStorage();
    this._post({ action: 'saveSettings', settings });
  },

  isIgnoredMerchant(merchant) {
    const s = this.getSettings();
    return s.ignoredMerchants.some(
      m => m.toLowerCase() === merchant.trim().toLowerCase()
    );
  },

  async addIgnoredMerchant(merchant) {
    const s = this.getSettings();
    const normalized = merchant.trim();
    if (!s.ignoredMerchants.some(m => m.toLowerCase() === normalized.toLowerCase())) {
      s.ignoredMerchants.push(normalized);
      this.saveSettings(s);
    }
  },

  async removeIgnoredMerchant(merchant) {
    const s = this.getSettings();
    s.ignoredMerchants = s.ignoredMerchants.filter(
      m => m.toLowerCase() !== merchant.toLowerCase()
    );
    this.saveSettings(s);
  },

  // Weekly budget
  getWeeklyBudget() { return this.getSettings().weeklyBudget; },

  async setWeeklyBudget(amount) {
    const s = this.getSettings();
    s.weeklyBudget = amount ? parseFloat(amount) : null;
    this.saveSettings(s);
  },

  // Custom tags
  getCustomTags(category) {
    const s = this.getSettings();
    return (s.customTags && s.customTags[category]) || [];
  },

  async addCustomTag(category, tag) {
    const s = this.getSettings();
    if (!s.customTags) s.customTags = { necessary: [], indulgence: [], waste: [] };
    if (!s.customTags[category]) s.customTags[category] = [];
    if (!s.customTags[category].includes(tag)) {
      s.customTags[category].push(tag);
      this.saveSettings(s);
    }
  },

  async removeCustomTag(category, tag) {
    const s = this.getSettings();
    if (s.customTags && s.customTags[category]) {
      s.customTags[category] = s.customTags[category].filter(t => t !== tag);
      this.saveSettings(s);
    }
  },

  // Subcategory frequency
  incrementSubcategoryFrequency(category, subcategory) {
    const s = this.getSettings();
    if (!s.subcategoryFrequency) s.subcategoryFrequency = {};
    const key = `${category}:${subcategory}`;
    s.subcategoryFrequency[key] = (s.subcategoryFrequency[key] || 0) + 1;
    this.saveSettings(s);
  },

  getSubcategoriesSorted(category) {
    const s = this.getSettings();
    const defaults = this.defaultSubcategories[category] || [];
    const custom = this.getCustomTags(category);
    const all = [...new Set([...defaults, ...custom])];
    const freq = s.subcategoryFrequency || {};
    return all.sort((a, b) => {
      const fa = freq[`${category}:${a}`] || 0;
      const fb = freq[`${category}:${b}`] || 0;
      if (fb !== fa) return fb - fa;
      return a.localeCompare(b);
    });
  },

  // ========== ANALYTICS HELPERS ==========
  getDayBoundary(date) {
    const d = new Date(date);
    const boundary = new Date(d);
    boundary.setHours(3, 0, 0, 0);
    if (d < boundary) boundary.setDate(boundary.getDate() - 1);
    return boundary;
  },

  groupByDay(transactions) {
    const groups = {};
    transactions.forEach(t => {
      const day = this.getDayBoundary(t.date).toISOString().split('T')[0];
      if (!groups[day]) groups[day] = [];
      groups[day].push(t);
    });
    return groups;
  },

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    monday.setHours(3, 0, 0, 0);
    return monday;
  },

  aggregateStats(transactions) {
    const byCategory = { waste: [], indulgence: [], necessary: [], ignore: [] };
    transactions.forEach(t => { if (byCategory[t.category]) byCategory[t.category].push(t); });
    const sumCount = arr => ({ total: arr.reduce((s, t) => s + t.amount, 0), count: arr.length });

    const subcategoryBreakdown = {};
    transactions.forEach(t => {
      if (t.subcategory) {
        const key = `${t.category}:${t.subcategory}`;
        if (!subcategoryBreakdown[key]) {
          subcategoryBreakdown[key] = { category: t.category, subcategory: t.subcategory, total: 0, count: 0 };
        }
        subcategoryBreakdown[key].total += t.amount;
        subcategoryBreakdown[key].count += 1;
      }
    });

    return {
      waste: sumCount(byCategory.waste),
      indulgence: sumCount(byCategory.indulgence),
      necessary: sumCount(byCategory.necessary),
      ignored: sumCount(byCategory.ignore),
      subcategories: Object.values(subcategoryBreakdown).sort((a, b) => b.total - a.total)
    };
  },

  getRollingDailyAverage(year, month) {
    const start = new Date(year, month, 1, 3, 0, 0, 0);
    const end = new Date(year, month + 1, 1, 3, 0, 0, 0);
    const txns = this.getTransactionsInRange(start, end);
    const days = this.groupByDay(txns);
    const dayCount = Object.keys(days).length || 1;
    const wasteTotal = txns.filter(t => t.category === 'waste').reduce((s, t) => s + t.amount, 0);
    const indulgenceTotal = txns.filter(t => t.category === 'indulgence').reduce((s, t) => s + t.amount, 0);
    return { waste: wasteTotal / dayCount, indulgence: indulgenceTotal / dayCount, dayCount };
  },

  // ========== EXPORT ==========
  exportData() {
    return JSON.stringify({
      transactions: this._transactions,
      settings: this._settings,
      exportDate: new Date().toISOString()
    }, null, 2);
  }
};
