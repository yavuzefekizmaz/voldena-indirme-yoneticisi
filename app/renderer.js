// Window Controls
document.getElementById('minimize-btn').addEventListener('click', () => {
    window.electronAPI.windowControl('minimize');
});

document.getElementById('maximize-btn').addEventListener('click', () => {
    window.electronAPI.windowControl('maximize');
});

document.getElementById('close-btn').addEventListener('click', () => {
    window.electronAPI.windowControl('close');
});

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    if (html.getAttribute('data-theme') === 'dark') {
        html.setAttribute('data-theme', 'light');
    } else {
        html.setAttribute('data-theme', 'dark');
    }
});

// Routing
const navItems = document.querySelectorAll('.nav li');
const pages = document.querySelectorAll('.page');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all
        navItems.forEach(nav => nav.classList.remove('active'));
        pages.forEach(page => page.classList.remove('active'));
        
        // Add active class to clicked
        item.classList.add('active');
        const targetPage = document.getElementById(`page-${item.getAttribute('data-page')}`);
        targetPage.classList.add('active');
        
        // Render history if clicked history page
        if (item.getAttribute('data-page') === 'history') {
            renderHistory();
        }
    });
});

// Modal Logic
const modal = document.getElementById('add-modal');
const manualUrlInput = document.getElementById('manual-url');
const manualSaveDirInput = document.getElementById('manual-save-dir');
const browseSaveDirBtn = document.getElementById('browse-save-dir-btn');

let customSaveDir = null;

document.getElementById('open-modal-btn').addEventListener('click', () => {
    modal.classList.add('active');
    manualUrlInput.focus();
    if (manualSaveDirInput) {
        manualSaveDirInput.value = customSaveDir || 'Varsayılan İndirme Klasörü';
    }
});

if (browseSaveDirBtn) {
    browseSaveDirBtn.addEventListener('click', async () => {
        const selected = await window.electronAPI.selectFolder();
        if (selected) {
            customSaveDir = selected;
            manualSaveDirInput.value = selected;
        }
    });
}

document.getElementById('close-modal-btn').addEventListener('click', () => {
    modal.classList.remove('active');
});

document.getElementById('start-manual-btn').addEventListener('click', () => {
    const url = manualUrlInput.value.trim();
    if (url) {
        const connSelect = document.getElementById('conn-limit');
        const connections = connSelect ? parseInt(connSelect.value) : 64;
        const saveDir = customSaveDir;
        window.electronAPI.startDownload({ url, connections, saveDir });
        manualUrlInput.value = '';
        modal.classList.remove('active');
    }
});

// Download Task Listener
window.electronAPI.onDownloadTask((event, data) => {
    console.log('New download task received:', data);
    addDownloadItem(data);
});

// Filename Update (when real filename is resolved after HEAD request)
window.electronAPI.onDownloadFilename((event, data) => {
    const item = document.getElementById(`dl-${data.id}`);
    if (item) {
        const titleEl = item.querySelector('.item-title');
        if (titleEl) {
            titleEl.innerHTML = `${data.filename} <span style="font-size:11px; opacity:0.5; font-weight:normal;">(${data.connections || 64} Kanal)</span>`;
        }
    }
});

