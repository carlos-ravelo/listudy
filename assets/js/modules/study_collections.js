export function setupStudyCollections({ getPgn, getChapter }) {
    const addBtn = document.getElementById("add_to_collection");
    const manageBtn = document.getElementById("manage_collection");
    const chapterSelect = document.getElementById("chapter_select");

    // --- UX: Clean and adjust the title ---
    const h1Title = document.querySelector('h1.clicking_turns_on_hints');
    if (h1Title) {
        h1Title.innerText = h1Title.innerText.replace(/_/g, ' ');
        h1Title.style.fontSize = '1.8rem';
        h1Title.style.marginBottom = '10px';
    }

    const modal = document.getElementById("collection_modal");
    const listEl = document.getElementById("collection_list");
    const selectorEl = document.getElementById("collection_selector");
    const newBtn = document.getElementById("btn_new_collection");
    const renameBtn = document.getElementById("btn_rename_collection");
    const deleteBtn = document.getElementById("btn_delete_collection");

    // Utilities to fetch current UI context
    function getFallbackChapterTitle(pgnStr) {
        let match = pgnStr.match(/\[Event\s+"([^"]+)"\]/i);
        if (match && match[1] && match[1] !== "?") return match[1];
        match = pgnStr.match(/\[White\s+"([^"]+)"\]/i);
        return match ? match[1] : "Unnamed Chapter";
    }

    function getCurrentChapterTitle() {
        if (chapterSelect && chapterSelect.options.length > 0 && getChapter() !== null && getChapter() !== undefined) {
            return chapterSelect.options[getChapter()].text.trim();
        }
        return "Unnamed Chapter";
    }

    function getCurrentStudyTitle() {
        let h1 = document.querySelector('h1.clicking_turns_on_hints');
        if (h1) return h1.innerText.trim();
        return document.title.split('-')[0].trim() || "Unknown Study";
    }

    function getCurrentChapterPgn() {
        const pgn = getPgn();
        const chapter = getChapter();
        if (typeof pgn !== 'string' || chapter === null || chapter === undefined) return null;
        let pgnGames = pgn.trim().split(/(?<=\*|1-0|0-1|1\/2-1\/2)\s+(?=\[)/);
        let current = pgnGames[chapter];
        return current ? current.trim() : null;
    }

    // --- Core Data Management ---
    function getCollectionsData() {
        let data = JSON.parse(localStorage.getItem('listudy_collections'));
        
        // Auto-migration: Move old data to the new structure
        if (!data) {
            let oldCart = JSON.parse(localStorage.getItem('listudy_cart') || '[]');
            data = {
                active: "Default",
                collections: {
                    "Default": oldCart
                }
            };
            localStorage.removeItem('listudy_cart');
            saveCollectionsData(data);
        }
        return data;
    }

    function saveCollectionsData(data) {
        localStorage.setItem('listudy_collections', JSON.stringify(data));
    }

    function getActiveCart() {
        let data = getCollectionsData();
        if (!data.collections[data.active]) {
            data.collections[data.active] = [];
        }
        
        // Migrate old string elements if they exist
        let migrated = false;
        let cart = data.collections[data.active].map(item => {
            if (typeof item === 'string') {
                migrated = true;
                return { 
                    pgn: item, 
                    study: "Unknown Study", 
                    title: getFallbackChapterTitle(item),
                    studyPath: window.location.pathname.split('?')[0]
                };
            }
            return item;
        });
        
        if (migrated) {
            data.collections[data.active] = cart;
            saveCollectionsData(data);
        }
        return cart;
    }

    // --- UI Rendering ---
    function renderSelector() {
        let data = getCollectionsData();
        selectorEl.innerHTML = "";
        Object.keys(data.collections).forEach(colName => {
            let option = document.createElement("option");
            option.value = colName;
            option.textContent = colName;
            if (colName === data.active) option.selected = true;
            selectorEl.appendChild(option);
        });
    }

    
    // We add an optional parameter to track which item just moved
    function renderModalList(highlightIndex = -1) {
        let data = getCollectionsData();
        let cart = data.collections[data.active];
        
        // Inject a tiny animation just for the highlighted row
        listEl.innerHTML = `
            <style>
                @keyframes flashSuccess {
                    0% { background-color: #d4edda; }
                    100% { background-color: transparent; }
                }
                .highlight-row { animation: flashSuccess 0.8s ease-out; }
            </style>
        `;
        
        if (cart.length === 0) {
            listEl.innerHTML += "<li style='padding:10px 0;'>This collection is empty.</li>";
            return;
        }

        let hasOtherCollections = Object.keys(data.collections).length > 1;
        let moveOptionsHtml = `<option value="" disabled selected>📦 Move</option>`;
        if (hasOtherCollections) {
            Object.keys(data.collections).forEach(col => {
                if (col !== data.active) {
                    moveOptionsHtml += `<option value="${col}">${col}</option>`;
                }
            });
        }

        let lastStudy = null;

        cart.forEach((item, index) => {
            let studyName = item.study || "Unknown Study";
            
            if (studyName !== lastStudy) {
                let studyHeader = document.createElement("li");
                studyHeader.innerHTML = `<strong style="display:block; padding: 15px 0 5px 0; border-bottom: 2px solid #ddd; margin-bottom: 5px; color: #0056b3; font-size: 0.9em;">📘 ${studyName}</strong>`;
                listEl.appendChild(studyHeader);
                lastStudy = studyName; 
            }

            let li = document.createElement("li");
            li.style = "display:flex; justify-content:space-between; align-items:center; padding:5px 0 5px 15px; border-bottom:1px solid #f5f5f5;";
            
            // Add the highlight class if this is the row that just moved
            if (index === highlightIndex) {
                li.className = "highlight-row";
            }
            
            let safePath = item.studyPath || window.location.pathname.split('?')[0];
            let chapterUrl = `${safePath}?chapter=${encodeURIComponent(item.title)}`;
            
            let isFirst = index === 0;
            let isLast = index === cart.length - 1;
            
            let moveSelectHtml = hasOtherCollections 
                ? `<select data-index="${index}" class="move_chapter" style="background:transparent; border:1px solid #ddd; border-radius:4px; font-size:0.8em; cursor:pointer; margin-right:8px; padding:2px; max-width:80px;" title="Move to another collection">${moveOptionsHtml}</select>`
                : '';

            // Shorten the study name slightly so it doesn't break the layout
            let shortStudyName = studyName.length > 25 ? studyName.substring(0, 25) + "..." : studyName;

            // Added the small study name right next to the chapter title
            li.innerHTML = `
                <span style="padding-right:10px; flex-grow:1; line-height:1.4; word-break:break-word;">
                    • <a href="${chapterUrl}" style="color:#007BFF; text-decoration:none;" target="_blank" title="Go to chapter">${item.title}</a>
                    <span style="font-size:0.75em; color:#888; margin-left:6px;" title="${studyName}">(${shortStudyName})</span>
                </span>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    ${moveSelectHtml}
                    <button data-index="${index}" class="move_up" style="background:transparent; border:none; cursor:pointer; opacity: ${isFirst ? '0.2' : '1'}; padding:2px;" ${isFirst ? 'disabled' : ''} title="Move Up">⬆️</button>
                    <button data-index="${index}" class="move_down" style="background:transparent; border:none; cursor:pointer; opacity: ${isLast ? '0.2' : '1'}; padding:2px;" ${isLast ? 'disabled' : ''} title="Move Down">⬇️</button>
                    <button data-index="${index}" class="remove_chapter" style="background:transparent; border:none; color:#dc3545; cursor:pointer; font-weight:bold; margin-left:8px; padding:2px;" title="Remove chapter">✕</button>
                </div>
            `;
            listEl.appendChild(li);
        });

        // Event Listener: Move Up
        document.querySelectorAll(".move_up").forEach(btn => {
            btn.onclick = function() {
                let idx = parseInt(this.getAttribute("data-index"), 10);
                let currentData = getCollectionsData();
                let currentCart = currentData.collections[currentData.active];
                if (idx > 0) {
                    [currentCart[idx - 1], currentCart[idx]] = [currentCart[idx], currentCart[idx - 1]];
                    saveCollectionsData(currentData);
                    // Re-render and highlight the new position
                    renderModalList(idx - 1);
                }
            };
        });

        // Event Listener: Move Down
        document.querySelectorAll(".move_down").forEach(btn => {
            btn.onclick = function() {
                let idx = parseInt(this.getAttribute("data-index"), 10);
                let currentData = getCollectionsData();
                let currentCart = currentData.collections[currentData.active];
                if (idx < currentCart.length - 1) {
                    [currentCart[idx + 1], currentCart[idx]] = [currentCart[idx], currentCart[idx + 1]];
                    saveCollectionsData(currentData);
                    // Re-render and highlight the new position
                    renderModalList(idx + 1);
                }
            };
        });

        // Event Listener: Move to another collection
        document.querySelectorAll(".move_chapter").forEach(select => {
            select.onchange = function() {
                let idx = parseInt(this.getAttribute("data-index"), 10);
                let targetCol = this.value;
                let currentData = getCollectionsData();
                
                if (targetCol && currentData.collections[targetCol]) {
                    let itemToMove = currentData.collections[currentData.active].splice(idx, 1)[0];
                    currentData.collections[targetCol].push(itemToMove);
                    
                    saveCollectionsData(currentData);
                    renderModalList();
                    updateCartUI();
                }
            };
        });

        // Event Listener: Delete
        document.querySelectorAll(".remove_chapter").forEach(btn => {
            btn.onclick = function() {
                let idx = parseInt(this.getAttribute("data-index"), 10);
                let currentData = getCollectionsData();
                currentData.collections[currentData.active].splice(idx, 1);
                saveCollectionsData(currentData);
                renderModalList();
                updateCartUI();
            };
        });
    }
    
    function updateCartUI() {
        if (!addBtn) return;
        let cart = getActiveCart();
        let data = getCollectionsData();
        let currentPgn = getCurrentChapterPgn();
        
        let isAlreadyAdded = currentPgn && cart.some(item => item.pgn === currentPgn);

        // Truncate the name if it's too long so the button doesn't break
        let displayName = data.active.length > 12 ? data.active.substring(0, 12) + "..." : data.active;

        if (isAlreadyAdded) {
            addBtn.innerHTML = `Already in [${displayName}] (<span id="collection_count">${cart.length}</span>)`;
            addBtn.style.opacity = "0.5";
            addBtn.style.cursor = "default";
        } else {
            addBtn.innerHTML = `➕ Add to [${displayName}] (${cart.length})`;
            addBtn.style.opacity = "1";
            addBtn.style.cursor = "pointer";
        }
        
        // Show "Manage" if ANY collection has at least 1 item
        let hasItemsAnywhere = Object.values(data.collections).some(arr => arr.length > 0);
        let hasMultipleCollections = Object.keys(data.collections).length > 1;
        if (manageBtn) {
            manageBtn.style.display = (hasItemsAnywhere || hasMultipleCollections) ? 'inline-block' : 'none';
        }    }

    // --- Main Actions & Listeners ---
    if (addBtn) {
        // Wait for page variables to load before checking status
        let initCheck = setInterval(() => {
            if (typeof getPgn() === 'string' && getChapter() !== null && getChapter() !== undefined) {
                clearInterval(initCheck);
                updateCartUI();
            }
        }, 150);
        addBtn.onclick = function(e) {
            e.preventDefault();
            let cleanPgn = getCurrentChapterPgn();
            if (cleanPgn) {
                let data = getCollectionsData();
                let cart = data.collections[data.active];
                
                if (cart.some(item => item.pgn === cleanPgn)) return; 

                cart.push({
                    pgn: cleanPgn,
                    study: getCurrentStudyTitle(),
                    title: getCurrentChapterTitle(),
                    studyPath: window.location.pathname.split('?')[0]
                });
                
                saveCollectionsData(data);
                updateCartUI();
            }
        };

        if (manageBtn) {
            manageBtn.onclick = function(e) {
                e.preventDefault();
                renderSelector();
                renderModalList();
                modal.style.display = 'flex';
            };
        }

        // Change active collection
        selectorEl.addEventListener('change', function(e) {
            let data = getCollectionsData();
            data.active = e.target.value;
            saveCollectionsData(data);
            renderModalList();
            updateCartUI();
        });

        // Create new collection
        newBtn.onclick = function() {
            let name = prompt("Enter a name for the new collection:");
            if (name && name.trim() !== "") {
                let data = getCollectionsData();
                let cleanName = name.trim();
                
                if (!data.collections[cleanName]) {
                    data.collections[cleanName] = [];
                }
                data.active = cleanName;
                
                saveCollectionsData(data);
                renderSelector();
                renderModalList();
                updateCartUI();
            }
        };
// Rename collection
        renameBtn.onclick = function() {
            let data = getCollectionsData();
            let currentName = data.active;
            let newName = prompt(`Rename collection "${currentName}" to:`, currentName);
            
            if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
                let cleanName = newName.trim();
                
                if (data.collections[cleanName]) {
                    alert("A collection with this name already exists.");
                    return;
                }
                
                // Move the array to the new key and delete the old key
                data.collections[cleanName] = data.collections[currentName];
                delete data.collections[currentName];
                data.active = cleanName;
                
                saveCollectionsData(data);
                renderSelector();
                renderModalList();
                updateCartUI();
            }
        };

        // Delete collection
        deleteBtn.onclick = function() {
            let data = getCollectionsData();
            let currentName = data.active;
            
            // Prevent deleting the very last collection
            if (Object.keys(data.collections).length === 1) {
                alert("You cannot delete your only collection. You can 'Clear' its contents instead.");
                return;
            }

            if (confirm(`Are you sure you want to completely delete the collection "${currentName}"?`)) {
                delete data.collections[currentName];
                
                // Automatically switch to the first available collection
                data.active = Object.keys(data.collections)[0];
                
                saveCollectionsData(data);
                renderSelector();
                renderModalList();
                updateCartUI();
            }
        };

        // Modal close controls
        document.getElementById("modal_close").onclick = () => modal.style.display = 'none';
        
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // Clear active collection
        document.getElementById("modal_clear").onclick = () => {
            let data = getCollectionsData();
            if(confirm(`Are you sure you want to clear all chapters in "${data.active}"?`)) {
                data.collections[data.active] = [];
                saveCollectionsData(data);
                renderModalList();
                updateCartUI();
            }
        };

        // Download active collection PGN
        document.getElementById("modal_download").onclick = () => {
            let cart = getActiveCart();
            if (cart.length === 0) return;
            let data = getCollectionsData();
            
            let combinedPgn = cart.map(item => item.pgn).join('\n\n\n');
            let blob = new Blob([combinedPgn], { type: "text/plain" });
            let link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            
            // Format filename using the active collection name
            let safeName = data.active.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.download = `${safeName}.pgn`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        if (chapterSelect) {
            chapterSelect.addEventListener('change', () => setTimeout(updateCartUI, 150));
        }
    }
}