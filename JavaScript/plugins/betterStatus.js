(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'betterStatus',
        'Better Status',
        'Custom status messages and invisible status option',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_betterStatus = true;
        console.log('[BetterStatus] Enabled - enhanced status options available');
    };

    plugin.setStatus = function(status, text) {
        console.log('[BetterStatus] Setting status: ' + status + ' - ' + text);
    };

    plugin.stop = function() {
        window._vc_betterStatus = false;
        console.log('[BetterStatus] Disabled');
    };

    Vencord.startPlugin('betterStatus');
})();
