/**
 * Vencord iOS - Plugin Manager
 * Handles plugin loading, state persistence, and UI
 */

(function() {
    'use strict';

    function waitForVencord(callback, maxAttempts) {
        maxAttempts = maxAttempts || 50;
        let attempts = 0;

        function check() {
            if (window._vencordReady && window.Vencord) {
                callback();
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(check, 200);
            }
        }
        check();
    }

    function createSettingsUI() {
        if (document.getElementById('vencord-settings-panel')) return;

        // Settings button
        const fab = document.createElement('div');
        fab.id = 'vencord-fab';
        fab.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 16px;
            z-index: 99999;
            width: 52px;
            height: 52px;
            background: linear-gradient(135deg, #5865F2, #EB459E);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 15px rgba(88,101,242,0.5);
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            user-select: none;
            -webkit-user-select: none;
        `;
        fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;

        fab.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.9)';
        });
        fab.addEventListener('touchend', function() {
            this.style.transform = 'scale(1)';
        });

        document.body.appendChild(fab);

        // Settings panel
        const panel = document.createElement('div');
        panel.id = 'vencord-settings-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 100000;
            background: #36393f;
            border-radius: 16px;
            padding: 0;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            width: 90vw;
            max-width: 380px;
            max-height: 80vh;
            overflow: hidden;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #dcddde;
        `;

        let html = `
            <div style="background: linear-gradient(135deg, #5865F2, #EB459E); padding: 16px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2 style="margin: 0; font-size: 18px; color: white;">Vencord iOS</h2>
                    <p style="margin: 4px 0 0; font-size: 12px; color: rgba(255,255,255,0.8);">v${Vencord.version} | ${Object.keys(Vencord.Plugins).length} plugins</p>
                </div>
                <div id="vencord-close-btn" style="width: 32px; height: 32px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: white; font-size: 18px;">✕</div>
            </div>
            <div style="overflow-y: auto; max-height: calc(80vh - 70px); padding: 8px;">
        `;

        // Plugins section
        html += `<div style="padding: 8px 12px; font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 1px;">Plugins</div>`;

        const plugins = Vencord.pluginOrder.map(function(id) { return Vencord.Plugins[id]; });

        plugins.forEach(function(plugin) {
            const checked = plugin.enabled ? 'checked' : '';
            html += `
                <div style="padding: 12px; margin: 4px 8px; background: #2f3136; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 14px; font-weight: 600; color: #fff;">${plugin.name}</div>
                        <div style="font-size: 12px; color: #999; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${plugin.description}</div>
                        <div style="font-size: 10px; color: #666; margin-top: 4px;">by ${plugin.author} v${plugin.version}</div>
                    </div>
                    <label style="position: relative; display: inline-block; width: 44px; height: 24px; margin-left: 12px; flex-shrink: 0;">
                        <input type="checkbox" data-vencord-plugin="${plugin.id}" ${checked} style="opacity: 0; width: 0; height: 0;">
                        <span class="vencord-toggle" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: ${plugin.enabled ? '#5865F2' : '#72767d'}; transition: 0.3s; border-radius: 24px;">
                            <span style="position: absolute; content: ''; height: 18px; width: 18px; left: ${plugin.enabled ? '22px' : '3px'}; bottom: 3px; background: white; transition: 0.3s; border-radius: 50%;"></span>
                        </span>
                    </label>
                </div>
            `;
        });

        html += `</div>`;
        panel.innerHTML = html;
        document.body.appendChild(panel);

        // Overlay
        const overlay = document.createElement('div');
        overlay.id = 'vencord-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            z-index: 99999;
            display: none;
        `;
        document.body.appendChild(overlay);

        // Event listeners
        fab.addEventListener('click', function() {
            panel.style.display = 'block';
            overlay.style.display = 'block';
        });

        overlay.addEventListener('click', function() {
            panel.style.display = 'none';
            overlay.style.display = 'none';
        });

        document.getElementById('vencord-close-btn').addEventListener('click', function() {
            panel.style.display = 'none';
            overlay.style.display = 'none';
        });

        // Toggle handlers
        panel.querySelectorAll('input[data-vencord-plugin]').forEach(function(input) {
            input.addEventListener('change', function() {
                const pluginId = this.getAttribute('data-vencord-plugin');
                Vencord.togglePlugin(pluginId);

                const toggle = this.nextElementSibling;
                const dot = toggle.querySelector('span');

                if (this.checked) {
                    toggle.style.background = '#5865F2';
                    dot.style.left = '22px';
                } else {
                    toggle.style.background = '#72767d';
                    dot.style.left = '3px';
                }
            });
        });
    }

    waitForVencord(function() {
        setTimeout(createSettingsUI, 2000);
        Vencord.Logger.log('Manager', 'Plugin manager UI initialized');
    });
})();
