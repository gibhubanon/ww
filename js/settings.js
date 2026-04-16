// settings.js — Manage ignored merchants, budget, custom tags, export

const Settings = {
  init() {
    this.render();
  },

  render() {
    const el = document.getElementById('settings-content');
    const settings = WW.getSettings();

    let html = '';

    // Weekly waste budget
    html += `
      <div class="settings-section">
        <h3>Weekly Waste Budget</h3>
        <p class="setting-hint">Resets Monday at 3am</p>
        <div class="budget-setting">
          <input type="text" id="budget-input" placeholder="e.g. 100" inputmode="decimal" autocomplete="off"
            value="${settings.weeklyBudget || ''}">
          <button id="budget-save" class="btn-primary">Save</button>
          ${settings.weeklyBudget ? '<button id="budget-clear" class="btn-secondary">Clear</button>' : ''}
        </div>
      </div>
    `;

    // Weekly total spending budget
    html += `
      <div class="settings-section">
        <h3>Weekly Total Spending Budget</h3>
        <p class="setting-hint">All categories combined. Resets Monday at 3am</p>
        <div class="budget-setting">
          <input type="text" id="total-budget-input" placeholder="e.g. 500" inputmode="decimal" autocomplete="off"
            value="${settings.weeklyTotalBudget || ''}">
          <button id="total-budget-save" class="btn-primary">Save</button>
          ${settings.weeklyTotalBudget ? '<button id="total-budget-clear" class="btn-secondary">Clear</button>' : ''}
        </div>
      </div>
    `;

    // Always Ignored Merchants
    html += `
      <div class="settings-section">
        <h3>Always Ignored Merchants</h3>
        ${settings.ignoredMerchants.length === 0
          ? '<p class="empty-hint">No merchants ignored yet. When you categorize a purchase as "Necessary (Always Ignore)", the merchant will appear here.</p>'
          : '<div class="merchant-list">' + settings.ignoredMerchants.map(m => `
              <div class="merchant-item">
                <span>${Categorize.escapeHtml(m)}</span>
                <button class="remove-btn" data-merchant="${Categorize.escapeHtml(m)}">Remove</button>
              </div>
            `).join('') + '</div>'
        }
      </div>
    `;

    // Custom Tags
    ['necessary', 'indulgence', 'waste'].forEach(cat => {
      const tags = WW.getCustomTags(cat);
      if (tags.length > 0) {
        const catLabels = { necessary: 'Necessary', indulgence: 'Indulgence', waste: 'Waste' };
        html += `
          <div class="settings-section">
            <h3>Custom ${catLabels[cat]} Tags</h3>
            <div class="tag-list">
              ${tags.map(t => `
                <div class="tag-item">
                  <span>${Categorize.escapeHtml(t)}</span>
                  <button class="remove-btn" data-tag="${Categorize.escapeHtml(t)}" data-cat="${cat}">Remove</button>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    });

    // Google Sheets connection
    html += `
      <div class="settings-section">
        <h3>Google Sheets Connection</h3>
        <p class="setting-hint">Your Apps Script URL (stored locally, never shared)</p>
        <div class="budget-setting">
          <input type="text" id="api-url-input" value="${WW.API_URL || ''}" placeholder="https://script.google.com/..." autocomplete="off" style="font-size:12px;">
          <button id="api-url-save" class="btn-primary">Save</button>
        </div>
      </div>
    `;

    // Export / Import / Clear
    html += `
      <div class="settings-section">
        <h3>Data</h3>
        <div class="data-actions">
          <button id="export-btn" class="btn-secondary">Export Data (JSON)</button>
          <button id="clear-btn" class="btn-danger">Clear All Data</button>
        </div>
        <div id="txn-count" class="txn-count">
          ${WW.getAllTransactions().length} transactions stored
        </div>
      </div>
    `;

    el.innerHTML = html;
    this.attachEvents();
  },

  attachEvents() {
    // API URL save
    document.getElementById('api-url-save')?.addEventListener('click', () => {
      const url = document.getElementById('api-url-input').value.trim();
      if (url) {
        localStorage.setItem('ww_api_url', url);
        WW.API_URL = url;
        alert('Saved! Reloading...');
        location.reload();
      }
    });

    // Budget save
    document.getElementById('budget-save')?.addEventListener('click', () => {
      const val = document.getElementById('budget-input').value;
      WW.setWeeklyBudget(val);
      this.render();
      Widget.refresh();
    });

    // Budget clear
    document.getElementById('budget-clear')?.addEventListener('click', () => {
      WW.setWeeklyBudget(null);
      this.render();
      Widget.refresh();
    });

    // Total budget save
    document.getElementById('total-budget-save')?.addEventListener('click', () => {
      const val = document.getElementById('total-budget-input').value;
      WW.setWeeklyTotalBudget(val);
      this.render();
      Widget.refresh();
    });

    // Total budget clear
    document.getElementById('total-budget-clear')?.addEventListener('click', () => {
      WW.setWeeklyTotalBudget(null);
      this.render();
      Widget.refresh();
    });

    // Remove ignored merchant
    document.querySelectorAll('.remove-btn[data-merchant]').forEach(btn => {
      btn.addEventListener('click', () => {
        WW.removeIgnoredMerchant(btn.dataset.merchant);
        this.render();
      });
    });

    // Remove custom tag
    document.querySelectorAll('.remove-btn[data-tag]').forEach(btn => {
      btn.addEventListener('click', () => {
        WW.removeCustomTag(btn.dataset.cat, btn.dataset.tag);
        this.render();
      });
    });

    // Export
    document.getElementById('export-btn')?.addEventListener('click', () => {
      const data = WW.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waste-watcher-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Clear all data
    document.getElementById('clear-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure? This will delete ALL transactions and settings. This cannot be undone.')) {
        if (confirm('Really? This is permanent.')) {
          localStorage.removeItem(WW.TRANSACTIONS_KEY);
          localStorage.removeItem(WW.SETTINGS_KEY);
          this.render();
          Widget.refresh();
        }
      }
    });
  }
};
