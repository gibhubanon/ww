// app.js — Router, view management, initialization

const App = {
  currentView: 'today',

  async init() {
    // Check if API URL is configured
    if (!WW.API_URL) {
      this.showSetup();
      return;
    }

    // Load data from Google Sheets (or local cache)
    await WW.load();

    // Check for URL params (from iOS Shortcut) — adds to queue
    this.checkUrlParams();

    // Initialize modules
    Categorize.init();
    Widget.init();
    Analytics.init();
    Settings.init();

    // Process queue if there are pending items
    this.processQueue();

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showView(btn.dataset.view);
      });
    });

    // Back buttons
    document.querySelectorAll('.back-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showView(btn.dataset.view);
      });
    });

    // Manual add button
    document.getElementById('btn-add-manual').addEventListener('click', () => {
      this.showModal('modal-add');
      document.getElementById('add-merchant').value = '';
      document.getElementById('add-amount').value = '';
      document.getElementById('add-merchant').focus();
    });

    // Manual add modal
    document.getElementById('add-cancel').addEventListener('click', () => {
      this.hideModal('modal-add');
    });

    document.getElementById('add-submit').addEventListener('click', () => {
      const merchant = document.getElementById('add-merchant').value.trim();
      const amount = document.getElementById('add-amount').value;
      if (merchant && amount && parseFloat(amount) > 0) {
        this.hideModal('modal-add');
        Categorize.open(merchant, amount);
      }
    });

    // Enter key in amount field
    document.getElementById('add-amount').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('add-submit').click();
      }
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.hideModal(modal.id);
      });
    });
  },

  showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');

    this.currentView = viewName;

    // Refresh view data
    if (viewName === 'today') Widget.refresh();
    if (viewName === 'analytics') Analytics.render();
    if (viewName === 'settings') Settings.render();
  },

  showSetup() {
    document.getElementById('app').innerHTML = `
      <div class="setup-screen">
        <h1>Waste Watcher</h1>
        <p>Paste your Google Apps Script URL to connect your spreadsheet:</p>
        <input type="text" id="setup-url" placeholder="https://script.google.com/macros/s/..." autocomplete="off">
        <button id="setup-save" class="btn-primary">Connect</button>
      </div>
    `;
    document.getElementById('setup-save').addEventListener('click', () => {
      const url = document.getElementById('setup-url').value.trim();
      if (url && url.startsWith('https://script.google.com/')) {
        localStorage.setItem('ww_api_url', url);
        WW.API_URL = url;
        location.reload();
      }
    });
  },

  showModal(id) {
    document.getElementById(id).classList.remove('hidden');
  },

  hideModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  // Check URL params from iOS Shortcut — adds to queue
  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);

    // Option 1: Pre-parsed merchant + amount
    const merchant = params.get('merchant');
    const amount = params.get('amount');

    if (merchant && amount) {
      window.history.replaceState({}, '', window.location.pathname);
      WW.addToQueue(decodeURIComponent(merchant), amount);
      return;
    }

    // Option 2: Raw bank SMS/email text — parse it here
    const raw = params.get('raw');
    if (raw) {
      const decoded = decodeURIComponent(raw);
      // Parses common bank alert formats: "at [merchant]...amount of $X.XX" or "for $X.XX at [merchant]"
      const match = decoded.match(/\$([0-9]+\.[0-9]{2}).*?at ([^.]+)\./);
      if (match) {
        const parsedAmount = match[1];
        const parsedMerchant = match[2].trim();
        window.history.replaceState({}, '', window.location.pathname);
        WW.addToQueue(parsedMerchant, parsedAmount);
      }
    }
  },

  // Process the pending queue — show next item to categorize
  processQueue() {
    const next = WW.getNextInQueue();
    if (!next) {
      this.updateQueueBadge();
      return;
    }

    this.updateQueueBadge();

    // Defensive: validate queue item — skip + remove if malformed
    const merchant = String(next.merchant || '').trim();
    const amount = parseFloat(next.amount);
    if (!merchant || isNaN(amount) || amount <= 0) {
      console.warn('Skipping malformed queue item', next);
      WW.removeFromQueue(next.id);
      setTimeout(() => this.processQueue(), 200);
      return;
    }
    // Normalize fields back to the queue object before passing on
    next.merchant = merchant;
    next.amount = amount;

    // If merchant is auto-ignored, handle it silently and move to next
    if (WW.isIgnoredMerchant(merchant)) {
      WW.addTransaction(merchant, amount, 'ignore', null);
      WW.removeFromQueue(next.id);
      Categorize.showUndoToast(`Auto-ignored: ${merchant} $${amount.toFixed(2)}`);
      Widget.refresh();
      // Process next in queue after brief delay
      setTimeout(() => this.processQueue(), 500);
      return;
    }

    // Open categorize for this item
    // Store the queue item id so we can remove it after categorization
    Categorize.openFromQueue(next);
  },

  // Called by Categorize after a queued item is categorized
  onQueueItemCategorized(queueId) {
    WW.removeFromQueue(queueId);
    this.updateQueueBadge();

    // Check if more items in queue
    const remaining = WW.getQueueCount();
    if (remaining > 0) {
      // Brief delay then show next
      setTimeout(() => this.processQueue(), 300);
    }
  },

  updateQueueBadge() {
    const count = WW.getQueueCount();
    let badge = document.getElementById('queue-badge');

    if (count === 0) {
      if (badge) badge.classList.add('hidden');
      return;
    }

    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'queue-badge';
      document.body.appendChild(badge);
    }

    badge.textContent = `${count} pending`;
    badge.classList.remove('hidden');
    badge.onclick = () => this.processQueue();
  }
};

// Unregister any old service workers to prevent caching issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
