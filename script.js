// PWA / Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(() => {
            console.log("Service Worker Registered for Offline PWA");
        });
    });
}

// PWA Install Prompt
let deferredPrompt;
const installAppBtn = document.getElementById('install-app-btn');
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installAppBtn.classList.remove('hidden');
});
installAppBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installAppBtn.classList.add('hidden');
        }
        deferredPrompt = null;
    }
});

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const uploadInput = document.getElementById('pdf-upload');
const uploadSection = document.querySelector('.upload-section');
const loadingDiv = document.getElementById('loading');
const loadingTitle = document.getElementById('loading-title');
const loadingText = document.getElementById('loading-text');
const progressTrack = document.getElementById('progress-track');
const progressFill = document.getElementById('progress-fill');
const progressPercentage = document.getElementById('progress-percentage');
const controlsDiv = document.getElementById('controls');
const partsContainer = document.getElementById('parts-container');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const voiceSelect = document.getElementById('voice-select');
const ocrModeSelect = document.getElementById('ocr-mode');

const resumeSection = document.getElementById('resume-section');
const resumeBtn = document.getElementById('resume-btn');
const clearBtn = document.getElementById('clear-btn');
const savedFileName = document.getElementById('saved-file-name');

const themeSelect = document.getElementById('theme-select');
const speedSlider = document.getElementById('speed-slider');
const pitchSlider = document.getElementById('pitch-slider');
const speedLabel = document.getElementById('speed-label');
const pitchLabel = document.getElementById('pitch-label');
const dictModal = document.getElementById('dict-modal');
const selectedWordEl = document.getElementById('selected-word');
const searchMeaningBtn = document.getElementById('search-meaning-btn');
const closeDictBtn = document.getElementById('close-dict-btn');

// Focus Mode & Multi-Voice elements
const focusModeBtn = document.getElementById('focus-mode-btn');
const focusOverlay = document.getElementById('focus-overlay');
const closeFocusBtn = document.getElementById('close-focus-btn');
const focusPrevText = document.getElementById('focus-prev-text');
const focusMainText = document.getElementById('focus-main-text');
const focusNextText = document.getElementById('focus-next-text');
const multiVoiceToggle = document.getElementById('multi-voice-toggle');

// Cinematic Ambience Elements
const ambienceSelect = document.getElementById('ambience-select');
const ambienceVolume = document.getElementById('ambience-volume');
const visualizer = document.getElementById('voice-visualizer');

const ambienceAudio = new Audio();
ambienceAudio.loop = true;
const ambienceSounds = {
    rain: 'https://actions.google.com/sounds/v1/weather/rain_Heavy_loud.ogg',
    fire: 'https://actions.google.com/sounds/v1/ambiences/fire.ogg',
    coffee: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg'
};

ambienceSelect.addEventListener('change', (e) => {
    if (e.target.value === 'none') {
        ambienceAudio.pause();
    } else {
        ambienceAudio.src = ambienceSounds[e.target.value];
        if (synth.speaking && !synth.paused) {
            ambienceAudio.play();
        }
    }
});
ambienceVolume.addEventListener('input', (e) => {
    ambienceAudio.volume = parseFloat(e.target.value);
});

// Live Voice Visualizer Logic
function updateVisualizer() {
    const bars = document.querySelectorAll('.visualizer .bar');
    if (synth.speaking && !synth.paused) {
        bars.forEach(bar => {
            const height = Math.floor(Math.random() * 80) + 20; // Random height between 20% and 100%
            bar.style.height = `${height}%`;
        });
    } else {
        bars.forEach(bar => bar.style.height = '10%');
    }
    setTimeout(() => requestAnimationFrame(updateVisualizer), 120); // Update every 120ms for smooth beat effect
}
updateVisualizer();

let storyParts = [];
let currentPartIndex = 0;
let synth = window.speechSynthesis;
let voices = [];
let isProcessingPDF = false;
let waitingForNextPartIndex = -1;
let isFocusMode = false;

// Theme Logic
const savedTheme = localStorage.getItem('pdf_theme') || 'theme-dark';
document.body.className = savedTheme;
themeSelect.value = savedTheme;

themeSelect.addEventListener('change', (e) => {
    document.body.className = e.target.value;
    localStorage.setItem('pdf_theme', e.target.value);
});