// Progress Updates
window.electronAPI.onDownloadProgress((event, data) => {
    const item = document.getElementById(`dl-${data.id}`);
    if (item) {
        const fill = item.querySelector('.progress-fill');
        const meta = item.querySelector('.meta-stats');
        const pauseBtn = item.querySelector('.pause-btn');
        
        // Update width
        fill.style.width = `${data.percentage}%`;
        
        const downloadedMB = (data.downloaded / (1024 * 1024)).toFixed(2);
        const totalMB = (data.total / (1024 * 1024)).toFixed(2);
        let speedText = data.speed && data.speed !== '0.00' ? ` • ${data.speed} MB/s` : '';
        
        // ETA calculation
        let etaText = '';
        if (data.speed && parseFloat(data.speed) > 0 && data.total > data.downloaded) {
            const remainingBytes = data.total - data.downloaded;
            const speedBytes = parseFloat(data.speed) * 1024 * 1024;
            const etaSeconds = Math.ceil(remainingBytes / speedBytes);
            if (etaSeconds < 60) {
                etaText = ` • ${etaSeconds} sn kaldı`;
            } else if (etaSeconds < 3600) {
                const mins = Math.floor(etaSeconds / 60);
                const secs = etaSeconds % 60;
                etaText = ` • ${mins} dk ${secs} sn kaldı`;
            } else {
                const hrs = Math.floor(etaSeconds / 3600);
                const mins = Math.floor((etaSeconds % 3600) / 60);
                etaText = ` • ${hrs} sa ${mins} dk kaldı`;
            }
        }
        
        meta.style.color = '';

        if (data.percentage >= 100) {
            pauseBtn.innerHTML = '✅';
            item.setAttribute('data-status', 'completed');
            fill.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
            meta.textContent = `${downloadedMB} MB / ${totalMB} MB • 100% ✅ (Tamamlandı)`;
        } else {
            fill.style.background = ''; // reset to default CSS gradient
            meta.textContent = `${downloadedMB} MB / ${totalMB} MB • ${data.percentage.toFixed(1)}%${speedText}${etaText}`;
        }
    }
});

// Pause Status Update
window.electronAPI.onDownloadPaused((event, data) => {
    const item = document.getElementById(`dl-${data.id}`);
    if (item) {
        const pauseBtn = item.querySelector('.pause-btn');
        const meta = item.querySelector('.meta-stats');
        pauseBtn.innerHTML = '▶️';
        item.setAttribute('data-status', 'paused');
        
        const downloadedMB = (data.downloaded / (1024 * 1024)).toFixed(2);
        const totalMB = (data.total / (1024 * 1024)).toFixed(2);
        const pct = data.total > 0 ? ((data.downloaded / data.total) * 100).toFixed(1) : '0.0';
        meta.textContent = `${downloadedMB} MB / ${totalMB} MB • ${pct}% (Duraklatıldı)`;
    }
});

function checkWelcomeMessage() {
    const items = document.querySelectorAll('.download-item');
    const welcome = document.getElementById('welcome-message');
    if (welcome) {
        welcome.style.display = items.length === 0 ? 'flex' : 'none';
    }
}

// Cancel/Remove Update
window.electronAPI.onDownloadCancelled((event, data) => {
    const item = document.getElementById(`dl-${data.id}`);
    if (item) {
        item.remove();
        checkWelcomeMessage();
    }
});

// Missing File Alert
window.electronAPI.onFileMissing((event, data) => {
    alert(`⚠️ Dosya Bulunamadı!\n\n"${data.filename || 'Dosya'}" bilgisayarınızdan silinmiş veya yeri değiştirilmiş olabilir.`);
});

// Error Updates
window.electronAPI.onDownloadError((event, data) => {
    const item = document.getElementById(`dl-${data.id}`);
    if (item) {
        const meta = item.querySelector('.meta-stats');
        meta.textContent = `Hata: ${data.message}`;
        meta.style.color = '#ef4444';
        item.querySelector('.progress-fill').style.background = '#ef4444';
    }
});

