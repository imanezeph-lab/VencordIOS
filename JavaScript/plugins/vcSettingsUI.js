(function() {
    'use strict';

    const settingsId = 'vencord-settings';

    function createSettingsPanel() {
        if (document.getElementById(settingsId)) return;

        const panel = document.createElement('div');
        panel.id = settingsId;
        panel.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99999;background:#2C2F33;border-radius:16px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:320px;width:90vw;font-family:sans-serif;color:#fff;';

        let html = '<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;\">';
        html += '<h3 style=\"margin:0;font-size:16px;\">Vencord iOS ' + Vencord.version + '</h3>';
        html += '<span id=\"vencord-close\" style=\"cursor:pointer;font-size:20px;color:#999;\">✕</span></div>';

        html += '<div style=\"font-size:12px;color:#999;margin-bottom:8px;\">Plugins (' + Object.keys(Vencord.Plugins).length + ' loaded)</div>';

        Object.keys(Vencord.Plugins).forEach(function(id) {
            const p = Vencord.Plugins[id];
            const checked = p.enabled ? 'checked' : '';
            html += '<label style=\"display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #36393f;font-size:13px;\">';
            html += '<input type=\"checkbox\" data-plugin=\"' + id + '\" ' + checked + ' style=\"margin-right:8px;\">';
            html += '<div><strong>' + p.name + '</strong><br><span style=\"color:#999;font-size:11px;\">' + p.description + '</span></div>';
            html += '</label>';
        });

        panel.innerHTML = html;
        document.body.appendChild(panel);

        document.getElementById('vencord-close').onclick = function() {
            panel.style.display = 'none';
        };

        panel.querySelectorAll('input[data-plugin]').forEach(function(input) {
            input.onchange = function() {
                const pluginId = this.getAttribute('data-plugin');
                Vencord.Plugins[pluginId].enabled = this.checked;
                if (this.checked) {
                    Vencord.startPlugin(pluginId);
                } else {
                    Vencord.stopPlugin(pluginId);
                }
            };
        });
    }

    function injectSettingsButton() {
        const btn = document.createElement('div');
        btn.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99998;background:#5865F2;border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(88,101,242,0.4);cursor:pointer;font-size:20px;';
        btn.textContent = 'V';
        btn.onclick = function() {
            const panel = document.getElementById(settingsId);
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            } else {
                createSettingsPanel();
            }
        };
        document.body.appendChild(btn);
    }

    if (document.body) {
        injectSettingsButton();
    } else {
        document.addEventListener('DOMContentLoaded', injectSettingsButton);
    }
})();
