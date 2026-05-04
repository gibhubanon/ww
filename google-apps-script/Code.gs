// Google Apps Script — Waste Watcher Backend
// Paste this into Extensions > Apps Script in your Google Sheet
// Then Deploy > New Deployment > Web App > "Anyone" can access

// Sheet names
const TRANSACTIONS_SHEET = 'Transactions';
const QUEUE_SHEET = 'Queue';
const SETTINGS_SHEET = 'Settings';

// ========== GMAIL SCANNER ==========
// This runs on a 5-minute timer. Set up via Triggers in Apps Script.
function scanGmailForPurchases() {
  // Search for bank purchase alert emails that are unread
  // CONFIGURE: Update the search query to match your bank's email sender and subject line
  var threads = GmailApp.search('from:YOUR_BANK_EMAIL subject:"YOUR_SUBJECT_LINE" is:unread', 0, 20);

  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j];
      if (!msg.isUnread()) continue;

      var body = msg.getPlainBody();

      // CONFIGURE: Update this regex to match your bank's email format
      // Example: "at [merchant], a pending authorization or purchase in the amount of $X.XX"
      var match = body.match(/at ([^,]+), a pending authorization or purchase in the amount of \$([0-9]+\.[0-9]{2})/);

      if (match) {
        var merchant = match[1].trim();
        var amount = match[2];

        // Check for duplicates — don't add if same merchant+amount in last 10 minutes
        if (!isDuplicateQueue(merchant, amount, 10)) {
          addToQueue(merchant, amount);
        }
      }

      // Mark as read so we don't process it again
      msg.markRead();
    }
  }
}

function isDuplicateQueue(merchant, amount, minutesWindow) {
  var queue = getQueue();
  var now = new Date().getTime();
  var window = minutesWindow * 60 * 1000;

  for (var i = 0; i < queue.length; i++) {
    var q = queue[i];
    var qTime = new Date(q.timestamp).getTime();
    var qMerchant = String(q.merchant || '').toLowerCase();
    var newMerchant = String(merchant || '').toLowerCase();
    if (qMerchant === newMerchant &&
        parseFloat(q.amount) === parseFloat(amount) &&
        (now - qTime) < window) {
      return true;
    }
  }
  return false;
}

// Handle GET requests (PWA reads data)
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getTransactions') {
    return jsonResponse(getTransactions());
  }
  if (action === 'getQueue') {
    return jsonResponse(getQueue());
  }
  if (action === 'getSettings') {
    return jsonResponse(getSettings());
  }
  if (action === 'getAll') {
    return jsonResponse({
      transactions: getTransactions(),
      queue: getQueue(),
      settings: getSettings()
    });
  }

  return jsonResponse({ error: 'Unknown action' });
}

// Handle POST requests (PWA writes data)
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;

  if (action === 'addToQueue') {
    if (data.raw) {
      var match = data.raw.match(/\$([0-9]+\.[0-9]{2}).*?at ([^.]+)\./);
      if (match) {
        return jsonResponse(addToQueue(match[2].trim(), match[1]));
      }
      return jsonResponse({ error: 'Could not parse SMS text' });
    }
    return jsonResponse(addToQueue(data.merchant, data.amount));
  }

  if (action === 'categorize') {
    return jsonResponse(categorizeTransaction(data));
  }
  if (action === 'removeFromQueue') {
    return jsonResponse(removeFromQueue(data.id));
  }
  if (action === 'addIgnoredMerchant') {
    return jsonResponse(addIgnoredMerchant(data.merchant));
  }
  if (action === 'removeIgnoredMerchant') {
    return jsonResponse(removeIgnoredMerchant(data.merchant));
  }
  if (action === 'saveSettings') {
    return jsonResponse(saveSettings(data.settings));
  }
  if (action === 'deleteTransaction') {
    return jsonResponse(deleteTransaction(data.id));
  }

  return jsonResponse({ error: 'Unknown action' });
}

// ========== QUEUE ==========
function addToQueue(merchant, amount) {
  const sheet = getOrCreateSheet(QUEUE_SHEET, ['id', 'merchant', 'amount', 'timestamp']);
  const id = Utilities.getUuid();
  sheet.appendRow([id, merchant.trim(), parseFloat(amount), new Date().toISOString()]);
  return { success: true, id: id };
}

function getQueue() {
  return sheetToObjects(QUEUE_SHEET);
}

function removeFromQueue(id) {
  const sheet = getSheet(QUEUE_SHEET);
  if (!sheet) return { success: true };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: true };
}

// ========== TRANSACTIONS ==========
function categorizeTransaction(data) {
  const sheet = getOrCreateSheet(TRANSACTIONS_SHEET,
    ['id', 'date', 'merchant', 'amount', 'category', 'subcategory']);
  const id = Utilities.getUuid();
  sheet.appendRow([
    id,
    new Date().toISOString(),
    data.merchant.trim(),
    parseFloat(data.amount),
    data.category,
    data.subcategory || ''
  ]);

  if (data.queueId) {
    removeFromQueue(data.queueId);
  }

  if (data.category === 'ignore') {
    addIgnoredMerchant(data.merchant.trim());
  }

  return { success: true, id: id };
}

function getTransactions() {
  return sheetToObjects(TRANSACTIONS_SHEET);
}

function deleteTransaction(id) {
  const sheet = getSheet(TRANSACTIONS_SHEET);
  if (!sheet) return { success: true };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: true };
}

// ========== SETTINGS ==========
function getSettings() {
  const sheet = getSheet(SETTINGS_SHEET);
  if (!sheet) return getDefaultSettings();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return getDefaultSettings();
  try {
    return JSON.parse(data[1][0]);
  } catch {
    return getDefaultSettings();
  }
}

function saveSettings(settings) {
  const sheet = getOrCreateSheet(SETTINGS_SHEET, ['data']);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1).setValue(JSON.stringify(settings));
  } else {
    sheet.appendRow([JSON.stringify(settings)]);
  }
  return { success: true };
}

function addIgnoredMerchant(merchant) {
  const settings = getSettings();
  const normalized = merchant.trim().toLowerCase();
  if (!settings.ignoredMerchants.some(m => m.toLowerCase() === normalized)) {
    settings.ignoredMerchants.push(merchant.trim());
    saveSettings(settings);
  }
  return { success: true };
}

function removeIgnoredMerchant(merchant) {
  const settings = getSettings();
  settings.ignoredMerchants = settings.ignoredMerchants.filter(
    m => m.toLowerCase() !== merchant.toLowerCase()
  );
  saveSettings(settings);
  return { success: true };
}

function getDefaultSettings() {
  return {
    ignoredMerchants: [],
    weeklyBudget: null,
    customTags: { necessary: [], indulgence: [], waste: [] },
    subcategoryFrequency: {}
  };
}

// ========== HELPERS ==========
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function sheetToObjects(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function testAddToQueue() {
  addToQueue('Test Merchant', '9.99');
}
