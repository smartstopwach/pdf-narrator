pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const uploadInput = document.getElementById('pdf-upload');
const loadingDiv = document.getElementById('loading');
const controlsDiv = document.getElementById('controls');
const partsContainer = document.getElementById('parts-container');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const voiceSelect = document.getElementById('voice-select');

let storyParts = [];
let currentPartIndex = 0;
let synth = window.speechSynthesis;
let voices = [];

// Load available voices for Text-to-Speech
function populateVoiceList() {
    voices = synth.getVoices();
    voiceSelect.innerHTML = '';
    
    // Sort voices to show Hindi/English first, and prioritize 'Natural' or 'Google' premium voices
    let sortedVoices = [...voices].sort((a, b) => {
        // Prioritize natural/premium voices
        const aPremium = a.name.includes('Natural') || a.name.includes('Online') || a.name.includes('Google');
        const bPremium = b.name.includes('Natural') || b.name.includes('Online') || b.name.includes('Google');
        
        if (aPremium && !bPremium) return -1;
        if (!aPremium && bPremium) return 1;

        // Then prioritize Hindi
        if (a.lang.includes('hi') && !b.lang.includes('hi')) return -1;
        if (!a.lang.includes('hi') && b.lang.includes('hi')) return 1;
        
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

uploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset UI
    loadingDiv.classList.remove('hidden');
    partsContainer.innerHTML = '';
    controlsDiv.classList.add('hidden');
    storyParts = [];
    currentPartIndex = 0;
    
    if (window.currentSpeakCancel) window.currentSpeakCancel();
    synth.cancel();

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        // Extract text from all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + ' ';
        }

        fullText = fullText.replace(/\s+/g, ' ').trim();
        
        if (fullText.length === 0) {
            alert("Is PDF mein koi text nahi mila! Kripya text wali PDF chunein.");
            loadingDiv.classList.add('hidden');
            return;
        }

        // Divide text into 10 equal parts based on words
        const words = fullText.split(' ');
        const wordsPerPart = Math.ceil(words.length / 10);
        
        for (let i = 0; i < 10; i++) {
            const partWords = words.slice(i * wordsPerPart, (i + 1) * wordsPerPart);
            if (partWords.length > 0) {
                storyParts.push(partWords.join(' '));
            }
        }

        renderParts();
        loadingDiv.classList.add('hidden');
        controlsDiv.classList.remove('hidden');
        
    } catch (error) {
        console.error("Error reading PDF:", error);
        alert("PDF ko padhne mein error aayi. Kripya doosri file try karein.");
        loadingDiv.classList.add('hidden');
    }
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
    
    // Update UI
    document.querySelectorAll('.part-card').forEach(card => {
        card.classList.remove('active', 'playing');
    });
    const currentCard = document.getElementById(`part-${index}`);
    currentCard.classList.add('active', 'playing');
    
    // Auto-scroll to the current playing part
    currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    speakText(storyParts[index], () => {
        // Callback when this part finishes playing
        document.getElementById(`part-${index}`).classList.remove('playing');
        playPart(index + 1); // Play next part automatically
    });
}

function speakText(text, onEndCallback) {
    // Chunk the text into smaller sentences (around 150-200 chars) to prevent Web Speech API from cutting off
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
    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }
    
    let sIndex = 0;
    let isCancelled = false;
    
    // Global cancel function for the stop button to halt the chunk loop
    window.currentSpeakCancel = () => { 
        isCancelled = true; 
        synth.cancel(); 
    };

    function speakNextSentence() {
        if (isCancelled) return;
        
        if (sIndex < chunks.length) {
            const utterance = new SpeechSynthesisUtterance(chunks[sIndex]);
            
            // Set selected voice
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