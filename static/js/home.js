// Global variables
let extractedText = '';
let translatedText = '';
let currentAudioFilename = '';
let currentLanguage = '';
let currentVoice = '';
let audioPlayer;
let isMuted = false;
let wordTimings = [];  // Word timing data for highlighting
let currentWordIndex = -1;
let viewMode = 'original';

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupUploadArea();
    audioPlayer = document.getElementById('audioPlayer');
    setupAudioPlayer();
    setInitialVolume();
});

// ============ FILE UPLOAD SECTION ============

// Setup drag-and-drop upload area
function setupUploadArea() {
    const uploadArea = document.getElementById('uploadArea');
    const pdfFile = document.getElementById('pdfFile');

    // Click to upload
    uploadArea.addEventListener('click', () => {
        pdfFile.click();
    });

    // File selection
    pdfFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
}

// Handle file selection
function handleFileSelect(file) {
    if (!file) return;

    if (file.type !== 'application/pdf') {
        showError('Please select a valid PDF file');
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        showError('File size exceeds 50MB limit');
        return;
    }

    uploadPDF(file);
}

// Upload PDF to server
function uploadPDF(file) {
    const formData = new FormData();
    formData.append('pdf_file', file);
    formData.append('input_language', document.getElementById('inputLanguage').value);

    showLoading(true, 'Uploading and extracting text...');

    fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            extractedText = data.extracted_text;
            currentLanguage = data.input_language;
            
            // Show text preview
            document.getElementById('textPreviewSection').style.display = 'block';
            document.getElementById('conversionSection').style.display = 'block';
            
            // Show preview (first 300 characters)
            const preview = extractedText.substring(0, 300) + 
                          (extractedText.length > 300 ? '...' : '');
            document.getElementById('textPreview').textContent = preview;
            
            // Update target language options
            updateTargetLanguages();
            
            showLoading(false);
            showSuccess('PDF uploaded successfully! Text extracted.');
            
            // Scroll to conversion section
            document.getElementById('conversionSection').scrollIntoView({ behavior: 'smooth' });
        } else {
            showLoading(false);
            showError(data.error || 'Failed to process PDF');
        }
    })
    .catch(error => {
        showLoading(false);
        showError('Error uploading file: ' + error.message);
    });
}

// Update target language options based on input language
function updateTargetLanguages() {
    const inputLanguage = document.getElementById('inputLanguage').value;
    const languageMap = {
        'Tamil': ['English', 'Hindi', 'Malayalam'],
        'English': ['Tamil', 'Hindi', 'Malayalam'],
        'Malayalam': ['Tamil', 'English', 'Hindi'],
        'Hindi': ['Tamil', 'English', 'Malayalam']
    };

    const targetLanguages = languageMap[inputLanguage] || ['English'];
    const targetSelect = document.getElementById('targetLanguage');
    
    const currentValue = targetSelect.value;
    targetSelect.innerHTML = '';
    
    targetLanguages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        targetSelect.appendChild(option);
    });

    if (targetLanguages.includes(currentValue)) {
        targetSelect.value = currentValue;
    }
}

// Listen for input language change
document.addEventListener('DOMContentLoaded', function() {
    const inputLanguageSelect = document.getElementById('inputLanguage');
    if (inputLanguageSelect) {
        inputLanguageSelect.addEventListener('change', updateTargetLanguages);
    }
});

// ============ TRANSLATION SECTION ============

// Translate and show preview
function translateAndShowPreview() {
    if (!extractedText) {
        showError('Please upload a PDF first');
        return;
    }

    const targetLanguage = document.getElementById('targetLanguage').value;
    
    if (!targetLanguage) {
        showError('Please select a target language');
        return;
    }

    showLoading(true, 'Translating text...');

    fetch('/api/translate-text', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: extractedText,
            target_language: targetLanguage
        })
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        
        if (data.success) {
            translatedText = data.translated_text;
            currentLanguage = targetLanguage;
            
            // Show translation preview section
            document.getElementById('translationPreviewSection').style.display = 'block';
            
            // Display both texts
            document.getElementById('originalText').textContent = extractedText;
            document.getElementById('translatedText').textContent = translatedText;
            
            showSuccess('Translation completed!');
            
            // Scroll to translation section
            document.getElementById('translationPreviewSection').scrollIntoView({ behavior: 'smooth' });
        } else {
            showError(data.error || 'Failed to translate text');
        }
    })
    .catch(error => {
        showLoading(false);
        showError('Error translating text: ' + error.message);
    });
}

// ============ AUDIO GENERATION SECTION ============

