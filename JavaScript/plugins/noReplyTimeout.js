(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'noReplyTimeout',
        'No Reply Timeout',
        'Reply chains never get automatically collapsed',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_noReplyTimeout = true;
        console.log('[NoReplyTimeout] Enabled - reply chains will not collapse');
    };

    plugin.stop = function() {
        window._vc_noReplyTimeout = false;
        console.log('[NoReplyTimeout] Disabled');
    };

    Vencord.startPlugin('noReplyTimeout');
})();
