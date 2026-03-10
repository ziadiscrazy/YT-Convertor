// ConvertTube — Frontend Logic
document.addEventListener('DOMContentLoaded', () => {
    const API = '/api';

    // DOM Elements
    const urlInput = document.getElementById('url-input');
    const fetchBtn = document.getElementById('fetch-btn');
    const fetchText = document.getElementById('fetch-text');
    const errorMsg = document.getElementById('error-msg');
    const videoCard = document.getElementById('video-card');
    const videoThumb = document.getElementById('video-thumb');
    const videoDuration = document.getElementById('video-duration');
    const videoTitle = document.getElementById('video-title');
    const videoAuthor = document.getElementById('video-author');
    const videoViews = document.getElementById('video-views');
    const btnMp3 = document.getElementById('btn-mp3');
    const btnMp4 = document.getElementById('btn-mp4');
    const qualitySelect = document.getElementById('quality-select');
    const downloadBtn = document.getElementById('download-btn');
    const downloadStatus = document.getElementById('download-status');

    let currentVideoData = null;
    let currentFormat = 'mp3';

    // ---- Fetch Video Info ----
    fetchBtn.addEventListener('click', fetchVideoInfo);
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchVideoInfo();
    });

    async function fetchVideoInfo() {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Please paste a YouTube URL');
            return;
        }

        // Reset UI
        hideError();
        videoCard.classList.remove('visible');
        fetchBtn.disabled = true;
        fetchText.innerHTML = '<span class="spinner"></span> Fetching...';

        try {
            const res = await fetch(`${API}/info?url=${encodeURIComponent(url)}`);
            const data = await res.json();

            if (data.error) {
                showError(data.error);
                return;
            }

            currentVideoData = data;
            renderVideoCard(data);
        } catch (err) {
            showError('Could not connect to server. Is it running?');
        } finally {
            fetchBtn.disabled = false;
            fetchText.textContent = 'Convert';
        }
    }

    function renderVideoCard(data) {
        videoThumb.src = data.thumbnail;
        videoDuration.textContent = data.duration;
        videoTitle.textContent = data.title;
        videoAuthor.textContent = `🎤 ${data.author}`;
        videoViews.textContent = `👁️ ${data.viewCount} views`;

        // Default to MP3
        currentFormat = 'mp3';
        btnMp3.classList.add('active');
        btnMp4.classList.remove('active');
        populateQualities();

        videoCard.classList.add('visible');
    }

    // ---- Format Toggle ----
    btnMp3.addEventListener('click', () => {
        currentFormat = 'mp3';
        btnMp3.classList.add('active');
        btnMp4.classList.remove('active');
        populateQualities();
    });

    btnMp4.addEventListener('click', () => {
        currentFormat = 'mp4';
        btnMp4.classList.add('active');
        btnMp3.classList.remove('active');
        populateQualities();
    });

    function populateQualities() {
        qualitySelect.innerHTML = '';

        if (currentFormat === 'mp3') {
            const bitrates = ['320', '192', '128'];
            bitrates.forEach(br => {
                const opt = document.createElement('option');
                opt.value = br;
                opt.textContent = `${br} kbps${br === '320' ? ' (Best)' : br === '128' ? ' (Smallest)' : ''}`;
                qualitySelect.appendChild(opt);
            });
            downloadBtn.textContent = '⬇️ Download MP3';
        } else {
            if (currentVideoData && currentVideoData.videoQualities.length > 0) {
                currentVideoData.videoQualities.forEach(q => {
                    const opt = document.createElement('option');
                    opt.value = q.height;
                    opt.textContent = `${q.qualityLabel}${q.fps ? ` ${q.fps}fps` : ''}`;
                    qualitySelect.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.value = '720';
                opt.textContent = '720p (Default)';
                qualitySelect.appendChild(opt);
            }
            downloadBtn.textContent = '⬇️ Download MP4';
        }
    }

    // ---- Download ----
    downloadBtn.addEventListener('click', () => {
        if (!currentVideoData) return;

        const url = currentVideoData.url;
        let downloadUrl;

        if (currentFormat === 'mp3') {
            const quality = qualitySelect.value;
            downloadUrl = `${API}/download?url=${encodeURIComponent(url)}&format=mp3&quality=${quality}`;
        } else {
            const height = qualitySelect.value;
            downloadUrl = `${API}/download?url=${encodeURIComponent(url)}&format=mp4&height=${height}`;
        }

        // Show downloading status
        downloadStatus.style.display = 'block';
        downloadBtn.disabled = true;
        downloadBtn.textContent = '⏳ Preparing...';

        // Use a hidden link to trigger the download
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Reset after a short delay (the browser handles the actual download)
        setTimeout(() => {
            downloadStatus.style.display = 'none';
            downloadBtn.disabled = false;
            downloadBtn.textContent = currentFormat === 'mp3' ? '⬇️ Download MP3' : '⬇️ Download MP4';
        }, 3000);
    });

    // ---- Helpers ----
    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    }
    function hideError() {
        errorMsg.style.display = 'none';
    }
});
