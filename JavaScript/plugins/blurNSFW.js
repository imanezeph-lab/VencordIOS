/**
 * Blur NSFW Plugin
 * Blurs NSFW images and attachments by default
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'blurNSFW',
        name: 'Blur NSFW',
        description: 'Blurs NSFW images until clicked',
        author: 'VencordIOS',
        version: '1.0.0',

        _observer: null,

        start: function() {
            const self = this;

            // CSS for blur effect
            Vencord.UI.injectCSS('blurNSFW', `
                .vc-nsfw-blurred {
                    filter: blur(20px) !important;
                    transition: filter 0.3s ease !important;
                    cursor: pointer !important;
                }
                .vc-nsfw-blurred:hover {
                    filter: blur(10px) !important;
                }
                .vc-nsfw-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0,0,0,0.3);
                    color: white;
                    font-size: 14px;
                    font-weight: 600;
                    pointer-events: none;
                    border-radius: 8px;
                }
            `);

            // Observe for new images
            this._observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) {
                            self._blurNSFWImages(node);
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

            // Initial blur
            this._blurAllNSFWImages();

            Vencord.Logger.log('BlurNSFW', 'NSFW blur enabled');
        },

        _blurNSFWImages: function(container) {
            const images = container.querySelectorAll ? 
                container.querySelectorAll('img, video, [class*="attachment"]') : [];

            images.forEach(function(img) {
                // Check if in NSFW channel (simplified check)
                const isNSFW = img.closest('[class*="nsfw"]') || 
                               img.closest('[class*="age-restricted"]') ||
                               img.closest('[data-channel-type="nsfw"]');

                if (isNSFW && !img.classList.contains('vc-nsfw-unblurred')) {
                    img.classList.add('vc-nsfw-blurred');

                    // Add overlay
                    const overlay = document.createElement('div');
                    overlay.className = 'vc-nsfw-overlay';
                    overlay.textContent = 'NSFW - Click to reveal';

                    const wrapper = img.parentElement;
                    if (wrapper) {
                        wrapper.style.position = 'relative';
                        wrapper.appendChild(overlay);

                        // Click to unblur
                        wrapper.addEventListener('click', function handler() {
                            img.classList.remove('vc-nsfw-blurred');
                            img.classList.add('vc-nsfw-unblurred');
                            overlay.remove();
                            wrapper.removeEventListener('click', handler);
                        });
                    }
                }
            });
        },

        _blurAllNSFWImages: function() {
            const self = this;
            document.querySelectorAll('img, video, [class*="attachment"]').forEach(function(img) {
                self._blurNSFWImages(img.closest('[class*="message"]') || img.parentElement);
            });
        },

        stop: function() {
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }
            Vencord.UI.removeCSS('blurNSFW');

            // Remove all blurs
            document.querySelectorAll('.vc-nsfw-blurred').forEach(function(el) {
                el.classList.remove('vc-nsfw-blurred');
            });
            document.querySelectorAll('.vc-nsfw-overlay').forEach(function(el) {
                el.remove();
            });

            Vencord.Logger.log('BlurNSFW', 'Plugin stopped');
        }
    });
})();