// Generate audio from translated text with word timing
function generateAudio() {
    if (!translatedText) {
        showError('Please translate text first');
        return;
    }

    const voiceGender = document.getElementById('voiceGender').value;

    showLoading(true, 'Generating audio... This may take a minute...');

    fetch('/api/convert-text', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: extractedText,
            target_language: currentLanguage,
            voice_gender: voiceGender
        })
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        
        if (data.success) {
            currentAudioFilename = data.audio_filename;
            currentVoice = data.voice;
            wordTimings = data.word_timings || [];  // Get word timing data
            
            // Show audio section
            document.getElementById('audioSection').style.display = 'block';
            document.getElementById('audioLanguage').textContent = data.language;
            document.getElementById('audioVoice').textContent = data.voice;
            
            // Display duration if available
            const durationElem = document.getElementById('audioDuration');
            if (durationElem && data.duration) {
                durationElem.textContent = formatTime(data.duration);
            }
            
            // Set audio source and load
            const audioSource = document.getElementById('audioSource');
            audioSource.src = data.audio_url;
            audioPlayer.load();
            
            // Setup word highlighting if timing data available
            if (wordTimings.length > 0) {
                setupHighlightedText();
                const highlightContainer = document.getElementById('highlightedTextContainer');
                const currentWordDisplay = document.getElementById('currentWordDisplay');
                if (highlightContainer) highlightContainer.style.display = 'block';
                if (currentWordDisplay) currentWordDisplay.style.display = 'block';
            }
            
            showSuccess('Audio generated successfully!');
            
            // Scroll to audio section
            document.getElementById('audioSection').scrollIntoView({ behavior: 'smooth' });
        } else {
            showError(data.error || 'Failed to generate audio');
        }
    })
    .catch(error => {
        showLoading(false);
        showError('Error generating audio: ' + error.message);
    });
}

// ============ AUDIO PLAYER SECTION ============

function setupAudioPlayer() {
    if (!audioPlayer) return;

    // Progress bar drag
    const progressBarContainer = document.getElementById('progressBar');
    if (progressBarContainer) {
        progressBarContainer.addEventListener('click', function(e) {
            const rect = progressBarContainer.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            audioPlayer.currentTime = percent * audioPlayer.duration;
        });
    }

    // Update progress bar and time
    audioPlayer.addEventListener('timeupdate', updateProgressBar);
    audioPlayer.addEventListener('loadedmetadata', updateTimeDisplay);
    audioPlayer.addEventListener('play', () => updatePlayButtonState());
    audioPlayer.addEventListener('pause', () => updatePlayButtonState());
    audioPlayer.addEventListener('ended', () => {
        document.getElementById('playBtn').textContent = '▶️';
        showSuccess('Audio playback completed!');
    });

    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', function() {
            audioPlayer.volume = this.value / 100;
        });
    }
}

function updateProgressBar() {
    if (isNaN(audioPlayer.duration)) return;
    
    const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    document.getElementById('progressFill').style.width = percent + '%';
    updateTimeDisplay();
}

