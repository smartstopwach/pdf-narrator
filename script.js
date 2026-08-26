pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const uploadInput = document.getElementById('pdf-upload');
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

let fullExtractedText = '';
let storyParts = [];
let currentPartIndex = 0;
let synth = window.speechSynthesis;
let voices = [];
let recommendedPartsCount = 10;

// Load available voices for Text-to-Speech
function populateVoiceList() {
    voices = synth.getVoices();
    voiceSelect.innerHTML = '';
    
    // Filter out everything except Hindi and English voices
    let filteredVoices = voices.filter(voice => voice.lang.startsWith('hi') || voice.lang.startsWith('en'));

    // Sort voices to show Premium/Natural first, then Hindi, then English
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

uploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset UI
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
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        
        let textArray = [];

        // Extract text page by page (without freezing browser for 500 pages)
        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Better Text extraction logic (adding spaces between items appropriately)
            const pageText = textContent.items.map(item => item.str).join(' ');
            textArray.push(pageText);

            // Update UI progress every 5 pages or at the end
            if (i % 5 === 0 || i === numPages) {
                loadingText.innerText = `PDF padhi ja rahi hai... Page ${i} / ${numPages} mukammal.`;
                // Small delay to let browser render the UI
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        }

        fullExtractedText = textArray.join('\n\n').replace(/\s+/g, ' ').trim();
        
        if (fullExtractedText.length < numPages * 10) {
            alert("Warning: Is PDF mein text bohot kam hai. Ho sakta hai ye 'Scanned Images' ki PDF ho. Images padhne ke liye mehengi OCR technology chahiye hoti hai.");
        }

        if (fullExtractedText.length === 0) {
            alert("Is PDF mein koi text nahi mila!");
            loadingDiv.classList.add('hidden');
            return;
        }

        // Calculate Words and Recommended Parts
        const words = fullExtractedText.split(' ').filter(w => w.length > 0);
        const totalWords = words.length;
        
        // Assume 800-1000 words take about 5-7 minutes to read.
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

    renderParts();
    setupSection.classList.add('hidden');
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
    
    document.querySelectorAll('.part-card').forEach(card => {
        card.classList.remove('active', 'playing');
    });
    const currentCard = document.getElementById(`part-${index}`);
    currentCard.classList.add('active', 'playing');
    
    currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    speakText(storyParts[index], () => {
        document.getElementById(`part-${index}`).classList.remove('playing');
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