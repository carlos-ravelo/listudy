export function setupStudyNavigation({ getPgn, getChapter, goBack, goForward }) {
    function triggerRandomChapter() {
        let selectObj = document.getElementById("chapter_select");
        
        if (selectObj && selectObj.options.length > 1) {
            let totalOptions = selectObj.options.length;
            let currentIndex = selectObj.selectedIndex;
            
            let randomIndex = Math.floor(Math.random() * totalOptions);
            
            if (randomIndex === currentIndex) {
                randomIndex = (randomIndex + 1) % totalOptions;
            }
            
            selectObj.selectedIndex = randomIndex;
            
            selectObj.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    const randomChapterButton = document.getElementById("btn_random_chapter");
    if (randomChapterButton) {
        randomChapterButton.addEventListener("click", event => {
            event.preventDefault();
            triggerRandomChapter();
        });
    }

    let copyBtn = document.getElementById("copy_line_to_clipboard");
        
        if (copyBtn) {
            copyBtn.onclick = function(e) {
                e.preventDefault(); 
                
                const pgn = getPgn();
                const chapter = getChapter();
                if (typeof pgn !== 'string' || chapter === null || chapter === undefined) return;
                let pgnGames = pgn.trim().split(/(?<=\*|1-0|0-1|1\/2-1\/2)\s+(?=\[)/);
                let currentChapterPgn = pgnGames[chapter];

                if (currentChapterPgn) {
                    navigator.clipboard.writeText(currentChapterPgn).then(() => {
                        // Guardamos el texto original (probablemente traducido por Elixir)
                        let originalText = copyBtn.innerText;
                        
                        // Cambiamos el texto para dar feedback visual
                        copyBtn.innerText = "PGN copied to clipboard!";
                        
                        // Lo regresamos a la normalidad después de 2.5 segundos
                        setTimeout(() => {
                            copyBtn.innerText = originalText;
                        }, 2500);

                    }).catch(err => {
                        console.error("Clipboard copy failed:", err);
                    });
                } else {
                    console.error("Could not extract current chapter PGN.");
                }
            };
        }

    const selectObj = document.getElementById("chapter_select");
        const prevBtn = document.getElementById("prev_chapter_btn");
        const nextBtn = document.getElementById("next_chapter_btn");
        const titleBtn = document.getElementById("current_chapter_title");
        const customList = document.getElementById("custom_chapter_list");

        function buildCustomList() {
            customList.innerHTML = "";

            // --- Create search field ---
            let searchInput = document.createElement("input");
            searchInput.type = "text";
            searchInput.placeholder = "Search chapter...";
            searchInput.style.width = "100%";
            searchInput.style.padding = "8px 12px";
            searchInput.style.boxSizing = "border-box";
            searchInput.style.border = "none";
            searchInput.style.borderBottom = "1px solid #ccc";
            searchInput.style.outline = "none";
            
            // Keep the search bar visible at all times
            searchInput.style.position = "sticky";
            searchInput.style.top = "0";
            searchInput.style.backgroundColor = "#fff"; 
            searchInput.style.zIndex = "10";
            // Evitar que el clic en el input cierre el menú
            searchInput.onclick = (e) => e.stopPropagation();
            customList.appendChild(searchInput);

            let items = []; // we save the references for filtering

            Array.from(selectObj.options).forEach((opt, index) => {
                let item = document.createElement("div");
                item.innerText = opt.text;
                item.style.padding = "8px 12px";
                item.style.cursor = "pointer";
                item.style.borderBottom = "1px solid #eee";
                item.style.textAlign = "left";
                
                // Highlight the active chapter
                if (index === selectObj.selectedIndex) {
                    item.style.fontWeight = "bold";
                    item.style.backgroundColor = "#e2e8f0";
                }

                // Hover effects
                item.onmouseover = () => item.style.backgroundColor = "#cbd5e1";
                item.onmouseout = () => {
                    item.style.backgroundColor = (index === selectObj.selectedIndex) ? "#e2e8f0" : "transparent";
                };

                // Handle selection
                item.onclick = () => {
                    selectObj.selectedIndex = index;
                    selectObj.dispatchEvent(new Event("change", { bubbles: true }));
                    customList.style.display = "none";
                };
                
                items.push(item);
                customList.appendChild(item);
            });

            // --- Filtering logic ---
            searchInput.addEventListener("input", function(e) {
                let filter = e.target.value.toLowerCase();
                items.forEach(item => {
                    if (item.innerText.toLowerCase().includes(filter)) {
                        item.style.display = "block";
                    } else {
                        item.style.display = "none";
                    }
                });
            });

            // Optional: Auto-focus the search bar when opening the list
            setTimeout(() => searchInput.focus(), 50);
        }
        function updateChapterDisplay() {
            if (selectObj && selectObj.options.length > 0) {
                titleBtn.innerText = selectObj.options[selectObj.selectedIndex].text;
                buildCustomList(); 
            }
        }

        if (selectObj && prevBtn && nextBtn && titleBtn && customList) {
            
            // Watch the select element for dynamic option injection by Listudy
            const observer = new MutationObserver(function() {
                if (selectObj.options.length > 0) {
                    updateChapterDisplay();
                    observer.disconnect(); // Stop watching once loaded
                }
            });
            observer.observe(selectObj, { childList: true });

            // Fallback in case options are already there
            if (selectObj.options.length > 0) {
                updateChapterDisplay();
            }
            
            selectObj.addEventListener("change", updateChapterDisplay);

            // Toggle custom dropdown
            titleBtn.onclick = function(e) {
                e.preventDefault();
                customList.style.display = customList.style.display === "none" ? "block" : "none";
                
                // Scroll to the active chapter in the list when opened
                if (customList.style.display === "block") {
                    const activeItem = customList.children[selectObj.selectedIndex];
                    if (activeItem) {
                        activeItem.scrollIntoView({ block: "nearest" });
                    }
                }
            };

            // Close dropdown if clicking outside
            document.addEventListener("click", function(e) {
                if (!titleBtn.contains(e.target) && !customList.contains(e.target)) {
                    customList.style.display = "none";
                }
            });

            // Previous button logic
            prevBtn.onclick = function(e) {
                e.preventDefault();
                if (selectObj.selectedIndex > 0) {
                    selectObj.selectedIndex--;
                    selectObj.dispatchEvent(new Event("change"));
                }
            };

            // Next button logic
            nextBtn.onclick = function(e) {
                e.preventDefault();
                if (selectObj.selectedIndex < selectObj.options.length - 1) {
                    selectObj.selectedIndex++;
                    selectObj.dispatchEvent(new Event("change"));
                }
            };
        }

    document.addEventListener("keydown", function(event) {
        if (event.key === "ArrowLeft") { 
            event.preventDefault(); 
            goBack(); 
        } else if (event.key === "ArrowRight") { 
            event.preventDefault(); 
            goForward(); 
        }
    });
    }


export function setupPuzzleRun(i18n) {
    const puzzleRunBtn = document.getElementById("puzzle_run");

    if (puzzleRunBtn) {
        // Load state from local storage, default to "off" if not set
        let runMode = localStorage.getItem("puzzleRunMode") || "off";

        // Function to update the button text based on current state
        const updatePuzzleRunText = () => {
            if (runMode === "next") {
                puzzleRunBtn.innerText = i18n.puzzle_run_next;
            } else if (runMode === "random") {
                puzzleRunBtn.innerText = i18n.puzzle_run_random;
            } else {
                puzzleRunBtn.innerText = i18n.puzzle_run_off;
            }
        };

        // Initialize text on page load
        if (typeof i18n !== 'undefined' && i18n.puzzle_run_off) {
            updatePuzzleRunText();
        }

        // Click handler to cycle states: off -> next -> random -> off
        puzzleRunBtn.onclick = function(e) {
            e.preventDefault();
            
            if (runMode === "off") {
                runMode = "next";
            } else if (runMode === "next") {
                runMode = "random";
            } else {
                runMode = "off";
            }
            
            localStorage.setItem("puzzleRunMode", runMode);
            updatePuzzleRunText();
        };
    }
    }