function addDownloadItem(data) {
    // Switch to downloads page
    navItems[0].click();

    // Aynı ID ile zaten varsa ekleme
    if (document.getElementById(`dl-${data.id}`)) return;

    // Hoşgeldiniz mesajını gizle
    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.style.display = 'none';

    const list = document.getElementById('downloads-list');
    
    const div = document.createElement('div');
    div.className = 'download-item glass-panel';
    div.id = `dl-${data.id}`;
    div.setAttribute('data-status', 'downloading');
    
    div.innerHTML = `
        <div class="item-icon">📄</div>
        <div class="item-details">
            <div class="item-title">${data.filename || 'Dosya'} <span style="font-size:11px; opacity:0.5; font-weight:normal;">(${data.connections || 64} Kanal)</span></div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="item-meta">
                <span class="meta-stats">Bağlanıyor...</span>
            </div>
        </div>
        <div class="item-actions">
            <button class="action-btn folder-btn" title="Dosyanın Bulunduğu Klasörü Aç">📁</button>
            <button class="action-btn pause-btn" title="Duraklat / Başlat">⏸️</button>
            <button class="action-btn cancel-btn" title="İndirmeyi Kaldır / Sil">✖️</button>
        </div>
    `;

    const folderBtn = div.querySelector('.folder-btn');
    const pauseBtn = div.querySelector('.pause-btn');
    const cancelBtn = div.querySelector('.cancel-btn');

    folderBtn.addEventListener('click', () => {
        window.electronAPI.openFolder(data.id);
    });

    pauseBtn.addEventListener('click', () => {
        const currentStatus = div.getAttribute('data-status');
        if (currentStatus === 'completed') {
            window.electronAPI.openFile(data.id);
        } else if (currentStatus === 'paused') {
            window.electronAPI.resumeDownload(data.id);
            pauseBtn.innerHTML = '⏸️';
            pauseBtn.title = "Duraklat";
            div.setAttribute('data-status', 'downloading');
        } else if (currentStatus === 'downloading') {
            window.electronAPI.pauseDownload(data.id);
            pauseBtn.innerHTML = '▶️';
            pauseBtn.title = "Devam Et";
            div.setAttribute('data-status', 'paused');
        }
    });

    cancelBtn.addEventListener('click', () => {
        const currentStatus = div.getAttribute('data-status');
        const titleEl = div.querySelector('.item-title');
        const realFilename = titleEl ? titleEl.childNodes[0].textContent.trim() : (data.filename || 'Dosya');
        
        const modal = document.getElementById('confirm-modal');
        const title = document.getElementById('confirm-title');
        const desc = document.getElementById('confirm-desc');
        const chkContainer = document.getElementById('confirm-checkbox-container');
        const chk = document.getElementById('confirm-delete-file-chk');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtnModal = document.getElementById('confirm-cancel-btn');
        
        // Reset checkbox
        chk.checked = false;
        
        if (currentStatus === 'completed') {
            title.textContent = 'İndirilen Görevi Kaldır';
            desc.textContent = `"${realFilename}" indirmeler listesinden kaldırılacak.`;
            chkContainer.style.display = 'none'; // Direct choices in text & buttons
            okBtn.textContent = 'Evet, Dosyayı da Sil';
            cancelBtnModal.textContent = 'Hayır, Sadece Listeden Kaldır';
        } else {
            title.textContent = 'İndirmeyi İptal Et';
            desc.textContent = `"${realFilename}" indirmesi iptal edilerek listeden kaldırılacak.`;
            chkContainer.style.display = 'flex'; // Show distinct checkbox
            okBtn.textContent = 'İndirmeyi Kaldır';
            cancelBtnModal.textContent = 'Vazgeç';
        }
        
        modal.classList.add('active');
        
        // Clone buttons to clear previous listeners
        const newOk = okBtn.cloneNode(true);
        const newCancel = cancelBtnModal.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        cancelBtnModal.parentNode.replaceChild(newCancel, cancelBtnModal);
        
        newCancel.addEventListener('click', () => {
            modal.classList.remove('active');
            if (currentStatus === 'completed') {
                // Remove from UI list but DO NOT delete actual file
                window.electronAPI.cancelDownload({ id: data.id, deleteFile: false });
                div.remove();
                checkWelcomeMessage();
            }
        });
        
        newOk.addEventListener('click', () => {
            modal.classList.remove('active');
            if (currentStatus === 'completed') {
                // Delete task and actual file
                window.electronAPI.cancelDownload({ id: data.id, deleteFile: true });
                div.remove();
                checkWelcomeMessage();
            } else {
                // Cancel active task and delete file if checkbox checked
                const deleteFile = chk.checked;
                window.electronAPI.cancelDownload({ id: data.id, deleteFile: deleteFile });
                div.remove();
                checkWelcomeMessage();
            }
        });
    });
    
    list.insertBefore(div, list.firstChild);
}

