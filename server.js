const express = require('express');
const cors = require('cors');
const path = require('path');
const { execFile, spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 4000;
const YT_DLP = process.platform === 'win32' 
    ? path.join(__dirname, 'yt-dlp.exe') 
    : path.join(__dirname, 'yt-dlp');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =============================================
//  GET /api/info — Fetch video metadata
// =============================================
app.get('/api/info', (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Use yt-dlp to get video info as JSON
    const args = [
        '--dump-json',
        '--no-warnings',
        '--no-playlist',
        url
    ];

    execFile(YT_DLP, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp info error:', stderr || error.message);
            return res.status(500).json({ error: 'Could not fetch video info. Please check the URL.' });
        }

        try {
            const info = JSON.parse(stdout);

            const durationSec = info.duration || 0;
            const mins = Math.floor(durationSec / 60);
            const secs = durationSec % 60;

            // Get MP4 video formats
            const videoFormats = (info.formats || [])
                .filter(f => f.ext === 'mp4' && f.vcodec !== 'none' && f.height)
                .map(f => ({
                    formatId: f.format_id,
                    qualityLabel: `${f.height}p`,
                    height: f.height,
                    hasAudio: f.acodec !== 'none',
                    filesize: f.filesize || f.filesize_approx || 0,
                    fps: f.fps
                }));

            // Deduplicate by height, keep best per quality
            const uniqueQualities = {};
            videoFormats.forEach(f => {
                const key = f.height;
                if (!uniqueQualities[key] || f.filesize > (uniqueQualities[key].filesize || 0)) {
                    uniqueQualities[key] = f;
                }
            });

            const sortedQualities = Object.values(uniqueQualities)
                .sort((a, b) => b.height - a.height);

            res.json({
                title: info.title,
                author: info.uploader || info.channel || 'Unknown',
                thumbnail: info.thumbnail,
                duration: `${mins}:${secs.toString().padStart(2, '0')}`,
                durationSeconds: durationSec,
                viewCount: info.view_count ? parseInt(info.view_count).toLocaleString() : '0',
                videoQualities: sortedQualities,
                url: url
            });
        } catch (parseError) {
            console.error('Parse error:', parseError.message);
            res.status(500).json({ error: 'Failed to parse video information' });
        }
    });
});

// =============================================
//  GET /api/download — Stream download to client
// =============================================
app.get('/api/download', (req, res) => {
    const { url, format, quality, height } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // First, get the title for the filename
    execFile(YT_DLP, ['--get-title', '--no-warnings', url], (err, stdout) => {
        const title = (stdout || 'video').trim().replace(/[^\w\s-]/gi, '').trim() || 'download';

        if (format === 'mp3') {
            // Audio: use yt-dlp to extract audio, pipe through ffmpeg for MP3
            const audioBitrate = quality || '128';

            res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
            res.setHeader('Content-Type', 'audio/mpeg');

            const ytdlp = spawn(YT_DLP, [
                '-f', 'bestaudio',
                '--no-warnings',
                '--no-playlist',
                '-o', '-',
                url
            ]);

            const ffmpegProc = spawn(ffmpegPath, [
                '-i', 'pipe:0',
                '-vn',
                '-ab', `${audioBitrate}k`,
                '-f', 'mp3',
                'pipe:1'
            ]);

            ytdlp.stdout.pipe(ffmpegProc.stdin);
            ffmpegProc.stdout.pipe(res);

            ytdlp.stderr.on('data', (d) => console.log('yt-dlp:', d.toString()));
            ffmpegProc.stderr.on('data', (d) => { /* ffmpeg progress output, ignore */ });

            ytdlp.on('error', (e) => {
                console.error('yt-dlp spawn error:', e.message);
                if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
            });

            ffmpegProc.on('error', (e) => {
                console.error('ffmpeg spawn error:', e.message);
                if (!res.headersSent) res.status(500).json({ error: 'Conversion failed' });
            });

            res.on('close', () => {
                ytdlp.kill();
                ffmpegProc.kill();
            });

        } else {
            // Video: use yt-dlp to download best video+audio merged
            const selectedHeight = height || '720';

            res.setHeader('Content-Disposition', `attachment; filename="${title}.mp4"`);
            res.setHeader('Content-Type', 'video/mp4');

            // Format: best mp4 video at that height + best audio, merged
            const formatStr = `bestvideo[height<=${selectedHeight}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${selectedHeight}][ext=mp4]/best`;

            const ytdlp = spawn(YT_DLP, [
                '-f', formatStr,
                '--merge-output-format', 'mp4',
                '--ffmpeg-location', ffmpegPath,
                '--no-warnings',
                '--no-playlist',
                '-o', '-',
                url
            ]);

            ytdlp.stdout.pipe(res);

            ytdlp.stderr.on('data', (d) => {
                const msg = d.toString();
                if (msg.includes('ERROR')) console.error('yt-dlp error:', msg);
            });

            ytdlp.on('error', (e) => {
                console.error('yt-dlp spawn error:', e.message);
                if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
            });

            res.on('close', () => {
                ytdlp.kill();
            });
        }
    });
});

// =============================================
//  START SERVER
// =============================================
app.listen(PORT, () => {
    console.log(`🎵 ConvertTube running at http://localhost:${PORT}`);
    console.log(`   Using yt-dlp: ${YT_DLP}`);
    console.log(`   Using ffmpeg: ${ffmpegPath}`);
});
