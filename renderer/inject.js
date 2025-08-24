// 7TV + Telegram WebK injector
(() => {
    const GLOBAL_SET_URL = 'https://7tv.io/v3/emote-sets/01FQTMFVT00000QXHG0DRS80W1';
    const USER_IDS = [
        '01FEGJ99QR000AENY3GSAKBAHP',
        '01FQTMFVT00000QXHG0DRS80W1'
    ];
    const USER_API = (id) => `https://7tv.io/v3/users/${id}`;
    const SET_API = (id) => `https://7tv.io/v3/emote-sets/${id}`;
    const CDN = (id, animated, scale = 2) => {
        const ext = animated ? 'gif' : 'webp';
        return `https://cdn.7tv.app/emote/${id}/${scale}x.${ext}`;
    };

    const state = {
        emotes: new Map(), // name -> { id, name, animated, url }
        names: [],         // sorted list of names
        loaded: false,
        observer: null,
        suggestEl: null,
        toastEl: null
    };

    // Simple cache in localStorage (1 day)
    const cache = {
        get(key) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                const { t, v } = JSON.parse(raw);
                if (Date.now() - t > 24 * 3600 * 1000) return null;
                return v;
            } catch { return null; }
        },
        set(key, v) {
            try {
                localStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
            } catch { }
        }
    };

    async function fetchJSON(url) {
        const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.json();
    }

    async function loadEmotes() {
        const cached = cache.get('e7-emotes-v1');
        if (cached) {
            applyEmotes(cached);
            showToast(`${cached.length} emotes loaded`);
            return;
        }

        // API endpoints
        const GLOBAL_SET_URL = 'https://7tv.io/v3/emote-sets/01FQTMFVT00000QXHG0DRS80W1';
        const USER_IDS = [
            '01FQTMFVT00000QXHG0DRS80W1', // PWGood
            '01FEGJ99QR000AENY3GSAKBAHP'  // Olesha
        ];
        const USER_API = (id) => `https://7tv.io/v3/users/${id}`;
        const SET_API = (id) => `https://7tv.io/v3/emote-sets/${id}`;
        const CDN = (id, animated, scale = 2) => {
            const ext = animated ? 'gif' : 'webp';
            return `https://cdn.7tv.app/emote/${id}/${scale}x.${ext}`;
        };

        // Fetch global set
        const globalSet = await fetchJSON(GLOBAL_SET_URL);

        // Fetch each user’s set
        const userSets = [];
        for (const uid of USER_IDS) {
            try {
                const user = await fetchJSON(USER_API(uid));
                const setId = user?.emote_set?.id;
                if (setId) {
                    const set = await fetchJSON(SET_API(setId));
                    userSets.push(set);
                }
            } catch (err) {
                console.error(`[7TV] Failed to load user set for ${uid}`, err);
            }
        }

        // Merge sets: user sets first (higher priority), then global
        const allSets = [...userSets, globalSet];
        const emoteMap = new Map();

        for (const set of allSets) {
            for (const e of set.emotes || []) {
                const name = e.name.toLowerCase();
                if (!emoteMap.has(name)) {
                    const animated = (e.flags & 1) === 1;
                    emoteMap.set(name, {
                        id: e.id,
                        name,
                        animated,
                        url: CDN(e.id, animated, 2)
                    });
                }
            }
        }

        const list = Array.from(emoteMap.values());
        cache.set('e7-emotes-v1', list);
        applyEmotes(list);
        showToast(`${list.length} emotes loaded`);
    }


    function applyEmotes(list) {
        state.emotes.clear();
        list.forEach(e => state.emotes.set(e.name, e));
        state.names = Array.from(state.emotes.keys()).sort();
        state.loaded = true;
        if (window.e7?.log) window.e7.log(`Loaded ${state.names.length} emotes`);
        bootAfterEmotes();
    }

    function showToast(text) {
        if (state.toastEl) state.toastEl.remove();
        const el = document.createElement('div');
        el.id = 'e7-toast';
        el.textContent = text;
        document.body.appendChild(el);
        state.toastEl = el;
        setTimeout(() => el.remove(), 2800);
    }

    function findComposer() {
        // Strategy: active contenteditable within footer/compose area
        const ae = document.activeElement;
        if (ae && ae.isContentEditable) return ae;

        // Fallback: any visible contenteditable with placeholder “Message”
        const nodes = document.querySelectorAll('[contenteditable="true"]');
        for (const n of nodes) {
            const rect = n.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0;
            if (visible) return n;
        }
        return null;
    }

    function getCaretClientRect() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0).cloneRange();
        let rect = null;
        if (range.getClientRects) {
            range.collapse(true);
            const r = range.getClientRects();
            rect = r.length ? r[0] : range.getBoundingClientRect();
        }
        if (!rect || !rect.left) return null;
        return rect;
    }

    function ensureSuggestEl() {
        if (state.suggestEl) return state.suggestEl;
        const el = document.createElement('div');
        el.id = 'e7-suggest';
        el.style.display = 'none';
        document.body.appendChild(el);
        state.suggestEl = el;
        return el;
    }

    function filterNames(prefix) {
        const p = prefix.toLowerCase();
        const starts = [];
        const contains = [];
        for (const name of state.names) {
            if (name.startsWith(p)) starts.push(name);
            else if (name.includes(p)) contains.push(name);
            if (starts.length >= 50) break;
        }
        return starts.concat(contains).slice(0, 50);
    }

    function openSuggest(prefix) {
        const el = ensureSuggestEl();
        const rect = getCaretClientRect();
        if (!rect) return closeSuggest();

        const items = filterNames(prefix);
        if (!items.length) return closeSuggest();

        el.innerHTML = '';
        items.forEach((name, idx) => {
            const em = state.emotes.get(name);
            const row = document.createElement('div');
            row.className = 'e7-item' + (idx === 0 ? ' active' : '');
            row.dataset.name = name;

            const img = document.createElement('img');
            img.src = em.url;
            img.alt = name;

            const span = document.createElement('span');
            span.className = 'e7-name';
            span.textContent = `:${name}:`;

            row.appendChild(img);
            row.appendChild(span);
            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                insertShortcode(name);
                closeSuggest();
            });
            el.appendChild(row);
        });

        const top = Math.min(window.innerHeight - 300, rect.bottom + 8);
        const left = Math.max(12, Math.min(window.innerWidth - 380, rect.left - 8));
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        el.style.display = 'block';
    }

    function closeSuggest() {
        if (state.suggestEl) state.suggestEl.style.display = 'none';
    }

    function moveActive(delta) {
        const el = state.suggestEl;
        if (!el || el.style.display === 'none') return;
        const rows = Array.from(el.querySelectorAll('.e7-item'));
        const idx = rows.findIndex(r => r.classList.contains('active'));
        const next = (idx + delta + rows.length) % rows.length;
        rows.forEach(r => r.classList.remove('active'));
        rows[next].classList.add('active');
    }

    function chooseActive() {
        const el = state.suggestEl;
        if (!el || el.style.display === 'none') return;
        const row = el.querySelector('.e7-item.active') || el.querySelector('.e7-item');
        if (row) {
            insertShortcode(row.dataset.name);
            closeSuggest();
        }
    }

    function insertShortcode(name) {
        const ce = findComposer();
        if (!ce) return;
        const sc = `:${name}:`;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            ce.append(sc);
            return;
        }
        const range = sel.getRangeAt(0);
        // Replace current typed token (e.g., ":ke") with the full ":kekb:"
        const tokenRange = findCurrentTokenRange(range);
        if (tokenRange) {
            tokenRange.deleteContents();
            tokenRange.insertNode(document.createTextNode(sc + ' '));
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStartAfter(ce.lastChild);
            r.collapse(true);
            sel.addRange(r);
        } else {
            range.insertNode(document.createTextNode(sc + ' '));
            sel.collapseToEnd();
        }
    }

    function findCurrentTokenRange(range) {
        // Scan backwards in the same text node to the nearest ":" without whitespace in-between
        const ce = findComposer();
        if (!ce) return null;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;

        const r = sel.getRangeAt(0);
        if (!r.startContainer) return null;

        // Work only if in a text node or inside a span -> get a text node
        let node = r.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) {
            // try to get a text node at the offset
            if (node.childNodes && node.childNodes.length) {
                node = node.childNodes[Math.min(r.startOffset, node.childNodes.length - 1)];
                if (!node || node.nodeType !== Node.TEXT_NODE) return null;
            } else {
                return null;
            }
        }

        const text = node.textContent || '';
        const pos = r.startOffset;
        let i = pos - 1;
        while (i >= 0 && text[i] !== '\n' && !/\s/.test(text[i]) && text[i] !== ':') i--;
        if (i >= 0 && text[i] === ':') {
            // token is from i to current pos
            const token = text.slice(i + 1, pos);
            if (/^[a-z0-9_]{1,32}$/i.test(token)) {
                const tr = document.createRange();
                tr.setStart(node, i);
                tr.setEnd(node, pos);
                return tr;
            }
        }
        return null;
    }

    function enhanceMessages(root = document) {
        const nodes = root.querySelectorAll
            ? root.querySelectorAll('*:not(script):not(style)')
            : [];
        const re = /:([a-z0-9_]{2,32}):/gi;

        const walk = (el) => {
            for (const child of Array.from(el.childNodes)) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.nodeValue;
                    if (!text || !re.test(text)) continue;

                    const frag = document.createDocumentFragment();
                    let last = 0;
                    text.replace(re, (m, name, offset) => {
                        const lower = name.toLowerCase();
                        const em = state.emotes.get(lower);
                        if (!em) return m;

                        if (offset > last) {
                            frag.appendChild(document.createTextNode(text.slice(last, offset)));
                        }

                        const img = document.createElement('img');
                        img.className = 'e7-emote';
                        img.alt = `:${lower}:`;
                        img.src = em.url;

                        const span = document.createElement('span');
                        span.className = 'emoji e7-emoji';
                        span.appendChild(img);

                        frag.appendChild(span);


                        last = offset + m.length;
                        return m;
                    });

                    if (last < text.length) {
                        frag.appendChild(document.createTextNode(text.slice(last)));
                    }

                    if (frag.childNodes.length) {
                        el.replaceChild(frag, child);
                        // Big emoji mode: ≤3 emojis, no other text
                        const emojis = el.querySelectorAll('.emoji.e7-emoji');
                        if (emojis.length > 0) {
                            const clone = el.cloneNode(true);
                            clone.querySelectorAll('.emoji.e7-emoji').forEach(e => e.remove());
                            const leftover = clone.textContent.trim();
                            const onlyEmojis = leftover.length === 0 && emojis.length <= 3;

                            emojis.forEach(e => e.classList.toggle('e7-emoji--big', onlyEmojis));
                        }

                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    walk(child);
                }
            }
        };

        // Target message texts
        const msgTexts = document.querySelectorAll('[data-peer-id] div, [class*="message"] div');
        msgTexts.forEach(el => walk(el));
    }

    function observeMessages() {
        if (state.observer) state.observer.disconnect();
        state.observer = new MutationObserver((mut) => {
            for (const m of mut) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        enhanceMessages(node);
                    }
                }
            }
        });
        state.observer.observe(document.body, { childList: true, subtree: true });
    }

    function handleKeyEvents() {
        document.addEventListener('keydown', (e) => {
            const ce = findComposer();
            if (!ce) return;

            // Navigate suggestions
            if (state.suggestEl && state.suggestEl.style.display !== 'none') {
                if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseActive(); return; }
                if (e.key === 'Escape') { closeSuggest(); return; }
            }

            // Open suggestions if typing token ":<letters>"
            if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                requestAnimationFrame(() => {
                    const sel = window.getSelection();
                    if (!sel || sel.rangeCount === 0) return;

                    const r = sel.getRangeAt(0);
                    const tr = findCurrentTokenRange(r);
                    if (!tr) { closeSuggest(); return; }

                    const node = tr.startContainer;
                    const text = node.textContent || '';
                    const name = text.slice(tr.startOffset + 1, tr.endOffset);
                    if (/^[a-z0-9_]{1,32}$/i.test(name)) {
                        openSuggest(name);
                    } else {
                        closeSuggest();
                    }
                });
            }
        });

        document.addEventListener('click', (e) => {
            const target = e.target;
            if (state.suggestEl && !state.suggestEl.contains(target)) {
                // Keep it open only if clicking inside; otherwise close
                if (!(target && target.closest('#e7-suggest'))) closeSuggest();
            }
        });
    }

    function bootAfterEmotes() {
        // Enhance any existing messages and start observing
        enhanceMessages(document);
        observeMessages();
        handleKeyEvents();
    }

    // Theme adapt
    function applyThemeVars() {
        const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
        const root = document.documentElement;
        if (isDark) {
            root.style.setProperty('--e7-bg', '#1f1f1f');
            root.style.setProperty('--e7-fg', '#ffffff');
        } else {
            root.style.setProperty('--e7-bg', '#ffffff');
            root.style.setProperty('--e7-fg', '#111111');
        }
    }

    // Boot
    applyThemeVars();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyThemeVars);
    loadEmotes().catch(err => {
        console.error('[7TV] load error', err);
        showToast('Failed to load emotes');
    });
})();
