(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'emojiUtilities',
        'Emoji Utilities',
        'Copy any emoji, see emoji info, and use emoji autocomplete',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_emojiUtilities = true;
        console.log('[EmojiUtilities] Enabled - enhanced emoji features');
    };

    plugin.copyEmoji = function(emoji) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(emoji);
            console.log('[EmojiUtilities] Copied emoji:', emoji);
        }
    };

    plugin.stop = function() {
        window._vc_emojiUtilities = false;
        console.log('[EmojiUtilities] Disabled');
    };

    Vencord.startPlugin('emojiUtilities');
})();