function updateTimeDisplay() {
    const current = formatTime(audioPlayer.currentTime);
    const duration = formatTime(audioPlayer.duration);
    document.getElementById('timeDisplay').textContent = `${current} / ${duration}`;
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function updatePlayButtonState() {
    const playBtn = document.getElementById('playBtn');
    playBtn.textContent = audioPlayer.paused ? '▶️' : '⏸️';
}

function togglePlayPause() {
    if (!currentAudioFilename) {
        showError('No audio file loaded');
        return;
    }
    
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

function toggleMute() {
    isMuted = !isMuted;
    const volumeSlider = document.getElementById('volumeSlider');
    
    if (isMuted) {
        audioPlayer.volume = 0;
        document.querySelector('.volume-control button').textContent = '🔇';
    } else {
        audioPlayer.volume = volumeSlider.value / 100;
        document.querySelector('.volume-control button').textContent = '🔊';
    }
}

function changePlaybackSpeed() {
    const speedSelect = document.getElementById('speedSelect');
    audioPlayer.playbackRate = parseFloat(speedSelect.value);
}

function setInitialVolume() {
    if (audioPlayer) {
        audioPlayer.volume = 0.7;
        const volumeSlider = document.getElementById('volumeSlider');
        if (volumeSlider) {
            volumeSlider.value = 70;
        }
    }
}

// ============ DOWNLOAD SECTION ============

function downloadAudio() {
    if (!currentAudioFilename) {
        showError('No audio to download');
        return;
    }

    const link = document.createElement('a');
    link.href = `/download-audio/${currentAudioFilename}`;
    link.download = `pdf-audio_${new Date().toISOString().split('T')[0]}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showSuccess('Download started!');
}

// ============ RESET SECTION ============

function resetApp() {
    // Clear variables
    extractedText = '';
    translatedText = '';
    currentAudioFilename = '';
    currentLanguage = '';
    currentVoice = '';
    wordTimings = [];
    currentWordIndex = -1;

    // Hide sections
    document.getElementById('textPreviewSection').style.display = 'none';
    document.getElementById('conversionSection').style.display = 'none';
    document.getElementById('translationPreviewSection').style.display = 'none';
    document.getElementById('audioSection').style.display = 'none';
    
    // Hide word highlighting elements
    const highlightContainer = document.getElementById('highlightedTextContainer');
    const currentWordDisplay = document.getElementById('currentWordDisplay');
    if (highlightContainer) highlightContainer.style.display = 'none';
    if (currentWordDisplay) currentWordDisplay.style.display = 'none';

    // Reset file input
    document.getElementById('pdfFile').value = '';

    // Reset audio player
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        document.getElementById('audioSource').src = '';
    }

    // Reset form selections
    document.getElementById('inputLanguage').value = 'English';
    document.getElementById('targetLanguage').value = 'English';
    document.getElementById('voiceGender').value = 'Female';
    document.getElementById('speedSelect').value = '1';

    // Update target languages dropdown
    updateTargetLanguages();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    showSuccess('Ready for new conversion! Upload a PDF to get started.');
}

// ============ UTILITY FUNCTIONS ============

function showLoading(show, message = 'Processing your request...') {
    const spinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');
    
    if (show) {
        spinner.style.display = 'flex';
        if (loadingText) {
            loadingText.textContent = message;
        }
    } else {
        spinner.style.display = 'none';
    }
}

function showError(message) {
    removeMessages();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'error-message';
    messageDiv.innerHTML = '❌ ' + escapeHtml(message);
    insertMessageAtTop(messageDiv);
}

function showSuccess(message) {
    removeMessages();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'success-message';
    messageDiv.innerHTML = '✅ ' + escapeHtml(message);
    insertMessageAtTop(messageDiv);
}

function removeMessages() {
    const messages = document.querySelectorAll('.error-message, .success-message');
    messages.forEach(msg => msg.remove());
}

function insertMessageAtTop(element) {
    const container = document.querySelector('.main-content');
    if (container) {
        container.insertBefore(element, container.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (element.parentNode) {
                element.remove();
            }
        }, 5000);
    }
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============ WORD HIGHLIGHTING SECTION ============

// Setup highlighted text display with word spans
function setupHighlightedText() {
    if (!translatedText || wordTimings.length === 0) return;
    
    const words = translatedText.split(/\s+/);
    const highlightedHtml = words.map((word, index) => {
        return `<span class="word" data-word-index="${index}">${word}</span>`;
    }).join(' ');
    
    const highlightedContainer = document.getElementById('highlightedText');
    if (highlightedContainer) {
        highlightedContainer.innerHTML = highlightedHtml;
    }
}

// Update which word is currently highlighted based on audio playback position
function updateWordHighlight() {
    if (!audioPlayer || !wordTimings || wordTimings.length === 0) return;
    
    const currentTime = audioPlayer.currentTime;
    let newWordIndex = -1;
    
    // Find the current word based on its timing
    for (let i = 0; i < wordTimings.length; i++) {
        if (currentTime >= wordTimings[i].start && currentTime < wordTimings[i].end) {
            newWordIndex = i;
            break;
        }
    }
    
    // Update highlight if word changed
    if (newWordIndex !== currentWordIndex) {
        // Remove highlight from previous word
        if (currentWordIndex >= 0) {
            const prevWord = document.querySelector(`[data-word-index="${currentWordIndex}"]`);
            if (prevWord) prevWord.classList.remove('highlighted');
        }
        
        currentWordIndex = newWordIndex;
        
        // Add highlight to current word
        if (currentWordIndex >= 0) {
            const currentWord = document.querySelector(`[data-word-index="${currentWordIndex}"]`);
            if (currentWord) {
                currentWord.classList.add('highlighted');
                
                // Scroll current word into view if needed
                const container = document.getElementById('highlightedText');
                if (container) {
                    const wordOffsetLeft = currentWord.offsetLeft;
                    const containerWidth = container.offsetWidth;
                    
                    if (wordOffsetLeft > containerWidth * 0.7) {
                        container.parentElement.scrollLeft = wordOffsetLeft - (containerWidth * 0.2);
                    }
                }
                
                // Update current word display
                const currentWordDisplay = document.getElementById('currentWord');
                if (currentWordDisplay) {
                    currentWordDisplay.textContent = wordTimings[currentWordIndex].word;
                }
            }
        }
    }
}

// Reset word highlight when audio ends
function resetWordHighlight() {
    const words = document.querySelectorAll('.word.highlighted');
    words.forEach(word => word.classList.remove('highlighted'));
    currentWordIndex = -1;
    const currentWordDisplay = document.getElementById('currentWord');
    if (currentWordDisplay) currentWordDisplay.textContent = '-';
}

// Set view mode (original or dual language)
function setViewMode(mode) {
    viewMode = mode;
    
    // Update button states
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Update views
    const originalView = document.getElementById('originalView');
    const dualView = document.getElementById('dualView');
    
    if (originalView) originalView.classList.remove('active');
    if (dualView) dualView.classList.remove('active');
    
    if (mode === 'original') {
        if (originalView) originalView.classList.add('active');
    } else {
        if (dualView) dualView.classList.add('active');
        // Populate dual view if not already done
        const originalDualText = document.getElementById('originalDualText');
        const translatedDualText = document.getElementById('translatedDualText');
        if (originalDualText && !originalDualText.textContent) {
            originalDualText.textContent = extractedText;
        }
        if (translatedDualText && !translatedDualText.textContent) {
            translatedDualText.textContent = translatedText || 'Translate text first';
        }
    }
}
