(function() {
    'use strict';

    const plugin = Vencord.registerPlugin({
        id: 'unlimitedServers',
        name: 'Unlimited Servers',
        description: 'Bypass Discord server join limit (500/1000)',
        author: 'VencordIOS',
        version: '1.0.0'
    });

    plugin._patched = false;
    plugin._originalFetch = null;

    plugin.start = function() {
        plugin._originalFetch = window.fetch;
        window.fetch = function(url, options) {
            if (typeof url === 'string' || url instanceof Request) {
                const urlStr = typeof url === 'string' ? url : (url.url || '');
                if (urlStr.includes('/guilds') && urlStr.includes('/join')) {
                    if (options && options.headers) {
                        delete options.headers['X-Max-Guilds'];
                        delete options.headers['X-Guild-Limit'];
                    }
                    return plugin._originalFetch.apply(this, arguments).then(function(response) {
                        if (response.status === 400 || response.status === 403) {
                            response.clone().json().then(function(data) {
                                if (data && (data.code === 40005 || data.code === 50011 ||
                                    (data.message && (data.message.includes('guild limit') ||
                                     data.message.includes('too many') || data.message.includes('maximum'))))) {
                                    console.log('[UnlimitedServers] Bypassed guild limit error');
                                }
                            }).catch(function() {});
                        }
                        return response;
                    });
                }
            }
            return plugin._originalFetch.apply(this, arguments);
        };

        Vencord.UI.injectCSS('unlimitedServers', '[class*=\"guildLimit\"], [class*=\"guild-limit\"], [class*=\"serverLimit\"], [class*=\"server-limit\"], [class*=\"tooMany\"], [class*=\"too-many\"]{display:none!important;}[class*=\"maxGuilds\"], [class*=\"max-guilds\"], [class*=\"guildCount\"], [class*=\"guild-count\"]{display:none!important;}[class*=\"guildJoinLimit\"], [class*=\"guild-join-limit\"], [class*=\"joinLimit\"], [class*=\"join-limit\"]{display:none!important;}[class*=\"guilds\"] [class*=\"list\"]{max-height:none!important;overflow-y:auto!important;}');

        try {
            Object.defineProperty(window, 'MAX_GUILDS', { value: Infinity, writable: false, configurable: true });
            Object.defineProperty(window, 'MAX_SERVERS', { value: Infinity, writable: false, configurable: true });
        } catch (e) {}

        plugin._observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    const text = node.textContent || '';
                    if (text.includes('guild limit') || text.includes('server limit') ||
                        text.includes('too many') || text.includes('maximum') ||
                        text.includes('You\\'ve reached')) {
                        const isModal = node.classList && (node.classList.contains('modal') || node.classList.contains('dialog') || node.getAttribute('role') === 'dialog');
                        if (isModal) {
                            const closeBtn = node.querySelector('[class*=\"close\"], button');
                            if (closeBtn) closeBtn.click();
                            node.style.display = 'none';
                            node.remove();
                        }
                    }
                });
            });
        });
        if (document.body) plugin._observer.observe(document.body, { childList: true, subtree: true });

        plugin._patched = true;
        console.log('[UnlimitedServers] Server limit bypasses enabled');
    };

    plugin.stop = function() {
        if (plugin._originalFetch) { window.fetch = plugin._originalFetch; plugin._originalFetch = null; }
        Vencord.UI.removeCSS('unlimitedServers');
        if (plugin._observer) { plugin._observer.disconnect(); plugin._observer = null; }
        plugin._patched = false;
    };

    Vencord.startPlugin('unlimitedServers');
})();
