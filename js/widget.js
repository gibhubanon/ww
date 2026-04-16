// widget.js — Today summary + transaction list

const Widget = {
  init() {
    this.refresh();
  },

  refresh() {
    this.renderSummary();
    this.renderBudgetBar();
    this.renderList();
  },

  renderSummary() {
    const daySummary = WW.getTodaySummary();
    const weekWaste = WW.getWeekWasteSummary();
    const weeklyBudget = WW.getWeeklyBudget();
    const el = document.getElementById('today-summary');

    // Weekly: red if no budget set OR over budget, green if under
    const over = !weeklyBudget || weekWaste.total > weeklyBudget;
    const weekColor = over ? 'waste' : 'under-budget';

    el.innerHTML = `
      <div class="weekly-hero ${weekColor}">
        <div class="weekly-amount">$${weekWaste.total.toFixed(2)}</div>
        <div class="weekly-label">weekly waste (${weekWaste.count})</div>
      </div>
      <div class="summary-cards-small">
        <div class="summary-card-sm waste-card">
          <span class="sm-amount">$${daySummary.waste.total.toFixed(2)}</span>
          <span class="sm-label">today waste (${daySummary.waste.count})</span>
        </div>
        <div class="sm-divider">|</div>
        <div class="summary-card-sm indulgence-card">
          <span class="sm-amount">$${daySummary.indulgence.total.toFixed(2)}</span>
          <span class="sm-label">today indulgence (${daySummary.indulgence.count})</span>
        </div>
        <div class="sm-divider necessary-only hidden">|</div>
        <div class="summary-card-sm necessary-card necessary-only hidden">
          <span class="sm-amount">$${(daySummary.necessary.total + daySummary.ignored.total).toFixed(2)}</span>
          <span class="sm-label">today necessary (${daySummary.necessary.count + daySummary.ignored.count})</span>
        </div>
      </div>
    `;
  },

  renderBudgetBar() {
    const el = document.getElementById('today-budget-bar');
    const budget = WW.getWeeklyBudget();
    const totalBudget = WW.getWeeklyTotalBudget();

    let html = '';

    // Weekly waste budget bar
    if (budget) {
      const weekWaste = WW.getWeekWasteSummary();
      const spent = weekWaste.total;
      const pct = Math.min((spent / budget) * 100, 100);
      const over = spent > budget;
      html += `
        <div class="budget-bar">
          <div class="budget-bar-label">
            <span>Weekly waste budget</span>
            <span>$${spent.toFixed(2)} / $${budget.toFixed(2)}</span>
          </div>
          <div class="budget-bar-track">
            <div class="budget-bar-fill ${over ? 'over' : 'under'}" style="width: ${pct}%"></div>
          </div>
          ${over ? '<div class="budget-over-warning">⚠️ Over budget!</div>' : ''}
        </div>
      `;
    }

    // Weekly total spending bar
    if (totalBudget) {
      const weekTotal = WW.getWeekTotalSummary();
      const spent = weekTotal.total;
      const pct = Math.min((spent / totalBudget) * 100, 100);
      const over = spent > totalBudget;
      html += `
        <div class="budget-bar">
          <div class="budget-bar-label">
            <span>Weekly total spending</span>
            <span>$${spent.toFixed(2)} / $${totalBudget.toFixed(2)}</span>
          </div>
          <div class="budget-bar-track">
            <div class="budget-bar-fill ${over ? 'total-over' : 'total-under'}" style="width: ${pct}%"></div>
          </div>
          ${over ? '<div class="budget-over-warning total-over-warning">⚠️ Over total budget!</div>' : ''}
        </div>
      `;
    }

    el.innerHTML = html;
  },

  renderList() {
    const summary = WW.getTodaySummary();
    const el = document.getElementById('today-list');

    // Main feed: only waste + indulgence
    const feedTxns = summary.transactions.filter(t => t.category === 'waste' || t.category === 'indulgence');
    // All spending tab
    const allTxns = summary.transactions;

    if (feedTxns.length === 0 && allTxns.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <p>No transactions today</p>
          <p class="empty-hint">Tap + to add one manually, or wait for a bank notification</p>
        </div>
      `;
      return;
    }

    const categoryEmoji = {
      waste: '🗑️',
      indulgence: '🎁',
      necessary: '✅',
      ignore: '🔕'
    };

    const renderTxnList = (txns) => {
      if (txns.length === 0) return '<div class="empty-state"><p>Nothing here</p></div>';
      let html = '<div class="txn-list">';
      txns.forEach(txn => {
        const time = new Date(txn.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const catClass = txn.category;
        const emoji = categoryEmoji[txn.category] || '';
        const subLabel = txn.subcategory ? `<span class="txn-subcategory">${Categorize.escapeHtml(txn.subcategory)}</span>` : '';

        html += `
          <div class="txn-item txn-${catClass}">
            <div class="txn-left">
              <span class="txn-emoji">${emoji}</span>
              <div class="txn-details">
                <div class="txn-merchant-name">${Categorize.escapeHtml(txn.merchant)}</div>
                ${subLabel}
              </div>
            </div>
            <div class="txn-right">
              <div class="txn-item-amount">$${txn.amount.toFixed(2)}</div>
              <div class="txn-time">${time}</div>
            </div>
          </div>
        `;
      });
      html += '</div>';
      return html;
    };

    el.innerHTML = `
      <div class="feed-tabs">
        <button class="feed-tab active" data-feed="flagged">Waste & Indulgence</button>
        <button class="feed-tab" data-feed="all">All Spending</button>
      </div>
      <div id="feed-flagged" class="feed-content">${renderTxnList(feedTxns)}</div>
      <div id="feed-all" class="feed-content hidden">${renderTxnList(allTxns)}</div>
    `;

    el.querySelectorAll('.feed-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        el.querySelectorAll('.feed-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(`feed-${tab.dataset.feed}`).classList.remove('hidden');
        // Show/hide necessary totals
        const showNecessary = tab.dataset.feed === 'all';
        document.querySelectorAll('.necessary-only').forEach(n => {
          n.classList.toggle('hidden', !showNecessary);
        });
      });
    });
  }
};
