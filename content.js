(function () {
    console.log('Chaturbate Multi-Stream Tracker Loaded');

    let trackedModels = []; // Changed to array for ordering
    let masterList = new Set(); // Store all models ever tracked
    let headerContainer = null;
    let gridContainer = null;
    let overlay = null;
    let isCollapsed = false;
    let isMutedAll = false;
    let draggedModel = null;

    async function initHeader() {
        if (document.getElementById('cb-multi-stream-header')) return;

        // Load state from storage
        await loadState();

        headerContainer = document.createElement('div');
        headerContainer.id = 'cb-multi-stream-header';
        if (isCollapsed) headerContainer.classList.add('collapsed');

        const headerTop = document.createElement('div');
        headerTop.className = 'cb-header-top';

        const title = document.createElement('h2');
        title.innerHTML = `Multi-Stream Tracking <small id="cb-count">(0)</small>`;

        const controls = document.createElement('div');
        controls.className = 'cb-header-controls';

        const muteBtn = document.createElement('button');
        muteBtn.id = 'cb-mute-all';
        muteBtn.className = 'cb-control-btn';
        muteBtn.innerHTML = isMutedAll ? 'Unmute All' : 'Mute All';
        muteBtn.title = 'Mute or unmute all active streams';
        muteBtn.onclick = toggleMuteAll;

        const openOnlineBtn = document.createElement('button');
        openOnlineBtn.id = 'cb-open-online';
        openOnlineBtn.className = 'cb-control-btn highlight';
        openOnlineBtn.innerHTML = 'Open All Online';
        openOnlineBtn.title = 'Open all models from history who are currently online';
        openOnlineBtn.onclick = openAllOnline;

        const collapseBtn = document.createElement('button');
        collapseBtn.id = 'cb-collapse-btn';
        collapseBtn.className = 'cb-control-btn';
        collapseBtn.innerHTML = isCollapsed ? 'Expand' : 'Collapse';
        collapseBtn.title = 'Show or hide the stream grid';
        collapseBtn.onclick = toggleCollapse;

        controls.appendChild(muteBtn);
        controls.appendChild(openOnlineBtn);
        controls.appendChild(collapseBtn);

        headerTop.appendChild(title);
        headerTop.appendChild(controls);

        gridContainer = document.createElement('div');
        gridContainer.className = 'cb-grid';

        headerContainer.appendChild(headerTop);
        headerContainer.appendChild(gridContainer);

        const siteNav = document.getElementById('nav');
        if (siteNav) {
            siteNav.after(headerContainer);
        } else {
            document.body.prepend(headerContainer);
        }

        initOverlay();

        // Restore tracked models
        if (trackedModels.length > 0) {
            headerContainer.classList.add('active');
            trackedModels.forEach(model => {
                renderStreamCard(model);
            });
            updateCount();
        }

        // Start offline checking - much more frequent for better UX
        setInterval(checkOfflineStatus, 5000);
        checkOfflineStatus();
    }

    async function loadState() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['trackedModels', 'masterList', 'isCollapsed', 'isMutedAll'], (result) => {
                if (result.trackedModels) {
                    trackedModels = result.trackedModels;
                }
                if (result.masterList) {
                    masterList = new Set(result.masterList);
                }
                isCollapsed = result.isCollapsed || false;
                isMutedAll = result.isMutedAll || false;
                resolve();
            });
        });
    }

    function saveState() {
        chrome.storage.local.set({
            trackedModels: trackedModels,
            masterList: Array.from(masterList),
            isCollapsed: isCollapsed,
            isMutedAll: isMutedAll
        });
    }

    function openAllOnline() {
        const onlineDiscoverable = new Set();
        document.querySelectorAll('li.roomCard').forEach(card => {
            const link = card.querySelector('a[href^="/"]');
            if (link) {
                const name = link.getAttribute('href').replace(/\//g, '');
                onlineDiscoverable.add(name);
            }
        });

        masterList.forEach(model => {
            if (onlineDiscoverable.has(model)) {
                addStream(model);
            }
        });
    }

    function checkOfflineStatus() {
        const onlineDiscoverable = new Set();
        // Chaturbate uses different selectors depending on the page and layout
        const cards = document.querySelectorAll('li.roomCard, div.room-card, .room_list_room, .female, .male, .couple, .trans');

        cards.forEach(card => {
            const link = card.querySelector('a[href^="/"]');
            if (link) {
                const name = link.getAttribute('href').replace(/\//g, '').split('?')[0];
                if (name && name !== 'in' && name !== 'jobs') {
                    onlineDiscoverable.add(name);
                }
            }
        });

        let onlineCount = 0;
        gridContainer.querySelectorAll('.cb-stream-card').forEach(card => {
            const model = card.dataset.model;

            // If we're on a page with room cards (like front page, tags, etc.)
            if (cards.length > 3) { // Lower threshold
                if (!onlineDiscoverable.has(model)) {
                    card.classList.add('is-offline');
                    card.style.setProperty('display', 'none', 'important');
                } else {
                    if (card.classList.contains('is-offline')) {
                        card.classList.remove('is-offline');
                        card.style.removeProperty('display');
                        // Reload iframe to ensure the stream starts playing immediately
                        const iframe = card.querySelector('iframe');
                        if (iframe) iframe.src = iframe.src;
                    }
                    onlineCount++;
                }
            } else {
                // If we can't see room lists (e.g. inside a room), we keep them visible
                card.classList.remove('is-offline');
                card.style.removeProperty('display');
                onlineCount++;
            }
        });
        updateCount(onlineCount);
    }

    function toggleCollapse() {
        isCollapsed = !isCollapsed;
        headerContainer.classList.toggle('collapsed', isCollapsed);
        document.getElementById('cb-collapse-btn').innerHTML = isCollapsed ? 'Expand' : 'Collapse';
        saveState();
    }

    function toggleMuteAll() {
        isMutedAll = !isMutedAll;
        document.getElementById('cb-mute-all').innerHTML = isMutedAll ? 'Unmute All' : 'Mute All';

        const iframes = gridContainer.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const video = doc?.querySelector('video');
                if (video) video.muted = isMutedAll;
            } catch (e) { }
        });
        saveState();
    }

    function initOverlay() {
        if (document.getElementById('cb-overlay')) return;

        overlay = document.createElement('div');
        overlay.id = 'cb-overlay';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'cb-overlay-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = closeFullscreen;

        overlay.onclick = (e) => {
            if (e.target === overlay) closeFullscreen();
        };

        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);
    }

    function openFullscreen(modelName) {
        // Pause all streams in the grid to save traffic
        pauseGridStreams();

        const container = document.createElement('div');
        container.className = 'cb-fullscreen-container';

        const iframe = document.createElement('iframe');
        iframe.src = `https://chaturbate.com/embed/${modelName}/?room=${modelName}&bgcolor=black`;
        iframe.allowFullscreen = true;
        iframe.setAttribute('scrolling', 'no');

        iframe.onload = () => {
            injectIframeStyles(iframe);
            setIframeQuality(iframe, 'Auto'); // Set best quality for fullscreen
        };

        container.appendChild(iframe);

        // Clear previous content but keep close button
        const closeBtn = overlay.querySelector('.cb-overlay-close');
        overlay.innerHTML = '';
        overlay.appendChild(closeBtn);
        overlay.appendChild(container);

        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeFullscreen() {
        overlay.classList.remove('active');
        overlay.querySelector('.cb-fullscreen-container')?.remove();
        document.body.style.overflow = '';

        // Resume all streams in the grid
        resumeGridStreams();
    }

    function pauseGridStreams() {
        const iframes = gridContainer.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const video = doc?.querySelector('video');
                if (video) video.pause();
            } catch (e) { }
        });
    }

    function resumeGridStreams() {
        const iframes = gridContainer.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const video = doc?.querySelector('video');
                if (video) video.play();
            } catch (e) { }
        });
    }

    function setIframeQuality(iframe, qualityLabel) {
        const trySet = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                if (!doc) return;
                const items = Array.from(doc.querySelectorAll('.vjs-menu-item'));
                const target = items.find(i => i.innerText.toLowerCase().includes(qualityLabel.toLowerCase()));
                if (target && !target.classList.contains('vjs-selected')) {
                    target.click();
                }
            } catch (e) { }
        };
        // Retry a few times as Chaturbate player loads components lazily
        setTimeout(trySet, 1500);
        setTimeout(trySet, 4000);
    }

    function injectIframeStyles(iframe) {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc) return;

            const style = doc.createElement('style');
            style.textContent = `
                #nav, .header, .footer, .chat-section, .room-header, .top-section, 
                .footer-content, .bottom-section, .setup-content, #disclaimer-container,
                .side-section, #header, #footer, .user-actions, .video-info { display: none !important; }
                
                body, html { 
                    overflow: hidden !important; 
                    background: black !important; 
                    margin: 0 !important; 
                    padding: 0 !important; 
                    width: 100% !important; 
                    height: 100% !important; 
                }
                
                .video-container, #TheaterModePlayer, .videoPlayerDiv, #video-player { 
                    position: fixed !important; 
                    top: 0 !important; 
                    left: 0 !important; 
                    width: 100vw !important; 
                    height: 100vh !important; 
                    z-index: 99999 !important; 
                }
                
                video.vjs-tech {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: contain !important;
                }
            `;
            doc.head.appendChild(style);
        } catch (e) {
            console.warn('Cannot access iframe content', e);
        }
    }

    function addStream(modelName) {
        if (trackedModels.includes(modelName)) return;
        trackedModels.push(modelName);
        masterList.add(modelName);
        saveState();

        headerContainer.classList.add('active');
        updateCount();
        renderStreamCard(modelName);
    }

    function renderStreamCard(modelName) {
        if (gridContainer.querySelector(`.cb-stream-card[data-model="${modelName}"]`)) return;

        const card = document.createElement('div');
        card.className = 'cb-stream-card loading';
        card.dataset.model = modelName;
        card.draggable = true;

        // Drag and Drop Events
        card.ondragstart = (e) => {
            card.classList.add('dragging');
            draggedModel = modelName;
            e.dataTransfer.effectAllowed = 'move';
        };

        card.ondragend = () => {
            card.classList.remove('dragging');
            gridContainer.querySelectorAll('.cb-stream-card').forEach(c => c.classList.remove('drag-over'));
        };

        card.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.classList.add('drag-over');
        };

        card.ondragleave = () => {
            card.classList.remove('drag-over');
        };

        card.ondrop = (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            if (draggedModel !== modelName) {
                reorderModels(draggedModel, modelName);
            }
        };

        card.onclick = (e) => {
            if (e.target.closest('.cb-close-btn')) return;
            openFullscreen(modelName);
        };

        const cardHeader = document.createElement('div');
        cardHeader.className = 'cb-card-header';

        const title = document.createElement('span');
        title.className = 'cb-card-title';
        title.innerText = modelName;

        const cardControls = document.createElement('div');
        cardControls.className = 'cb-card-controls';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'cb-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Remove this stream';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            removeStream(modelName);
        };

        cardHeader.appendChild(title);
        cardHeader.appendChild(closeBtn);

        const iframe = document.createElement('iframe');
        iframe.src = `https://chaturbate.com/embed/${modelName}/?room=${modelName}&bgcolor=black`;
        iframe.allowFullscreen = true;
        iframe.setAttribute('scrolling', 'no');

        iframe.onload = () => {
            card.classList.remove('loading');
            injectIframeStyles(iframe);
            setIframeQuality(iframe, '240p'); // Set low quality for grid
            if (isMutedAll) {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    const video = doc?.querySelector('video');
                    if (video) video.muted = true;
                } catch (e) { }
            }
        };

        card.appendChild(cardHeader);
        card.appendChild(iframe);
        gridContainer.appendChild(card);
    }

    function removeStream(modelName) {
        trackedModels = trackedModels.filter(m => m !== modelName);
        saveState();

        const card = gridContainer.querySelector(`.cb-stream-card[data-model="${modelName}"]`);
        if (card) card.remove();

        if (trackedModels.length === 0) {
            headerContainer.classList.remove('active');
        }
        updateCount();

        // Update just this specific button
        const originalBtn = document.querySelector(`.cb-track-btn[data-model="${modelName}"]`);
        if (originalBtn) {
            updateButtonState(originalBtn, modelName);
        }
    }

    function reorderModels(movingModel, targetModel) {
        const oldIndex = trackedModels.indexOf(movingModel);
        const newIndex = trackedModels.indexOf(targetModel);

        if (oldIndex !== -1 && newIndex !== -1) {
            trackedModels.splice(oldIndex, 1);
            trackedModels.splice(newIndex, 0, movingModel);
            saveState();
            refreshGrid();
        }
    }

    function refreshGrid() {
        gridContainer.innerHTML = '';
        trackedModels.forEach(model => {
            renderStreamCard(model);
        });
        checkOfflineStatus(); // Re-apply offline hiding safely after refresh
    }

    function updateCount(onlineOverride) {
        const countEl = document.getElementById('cb-count');
        if (countEl) {
            const total = trackedModels.length;
            const online = onlineOverride !== undefined ? onlineOverride : total;
            countEl.innerText = total > 0 ? `(${online}/${total})` : `(0)`;
        }
    }

    function injectButtons() {
        const roomCards = document.querySelectorAll('li.roomCard:not(.cb-processed)');
        if (roomCards.length === 0) return;

        roomCards.forEach(card => {
            card.classList.add('cb-processed');
            const link = card.querySelector('a[href^="/"]');
            if (!link) return;

            const modelName = link.getAttribute('href').replace(/\//g, '');
            if (!modelName || modelName === 'in' || modelName === 'jobs') return;

            let btn = card.querySelector('.cb-track-btn');
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'cb-track-btn';
                btn.dataset.model = modelName;

                const details = card.querySelector('.details');
                if (details) {
                    details.appendChild(btn);
                } else {
                    card.appendChild(btn);
                }

                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (trackedModels.includes(modelName)) {
                        removeStream(modelName);
                    } else {
                        addStream(modelName);
                    }
                    updateButtonState(btn, modelName);
                };
            }

            updateButtonState(btn, modelName);
        });
    }

    function updateButtonState(btn, modelName) {
        const isTracking = trackedModels.includes(modelName);
        const nextText = isTracking ? 'Untrack' : 'Track';

        if (btn.innerText !== nextText) {
            btn.innerText = nextText;
        }

        if (isTracking) {
            btn.classList.add('tracking');
        } else {
            btn.classList.remove('tracking');
        }
    }

    initHeader().then(() => {
        injectButtons();
    });

    let observerDebounce = null;
    const observer = new MutationObserver((mutations) => {
        // Skip mutations inside our own header or if it's just our buttons changing
        const isSelf = mutations.every(m => {
            const target = m.target;
            if (!target) return true;
            const isInsideHeader = headerContainer && headerContainer.contains(target);
            const isOurButton = target.nodeType === 1 && target.classList.contains && target.classList.contains('cb-track-btn');
            return isInsideHeader || isOurButton;
        });
        if (isSelf) return;

        clearTimeout(observerDebounce);
        observerDebounce = setTimeout(injectButtons, 300);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
