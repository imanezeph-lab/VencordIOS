(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'silentTyping',
        'Silent Typing',
        'Prevents others from seeing when you are typing',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_silentTyping = true;
        console.log('[SilentTyping] Enabled - typing indicators hidden');
    };

    plugin.stop = function() {
        window._vc_silentTyping = false;
        console.log('[SilentTyping] Disabled');
    };

    Vencord.startPlugin('silentTyping');
})();
