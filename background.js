// Background service worker for codePTIT++
// Handles sending problem data to CC-compatible IDEs via localhost POST

const DEFAULT_PORTS = [
    1327,  // cpbooster
    4244,  // Hightail
    6174,  // Mind Sport
    10042, // acmX
    10043, // Caide and AI Virtual Assistant
    10045, // CP Editor
    27121, // Competitive Programming Helper
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'sendToIDE') {
        const { payload, customPorts } = message;
        const allPorts = [...new Set([...DEFAULT_PORTS, ...(customPorts || [])])];
        sendToAllPorts(payload, allPorts).then(sendResponse);
        return true; // keep channel open for async response
    }
});

async function sendToAllPorts(payload, ports) {
    const results = await Promise.allSettled(
        ports.map(port => sendToPort(payload, port))
    );

    const succeeded = [];
    const failed = [];

    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            succeeded.push(ports[i]);
        } else {
            failed.push(ports[i]);
        }
    });

    return { succeeded, failed };
}

async function sendToPort(payload, port) {
    const response = await fetch(`http://localhost:${port}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok && response.status !== 0) {
        throw new Error(`Port ${port}: HTTP ${response.status}`);
    }

    return port;
}
