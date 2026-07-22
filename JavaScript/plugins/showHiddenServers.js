(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'showHiddenServers',
        'Show Hidden Servers',
        'Shows servers that are hidden from the server list',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_showHiddenServers = true;
        console.log('[ShowHiddenServers] Enabled');
    };

    plugin.stop = function() {
        window._vc_showHiddenServers = false;
        console.log('[ShowHiddenServers] Disabled');
    };

    Vencord.startPlugin('showHiddenServers');
})();
