(function() {
    'use strict';

    const plugin = Vencord.registerPlugin({
        id: 'multiAccount',
        name: 'Multi Account Switcher',
        description: 'Switch between accounts without logging out',
        author: 'VencordIOS',
        version: '1.0.0'
    });

    plugin._accounts = [];
    plugin._storageKey = 'vencord_accounts';

    plugin._loadAccounts = function() {
        try {
            const data = localStorage.getItem(plugin._storageKey);
            if (data) plugin._accounts = JSON.parse(data);
        } catch (e) { plugin._accounts = []; }
    };

    plugin._saveAccounts = function() {
        try { localStorage.setItem(plugin._storageKey, JSON.stringify(plugin._accounts)); }
        catch (e) { console.error('[MultiAccount] Save failed:', e); }
    };

    plugin._getCurrentToken = function() {
        try {
            const token = localStorage.getItem('token');
            return token ? token.replace(/\"/g, '') : null;
        } catch (e) { return null; }
    };

    plugin._getUsername = function() {
        try {
            const user = window._vc_currentUser || {};
            return user.username || 'Unknown';
        } catch (e) { return 'Unknown'; }
    };

    plugin._getAvatar = function() {
        try {
            const user = window._vc_currentUser || {};
            if (user.avatar) return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png?size=128';
            return null;
        } catch (e) { return null; }
    };

    plugin._escapeHtml = function(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    plugin.saveCurrentAccount = function(label) {
        const token = plugin._getCurrentToken();
        const username = plugin._getUsername();
        const avatar = plugin._getAvatar();

        if (!token) { console.log('[MultiAccount] No token found'); return false; }

        const id = username + '_' + Date.now();
        const existing = plugin._accounts.find(function(a) { return a.username === username; });

        if (existing) {
            existing.token = token;
            existing.avatar = avatar;
            existing.label = label || username;
            existing.lastUsed = Date.now();
        } else {
            plugin._accounts.push({
                id: id, token: token, username: username, avatar: avatar,
                label: label || username, savedAt: Date.now(), lastUsed: Date.now()
            });
        }

        plugin._saveAccounts();
        console.log('[MultiAccount] Saved account:', username);
        return true;
    };

    plugin.switchToAccount = function(accountId) {
        const account = plugin._accounts.find(function(a) { return a.id === accountId; });
        if (!account) { console.log('[MultiAccount] Account not found'); return; }

        try {
            localStorage.setItem('token', JSON.stringify(account.token));
            account.lastUsed = Date.now();
            plugin._saveAccounts();
            setTimeout(function() { location.reload(); }, 500);
        } catch (e) { console.error('[MultiAccount] Switch failed:', e); }
    };

    plugin.removeAccount = function(accountId) {
        const index = plugin._accounts.findIndex(function(a) { return a.id === accountId; });
        if (index !== -1) {
            const removed = plugin._accounts.splice(index, 1)[0];
            plugin._saveAccounts();
            console.log('[MultiAccount] Removed:', removed.username);
        }
    };

    plugin.start = function() {
        plugin._loadAccounts();

        const container = document.createElement('div');
        container.id = 'vc-account-switcher';
        container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100002;display:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
        container.innerHTML = '<div id=\"vc-as-bg\" style=\"position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);\"></div><div id=\"vc-as-panel\" style=\"position:relative;background:#36393f;border-radius:16px;width:90vw;max-width:400px;max-height:80vh;overflow:hidden;margin:auto;top:50vh;transform:translateY(-50%);box-shadow:0 8px 32px rgba(0,0,0,0.5);display:flex;flex-direction:column;\"><div style=\"background:linear-gradient(135deg,#5865F2,#EB459E);padding:20px;display:flex;justify-content:space-between;align-items:center;\"><div><h2 style=\"margin:0;color:white;font-size:18px;font-weight:600;\">Account Switcher</h2><p id=\"vc-as-count\" style=\"margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;\">0 accounts</p></div><button id=\"vc-as-close\" style=\"width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:white;font-size:18px;border:none;\">✕</button></div><div id=\"vc-as-body\" style=\"overflow-y:auto;flex:1;padding:12px;\"></div><div style=\"padding:12px 16px;background:#2f3136;display:flex;gap:8px;border-top:1px solid #202225;\"><button id=\"vc-as-save\" style=\"flex:1;padding:12px;background:#5865F2;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;\">Save Current</button><button id=\"vc-as-export\" style=\"flex:1;padding:12px;background:#4f545c;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;\">Export</button></div></div>';
        document.body.appendChild(container);

        const fab = document.createElement('div');
        fab.id = 'vc-account-fab';
        fab.style.cssText = 'position:fixed;top:16px;right:16px;z-index:100001;width:44px;height:44px;background:linear-gradient(135deg,#5865F2,#EB459E);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(88,101,242,0.4);cursor:pointer;user-select:none;';
        fab.innerHTML = '<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"white\"><path d=\"M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\"/></svg>';
        document.body.appendChild(fab);

        plugin._refreshPanel = function() {
            const body = document.getElementById('vc-as-body');
            const countEl = document.getElementById('vc-as-count');
            if (!body) return;

            let html = '<div style=\"padding:16px;background:#2f3136;border-radius:12px;margin-bottom:12px;display:flex;align-items:center;gap:12px;\"><div style=\"width:48px;height:48px;border-radius:50%;background:#5865F2;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:600;flex-shrink:0;overflow:hidden;\">' + plugin._getUsername().charAt(0).toUpperCase() + '</div><div style=\"flex:1;min-width:0;\"><div style=\"font-size:10px;color:#5865F2;text-transform:uppercase;letter-spacing:1px;font-weight:600;\">Current Account</div><div style=\"font-size:16px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">' + plugin._escapeHtml(plugin._getUsername()) + '</div></div></div>';

            if (plugin._accounts.length > 0) {
                html += '<div style=\"font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;padding:8px 4px;\">Saved Accounts</div>';
                plugin._accounts.forEach(function(account) {
                    const lastUsed = account.lastUsed ? new Date(account.lastUsed).toLocaleDateString() : 'Never';
                    html += '<div data-vc-account=\"' + account.id + '\" style=\"display:flex;align-items:center;gap:12px;padding:12px;background:#2f3136;border-radius:12px;margin-bottom:8px;cursor:pointer;transition:background 0.2s;border:2px solid transparent;\"><div style=\"width:40px;height:40px;border-radius:50%;background:#5865F2;display:flex;align-items:center;justify-content:center;color:white;font-size:16px;font-weight:600;flex-shrink:0;\">' + (account.username ? account.username.charAt(0).toUpperCase() : '?') + '</div><div style=\"flex:1;min-width:0;\"><div style=\"font-size:14px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">' + plugin._escapeHtml(account.label || account.username) + '</div><div style=\"font-size:11px;color:#999;\">' + plugin._escapeHtml(account.username) + ' · Last: ' + lastUsed + '</div></div><div style=\"display:flex;gap:4px;\"><button data-vc-switch=\"' + account.id + '\" style=\"padding:8px 16px;background:#5865F2;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;\">Switch</button><button data-vc-remove=\"' + account.id + '\" style=\"padding:8px 12px;background:#ED4245;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;\">✕</button></div></div>';
                });
            } else {
                html += '<div style=\"text-align:center;padding:40px 20px;color:#999;\"><div style=\"font-size:48px;margin-bottom:12px;\">👤</div><p style=\"margin:0;font-size:14px;\">No saved accounts.</p><p style=\"margin:8px 0 0;font-size:12px;color:#666;\">Click \"Save Current\" to save this account</p></div>';
            }

            body.innerHTML = html;
            if (countEl) countEl.textContent = plugin._accounts.length + ' account' + (plugin._accounts.length !== 1 ? 's' : '') + ' saved';

            body.querySelectorAll('[data-vc-switch]').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = this.getAttribute('data-vc-switch');
                    if (confirm('Switch account? App will reload.')) plugin.switchToAccount(id);
                });
            });

            body.querySelectorAll('[data-vc-remove]').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = this.getAttribute('data-vc-remove');
                    if (confirm('Remove this saved account?')) {
                        plugin.removeAccount(id);
                        plugin._refreshPanel();
                    }
                });
            });
        };

        document.getElementById('vc-as-bg').addEventListener('click', function() {
            document.getElementById('vc-account-switcher').style.display = 'none';
        });
        document.getElementById('vc-as-close').addEventListener('click', function() {
            document.getElementById('vc-account-switcher').style.display = 'none';
        });
        fab.addEventListener('click', function() {
            plugin._refreshPanel();
            document.getElementById('vc-account-switcher').style.display = 'flex';
        });
        document.getElementById('vc-as-save').addEventListener('click', function() {
            const label = prompt('Label for this account (optional):');
            if (plugin.saveCurrentAccount(label)) plugin._refreshPanel();
        });
        document.getElementById('vc-as-export').addEventListener('click', function() {
            const blob = new Blob([JSON.stringify(plugin._accounts, null, 2)], {type: 'application/json'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'vencord_accounts.json';
            a.click();
        });

        plugin._refreshPanel();
        console.log('[MultiAccount] Plugin started - ' + plugin._accounts.length + ' accounts loaded');
    };

    plugin.stop = function() {
        const container = document.getElementById('vc-account-switcher');
        if (container) container.remove();
        const fab = document.getElementById('vc-account-fab');
        if (fab) fab.remove();
    };

    Vencord.startPlugin('multiAccount');
})();