// History Page Management
function renderHistory() {
    const list = document.getElementById('history-list');
    const emptyMsg = document.getElementById('history-empty-message');
    
    let history = JSON.parse(localStorage.getItem('voldena-history') || '[]');
    
    if (history.length === 0) {
        list.innerHTML = '';
        emptyMsg.style.display = 'flex';
        return;
    }
    
    emptyMsg.style.display = 'none';
    list.innerHTML = history.map(item => {
        const sizeGB = (item.total / (1024 * 1024 * 1024));
        const sizeFormatted = sizeGB >= 1 ? `${sizeGB.toFixed(2)} GB` : `${(item.total / (1024 * 1024)).toFixed(2)} MB`;
        
        return `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-filename">${item.filename}</span>
                    <div class="history-meta">
                        <span>Boyut: ${sizeFormatted}</span>
                        <span>Süre: ${item.durationText}</span>
                        <span>Tarih: ${item.date}</span>
                    </div>
                </div>
                <div class="history-actions">
                    <button class="btn-secondary" onclick="window.electronAPI.openFile('${item.id}')">Dosyayı Aç</button>
                    <button class="btn-delete" onclick="deleteHistoryItem('${item.id}')">✖️</button>
                </div>
            </div>
        `;
    }).join('');
}

window.deleteHistoryItem = (id) => {
    let history = JSON.parse(localStorage.getItem('voldena-history') || '[]');
    history = history.filter(item => item.id !== id);
    localStorage.setItem('voldena-history', JSON.stringify(history));
    renderHistory();
};

document.getElementById('clear-history-btn').addEventListener('click', () => {
    localStorage.setItem('voldena-history', '[]');
    renderHistory();
});

// Global Completion Alert State
let activeCompleteId = null;
function showCompletionAlert(id, filename) {
    activeCompleteId = id;
    const alertFilename = document.getElementById('complete-alert-filename');
    if (alertFilename) alertFilename.textContent = filename || 'Dosya';
    showOverlay('completion-alert-modal');
}

// Listen to download completed event
window.electronAPI.onDownloadCompleted((event, data) => {
    let history = JSON.parse(localStorage.getItem('voldena-history') || '[]');
    // Prevent duplicate entries
    if (!history.some(item => item.id === data.id)) {
        history.unshift(data);
        localStorage.setItem('voldena-history', JSON.stringify(history));
    }
    
    // Update active download list item if it exists
    const item = document.getElementById(`dl-${data.id}`);
    if (item) {
        const pauseBtn = item.querySelector('.pause-btn');
        const meta = item.querySelector('.meta-stats');
        const fill = item.querySelector('.progress-fill');
        
        const sizeGB = (data.total / (1024 * 1024 * 1024));
        const sizeFormatted = sizeGB >= 1 ? `${sizeGB.toFixed(2)} GB` : `${(data.total / (1024 * 1024)).toFixed(2)} MB`;
        
        meta.textContent = `${sizeFormatted} / ${sizeFormatted} • 100% ✅ (Tamamlandı - ${data.durationText})`;
        if (pauseBtn) {
            pauseBtn.innerHTML = '✅';
        }
        item.setAttribute('data-status', 'completed');
        if (fill) {
            fill.style.width = '100%';
            fill.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
        }
    }

    // Ayrı pencere modu kapalıysa ek uyarı modalını aç
    const useSeparateWin = localStorage.getItem('voldena-dlwindow') === 'yes';
    if (!useSeparateWin) {
        showCompletionAlert(data.id, data.filename);
    }
});

// ============ Overlay Helpers ============
function showOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('ob-overlay-hidden');
    el.classList.add('ob-overlay-visible');
}
function hideOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('ob-overlay-visible');
    el.classList.add('ob-overlay-hidden');
}

// Extension helper function
let pendingExtensionBrowser = null;
window.installAndShowHelp = (browser) => {
    pendingExtensionBrowser = browser;
    showOverlay('ext-help-modal');
};

