(function () {
    'use strict';

    // Inject JetBrains Mono Font with proper extension URL for cross-browser support
    const fontStyle = document.createElement('style');
    fontStyle.textContent = `
    @font-face {
        font-family: 'JetBrains Mono';
        src: url('${chrome.runtime.getURL('vendor/fonts/JetBrainsMono-Regular.woff2')}') format('woff2');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
    }
    @font-face {
        font-family: 'JetBrains Mono';
        src: url('${chrome.runtime.getURL('vendor/fonts/JetBrainsMono-Bold.woff2')}') format('woff2');
        font-weight: 700;
        font-style: normal;
        font-display: swap;
    }
    `;
    document.head.appendChild(fontStyle);

    // --- Configuration & Utilities ---

    const CONFIG = {
        filename: 'solution', // Generic filename
        betaUrlPart: '/beta/problems/',
        oldUrlPart: '/student/question/',
        oldSiteBase: '/student/'
    };

    let lastProblemId = null; // Track for SPA navigation detection

    function isBetaSite() {
        return window.location.href.includes(CONFIG.betaUrlPart);
    }

    function waitForElement(selector, callback, timeout = 10000) {
        const existing = document.querySelector(selector);
        if (existing) { callback(existing); return; }

        const timer = setTimeout(() => { observer.disconnect(); }, timeout);
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                clearTimeout(timer);
                callback(element);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function showNotification(message, type = 'info') {
        // Calculate offset from the bottom of the last visible notification
        const existing = document.querySelectorAll('.notification-toast:not(.fade-out)');
        let offset = 20;
        existing.forEach(el => {
            const bottom = el.offsetTop + el.offsetHeight;
            if (bottom + 10 > offset) offset = bottom + 10;
        });

        const notif = document.createElement('div');
        notif.className = `notification-toast ${type}`;
        notif.textContent = message;
        notif.style.top = offset + 'px';
        document.body.appendChild(notif);

        setTimeout(() => {
            notif.classList.add('fade-out');
            notif.addEventListener('animationend', () => notif.remove());
        }, 2500);
    }

    const EXT_MAP = [
        [['py3', 'python', 'py'], '.py'],
        [['java8', 'java'], '.java'],
        [['monocs', 'c#', 'csharp', 'dotnet', 'mono'], '.cs'],
        [['cpp14', 'cpp17', 'cpp20', 'c++', 'cpp', 'g++'], '.cpp'],
        [['c ', 'gcc', "'c'", '"c"', 'ansi c'], '.c'],
        [['js', 'javascript'], '.js'],
        [['go', 'golang'], '.go'],
    ];

    function getExtension(compilerText) {
        if (!compilerText) return '.c';
        const lang = compilerText.toLowerCase();
        for (const [keywords, ext] of EXT_MAP) {
            if (keywords.some(k => lang.includes(k))) {
                console.log('[cPTIT++] getExtension:', compilerText, '→', ext);
                return ext;
            }
        }
        console.log('[cPTIT++] getExtension: no match for', compilerText, '→ .c (default)');
        return '.c';
    }

    function getProblemId() {
        const parts = window.location.pathname.split('/');
        return parts[parts.length - 1] || 'solution';
    }

    function escapeHtml(text) {
        if (!text) return text;
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Shared DOM Helpers (DRY) ---

    function getTitleElement() {
        return document.querySelector('.submit__nav span a.link--red')
            || document.querySelector('.body-header h2');
    }

    function getCleanTitle(titleElem, id) {
        if (!titleElem) return 'Problem';
        const clone = titleElem.cloneNode(true);
        clone.querySelectorAll('.copy-title-btn, button').forEach(b => b.remove());
        let title = clone.textContent.trim().replace('Copy tên file', '').trim();
        if (id && title.includes(id)) {
            title = title.replace(id, '').replace(/^[\s\-\:]+/, '');
        }
        return title;
    }

    function formatTimeLimit(raw) {
        const num = parseFloat(raw);
        if (isNaN(num)) return '1.0 s';
        return (Number.isInteger(num) ? num + '.0' : String(num)) + ' s';
    }

    function getLimits() {
        if (isBetaSite()) {
            const problemContainer = document.querySelector('.problem-container');
            if (!problemContainer) return { timeLimit: '1.0 s', memoryLimitMb: '256 MB' };
            const text = problemContainer.textContent;
            const timeMatch = text.match(/Giới hạn thời gian:\s*([\d.]+)s/);
            const memoryMatch = text.match(/Giới hạn bộ nhớ:\s*(\d+)Kb/);
            const timeLimit = timeMatch ? formatTimeLimit(timeMatch[1]) : '1.0 s';
            // Site uses kilobits (Kb) — 200000 Kb / 8000 = 25 MB
            const memoryLimitKb = memoryMatch ? parseInt(memoryMatch[1]) : 204800;
            return { timeLimit, memoryLimitMb: Math.round(memoryLimitKb / 8000) + ' MB' };
        } else {
            const timeElem = document.querySelector('.submit__req p:nth-child(1) span');
            const memoryElem = document.querySelector('.submit__req p:nth-child(2) span');
            let timeLimit = '1.0 s';
            let memoryLimitMb = '256 MB';
            if (timeElem) {
                timeLimit = formatTimeLimit(timeElem.textContent.trim());
            }
            if (memoryElem) {
                const memoryKb = parseInt(memoryElem.textContent.trim());
                if (!isNaN(memoryKb)) {
                    // Site uses kilobits (Kb) — divide by 8000 to get MB
                    memoryLimitMb = Math.round(memoryKb / 8000) + ' MB';
                }
            }
            return { timeLimit, memoryLimitMb };
        }
    }

    function getSampleTable() {
        return document.querySelector('.MsoTableGrid')
            || document.querySelector('.Table')
            || document.querySelector('.TableGrid1')
            || document.querySelector('.TableGrid2')
            || document.querySelector('.TableGrid3')
            || document.querySelector('.problem-container table')
            || document.querySelector('.submit__des table');
    }

    function getCompilerTextFromDOM() {
        // Old site
        const compilerOld = document.getElementById('compiler');
        if (compilerOld) {
            const text = compilerOld.options[compilerOld.selectedIndex]?.text || '';
            console.log('[cPTIT++] getCompilerTextFromDOM (old site):', text, '| value:', compilerOld.value);
            return text;
        }
        // Beta site
        const compilerBeta = document.querySelector('.compiler-container .ant-select-selection-item');
        if (compilerBeta) {
            const text = compilerBeta.title || compilerBeta.textContent || '';
            console.log('[cPTIT++] getCompilerTextFromDOM (beta site):', text);
            return text;
        }
        console.log('[cPTIT++] getCompilerTextFromDOM: no compiler found');
        return '';
    }

    let SETTINGS = {
        nameFormat: '',
        ccNameFormat: '[id] - [ten]',
        customPorts: '',
        editorTheme: 'dark'
    };

    // Load settings from chrome.storage and keep them synced
    chrome.storage.local.get(SETTINGS, (items) => {
        SETTINGS = { ...SETTINGS, ...items };
        // Update CC data title in-place (don't remove — CC may be mid-read)
        refreshCCTitle();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            for (const key in changes) {
                if (key in SETTINGS) {
                    SETTINGS[key] = changes[key].newValue;
                }
            }
            // If naming format changed, refresh the injected title in-place
            if ('ccNameFormat' in changes) {
                refreshCCTitle();
            }
        }
    });

    function refreshCCTitle() {
        const container = document.getElementById('competitive-companion-data');
        if (!container) return;
        const titleDiv = container.querySelector('.title');
        if (!titleDiv) return;
        const id = getProblemId();
        const titleElem = getTitleElement();
        if (!titleElem) return;
        const rawTitle = getCleanTitle(titleElem, id);
        titleDiv.textContent = generateCCTitle(id, rawTitle);
    }


    // --- Helper UI Functions --- //

    function injectCSS() {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            /* Added toast styles */
            .cptit-toast {
                visibility: hidden;
                min-width: 250px;
                background-color: #333;
                color: #fff;
                text-align: center;
                border-radius: 6px;
                padding: 12px 16px;
                position: fixed;
                z-index: 99999;
                left: 50%;
                bottom: 30px;
                transform: translateX(-50%);
                font-family: Arial, sans-serif;
                font-size: 14px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                opacity: 0;
                transition: opacity 0.3s, visibility 0.3s, bottom 0.3s;
            }
            .cptit-toast.show {
                visibility: visible;
                opacity: 1;
                bottom: 50px;
            }
        `;
        document.head.appendChild(style);
    }

    function showToast(message) {
        let toast = document.getElementById('cptit-toast-msg');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cptit-toast-msg';
            toast.className = 'cptit-toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 1500);
    }


    // --- Core Logic --- //

    function getSettings() {
        return SETTINGS;
    }

    function saveSettings(settings) {
        Object.assign(SETTINGS, settings);
        chrome.storage.local.set(settings);
    }

    function removeVietnameseTones(str) {
        return str.normalize('NFD') // Decompose combined characters
            .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    function sanitizeFilename(name) {
        const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
        return name.replace(invalidChars, '_').trim();
    }

    function toCamelCase(str) {
        return str.toLowerCase()
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }

    function generateFilename(id, title) {
        const settings = getSettings();
        let format = settings.nameFormat;
        if (!format || !format.trim()) format = '[id]_[ten_lien]';

        if (id && title.includes(id)) {
            title = title.replace(id, '').replace(/^[\s\-\:]+/, '');
        }

        const vars = {
            '[id]': id,
            '[name]': title,
            '[ten]': title,
            '[name_ascii]': removeVietnameseTones(title),
            '[ten_kd]': removeVietnameseTones(title),
            '[name_ascii_underscore]': removeVietnameseTones(title).replace(/\s+/g, '_'),
            '[ten_gach]': removeVietnameseTones(title).replace(/\s+/g, '_'),
            '[name_camel]': toCamelCase(removeVietnameseTones(title)),
            '[ten_lien]': toCamelCase(removeVietnameseTones(title))
        };

        let result = format;
        for (const [key, val] of Object.entries(vars)) {
            result = result.split(key).join(val);
        }

        return sanitizeFilename(result);
    }

    function generateCCTitle(id, title) {
        const settings = getSettings();
        let format = settings.ccNameFormat;
        if (!format || !format.trim()) format = '[id] - [ten]';

        if (id && title.includes(id)) {
            title = title.replace(id, '').replace(/^[\s\-\:]+/, '');
        }

        const vars = {
            '[id]': id,
            '[ten]': title,
            '[ten_kd]': removeVietnameseTones(title),
            '[ten_gach]': removeVietnameseTones(title).replace(/\s+/g, '_'),
            '[ten_lien]': toCamelCase(removeVietnameseTones(title))
        };

        let result = format;
        for (const [key, val] of Object.entries(vars)) {
            result = result.split(key).join(val);
        }

        return result;
    }


    // --- END OF CODE EDITOR ---

    // --- PROBLEM STATUS ICONS ---

    function getProblemStatus() {
        let status = 'NONE';

        if (isBetaSite()) {
            const historyContainer = document.querySelector('.card-content');
            if (historyContainer && historyContainer.textContent.includes('Lịch sử nộp bài:')) {
                const historyElements = historyContainer.querySelectorAll('div > div > a > span');
                if (historyElements.length > 0) {
                    status = 'FAIL'; // Default to FAIL if there's history
                    for (let el of historyElements) {
                        if (el.textContent.trim() === 'AC') {
                            status = 'AC';
                            break;
                        }
                    }
                }
            }
        } else {
            // Original site typically has a table of submissions further down the page
            const tables = document.querySelectorAll('table');
            let historyTable = null;
            for (let table of tables) {
                if (table.textContent.includes('Lịch sử nộp bài') || table.textContent.includes('Kết quả nộp bài cũ')) {
                    historyTable = table;
                    break;
                } else if (table.querySelector('th') && table.querySelector('th').textContent.includes('Trạng thái')) {
                    // Sometime original tables might just have typical columns like Submit ID, Date, Name, Status, Runtime, Memory, Language
                    historyTable = table;
                    break; // Best effort guess it's the history table if it contains a status column
                }
            }

            // Alternative explicit check on original site since the problem page itself might have them rendered directly in the standard problem tables
            const trs = document.querySelectorAll('.table-responsive tbody tr');
            if (trs.length > 0) {
                let hasHistory = false;
                for (let tr of trs) {
                    const statusCell = tr.querySelector('td.text-center a span, td[id^="status_"] span, td span[style*="color"]');
                    if (statusCell) {
                        hasHistory = true;
                        if (statusCell.textContent.trim() === 'AC') {
                            status = 'AC';
                            break;
                        }
                    }
                }
                if (hasHistory && status === 'NONE') {
                    status = 'FAIL';
                }
            }
        }

        return status;
    }

    function injectStatusIcon() {
        const titleElem = getTitleElement();
        if (!titleElem || titleElem.querySelector('.problem-status-icon')) return;

        const status = getProblemStatus();

        if (status !== 'NONE') {
            const icon = document.createElement('i');
            icon.className = status === 'AC' ? 'fa fa-check-circle problem-status-icon' : 'fa fa-frown-o problem-status-icon';
            icon.style.marginRight = '8px';
            icon.style.color = status === 'AC' ? '#19be6b' : '#ed4014'; // Match origin/beta exact green and red colors
            icon.style.fontSize = '24px'; // Match the size of the SVGs
            icon.style.verticalAlign = 'middle';
            icon.style.display = 'inline-flex';
            icon.style.alignItems = 'center';

            titleElem.prepend(icon);
        }
    }

    // --- VIEW AS PDF FEATURE ---
    // --- Core Logic ---

    async function handlePasteAndSubmit(fileInput, submitAction, getCompilerText) {
        try {
            const text = await navigator.clipboard.readText();
            if (!text.trim()) {
                showNotification('Clipboard trống!', 'warning');
                return;
            }

            const ext = getExtension(getCompilerText());
            const blob = new Blob([text], { type: 'text/plain' });

            const id = getProblemId();
            const title = getCleanTitle(getTitleElement(), id);
            const filename = generateFilename(id, title);
            const file = new File([blob], `${filename}${ext}`, { type: 'text/plain' });

            if (isBetaSite()) {
                const removeBtns = document.querySelectorAll('.ant-upload-list-item-actions button[title="Remove file"], .ant-upload-list-item .anticon-delete');
                removeBtns.forEach(btn => {
                    const el = btn.closest('button') || btn;
                    if (el) el.click();
                });
            }

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            showNotification(`Đang nộp bài: ${filename}${ext}`, 'success');

            setTimeout(() => {
                submitAction();
            }, 500);

        } catch (err) {
            console.error(err);
            showNotification('Không thể truy cập clipboard', 'error');
        }
    }

    function openSettings() {
        // Reuse existing modal if present
        let overlay = document.getElementById('settings-overlay');
        let modal = document.getElementById('settings-modal');

        if (overlay && modal) {
            overlay.style.display = 'block';
            modal.style.display = 'block';
            return;
        }

        overlay = document.createElement('div');
        overlay.id = 'settings-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.4); z-index: 99999; backdrop-filter: blur(2px);
        `;

        modal = document.createElement('div');
        modal.id = 'settings-modal';
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; border-radius: 12px; z-index: 100000;
            box-shadow: 0 10px 40px rgba(0,0,0,0.25); overflow: hidden;
            width: 440px; height: 680px;
        `;

        const iframe = document.createElement('iframe');
        try {
            iframe.src = chrome.runtime.getURL('popup/popup.html');
        } catch (e) {
            // Extension was reloaded — context is dead, prompt user to refresh the page
            showNotification('Extension đã được cập nhật. Hãy tải lại trang (F5) để tiếp tục.', 'warning');
            return;
        }
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        modal.appendChild(iframe);

        const close = () => {
            overlay.style.display = 'none';
            modal.style.display = 'none';
        };

        overlay.onclick = close;
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.style.display !== 'none') close();
        });

        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    }

    // --- Build Competitive Companion Payload ---

    function parseSampleTests() {
        const tests = [];
        const table = getSampleTable();
        if (!table) return tests;

        const rows = table.querySelectorAll('tr');
        let startIndex = 0;
        if (rows.length > 0) {
            const headerText = rows[0].textContent.toLowerCase();
            if (headerText.includes('input') || headerText.includes('output')) {
                startIndex = 1;
            }
        }

        const cleanCell = (cell) => {
            // Clone to avoid mutating the actual DOM
            const clone = cell.cloneNode(true);
            // Remove all buttons (e.g. "Copy" buttons)
            clone.querySelectorAll('button, .copy-btn, [class*="copy"]').forEach(el => el.remove());
            return clone.innerText || clone.textContent || '';
        };

        for (let i = startIndex; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length >= 2) {
                let input = cleanCell(cells[0]).trim();
                let output = cleanCell(cells[1]).trim();
                // Normalize lines
                input = input.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
                output = output.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
                // Also strip any trailing "Copy" word if still present
                input = input.replace(/\bCopy\b\n?/g, '').trim();
                output = output.replace(/\bCopy\b\n?/g, '').trim();
                tests.push({ input: input + '\n', output: output + '\n' });
            }
        }
        return tests;
    }

    function buildCCPayload() {
        const id = getProblemId();
        const titleElem = getTitleElement();
        if (!titleElem) return null;

        const rawTitle = getCleanTitle(titleElem, id);
        const name = generateCCTitle(id, rawTitle);
        const { timeLimit, memoryLimitMb } = getLimits();

        // Parse timeLimit string like "1.0 s" → milliseconds
        const timeLimitMs = Math.round(parseFloat(timeLimit) * 1000) || 1000;
        // "Kb" on this site means kilobits — 200000 Kb / 8000 = 25 MB
        const memRaw = memoryLimitMb || '';
        let memoryLimitNum;
        if (/kb/i.test(memRaw)) {
            memoryLimitNum = Math.round(parseInt(memRaw) / 8000) || 256;
        } else {
            memoryLimitNum = parseInt(memRaw) || 256;
        }

        const tests = parseSampleTests();

        console.log('[cPTIT++] buildCCPayload:', { id, rawTitle, name, timeLimit, memoryLimitMb, tests });

        return {
            name,
            group: 'CodePTIT',
            url: window.location.href,
            interactive: false,
            memoryLimit: memoryLimitNum,
            timeLimit: timeLimitMs,
            tests,
            testType: 'single',
            input: { type: 'stdin' },
            output: { type: 'stdout' }
        };
    }

    async function sendToIDE() {
        const payload = buildCCPayload();
        if (!payload) {
            showNotification('Không tìm thấy dữ liệu bài tập', 'error');
            return;
        }

        const customStr = getSettings().customPorts || '';
        const customPorts = customStr.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0);

        console.log('[cPTIT++] sendToIDE — payload:', JSON.stringify(payload, null, 2));
        console.log('[cPTIT++] sendToIDE — customPorts:', customPorts);

        try {
            const result = await chrome.runtime.sendMessage({
                action: 'sendToIDE',
                payload,
                customPorts
            });

            console.log('[cPTIT++] sendToIDE — result:', result);

            if (result && result.succeeded.length > 0) {
                showNotification(`Đã gửi đề bài (port ${result.succeeded.join(', ')})`, 'success');
            } else {
                showNotification('Không có IDE nào đang lắng nghe. Hãy mở IDE trước.', 'warning');
            }
        } catch (err) {
            console.error('[cPTIT++] sendToIDE — error:', err);
            showNotification('Lỗi gửi: ' + err.message, 'error');
        }
    }

    // --- Title Buttons ---

    function viewAsPDF() {
        const id = getProblemId();
        const titleElem = getTitleElement();
        if (!titleElem) return;

        let rawTitle = getCleanTitle(titleElem, id);
        // Sometimes rawTitle might include the ID if the parsing isn't perfect, let's clean it just in case
        if (id && rawTitle.startsWith(id)) {
            rawTitle = rawTitle.substring(id.length).replace(/^[\s\-\:]+/, '');
        }

        const { timeLimit, memoryLimitMb } = getLimits();

        let contentClone;
        if (isBetaSite()) {
            const container = document.querySelector('.problem-container');
            if (container) contentClone = container.cloneNode(true);
        } else {
            const submitDes = document.querySelector('.submit__des');
            if (submitDes) contentClone = submitDes.cloneNode(true);
        }

        if (!contentClone) {
            showNotification('Không tìm thấy nội dung bài toán', 'error');
            return;
        }

        // Clean up buttons in the clone
        contentClone.querySelectorAll('button, .copy-btn, .copy-title-btn, .send-ide-btn, .view-pdf-btn, [class*="copy"]').forEach(el => el.remove());

        // Clean up duplicate limits inherently inside Beta's problem-container
        contentClone.querySelectorAll('p, div, span').forEach(el => {
            if (el.children.length === 0) {
                const text = el.textContent.trim();
                if (text.startsWith('Giới hạn thời gian:') || text.startsWith('Giới hạn bộ nhớ:')) {
                    el.remove();
                }
            }
        });

        // Create an iframe for printing
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';

        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();

        // Copy style tag rules from parent to preserve MathJax and other inline scripts
        // Exclude <link rel="stylesheet"> to avoid inheriting broken Bootstrap/framework styles that ruin print logic on original
        let styleHTML = '';
        document.querySelectorAll('style').forEach(node => {
            styleHTML += node.outerHTML;
        });

        // Add custom print styles
        styleHTML += `
            <style>
                @media print {
                    @page { 
                        size: A4; 
                        margin: 20mm; 
                    }
                    body { 
                        background: #fff !important; 
                        color: #000 !important; 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
                        font-size: 16px !important; 
                    }
                    * { 
                        background: transparent !important; 
                        color: #000 !important; 
                        box-shadow: none !important; 
                        text-shadow: none !important; 
                    }
                    .problem-header {
                        text-align: center;
                        margin-bottom: 25px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #eee;
                    }
                    .problem-title {
                        font-size: 24px !important;
                        font-weight: bold !important;
                        margin-bottom: 10px;
                    }
                    .problem-limits {
                        font-size: 16px !important;
                        color: #555 !important;
                        display: flex;
                        justify-content: center;
                        gap: 20px;
                    }
                    .problem-content {
                        font-size: 16px !important;
                        line-height: 1.6 !important;
                        width: 100%;
                        overflow-wrap: break-word;
                    }
                    /* Restore standard spacing! Only force 16px on spans to kill 13pt without destroying sub/sup/math or line heights */
                    .problem-content p, .problem-content div, .problem-content li, .problem-content td {
                        font-size: 16px !important;
                        line-height: 1.6 !important;
                    }
                    .problem-content span {
                        font-size: 16px !important;
                    }
                    .problem-content * {
                        max-width: 100% !important;
                    }
                    img, svg, table, pre, code {
                        max-width: 100% !important;
                        page-break-inside: avoid;
                    }
                    pre, code {
                        border: 1px solid #ddd !important;
                        padding: 10px !important;
                        border-radius: 4px;
                        white-space: pre-wrap !important;
                        word-break: break-word !important;
                        font-family: Consolas, 'Courier New', monospace !important;
                        font-size: 14px !important;
                        background: #f8f9fa !important;
                    }
                    table {
                        border-collapse: collapse !important;
                        margin: 15px 0 !important;
                        width: auto !important;
                        max-width: 100% !important;
                    }
                }
            </style>
        `;

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${id ? id + ' - ' : ''}${rawTitle}</title>
                ${styleHTML}
            </head>
            <body>
                <div class="problem-header">
                    <div class="problem-title">${id ? id + ' - ' : ''}${rawTitle}</div>
                    <div class="problem-limits">
                        <span>Giới hạn thời gian: ${timeLimit}</span>
                        <span>Giới hạn bộ nhớ: ${memoryLimitMb}</span>
                    </div>
                </div>
                <div class="problem-content">
                    ${contentClone.innerHTML}
                </div>
            </body>
            </html>
        `;

        doc.write(html);
        doc.close();

        // Wait a bit for styles to load, then print and remove iframe
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 500);
    }

    function addCopyTitleButton() {
        const id = getProblemId();
        const titleElem = getTitleElement();

        if (!titleElem || titleElem.querySelector('.copy-title-btn')) return;

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'title-action-btn copy-title-btn';
        copyBtn.innerHTML = '<i class="fa fa-clone"></i>';
        copyBtn.title = 'Copy tên file ($mod+Shift+C)';
        copyBtn.style.marginLeft = '12px';

        copyBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const title = getCleanTitle(titleElem, id);
            const ext = getExtension(getCompilerTextFromDOM());
            const filename = generateFilename(id, title) + ext;

            try {
                await navigator.clipboard.writeText(filename);
                showNotification(`Đã copy: ${filename}`, 'success');
            } catch (err) {
                showNotification('Lỗi copy', 'error');
            }
        };

        titleElem.appendChild(copyBtn);

        // Add Send to IDE button
        if (!titleElem.querySelector('.send-ide-btn')) {
            const sendBtn = document.createElement('button');
            sendBtn.type = 'button';
            sendBtn.className = 'title-action-btn send-ide-btn';
            sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i>';
            sendBtn.title = 'Gửi đề bài ($mod+Shift+X)';

            sendBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                sendToIDE();
            };
            titleElem.appendChild(sendBtn);
        }

        // Add View as PDF button
        if (!titleElem.querySelector('.view-pdf-btn')) {
            const pdfBtn = document.createElement('button');
            pdfBtn.type = 'button';
            pdfBtn.className = 'title-action-btn view-pdf-btn';
            pdfBtn.innerHTML = '<i class="fa fa-file-pdf-o"></i>';
            pdfBtn.title = 'Xem dưới dạng PDF';

            pdfBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                viewAsPDF();
            };
            titleElem.appendChild(pdfBtn);
        }
    }

    function getCodeMirrorMode(compilerText) {
        const t = compilerText.toLowerCase();
        let mode;
        if (t === 'py3' || t.includes('python') || t.includes('py3')) mode = 'python';
        else if (t === 'java8' || t.includes('java')) mode = 'text/x-java';
        else if (t === 'monocs' || t.includes('c#') || t.includes('mono') || t.includes('dotnet') || t.includes('csharp')) mode = 'text/x-csharp';
        else if (t.startsWith('cpp') || t.includes('c++') || t.includes('cpp') || t.includes('g++')) mode = 'text/x-c++src';
        else if (t === 'c' || t.includes('gcc') || t.includes('ansi c')) mode = 'text/x-csrc';
        else mode = 'text/x-c++src';
        console.log('[cPTIT++] getCodeMirrorMode:', compilerText, '→', mode);
        return mode;
    }

    function createEditor(container, submitBtn, fileInput, getCompilerText, submitAction) {

        const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform);
        const mod = isMac ? '⌘' : 'Ctrl';

        const editorSection = document.createElement('div');
        editorSection.className = 'code-editor-section';
        editorSection.innerHTML = `
            <div id="cm-editor-wrapper"></div>
            <div class="editor-buttons-row">
                <div class="left-buttons">
                    <button class="editor-icon-btn" id="pasteBtn" title="Dán từ Clipboard (${mod}+Shift+V)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                    </button>
                    <button class="editor-icon-btn secondary" id="clearBtn" title="Xóa code">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
                    </button>
                    <button class="editor-icon-btn secondary" id="settingsBtn" title="Cài đặt">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                    <button class="editor-icon-btn secondary" id="themeBtn" title="Chuyển sang sáng/tối">
                        <!-- SVG will be injected by JS -->
                    </button>
                    <button class="editor-icon-btn secondary" id="guideBtn" title="Hướng dẫn sử dụng">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </button>
                </div>
                <div class="right-buttons">
                    <button class="editor-button primary" id="submitCodeBtn">Nộp bài</button>
                </div>
            </div>
            <div class="editor-stats-row">
                <span class="editor-stats">
                    <span id="lineCount">0</span> dòng |
                    <span id="charCount">0</span> ký tự
                </span>
            </div>
            <div class="shortcut-hints" style="font-size: 11px; color: #aaa; margin-top: 6px; text-align: right;">
                ${mod}+Enter: Nộp bài · ${mod}+Shift+V: Dán &amp; Nộp · ${mod}+Shift+X: Gửi đề bài
            </div>
        `;

        container.appendChild(editorSection);

        // Initialize CodeMirror
        const cmWrapper = editorSection.querySelector('#cm-editor-wrapper');
        const initialMode = getCodeMirrorMode(getCompilerText());
        const savedTheme = getSettings().editorTheme || 'dark';
        const isDark = savedTheme === 'dark';

        const cmEditor = CodeMirror(cmWrapper, {
            value: '',
            mode: initialMode,
            theme: isDark ? 'material-darker' : 'default',
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            styleActiveLine: true,
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: false,
            styleSelectedText: true,
            placeholder: 'Dán code của bạn vào đây hoặc nhấn nút Dán từ Clipboard...',
            extraKeys: {
                'Tab': (cm) => {
                    if (cm.somethingSelected()) {
                        cm.indentSelection('add');
                    } else {
                        cm.replaceSelection('    ', 'end');
                    }
                },
                'Shift-Tab': (cm) => {
                    cm.indentSelection('subtract');
                },
                'Ctrl-Enter': () => {
                    submitCodeBtn.click();
                },
                'Cmd-Enter': () => {
                    submitCodeBtn.click();
                },
                'Ctrl-/': (cm) => {
                    cm.toggleComment();
                },
                'Cmd-/': (cm) => {
                    cm.toggleComment();
                },
                'F11': (cm) => {
                    cm.setOption('fullScreen', !cm.getOption('fullScreen'));
                },
                'Esc': (cm) => {
                    if (cm.getOption('fullScreen')) cm.setOption('fullScreen', false);
                }
            }
        });

        // Watch for compiler changes and update mode
        const compilerObserver = new MutationObserver(() => {
            const newMode = getCodeMirrorMode(getCompilerText());
            if (cmEditor.getOption('mode') !== newMode) {
                cmEditor.setOption('mode', newMode);
            }
        });
        const compilerEl = document.querySelector('#compiler, .compiler-container');
        if (compilerEl) {
            compilerObserver.observe(compilerEl, { subtree: true, childList: true, attributes: true });
        }

        const pasteBtn = editorSection.querySelector('#pasteBtn');
        const clearBtn = editorSection.querySelector('#clearBtn');
        const settingsBtn = editorSection.querySelector('#settingsBtn');
        const guideBtn = editorSection.querySelector('#guideBtn');
        const submitCodeBtn = editorSection.querySelector('#submitCodeBtn');
        const lineCount = editorSection.querySelector('#lineCount');
        const charCount = editorSection.querySelector('#charCount');

        function updateStats() {
            const text = cmEditor.getValue();
            const lines = text ? text.split('\n').length : 0;
            const chars = text.length;
            lineCount.textContent = lines;
            charCount.textContent = chars;
        }

        cmEditor.on('change', updateStats);

        pasteBtn.onclick = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    cmEditor.setValue(text);
                    updateStats();
                    showNotification('Đã dán code từ clipboard', 'success');
                    cmEditor.focus();
                } else {
                    showNotification('Clipboard trống', 'warning');
                }
            } catch (err) {
                showNotification('Không thể truy cập clipboard', 'error');
            }
        };

        clearBtn.onclick = () => {
            cmEditor.setValue('');
            updateStats();
            showNotification('Đã xóa code', 'info');
            cmEditor.focus();
        };

        settingsBtn.onclick = () => openSettings();
        guideBtn.onclick = () => window.open('https://www.youtube.com/playlist?list=PLUMGF3D982PrRjmzCv3ZZQZcfGAZRYCf1', '_blank');

        // Theme toggle inside toolbar
        const themeBtn = editorSection.querySelector('#themeBtn');

        const sunIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        const moonIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        function updateThemeBtn(dark) {
            themeBtn.innerHTML = dark ? sunIcon : moonIcon;
            themeBtn.title = dark ? 'Giao diện nền sáng' : 'Giao diện nền tối';
            themeBtn.dataset.tooltip = themeBtn.title; // Update the custom tooltip
            cmWrapper.classList.toggle('cm-light-mode', !dark);
        }
        updateThemeBtn(isDark);

        // SETTINGS may not be populated yet — read theme directly from storage and apply
        chrome.storage.local.get({ editorTheme: 'dark' }, (stored) => {
            const storedDark = stored.editorTheme !== 'light';
            if (storedDark !== isDark) {
                cmEditor.setOption('theme', storedDark ? 'material-darker' : 'default');
                updateThemeBtn(storedDark);
            }
        });

        themeBtn.onclick = () => {
            const currentlyDark = cmEditor.getOption('theme') === 'material-darker';
            const newDark = !currentlyDark;
            cmEditor.setOption('theme', newDark ? 'material-darker' : 'default');
            updateThemeBtn(newDark);
            saveSettings({ editorTheme: newDark ? 'dark' : 'light' });
        };

        submitCodeBtn.onclick = async () => {
            const code = cmEditor.getValue().trim();
            if (!code) {
                showNotification('Chưa có code để nộp', 'warning');
                return;
            }

            const ext = getExtension(getCompilerText());
            const blob = new Blob([code], { type: 'text/plain' });

            const id = getProblemId();
            const title = getCleanTitle(getTitleElement(), id);
            const filename = generateFilename(id, title);
            const file = new File([blob], `${filename}${ext}`, { type: 'text/plain' });

            if (isBetaSite()) {
                const removeBtns = document.querySelectorAll('.ant-upload-list-item-actions button[title="Remove file"], .ant-upload-list-item .anticon-delete');
                removeBtns.forEach(btn => {
                    const el = btn.closest('button') || btn;
                    if (el) el.click();
                });
            }

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            showNotification(`Đang nộp bài: ${filename}${ext}`, 'success');
            setTimeout(() => submitAction(), 500);
        };
    }

    // --- Unified Competitive Companion Data Injection (DRY) ---

    function injectCompetitiveCompanionData() {
        const currentId = getProblemId();
        const existingContainer = document.getElementById('competitive-companion-data');

        if (existingContainer) {
            if (existingContainer.dataset.problemId === currentId) return;
            existingContainer.remove();
        }

        const titleElem = getTitleElement();
        if (!titleElem) return;

        // On beta site, also need the problem container for limits
        if (isBetaSite() && !document.querySelector('.problem-container')) return;

        let title = getCleanTitle(titleElem, currentId);
        title = generateCCTitle(currentId, title);

        const { timeLimit, memoryLimitMb } = getLimits();

        // Create hidden container
        const container = document.createElement('div');
        container.id = 'competitive-companion-data';
        container.dataset.problemId = currentId;
        container.style.display = 'none';
        container.className = 'problem-statement';

        // Header
        const header = document.createElement('div');
        header.className = 'header';
        header.innerHTML = `
            <div class="title">${escapeHtml(title)}</div>
            <div class="time-limit">${timeLimit}</div>
            <div class="memory-limit">${memoryLimitMb}</div>
            <div class="input-file">standard input</div>
            <div class="output-file">standard output</div>
        `;
        container.appendChild(header);

        // Tests — shared table parsing
        const table = getSampleTable();
        if (table) {
            const rows = table.querySelectorAll('tr');
            let startIndex = 0;
            if (rows.length > 0) {
                const headerText = rows[0].textContent.toLowerCase();
                if (headerText.includes('input') || headerText.includes('output')) {
                    startIndex = 1;
                }
            }

            for (let i = startIndex; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                if (cells.length >= 2) {
                    let input = cells[0].innerText.trim();
                    let output = cells[1].innerText.trim();

                    input = input.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
                    output = output.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');

                    const inputDiv = document.createElement('div');
                    inputDiv.className = 'input';
                    inputDiv.innerHTML = `<pre>${escapeHtml(input)}</pre>`;
                    container.appendChild(inputDiv);

                    const outputDiv = document.createElement('div');
                    outputDiv.className = 'output';
                    outputDiv.innerHTML = `<pre>${escapeHtml(output)}</pre>`;
                    container.appendChild(outputDiv);
                }
            }
        }

        document.body.appendChild(container);
    }

    function addCopyButtons() {
        const tables = document.querySelectorAll('.Table, .MsoTableGrid, .TableGrid1, .TableGrid2, .TableGrid3, .submit__des table, .problem-container table');
        tables.forEach(table => {
            if (table.dataset.copyButtonsAdded) return;
            table.dataset.copyButtonsAdded = 'true';

            const rows = table.querySelectorAll('tr');
            let startIndex = 0;
            if (rows.length > 0) {
                const headerText = rows[0].textContent.toLowerCase();
                if (headerText.includes('input') || headerText.includes('output')) {
                    startIndex = 1;
                }
            }

            for (let i = startIndex; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                cells.forEach(cell => {
                    const text = cell.textContent.trim();
                    if (!text) return;
                    if (['input', 'output'].includes(text.toLowerCase())) return;

                    if (cell.style.position !== 'absolute' && cell.style.position !== 'fixed') {
                        cell.style.position = 'relative';
                    }

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'copy-btn';
                    copyBtn.textContent = 'Copy';
                    copyBtn.title = 'Copy text';

                    copyBtn.onclick = async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const clone = cell.cloneNode(true);
                        const btnInClone = clone.querySelector('.copy-btn');
                        if (btnInClone) btnInClone.remove();

                        let text = clone.innerText;
                        text = text.split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                            .join('\n');

                        try {
                            await navigator.clipboard.writeText(text);
                            showNotification('Đã copy!', 'success');
                            copyBtn.textContent = 'Copied';
                            setTimeout(() => copyBtn.textContent = 'Copy', 1500);
                        } catch (err) {
                            showNotification('Lỗi copy', 'error');
                        }
                    };

                    cell.appendChild(copyBtn);
                });
            }
        });
    }

    // --- GitHub Contribution Graph (Heatmap) ---

    async function fetchUsername() {
        const urlOptions = ['/user/profile', '/profile'];
        for (const url of urlOptions) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const html = await res.text();
                // We're looking for the username pattern B2... or something similar.
                // We saw it in `<p class="nav__profile__menu__code">B25DCCN523</p>` or in the text.
                const match = html.match(/>([A-Z0-9_]{8,12})</);
                if (match) {
                    return match[1];
                }
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const pElems = doc.querySelectorAll('p');
                for (let p of pElems) {
                    if (p.className.includes('code') || String(p.textContent).match(/^[A-Z0-9]+$/)) {
                        const matchCode = p.textContent.trim().match(/^([A-Z0-9_]{8,12})$/);
                        if (matchCode) return matchCode[1];
                    }
                }
                // Try to find the B25DCCN523 inside spans
                const spans = doc.querySelectorAll('span');
                for (let span of spans) {
                    const t = span.textContent.trim();
                    if (t.match(/^[B|N][0-9]{2}[A-Z]+[0-9]{3}$/i)) { // standard ptit username regex
                        return t;
                    }
                }
            } catch (e) {
                console.error('[cPTIT++] Error fetching username from', url, e);
            }
        }
        // Fallback for beta site - check local storage or DOM
        const betaProfile = document.querySelector('.ant-dropdown-link img');
        if (betaProfile && betaProfile.src.includes('?name=')) {
            // Beta doesn't cleanly expose username, but maybe we can just get it globally if the user is in beta
            try {
                const token = localStorage.getItem('access_token');
                const headers = { 'Accept': 'application/json, text/plain, */*' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const req = await fetch('/api/user/info', { headers });
                if (req.ok) {
                    const json = await req.json();
                    if (json && json.data && json.data.username) return json.data.username;
                }
            } catch (e) { }
        }

        // Just ask the user to navigate back if we can't find it
        return null;
    }

    async function fetchAllSubmissions(username) {
        if (!username) return [];
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Accept': 'application/json, text/plain, */*' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const firstPageRes = await fetch(`/api/solutions?username=${username}&page=1`, { headers });
            if (!firstPageRes.ok) return [];
            const firstPageData = await firstPageRes.json();

            let allData = firstPageData.data || [];
            const lastPage = firstPageData.last_page || 1;

            if (lastPage > 1) {
                const promises = [];
                for (let i = 2; i <= lastPage; i++) {
                    promises.push(
                        fetch(`/api/solutions?username=${username}&page=${i}`, { headers })
                            .then(res => res.json())
                            .catch(() => ({ data: [] }))
                    );
                }
                const subsequentPages = await Promise.all(promises);
                for (const page of subsequentPages) {
                    if (page && page.data) {
                        allData = allData.concat(page.data);
                    }
                }
            }
            return allData;
        } catch (e) {
            console.error('[cPTIT++] Error fetching all submissions:', e);
            return [];
        }
    }

    function processSubmissions(submissions) {
        const heatmapData = {};
        for (const sub of submissions) {
            // expected "created_at": "2026-03-15 12:49:06"
            if (!sub.created_at) continue;
            const dateStr = sub.created_at.split(' ')[0]; // YYYY-MM-DD
            if (!heatmapData[dateStr]) {
                heatmapData[dateStr] = 0;
            }
            heatmapData[dateStr]++;
        }
        return heatmapData;
    }

    function injectHeatmapContainer() {
        if (document.getElementById('cptit-heatmap-container')) {
            return document.getElementById('cptit-heatmap-container');
        }

        const container = document.createElement('div');
        container.id = 'cptit-heatmap-container';
        container.className = 'cptit-heatmap-wrapper';

        // Inject into the page
        const isBeta = window.location.href.includes('/beta');
        if (isBeta) {
            waitForElement('.body .part-left .body-header', (header) => {
                // Insert before the problem-container (table area) so it appears above the table
                const problemContainer = header.querySelector('.problem-container');
                if (problemContainer) {
                    header.insertBefore(container, problemContainer);
                } else {
                    // Fallback: insert after the underline div, before table
                    const underline = header.querySelector('.underline');
                    if (underline && underline.nextSibling) {
                        header.insertBefore(container, underline.nextSibling);
                    } else {
                        header.appendChild(container);
                    }
                }
            });
        } else {
            waitForElement('.historywork', (historyWork) => {
                historyWork.insertBefore(container, historyWork.firstChild);
            });
            // Fallback for full page wrapper if .historywork isn't specific
            waitForElement('.wrapper > .wrapper', (wrapper) => {
                if (!document.getElementById('cptit-heatmap-container')) {
                    wrapper.insertBefore(container, wrapper.firstChild);
                }
            }, 5000);
        }
        return container;
    }

    // --- Streak Calculation (shared by heatmap and homepage badge) ---

    function calcStreak(data) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        let streak = 0;
        let checkDate = new Date(today);

        // If today has no submissions, check if yesterday does (allow 1-day grace)
        if (!data[fmt(checkDate)]) {
            checkDate.setDate(checkDate.getDate() - 1);
            if (!data[fmt(checkDate)]) return 0;
        }

        // Count consecutive days backwards
        while (data[fmt(checkDate)] && data[fmt(checkDate)] > 0) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        }
        return streak;
    }

    // --- Homepage Streak Badge ---

    async function initStreakBadge() {
        // Only on problem list pages
        const isOldHome = window.location.href.includes('/student/question') && !window.location.href.includes('/student/question/');
        const isBetaHome = isProblemListPage();
        if (!isOldHome && !isBetaHome) return;

        // Prevent double injection depending on the site structure
        if (isOldHome && document.getElementById('cptit-homepage-streak')) return;
        if (isBetaHome) {
            if (document.getElementById('cptit-homepage-streak')) return;
        }

        // Fetch username
        let username = null;
        const ptitCodeMatch = document.body.innerHTML.match(/Tài khoản[^<]*<span[^>]*>(B[0-9]{2}[A-Z]+[0-9]{3})<\/span>/i) ||
            document.body.innerHTML.match(/(B[0-9]{2}[A-Z]+[0-9]{3})/i);
        if (ptitCodeMatch) {
            username = ptitCodeMatch[1];
        } else {
            username = await fetchUsername();
        }
        if (!username) return;

        // Fetch submissions and calculate streak
        const subs = await fetchAllSubmissions(username);
        const processed = processSubmissions(subs);
        const streak = calcStreak(processed);

        // Build badge
        const badge = document.createElement('div');
        badge.id = 'cptit-homepage-streak';
        badge.className = 'cptit-homepage-streak';

        const flameSvg = '<svg class="streak-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';

        if (streak > 0) {
            badge.innerHTML = `<span class="cptit-streak-badge active-streak">${flameSvg} <span class="streak-text">${streak} ngày liên tiếp</span></span>`;
        } else {
            badge.innerHTML = `<span class="cptit-streak-badge cptit-streak-zero"><span class="streak-text">Hãy bắt đầu streak hôm nay!</span></span>`;
        }

        // Inject into page
        if (isOldHome) {
            const topNav = document.querySelector('.ques__nav__top');
            if (topNav) {
                // Ensure topNav is a flex container
                topNav.style.display = 'flex';
                topNav.style.alignItems = 'center';
                topNav.style.justifyContent = 'space-between';
                topNav.style.flexWrap = 'wrap';
                topNav.style.gap = '10px';

                const title = topNav.querySelector('.ques__nav__title');
                if (title) {
                    // Group title and badge together on the left
                    const titleWrapper = document.createElement('div');
                    titleWrapper.style.display = 'flex';
                    titleWrapper.style.alignItems = 'center';
                    titleWrapper.style.gap = '12px';

                    topNav.insertBefore(titleWrapper, title);
                    titleWrapper.appendChild(title);
                    titleWrapper.appendChild(badge);
                } else {
                    topNav.appendChild(badge);
                }
            }
        } else {
            // Beta: wrap the h2 and the badge in a flex container so they side-by-side on the left
            const header = document.querySelector('.body-header h2');
            if (header && !header.parentElement.classList.contains('cptit-header-wrapper')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'cptit-header-wrapper';
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.justifyContent = 'flex-start';
                wrapper.style.gap = '12px';

                header.parentNode.insertBefore(wrapper, header);
                header.style.marginBottom = '0'; // reset margin since we use wrapper

                wrapper.appendChild(header);
                wrapper.appendChild(badge);
            } else if (header && header.parentElement.classList.contains('cptit-header-wrapper')) {
                // If wrapper already exists, just append/replace badge
                const existingBadge = document.getElementById('cptit-homepage-streak');
                if (!existingBadge) {
                    header.parentElement.appendChild(badge);
                }
            }
        }
    }

    function renderHeatmap(submissionsData, container) {
        if (!container) return;
        container.innerHTML = ''; // Clear loading state

        const MONTHS_VI = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];
        const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

        // --- Calculate streak (uses shared function) ---
        const currentStreak = calcStreak(submissionsData);

        // --- Header with title, total count, and streak ---
        const totalSubmissions = Object.values(submissionsData).reduce((a, b) => a + b, 0);
        const headerDiv = document.createElement('div');
        headerDiv.className = 'cptit-heatmap-header';

        const flameSvg = '<svg class="streak-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
        
        let streakHTML = '';
        if (currentStreak > 0) {
            streakHTML = `<span class="cptit-streak-badge active-streak">${flameSvg} <span class="streak-text">${currentStreak} ngày liên tiếp</span></span>`;
        } else {
            streakHTML = `<span class="cptit-streak-badge cptit-streak-zero"><span class="streak-text">Hãy bắt đầu streak hôm nay!</span></span>`;
        }

        headerDiv.innerHTML = `
            <span class="cptit-heatmap-title">${totalSubmissions} submissions trong năm qua</span>
            ${streakHTML}
        `;
        container.appendChild(headerDiv);

        // --- Graph area (day labels + month labels + grid) ---
        const graphArea = document.createElement('div');
        graphArea.className = 'cptit-heatmap-graph';

        // Calculate date range: end on today, go back ~1 year
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // End of graph is the Saturday of today's week (or today if today is Saturday)
        const endDay = new Date(today);
        endDay.setDate(endDay.getDate() + (6 - endDay.getDay()));

        // Start exactly 52 weeks before the Sunday of this week
        const startDay = new Date(endDay);
        startDay.setDate(startDay.getDate() - (52 * 7) - 6); // Go back 52 full weeks + remaining days to Sunday

        // Calculate total weeks
        const totalDays = Math.ceil((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
        const totalWeeks = Math.ceil(totalDays / 7);

        // --- Month labels row ---
        const monthRow = document.createElement('div');
        monthRow.className = 'cptit-heatmap-months';
        const monthSpacer = document.createElement('div');
        monthSpacer.className = 'cptit-heatmap-day-label-spacer';
        monthRow.appendChild(monthSpacer);

        // Track which months appear in which week columns
        let tempDate = new Date(startDay);
        let lastMonth = -1;
        const monthPositions = [];
        for (let week = 0; week < totalWeeks; week++) {
            const weekStart = new Date(tempDate);
            const m = weekStart.getMonth();
            if (m !== lastMonth) {
                monthPositions.push({ month: m, week: week });
                lastMonth = m;
            }
            tempDate.setDate(tempDate.getDate() + 7);
        }

        // Create month label spans positioned over the grid
        const monthLabelsContainer = document.createElement('div');
        monthLabelsContainer.className = 'cptit-heatmap-month-labels';
        monthLabelsContainer.style.gridTemplateColumns = `repeat(${totalWeeks}, 14px)`;
        for (const { month, week } of monthPositions) {
            const label = document.createElement('span');
            label.className = 'cptit-heatmap-month-label';
            label.textContent = MONTHS_VI[month];
            label.style.gridColumn = String(week + 1);
            monthLabelsContainer.appendChild(label);
        }
        monthRow.appendChild(monthLabelsContainer);
        graphArea.appendChild(monthRow);

        // --- Main grid area (day labels + cells) ---
        const gridRow = document.createElement('div');
        gridRow.className = 'cptit-heatmap-grid-row';

        // Day labels column (Mon, Wed, Fri)
        const dayLabels = document.createElement('div');
        dayLabels.className = 'cptit-heatmap-day-labels';
        for (let i = 0; i < 7; i++) {
            const label = document.createElement('span');
            label.className = 'cptit-heatmap-day-label';
            if (i === 1 || i === 3 || i === 5) {
                label.textContent = DAYS_VI[i];
            }
            dayLabels.appendChild(label);
        }
        gridRow.appendChild(dayLabels);

        // Grid of cells
        const grid = document.createElement('div');
        grid.className = 'cptit-heatmap-grid';

        // Tooltip element (shared, repositioned on hover)
        const tooltip = document.createElement('div');
        tooltip.className = 'cptit-heatmap-tooltip';
        tooltip.style.display = 'none';
        container.appendChild(tooltip);

        let currentDate = new Date(startDay);
        for (let week = 0; week < totalWeeks; week++) {
            const weekColumn = document.createElement('div');
            weekColumn.className = 'cptit-heatmap-week';

            for (let day = 0; day < 7; day++) {
                const d = new Date(currentDate);
                const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                const cell = document.createElement('div');
                cell.className = 'cptit-heatmap-cell';

                if (d > today) {
                    cell.classList.add('cptit-heatmap-cell-empty');
                } else {
                    const count = submissionsData[dateString] || 0;
                    cell.dataset.date = dateString;
                    cell.dataset.count = count;

                    if (count === 0) cell.classList.add('color-scale-0');
                    else if (count <= 2) cell.classList.add('color-scale-1');
                    else if (count <= 5) cell.classList.add('color-scale-2');
                    else if (count <= 10) cell.classList.add('color-scale-3');
                    else cell.classList.add('color-scale-4');

                    // Custom tooltip on hover
                    cell.addEventListener('mouseenter', (e) => {
                        const c = parseInt(e.target.dataset.count || 0);
                        const dateParts = e.target.dataset.date.split('-');
                        const displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                        tooltip.innerHTML = `<strong>${c} submission${c !== 1 ? 's' : ''}</strong> ngày ${displayDate}`;
                        tooltip.style.display = 'block';
                        const rect = e.target.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        tooltip.style.left = (rect.left - containerRect.left + rect.width / 2) + 'px';
                        tooltip.style.top = (rect.top - containerRect.top - 36) + 'px';
                    });
                    cell.addEventListener('mouseleave', () => {
                        tooltip.style.display = 'none';
                    });
                }

                weekColumn.appendChild(cell);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            grid.appendChild(weekColumn);
        }

        gridRow.appendChild(grid);
        graphArea.appendChild(gridRow);
        container.appendChild(graphArea);

        // --- Footer: Color Legend ---
        const footer = document.createElement('div');
        footer.className = 'cptit-heatmap-footer';
        footer.innerHTML = `
            <span class="cptit-heatmap-legend-label">Ít</span>
            <div class="cptit-heatmap-cell color-scale-0"></div>
            <div class="cptit-heatmap-cell color-scale-1"></div>
            <div class="cptit-heatmap-cell color-scale-2"></div>
            <div class="cptit-heatmap-cell color-scale-3"></div>
            <div class="cptit-heatmap-cell color-scale-4"></div>
            <span class="cptit-heatmap-legend-label">Nhiều</span>
        `;
        container.appendChild(footer);

        // Injection is now handled by injectHeatmapContainer
    }

    async function initHeatmap() {
        console.log('[cPTIT++] Initializing Heatmap...');

        const container = injectHeatmapContainer();
        // Show loading state
        container.innerHTML = `
            <div class="cptit-heatmap-loading">
                <div class="cptit-spinner"></div>
                <span>Đang tải dữ liệu History... (Quá trình này có thể mất vài giây)</span>
            </div>
        `;

        // Try getting username from DOM first if we are on old site
        let username = null;

        const ptitCodeMatch = document.body.innerHTML.match(/Tài khoản[^<]*<span[^>]*>(B[0-9]{2}[A-Z]+[0-9]{3})<\/span>/i) ||
            document.body.innerHTML.match(/(B[0-9]{2}[A-Z]+[0-9]{3})/i);
        if (ptitCodeMatch) {
            username = ptitCodeMatch[1];
        } else {
            username = await fetchUsername();
        }

        if (username) {
            console.log('[cPTIT++] Found username:', username);
            const subs = await fetchAllSubmissions(username);
            const processed = processSubmissions(subs);
            renderHeatmap(processed, container);
        } else {
            console.warn('[cPTIT++] Username not found, cannot render heatmap.');
            container.innerHTML = `<div class="cptit-heatmap-loading" style="color: #a7453c">Không tìm thấy mã sinh viên để tải Heatmap.</div>`;
        }
    }

    // Helper: detect history page (works for both URL-based original site and DOM-based Beta SPA tabs)
    function isHistoryPage() {
        // URL check (works for original site and direct Beta URL)
        if (window.location.href.includes('/history')) return true;
        // DOM check for Beta SPA: look for the "Lịch sử" heading
        const headings = document.querySelectorAll('.body-header h2');
        for (const h of headings) {
            if (h.textContent.trim() === 'Lịch sử') return true;
        }
        return false;
    }

    // --- Hide Solved Problems Toggle ---

    function initHideSolvedToggle() {
        // Don't double-inject
        if (document.getElementById('cptit-hide-solved-toggle')) return;

        const isOld = window.location.href.includes('/student/question') && !window.location.href.includes('/student/question/');
        const isBetaList = isProblemListPage();

        if (!isOld && !isBetaList) return;

        // Create toggle container
        const toggleContainer = document.createElement('div');
        toggleContainer.id = 'cptit-hide-solved-toggle';
        toggleContainer.className = 'cptit-hide-solved';
        toggleContainer.innerHTML = `
            <label class="cptit-toggle-switch">
                <input type="checkbox" id="cptit-hide-solved-cb">
                <span class="cptit-toggle-slider"></span>
            </label>
            <span class="cptit-toggle-label">Ẩn bài đã giải</span>
        `;

        // Insert into page
        if (isOld) {
            const bottomNav = document.querySelector('.ques__nav__bottom');
            if (bottomNav) {
                // Keep the filter on the left, toggle on the right
                bottomNav.style.display = 'flex';
                bottomNav.style.alignItems = 'center';
                bottomNav.style.justifyContent = 'space-between';
                bottomNav.style.gap = '15px';
                bottomNav.style.flexWrap = 'wrap';

                // Ensure the left filter box doesn't push things weirdly
                const leftBox = bottomNav.querySelector('.ques__nav__filter');
                if (leftBox) {
                    leftBox.style.marginRight = 'auto'; // Force right alignment for toggle
                }

                toggleContainer.style.display = 'inline-flex';
                bottomNav.appendChild(toggleContainer);
            } else return;
        } else {
            // Beta: insert BEFORE the search container or BEFORE the table
            const searchContainer = document.querySelector('.search-container');
            const problemContainer = document.querySelector('.problem-container');
            if (searchContainer) {
                // Place it JUST BEFORE the search container in the DOM
                searchContainer.parentNode.insertBefore(toggleContainer, searchContainer);
                toggleContainer.style.marginBottom = '10px';
                toggleContainer.style.width = '100%';
                toggleContainer.style.justifyContent = 'flex-end';
            } else if (problemContainer) {
                problemContainer.parentNode.insertBefore(toggleContainer, problemContainer);
                toggleContainer.style.marginBottom = '10px';
                toggleContainer.style.justifyContent = 'flex-end';
            } else return;
        }

        const checkbox = document.getElementById('cptit-hide-solved-cb');

        function applySolvedVisibility(hide) {
            if (isOld) {
                // Original site: solved rows have class "bg--10th" (green background)
                document.querySelectorAll('.ques__table tbody tr.bg--10th').forEach(row => {
                    row.style.display = hide ? 'none' : '';
                });
            } else {
                // Beta site: solved rows have anticon-check-circle in first td
                document.querySelectorAll('.ant-table-tbody tr').forEach(row => {
                    const checkIcon = row.querySelector('.anticon-check-circle');
                    if (checkIcon) {
                        row.style.display = hide ? 'none' : '';
                    }
                });
            }
        }

        // Load saved state
        const storageAPI = typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : (typeof browser !== 'undefined' && browser.storage ? browser.storage.local : null);
        if (storageAPI) {
            storageAPI.get({ cptit_hide_solved: false }, (result) => {
                const hide = result.cptit_hide_solved;
                checkbox.checked = hide;
                applySolvedVisibility(hide);
            });
        }

        checkbox.addEventListener('change', () => {
            const hide = checkbox.checked;
            applySolvedVisibility(hide);
            if (storageAPI) {
                storageAPI.set({ cptit_hide_solved: hide });
            }
        });

        // Observe table changes (pagination, filtering) to re-apply
        const tableContainer = isOld
            ? document.querySelector('.ques__table__wrapper')
            : document.querySelector('.ant-table-wrapper');
        if (tableContainer) {
            const tableObserver = new MutationObserver(() => {
                if (checkbox.checked) {
                    applySolvedVisibility(true);
                }
            });
            tableObserver.observe(tableContainer, { childList: true, subtree: true });
        }
    }

    function isProblemListPage() {
        // Beta: check for "Danh sách bài tập" heading or problem table
        const headings = document.querySelectorAll('.body-header h2');
        for (const h of headings) {
            if (h.textContent.trim() === 'Danh sách bài tập') return true;
        }
        return false;
    }

    // --- Site Specific Implementations ---

    function customizeOldSiteUI() {
        const banner = document.querySelector('.username.container-fluid');
        if (banner) {
            banner.style.display = 'none';
        }

        const navMenu = document.querySelector('.nav__menu');
        if (navMenu) {
            const betaItem = document.createElement('div');
            betaItem.className = 'nav__menu__item';
            betaItem.innerHTML = `
                <a href="/beta">
                    Beta
                </a>
            `;
            navMenu.appendChild(betaItem);
        }
    }

    function initOldSite() {

        waitForElement('.submit__pad', (submitPad) => {
            const submitBtn = submitPad.querySelector('.submit__pad__btn');
            const fileInput = document.getElementById('fileInput');
            const form = document.querySelector('.submit__pad form');

            if (!submitBtn || !fileInput || !form) return;

            const quickSubmitBtn = document.createElement('button');
            quickSubmitBtn.type = 'button';
            quickSubmitBtn.className = 'submit__pad__btn quick-submit-btn';
            quickSubmitBtn.textContent = 'Dán và Nộp bài';

            const getCompilerText = () => {
                const compiler = document.getElementById('compiler');
                return compiler ? compiler.options[compiler.selectedIndex].text : '';
            };

            const submitAction = () => form.submit();

            quickSubmitBtn.onclick = () => handlePasteAndSubmit(fileInput, submitAction, getCompilerText);
            submitBtn.parentNode.appendChild(quickSubmitBtn);

            createEditor(submitPad.parentNode, submitBtn, fileInput, getCompilerText, submitAction);

            const editor = document.querySelector('.code-editor-section');
            if (editor) {
                submitPad.parentNode.insertBefore(editor, submitPad.nextSibling);
            }

            // Unified injection
            injectCompetitiveCompanionData();

            addCopyTitleButton();
            injectStatusIcon();

            addCopyButtons();
        });
    }

    function initBetaSite() {
        // Since Beta doesn't package FontAwesome by default, we inject it for our icons
        if (!document.getElementById('injected-fontawesome')) {
            const fontAwesomeLink = document.createElement('link');
            fontAwesomeLink.id = 'injected-fontawesome';
            fontAwesomeLink.rel = 'stylesheet';
            fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
            document.head.appendChild(fontAwesomeLink);
        }

        // Always try — these have their own idempotency checks
        addCopyTitleButton();
        injectStatusIcon();
        injectCompetitiveCompanionData();
        addCopyButtons();

        // Guard to prevent multiple injections of UI elements
        if (document.querySelector('.quick-submit-btn')) return;

        const submitContainer = document.querySelector('.submit-container');
        if (!submitContainer) return;

        const fileInput = submitContainer.querySelector('input[type="file"]');
        const realSubmitBtn = document.querySelector('.submit-status-container button.ant-btn-primary');

        if (!fileInput || !realSubmitBtn) return;

        const quickSubmitBtn = document.createElement('button');
        quickSubmitBtn.className = 'ant-btn ant-btn-primary quick-submit-btn quick-submit-btn-beta';
        quickSubmitBtn.textContent = 'Dán và Nộp bài';

        const submitStatusContainer = submitContainer.querySelector('.submit-status-container');
        if (submitStatusContainer) {
            submitStatusContainer.parentNode.insertBefore(quickSubmitBtn, submitStatusContainer.nextSibling);
        } else {
            submitContainer.appendChild(quickSubmitBtn);
        }

        const getCompilerText = () => {
            const compilerSelect = document.querySelector('.compiler-container .ant-select-selection-item');
            return compilerSelect ? compilerSelect.title || compilerSelect.textContent : '';
        };

        const submitAction = () => {
            if (!realSubmitBtn.disabled) {
                realSubmitBtn.click();
            } else {
                showNotification('Nút nộp bài đang bị vô hiệu hóa (có thể đang xử lý)', 'warning');
            }
        };

        quickSubmitBtn.onclick = () => handlePasteAndSubmit(fileInput, submitAction, getCompilerText);

        if (!document.querySelector('.code-editor-section')) {
            const editorContainer = document.createElement('div');
            editorContainer.style.marginTop = '20px';

            const toolsContainer = submitContainer.closest('.tools-container');
            if (toolsContainer && toolsContainer.parentNode) {
                toolsContainer.parentNode.insertBefore(editorContainer, toolsContainer.nextSibling);
            } else {
                submitContainer.parentNode.appendChild(editorContainer);
            }

            createEditor(editorContainer, realSubmitBtn, fileInput, getCompilerText, submitAction);
        }
    }

    // --- Keyboard Shortcuts (Feature B) ---

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't fire shortcuts when typing in inputs (except our CodeMirror editor)
            const tag = e.target.tagName.toLowerCase();
            const isOurEditor = !!e.target.closest('.CodeMirror');
            if ((tag === 'input' || tag === 'textarea') && !isOurEditor) return;

            // Ctrl+Shift+V: Paste & Submit
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyV' || e.key === 'V' || e.key === 'v')) {
                e.preventDefault();
                const btn = document.querySelector('.quick-submit-btn');
                if (btn) btn.click();
            }

            // Ctrl+Shift+C: Copy filename (only when not in a text field)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyC' || e.key === 'C' || e.key === 'c')) {
                if (tag !== 'textarea' && tag !== 'input') {
                    e.preventDefault();
                    const btn = document.querySelector('.copy-title-btn');
                    if (btn) btn.click();
                }
            }

            // Ctrl+Shift+X (or P): Send to IDE
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyX' || e.code === 'KeyP' || e.code === 'KeyS')) {
                e.preventDefault();
                sendToIDE();
            }
        });
    }

    // --- SPA Navigation Detection (Feature D) ---

    function checkNavigationChange() {
        const currentId = getProblemId();
        if (currentId !== lastProblemId && lastProblemId !== null) {
            // Problem changed — clean up stale elements
            const existingCC = document.getElementById('competitive-companion-data');
            if (existingCC) existingCC.remove();

            document.querySelectorAll('.copy-title-btn, .send-ide-btn').forEach(b => b.remove());

            // Reset copy buttons flag on tables so they get re-added
            document.querySelectorAll('[data-copy-buttons-added]').forEach(el => {
                delete el.dataset.copyButtonsAdded;
            });
        }
        lastProblemId = currentId;
    }

    // --- Heatmap Feature Promotion ---

    const HEATMAP_SEEN_KEY = 'cptit_heatmap_seen';
    const HEATMAP_VERSION = '0.4.2';

    function getStorageAPI() {
        // Use chrome.storage if available, fallback to browser.storage (Firefox)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) return browser.storage.local;
        return null;
    }

    async function isHeatmapSeen() {
        const api = getStorageAPI();
        if (!api) return false;
        return new Promise(resolve => {
            api.get(HEATMAP_SEEN_KEY, (result) => {
                resolve(result[HEATMAP_SEEN_KEY] === HEATMAP_VERSION);
            });
        });
    }

    function markHeatmapSeen() {
        const api = getStorageAPI();
        if (!api) return;
        api.set({ [HEATMAP_SEEN_KEY]: HEATMAP_VERSION });
    }

    async function notifyHeatmapFeature() {
        const seen = await isHeatmapSeen();
        if (seen) return;

        // Only show on problem pages (not on history itself)
        if (isHistoryPage()) return;

        setTimeout(() => {
            // Don't double-inject
            if (document.querySelector('.cptit-feature-toast')) return;

            const toast = document.createElement('div');
            toast.className = 'cptit-feature-toast';

            const isBeta = window.location.href.includes('/beta');
            const historyUrl = isBeta ? '/beta/history' : '/student/history';

            toast.innerHTML = `
                <div class="cptit-feature-toast-content">
                    <span class="cptit-feature-toast-icon">📊</span>
                    <div class="cptit-feature-toast-text">
                        <strong>Mới!</strong> Xem biểu đồ hoạt động của bạn
                        <a href="${historyUrl}" class="cptit-feature-toast-link">tại trang Lịch sử →</a>
                    </div>
                    <button class="cptit-feature-toast-close" title="Đóng">×</button>
                </div>
            `;
            document.body.appendChild(toast);

            requestAnimationFrame(() => toast.classList.add('visible'));

            const dismiss = () => {
                markHeatmapSeen();
                toast.classList.remove('visible');
                setTimeout(() => toast.remove(), 400);
            };

            toast.querySelector('.cptit-feature-toast-close').onclick = dismiss;
            toast.querySelector('.cptit-feature-toast-link').addEventListener('click', () => {
                markHeatmapSeen();
            });

            setTimeout(dismiss, 10000);
        }, 2000);
    }

    function injectBadgeToDom() {
        // Don't inject if already there
        if (document.querySelector('.cptit-new-badge')) return;

        const isBeta = window.location.href.includes('/beta');

        if (isBeta) {
            const navItems = document.querySelectorAll('.nav-item');
            for (const item of navItems) {
                if (item.textContent.includes('Lịch sử')) {
                    const badge = document.createElement('span');
                    badge.className = 'cptit-new-badge';
                    item.style.position = 'relative';
                    item.appendChild(badge);
                    break;
                }
            }
        } else {
            const navItems = document.querySelectorAll('.nav__menu__item a');
            for (const link of navItems) {
                if (link.textContent.trim() === 'Lịch sử' || (link.href && link.href.includes('/history'))) {
                    const badge = document.createElement('span');
                    badge.className = 'cptit-new-badge';
                    link.style.position = 'relative';
                    link.appendChild(badge);
                    break;
                }
            }
        }
    }

    async function addHistoryBadge() {
        const seen = await isHeatmapSeen();
        if (seen) return;

        // When they visit the history page, mark as seen
        if (isHistoryPage()) {
            markHeatmapSeen();
            return;
        }

        // Inject immediately + retry for SPA
        injectBadgeToDom();
        // Also retry after a delay for SPA sites where DOM loads late
        setTimeout(injectBadgeToDom, 1500);
        setTimeout(injectBadgeToDom, 3000);
    }

    // --- Tooltip Enhancement: title → data-tooltip ---
    function convertTitlesToTooltips() {
        const modKey = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
        document.querySelectorAll('.title-action-btn[title], .editor-icon-btn[title], .cm-theme-toggle[title]').forEach(btn => {
            btn.dataset.tooltip = btn.title.replace(/\$mod/g, modKey);
            btn.removeAttribute('title');
        });
    }
    // Run periodically since buttons are injected dynamically
    setInterval(convertTitlesToTooltips, 1000);

    // --- Main Entry Point ---

    // Setup keyboard shortcuts globally
    setupKeyboardShortcuts();

    // Remove banner on ALL /student/ pages (listings, rankings, etc.)
    if (window.location.href.includes(CONFIG.oldSiteBase)) {
        customizeOldSiteUI();
    }

    // Hide solved problems toggle (original site - direct load)
    initHideSolvedToggle();

    // Streak badge on homepage
    initStreakBadge();

    // Heatmap feature promotion (toast + badge)
    notifyHeatmapFeature();
    addHistoryBadge();

    if (isHistoryPage()) {
        initHeatmap();
    }

    if (window.location.href.includes(CONFIG.oldUrlPart)) {
        lastProblemId = getProblemId();
        initOldSite();
        setTimeout(addCopyButtons, 1000);
    } else {
        // Beta Site - SPA Handling
        lastProblemId = getProblemId();

        // Try immediately
        if (isBetaSite()) {
            initBetaSite();
            setTimeout(addCopyButtons, 1000);
        }

        // Observe for navigation/DOM changes (debounced to avoid excessive calls)
        let debounceTimer = null;
        const isBeta = window.location.href.includes('/beta');
        const observer = new MutationObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (isBetaSite()) {
                    checkNavigationChange();
                    initBetaSite();
                }

                // These need to run on ALL Beta pages, not just /beta/problems/
                if (isBeta) {
                    // SPA: try to inject hide-solved toggle and streak badge on problem list
                    initHideSolvedToggle();
                    initStreakBadge();
                    saveProblemListSequence();

                    if (isHistoryPage()) {
                        // User is on history tab: render heatmap, remove badge, mark seen
                        if (!document.getElementById('cptit-heatmap-container')) {
                            initHeatmap();
                        }
                        const badge = document.querySelector('.cptit-new-badge');
                        if (badge) badge.remove();
                        markHeatmapSeen();
                    } else {
                        // Not on history: inject badge if not seen
                        isHeatmapSeen().then(seen => {
                            if (!seen && !document.querySelector('.cptit-new-badge')) {
                                injectBadgeToDom();
                            }
                        });
                    }
                }
            }, 300);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

})();
