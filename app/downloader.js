const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { app, BrowserWindow } = require('electron');

// İndirmelerde sertifika hatalarını göz ardı et (IDM gibi her dosyayı indirebilmek için)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

class VoldenaDownloader {
    constructor() {
        this.downloads = new Map();
        this.downloadDir = path.join(app.getPath('downloads'), 'Voldena-DM');
        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        }
        this.loadInterruptedDownloads();
    }

    loadInterruptedDownloads() {
        try {
            const files = fs.readdirSync(this.downloadDir);
            files.forEach(file => {
                if (file.endsWith('.voldenadl')) {
                    try {
                        const statePath = path.join(this.downloadDir, file);
                        const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                        const dlState = {
                            ...data,
                            status: 'paused',
                            window: null,
                            streams: [],
                            lastDownloaded: data.downloaded,
                            lastTime: Date.now(),
                            speed: 0,
                            statePath: statePath
                        };
                        this.downloads.set(data.id, dlState);
                    } catch(e) {}
                }
            });
        } catch(e) {}
    }

    saveState(dlState) {
        if (!dlState.destPath || dlState.status === 'completed' || dlState.status === 'cancelled') return;
        try {
            const statePath = dlState.destPath + '.voldenadl';
            dlState.statePath = statePath;
            const stateData = {
                id: dlState.id,
                url: dlState.url,
                finalUrl: dlState.finalUrl,
                filename: dlState.filename,
                downloaded: dlState.downloaded,
                total: dlState.total,
                connections: dlState.connections,
                destPath: dlState.destPath,
                chunks: dlState.chunks
            };
            fs.writeFileSync(statePath, JSON.stringify(stateData));
        } catch(e) {}
    }

    async startDownload(url, filename, window, initialId = null, connectionLimit = 64) {
        const id = initialId || Date.now().toString();
        
        // Eğer zaten devam eden bir indirmeyse sıfırlama, devam et
        let dlState = this.downloads.get(id);
        
        let isResumeDirect = false;
        if (!dlState) {
            dlState = {
                id, url, filename, window,
                status: 'connecting',
                downloaded: 0,
                total: 0,
                connections: connectionLimit,
                streams: [],
                chunks: [],
                requests: [],
                lastDownloaded: 0,
                lastTime: Date.now(),
                speed: 0,
                startTime: Date.now()
            };
            this.downloads.set(id, dlState);
            
            if (window) {
                window.webContents.send('new-download', { id, url, filename: filename || 'Bağlanıyor...', connections: dlState.connections });
            }
        } else {
            // Resume durumu
            dlState.status = 'connecting';
            dlState.window = window;
            dlState.streams = [];
            dlState.requests = [];
            if (dlState.total > 0 && dlState.chunks.length > 0) {
                isResumeDirect = true;
            }
        }

        try {
            let acceptsRanges = true;
            let destPath = dlState.destPath;
            let finalName = dlState.filename;

            if (!isResumeDirect) {
                const headersInfo = await this.getFileInfo(url);
                dlState.total = headersInfo.size;
                dlState.finalUrl = headersInfo.finalUrl;
                acceptsRanges = headersInfo.acceptsRanges;
                
                let nameFromUrl = headersInfo.finalUrl.split('?')[0].split('/').pop();
                if (!nameFromUrl || nameFromUrl === '') nameFromUrl = `file_${id}.bin`;
                finalName = filename || nameFromUrl;
                destPath = path.join(this.downloadDir, finalName);
                dlState.destPath = destPath;
                dlState.filename = finalName;
            } else {
                // Keep existing metadata, ranges are supported since chunks exist
                acceptsRanges = true;
            }

            // Update UI with real filename
            if (dlState.window) {
                dlState.window.webContents.send('download-filename', { id: dlState.id, filename: finalName, connections: dlState.connections });
            }
            // Mini pencereye de dosya adını gönder
            this.sendToMiniWindow(dlState.url, 'dl-info', { filename: finalName });

            if (dlState.total > 0 && acceptsRanges) {
                if (dlState.chunks.length === 0) {
                    await fs.promises.writeFile(destPath, '');
                    await fs.promises.truncate(destPath, dlState.total);
                    
                    // Create chunk definitions
                    const numChunks = dlState.connections;
                    const chunkSize = Math.ceil(dlState.total / numChunks);
                    for (let i = 0; i < numChunks; i++) {
                        const start = i * chunkSize;
                        const end = i === numChunks - 1 ? dlState.total - 1 : start + chunkSize - 1;
                        if (start > dlState.total) break;
                        dlState.chunks.push({ start, end, current: 0, completed: false });
                    }
                }
                
                dlState.status = 'downloading';
                
                // Start downloading unfinished chunks
                const downloadPromises = [];
                for (let i = 0; i < dlState.chunks.length; i++) {
                    if (!dlState.chunks[i].completed) {
                        downloadPromises.push(this.downloadChunk(dlState, i));
                    }
                }

                await Promise.all(downloadPromises);
                
                if (dlState.status === 'downloading') {
                    dlState.status = 'completed';
                    const durationMs = Date.now() - (dlState.startTime || Date.now());
                    const durationSecs = Math.floor(durationMs / 1000);
                    let durationText = '';
                    if (durationSecs < 60) {
                        durationText = `${durationSecs} sn`;
                    } else {
                        const mins = Math.floor(durationSecs / 60);
                        const secs = durationSecs % 60;
                        durationText = `${mins} dk ${secs} sn`;
                    }
                    
                    if (dlState.window) {
                        dlState.window.webContents.send('download-completed', {
                            id: dlState.id,
                            filename: dlState.filename,
                            total: dlState.total,
                            durationText: durationText,
                            date: new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})
                        });
                    }
                    this.reportProgress(dlState, 100);
                    try { if (fs.existsSync(dlState.statePath)) fs.unlinkSync(dlState.statePath); } catch(e) {}
                }
            } else {
                dlState.status = 'downloading';
                await this.downloadSingleStream(dlState);
            }
        } catch (err) {
            console.error('Download error:', err);
            if(dlState.status !== 'cancelled' && dlState.status !== 'paused') {
                dlState.status = 'error';
                this.reportError(dlState, err.message);
            }
        }
    }

    getFileInfo(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const options = { 
                method: 'HEAD', 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 5000 
            };

            const req = client.request(url, options, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    let nextUrl = res.headers.location;
                    if (!nextUrl.startsWith('http')) {
                        const urlObj = new URL(url);
                        nextUrl = urlObj.origin + (nextUrl.startsWith('/') ? '' : '/') + nextUrl;
                    }
                    this.getFileInfo(nextUrl).then(resolve).catch(reject);
                    return;
                }

                if (res.statusCode >= 400) {
                    this.getFileInfoViaGet(url).then(resolve).catch(reject);
                    return;
                }

                resolve({
                    size: parseInt(res.headers['content-length'] || '0', 10),
                    acceptsRanges: res.headers['accept-ranges'] === 'bytes',
                    finalUrl: url
                });
            });

            req.on('error', (err) => {
                this.getFileInfoViaGet(url).then(resolve).catch(reject);
            });
            req.on('timeout', () => {
                req.destroy();
                this.getFileInfoViaGet(url).then(resolve).catch(reject);
            });
            req.end();
        });
    }

    getFileInfoViaGet(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const options = { 
                method: 'GET', 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 10000 
            };

            const req = client.get(url, options, (res) => {
                req.destroy();
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    let nextUrl = res.headers.location;
                    if (!nextUrl.startsWith('http')) {
                        const urlObj = new URL(url);
                        nextUrl = urlObj.origin + (nextUrl.startsWith('/') ? '' : '/') + nextUrl;
                    }
                    this.getFileInfoViaGet(nextUrl).then(resolve).catch(reject);
                    return;
                }
                resolve({
                    size: parseInt(res.headers['content-length'] || '0', 10),
                    acceptsRanges: res.headers['accept-ranges'] === 'bytes',
                    finalUrl: url
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')); });
        });
    }

    downloadChunk(dlState, chunkIndex) {
        return new Promise((resolve, reject) => {
            const chunk = dlState.chunks[chunkIndex];
            const byteStart = chunk.start + chunk.current;
            const byteEnd = chunk.end;

            if (byteStart > byteEnd) {
                chunk.completed = true;
                return resolve();
            }

            const client = dlState.finalUrl.startsWith('https') ? https : http;
            
            const req = client.get(dlState.finalUrl, { headers: { Range: `bytes=${byteStart}-${byteEnd}` } }, (res) => {
                if (dlState.status !== 'downloading') return resolve();
                
                const fileStream = fs.createWriteStream(dlState.destPath, { flags: 'r+', start: byteStart });
                dlState.streams.push(fileStream);

                res.on('data', (dataChunk) => {
                    if (dlState.status !== 'downloading') {
                        fileStream.end();
                        return resolve();
                    }
                    chunk.current += dataChunk.length;
                    dlState.downloaded += dataChunk.length;
                    fileStream.write(dataChunk);
                    this.reportProgress(dlState);
                });

                res.on('end', () => {
                    fileStream.end();
                    if(chunk.current >= (chunk.end - chunk.start)) {
                        chunk.completed = true;
                    }
                    this.saveState(dlState);
                    resolve();
                });
            });
            dlState.requests.push(req);
            req.on('error', (err) => {
                if (dlState.status !== 'downloading') return resolve();
                reject(err);
            });
        });
    }

    async downloadSingleStream(dlState) {
        return new Promise((resolve, reject) => {
            const client = dlState.finalUrl.startsWith('https') ? https : http;
            const req = client.get(dlState.finalUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    dlState.finalUrl = res.headers.location;
                    return resolve(this.downloadSingleStream(dlState));
                }
                const fileStream = fs.createWriteStream(dlState.destPath);
                dlState.streams.push(fileStream);

                res.on('data', (chunk) => {
                    if (dlState.status !== 'downloading') {
                        fileStream.end();
                        return resolve();
                    }
                    dlState.downloaded += chunk.length;
                    fileStream.write(chunk);
                    this.reportProgress(dlState);
                });

                res.on('end', () => {
                    fileStream.end();
                    if(dlState.status === 'downloading') {
                        dlState.status = 'completed';
                        const durationMs = Date.now() - (dlState.startTime || Date.now());
                        const durationSecs = Math.floor(durationMs / 1000);
                        let durationText = '';
                        if (durationSecs < 60) {
                            durationText = `${durationSecs} sn`;
                        } else {
                            const mins = Math.floor(durationSecs / 60);
                            const secs = durationSecs % 60;
                            durationText = `${mins} dk ${secs} sn`;
                        }

                        if (dlState.window) {
                            dlState.window.webContents.send('download-completed', {
                                id: dlState.id,
                                filename: dlState.filename,
                                total: dlState.total,
                                durationText: durationText,
                                date: new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})
                            });
                        }
                        this.reportProgress(dlState, 100);
                    }
                    resolve();
                });
            });
            dlState.requests.push(req);
            req.on('error', (err) => {
                if (dlState.status !== 'downloading') return resolve();
                reject(err);
            });
        });
    }

    reportProgress(dlState, forcedPercentage = null) {
        const now = Date.now();
        // Calculate speed every 500ms
        if (now - dlState.lastTime >= 500 || forcedPercentage === 100) {
            const bytesSinceLast = dlState.downloaded - dlState.lastDownloaded;
            const timeSinceLast = (now - dlState.lastTime) / 1000;
            const bytesPerSecond = bytesSinceLast / timeSinceLast;
            dlState.speed = (bytesPerSecond / (1024 * 1024)).toFixed(2); // MB/s
            
            dlState.lastDownloaded = dlState.downloaded;
            dlState.lastTime = now;

            if (dlState.window) {
                const percentage = forcedPercentage !== null ? forcedPercentage : 
                                   (dlState.total > 0 ? (dlState.downloaded / dlState.total) * 100 : 0);
                const progressData = {
                    id: dlState.id,
                    downloaded: dlState.downloaded,
                    total: dlState.total,
                    percentage: percentage,
                    speed: dlState.speed
                };
                dlState.window.webContents.send('download-progress', progressData);
                // Mini pencereye de gönder
                this.sendToMiniWindow(dlState.url, 'dl-progress', progressData);
            }
        }
    }

    sendToMiniWindow(url, channel, data) {
        try {
            const allWindows = BrowserWindow.getAllWindows();
            for (const win of allWindows) {
                if (win.webContents.getURL().includes('download_window.html')) {
                    win.webContents.send(channel, data);
                }
            }
        } catch(e) {}
    }

    reportError(dlState, errorMessage) {
        let userErrMsg = errorMessage || 'Bağlantı hatası oluştu, lütfen tekrar deneyin.';
        if (typeof userErrMsg === 'string') {
            const lower = userErrMsg.toLowerCase();
            if (lower.includes('timeout') || lower.includes('etimedout')) {
                userErrMsg = 'Bağlantı zaman aşımına uğradı, lütfen tekrar deneyin.';
            } else if (lower.includes('enoent')) {
                userErrMsg = 'Dosya erişim hatası oluştu veya hedef dizin bulunamadı.';
            } else if (lower.includes('enospc')) {
                userErrMsg = 'Diskte yeterli boş alan bulunmuyor!';
            }
        }
        if (dlState.window) {
            dlState.window.webContents.send('download-error', { id: dlState.id, message: userErrMsg });
        }
    }

    pause(id) {
        if (this.downloads.has(id)) {
            const dl = this.downloads.get(id);
            dl.status = 'paused';
            
            // Abort active HTTP requests
            if (dl.requests) {
                for (const req of dl.requests) {
                    if (req && !req.destroyed) req.destroy();
                }
                dl.requests = [];
            }
            
            for (const stream of dl.streams) {
                if (stream && !stream.destroyed) stream.destroy();
            }
            dl.streams = [];
            this.saveState(dl);
            if (dl.window) {
                dl.window.webContents.send('download-paused', {
                    id: dl.id, downloaded: dl.downloaded, total: dl.total
                });
            }
        }
    }

    resume(id, window) {
        if (this.downloads.has(id)) {
            const dl = this.downloads.get(id);
            if (dl.status === 'paused' || dl.status === 'error') {
                dl.status = 'downloading';
                dl.window = window;
                this.startDownload(dl.url, dl.filename, window, dl.id, dl.connections);
            }
        }
    }

    cancel(id, deleteFile = true) {
        if (this.downloads.has(id)) {
            const dl = this.downloads.get(id);
            dl.status = 'cancelled';
            
            // Abort active HTTP requests
            if (dl.requests) {
                for (const req of dl.requests) {
                    if (req && !req.destroyed) req.destroy();
                }
                dl.requests = [];
            }
            
            for (const stream of dl.streams) {
                if (stream && !stream.destroyed) stream.destroy();
            }
            dl.streams = [];
            
            // Delete files after a short delay to ensure stream handles are fully closed
            const destPath = dl.destPath;
            const statePath = dl.statePath;
            setTimeout(() => {
                if (deleteFile) {
                    try { if (destPath && fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch(e) {}
                }
                try { if (statePath && fs.existsSync(statePath)) fs.unlinkSync(statePath); } catch(e) {}
            }, 100);
            
            if (dl.window) {
                dl.window.webContents.send('download-cancelled', { id: dl.id });
            }
            this.downloads.delete(id);
        }
    }
}

module.exports = new VoldenaDownloader();
