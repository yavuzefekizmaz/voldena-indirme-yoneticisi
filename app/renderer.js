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
    });
});

// Modal Logic
const modal = document.getElementById('add-modal');
const manualUrlInput = document.getElementById('manual-url');

document.getElementById('open-modal-btn').addEventListener('click', () => {
    modal.classList.add('active');
    manualUrlInput.focus();
});

document.getElementById('close-modal-btn').addEventListener('click', () => {
    modal.classList.remove('active');
});

document.getElementById('start-manual-btn').addEventListener('click', () => {
    const url = manualUrlInput.value.trim();
    if (url) {
        const connSelect = document.getElementById('conn-limit');
        const connections = connSelect ? parseInt(connSelect.value) : 64;
        window.electronAPI.startDownload({ url, connections });
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
        fill.style.width = `${data.percentage}%`;
        
        const downloadedMB = (data.downloaded / (1024 * 1024)).toFixed(2);
        const totalMB = (data.total / (1024 * 1024)).toFixed(2);
        let speedText = data.speed && data.speed !== '0.00' ? ` • ${data.speed} MB/s` : '';
        
        // ETA hesaplama
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
        
        meta.textContent = `${downloadedMB} MB / ${totalMB} MB • ${data.percentage.toFixed(1)}%${speedText}${etaText}`;
        meta.style.color = '';

        if (data.percentage >= 100) {
            pauseBtn.innerHTML = '✅';
            pauseBtn.onclick = () => {
                window.electronAPI.openFile(data.id);
            };
            fill.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
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
        pauseBtn.onclick = () => {
            window.electronAPI.resumeDownload(data.id);
            pauseBtn.innerHTML = '⏸️';
            pauseBtn.onclick = () => window.electronAPI.pauseDownload(data.id);
        };
        const downloadedMB = (data.downloaded / (1024 * 1024)).toFixed(2);
        const totalMB = (data.total / (1024 * 1024)).toFixed(2);
        const pct = data.total > 0 ? ((data.downloaded / data.total) * 100).toFixed(1) : '0.0';
        meta.textContent = `${downloadedMB} MB / ${totalMB} MB • ${pct}% (Duraklatıldı)`;
    }
});

// Cancel/Remove Update
window.electronAPI.onDownloadCancelled((event, data) => {
    const item = document.getElementById(`dl-${data.id}`);
    if (item) {
        item.remove();
    }
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
            <button class="action-btn pause-btn">⏸️</button>
            <button class="action-btn cancel-btn">✖️</button>
        </div>
    `;

    // Butonlara event listener ekle (inline onclick yerine)
    const pauseBtn = div.querySelector('.pause-btn');
    const cancelBtn = div.querySelector('.cancel-btn');

    pauseBtn.addEventListener('click', () => {
        window.electronAPI.pauseDownload(data.id);
    });

    cancelBtn.addEventListener('click', () => {
        window.electronAPI.cancelDownload(data.id);
    });
    
    list.insertBefore(div, list.firstChild);
}

// Load paused downloads on startup
document.addEventListener('DOMContentLoaded', () => {
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

    // Ayrı pencere ayarını senkronize et
    const savedDlWindow = localStorage.getItem('voldena-dlwindow');
    if (savedDlWindow) {
        window.electronAPI.setDlwindow(savedDlWindow);
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
                        pauseBtn.onclick = () => {
                            window.electronAPI.resumeDownload(dl.id);
                            pauseBtn.innerHTML = '⏸️';
                            pauseBtn.onclick = () => window.electronAPI.pauseDownload(dl.id);
                        };
                    } else if (dl.status === 'completed') {
                        meta.textContent = `${downloadedMB} MB / ${totalMB} MB • 100% ✅`;
                        pauseBtn.innerHTML = '✅';
                        fill.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
                    } else {
                        meta.textContent = `${downloadedMB} MB / ${totalMB} MB • ${dl.percentage.toFixed(1)}%`;
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
    const overlay = document.getElementById('onboarding-overlay');
    overlay.style.display = 'block';
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

function obNext() {
    const currentStep = document.querySelector(`.ob-step[data-step="${obCurrentStep}"]`);
    currentStep.classList.add('exiting');
    currentStep.classList.remove('active');
    
    setTimeout(() => {
        obCurrentStep++;
        if (obCurrentStep >= obTotalSteps) {
            obFinish();
        } else {
            updateObStep();
        }
    }, 200);
}

function obSkip() {
    const confirm = document.getElementById('skip-confirm');
    confirm.style.display = 'flex';
}

function obFinish() {
    // Save settings
    const autostart = document.querySelector('input[name="autostart"]:checked');
    const dlwindow = document.querySelector('input[name="dlwindow"]:checked');
    
    if (autostart) localStorage.setItem('voldena-autostart', autostart.value);
    if (dlwindow) localStorage.setItem('voldena-dlwindow', dlwindow.value);
    
    localStorage.setItem('voldena-onboarding-done', 'true');
    
    // Close overlays
    document.getElementById('onboarding-overlay').style.display = 'none';
    document.getElementById('skip-confirm').style.display = 'none';
}

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
