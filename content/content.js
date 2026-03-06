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

    function addCopyTitleButton() {
        const id = getProblemId();
        const titleElem = getTitleElement();

        if (!titleElem || titleElem.querySelector('.copy-title-btn')) return;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'title-action-btn copy-title-btn';
        copyBtn.textContent = 'Copy tên file';

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
            sendBtn.className = 'title-action-btn send-ide-btn';
            sendBtn.textContent = 'Gửi đề bài';
            sendBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                sendToIDE();
            };
            titleElem.appendChild(sendBtn);
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

        // Floating theme toggle inside editor
        const themeBtn = document.createElement('button');
        themeBtn.id = 'themeBtn';
        themeBtn.className = 'cm-theme-toggle';
        cmWrapper.style.position = 'relative';
        cmWrapper.appendChild(themeBtn);

        const sunIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        const moonIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        function updateThemeBtn(dark) {
            themeBtn.innerHTML = dark ? sunIcon : moonIcon;
            themeBtn.title = dark ? 'Chuyển sang sáng' : 'Chuyển sang tối';
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

            addCopyButtons();
        });
    }

    function initBetaSite() {
        // Always try — these have their own idempotency checks
        addCopyTitleButton();
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

    // --- Main Entry Point ---

    // Setup keyboard shortcuts globally
    setupKeyboardShortcuts();

    // Remove banner on ALL /student/ pages (listings, rankings, etc.)
    if (window.location.href.includes(CONFIG.oldSiteBase)) {
        customizeOldSiteUI();
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
        const observer = new MutationObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (isBetaSite()) {
                    checkNavigationChange();
                    initBetaSite();
                }
            }, 300);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

})();
