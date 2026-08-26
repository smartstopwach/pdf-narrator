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

let storyParts = [];
let currentPartIndex = 0;
let synth = window.speechSynthesis;
let voices = [];
let isProcessingPDF = false;
let waitingForNextPartIndex = -1;

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
    cleaned = cleaned.replace(/ ([ािीुूृेैोौंःँॅ्])/g, '$1');
    cleaned = cleaned.replace(/् /g, '्');
    cleaned = cleaned.replace(/(ि)([क-ह])/g, '$2$1');
    cleaned = cleaned.replace(/\|/g, '।'); 
    cleaned = cleaned.replace(/  +/g, ' ');
    cleaned = cleaned.replace(/-\n/g, ''); 
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
    localStorage.setItem('pdf_name', file.name);
    
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
                
                const scale = 4.16;
                const viewport = page.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                preprocessCanvasForHindi(canvas);

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
    
    document.querySelectorAll('.part-card').forEach(card => {
        card.classList.remove('active', 'playing');
    });
    const currentCard = document.getElementById(`part-${index}`);
    if (currentCard) {
        currentCard.classList.add('active', 'playing');
        currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    speakText(storyParts[index], () => {
        if (document.getElementById(`part-${index}`)) {
            document.getElementById(`part-${index}`).classList.remove('playing');
        }
        
        if (index + 1 < storyParts.length) {
            playPart(index + 1); 
        } else if (isProcessingPDF) {
            // Agar agla part abhi OCR ho raha hai, toh wait karein
            waitingForNextPartIndex = index + 1;
        }
    });
}

function speakText(text, onEndCallback) {
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
    
    let sIndex = 0;
    let isCancelled = false;
    
    window.currentSpeakCancel = () => { 
        isCancelled = true; 
        synth.cancel(); 
    };

    function speakNextSentence() {
        if (isCancelled) return;
        
        if (sIndex < chunks.length) {
            const utterance = new SpeechSynthesisUtterance(chunks[sIndex]);
            
            const selectedVoice = voiceSelect.options[voiceSelect.selectedIndex];
            if (selectedVoice) {
                const voice = voices.find(v => v.name === selectedVoice.getAttribute('data-name'));
                if (voice) utterance.voice = voice;
            }
            
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
            if (onEndCallback && !isCancelled) onEndCallback();
        }
    }
    
    speakNextSentence();
}

playBtn.addEventListener('click', () => {
    if (synth.paused) {
        synth.resume();
        document.getElementById(`part-${currentPartIndex}`)?.classList.add('playing');
    } else if (!synth.speaking) {
        playPart(currentPartIndex);
    }
});

pauseBtn.addEventListener('click', () => {
    if (synth.speaking && !synth.paused) {
        synth.pause();
        document.getElementById(`part-${currentPartIndex}`)?.classList.remove('playing');
    }
});

stopBtn.addEventListener('click', () => {
    if (window.currentSpeakCancel) window.currentSpeakCancel();
    synth.cancel();
    document.querySelectorAll('.part-card').forEach(card => card.classList.remove('active', 'playing'));
});