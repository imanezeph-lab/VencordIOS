/**
 * Emoji Utilities Plugin
 * Copy any emoji, see emoji info, and enhanced emoji features
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'emojiUtilities',
        name: 'Emoji Utilities',
        description: 'Copy emojis and view emoji information',
        author: 'VencordIOS',
        version: '1.0.0',

        start: function() {
            const self = this;

            // Long-press on emojis to copy
            document.addEventListener('touchstart', function(e) {
                const emoji = e.target.closest('[class*="emoji"]');
                if (emoji && emoji.textContent) {
                    self._showEmojiActions(emoji);
                }
            }, { passive: true });

            Vencord.Logger.log('EmojiUtilities', 'Emoji enhancements enabled');
        },

        _showEmojiActions: function(emojiElement) {
            const emoji = emojiElement.textContent;
            const name = emojiElement.getAttribute('alt') || emojiElement.getAttribute('aria-label') || 'Unknown';

            // Copy emoji
            if (navigator.clipboard) {
                navigator.clipboard.writeText(emoji).then(function() {
                    Vencord.UI.showToast('Emoji copied!', 'success');
                });
            }
        },

        copyEmoji: function(emoji) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(emoji);
            }
        },

        stop: function() {
            Vencord.Logger.log('EmojiUtilities', 'Plugin stopped');
        }
    });
})();