// Load paused downloads on startup
document.addEventListener('DOMContentLoaded', () => {
    // Completion Alert Modal Button Bindings
    const alertOpenBtn = document.getElementById('alert-open-btn');
    if (alertOpenBtn) {
        alertOpenBtn.addEventListener('click', () => {
            if (activeCompleteId) window.electronAPI.openFile(activeCompleteId);
            hideOverlay('completion-alert-modal');
        });
    }
    const alertFolderBtn = document.getElementById('alert-folder-btn');
    if (alertFolderBtn) {
        alertFolderBtn.addEventListener('click', () => {
            if (activeCompleteId) window.electronAPI.openFolder(activeCompleteId);
            hideOverlay('completion-alert-modal');
        });
    }
    const alertDeleteBtn = document.getElementById('alert-delete-btn');
    if (alertDeleteBtn) {
        alertDeleteBtn.addEventListener('click', () => {
            if (activeCompleteId) {
                window.electronAPI.cancelDownload({ id: activeCompleteId, deleteFile: true });
                const item = document.getElementById(`dl-${activeCompleteId}`);
                if (item) {
                    item.remove();
                    checkWelcomeMessage();
                }
            }
            hideOverlay('completion-alert-modal');
        });
    }
    const alertIgnoreBtn = document.getElementById('alert-ignore-btn');
    if (alertIgnoreBtn) {
        alertIgnoreBtn.addEventListener('click', () => {
            hideOverlay('completion-alert-modal');
        });
    }

    // Extension confirm button
    const extConfirmBtn = document.getElementById('ext-confirm-btn');
    if (extConfirmBtn) {
        extConfirmBtn.addEventListener('click', () => {
            if (pendingExtensionBrowser) {
                window.electronAPI.installExtension(pendingExtensionBrowser);
            }
            hideOverlay('ext-help-modal');
        });
    }
    // Settings Logic - conn-limit
    const connLimitSelect = document.getElementById('conn-limit');
    if (connLimitSelect) {
        const savedLimit = localStorage.getItem('voldena-connections');
        if (savedLimit) {
            connLimitSelect.value = savedLimit;
            // Ana proses'e de bildir
            window.electronAPI.setConnections(savedLimit);
        }
        connLimitSelect.addEventListener('change', (e) => {
            localStorage.setItem('voldena-connections', e.target.value);
            window.electronAPI.setConnections(e.target.value);
            console.log('Kanal sayısı değiştirildi:', e.target.value);
        });
    }

    // Ayrı pencere ayarını senkronize et ve checkbox bağla
    const dlwindowCheckbox = document.getElementById('setting-dlwindow');
    if (dlwindowCheckbox) {
        const savedDlWindow = localStorage.getItem('voldena-dlwindow') === 'yes';
        dlwindowCheckbox.checked = savedDlWindow;
        window.electronAPI.setDlwindow(savedDlWindow ? 'yes' : 'no');
        
        dlwindowCheckbox.addEventListener('change', (e) => {
            const val = e.target.checked ? 'yes' : 'no';
            localStorage.setItem('voldena-dlwindow', val);
            window.electronAPI.setDlwindow(val);
        });
    } else {
        const savedDlWindow = localStorage.getItem('voldena-dlwindow');
        if (savedDlWindow) {
            window.electronAPI.setDlwindow(savedDlWindow);
        }
    }

    // Windows başlangıç ayarını senkronize et ve checkbox bağla
    const autostartCheckbox = document.getElementById('setting-autostart');
    if (autostartCheckbox) {
        const savedAutostart = localStorage.getItem('voldena-autostart') === 'yes';
        autostartCheckbox.checked = savedAutostart;
        window.electronAPI.setAutoStart(savedAutostart ? 'yes' : 'no');
        
        autostartCheckbox.addEventListener('change', (e) => {
            const val = e.target.checked ? 'yes' : 'no';
            localStorage.setItem('voldena-autostart', val);
            window.electronAPI.setAutoStart(val);
        });
    } else {
        const savedAutostart = localStorage.getItem('voldena-autostart');
        if (savedAutostart) {
            window.electronAPI.setAutoStart(savedAutostart);
        }
    }

    // Load interrupted downloads
    if (window.electronAPI && window.electronAPI.getAllDownloads) {
        window.electronAPI.getAllDownloads().then(downloads => {
            downloads.forEach(dl => {
                addDownloadItem(dl);
                const item = document.getElementById(`dl-${dl.id}`);
                if (item) {
                    const fill = item.querySelector('.progress-fill');
                    const meta = item.querySelector('.meta-stats');
                    const pauseBtn = item.querySelector('.pause-btn');
                    fill.style.width = `${dl.percentage}%`;
                    const downloadedMB = (dl.downloaded / (1024 * 1024)).toFixed(2);
                    const totalMB = (dl.total / (1024 * 1024)).toFixed(2);
                    
                    if (dl.status === 'paused') {
                        meta.textContent = `${downloadedMB} MB / ${totalMB} MB • ${dl.percentage.toFixed(1)}% (Duraklatıldı)`;
                        pauseBtn.innerHTML = '▶️';
                        item.setAttribute('data-status', 'paused');
                    } else if (dl.status === 'completed') {
                        meta.textContent = `${downloadedMB} MB / ${totalMB} MB • 100% ✅`;
                        pauseBtn.innerHTML = '✅';
                        item.setAttribute('data-status', 'completed');
                        fill.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
                    } else {
                        meta.textContent = `${downloadedMB} MB / ${totalMB} MB • ${dl.percentage.toFixed(1)}%`;
                        item.setAttribute('data-status', 'downloading');
                    }
                }
            });
        });
    }
});

