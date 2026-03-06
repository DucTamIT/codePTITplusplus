document.addEventListener('DOMContentLoaded', () => {
    const defaults = {
        nameFormat: '',
        ccNameFormat: '',
        customPorts: ''
    };

    const customPortsInput = document.getElementById('customPorts');
    const nameFormatInput = document.getElementById('nameFormat');
    const ccNameFormatInput = document.getElementById('ccNameFormat');
    const namePreview = document.getElementById('namePreview');
    const ccNamePreview = document.getElementById('ccNamePreview');

    // Utility: Remove Vietnamese Tones
    function removeVietnameseTones(str) {
        return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    // Utility: Camel Case
    function toCamelCase(str) {
        return str.toLowerCase()
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }

    // Mock problem data for preview
    const mockProblem = { id: 'C01001', name: 'TỔNG CỦA DÃY SỐ' };
    const mockVars = {
        '[id]': mockProblem.id,
        '[name]': mockProblem.name,
        '[ten]': mockProblem.name,
        '[name_ascii]': removeVietnameseTones(mockProblem.name),
        '[ten_kd]': removeVietnameseTones(mockProblem.name),
        '[name_ascii_underscore]': removeVietnameseTones(mockProblem.name).replace(/\s+/g, '_'),
        '[ten_gach]': removeVietnameseTones(mockProblem.name).replace(/\s+/g, '_'),
        '[name_camel]': toCamelCase(removeVietnameseTones(mockProblem.name)),
        '[ten_lien]': toCamelCase(removeVietnameseTones(mockProblem.name))
    };

    function updatePreview() {
        let nStr = nameFormatInput?.value || '';
        if (!nStr) nStr = '[id]_[ten_lien]';

        let ccStr = ccNameFormatInput?.value || '';
        if (!ccStr) ccStr = '[id] - [ten]';

        for (const [key, val] of Object.entries(mockVars)) {
            nStr = nStr.split(key).join(val);
            ccStr = ccStr.split(key).join(val);
        }

        if (namePreview) namePreview.textContent = nStr;
        if (ccNamePreview) ccNamePreview.textContent = ccStr;
    }

    // Load settings
    chrome.storage.local.get(defaults, (items) => {
        if (nameFormatInput) nameFormatInput.value = items.nameFormat || '';
        if (ccNameFormatInput) ccNameFormatInput.value = items.ccNameFormat || '';
        if (customPortsInput) customPortsInput.value = items.customPorts;

        // Ensure preview shows immediately on open
        setTimeout(() => { updatePreview(); }, 100);
    });

    // Auto-save on any change
    function saveCurrentSettings() {
        const nameFormat = nameFormatInput?.value || '';
        const ccNameFormat = ccNameFormatInput?.value || '';

        const settings = { nameFormat, ccNameFormat };
        if (customPortsInput) settings.customPorts = customPortsInput.value;

        chrome.storage.local.set(settings, () => {
            const status = document.getElementById('status');
            if (status) {
                status.textContent = 'Đã tự động lưu!';
                setTimeout(() => { status.textContent = ''; }, 1500);
            }
        });
    }

    // Listen to inputs
    if (nameFormatInput) {
        nameFormatInput.addEventListener('input', () => { updatePreview(); saveCurrentSettings(); });
    }
    if (ccNameFormatInput) {
        ccNameFormatInput.addEventListener('input', () => { updatePreview(); saveCurrentSettings(); });
    }

    // Handle chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const container = e.target.closest('.chip-container');
            if (!container) return;
            const targetId = container.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            // Get the text from the strong tag specifically
            const strongTag = e.currentTarget.querySelector('strong');
            const val = strongTag ? strongTag.textContent : e.currentTarget.textContent;

            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;

            input.value = text.substring(0, start) + val + text.substring(end);
            input.focus();
            input.setSelectionRange(start + val.length, start + val.length);

            updatePreview();
            saveCurrentSettings();
        });
    });

    // Auto-save ports on blur
    if (customPortsInput) {
        customPortsInput.addEventListener('blur', saveCurrentSettings);
    }

    // Keep save button as explicit option
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveCurrentSettings();
            const status = document.getElementById('status');
            if (status) {
                status.textContent = 'Đang tải lại trang...';
            }
            // Reload the active tab
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0]) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        });
    }

    // Display version from manifest
    const versionSpan = document.getElementById('ext-version');
    if (versionSpan) {
        versionSpan.textContent = 'v' + chrome.runtime.getManifest().version;
    }
});
