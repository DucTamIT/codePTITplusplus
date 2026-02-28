document.addEventListener('DOMContentLoaded', () => {
    const defaults = {
        nameFormat: 'id_name_ascii',
        ccNameFormat: 'cc_id_name'
    };

    // Load settings
    chrome.storage.local.get(defaults, (items) => {
        const formatRadio = document.querySelector(`input[name="nameFormat"][value="${items.nameFormat}"]`);
        if (formatRadio) formatRadio.checked = true;

        const ccRadio = document.querySelector(`input[name="ccNameFormat"][value="${items.ccNameFormat}"]`);
        if (ccRadio) ccRadio.checked = true;
    });

    // Save settings
    document.getElementById('saveBtn').addEventListener('click', () => {
        const nameFormat = document.querySelector('input[name="nameFormat"]:checked').value;
        const ccNameFormat = document.querySelector('input[name="ccNameFormat"]:checked').value;

        chrome.storage.local.set({
            nameFormat: nameFormat,
            ccNameFormat: ccNameFormat
        }, () => {
            const status = document.getElementById('status');
            status.textContent = 'Đã lưu cài đặt!';
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        });
    });

    // Display version from manifest
    const versionSpan = document.getElementById('ext-version');
    if (versionSpan) {
        versionSpan.textContent = 'v' + chrome.runtime.getManifest().version;
    }
});
