(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'blurNSFW',
        'Blur NSFW',
        'Blurs NSFW images and attachments by default',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_blurNSFW = true;
        console.log('[BlurNSFW] Enabled - NSFW content will be blurred');
    };

    plugin.stop = function() {
        window._vc_blurNSFW = false;
        console.log('[BlurNSFW] Disabled');
    };

    Vencord.startPlugin('blurNSFW');
})();
