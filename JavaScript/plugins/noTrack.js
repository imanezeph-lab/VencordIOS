(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'noTrack',
        'No Track',
        'Blocks Discord analytics and tracking',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        if (typeof window !== 'undefined') {
            window._vc_analyticsBlocked = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                if (url && (url.includes('analytics') || url.includes('tracking') || url.includes('telemetry'))) {
                    console.log('[Vencord] Blocked tracking request:', url);
                    return;
                }
                return origOpen.apply(this, arguments);
            };
        }
        console.log('[NoTrack] Analytics blocking enabled');
    };

    plugin.stop = function() {
        console.log('[NoTrack] Plugin stopped');
    };

    Vencord.startPlugin('noTrack');
})();
