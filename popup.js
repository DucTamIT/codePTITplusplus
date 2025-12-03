document.addEventListener('DOMContentLoaded', () => {
    const defaults = {
        filenameFormat: 'name', // Default to name as per user preference seen in snippet
        spaceHandling: 'underscore'
    };

    // Load settings
    chrome.storage.local.get(defaults, (items) => {
        const formatRadio = document.querySelector(`input[name="filenameFormat"][value="${items.filenameFormat}"]`);
        if (formatRadio) formatRadio.checked = true;

        const spaceRadio = document.querySelector(`input[name="spaceHandling"][value="${items.spaceHandling}"]`);
        if (spaceRadio) spaceRadio.checked = true;
    });

    // Save settings
    document.getElementById('saveBtn').addEventListener('click', () => {
        const filenameFormat = document.querySelector('input[name="filenameFormat"]:checked').value;
        const spaceHandling = document.querySelector('input[name="spaceHandling"]:checked').value;

        chrome.storage.local.set({
            filenameFormat: filenameFormat,
            spaceHandling: spaceHandling
        }, () => {
            const status = document.getElementById('status');
            status.textContent = 'Đã lưu cài đặt!';
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        });
    });
});
