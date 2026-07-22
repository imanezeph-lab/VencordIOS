(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'betterEmbeds',
        'Better Embeds',
        'Always expand embeds and improve embed rendering',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_alwaysExpandEmbeds = true;
        console.log('[BetterEmbeds] Enabled - embeds will always expand');
    };

    plugin.stop = function() {
        window._vc_alwaysExpandEmbeds = false;
        console.log('[BetterEmbeds] Disabled');
    };

    Vencord.startPlugin('betterEmbeds');
})();