// ============ Onboarding Wizard ============
let obCurrentStep = 0;
const obTotalSteps = 7;

function showOnboarding() {
    obCurrentStep = 0;
    showOverlay('onboarding-overlay');
    // Save onboarding completion immediately on first display so it never auto-opens again
    localStorage.setItem('voldena-onboarding-done', 'true');
    updateObStep();
}

function updateObStep() {
    const steps = document.querySelectorAll('.ob-step');
    const dots = document.querySelectorAll('.ob-dot');
    
    steps.forEach((step, i) => {
        if (i === obCurrentStep) {
            step.classList.remove('exiting');
            step.classList.add('active');
        } else {
            step.classList.remove('active');
            step.classList.remove('exiting');
        }
    });
    
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === obCurrentStep);
    });
}

window.obNext = () => {
    const steps = document.querySelectorAll('.ob-step');
    if (obCurrentStep < steps.length - 1) {
        obCurrentStep++;
        updateObStep();
    } else {
        obFinish();
    }
};

window.obSkip = () => {
    showOverlay('skip-confirm');
};

window.obFinish = () => {
    // Save settings
    const autostart = document.querySelector('input[name="autostart"]:checked');
    const dlwindow = document.querySelector('input[name="dlwindow"]:checked');
    
    const autostartVal = autostart ? autostart.value : 'no';
    const dlwindowVal = dlwindow ? dlwindow.value : 'no';
    
    localStorage.setItem('voldena-autostart', autostartVal);
    localStorage.setItem('voldena-dlwindow', dlwindowVal);
    
    // Update settings checkboxes dynamically
    const aCheck = document.getElementById('setting-autostart');
    if (aCheck) aCheck.checked = (autostartVal === 'yes');
    const dCheck = document.getElementById('setting-dlwindow');
    if (dCheck) dCheck.checked = (dlwindowVal === 'yes');
    
    // Send to main process immediately
    window.electronAPI.setAutoStart(autostartVal);
    window.electronAPI.setDlwindow(dlwindowVal);
    
    localStorage.setItem('voldena-onboarding-done', 'true');
    
    // Close overlays
    hideOverlay('onboarding-overlay');
    hideOverlay('skip-confirm');
};

// Check if first run
if (!localStorage.getItem('voldena-onboarding-done')) {
    setTimeout(() => showOnboarding(), 500);
}

// Show Tour button in settings
const showTourBtn = document.getElementById('show-tour-btn');
if (showTourBtn) {
    showTourBtn.addEventListener('click', () => {
        showOnboarding();
    });
}

// Risk info tooltip
const riskInfoBtn = document.getElementById('risk-info-btn');
if (riskInfoBtn) {
    riskInfoBtn.addEventListener('click', () => {
        const tooltip = document.getElementById('risk-tooltip');
        tooltip.style.display = tooltip.style.display === 'none' ? 'block' : 'none';
    });
}
