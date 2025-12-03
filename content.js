(function () {
    'use strict';

    // --- Configuration & Utilities ---

    const CONFIG = {
        filename: 'solution', // Generic filename
        betaUrlPart: '/beta/problems/',
        oldUrlPart: '/student/question/'
    };

    function isBetaSite() {
        return window.location.href.includes(CONFIG.betaUrlPart);
    }

    function waitForElement(selector, callback, timeout = 10000) {
        const start = Date.now();
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback(element);
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                console.log(`Timeout waiting for selector: ${selector}`);
            }
        }, 100);
    }

    function showNotification(message, type = 'info') {
        const notif = document.createElement('div');
        notif.className = `notification-toast ${type}`;
        notif.textContent = message;
        document.body.appendChild(notif);

        setTimeout(() => {
            notif.style.transition = 'opacity 0.3s';
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 2500);
    }

    function getExtension(compilerText) {
        if (!compilerText) return '.c';
        const lang = compilerText.toLowerCase();
        if (lang.includes('c++')) return '.cpp';
        if (lang.includes('java')) return '.java';
        if (lang.includes('python')) return '.py';
        return '.c';
    }

    function getProblemId() {
        const parts = window.location.pathname.split('/');
        return parts[parts.length - 1] || 'solution';
    }

    // --- Helper Functions ---

    function removeVietnameseTones(str) {
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
        str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
        str = str.replace(/đ/g, "d");
        str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
        str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
        str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
        str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
        str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
        str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
        str = str.replace(/Đ/g, "D");
        // Some system encode vietnamese combining accent as individual utf-8 characters
        // \u0300, \u0301, \u0303, \u0309, \u0323
        str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // ̀ ́ ̃ ̉ ̣ 
        return str;
    }

    function sanitizeFilename(str) {
        return str.replace(/[^a-zA-Z0-9_\-]/g, '');
    }

    let SETTINGS = {
        filenameFormat: 'id',
        convertVietnamese: true,
        spaceHandling: 'underscore'
    };

    // Initialize settings from storage
    chrome.storage.local.get(SETTINGS, (items) => {
        SETTINGS = { ...SETTINGS, ...items };
    });

    // Listen for changes (e.g. from popup)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            for (let key in changes) {
                if (changes[key].newValue !== undefined) {
                    SETTINGS[key] = changes[key].newValue;
                }
            }
        }
    });

    function getSettings() {
        return SETTINGS;
    }

    function saveSettings(settings) {
        chrome.storage.local.set(settings);
    }

    function generateFilename(id, title) {
        const settings = getSettings();
        let namePart = title;

        if (settings.convertVietnamese) {
            namePart = removeVietnameseTones(namePart);
        }

        if (settings.spaceHandling === 'underscore') {
            namePart = namePart.replace(/\s+/g, '_');
        } else {
            namePart = namePart.replace(/\s+/g, '');
        }

        namePart = sanitizeFilename(namePart);

        let filename = id;
        if (settings.filenameFormat === 'name') {
            filename = namePart;
        } else if (settings.filenameFormat === 'id_name') {
            filename = `${id}_${namePart}`;
        }

        return filename;
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

            // Get ID and Title for filename
            const id = getProblemId();
            let title = 'Problem';
            // Try to find title from DOM
            const titleElem = document.querySelector('.submit__nav span a.link--red') || document.querySelector('.body-header h2');
            if (titleElem) {
                // Remove ID from title if present (e.g. "C01001 - Title")
                let rawTitle = titleElem.textContent.trim();
                if (rawTitle.includes(id)) {
                    rawTitle = rawTitle.replace(id, '').replace(/^[\s\-\:]+/, '');
                }
                title = rawTitle;
            }

            const filename = generateFilename(id, title);
            const file = new File([blob], `${filename}${ext}`, { type: 'text/plain' });

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            // Dispatch change event for frameworks (Vue/React)
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            showNotification(`Đang nộp bài: ${filename}${ext}`, 'success');

            // Small delay to ensure file is processed
            setTimeout(() => {
                submitAction();
            }, 500);

        } catch (err) {
            console.error(err);
            showNotification('Không thể truy cập clipboard', 'error');
        }
    }

    function createSettingsUI() {
        // Inject styles for the modal
        if (!document.getElementById('settings-modal-style')) {
            const style = document.createElement('style');
            style.id = 'settings-modal-style';
            style.textContent = `
                .settings-modal {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    color: #2c3e50;
                }
                .settings-modal .header {
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #e9ecef;
                }
                .settings-modal h3 {
                    margin: 0;
                    color: #1890ff;
                    font-size: 18px;
                    font-weight: 600;
                }
                .settings-modal .section {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid #e9ecef;
                    margin-bottom: 15px;
                }
                .settings-modal .label {
                    font-weight: 600;
                    display: block;
                    margin-bottom: 10px;
                    color: #34495e;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .settings-modal label {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                    cursor: pointer;
                    padding: 6px 8px;
                    border-radius: 4px;
                    transition: background 0.2s;
                }
                .settings-modal label:hover {
                    background: #e9ecef;
                }
                .settings-modal input[type="radio"] {
                    margin-right: 10px;
                    accent-color: #1890ff;
                }
                .settings-modal .user-info {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid #e9ecef;
                    font-size: 13px;
                    line-height: 1.6;
                    margin-top: 20px;
                }
                .settings-modal .user-info h4 {
                    margin: 0 0 10px 0;
                    color: #1890ff;
                    font-size: 14px;
                }
                .settings-modal .user-info p {
                    margin: 4px 0;
                    display: flex;
                    justify-content: space-between;
                }
                .settings-modal .user-info a {
                    color: #1890ff;
                    text-decoration: none;
                    font-weight: 500;
                }
                .settings-modal .user-info a:hover {
                    text-decoration: underline;
                }
                .settings-modal .buttons {
                    text-align: right;
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                .settings-modal button {
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                    transition: all 0.2s;
                    border: none;
                }
                .settings-modal #saveSettings {
                    background: #1890ff;
                    color: white;
                    box-shadow: 0 2px 4px rgba(24, 144, 255, 0.2);
                }
                .settings-modal #saveSettings:hover {
                    background: #40a9ff;
                    transform: translateY(-1px);
                }
                .settings-modal #closeSettings {
                    background: #e9ecef;
                    color: #495057;
                }
                .settings-modal #closeSettings:hover {
                    background: #dee2e6;
                }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; padding: 25px; border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2); z-index: 10000;
            width: 400px; display: none;
        `;

        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.4); z-index: 9999; display: none;
            backdrop-filter: blur(2px);
        `;

        const settings = getSettings();

        modal.innerHTML = `
            <div class="header">
                <h3>Cài đặt Extension <span style="font-size: 12px; color: #666; font-weight: normal;">v0.1</span></h3>
            </div>
            
            <div class="section">
                <span class="label">Định dạng tên file</span>
                <div>
                    <label><input type="radio" name="filenameFormat" value="id" ${settings.filenameFormat === 'id' ? 'checked' : ''}> <span>ID (C01001)</span></label>
                    <label><input type="radio" name="filenameFormat" value="id_name" ${settings.filenameFormat === 'id_name' ? 'checked' : ''}> <span>ID_Tên (C01001_Ten_Bai)</span></label>
                    <label><input type="radio" name="filenameFormat" value="name" ${settings.filenameFormat === 'name' ? 'checked' : ''}> <span>Tên (Ten_Bai)</span></label>
                </div>
            </div>

            <div class="section">
                <span class="label">Xử lý khoảng trắng</span>
                <div>
                    <label><input type="radio" name="spaceHandling" value="underscore" ${settings.spaceHandling === 'underscore' ? 'checked' : ''}> <span>Thay bằng dấu gạch dưới (_)</span></label>
                    <label><input type="radio" name="spaceHandling" value="remove" ${settings.spaceHandling === 'remove' ? 'checked' : ''}> <span>Xóa bỏ</span></label>
                </div>
            </div>

            <div class="user-info">
                <h4>Thông tin tác giả</h4>
                <p><strong>Name:</strong> Nguyen Hoang Duc Tam</p>
                <p><strong>Student ID:</strong> B25DCCN523</p>
                <p><strong>Email:</strong> <a href="mailto:TamNHD.B25CN523@stu.ptit.edu.vn">TamNHD.B25CN523@stu.ptit.edu.vn</a></p>
                <p><strong>Facebook:</strong> <a href="https://facebook.com/nguyenhoangductam" target="_blank">nguyenhoangductam</a></p>
            </div>

            <div class="buttons">
                <button id="closeSettings">Đóng</button>
                <button id="saveSettings">Lưu Cài Đặt</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        const close = () => {
            modal.style.display = 'none';
            overlay.style.display = 'none';
        };

        const save = () => {
            const newSettings = {
                filenameFormat: modal.querySelector('input[name="filenameFormat"]:checked').value,
                spaceHandling: modal.querySelector('input[name="spaceHandling"]:checked').value
            };
            saveSettings(newSettings);
            showNotification('Đã lưu cài đặt!', 'success');
            close();
        };

        modal.querySelector('#closeSettings').onclick = close;
        modal.querySelector('#saveSettings').onclick = save;
        overlay.onclick = close;

        return {
            open: () => {
                // Refresh values from storage in case changed elsewhere
                const current = getSettings();
                const formatRadio = modal.querySelector(`input[name="filenameFormat"][value="${current.filenameFormat}"]`);
                if (formatRadio) formatRadio.checked = true;

                const spaceRadio = modal.querySelector(`input[name="spaceHandling"][value="${current.spaceHandling}"]`);
                if (spaceRadio) spaceRadio.checked = true;

                modal.style.display = 'block';
                overlay.style.display = 'block';
            }
        };
    }

    function addCopyTitleButton() {
        const id = getProblemId();
        let titleElem = document.querySelector('.submit__nav span a.link--red'); // Old site
        let isBeta = false;

        if (!titleElem) {
            titleElem = document.querySelector('.body-header h2'); // Beta site
            isBeta = true;
        }

        if (!titleElem || titleElem.querySelector('.copy-title-btn')) return;

        // Inject styles for the button if not already present
        if (!document.getElementById('copy-title-btn-style')) {
            const style = document.createElement('style');
            style.id = 'copy-title-btn-style';
            style.textContent = `
                .copy-title-btn {
                    margin-left: 12px;
                    font-size: 13px;
                    font-weight: 500;
                    padding: 5px 12px;
                    cursor: pointer;
                    border: 1px solid #d9d9d9;
                    border-radius: 6px;
                    background: #fff;
                    color: #333;
                    vertical-align: middle;
                    transform: translateY(0);
                    transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
                    box-shadow: 0 2px 0 rgba(0,0,0,0.015);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                }
                .copy-title-btn:hover {
                    color: #40a9ff;
                    border-color: #40a9ff;
                    background: #fff;
                }
                .copy-title-btn:active {
                    color: #096dd9;
                    border-color: #096dd9;
                    background: #f5f5f5;
                }
            `;
            document.head.appendChild(style);
        }

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-title-btn';
        copyBtn.textContent = 'Copy tên file';

        copyBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            let title = 'Problem';

            // Clone and remove button to get clean text
            const clone = titleElem.cloneNode(true);
            const btnInClone = clone.querySelector('.copy-title-btn');
            if (btnInClone) btnInClone.remove();

            let rawTitle = clone.textContent.trim();

            if (rawTitle.includes(id)) {
                rawTitle = rawTitle.replace(id, '').replace(/^[\s\-\:]+/, '');
            }
            title = rawTitle;

            // We need to get the extension. Since this button is outside the editor context,
            // we might need to find the compiler select again or default to .cpp if not found.
            // For simplicity, let's try to find the compiler select.
            let ext = '.cpp';
            const compilerOld = document.getElementById('compiler');
            const compilerBeta = document.querySelector('.compiler-container .ant-select-selection-item');

            if (compilerOld) {
                ext = getExtension(compilerOld.options[compilerOld.selectedIndex].text);
            } else if (compilerBeta) {
                ext = getExtension(compilerBeta.title || compilerBeta.textContent);
            }

            const filename = generateFilename(id, title) + ext;

            try {
                await navigator.clipboard.writeText(filename);
                showNotification(`Đã copy: ${filename}`, 'success');
            } catch (err) {
                showNotification('Lỗi copy', 'error');
            }
        };

        titleElem.appendChild(copyBtn);
    }

    function createEditor(container, submitBtn, fileInput, getCompilerText, submitAction) {
        const settingsUI = createSettingsUI();

        const editorSection = document.createElement('div');
        editorSection.className = 'code-editor-section';
        editorSection.innerHTML = `
            <textarea class="code-editor-textarea" placeholder="Dán code của bạn vào đây hoặc nhấn nút Dán từ Clipboard..."></textarea>
            <div class="editor-buttons-row">
                <div class="left-buttons">
                    <button class="editor-button" id="pasteBtn">Dán từ Clipboard</button>
                    <button class="editor-button secondary" id="clearBtn">Xóa</button>
                    <button class="editor-button secondary" id="settingsBtn" title="Cài đặt">Cài đặt</button>
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
        `;

        // Add some flex styles for the button row
        const style = document.createElement('style');
        style.textContent = `
            .editor-buttons-row { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; }
            .left-buttons, .right-buttons { display: flex; gap: 5px; }
            .editor-stats-row { text-align: right; font-size: 12px; color: #666; margin-top: 3px; }
        `;
        document.head.appendChild(style);

        container.appendChild(editorSection);

        const textarea = editorSection.querySelector('.code-editor-textarea');
        const pasteBtn = editorSection.querySelector('#pasteBtn');
        const clearBtn = editorSection.querySelector('#clearBtn');
        const settingsBtn = editorSection.querySelector('#settingsBtn');
        const submitCodeBtn = editorSection.querySelector('#submitCodeBtn');
        const lineCount = editorSection.querySelector('#lineCount');
        const charCount = editorSection.querySelector('#charCount');

        // Auto focus - Disabled to prevent auto-scroll
        // setTimeout(() => textarea.focus(), 100);

        function updateStats() {
            const text = textarea.value;
            const lines = text ? text.split('\n').length : 0;
            const chars = text.length;
            lineCount.textContent = lines;
            charCount.textContent = chars;
        }

        textarea.addEventListener('input', updateStats);

        textarea.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                submitCodeBtn.click();
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 4;
                updateStats();
            }
        });

        pasteBtn.onclick = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    textarea.value = text;
                    updateStats();
                    showNotification('Đã dán code từ clipboard', 'success');
                    textarea.focus();
                } else {
                    showNotification('Clipboard trống', 'warning');
                }
            } catch (err) {
                showNotification('Không thể truy cập clipboard', 'error');
            }
        };

        clearBtn.onclick = () => {
            textarea.value = '';
            updateStats();
            showNotification('Đã xóa code', 'info');
            textarea.focus();
        };

        settingsBtn.onclick = () => settingsUI.open();

        submitCodeBtn.onclick = () => {
            const code = textarea.value.trim();
            if (!code) {
                showNotification('Chưa có code để nộp', 'warning');
                return;
            }

            const ext = getExtension(getCompilerText());
            const blob = new Blob([code], { type: 'text/plain' });

            // Get ID for filename (User requested no specific name needed for submission)
            const id = getProblemId();
            const filename = id;
            const file = new File([blob], `${filename}${ext}`, { type: 'text/plain' });

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            showNotification(`Đang nộp bài...`, 'success');
            setTimeout(() => submitAction(), 500);
        };
    }

    // --- Site Specific Implementations ---

    function customizeOldSiteUI() {
        // Remove the big "THỬ NGHIỆM PHIÊN BẢN MỚI" banner
        const banner = document.querySelector('.username.container-fluid');
        if (banner) {
            banner.style.display = 'none';
        }

        // Add link to the navbar
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
        customizeOldSiteUI();

        waitForElement('.submit__pad', (submitPad) => {
            const submitBtn = submitPad.querySelector('.submit__pad__btn');
            const fileInput = document.getElementById('fileInput');
            const form = document.querySelector('.submit__pad form');

            if (!submitBtn || !fileInput || !form) return;

            // Paste and Submit Button
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

            // Editor
            createEditor(submitPad.parentNode, submitBtn, fileInput, getCompilerText, submitAction);

            // Move editor after submit pad
            const editor = document.querySelector('.code-editor-section');
            if (editor) {
                submitPad.parentNode.insertBefore(editor, submitPad.nextSibling);
            }

            // Inject Competitive Companion Data (Codeforces format)
            injectCompetitiveCompanionDataOld();

            // Add Copy Title Button
            addCopyTitleButton();

            // Add Copy Buttons to Tables
            addCopyButtons();
        });
    }

    function injectCompetitiveCompanionDataOld() {
        const urlParts = window.location.href.split('/');
        const currentId = urlParts[urlParts.length - 1];
        const existingContainer = document.getElementById('competitive-companion-data');

        if (existingContainer) {
            if (existingContainer.dataset.problemId === currentId) return;
            existingContainer.remove();
        }

        const titleElem = document.querySelector('.submit__nav span a.link--red');
        if (!titleElem) return;

        let title = titleElem.textContent.trim();
        if (currentId && !title.includes(currentId)) {
            title = `${currentId} - ${title}`;
        }

        // Use generated filename as title for Competitive Companion
        // Remove extension if present in generateFilename logic (it returns filename without ext usually, but let's be safe)
        // Actually generateFilename returns ID or ID_Name or Name.
        title = generateFilename(currentId, title);

        // Extract limits
        const timeElem = document.querySelector('.submit__req p:nth-child(1) span');
        const memoryElem = document.querySelector('.submit__req p:nth-child(2) span');

        let timeLimit = '1.0 s';
        let memoryLimitMb = '256 MB';

        if (timeElem) {
            const timeText = timeElem.textContent.trim();
            // Example: "2s" -> "2.0 s"
            timeLimit = timeText.replace('s', '.0 s');
        }

        if (memoryElem) {
            const memoryText = memoryElem.textContent.trim();
            // Example: "65536 Kb" -> "64 MB"
            const memoryKb = parseInt(memoryText);
            if (!isNaN(memoryKb)) {
                memoryLimitMb = Math.floor(memoryKb / 1024) + ' MB';
            }
        }

        // Create hidden container
        const container = document.createElement('div');
        container.id = 'competitive-companion-data';
        container.dataset.problemId = currentId;
        container.style.display = 'none';
        container.className = 'problem-statement'; // Codeforces class

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

        // Tests
        const table = document.querySelector('.Table') || document.querySelector('.MsoTableGrid') || document.querySelector('.TableGrid1') || document.querySelector('.TableGrid2') || document.querySelector('.TableGrid3') || document.querySelector('.submit__des table');
        if (table) {
            const rows = table.querySelectorAll('tr');
            // Skip header row if it exists
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

                    // Normalize newlines
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

    function initBetaSite() {
        // Guard to prevent multiple injections
        if (document.querySelector('.quick-submit-btn')) return;

        const submitContainer = document.querySelector('.submit-container');
        if (!submitContainer) return;

        const fileInput = submitContainer.querySelector('input[type="file"]');
        const realSubmitBtn = document.querySelector('.submit-status-container button.ant-btn-primary');

        if (!fileInput || !realSubmitBtn) return;

        // Double check to ensure we don't inject twice if calls overlap
        if (document.querySelector('.quick-submit-btn')) return;

        // Paste and Submit Button
        const quickSubmitBtn = document.createElement('button');
        quickSubmitBtn.className = 'ant-btn ant-btn-primary quick-submit-btn';
        quickSubmitBtn.textContent = 'Dán và Nộp bài';
        quickSubmitBtn.style.background = '#1890ff'; // Distinct color
        quickSubmitBtn.style.width = '30%';
        quickSubmitBtn.style.marginTop = '10px';
        quickSubmitBtn.style.marginLeft = 'auto';
        quickSubmitBtn.style.display = 'block';

        // Insert below the submit status container
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

        // Editor
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

        // Inject Competitive Companion Data (Codeforces format)
        injectCompetitiveCompanionData();

        // Add Copy Title Button
        addCopyTitleButton();
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

    function injectCompetitiveCompanionData() {
        const urlParts = window.location.href.split('/');
        const currentId = urlParts[urlParts.length - 1];
        const existingContainer = document.getElementById('competitive-companion-data');

        if (existingContainer) {
            if (existingContainer.dataset.problemId === currentId) return;
            existingContainer.remove();
        }

        const titleElem = document.querySelector('.body-header h2');
        const problemContainer = document.querySelector('.problem-container');
        const tableGrid = document.querySelector('.MsoTableGrid');

        if (!titleElem || !problemContainer) return;

        let title = titleElem.textContent.trim();
        if (currentId && !title.includes(currentId)) {
            title = `${currentId} - ${title}`;
        }

        // Use generated filename as title for Competitive Companion
        title = generateFilename(currentId, title);

        // Extract limits
        const text = problemContainer.textContent;
        const timeMatch = text.match(/Giới hạn thời gian:\s*(\d+)s/);
        const memoryMatch = text.match(/Giới hạn bộ nhớ:\s*(\d+)Kb/);

        const timeLimit = timeMatch ? timeMatch[1] + '.0 s' : '1.0 s';
        const memoryLimitKb = memoryMatch ? parseInt(memoryMatch[1]) : 256000;
        const memoryLimitMb = Math.floor(memoryLimitKb / 1024) + ' MB';

        // Create hidden container
        const container = document.createElement('div');
        container.id = 'competitive-companion-data';
        container.dataset.problemId = currentId;
        container.style.display = 'none';
        container.className = 'problem-statement'; // Codeforces class

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

        // Tests
        const table = document.querySelector('.MsoTableGrid') || document.querySelector('.Table') || document.querySelector('.TableGrid1') || document.querySelector('.TableGrid2') || document.querySelector('.TableGrid3') || document.querySelector('.problem-container table');
        if (table) {
            const rows = table.querySelectorAll('tr');
            // Skip header row if it exists
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

                    // Normalize newlines
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
            // Check if processed
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
                    // Check if cell has content
                    const text = cell.textContent.trim();
                    if (!text) return;

                    // Skip if content is just "Input" or "Output" (headers)
                    if (['input', 'output'].includes(text.toLowerCase())) return;

                    // Create container for relative positioning
                    if (cell.style.position !== 'absolute' && cell.style.position !== 'fixed') {
                        cell.style.position = 'relative';
                    }

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'copy-btn';
                    copyBtn.textContent = 'Copy';
                    copyBtn.title = 'Copy text';
                    copyBtn.style.cssText = `
                        position: absolute;
                        top: 5px;
                        right: 5px;
                        background: #f0f0f0;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        cursor: pointer;
                        padding: 4px 8px;
                        font-size: 11px;
                        z-index: 10;
                        color: #333;
                        font-family: sans-serif;
                        transition: all 0.2s;
                        opacity: 0.6;
                    `;

                    copyBtn.onmouseenter = () => {
                        copyBtn.style.opacity = '1';
                        copyBtn.style.background = '#fff';
                        copyBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    };

                    copyBtn.onmouseleave = () => {
                        copyBtn.style.opacity = '0.6';
                        copyBtn.style.background = '#f0f0f0';
                        copyBtn.style.boxShadow = 'none';
                    };

                    copyBtn.onclick = async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // Clone cell and remove button to avoid copying button text
                        const clone = cell.cloneNode(true);
                        const btnInClone = clone.querySelector('.copy-btn');
                        if (btnInClone) btnInClone.remove();

                        let text = clone.innerText;

                        // Fix: Remove extra newlines and indentation
                        // Split by newline, trim each line to remove leading/trailing whitespace (including indentation),
                        // filter out empty lines, and join back with a single newline.
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

    // --- Main Entry Point ---

    if (window.location.href.includes(CONFIG.oldUrlPart)) {
        console.log('PTIT Editor: Old Site Detected');
        initOldSite();
        // Add copy buttons after a short delay to ensure DOM is ready
        setTimeout(addCopyButtons, 1000);
    } else {
        // Beta Site - SPA Handling


        // Try immediately
        if (isBetaSite()) {
            initBetaSite();
            setTimeout(addCopyButtons, 1000);
        }

        // Observe for navigation/DOM changes
        const observer = new MutationObserver((mutations) => {
            if (isBetaSite()) {
                initBetaSite();
                addCopyButtons();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

})();
