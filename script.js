pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const uploadInput = document.getElementById('pdf-upload');
const uploadSection = document.querySelector('.upload-section');
const loadingDiv = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const setupSection = document.getElementById('setup-section');
const controlsDiv = document.getElementById('controls');
const partsContainer = document.getElementById('parts-container');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const voiceSelect = document.getElementById('voice-select');
const generateBtn = document.getElementById('generate-btn');
const partsInput = document.getElementById('parts-input');

const resumeSection = document.getElementById('resume-section');
const resumeBtn = document.getElementById('resume-btn');
const clearBtn = document.getElementById('clear-btn');
const savedFileName = document.getElementById('saved-file-name');

let fullExtractedText = '';
let storyParts = [];
let currentPartIndex = 0;
let synth = window.speechSynthesis;
let voices = [];
let recommendedPartsCount = 10;

// Page Load: Check if we have saved data
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('pdf_parts')) {
        uploadSection.classList.add('hidden');
        resumeSection.classList.remove('hidden');
        savedFileName.textContent = localStorage.getItem('pdf_name') || 'Pichli PDF';
    }
});

// Resume Previous PDF
resumeBtn.addEventListener('click', () => {
    storyParts = JSON.parse(localStorage.getItem('pdf_parts') || '[]');
    currentPartIndex = parseInt(localStorage.getItem('pdf_current_index') || '0');
    
    resumeSection.classList.add('hidden');
    controlsDiv.classList.remove('hidden');
    renderParts();
    
    // Highlight the part user was on
    setTimeout(() => {
        const currentCard = document.getElementById(`part-${currentPartIndex}`);
        if (currentCard) {
            currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            currentCard.classList.add('active');
        }
    }, 100);
});

// Clear Storage to start fresh
clearBtn.addEventListener('click', () => {
    localStorage.clear();
    resumeSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
});

// Load Voices
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

// Read New PDF
uploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    loadingDiv.classList.remove('hidden');
    setupSection.classList.add('hidden');
    controlsDiv.classList.add('hidden');
    partsContainer.innerHTML = '';
    storyParts = [];
    currentPartIndex = 0;
    fullExtractedText = '';
    
    if (window.currentSpeakCancel) window.currentSpeakCancel();
    synth.cancel();

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ 
            data: arrayBuffer,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/standard_fonts/'
        }).promise;
        const numPages = pdf.numPages;
        
        let textArray = [];

        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            const pageText = textContent.items.map(item => item.str).join(' ');
            textArray.push(pageText);

            if (i % 5 === 0 || i === numPages) {
                loadingText.innerText = `PDF padhi ja rahi hai... Page ${i} / ${numPages} mukammal.`;
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        }

        fullExtractedText = textArray.join('\n\n').replace(/\s+/g, ' ').trim();
        
        if (fullExtractedText.length < numPages * 10) {
            alert("Warning: Is PDF mein text bohot kam hai.");
        }
        if (fullExtractedText.length === 0) {
            alert("Is PDF mein koi text nahi mila!");
            loadingDiv.classList.add('hidden');
            return;
        }

        const words = fullExtractedText.split(' ').filter(w => w.length > 0);
        const totalWords = words.length;
        
        recommendedPartsCount = Math.max(1, Math.ceil(totalWords / 900));
        
        document.getElementById('word-count').innerText = totalWords.toLocaleString();
        document.getElementById('rec-parts').innerText = recommendedPartsCount;
        partsInput.value = recommendedPartsCount;
        partsInput.placeholder = `E.g: ${recommendedPartsCount}`;

        loadingDiv.classList.add('hidden');
        setupSection.classList.remove('hidden');
        
    } catch (error) {
        console.error("Error reading PDF:", error);
        alert("PDF ko padhne mein error aayi. Kripya doosri file try karein.");
        loadingDiv.classList.add('hidden');
    }
});

// Generate Parts
generateBtn.addEventListener('click', () => {
    let userParts = parseInt(partsInput.value);
    if (!userParts || userParts < 1) {
        userParts = recommendedPartsCount;
    }

    const words = fullExtractedText.split(' ').filter(w => w.length > 0);
    const wordsPerPart = Math.ceil(words.length / userParts);
    
    storyParts = [];
    for (let i = 0; i < userParts; i++) {
        const partWords = words.slice(i * wordsPerPart, (i + 1) * wordsPerPart);
        if (partWords.length > 0) {
            storyParts.push(partWords.join(' '));
        }
    }

    // Save Data to Local Storage (so it doesn't get lost on refresh)
    try {
        localStorage.setItem('pdf_parts', JSON.stringify(storyParts));
        localStorage.setItem('pdf_name', uploadInput.files[0] ? uploadInput.files[0].name : 'PDF File');
        localStorage.setItem('pdf_current_index', '0');
    } catch (err) {
        console.warn("Storage full", err);
    }

    renderParts();
    setupSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    controlsDiv.classList.remove('hidden');
});

function renderParts() {
    partsContainer.innerHTML = '';
    storyParts.forEach((part, index) => {
        const div = document.createElement('div');
        div.className = 'part-card';
        div.id = `part-${index}`;
        
        const title = document.createElement('div');
        title.className = 'part-title';
        title.textContent = `Part ${index + 1}`;
        
        const textPreview = document.createElement('div');
        textPreview.className = 'part-text';
        textPreview.textContent = part;
        
        div.appendChild(title);
        div.appendChild(textPreview);
        
        div.addEventListener('click', () => {
            playPart(index);
        });
        
        partsContainer.appendChild(div);
    });
}

function playPart(index) {
    if (index >= storyParts.length) return;
    
    if (window.currentSpeakCancel) window.currentSpeakCancel();
    synth.cancel(); 
    currentPartIndex = index;
    
    // Save current part progress
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
        playPart(index + 1); 
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