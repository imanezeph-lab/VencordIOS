(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'messageLogger',
        'Message Logger',
        'Logs deleted and edited messages',
        'VencordIOS',
        '1.0.0'
    );

    plugin._messageLog = [];

    plugin.start = function() {
        window._vc_messageLogger = true;
        console.log('[MessageLogger] Enabled - tracking message edits and deletions');
    };

    plugin.logMessage = function(message) {
        plugin._messageLog.push({
            timestamp: Date.now(),
            message: message
        });
    };

    plugin.getLog = function() {
        return plugin._messageLog;
    };

    plugin.stop = function() {
        window._vc_messageLogger = false;
        console.log('[MessageLogger] Disabled');
    };

    Vencord.startPlugin('messageLogger');
})();