// Focus Mode Logic
focusModeBtn.addEventListener('click', () => {
    focusOverlay.classList.remove('hidden');
    isFocusMode = true;
});

closeFocusBtn.addEventListener('click', () => {
    focusOverlay.classList.add('hidden');
    isFocusMode = false;
});

// Slider Logic
speedSlider.addEventListener('input', (e) => speedLabel.innerText = e.target.value);
pitchSlider.addEventListener('input', (e) => pitchLabel.innerText = e.target.value);

// Dictionary Logic
closeDictBtn.addEventListener('click', () => {
    dictModal.classList.add('hidden');
    synth.resume(); // Resume story where it left off
});

function preprocessCanvasForHindi(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const v = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const val = v > 170 ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = val;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

function cleanupOCRText(text) {
    let cleaned = text.normalize('NFC');
    
    // 1. Tesseract often mistakes Poorna Viram (।) for pipe, 1, or l at the end of sentences
    cleaned = cleaned.replace(/[\|lI1]\s*(?=\n|$)/g, '।'); 
    cleaned = cleaned.replace(/\|/g, '।');
    
    // 2. Remove accidental spaces before matras and halant
    cleaned = cleaned.replace(/ ([ािीुूृेैोौंःँॅ्])/g, '$1');
    
    // 3. Remove space after halant for proper half-character joining (e.g. क् + य)
    cleaned = cleaned.replace(/् /g, '्');
    
    // 4. Fix Chhoti 'i' (ि) appearing before the consonant (Unicode range for Ka-Ha and extra consonants)
    cleaned = cleaned.replace(/(ि)([\u0915-\u0939\u0958-\u095F])/g, '$2$1');
    
    // 5. Clean extra spaces and broken line hyphenations
    cleaned = cleaned.replace(/  +/g, ' ');
    cleaned = cleaned.replace(/-\n/g, ''); 
    cleaned = cleaned.replace(/\n /g, '\n');
    
    return cleaned.trim();
}

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('pdf_parts')) {
        uploadSection.classList.add('hidden');
        resumeSection.classList.remove('hidden');
        savedFileName.textContent = localStorage.getItem('pdf_name') || 'Pichli PDF';
    }
});

resumeBtn.addEventListener('click', () => {
    storyParts = JSON.parse(localStorage.getItem('pdf_parts') || '[]');
    currentPartIndex = parseInt(localStorage.getItem('pdf_current_index') || '0');
    
    resumeSection.classList.add('hidden');
    controlsDiv.classList.remove('hidden');
    partsContainer.innerHTML = '';
    storyParts.forEach((part, index) => appendPartToUI(part, index));
    
    setTimeout(() => {
        const currentCard = document.getElementById(`part-${currentPartIndex}`);
        if (currentCard) {
            currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            currentCard.classList.add('active');
        }
    }, 100);
});

clearBtn.addEventListener('click', () => {
    localStorage.clear();
    resumeSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
});

function populateVoiceList() {
    voices = synth.getVoices();
    voiceSelect.innerHTML = '';
    
    let filteredVoices = voices.filter(voice => voice.lang.startsWith('hi') || voice.lang.startsWith('en'));
    let sortedVoices = filteredVoices.sort((a, b) => {
        const aPremium = a.name.includes('Natural') || a.name.includes('Online') || a.name.includes('Google');
        const bPremium = b.name.includes('Natural') || b.name.includes('Online') || b.name.includes('Google');
        if (aPremium && !bPremium) return -1;
        if (!aPremium && bPremium) return 1;
        if (a.lang.startsWith('hi') && !b.lang.startsWith('hi')) return -1;
        if (!a.lang.startsWith('hi') && b.lang.startsWith('hi')) return 1;
        return 0;
    });

    sortedVoices.forEach((voice) => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.setAttribute('data-lang', voice.lang);
        option.setAttribute('data-name', voice.name);
        voiceSelect.appendChild(option);
    });
}

populateVoiceList();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

function updateProgress(title, desc, percent = null) {
    loadingTitle.innerText = title;
    loadingText.innerText = desc;
    
    if (percent !== null) {
        progressTrack.classList.remove('hidden');
        progressPercentage.classList.remove('hidden');
        progressFill.style.width = `${percent}%`;
        progressPercentage.innerText = `${percent}%`;
    } else {
        progressTrack.classList.add('hidden');
        progressPercentage.classList.add('hidden');
    }
}

