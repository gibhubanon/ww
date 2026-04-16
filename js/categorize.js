// categorize.js — Categorization flow UI

const Categorize = {
  currentMerchant: '',
  currentAmount: 0,
  currentCategory: null,
  currentQueueId: null,
  lastTransaction: null,
  undoTimeout: null,

  init() {
    this.setupButtons();
  },

  // Open categorize view with merchant + amount (manual add)
  open(merchant, amount) {
    this.currentMerchant = merchant;
    this.currentAmount = parseFloat(amount);
    this.currentCategory = null;
    this.currentQueueId = null;

    // Check if merchant is in "Always Ignore" list
    if (WW.isIgnoredMerchant(merchant)) {
      const txn = WW.addTransaction(merchant, amount, 'ignore', null);
      this.lastTransaction = txn;
      this.showUndoToast(`Auto-ignored: ${merchant} $${this.currentAmount.toFixed(2)}`);
      Widget.refresh();
      return;
    }

    this.showCategorizeView();
  },

  // Open categorize view from queue
  openFromQueue(queueItem) {
    this.currentMerchant = queueItem.merchant;
    this.currentAmount = queueItem.amount;
    this.currentCategory = null;
    this.currentQueueId = queueItem.id;

    this.showCategorizeView();
  },

  showCategorizeView() {
    App.showView('categorize');
    this.renderInfo();
    this.renderMainButtons();
    document.getElementById('subcategory-picker').classList.add('hidden');
    document.getElementById('categorize-buttons').classList.remove('hidden');
  },

  renderInfo() {
    const info = document.getElementById('categorize-info');
    const queueCount = WW.getQueueCount();
    const queueLabel = queueCount > 1 ? `<div class="queue-counter">${queueCount} purchases to categorize</div>` : '';
    info.innerHTML = `
      <div class="txn-preview">
        ${queueLabel}
        <div class="txn-merchant">${this.escapeHtml(this.currentMerchant)}</div>
        <div class="txn-amount">$${this.currentAmount.toFixed(2)}</div>
      </div>
    `;
  },

  setupButtons() {
    // Main category buttons are rendered dynamically
  },

  renderMainButtons() {
    const container = document.getElementById('categorize-buttons');
    container.innerHTML = `
      <button class="cat-btn cat-ignore" data-category="ignore">
        <span class="cat-emoji">🔕</span>
        <span class="cat-label">Necessary</span>
        <span class="cat-sub">(Always Ignore)</span>
      </button>
      <button class="cat-btn cat-necessary" data-category="necessary">
        <span class="cat-emoji">✅</span>
        <span class="cat-label">Necessary</span>
        <span class="cat-sub">(Variable)</span>
      </button>
      <button class="cat-btn cat-indulgence" data-category="indulgence">
        <span class="cat-emoji">🎁</span>
        <span class="cat-label">Indulgence</span>
        <span class="cat-sub"></span>
      </button>
      <button class="cat-btn cat-waste" data-category="waste">
        <span class="cat-emoji">🗑️</span>
        <span class="cat-label">Waste</span>
        <span class="cat-sub"></span>
      </button>
    `;

    container.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        if (cat === 'ignore') {
          // One tap — save immediately
          this.saveTransaction('ignore', null);
        } else {
          // Show subcategory picker
          this.currentCategory = cat;
          this.renderSubcategoryPicker(cat);
        }
      });
    });
  },

  renderSubcategoryPicker(category) {
    const picker = document.getElementById('subcategory-picker');
    const subcats = WW.getSubcategoriesSorted(category);

    const categoryLabels = {
      necessary: 'Necessary (Variable)',
      indulgence: 'Indulgence',
      waste: 'Waste'
    };

    let html = `
      <div class="subcat-header">
        <button class="subcat-back">&larr; Back</button>
        <span>${categoryLabels[category]}</span>
      </div>
      <div class="subcat-list">
    `;

    subcats.forEach(sub => {
      html += `<button class="subcat-btn" data-sub="${this.escapeHtml(sub)}">${this.escapeHtml(sub)}</button>`;
    });

    html += `
        <button class="subcat-btn subcat-other">+ Other</button>
      </div>
      <div class="subcat-custom hidden">
        <input type="text" id="custom-tag-input" placeholder="Enter custom tag..." autocomplete="off">
        <button id="custom-tag-save" class="btn-primary">Save</button>
      </div>
    `;

    picker.innerHTML = html;
    picker.classList.remove('hidden');
    document.getElementById('categorize-buttons').classList.add('hidden');

    // Back button
    picker.querySelector('.subcat-back').addEventListener('click', () => {
      picker.classList.add('hidden');
      document.getElementById('categorize-buttons').classList.remove('hidden');
    });

    // Subcategory buttons
    picker.querySelectorAll('.subcat-btn:not(.subcat-other)').forEach(btn => {
      btn.addEventListener('click', () => {
        this.saveTransaction(category, btn.dataset.sub);
      });
    });

    // Other button
    picker.querySelector('.subcat-other').addEventListener('click', () => {
      picker.querySelector('.subcat-custom').classList.remove('hidden');
      picker.querySelector('#custom-tag-input').focus();
    });

    // Custom tag save
    const saveCustom = () => {
      const input = picker.querySelector('#custom-tag-input');
      const tag = input.value.trim();
      if (tag) {
        WW.addCustomTag(category, tag);
        this.saveTransaction(category, tag);
      }
    };

    picker.querySelector('#custom-tag-save').addEventListener('click', saveCustom);
    const customInput = picker.querySelector('#custom-tag-input');
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveCustom();
    });
  },

  saveTransaction(category, subcategory) {
    const txn = WW.addTransaction(this.currentMerchant, this.currentAmount, category, subcategory, this.currentQueueId);
    this.lastTransaction = txn;

    const catLabels = { ignore: 'Always Ignore', necessary: 'Necessary', indulgence: 'Indulgence', waste: 'Waste' };
    const label = catLabels[category];
    const subLabel = subcategory ? ` → ${subcategory}` : '';
    this.showUndoToast(`${label}${subLabel}: $${this.currentAmount.toFixed(2)}`);

    // If this came from the queue, notify the queue system
    if (this.currentQueueId) {
      App.onQueueItemCategorized(this.currentQueueId);
      this.currentQueueId = null;
      // Don't go to today view yet if more items in queue
      if (WW.getQueueCount() > 0) {
        Widget.refresh();
        return;
      }
    }

    // Go back to today view
    App.showView('today');
    Widget.refresh();
  },

  showUndoToast(message) {
    const toast = document.getElementById('undo-toast');
    const text = document.getElementById('undo-text');
    text.textContent = message;
    toast.classList.remove('hidden');

    // Clear previous timeout
    if (this.undoTimeout) clearTimeout(this.undoTimeout);

    // Auto-hide after 5 seconds
    this.undoTimeout = setTimeout(() => {
      toast.classList.add('hidden');
      this.lastTransaction = null;
    }, 5000);

    // Undo button handler (re-attach each time)
    const undoBtn = document.getElementById('undo-btn');
    const newBtn = undoBtn.cloneNode(true);
    undoBtn.parentNode.replaceChild(newBtn, undoBtn);
    newBtn.addEventListener('click', () => {
      if (this.lastTransaction) {
        // If it was "ignore", also remove from ignored merchants
        if (this.lastTransaction.category === 'ignore') {
          WW.removeIgnoredMerchant(this.lastTransaction.merchant);
        }
        WW.deleteTransaction(this.lastTransaction.id);
        this.lastTransaction = null;
        toast.classList.add('hidden');
        clearTimeout(this.undoTimeout);
        Widget.refresh();
      }
    });
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
