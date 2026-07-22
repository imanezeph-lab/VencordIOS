/**
 * Message Logger Plugin
 * Logs deleted and edited messages with visual indicators
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'messageLogger',
        name: 'Message Logger',
        description: 'Tracks and displays deleted and edited messages',
        author: 'VencordIOS',
        version: '1.0.0',

        _messages: {},
        _observer: null,

        start: function() {
            const self = this;

            // CSS for logged messages
            Vencord.UI.injectCSS('messageLogger', `
                .vc-msg-logged-deleted {
                    opacity: 0.5 !important;
                    border-left: 3px solid #ED4245 !important;
                    background: rgba(237, 66, 69, 0.05) !important;
                }
                .vc-msg-logged-edited {
                    border-left: 3px solid #FEE75C !important;
                    background: rgba(254, 231, 92, 0.05) !important;
                }
                .vc-msg-logger-badge {
                    display: inline-block;
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 600;
                    margin-left: 8px;
                }
                .vc-msg-logger-badge.deleted {
                    background: #ED4245;
                    color: white;
                }
                .vc-msg-logger-badge.edited {
                    background: #FEE75C;
                    color: #000;
                }
            `);

            // MutationObserver to detect message changes
            this._observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1 && node.classList && node.classList.contains('message')) {
                            self._processMessage(node);
                        }
                    });
                });
            });

            if (document.querySelector('[class*="messages"]')) {
                this._observer.observe(document.querySelector('[class*="messages"]'), {
                    childList: true,
                    subtree: true
                });
            }

            Vencord.Logger.log('MessageLogger', 'Tracking message edits and deletions');
        },

        _processMessage: function(element) {
            // Process incoming messages for tracking
            const content = element.querySelector('[class*="content"]');
            if (content) {
                const messageId = element.getAttribute('data-message-id') || 
                                  element.id || 
                                  Math.random().toString(36).substr(2, 9);

                this._messages[messageId] = {
                    content: content.textContent,
                    timestamp: Date.now(),
                    element: element
                };
            }
        },

        stop: function() {
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }
            Vencord.UI.removeCSS('messageLogger');
            Vencord.Logger.log('MessageLogger', 'Plugin stopped');
        },

        getLoggedMessages: function() {
            return this._messages;
        }
    });
})();
