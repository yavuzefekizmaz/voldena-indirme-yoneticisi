const NATIVE_HOST_NAME = "com.voldena.dm";

// Eklenti yüklendiğinde sağ tık menüsü oluştur
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "download_with_voldena_dm",
    title: "Voldena-DM ile İndir",
    contexts: ["link", "image", "video", "audio"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "download_with_voldena_dm") {
    const url = info.linkUrl || info.srcUrl;
    if (url) {
      sendToDesktop(url, null, tab ? tab.url : null, null);
    }
  }
});

// ====== TAM İNDİRME YAKALAMA ======
// chrome.downloads.onDeterminingFilename ile indirmeyi yakala
// Bu, onCreated'dan DAHA güvenilirdir

chrome.downloads.onCreated.addListener((downloadItem) => {
  const url = downloadItem.url;
  
  // Tarayıcı iç sayfalarını ve blob URL'leri yakalama
  if (!url || 
      url.startsWith('blob:') || 
      url.startsWith('data:') || 
      url.startsWith('chrome') || 
      url.startsWith('opera') || 
      url.startsWith('edge') ||
      url.startsWith('about:')) {
    return;
  }

  // İndirmeyi HEMEN iptal et
  chrome.downloads.cancel(downloadItem.id, () => {
    // Tarayıcının indirme listesinden de sil
    chrome.downloads.erase({ id: downloadItem.id }, () => {
      console.log("İndirme yakalandı ve iptal edildi:", url);
    });
  });
  
  // Voldena-DM'e gönder
  sendToDesktop(url, downloadItem.filename, downloadItem.referrer, downloadItem.totalBytes);
});

function sendToDesktop(url, filename, referrer, fileSize) {
  fetch('http://127.0.0.1:41234/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: url,
      filename: filename,
      referrer: referrer,
      fileSize: fileSize
    })
  })
  .then(response => response.text())
  .then(data => console.log("Voldena-DM'e gönderildi:", data))
  .catch(err => {
    console.error("Voldena-DM çalışmıyor:", err);
    // Uygulama çalışmıyorsa tarayıcı kendi indirsin
    chrome.downloads.download({ url: url });
  });
}