function appendPartToUI(partText, index) {
    const div = document.createElement('div');
    div.className = 'part-card';
    div.id = `part-${index}`;
    
    const title = document.createElement('div');
    title.className = 'part-title';
    title.textContent = `Part ${index + 1}`;
    
    const textPreview = document.createElement('div');
    textPreview.className = 'part-text';
    textPreview.textContent = partText;
    
    div.appendChild(title);
    div.appendChild(textPreview);
    
    div.addEventListener('click', () => {
        playPart(index);
    });
    
    partsContainer.appendChild(div);

    if (index === 0) {
        controlsDiv.classList.remove('hidden');
    }

    if (waitingForNextPartIndex === index) {
        waitingForNextPartIndex = -1;
        playPart(index);
    }
}

uploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    loadingDiv.classList.remove('hidden');
    controlsDiv.classList.add('hidden');
    partsContainer.innerHTML = '';
    storyParts = [];
    currentPartIndex = 0;
    isProcessingPDF = true;
    waitingForNextPartIndex = -1;
    let wordBuffer = [];
    
    updateProgress("Processing PDF...", "Initializing...", 0);
    
    if (window.currentSpeakCancel) window.currentSpeakCancel();
    synth.cancel();

    const mode = ocrModeSelect.value;
    
    try {
        // Clear previous parts to free up localStorage space before setting new one
        localStorage.removeItem('pdf_parts');
        localStorage.setItem('pdf_name', file.name);
    } catch (err) {
        console.warn("Storage warning:", err);
    }
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ 
            data: arrayBuffer,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/standard_fonts/'
        }).promise;
        const numPages = pdf.numPages;

        const processWordBuffer = (forceAll = false) => {
            // Buffer words, make a part every ~800 words
            while (wordBuffer.length >= 800 || (forceAll && wordBuffer.length > 0)) {
                let chunkWords = (wordBuffer.length >= 800 && !forceAll) ? wordBuffer.splice(0, 800) : wordBuffer.splice(0, wordBuffer.length);
                const partText = chunkWords.join(' ');
                storyParts.push(partText);
                appendPartToUI(partText, storyParts.length - 1);
                
                try {
                    localStorage.setItem('pdf_parts', JSON.stringify(storyParts));
                    localStorage.setItem('pdf_current_index', currentPartIndex.toString());
                } catch (err) {
                    console.warn("Storage full", err);
                }
            }
        };
        
        if (mode === 'high-acc') {
            updateProgress("AI OCR Model Load ho raha hai...", "Kripya prateeksha karein", 0);
            
            const worker = await Tesseract.createWorker('hin+eng', 1, {
                logger: m => {
                    const percent = (m.progress * 100).toFixed(0);
                    if (m.status === 'recognizing text') {
                        updateProgress(`AI Scanning Page...`, `Background mein scan ho raha hai`, percent);
                    } else {
                        updateProgress(`Model Loading: ${m.status}`, `Kripya prateeksha karein`, percent);
                    }
                },
                langPath: 'https://tessdata.projectnaptha.com/4.0.0_best'
            });

            for (let i = 1; i <= numPages; i++) {
                updateProgress(`Scanning Page ${i} / ${numPages}`, `Background OCR Process`, 0);
                
                const page = await pdf.getPage(i);
                
                // 300 DPI Scale
                const scale = 4.16;
                const viewport = page.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // CRITICAL FIX: Fill canvas with pure white background FIRST.
                // Transparent PDFs turn black without this, and neural nets need a solid white base.
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                // REMOVED: Manual Binarization. 
                // Tesseract's LSTM (tessdata_best) works much better on raw anti-aliased images.
                // Hard thresholding was destroying thin Matras and Shirorekha.

                const { data: { text } } = await worker.recognize(canvas);
                
                const cleanedText = cleanupOCRText(text);
                const words = cleanedText.split(' ').filter(w => w.length > 0);
                wordBuffer.push(...words);
                
                processWordBuffer(i === numPages);
            }
            
            await worker.terminate();

        } else {
            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                
                let pageText = "";
                let lastItem = null;

                for (const item of textContent.items) {
                    if (!item.str || item.str.trim() === '') continue;

                    if (lastItem) {
                        const yDiff = Math.abs(item.transform[5] - lastItem.transform[5]);
                        if (yDiff > 5) {
                            pageText += '\n';
                        } else {
                            const expectedNextX = lastItem.transform[4] + lastItem.width;
                            const actualX = item.transform[4];
                            const gap = actualX - expectedNextX;
                            const fontSize = Math.abs(lastItem.transform[0]) || 12;
                            if (gap > (fontSize * 0.20)) pageText += ' ';
                        }
                    }
                    pageText += item.str;
                    lastItem = item;
                }
                
                const cleanedText = cleanupOCRText(pageText);
                const words = cleanedText.split(' ').filter(w => w.length > 0);
                wordBuffer.push(...words);
                
                processWordBuffer(i === numPages);

                if (i % 5 === 0 || i === numPages) {
                    const percent = ((i / numPages) * 100).toFixed(0);
                    updateProgress(`Fast Mode: Reading PDF`, `Page ${i} of ${numPages}`, percent);
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
            }
        }

        isProcessingPDF = false;
        
        if (storyParts.length === 0) {
            alert("Is PDF mein koi text nahi mila! Kripya dusri file try karein.");
        } else {
            updateProgress("🎉 Complete!", "Sari kahani process ho chuki hai.", 100);
            setTimeout(() => {
                loadingDiv.classList.add('hidden');
                uploadSection.classList.add('hidden');
            }, 3000);
        }
        
    } catch (error) {
        console.error("Error reading/OCR PDF:", error);
        alert("PDF ko padhne mein error aayi. Console log check karein.");
        loadingDiv.classList.add('hidden');
        isProcessingPDF = false;
    }
});

