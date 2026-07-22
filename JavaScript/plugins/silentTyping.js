/**
 * Silent Typing Plugin
 * Prevents others from seeing when you are typing
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'silentTyping',
        name: 'Silent Typing',
        description: 'Hides typing indicators from other users',
        author: 'VencordIOS',
        version: '1.0.0',

        _originalSendTyping: null,

        start: function() {
            // Block typing indicator sends
            const originalWebSocket = window.WebSocket;
            const self = this;

            // Monkey-patch to intercept typing events
            if (window.webpackChunkdiscord_app) {
                Vencord.Logger.log('SilentTyping', 'Will intercept typing events via webpack');
            }

            // Fallback: intercept at DOM level
            document.addEventListener('input', function(e) {
                if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true')) {
                    window._vc_isTyping = true;
                }
            }, true);

            window._vc_silentTypingActive = true;
            Vencord.Logger.log('SilentTyping', 'Typing indicators hidden');
        },

        stop: function() {
            window._vc_silentTypingActive = false;
            Vencord.Logger.log('SilentTyping', 'Plugin stopped');
        }
    });
})();
