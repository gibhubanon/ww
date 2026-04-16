// analytics.js — Tab 1: Weekly over/under budget history, Tab 2: Subcategory spending by month

const Analytics = {
  currentTab: 'weekly',

  init() {
    this.render();
  },

  render() {
    const container = document.getElementById('analytics-content');
    const toggle = document.getElementById('analytics-toggle');

    toggle.innerHTML = `
      <div class="period-toggle">
        <button class="period-btn ${this.currentTab === 'weekly' ? 'active' : ''}" data-tab="weekly">Weekly Budget</button>
        <button class="period-btn ${this.currentTab === 'subcategory' ? 'active' : ''}" data-tab="subcategory">By Subcategory</button>
      </div>
    `;

    toggle.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentTab = btn.dataset.tab;
        this.render();
      });
    });

    if (this.currentTab === 'weekly') {
      this.renderWeeklyHistory(container);
    } else {
      this.renderSubcategoryByMonth(container);
    }
  },

  // ===== TAB 1: Weekly over/under budget history =====
  renderWeeklyHistory(el) {
    const budget = WW.getWeeklyBudget();
    const weeks = this.getWeeklyData();

    if (weeks.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No data yet</p></div>';
      return;
    }

    let html = '';

    if (!budget) {
      html += '<div class="analytics-hint">Set a weekly budget in Settings to see over/under tracking</div>';
    }

    html += '<div class="weekly-history">';

    weeks.forEach(week => {
      const diff = budget ? week.wasteTotal - budget : null;
      const over = diff !== null && diff > 0;
      const under = diff !== null && diff <= 0;
      const diffLabel = diff !== null
        ? (over ? `+$${diff.toFixed(2)} over` : `-$${Math.abs(diff).toFixed(2)} under`)
        : '';
      const diffClass = over ? 'over-text' : under ? 'under-text' : '';
      const barPct = budget ? Math.min((week.wasteTotal / budget) * 100, 150) : 0;
      // Cap visual bar at 100% but show the number
      const barVisual = Math.min(barPct, 100);

      html += `
        <div class="week-row">
          <div class="week-header">
            <span class="week-label">${week.label}</span>
            <span class="week-diff ${diffClass}">${diffLabel}</span>
          </div>
          <div class="week-stats">
            <span class="week-waste">$${week.wasteTotal.toFixed(2)} waste (${week.wasteCount})</span>
            <span class="week-indulgence">$${week.indulgenceTotal.toFixed(2)} indulgence (${week.indulgenceCount})</span>
          </div>
          ${budget ? `
            <div class="budget-bar-track">
              <div class="budget-bar-fill ${over ? 'over' : 'under'}" style="width: ${barVisual}%"></div>
              ${budget ? `<div class="budget-bar-marker" style="left: ${Math.min(100, (budget / Math.max(week.wasteTotal, budget)) * 100)}%"></div>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    });

    html += '</div>';
    el.innerHTML = html;
  },

  getWeeklyData() {
    const allTxns = WW.getAllTransactions();
    if (allTxns.length === 0) return [];

    // Find earliest transaction date
    const earliest = new Date(Math.min(...allTxns.map(t => new Date(t.date).getTime())));
    const now = new Date();
    const weeks = [];

    // Start from current week and go backwards
    let weekStart = WW.getCurrentWeekStart();

    for (let i = 0; i < 52; i++) { // max 52 weeks back
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      if (weekStart < earliest && i > 0) break;

      const txns = allTxns.filter(t => {
        const d = new Date(t.date);
        return d >= weekStart && d < weekEnd;
      });

      const waste = txns.filter(t => t.category === 'waste');
      const indulgence = txns.filter(t => t.category === 'indulgence');

      const startLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endDate = new Date(weekEnd);
      endDate.setDate(endDate.getDate() - 1);
      const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const isThisWeek = i === 0;

      weeks.push({
        label: isThisWeek ? `This Week (${startLabel} – ${endLabel})` : `${startLabel} – ${endLabel}`,
        wasteTotal: waste.reduce((s, t) => s + t.amount, 0),
        wasteCount: waste.length,
        indulgenceTotal: indulgence.reduce((s, t) => s + t.amount, 0),
        indulgenceCount: indulgence.length
      });

      // Go back one week
      weekStart = new Date(weekStart);
      weekStart.setDate(weekStart.getDate() - 7);
    }

    return weeks;
  },

  // ===== TAB 2: Subcategory spending by month =====
  renderSubcategoryByMonth(el) {
    const months = this.getMonthlySubcategoryData();

    if (months.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No data yet</p></div>';
      return;
    }

    let html = '';

    months.forEach(month => {
      html += `<div class="month-section">`;
      html += `<h3 class="month-header">${month.label}</h3>`;

      if (month.subcategories.length === 0) {
        html += '<div class="empty-hint">No categorized spending</div>';
      } else {
        const maxTotal = month.subcategories[0].total;

        html += '<div class="bar-chart">';
        month.subcategories.forEach(s => {
          const pct = maxTotal > 0 ? (s.total / maxTotal) * 100 : 0;
          html += `
            <div class="bar-row">
              <div class="bar-label" title="${Categorize.escapeHtml(s.subcategory)}">${Categorize.escapeHtml(s.subcategory)}</div>
              <div class="bar-track">
                <div class="bar-fill bar-${s.category}" style="width: ${pct}%"></div>
              </div>
              <div class="bar-value">$${s.total.toFixed(2)} (${s.count})</div>
            </div>
          `;
        });
        html += '</div>';
      }

      // Month totals
      html += `
        <div class="month-totals">
          <span class="waste-text">$${month.wasteTot.toFixed(2)} waste</span>
          <span class="indulgence-text">$${month.indulgenceTot.toFixed(2)} indulgence</span>
          <span class="necessary-text">$${month.necessaryTot.toFixed(2)} necessary</span>
        </div>
      `;

      html += '</div>';
    });

    el.innerHTML = html;
  },

  getMonthlySubcategoryData() {
    const allTxns = WW.getAllTransactions();
    if (allTxns.length === 0) return [];

    const now = new Date();
    const months = [];

    for (let i = 0; i < 12; i++) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 3, 0, 0, 0);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1, 3, 0, 0, 0);

      const txns = allTxns.filter(t => {
        const d = new Date(t.date);
        return d >= start && d < end;
      });

      if (txns.length === 0 && i > 0) continue;

      // Build subcategory breakdown
      const subMap = {};
      txns.forEach(t => {
        if (!t.subcategory) return;
        const key = `${t.category}:${t.subcategory}`;
        if (!subMap[key]) {
          subMap[key] = { category: t.category, subcategory: t.subcategory, total: 0, count: 0 };
        }
        subMap[key].total += t.amount;
        subMap[key].count += 1;
      });

      const subcategories = Object.values(subMap).sort((a, b) => b.total - a.total);

      months.push({
        label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        subcategories,
        wasteTot: txns.filter(t => t.category === 'waste').reduce((s, t) => s + t.amount, 0),
        indulgenceTot: txns.filter(t => t.category === 'indulgence').reduce((s, t) => s + t.amount, 0),
        necessaryTot: txns.filter(t => t.category === 'necessary').reduce((s, t) => s + t.amount, 0)
      });
    }

    return months;
  }
};
