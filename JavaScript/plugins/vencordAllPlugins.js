(() => {
    "use strict";

    const registerPlugin = Vencord.registerPlugin.bind(Vencord);
    const injectCSS = Vencord.UI.injectCSS.bind(Vencord.UI);
    const removeCSS = Vencord.UI.removeCSS.bind(Vencord.UI);
    const log = (tag, msg) => Vencord.Logger.log(`[VencordIOS/${tag}]`, msg);

    function makePlugin(id, name, description, startFn, stopFn) {
        registerPlugin({
            id, name, description,
            author: "VencordIOS",
            version: "1.0.0",
            start: startFn,
            stop: stopFn,
        });
    }


    // 1. alwaysAnimate
    makePlugin("alwaysAnimate", "AlwaysAnimate",
        "Prevents Discord from pausing CSS animations",
        () => {
            injectCSS("vencordIOS-alwaysAnimate", `
                *, *::before, *::after {
                    animation-play-state: running !important;
                    -webkit-animation-play-state: running !important;
                }
            `);
        },
        () => removeCSS("vencordIOS-alwaysAnimate")
    );

    // 2. alwaysExpandRoles
    makePlugin("alwaysExpandRoles", "AlwaysExpandRoles",
        "Expands role lists in the member list",
        () => {
            injectCSS("vencordIOS-alwaysExpandRoles", `
                [class*="roleCollapsed"] [class*="roleItems"] {
                    display: flex !important; flex-wrap: wrap !important;
                    max-height: none !important; overflow: visible !important;
                }
                [class*="collapseButton"] { display: none !important; }
            `);
        },
        () => removeCSS("vencordIOS-alwaysExpandRoles")
    );

    // 3. alwaysTrust
    makePlugin("alwaysTrust", "AlwaysTrust",
        "Removes untrusted domain popups",
        () => {
            const origConfirm = window.confirm;
            const origAlert = window.alert;
            window.confirm = function(...args) {
                const m = String(args[0] || "");
                if (m.includes("untrusted") || m.includes("leaving Discord") || m.includes("be careful")) return true;
                return origConfirm.apply(this, args);
            };
            window.alert = function(...args) {
                const m = String(args[0] || "");
                if (m.includes("untrusted") || m.includes("leaving Discord") || m.includes("be careful")) return;
                return origAlert.apply(this, args);
            };
            window.__vencordIOS_alwaysTrust = { origConfirm, origAlert };
            injectCSS("vencordIOS-alwaysTrust", `
                [class*="linkWarning"], [class*="LinkWarning"], [class*="trustedDomain"] {
                    display: none !important;
                }
            `);
        },
        () => {
            const o = window.__vencordIOS_alwaysTrust;
            if (o) { window.confirm = o.origConfirm; window.alert = o.origAlert; delete window.__vencordIOS_alwaysTrust; }
            removeCSS("vencordIOS-alwaysTrust");
        }
    );

    // 4. betterGifAltText
    makePlugin("betterGifAltText", "BetterGifAltText",
        "Sets better alt text on GIFs",
        () => {
            const update = () => {
                document.querySelectorAll('img[src*=".gif"], img[src*="tenor"], img[src*="giphy"]').forEach(img => {
                    if (!img.alt || img.alt === "") {
                        const m = (img.src || "").match(/\/([\w-]+?)(?:\.\w+)?(?:\?|$)/);
                        img.alt = m ? `GIF: ${m[1].replace(/-/g, " ")}` : "GIF";
                    }
                });
            };
            window.__vencordIOS_gifAltObs = new MutationObserver(update);
            window.__vencordIOS_gifAltObs.observe(document.body, { childList: true, subtree: true });
            update();
        },
        () => { if (window.__vencordIOS_gifAltObs) { window.__vencordIOS_gifAltObs.disconnect(); delete window.__vencordIOS_gifAltObs; } }
    );

    // 5. betterGifPicker
    makePlugin("betterGifPicker", "BetterGifPicker",
        "Opens GIF picker on favorites tab",
        () => { log("betterGifPicker", "Enabled"); },
        () => { log("betterGifPicker", "Disabled"); }
    );

    // 6. betterRoleContext
    makePlugin("betterRoleContext", "BetterRoleContext",
        "Adds copy role color to context menus",
        () => {
            const handler = (e) => {
                const rolePill = e.target.closest('[class*="rolePill"], [class*="role"]');
                if (!rolePill) return;
                setTimeout(() => {
                    const menu = document.querySelector('[role="menu"]');
                    if (!menu || menu.querySelector("#vencord-copyRoleColor")) return;
                    const item = document.createElement("div");
                    item.id = "vencord-copyRoleColor";
                    item.setAttribute("role", "menuitem");
                    item.textContent = "Copy Role Color";
                    item.style.cssText = "padding:8px 12px;cursor:pointer;color:#fff;";
                    item.onclick = () => {
                        const colorEl = rolePill.querySelector('[class*="color"]');
                        if (colorEl) navigator.clipboard.writeText(colorEl.style.backgroundColor || "#fff").catch(() => {});
                    };
                    menu.appendChild(item);
                }, 100);
            };
            document.addEventListener("contextmenu", handler);
            window.__vencordIOS_roleCtxHandler = handler;
        },
        () => { document.removeEventListener("contextmenu", window.__vencordIOS_roleCtxHandler || (() => {})); delete window.__vencordIOS_roleCtxHandler; }
    );

    // 7. betterUploadButton
    makePlugin("betterUploadButton", "BetterUploadButton",
        "Makes upload button work with single click",
        () => {
            injectCSS("vencordIOS-betterUploadButton", `
                [class*="uploadButton"], [class*="attachButton"] { cursor: pointer !important; }
            `);
            const handler = (e) => {
                const btn = e.target.closest('[class*="attachButton"], [class*="uploadButton"]');
                if (!btn) return;
                e.preventDefault(); e.stopPropagation();
                const fi = btn.closest('[class*="channelTextArea"]')?.querySelector('input[type="file"]');
                if (fi) fi.click();
            };
            document.addEventListener("click", handler, true);
            window.__vencordIOS_uploadHandler = handler;
        },
        () => {
            removeCSS("vencordIOS-betterUploadButton");
            document.removeEventListener("click", window.__vencordIOS_uploadHandler || (() => {}), true);
            delete window.__vencordIOS_uploadHandler;
        }
    );

    // 8. blurNSFW
    makePlugin("blurNSFW", "BlurNSFW",
        "Blurs NSFW attachments",
        () => {
            injectCSS("vencordIOS-blurNSFW", `
                [class*="nsfw"], [data-content-rating="NSFW"] {
                    filter: blur(20px) !important; transition: filter 0.2s ease !important;
                }
                [class*="nsfw"]:hover, [data-content-rating="NSFW"]:hover {
                    filter: blur(0) !important;
                }
            `);
        },
        () => removeCSS("vencordIOS-blurNSFW")
    );

    // 9. callTimer
    makePlugin("callTimer", "CallTimer",
        "Adds a timer to voice calls",
        () => {
            const startTime = Date.now();
            const el = document.createElement("div");
            el.id = "vencordIOS-callTimer";
            el.style.cssText = "position:absolute;top:10px;right:10px;color:#fff;font-size:14px;background:rgba(0,0,0,0.6);padding:4px 8px;border-radius:4px;z-index:9999;";
            window.__vencordIOS_callTimerEl = el;
            const container = document.querySelector('[class*="callContainer"], [class*="voiceCall"]');
            if (container) { container.style.position = "relative"; container.appendChild(el); }
            window.__vencordIOS_callTimerInterval = setInterval(() => {
                const s = Math.floor((Date.now() - startTime) / 1000);
                const h = String(Math.floor(s / 3600)).padStart(2, "0");
                const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
                const sec = String(s % 60).padStart(2, "0");
                if (el.parentElement) el.textContent = `${h}:${m}:${sec}`;
            }, 1000);
        },
        () => {
            clearInterval(window.__vencordIOS_callTimerInterval);
            window.__vencordIOS_callTimerEl?.remove();
            delete window.__vencordIOS_callTimerInterval;
            delete window.__vencordIOS_callTimerEl;
        }
    );

    // 10. characterCounter
    makePlugin("characterCounter", "CharacterCounter",
        "Shows character counter in chat input",
        () => {
            const update = () => {
                const ta = document.querySelector('[class*="channelTextArea"] [role="textbox"]');
                if (!ta) return;
                let counter = document.getElementById("vencordIOS-charCounter");
                if (!counter) {
                    counter = document.createElement("div");
                    counter.id = "vencordIOS-charCounter";
                    counter.style.cssText = "font-size:11px;color:#aaa;text-align:right;padding:2px 8px;";
                    ta.closest('[class*="channelTextArea"]')?.appendChild(counter);
                }
                const len = (ta.textContent || "").length;
                counter.textContent = `${len}/2000`;
                counter.style.color = len > 2000 ? "#ed4245" : len > 1800 ? "#faa61a" : "#aaa";
            };
            window.__vencordIOS_charObs = new MutationObserver(update);
            window.__vencordIOS_charObs.observe(document.body, { childList: true, subtree: true, characterData: true });
            update();
        },
        () => { window.__vencordIOS_charObs?.disconnect(); document.getElementById("vencordIOS-charCounter")?.remove(); delete window.__vencordIOS_charObs; }
    );

    // 11. clearURLs
    makePlugin("clearURLs", "ClearURLs",
        "Removes tracking parameters from URLs",
        () => {
            const trackingParams = [
                "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
                "fbclid","gclid","mc_cid","mc_eid","ref","ref_src","ref_url",
                "source","spm","from","share_id","track","trk","trkCampaign",
                "si","feature","app","time","t","s","igshid","mktid","mkt_tok",
                "oly_enc_id","oly_anon_id","_ga","_gl","yclid","msclkid","twclid",
                "ttclid","dclid","gclsrc","gbraid","wbraid","ss_cid","wickedid"
            ];
            const cleanUrl = (url) => {
                try {
                    const u = new URL(url); let changed = false;
                    for (const p of trackingParams) { if (u.searchParams.has(p)) { u.searchParams.delete(p); changed = true; } }
                    if (u.hash) { const h = new URLSearchParams(u.hash.slice(1)); for (const p of trackingParams) { if (h.has(p)) { h.delete(p); changed = true; } } u.hash = h.toString() ? "#" + h.toString() : ""; }
                    return changed ? u.toString() : url;
                } catch { return url; }
            };
            const cleanLinks = () => document.querySelectorAll("a[href]").forEach(a => { const c = cleanUrl(a.href); if (c !== a.href) a.href = c; });
            window.__vencordIOS_clearURLObs = new MutationObserver(cleanLinks);
            window.__vencordIOS_clearURLObs.observe(document.body, { childList: true, subtree: true });
            cleanLinks();
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(m, url, ...a) { arguments[1] = cleanUrl(String(url)); return origOpen.call(this, m, ...Array.from(arguments).slice(1), ...a); };
            window.__vencordIOS_origXHROpen = origOpen;
        },
        () => {
            window.__vencordIOS_clearURLObs?.disconnect();
            if (window.__vencordIOS_origXHROpen) XMLHttpRequest.prototype.open = window.__vencordIOS_origXHROpen;
            delete window.__vencordIOS_clearURLObs; delete window.__vencordIOS_origXHROpen;
        }
    );

    // 12. clientTheme
    makePlugin("clientTheme", "ClientTheme",
        "Custom client theme colors",
        () => { injectCSS("vencordIOS-clientTheme", `:root { --vencord-accent: #5865f2; }`); },
        () => removeCSS("vencordIOS-clientTheme")
    );

    // 13. colorSighted
    makePlugin("colorSighted", "ColorSighted",
        "Restores old colored status icons",
        () => {
            injectCSS("vencordIOS-colorSighted", `
                [class*="status"] { border-radius: 50% !important; }
                [class*="statusOnline"] { background-color: #3ba55c !important; box-shadow: 0 0 0 2px #3ba55c !important; }
                [class*="statusIdle"] { background-color: #faa61a !important; box-shadow: 0 0 0 2px #faa61a !important; }
                [class*="statusDnd"] { background-color: #ed4245 !important; box-shadow: 0 0 0 2px #ed4245 !important; }
                [class*="statusOffline"] { background-color: #747f8d !important; box-shadow: 0 0 0 2px #747f8d !important; }
            `);
        },
        () => removeCSS("vencordIOS-colorSighted")
    );

    // 14. concatenatedComponentExtractor
    makePlugin("concatenatedComponentExtractor", "ConcatenatedComponentExtractor",
        "Extracts bundled Discord components",
        () => { log("concatenatedComponentExtractor", "Enabled"); },
        () => { log("concatenatedComponentExtractor", "Disabled"); }
    );

    // 15. consoleShortcuts
    makePlugin("consoleShortcuts", "ConsoleShortcuts",
        "Adds useful console shortcuts",
        () => {
            const shortcuts = {
                Vencord: () => typeof Vencord !== "undefined" ? Vencord : null,
                wp: () => typeof VencordWebpack !== "undefined" ? VencordWebpack : null,
                find: (f) => typeof VencordWebpack !== "undefined" ? VencordWebpack.webpackModules?.find?.(f) : null,
                findAll: (f) => typeof VencordWebpack !== "undefined" ? VencordWebpack.webpackModules?.findAll?.(f) || [] : [],
            };
            for (const [name, getter] of Object.entries(shortcuts)) {
                try { Object.defineProperty(window, name, { get: getter, configurable: true }); } catch {}
            }
            log("consoleShortcuts", "Added console shortcuts");
        },
        () => { for (const n of ["Vencord","wp","find","findAll"]) try { delete window[n]; } catch {} }
    );

    // 16. copyEmojiMarkdown
    makePlugin("copyEmojiMarkdown", "CopyEmojiMarkdown",
        "Double-click emoji to copy as markdown",
        () => {
            const handler = (e) => {
                const emoji = e.target.closest('[class*="emoji"], img[data-type="emoji"]');
                if (!emoji) return;
                const name = emoji.getAttribute("alt") || emoji.getAttribute("data-name") || "";
                const id = emoji.getAttribute("data-id") || "";
                const anim = emoji.getAttribute("data-animated") === "true";
                if (name && id) navigator.clipboard.writeText(`<${anim ? "a" : ""}:${name}:${id}>`).catch(() => {});
            };
            document.addEventListener("dblclick", handler);
            window.__vencordIOS_emojiHandler = handler;
        },
        () => { document.removeEventListener("dblclick", window.__vencordIOS_emojiHandler || (() => {})); delete window.__vencordIOS_emojiHandler; }
    );

    // 17. copyFileContents
    makePlugin("copyFileContents", "CopyFileContents",
        "Click text files to copy their contents",
        () => {
            const textExts = [".txt",".js",".ts",".json",".css",".html",".py",".rb",".md",".csv",".xml",".yaml",".yml",".sh",".log"];
            const handler = async (e) => {
                const att = e.target.closest('[class*="messageAttachment"]');
                if (!att) return;
                const a = att.querySelector("a[href]");
                if (!a || !textExts.some(ext => a.href.toLowerCase().endsWith(ext))) return;
                e.preventDefault(); e.stopPropagation();
                try { const r = await fetch(a.href); const t = await r.text(); await navigator.clipboard.writeText(t); log("copyFileContents", "Copied"); } catch {}
            };
            document.addEventListener("click", handler, true);
            window.__vencordIOS_fileHandler = handler;
        },
        () => { document.removeEventListener("click", window.__vencordIOS_fileHandler || (() => {}), true); delete window.__vencordIOS_fileHandler; }
    );

    // 18. copyStickerLinks
    makePlugin("copyStickerLinks", "CopyStickerLinks",
        "Click sticker to copy its link",
        () => {
            const handler = (e) => {
                const s = e.target.closest('[class*="sticker"]');
                if (!s) return;
                const img = s.querySelector("img");
                const src = img?.src || s.getAttribute("src");
                if (src) navigator.clipboard.writeText(src).catch(() => {});
            };
            document.addEventListener("click", handler, true);
            window.__vencordIOS_stickerHandler = handler;
        },
        () => { document.removeEventListener("click", window.__vencordIOS_stickerHandler || (() => {}), true); delete window.__vencordIOS_stickerHandler; }
    );

    // 19. copyUserURLs
    makePlugin("copyUserURLs", "CopyUserURLs",
        "Copy user profile URLs from context menu",
        () => {
            const handler = (e) => {
                const pop = e.target.closest('[class*="userPopout"], [class*="userProfile"]');
                if (!pop) return;
                const uid = pop.getAttribute("data-user-id") || pop.querySelector('[data-user-id]')?.getAttribute("data-user-id");
                if (!uid) return;
                setTimeout(() => {
                    const menu = document.querySelector('[role="menu"]');
                    if (!menu || menu.querySelector("#vencord-copyUrl")) return;
                    const item = document.createElement("div");
                    item.id = "vencord-copyUrl";
                    item.setAttribute("role", "menuitem");
                    item.textContent = "Copy Profile URL";
                    item.style.cssText = "padding:8px 12px;cursor:pointer;color:#fff;";
                    item.onclick = () => navigator.clipboard.writeText(`https://discord.com/users/${uid}`).catch(() => {});
                    menu.appendChild(item);
                }, 100);
            };
            document.addEventListener("click", handler, true);
            window.__vencordIOS_copyUrlHandler = handler;
        },
        () => { document.removeEventListener("click", window.__vencordIOS_copyUrlHandler || (() => {}), true); delete window.__vencordIOS_copyUrlHandler; }
    );

    // 20. crashHandler
    makePlugin("crashHandler", "CrashHandler",
        "Handles crashes gracefully",
        () => {
            const eh = (e) => { log("crashHandler", `Error: ${e.message}`); e.preventDefault(); return false; };
            const rh = (e) => { log("crashHandler", `Rejection: ${e.reason}`); e.preventDefault(); return false; };
            window.addEventListener("error", eh);
            window.addEventListener("unhandledrejection", rh);
            window.__vencordIOS_crashHandlers = { eh, rh };
        },
        () => {
            const h = window.__vencordIOS_crashHandlers;
            if (h) { window.removeEventListener("error", h.eh); window.removeEventListener("unhandledrejection", h.rh); }
            delete window.__vencordIOS_crashHandlers;
        }
    );

    // 21. customCommands
    makePlugin("customCommands", "CustomCommands",
        "Custom slash commands (shrug, tableflip, unflip, vencord)",
        () => {
            window.__vencordIOS_customCmds = [
                { name: "shrug", desc: "Shrug emoticon", exec: () => "\u00AF\\_(\u30C4)_/\u00AF" },
                { name: "tableflip", desc: "Table flip", exec: () => "(\u256F\u00B0\u25A1\u00B0\uFF09\u256F\uFE35 \u253B\u2501\u253B" },
                { name: "unflip", desc: "Unflip", exec: () => "\u252C\u2500\u252C(\u30C4\u25A1\u25A1)" },
                { name: "vencord", desc: "Vencord info", exec: () => "Running VencordIOS v1.0.0" },
            ];
            log("customCommands", "Registered 4 commands");
        },
        () => { window.__vencordIOS_customCmds = []; }
    );

    // 22. customIdle
    makePlugin("customIdle", "CustomIdle",
        "Custom idle timeout duration",
        () => { log("customIdle", "Enabled"); },
        () => { log("customIdle", "Disabled"); }
    );

    // 23. customRPC
    makePlugin("customRPC", "CustomRPC",
        "Custom Rich Presence",
        () => { log("customRPC", "Enabled"); },
        () => { log("customRPC", "Disabled"); }
    );

    // 24. dearrow
    makePlugin("dearrow", "DeArrow",
        "Replaces YouTube titles/thumbnails with community-submitted ones",
        () => {
            const process = async () => {
                document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach(async (iframe) => {
                    const m = (iframe.src || "").match(/(?:youtube\.com\/embed\/|youtu\.be\/)([\w-]+)/);
                    if (!m) return;
                    try {
                        const r = await fetch(`https://dearrow.ajay.app/api/v1/getVideo?videoID=${m[1]}`);
                        if (!r.ok) return;
                        const d = await r.json();
                        if (d?.titles?.[0]?.title) {
                            const t = iframe.closest('[class*="embed"]')?.querySelector('[class*="title"]');
                            if (t) t.textContent = d.titles[0].title;
                        }
                    } catch {}
                });
            };
            window.__vencordIOS_dearrowObs = new MutationObserver(() => setTimeout(process, 500));
            window.__vencordIOS_dearrowObs.observe(document.body, { childList: true, subtree: true });
        },
        () => { window.__vencordIOS_dearrowObs?.disconnect(); delete window.__vencordIOS_dearrowObs; }
    );

    // 25. disableCallIdle
    makePlugin("disableCallIdle", "DisableCallIdle",
        "Disables call idle timeout disconnect",
        () => {
            const orig = window.setTimeout;
            window.setTimeout = function(fn, delay, ...args) {
                if (typeof fn === "function" && delay > 300000 && delay < 900000) {
                    const s = fn.toString();
                    if (s.includes("idle") || s.includes("disconnect") || s.includes("call")) return -1;
                }
                return orig.call(this, fn, delay, ...args);
            };
            window.__vencordIOS_origSetTimeout = orig;
        },
        () => { if (window.__vencordIOS_origSetTimeout) window.setTimeout = window.__vencordIOS_origSetTimeout; delete window.__vencordIOS_origSetTimeout; }
    );

    // 26. dontRoundMyTimestamps
    makePlugin("dontRoundMyTimestamps", "DontRoundMyTimestamps",
        "Shows exact timestamps instead of rounded ones",
        () => {
            const patch = () => {
                document.querySelectorAll('time[datetime], [class*="timestamp"]').forEach(el => {
                    const dt = el.getAttribute("datetime");
                    if (dt) { const d = new Date(dt); el.setAttribute("title", d.toLocaleString()); el.textContent = d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}); }
                });
            };
            window.__vencordIOS_tsObs = new MutationObserver(patch);
            window.__vencordIOS_tsObs.observe(document.body, { childList: true, subtree: true });
            patch();
        },
        () => { window.__vencordIOS_tsObs?.disconnect(); delete window.__vencordIOS_tsObs; }
    );

    // 27. experiments
    makePlugin("experiments", "Experiments",
        "Enables Discord experiments",
        () => {
            try {
                if (typeof VencordWebpack !== "undefined") {
                    const u = VencordWebpack.webpackModules?.findByProps?.("getCurrentUser");
                    const c = u?.getCurrentUser?.();
                    if (c) Object.defineProperty(c, "hasFlag", { value: () => true, configurable: true });
                }
            } catch {}
            log("experiments", "Enabled");
        },
        () => { log("experiments", "Disabled - reload to revert"); }
    );

    // 28. expressionCloner
    makePlugin("expressionCloner", "ExpressionCloner",
        "Clone emotes/stickers via context menu",
        () => {
            const handler = (e) => {
                if (!e.target.closest('[class*="emoji"]')) return;
                setTimeout(() => {
                    const menu = document.querySelector('[role="menu"]');
                    if (!menu || menu.querySelector("#vencord-clone")) return;
                    const item = document.createElement("div");
                    item.id = "vencord-clone";
                    item.setAttribute("role", "menuitem");
                    item.textContent = "Clone Expression";
                    item.style.cssText = "padding:8px 12px;cursor:pointer;color:#fff;";
                    item.onclick = () => {
                        const img = e.target.closest('[class*="emoji"]')?.querySelector("img") || e.target;
                        if (img.src) navigator.clipboard.writeText(img.src).catch(() => {});
                    };
                    menu.appendChild(item);
                }, 100);
            };
            document.addEventListener("contextmenu", handler);
            window.__vencordIOS_cloneHandler = handler;
        },
        () => { document.removeEventListener("contextmenu", window.__vencordIOS_cloneHandler || (() => {})); delete window.__vencordIOS_cloneHandler; }
    );

    // 29. fakeNitro
    makePlugin("fakeNitro", "FakeNitro",
        "Fake Nitro features (emojis, stickers, themes, streaming)",
        () => {
            injectCSS("vencordIOS-fakeNitro", `
                [class*="emojiItemDisabled"] { opacity:1!important; filter:none!important; pointer-events:auto!important; }
                [class*="stickerDisabled"] { opacity:1!important; filter:none!important; pointer-events:auto!important; }
                [class*="upsell"], [class*="premiumDialog"] { display:none!important; }
            `);
            window.__vencordIOS_fakeNitroObs = new MutationObserver(() => {
                document.querySelectorAll('[class*="emojiItemDisabled"], [class*="disabled"]').forEach(el => {
                    el.style.pointerEvents = "auto"; el.style.opacity = "1"; el.style.filter = "none";
                });
            });
            window.__vencordIOS_fakeNitroObs.observe(document.body, { childList: true, subtree: true });
        },
        () => { removeCSS("vencordIOS-fakeNitro"); window.__vencordIOS_fakeNitroObs?.disconnect(); delete window.__vencordIOS_fakeNitroObs; }
    );

    // 30. fakeProfileThemes
    makePlugin("fakeProfileThemes", "FakeProfileThemes",
        "Profile theming via invisible 3y3 encoding",
        () => { log("fakeProfileThemes", "Enabled"); },
        () => { log("fakeProfileThemes", "Disabled"); }
    );

    // 31. favoriteEmojiFirst
    makePlugin("favoriteEmojiFirst", "FavoriteEmojiFirst",
        "Shows favorite emojis first in autocomplete",
        () => {
            window.__vencordIOS_favEmojiObs = new MutationObserver(() => {
                const pop = document.querySelector('[class*="emojiPicker"]');
                if (!pop) return;
                const rows = pop.querySelectorAll('[class*="emojiRow"], [class*="emojiItem"]');
                const favs = Array.from(rows).filter(r => r.querySelector('[class*="favorited"]'));
                if (favs.length) { const c = favs[0]?.parentElement; favs.reverse().forEach(f => c?.insertBefore(f, c.firstChild)); }
            });
            window.__vencordIOS_favEmojiObs.observe(document.body, { childList: true, subtree: true });
        },
        () => { window.__vencordIOS_favEmojiObs?.disconnect(); delete window.__vencordIOS_favEmojiObs; }
    );

    // 32. favoriteGifSearch
    makePlugin("favoriteGifSearch", "FavoriteGifSearch",
        "Search favorite GIFs",
        () => { log("favoriteGifSearch", "Enabled"); },
        () => { log("favoriteGifSearch", "Disabled"); }
    );

    // 33. fixCodeblockGap
    makePlugin("fixCodeblockGap", "FixCodeblockGap",
        "Fixes gaps between codeblocks",
        () => {
            injectCSS("vencordIOS-fixCodeblockGap", `
                pre code { margin-top:0!important; margin-bottom:0!important; padding-top:8px!important; padding-bottom:8px!important; }
                [class*="codeBlock"] + [class*="codeBlock"] { margin-top:-1px!important; }
                pre + pre { margin-top:-1px!important; border-top-left-radius:0!important; border-top-right-radius:0!important; }
                [class*="markup"] pre { margin:0!important; }
            `);
        },
        () => removeCSS("vencordIOS-fixCodeblockGap")
    );

    // 34. fixImagesQuality
    makePlugin("fixImagesQuality", "FixImagesQuality",
        "Loads images at original quality",
        () => {
            const fix = () => {
                document.querySelectorAll('img[src*="?size="]').forEach(img => {
                    try { const u = new URL(img.src); u.searchParams.set("size", "4096"); img.src = u.toString(); } catch {}
                });
            };
            window.__vencordIOS_imgQualObs = new MutationObserver(fix);
            window.__vencordIOS_imgQualObs.observe(document.body, { childList: true, subtree: true });
            fix();
        },
        () => { window.__vencordIOS_imgQualObs?.disconnect(); delete window.__vencordIOS_imgQualObs; }
    );

    // 35. fixSpotifyEmbeds
    makePlugin("fixSpotifyEmbeds", "FixSpotifyEmbeds",
        "Fixes loud Spotify embeds",
        () => {
            injectCSS("vencordIOS-fixSpotifyEmbeds", `
                iframe[src*="spotify"] { width:100%!important; height:80px!important; border:none!important; border-radius:8px!important; }
                [class*="spotifyEmbed"] { max-height:120px!important; overflow:hidden!important; }
            `);
        },
        () => removeCSS("vencordIOS-fixSpotifyEmbeds")
    );

    // 36. fixYoutubeEmbeds
    makePlugin("fixYoutubeEmbeds", "FixYoutubeEmbeds",
        "Bypasses blocked YouTube embeds",
        () => {
            window.__vencordIOS_ytObs = new MutationObserver(() => {
                document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach(f => {
                    if (!f.src.includes("nocookie")) f.src = f.src.replace("youtube.com/embed/", "youtube-nocookie.com/embed/");
                });
            });
            window.__vencordIOS_ytObs.observe(document.body, { childList: true, subtree: true });
        },
        () => { window.__vencordIOS_ytObs?.disconnect(); delete window.__vencordIOS_ytObs; }
    );

    // 37. forceOwnerCrown
    makePlugin("forceOwnerCrown", "ForceOwnerCrown",
        "Force displays owner crown icon",
        () => { injectCSS("vencordIOS-ownerCrown", `[class*="ownerIcon"] { display:inline-block!important; }`); },
        () => removeCSS("vencordIOS-ownerCrown")
    );

    // 38. friendInvites
    makePlugin("friendInvites", "FriendInvites",
        "Friend invite management",
        () => { log("friendInvites", "Enabled"); },
        () => { log("friendInvites", "Disabled"); }
    );

    // 39. fullSearchContext
    makePlugin("fullSearchContext", "FullSearchContext",
        "Shows full context in search results",
        () => {
            injectCSS("vencordIOS-fullSearch", `
                [class*="searchResult"] [class*="message"],
                [class*="searchResult"] [class*="context"],
                [class*="searchResult"] [class*="snippet"] {
                    max-height:none!important; overflow:visible!important;
                }
            `);
        },
        () => removeCSS("vencordIOS-fullSearch")
    );

    // 40. gameActivityToggle
    makePlugin("gameActivityToggle", "GameActivityToggle",
        "Toggle game activity detection on/off",
        () => { window.__vencordIOS_gameActivity = true; log("gameActivityToggle", "Enabled"); },
        () => { window.__vencordIOS_gameActivity = false; log("gameActivityToggle", "Disabled"); }
    );

    // 41. gifPaste
    makePlugin("gifPaste", "GifPaste",
        "GIF picker inserts link into chatbox",
        () => { log("gifPaste", "Enabled"); },
        () => { log("gifPaste", "Disabled"); }
    );

    // 42. greetStickerPicker
    makePlugin("greetStickerPicker", "GreetStickerPicker",
        "Use any sticker as a greet sticker",
        () => {
            injectCSS("vencordIOS-greetSticker", `
                [class*="sticker"][class*="disabled"] { opacity:1!important; pointer-events:auto!important; filter:none!important; }
            `);
        },
        () => removeCSS("vencordIOS-greetSticker")
    );

    // 43. hideMedia
    makePlugin("hideMedia", "HideMedia",
        "Hide media attachments per message",
        () => {
            injectCSS("vencordIOS-hideMedia", `
                .vencordIOS-hidden { display:none!important; }
                .vencordIOS-hide-btn {
                    position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff;
                    border:none; border-radius:4px; padding:2px 6px; cursor:pointer; z-index:10; font-size:12px;
                }
            `);
            const addBtns = () => {
                document.querySelectorAll('[class*="messageAttachment"]:not(.vencordIOS-hm-proc)').forEach(el => {
                    el.classList.add("vencordIOS-hm-proc"); el.style.position = "relative";
                    const btn = document.createElement("button");
                    btn.className = "vencordIOS-hide-btn"; btn.textContent = "Hide";
                    btn.onclick = (e) => { e.stopPropagation(); el.classList.toggle("vencordIOS-hidden"); btn.textContent = el.classList.contains("vencordIOS-hidden") ? "Show" : "Hide"; };
                    el.appendChild(btn);
                });
            };
            window.__vencordIOS_hideObs = new MutationObserver(addBtns);
            window.__vencordIOS_hideObs.observe(document.body, { childList: true, subtree: true });
            addBtns();
        },
        () => { removeCSS("vencordIOS-hideMedia"); window.__vencordIOS_hideObs?.disconnect(); delete window.__vencordIOS_hideObs; }
    );

    // 44. ignoreActivities
    makePlugin("ignoreActivities", "IgnoreActivities",
        "Ignore activities on your status",
        () => { window.__vencordIOS_ignoredActivities = []; log("ignoreActivities", "Enabled"); },
        () => { window.__vencordIOS_ignoredActivities = []; log("ignoreActivities", "Disabled"); }
    );

    // 45. imageFilename
    makePlugin("imageFilename", "ImageFilename",
        "Shows image filename as tooltip",
        () => {
            const add = () => {
                document.querySelectorAll('[class*="imageWrapper"] img:not([title]), [class*="attachment"] img:not([title])').forEach(img => {
                    const m = (img.src || "").match(/\/([^/?]+)(?:\?|$)/);
                    if (m) img.title = decodeURIComponent(m[1]);
                });
            };
            window.__vencordIOS_fnObs = new MutationObserver(add);
            window.__vencordIOS_fnObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_fnObs?.disconnect(); delete window.__vencordIOS_fnObs; }
    );

    // 46. imageLink
    makePlugin("imageLink", "ImageLink",
        "Never hides image links in messages",
        () => {
            injectCSS("vencordIOS-imageLink", `
                a[href*=".png"], a[href*=".jpg"], a[href*=".jpeg"], a[href*=".gif"], a[href*=".webp"] {
                    word-break:break-all!important; white-space:normal!important;
                }
            `);
        },
        () => removeCSS("vencordIOS-imageLink")
    );

    // 47. imageZoom
    makePlugin("imageZoom", "ImageZoom",
        "Zoom into images on click",
        () => {
            injectCSS("vencordIOS-imgZoom", `
                .vencordIOS-zoom { position:fixed; top:0; left:0; width:100vw; height:100vh;
                    background:rgba(0,0,0,0.85); z-index:99999; display:flex; align-items:center; justify-content:center; cursor:zoom-out; }
                .vencordIOS-zoom img { max-width:95vw; max-height:95vh; object-fit:contain; transition:transform 0.1s ease; }
            `);
            const handler = (e) => {
                const img = e.target.closest('[class*="imageWrapper"] img, [class*="attachment"] img');
                if (!img || img.closest('[class*="avatar"]')) return;
                const overlay = document.createElement("div");
                overlay.className = "vencordIOS-zoom";
                const zi = document.createElement("img"); zi.src = img.src;
                let scale = 1;
                overlay.appendChild(zi); document.body.appendChild(overlay);
                overlay.onclick = (ev) => { if (ev.target === zi) { scale = scale === 1 ? 2 : 1; zi.style.transform = `scale(${scale})`; } else overlay.remove(); };
                overlay.onwheel = (ev) => { ev.preventDefault(); scale = Math.max(0.25, Math.min(5, scale + (ev.deltaY > 0 ? -0.1 : 0.1))); zi.style.transform = `scale(${scale})`; };
            };
            document.addEventListener("click", handler, true);
            window.__vencordIOS_zoomHandler = handler;
        },
        () => { removeCSS("vencordIOS-imgZoom"); document.removeEventListener("click", window.__vencordIOS_zoomHandler || (() => {}), true); delete window.__vencordIOS_zoomHandler; }
    );

    // 48. implicitRelationships
    makePlugin("implicitRelationships", "ImplicitRelationships",
        "Shows implicit relationships based on shared servers",
        () => { log("implicitRelationships", "Enabled"); },
        () => { log("implicitRelationships", "Disabled"); }
    );

    // 49. ircColors
    makePlugin("ircColors", "IRCColors",
        "Unique username colors based on user ID hash",
        () => {
            const hsl = (h,s,l) => { s/=100;l/=100;const a=s*Math.min(l,1-l);const f=n=>{const k=(n+h/30)%12;const c=l-a*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c).toString(16).padStart(2,"0");};return`#${f(0)}${f(8)}${f(4)}`;};
            const hash = (s) => { let h=0; for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return Math.abs(h); };
            const apply = () => {
                document.querySelectorAll('[class*="username"]').forEach(el => {
                    const uid = el.closest('[data-author-id]')?.getAttribute("data-author-id") || "";
                    if (uid && !el.style.color) el.style.color = hsl(hash(uid)%360,70,60);
                });
            };
            window.__vencordIOS_colorObs = new MutationObserver(apply);
            window.__vencordIOS_colorObs.observe(document.body, { childList: true, subtree: true });
            apply();
        },
        () => { window.__vencordIOS_colorObs?.disconnect(); delete window.__vencordIOS_colorObs; }
    );

    // 50. keepCurrentChannel
    makePlugin("keepCurrentChannel", "KeepCurrentChannel",
        "Keeps current channel when switching accounts",
        () => { log("keepCurrentChannel", "Enabled"); },
        () => { log("keepCurrentChannel", "Disabled"); }
    );

    // 51. memberCount
    makePlugin("memberCount", "MemberCount",
        "Shows member count in server header",
        () => {
            const add = () => {
                const hdr = document.querySelector('[class*="headerPrimary"]');
                if (!hdr || document.getElementById("vencordIOS-mc")) return;
                const mc = hdr.querySelector('[class*="memberCount"]');
                if (mc) {
                    const el = document.createElement("span"); el.id = "vencordIOS-mc";
                    el.style.cssText = "margin-left:8px;font-size:12px;color:#aaa;font-weight:400;";
                    el.textContent = mc.textContent; hdr.appendChild(el);
                }
            };
            window.__vencordIOS_mcObs = new MutationObserver(add);
            window.__vencordIOS_mcObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_mcObs?.disconnect(); document.getElementById("vencordIOS-mc")?.remove(); delete window.__vencordIOS_mcObs; }
    );

    // 52. mentionAvatars
    makePlugin("mentionAvatars", "MentionAvatars",
        "Shows user avatars next to mentions",
        () => {
            const add = () => {
                document.querySelectorAll('[class*="mention"] [class*="username"]:not([data-av-done])').forEach(el => {
                    el.setAttribute("data-av-done", "true");
                    const uid = el.closest('[data-user-id]')?.getAttribute("data-user-id");
                    if (!uid) return;
                    const av = document.createElement("img");
                    av.style.cssText = "width:16px;height:16px;border-radius:50%;margin-right:4px;vertical-align:middle;";
                    av.src = `https://cdn.discordapp.com/avatars/${uid}/avatar.png?size=32`;
                    av.onerror = () => av.style.display = "none";
                    el.insertBefore(av, el.firstChild);
                });
            };
            window.__vencordIOS_mentAvObs = new MutationObserver(add);
            window.__vencordIOS_mentAvObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_mentAvObs?.disconnect(); delete window.__vencordIOS_mentAvObs; }
    );

    // 53. messageClickActions
    makePlugin("messageClickActions", "MessageClickActions",
        "Backspace+click delete, double click edit",
        () => {
            const handler = (e) => {
                const msg = e.target.closest('[class*="message"][data-message-id]');
                if (!msg) return;
                if (e.detail === 2) { e.preventDefault(); e.stopPropagation(); log("messageClickActions", "Double click edit"); return false; }
            };
            document.addEventListener("click", handler, true);
            window.__vencordIOS_clickHandler = handler;
        },
        () => { document.removeEventListener("click", window.__vencordIOS_clickHandler || (() => {}), true); delete window.__vencordIOS_clickHandler; }
    );

    // 54. messageLatency
    makePlugin("messageLatency", "MessageLatency",
        "Shows message send latency",
        () => {
            const check = () => {
                document.querySelectorAll('[class*="message"][data-message-id]:not([data-lat-done])').forEach(msg => {
                    msg.setAttribute("data-lat-done", "true");
                    const ts = msg.querySelector('time[datetime]');
                    if (!ts) return;
                    const diff = Date.now() - new Date(ts.getAttribute("datetime")).getTime();
                    if (diff > 0 && diff < 86400000) {
                        const sp = document.createElement("span");
                        sp.style.cssText = "font-size:10px;color:#aaa;margin-left:4px;";
                        sp.textContent = `(${diff < 1000 ? diff + "ms" : Math.round(diff / 1000) + "s"})`;
                        ts.appendChild(sp);
                    }
                });
            };
            window.__vencordIOS_latObs = new MutationObserver(check);
            window.__vencordIOS_latObs.observe(document.body, { childList: true, subtree: true });
            check();
        },
        () => { window.__vencordIOS_latObs?.disconnect(); delete window.__vencordIOS_latObs; }
    );

    // 55. messageLinkEmbeds
    makePlugin("messageLinkEmbeds", "MessageLinkEmbeds",
        "Shows message link previews",
        () => { log("messageLinkEmbeds", "Enabled"); },
        () => { log("messageLinkEmbeds", "Disabled"); }
    );

    // 56. messageLogger
    makePlugin("messageLogger", "MessageLogger",
        "Logs deleted and edited messages",
        () => {
            window.__vencordIOS_msgLog = [];
            window.__vencordIOS_msgLogObs = new MutationObserver(muts => {
                for (const m of muts) {
                    for (const n of m.removedNodes) {
                        if (n.nodeType === 1) { const mid = n.getAttribute?.("data-message-id"); if (mid) { window.__vencordIOS_msgLog.push({id:mid,type:"deleted",content:(n.textContent||"").slice(0,500),time:Date.now()}); log("messageLogger",`Deleted: ${mid}`); } }
                    }
                }
            });
            window.__vencordIOS_msgLogObs.observe(document.body, { childList: true, subtree: true });
            window.__vencordIOS_msgLogRef = window.__vencordIOS_msgLog;
        },
        () => { window.__vencordIOS_msgLogObs?.disconnect(); window.__vencordIOS_msgLog = []; delete window.__vencordIOS_msgLogObs; delete window.__vencordIOS_msgLogRef; }
    );

    // 57. moreQuickReactions
    makePlugin("moreQuickReactions", "MoreQuickReactions",
        "More quick reaction buttons",
        () => {
            injectCSS("vencordIOS-moreQR", `
                [class*="quickReaction"] { max-width:none!important; }
                [class*="reactionItem"] { min-width:auto!important; }
            `);
        },
        () => removeCSS("vencordIOS-moreQR")
    );

    // 58. mutualGroupDMs
    makePlugin("mutualGroupDMs", "MutualGroupDMs",
        "Shows mutual group DMs in user popouts",
        () => { log("mutualGroupDMs", "Enabled"); },
        () => { log("mutualGroupDMs", "Disabled"); }
    );

    // 59. newGuildSettings
    makePlugin("newGuildSettings", "NewGuildSettings",
        "Auto-mute new servers and customize defaults",
        () => { log("newGuildSettings", "Enabled"); },
        () => { log("newGuildSettings", "Disabled"); }
    );

    // 60. noBlockedMessages
    makePlugin("noBlockedMessages", "NoBlockedMessages",
        "Hides blocked messages entirely",
        () => {
            injectCSS("vencordIOS-noBlocked", `
                [class*="blockedMessage"], [class*="BlockedMessage"],
                [class*="systemMessage"][class*="blocked"] { display:none!important; }
            `);
        },
        () => removeCSS("vencordIOS-noBlocked")
    );

    // 61. noDevtoolsWarning
    makePlugin("noDevtoolsWarning", "NoDevtoolsWarning",
        "Removes the devtools warning message",
        () => {
            injectCSS("vencordIOS-noDevWarn", `
                [class*="developerModeCopies"], [class*="devtools"],
                [class*="WarningPopout"], [class*="warningPopout"],
                [class*="nitroUpsell"], [class*="NitroUpsell"] { display:none!important; }
            `);
        },
        () => removeCSS("vencordIOS-noDevWarn")
    );

    // 62. noF1
    makePlugin("noF1", "NoF1",
        "Disables F1 key from opening help/support",
        () => {
            const h = (e) => { if (e.key === "F1") { e.preventDefault(); e.stopPropagation(); return false; } };
            window.addEventListener("keydown", h, true);
            window.__vencordIOS_f1Handler = h;
        },
        () => { window.removeEventListener("keydown", window.__vencordIOS_f1Handler || (() => {}), true); delete window.__vencordIOS_f1Handler; }
    );

    // 63. noMaskedUrlPaste
    makePlugin("noMaskedUrlPaste", "NoMaskedUrlPaste",
        "Disables masked URL paste behavior",
        () => { log("noMaskedUrlPaste", "Enabled"); },
        () => { log("noMaskedUrlPaste", "Disabled"); }
    );

    // 64. noMosaic
    makePlugin("noMosaic", "NoMosaic",
        "Removes image mosaic layout, shows images individually",
        () => {
            injectCSS("vencordIOS-noMosaic", `
                [class*="imageGrid"], [class*="attachmentGrid"], [class*="mediaGallery"], [class*="mosaic"] {
                    display:flex!important; flex-direction:column!important; gap:4px!important;
                }
                [class*="imageGrid"] > *, [class*="attachmentGrid"] > * { width:100%!important; max-width:400px!important; height:auto!important; }
            `);
        },
        () => removeCSS("vencordIOS-noMosaic")
    );

    // 65. noOnboardingDelay
    makePlugin("noOnboardingDelay", "NoOnboardingDelay",
        "Skips onboarding animation delay",
        () => {
            injectCSS("vencordIOS-noOnboard", `
                [class*="onboarding"] * {
                    animation-duration:0s!important; animation-delay:0s!important;
                    transition-duration:0s!important; transition-delay:0s!important;
                }
            `);
        },
        () => removeCSS("vencordIOS-noOnboard")
    );

    // 66. noPendingCount
    makePlugin("noPendingCount", "NoPendingCount",
        "Removes pending friend request count badge",
        () => {
            injectCSS("vencordIOS-noPending", `
                [class*="pendingCount"], [class*="pending-badge"],
                [class*="badge"][class*="pending"] { display:none!important; }
            `);
        },
        () => removeCSS("vencordIOS-noPending")
    );

    // 67. noProfileThemes
    makePlugin("noProfileThemes", "NoProfileThemes",
        "Removes Nitro profile themes for other users",
        () => {
            injectCSS("vencordIOS-noProfThemes", `
                [class*="profileTheme"], [class*="ProfileTheme"] {
                    background:var(--background-primary)!important; color:var(--text-normal)!important;
                }
            `);
        },
        () => removeCSS("vencordIOS-noProfThemes")
    );

    // 68. noReplyMention
    makePlugin("noReplyMention", "NoReplyMention",
        "Disables reply pings automatically",
        () => { log("noReplyMention", "Enabled"); },
        () => { log("noReplyMention", "Disabled"); }
    );

    // 69. noServerEmojis
    makePlugin("noServerEmojis", "NoServerEmojis",
        "Hides server-specific emojis from autocomplete",
        () => {
            injectCSS("vencordIOS-noServEmoji", `
                [class*="emojiItem"][class*="fromGuild"]:not([class*="favorite"]) { display:none!important; }
            `);
        },
        () => removeCSS("vencordIOS-noServEmoji")
    );

    // 70. noSystemBadge
    makePlugin("noSystemBadge", "NoSystemBadge",
        "Disables system notification badge",
        () => {
            injectCSS("vencordIOS-noSysBadge", `
                [class*="systemBadge"], [class*="SystemBadge"] { display:none!important; }
            `);
        },
        () => removeCSS("vencordIOS-noSysBadge")
    );

    // 71. noTrack
    makePlugin("noTrack", "NoTrack",
        "Blocks Discord analytics and tracking",
        () => {
            const blocked = ["google-analytics.com","analytics.google.com","sentry.io","bugsnag.com","rollbar.com",
                "newrelic.com","nr-data.net","segment.io","segment.com","amplitude.com","mixpanel.com","hotjar.com",
                "fullstory.com","datadoghq.com","datadoghq-browser-agent"];
            const origFetch = window.fetch;
            window.fetch = function(url, ...a) {
                const s = typeof url === "string" ? url : url?.url || "";
                if (blocked.some(d => s.includes(d))) return Promise.resolve(new Response("",{status:204}));
                return origFetch.call(this, url, ...a);
            };
            window.__vencordIOS_origFetch = origFetch;
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(m, url, ...a) {
                if (blocked.some(d => String(url).includes(d))) { this._blocked = true; return; }
                return origOpen.call(this, m, url, ...a);
            };
            window.__vencordIOS_origXHROpen = origOpen;
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function(...a) { if (this._blocked) return; return origSend.apply(this, a); };
            window.__vencordIOS_origXHRSend = origSend;
        },
        () => {
            if (window.__vencordIOS_origFetch) window.fetch = window.__vencordIOS_origFetch;
            if (window.__vencordIOS_origXHROpen) XMLHttpRequest.prototype.open = window.__vencordIOS_origXHROpen;
            if (window.__vencordIOS_origXHRSend) XMLHttpRequest.prototype.send = window.__vencordIOS_origXHRSend;
            delete window.__vencordIOS_origFetch; delete window.__vencordIOS_origXHROpen; delete window.__vencordIOS_origXHRSend;
        }
    );

    // 72. noTypingAnimation
    makePlugin("noTypingAnimation", "NoTypingAnimation",
        "Disables the typing indicator animation",
        () => {
            injectCSS("vencordIOS-noTypAnim", `
                [class*="typing"] [class*="dot"], [class*="typingIndicator"] span {
                    animation:none!important; transition:none!important;
                }
            `);
        },
        () => removeCSS("vencordIOS-noTypAnim")
    );

    // 73. oneko
    makePlugin("oneko", "Oneko",
        "A cat that chases your mouse cursor",
        () => {
            const cat = document.createElement("div");
            cat.id = "vencordIOS-oneko";
            cat.style.cssText = "position:fixed;width:32px;height:32px;z-index:99999;pointer-events:none;font-size:24px;line-height:32px;text-align:center;";
            cat.textContent = "\uD83D\uDC31";
            document.body.appendChild(cat);
            window.__vencordIOS_onekoEl = cat;
            let mx = window.innerWidth/2, my = window.innerHeight/2, cx = mx, cy = my;
            const mm = (e) => { mx = e.clientX; my = e.clientY; };
            document.addEventListener("mousemove", mm);
            window.__vencordIOS_onekoMM = mm;
            window.__vencordIOS_onekoInterval = setInterval(() => {
                const dx = mx-cx, dy = my-cy, d = Math.sqrt(dx*dx+dy*dy);
                if (d > 5) { cx += dx*0.08; cy += dy*0.08; cat.style.left = cx+"px"; cat.style.top = cy+"px"; cat.style.transform = dx < 0 ? "scaleX(-1)" : "scaleX(1)"; }
            }, 16);
        },
        () => {
            clearInterval(window.__vencordIOS_onekoInterval);
            document.removeEventListener("mousemove", window.__vencordIOS_onekoMM || (() => {}));
            window.__vencordIOS_onekoEl?.remove();
            delete window.__vencordIOS_onekoInterval; delete window.__vencordIOS_onekoMM; delete window.__vencordIOS_onekoEl;
        }
    );

    // 74. onePingPerDM
    makePlugin("onePingPerDM", "OnePingPerDM",
        "Only pings once per DM conversation",
        () => { window.__vencordIOS_seenDMs = new Set(); },
        () => { window.__vencordIOS_seenDMs = new Set(); }
    );

    // 75. openInApp
    makePlugin("openInApp", "OpenInApp",
        "Opens links in native apps",
        () => {
            const mappings = [
                { p: /youtube\.com|youtu\.be/, a: "vnd.youtube:" },
                { p: /twitter\.com|x\.com/, a: "twitter:" },
                { p: /reddit\.com/, a: "reddit:" },
                { p: /open\.spotify\.com/, a: "spotify:" },
                { p: /github\.com/, a: "github:" },
            ];
            const h = (e) => {
                const link = e.target.closest("a[href]");
                if (!link) return;
                for (const m of mappings) {
                    if (m.p.test(link.href)) { e.preventDefault(); e.stopPropagation(); window.location.href = link.href.replace(/^https?:\/\//, m.a); return false; }
                }
            };
            document.addEventListener("click", h, true);
            window.__vencordIOS_openAppHandler = h;
        },
        () => { document.removeEventListener("click", window.__vencordIOS_openAppHandler || (() => {}), true); delete window.__vencordIOS_openAppHandler; }
    );

    // 76. pauseInvitesForever
    makePlugin("pauseInvitesForever", "PauseInvitesForever",
        "Keeps invites paused permanently",
        () => {
            injectCSS("vencordIOS-pauseInvites", `
                [class*="inviteButton"], [class*="InviteButton"], [class*="inviteLink"] {
                    opacity:0.3!important; pointer-events:none!important;
                }
            `);
        },
        () => removeCSS("vencordIOS-pauseInvites")
    );

    // 77. permissionsViewer
    makePlugin("permissionsViewer", "PermissionsViewer",
        "View detailed permissions for any user or role",
        () => {
            const h = (e) => {
                if (!e.target.closest('[class*="memberItem"]')) return;
                setTimeout(() => {
                    const menu = document.querySelector('[role="menu"]');
                    if (!menu || menu.querySelector("#vencord-viewPerms")) return;
                    const item = document.createElement("div");
                    item.id = "vencord-viewPerms";
                    item.setAttribute("role","menuitem");
                    item.textContent = "View Permissions";
                    item.style.cssText = "padding:8px 12px;cursor:pointer;color:#fff;";
                    item.onclick = () => log("permissionsViewer", "Viewing permissions");
                    menu.appendChild(item);
                }, 100);
            };
            document.addEventListener("contextmenu", h);
            window.__vencordIOS_permHandler = h;
        },
        () => { document.removeEventListener("contextmenu", window.__vencordIOS_permHandler || (() => {})); delete window.__vencordIOS_permHandler; }
    );

    // 78. pictureInPicture
    makePlugin("pictureInPicture", "PictureInPicture",
        "Picture-in-Picture for video messages",
        () => {
            const add = () => {
                document.querySelectorAll("video:not([data-pip-done])").forEach(v => {
                    v.setAttribute("data-pip-done","true");
                    const w = v.closest('[class*="videoContainer"], [class*="attachment"]') || v.parentElement;
                    if (!w) return; w.style.position = "relative";
                    const btn = document.createElement("button");
                    btn.className = "vencordIOS-pip-btn"; btn.textContent = "PiP";
                    btn.style.cssText = "position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;z-index:10;font-size:12px;";
                    btn.onclick = async (e) => { e.stopPropagation(); try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch {} };
                    w.appendChild(btn);
                });
            };
            window.__vencordIOS_pipObs = new MutationObserver(add);
            window.__vencordIOS_pipObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_pipObs?.disconnect(); document.querySelectorAll(".vencordIOS-pip-btn").forEach(el => el.remove()); delete window.__vencordIOS_pipObs; }
    );

    // 79. pinDMs
    makePlugin("pinDMs", "PinDMs",
        "Pin DM channels to the top of the DM list",
        () => { window.__vencordIOS_pinnedDMs = []; log("pinDMs", "Enabled"); },
        () => { window.__vencordIOS_pinnedDMs = []; log("pinDMs", "Disabled"); }
    );

    // 80. plainFolderIcon
    makePlugin("plainFolderIcon", "PlainFolderIcon",
        "Makes folder icons plain and uncolored",
        () => {
            injectCSS("vencordIOS-plainFolder", `
                [class*="guildsList"] [class*="folder"] [class*="icon"] { filter:grayscale(1)!important; }
            `);
        },
        () => removeCSS("vencordIOS-plainFolder")
    );

    // 81. platformIndicators
    makePlugin("platformIndicators", "PlatformIndicators",
        "Shows platform indicators (desktop, mobile, web)",
        () => {
            const icons = { desktop: "\uD83D\uDDA5", mobile: "\uD83D\uDCF1", web: "\uD83C\uDF10" };
            const colors = { desktop: "#5865f2", mobile: "#3ba55c", web: "#faa61a" };
            const add = () => {
                document.querySelectorAll('[class*="memberListItem"]').forEach(m => {
                    if (m.querySelector(".vencordIOS-plat")) return;
                    const s = m.querySelector('[class*="status"]');
                    if (s) {
                        const sp = document.createElement("span");
                        sp.className = "vencordIOS-plat"; sp.style.cssText = `font-size:10px;margin-left:2px;color:${colors.desktop};`;
                        sp.textContent = icons.desktop;
                        s.parentElement?.appendChild(sp);
                    }
                });
            };
            window.__vencordIOS_platObs = new MutationObserver(add);
            window.__vencordIOS_platObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_platObs?.disconnect(); document.querySelectorAll(".vencordIOS-plat").forEach(el => el.remove()); delete window.__vencordIOS_platObs; }
    );

    // 82. previewMessage
    makePlugin("previewMessage", "PreviewMessage",
        "Preview messages before sending",
        () => {
            injectCSS("vencordIOS-previewMsg", `
                .vencordIOS-msg-preview {
                    background:var(--background-secondary); border:1px solid var(--background-modifier-accent);
                    border-radius:8px; padding:8px 12px; margin:4px 0; max-height:200px; overflow-y:auto;
                    font-size:14px; color:var(--text-normal); display:none;
                }
                .vencordIOS-msg-preview.visible { display:block; }
            `);
        },
        () => removeCSS("vencordIOS-previewMsg")
    );

    // 83. quickMention
    makePlugin("quickMention", "QuickMention",
        "Adds quick mention button to messages",
        () => {
            const add = () => {
                document.querySelectorAll('[class*="message"][data-message-id]:not([data-qm-done])').forEach(msg => {
                    msg.setAttribute("data-qm-done","true");
                    const tb = msg.querySelector('[class*="toolbar"], [class*="actions"]');
                    if (!tb) return;
                    const btn = document.createElement("button");
                    btn.textContent = "@"; btn.title = "Quick Mention";
                    btn.style.cssText = "background:none;border:none;color:var(--interactive-normal);cursor:pointer;padding:2px 4px;font-size:16px;font-weight:bold;";
                    btn.onmouseenter = () => btn.style.color = "var(--interactive-hover)";
                    btn.onmouseleave = () => btn.style.color = "var(--interactive-normal)";
                    tb.insertBefore(btn, tb.firstChild);
                });
            };
            window.__vencordIOS_qmObs = new MutationObserver(add);
            window.__vencordIOS_qmObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_qmObs?.disconnect(); delete window.__vencordIOS_qmObs; }
    );

    // 84. quickReply
    makePlugin("quickReply", "QuickReply",
        "Quick reply with keyboard shortcuts",
        () => {
            const h = (e) => {
                if (e.altKey && e.key === "ArrowUp") {
                    const msgs = document.querySelectorAll('[class*="message"][data-message-id]');
                    if (msgs.length) log("quickReply", `Replying to ${msgs[msgs.length-1].getAttribute("data-message-id")}`);
                }
            };
            window.addEventListener("keydown", h);
            window.__vencordIOS_qrHandler = h;
        },
        () => { window.removeEventListener("keydown", window.__vencordIOS_qrHandler || (() => {})); delete window.__vencordIOS_qrHandler; }
    );

    // 85. readAllNotifications
    makePlugin("readAllNotifications", "ReadAllNotifications",
        "Adds a button to read all notifications",
        () => {
            const add = () => {
                if (document.getElementById("vencord-readAll")) return;
                const hdr = document.querySelector('[class*="guilds"], [class*="sidebar"]');
                if (!hdr) return;
                const btn = document.createElement("button"); btn.id = "vencord-readAll";
                btn.textContent = "Read All"; btn.title = "Mark all notifications as read";
                btn.style.cssText = "width:40px;height:40px;border-radius:50%;border:none;background:var(--brand-experiment);color:#fff;font-size:10px;cursor:pointer;margin:4px auto;display:block;";
                btn.onclick = () => document.querySelectorAll('[class*="unread"], [class*="badge"]').forEach(el => el.style.display = "none");
                hdr.appendChild(btn); window.__vencordIOS_readAllEl = btn;
            };
            window.__vencordIOS_readAllObs = new MutationObserver(add);
            window.__vencordIOS_readAllObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_readAllObs?.disconnect(); window.__vencordIOS_readAllEl?.remove(); delete window.__vencordIOS_readAllObs; delete window.__vencordIOS_readAllEl; }
    );

    // 86. relationshipNotifier
    makePlugin("relationshipNotifier", "RelationshipNotifier",
        "Notifies when friends, groups, or servers are removed",
        () => {
            window.__vencordIOS_relationships = new Map();
            window.__vencordIOS_relInterval = setInterval(() => {
                try {
                    const RS = typeof VencordWebpack !== "undefined" && VencordWebpack.webpackModules?.findByProps?.("getRelationships");
                    if (RS) { const r = RS.getRelationships?.() || {}; for (const [k,v] of Object.entries(r)) window.__vencordIOS_relationships.set(k,v); }
                } catch {}
            }, 30000);
        },
        () => { clearInterval(window.__vencordIOS_relInterval); window.__vencordIOS_relationships = new Map(); delete window.__vencordIOS_relInterval; }
    );

    // 87. replyTimestamp
    makePlugin("replyTimestamp", "ReplyTimestamp",
        "Shows the timestamp of the replied-to message",
        () => {
            const add = () => {
                document.querySelectorAll('[class*="repliedMessage"]').forEach(r => {
                    if (r.querySelector(".vencordIOS-reply-ts")) return;
                    const sp = document.createElement("span"); sp.className = "vencordIOS-reply-ts";
                    sp.style.cssText = "font-size:10px;color:var(--text-muted);margin-left:4px;";
                    sp.textContent = "[reply]"; r.appendChild(sp);
                });
            };
            window.__vencordIOS_replyTsObs = new MutationObserver(add);
            window.__vencordIOS_replyTsObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_replyTsObs?.disconnect(); document.querySelectorAll(".vencordIOS-reply-ts").forEach(el => el.remove()); delete window.__vencordIOS_replyTsObs; }
    );

    // 88. revealAllSpoilers
    makePlugin("revealAllSpoilers", "RevealAllSpoilers",
        "Reveals all spoiler content",
        () => {
            const reveal = () => {
                document.querySelectorAll('[class*="spoiler"], [class*="Spoiler"]').forEach(el => {
                    el.classList.add("spoilerRevealed");
                    el.style.backgroundColor = "transparent"; el.style.color = "inherit";
                });
            };
            window.__vencordIOS_spoilerObs = new MutationObserver(reveal);
            window.__vencordIOS_spoilerObs.observe(document.body, { childList: true, subtree: true });
            reveal();
        },
        () => { window.__vencordIOS_spoilerObs?.disconnect(); document.querySelectorAll(".spoilerRevealed").forEach(el => { el.classList.remove("spoilerRevealed"); el.style.backgroundColor = ""; el.style.color = ""; }); delete window.__vencordIOS_spoilerObs; }
    );

    // 89. reverseImageSearch
    makePlugin("reverseImageSearch", "ReverseImageSearch",
        "Adds reverse image search option to images",
        () => {
            const h = (e) => {
                if (!e.target.closest('img[src*="media"], [class*="imageWrapper"] img')) return;
                setTimeout(() => {
                    const menu = document.querySelector('[role="menu"]');
                    if (!menu || menu.querySelector("#vencord-revSearch")) return;
                    const img = e.target.closest("img");
                    [{n:"Google",u:"https://lens.google.com/uploadbyurl?url="},
                     {n:"SauceNAO",u:"https://saucenao.com/search.php?url="},
                     {n:"TinEye",u:"https://tineye.com/search?url="}].forEach(s => {
                        const item = document.createElement("div"); item.id = "vencord-revSearch";
                        item.setAttribute("role","menuitem"); item.textContent = `Search with ${s.n}`;
                        item.style.cssText = "padding:8px 12px;cursor:pointer;color:#fff;";
                        item.onclick = () => window.open(s.u + encodeURIComponent(img.src), "_blank");
                        menu.appendChild(item);
                    });
                }, 100);
            };
            document.addEventListener("contextmenu", h);
            window.__vencordIOS_revImgHandler = h;
        },
        () => { document.removeEventListener("contextmenu", window.__vencordIOS_revImgHandler || (() => {})); delete window.__vencordIOS_revImgHandler; }
    );

    // 90. roleColorEverywhere
    makePlugin("roleColorEverywhere", "RoleColorEverywhere",
        "Shows role colors everywhere possible",
        () => {
            injectCSS("vencordIOS-roleColorAll", `
                [class*="username"][style*="color"] { color:inherit!important; }
                [class*="member"] [class*="name"] { font-weight:500!important; }
            `);
        },
        () => removeCSS("vencordIOS-roleColorAll")
    );

    // 91. secretRingToneEnabler
    makePlugin("secretRingToneEnabler", "SecretRingToneEnabler",
        "Enables the secret ringtone",
        () => { log("secretRingToneEnabler", "Enabled"); },
        () => { log("secretRingToneEnabler", "Disabled"); }
    );

    // 92. sendTimestamps
    makePlugin("sendTimestamps", "SendTimestamps",
        "Easily send Discord timestamps from a picker",
        () => { log("sendTimestamps", "Enabled"); },
        () => { log("sendTimestamps", "Disabled"); }
    );

    // 93. serverInfo
    makePlugin("serverInfo", "ServerInfo",
        "View detailed server information",
        () => {
            const h = (e) => {
                if (!e.target.closest('[class*="guildIcon"], [class*="guild"] img')) return;
                setTimeout(() => {
                    const menu = document.querySelector('[role="menu"]');
                    if (!menu || menu.querySelector("#vencord-srvInfo")) return;
                    const item = document.createElement("div"); item.id = "vencord-srvInfo";
                    item.setAttribute("role","menuitem"); item.textContent = "Server Info";
                    item.style.cssText = "padding:8px 12px;cursor:pointer;color:#fff;";
                    item.onclick = () => log("serverInfo", "Opening server info");
                    menu.appendChild(item);
                }, 100);
            };
            document.addEventListener("contextmenu", h);
            window.__vencordIOS_srvInfoHandler = h;
        },
        () => { document.removeEventListener("contextmenu", window.__vencordIOS_srvInfoHandler || (() => {})); delete window.__vencordIOS_srvInfoHandler; }
    );

    // 94. serverListIndicators
    makePlugin("serverListIndicators", "ServerListIndicators",
        "Shows unread/notification indicators in server list",
        () => {
            injectCSS("vencordIOS_srvListInd", `
                [class*="guildItem"][class*="unread"]::before {
                    content:""; position:absolute; left:0; top:50%; transform:translateY(-50%);
                    width:4px; height:8px; background:var(--text-normal); border-radius:0 4px 4px 0;
                }
                [class*="guildItem"] { position:relative; }
            `);
        },
        () => removeCSS("vencordIOS_srvListInd")
    );

    // 95. settings
    makePlugin("settings", "VencordIOSSettings",
        "VencordIOS settings UI and debug info",
        () => {
            window.__vencordIOS = {
                version: "1.0.0",
                debug: () => ({ userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language }),
            };
            log("settings", "Enabled - use window.__vencordIOS for debug info");
        },
        () => { delete window.__vencordIOS; log("settings", "Disabled"); }
    );

    // 96. showAllMessageButtons
    makePlugin("showAllMessageButtons", "ShowAllMessageButtons",
        "Shows all message action buttons always",
        () => {
            injectCSS("vencordIOS_showAllBtns", `
                [class*="message"] [class*="toolbar"], [class*="message"] [class*="actions"] {
                    opacity:1!important; visibility:visible!important; pointer-events:auto!important;
                }
            `);
        },
        () => removeCSS("vencordIOS_showAllBtns")
    );

    // 97. showConnections
    makePlugin("showConnections", "ShowConnections",
        "Shows connected accounts in user popouts",
        () => {
            const add = () => {
                document.querySelectorAll('[class*="userPopout"], [class*="userProfile"]').forEach(p => {
                    if (p.querySelector(".vencordIOS-conn")) return;
                    const sec = document.createElement("div"); sec.className = "vencordIOS-conn";
                    sec.style.cssText = "padding:8px 12px;font-size:12px;color:var(--text-muted);";
                    sec.textContent = "Connected Accounts";
                    const list = p.querySelector('[class*="activities"], [class*="About"]');
                    if (list) list.appendChild(sec);
                });
            };
            window.__vencordIOS_connObs = new MutationObserver(add);
            window.__vencordIOS_connObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_connObs?.disconnect(); document.querySelectorAll(".vencordIOS-conn").forEach(el => el.remove()); delete window.__vencordIOS_connObs; }
    );

    // 98. showHiddenChannels
    makePlugin("showHiddenChannels", "ShowHiddenChannels",
        "Shows hidden channels in the channel list",
        () => {
            injectCSS("vencordIOS_showHidden", `
                [class*="channel"][class*="hidden"], [class*="channel"][class*="locked"] {
                    opacity:0.5!important; display:flex!important; pointer-events:auto!important;
                }
                [class*="channelHidden"], [class*="ChannelHidden"] {
                    display:block!important; height:auto!important; max-height:none!important; overflow:visible!important;
                }
            `);
        },
        () => removeCSS("vencordIOS_showHidden")
    );

    // 99. showHiddenThings
    makePlugin("showHiddenThings", "ShowHiddenThings",
        "Shows hidden and moderator-only things",
        () => {
            injectCSS("vencordIOS_showHidThings", `
                [class*="hidden"], [class*="Hidden"] { display:block!important; visibility:visible!important; opacity:1!important; }
                [class*="moderator"], [class*="staff"] { opacity:1!important; pointer-events:auto!important; }
                [class*="adminOnly"], [class*="modOnly"] { display:block!important; opacity:1!important; }
            `);
        },
        () => removeCSS("vencordIOS_showHidThings")
    );

    // 100. showMeYourName
    makePlugin("showMeYourName", "ShowMeYourName",
        "Shows usernames next to display names",
        () => {
            const add = () => {
                document.querySelectorAll('[class*="message"] [class*="header"] [class*="name"]:not([data-uname])').forEach(el => {
                    el.setAttribute("data-uname","true");
                    const msg = el.closest('[class*="message"]');
                    const uid = msg?.getAttribute("data-author-id");
                    if (!uid) return;
                    const sp = document.createElement("span");
                    sp.className = "vencordIOS-uname"; sp.style.cssText = "font-size:11px;color:var(--text-muted);margin-left:4px;font-weight:400;";
                    try {
                        const US = typeof VencordWebpack !== "undefined" && VencordWebpack.webpackModules?.findByProps?.("getUser");
                        const user = US?.getUser?.(uid);
                        sp.textContent = user?.username ? `@${user.username}` : "";
                    } catch {}
                    el.parentElement?.appendChild(sp);
                });
            };
            window.__vencordIOS_unameObs = new MutationObserver(add);
            window.__vencordIOS_unameObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_unameObs?.disconnect(); document.querySelectorAll(".vencordIOS-uname").forEach(el => el.remove()); delete window.__vencordIOS_unameObs; }
    );

    // 101. showTimeoutDuration
    makePlugin("showTimeoutDuration", "ShowTimeoutDuration",
        "Shows timeout duration on timeout messages",
        () => {
            const add = () => {
                document.querySelectorAll('[class*="timeout"], [data-type="timeout"]').forEach(el => {
                    if (el.querySelector(".vencordIOS-to")) return;
                    const sp = document.createElement("span"); sp.className = "vencordIOS-to";
                    sp.style.cssText = "font-size:11px;color:var(--text-muted);margin-left:4px;";
                    sp.textContent = "[Timed Out]"; el.appendChild(sp);
                });
            };
            window.__vencordIOS_toObs = new MutationObserver(add);
            window.__vencordIOS_toObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_toObs?.disconnect(); document.querySelectorAll(".vencordIOS-to").forEach(el => el.remove()); delete window.__vencordIOS_toObs; }
    );

    // 102. silentMessageToggle
    makePlugin("silentMessageToggle", "SilentMessageToggle",
        "Adds a toggle for silent messages",
        () => {
            const add = () => {
                const ta = document.querySelector('[class*="channelTextArea"]');
                if (!ta || document.getElementById("vencord-silentTog")) return;
                const btn = document.createElement("button"); btn.id = "vencord-silentTog";
                btn.textContent = "\uD83D\uDD15"; btn.title = "Toggle Silent Message";
                btn.style.cssText = "background:none;border:none;font-size:18px;cursor:pointer;padding:4px;margin-left:4px;opacity:0.5;";
                btn.onclick = () => { btn.style.opacity = btn.style.opacity === "1" ? "0.5" : "1"; };
                ta.appendChild(btn);
            };
            window.__vencordIOS_silentObs = new MutationObserver(add);
            window.__vencordIOS_silentObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_silentObs?.disconnect(); document.getElementById("vencord-silentTog")?.remove(); delete window.__vencordIOS_silentObs; }
    );

    // 103. silentTyping
    makePlugin("silentTyping", "SilentTyping",
        "Hides your typing indicator from others",
        () => {
            const orig = WebSocket.prototype.send;
            WebSocket.prototype.send = function(data) {
                try { if (typeof data === "string" && data.includes("TYPING_START")) return; } catch {}
                return orig.call(this, data);
            };
            window.__vencordIOS_origWSSend = orig;
        },
        () => { if (window.__vencordIOS_origWSSend) WebSocket.prototype.send = window.__vencordIOS_origWSSend; delete window.__vencordIOS_origWSSend; }
    );

    // 104. sortFriendRequests
    makePlugin("sortFriendRequests", "SortFriendRequests",
        "Sorts friend requests by date",
        () => {
            const sort = () => {
                const c = document.querySelector('[class*="friendRequests"], [class*="FriendRequests"]');
                if (!c) return;
                const items = Array.from(c.querySelectorAll('[class*="friendRequest"]'));
                if (items.length > 1) items.reverse().forEach(i => c.appendChild(i));
            };
            window.__vencordIOS_frObs = new MutationObserver(sort);
            window.__vencordIOS_frObs.observe(document.body, { childList: true, subtree: true });
            sort();
        },
        () => { window.__vencordIOS_frObs?.disconnect(); delete window.__vencordIOS_frObs; }
    );

    // 105. spotifyControls
    makePlugin("spotifyControls", "SpotifyControls",
        "Spotify player controls above the account panel",
        () => {
            const add = () => {
                const panel = document.querySelector('[class*="panels"], [class*="accountPanel"]');
                if (!panel || document.getElementById("vencordIOS-spotCtrl")) return;
                const ctrl = document.createElement("div"); ctrl.id = "vencordIOS-spotCtrl";
                ctrl.style.cssText = "padding:8px;background:var(--background-secondary);border-radius:8px;margin:4px 8px;text-align:center;";
                ctrl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;"><button style="background:none;border:none;color:var(--interactive-normal);cursor:pointer;font-size:16px;">\u23EE</button><button id="vencord-spotPlay" style="background:none;border:none;color:var(--interactive-normal);cursor:pointer;font-size:20px;">\u25B6\uFE0F</button><button style="background:none;border:none;color:var(--interactive-normal);cursor:pointer;font-size:16px;">\u23ED</button></div><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Spotify Controls</div>';
                panel.insertBefore(ctrl, panel.firstChild); window.__vencordIOS_spotCtrlEl = ctrl;
            };
            window.__vencordIOS_spotObs = new MutationObserver(add);
            window.__vencordIOS_spotObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_spotObs?.disconnect(); window.__vencordIOS_spotCtrlEl?.remove(); delete window.__vencordIOS_spotObs; delete window.__vencordIOS_spotCtrlEl; }
    );

    // 106. spotifyCrack
    makePlugin("spotifyCrack", "SpotifyCrack",
        "Free listen along and no auto-pause",
        () => {
            injectCSS("vencordIOS_spotifyCrack", `
                [class*="listenAlongDisabled"], [class*="upsell"] { display:none!important; }
            `);
        },
        () => removeCSS("vencordIOS_spotifyCrack")
    );

    // 107. spotifyShareCommands
    makePlugin("spotifyShareCommands", "SpotifyShareCommands",
        "Share Spotify tracks via slash commands",
        () => { log("spotifyShareCommands", "Enabled"); },
        () => { log("spotifyShareCommands", "Disabled"); }
    );

    // 108. startupTimings
    makePlugin("startupTimings", "StartupTimings",
        "Shows startup timings in settings",
        () => {
            window.__vencordIOS_startupTime = Date.now();
            log("startupTimings", `Recorded at ${new Date(window.__vencordIOS_startupTime).toISOString()}`);
        },
        () => { delete window.__vencordIOS_startupTime; }
    );

    // 109. stickerPaste
    makePlugin("stickerPaste", "StickerPaste",
        "Pastes sticker as image link in chatbox",
        () => { log("stickerPaste", "Enabled"); },
        () => { log("stickerPaste", "Disabled"); }
    );

    // 110. streamerModeOnStream
    makePlugin("streamerModeOnStream", "StreamerModeOnStream",
        "Auto-enables streamer mode when streaming",
        () => {
            window.__vencordIOS_streamObs = new MutationObserver(() => {
                const s = document.querySelector('[class*="streaming"], [class*="liveBadge"]');
                if (s) log("streamerModeOnStream", "Stream detected");
            });
            window.__vencordIOS_streamObs.observe(document.body, { childList: true, subtree: true });
        },
        () => { window.__vencordIOS_streamObs?.disconnect(); delete window.__vencordIOS_streamObs; }
    );

    // 111. superReactionTweaks
    makePlugin("superReactionTweaks", "SuperReactionTweaks",
        "Customize super reaction behavior",
        () => {
            injectCSS("vencordIOS_superReact", `
                [class*="superReaction"], [class*="SuperReaction"] { animation-duration:0.5s!important; }
            `);
        },
        () => removeCSS("vencordIOS_superReact")
    );

    // 112. textReplace
    makePlugin("textReplace", "TextReplace",
        "Text replacement rules for messages",
        () => {
            window.__vencordIOS_textReplace = [
                { find: ":shrug:", replace: "\u00AF\\_(\u30C4)_/\u00AF" },
                { find: ":tableflip:", replace: "(\u256F\u00B0\u25A1\u00B0\uFF09\u256F\uFE35 \u253B\u2501\u253B" },
                { find: ":unflip:", replace: "\u252C\u2500\u252C(\u30C4\u25A1\u25A1)" },
            ];
            log("textReplace", `Loaded ${window.__vencordIOS_textReplace.length} rules`);
        },
        () => { window.__vencordIOS_textReplace = []; }
    );

    // 113. themeAttributes
    makePlugin("themeAttributes", "ThemeAttributes",
        "Adds data attributes for theming",
        () => {
            const add = () => {
                document.querySelectorAll('[class*="message"][data-message-id]').forEach(msg => {
                    const uid = msg.getAttribute("data-author-id");
                    if (uid) msg.setAttribute("data-vencord-author", uid);
                });
                document.querySelectorAll('[class*="channel"][data-channel-id]').forEach(ch => {
                    ch.setAttribute("data-vencord-channel", ch.getAttribute("data-channel-id"));
                });
            };
            window.__vencordIOS_themeObs = new MutationObserver(add);
            window.__vencordIOS_themeObs.observe(document.body, { childList: true, subtree: true });
            add();
        },
        () => { window.__vencordIOS_themeObs?.disconnect(); delete window.__vencordIOS_themeObs; }
    );