function playPart(index) {
    if (index >= storyParts.length) return;
    
    if (window.currentSpeakCancel) window.currentSpeakCancel();
    synth.cancel(); 
    currentPartIndex = index;
    
    localStorage.setItem('pdf_current_index', index.toString());
    // Also reset sentence index on new part play
    localStorage.removeItem('pdf_sentence_index');
    
    document.querySelectorAll('.part-card').forEach(card => {
        card.classList.remove('active', 'playing');
    });
    
    const currentCard = document.getElementById(`part-${index}`);
    let textContainer = null;
    
    if (currentCard) {
        currentCard.classList.add('active', 'playing');
        currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        textContainer = currentCard.querySelector('.part-text');
    }
    
    speakText(storyParts[index], textContainer, () => {
        if (document.getElementById(`part-${index}`)) {
            document.getElementById(`part-${index}`).classList.remove('playing');
        }
        
        if (index + 1 < storyParts.length) {
            playPart(index + 1); 
        } else if (isProcessingPDF) {
            waitingForNextPartIndex = index + 1;
        }
    });
}

function speakText(text, textContainer, onEndCallback) {
    const max_length = 150;
    let chunks = [];
    let currentChunk = "";
    const words = text.split(" ");
    
    for (let word of words) {
        if ((currentChunk + " " + word).length > max_length) {
            chunks.push(currentChunk.trim());
            currentChunk = word;
        } else {
            currentChunk += " " + word;
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    
    // UI: Wrap chunks in spans for highlighting and dictionary tap
    if (textContainer) {
        textContainer.innerHTML = '';
        chunks.forEach((chunk) => {
            const span = document.createElement('span');
            span.textContent = chunk + ' ';
            
            // Add click listener for Dictionary feature
            span.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering full part play
                synth.pause();
                
                const cleanWord = chunk.replace(/[\|।,!?'"()]/g, '').trim();
                selectedWordEl.innerText = cleanWord;
                
                // Open Google Search / Translate for exact meaning
                searchMeaningBtn.href = `https://www.google.com/search?q=${encodeURIComponent(cleanWord + ' meaning in hindi')}`;
                
                dictModal.classList.remove('hidden');
            });
            
            textContainer.appendChild(span);
        });
    }
    
    // Check if we have a saved exact sentence to resume from
    let sIndex = 0;
    const savedSentence = localStorage.getItem('pdf_sentence_index');
    if (savedSentence !== null) {
        sIndex = parseInt(savedSentence);
        // Clear it so if we play normally next time, it starts from 0
        localStorage.removeItem('pdf_sentence_index');
    }

    let isCancelled = false;
    
    window.currentSpeakCancel = () => { 
        isCancelled = true; 
        synth.cancel(); 
        document.querySelectorAll('.highlight-text').forEach(el => el.classList.remove('highlight-text'));
    };

    function speakNextSentence() {
        if (isCancelled) return;
        
        if (sIndex < chunks.length) {
            
            // Save exact location for bookmarking
            localStorage.setItem('pdf_sentence_index', sIndex.toString());
            
            // Smart Red Pen Highlight & Auto-Scroll
            if (textContainer) {
                document.querySelectorAll('.highlight-text').forEach(el => el.classList.remove('highlight-text'));
                const currentSpan = textContainer.children[sIndex];
                if (currentSpan) {
                    currentSpan.classList.add('highlight-text');
                    currentSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            
            // Focus Mode Teleprompter Updates
            if (isFocusMode) {
                focusPrevText.innerText = sIndex > 0 ? chunks[sIndex - 1] : '';
                focusMainText.innerText = chunks[sIndex];
                focusNextText.innerText = sIndex < chunks.length - 1 ? chunks[sIndex + 1] : '';
            }

            const utterance = new SpeechSynthesisUtterance(chunks[sIndex]);
            
            // Base Sliders
            let currentPitch = parseFloat(pitchSlider.value) || 1;
            utterance.rate = parseFloat(speedSlider.value) || 1;
            
            const selectedVoice = voiceSelect.options[voiceSelect.selectedIndex];
            let primaryVoice = null;
            if (selectedVoice) {
                primaryVoice = voices.find(v => v.name === selectedVoice.getAttribute('data-name'));
                utterance.voice = primaryVoice;
            }
            
            // Multi-Voice (Dialogue) Logic
            if (multiVoiceToggle.checked && primaryVoice) {
                const currentText = chunks[sIndex];
                const isDialogue = /["'“‘”’]/.test(currentText) || currentText.includes('कहा');
                
                if (isDialogue) {
                    const langPrefix = primaryVoice.lang.split('-')[0];
                    const altVoice = voices.find(v => v.lang.startsWith(langPrefix) && v.name !== primaryVoice.name);
                    
                    if (altVoice) {
                        utterance.voice = altVoice;
                    } else {
                        // If no alternative voice, dynamically shift the pitch higher for characters
                        currentPitch = Math.min(currentPitch + 0.5, 2);
                    }
                }
            }
            
            utterance.pitch = currentPitch;
            
            utterance.onend = () => {
                sIndex++;
                speakNextSentence();
            };
            utterance.onerror = (e) => {
                console.error("Speech error", e);
                sIndex++;
                speakNextSentence();
            };
            
            synth.speak(utterance);
        } else {
            if (textContainer) {
                document.querySelectorAll('.highlight-text').forEach(el => el.classList.remove('highlight-text'));
            }
            if (onEndCallback && !isCancelled) onEndCallback();
            if (ambienceSelect.value !== 'none' && sIndex >= chunks.length) {
                 // Don't completely kill ambience yet if transitioning to next part smoothly, 
                 // but handled by playBtn
            }
        }
    }
    
    // Auto-start Ambience if selected
    if (ambienceSelect.value !== 'none' && !isCancelled) {
        ambienceAudio.play().catch(e => console.log("Audio play blocked by browser", e));
    }
    
    visualizer.classList.remove('hidden');
    speakNextSentence();
}

playBtn.addEventListener('click', () => {
    if (synth.paused) {
        synth.resume();
        document.getElementById(`part-${currentPartIndex}`)?.classList.add('playing');
        if (ambienceSelect.value !== 'none') ambienceAudio.play();
    } else if (!synth.speaking) {
        playPart(currentPartIndex);
    }
});

pauseBtn.addEventListener('click', () => {
    if (synth.speaking && !synth.paused) {
        synth.pause();
        document.getElementById(`part-${currentPartIndex}`)?.classList.remove('playing');
        ambienceAudio.pause();
    }
});

stopBtn.addEventListener('click', () => {
    if (window.currentSpeakCancel) window.currentSpeakCancel();
    synth.cancel();
    document.querySelectorAll('.part-card').forEach(card => card.classList.remove('active', 'playing'));
    visualizer.classList.add('hidden');
    ambienceAudio.pause();
});