// --- CONFIGURATION ---
// Backend API Configuration
const RENDER_BACKEND_URL = 'https://legalease-ai-ej7l.onrender.com';
const LOCAL_BACKEND_URL = 'http://127.0.0.1:8000';

// Auto-detect environment and use appropriate API URL
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? LOCAL_BACKEND_URL  // Local development
    : RENDER_BACKEND_URL; // Production (Netlify frontend -> Render backend)

// Log configuration for debugging
console.log('🌐 Legalease AI Frontend');
console.log('📍 Environment:', window.location.hostname === 'localhost' ? 'Development' : 'Production');
console.log('🔗 API Base URL:', API_BASE_URL);

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js`;

// API Endpoints
const API_ENDPOINTS = {
    analyze: `${API_BASE_URL}/analyze`,
    analyzeWithDocAI: `${API_BASE_URL}/analyze_with_docai`,
    enhancedAnalysis: `${API_BASE_URL}/enhanced_analysis`,
    translate: `${API_BASE_URL}/translate_document`,
    translateSummary: `${API_BASE_URL}/translate_summary`,
    extractEntities: `${API_BASE_URL}/extract_entities`,
    ask: `${API_BASE_URL}/ask`,
    generateChecklist: `${API_BASE_URL}/generate_checklist`,
    textToSpeech: `${API_BASE_URL}/text-to-speech`
};

// --- STATE ---
let originalDocumentText = '';
let originalDocumentName = '';
let currentSummaryLanguage = 'English'; // Track current summary language for TTS
let currentAudio = null; // Track current playing audio
let isPlaying = false; // Track if audio is currently playing

// --- DOM ELEMENT SELECTORS ---
const header = document.getElementById('app-header');
const screens = {
    landing: document.getElementById('landing-screen'),
    paste: document.getElementById('paste-screen'),
    loading: document.getElementById('loading-screen'),
    dashboard: document.getElementById('dashboard-screen'),
};
const uploadButton = document.getElementById('upload-button');
const pasteButton = document.getElementById('paste-button');
const fileInput = document.getElementById('file-input');
const backToLandingBtn = document.getElementById('back-to-landing-btn');
const textInput = document.getElementById('text-input');
const analyzePasteBtn = document.getElementById('analyze-paste-btn');
const documentContentEl = document.getElementById('document-content');
const aiNavigatorContentEl = document.getElementById('ai-navigator-content');
// New selectors for the Q&A chat feature
const chatForm = document.getElementById('chat-form');
const chatLog = document.getElementById('chat-log');
const chatSendBtn = chatForm.querySelector('button');
// Cache frequently accessed elements
const generateChecklistBtn = () => document.getElementById('generate-checklist-btn');
const playSummaryBtn = () => document.getElementById('play-summary-btn');
const checklistContainer = () => document.getElementById('checklist-container');
const newDocBtn = () => document.getElementById('new-doc-btn');

// Performance optimization: Debounce function for API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// --- CORE FUNCTIONS ---

function switchScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.add('hidden'));
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
    }
}

function updateHeader(view, fileName = '') {
    let headerHTML = '';
    const logoHTML = `
        <div class="flex items-center gap-3">
            <div class="bg-slate-800 p-2 rounded-lg">
                <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <div>
                <h1 class="font-lexend font-bold text-slate-800">Legalease AI</h1>
                <p class="text-sm text-slate-500">Simplifying legal documents with AI</p>
            </div>
        </div>`;

    if (view === 'dashboard') {
        headerHTML = `
            <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                ${logoHTML}
                <div class="flex items-center gap-6">
                    <div class="text-right">
                        <p class="font-medium text-slate-700">${fileName}</p>
                        <p class="text-sm text-green-600 font-medium">● Analysis Complete</p>
                    </div>
                    <button id="new-doc-btn" class="bg-slate-800 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-700 transition flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                        New Document
                    </button>
                </div>
            </div>`;
    } else {
        headerHTML = `<div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">${logoHTML}</div>`;
    }
    header.innerHTML = headerHTML;
    if (view === 'dashboard') {
        const newDocButton = newDocBtn();
        if (newDocButton) {
            newDocButton.addEventListener('click', handleNewDocument);
        }
    }
}

async function processFile(file) {
    if (!file) return;
    switchScreen('loading');
    
    try {
        // First, extract text using Document AI
        const formData = new FormData();
        formData.append('file', file);
        
        const docAIResponse = await fetch(API_ENDPOINTS.analyzeWithDocAI, {
            method: 'POST',
            body: formData
        });
        
        if (!docAIResponse.ok) throw new Error(`Server error: ${await docAIResponse.text()}`);
        const docAIData = await docAIResponse.json();
        
        // Get the extracted text
        const extractedText = docAIData.extracted_text || docAIData.summary;
        
        if (!extractedText) {
            throw new Error("No text could be extracted from the file");
        }
        
        // Now run enhanced analysis (including sentiment) on the extracted text
        const enhancedResponse = await fetch(API_ENDPOINTS.enhancedAnalysis, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: extractedText
            }),
        });
        
        if (!enhancedResponse.ok) throw new Error(`Enhanced analysis failed: ${await enhancedResponse.text()}`);
        const enhancedData = await enhancedResponse.json();
        
        // Combine the data from both endpoints
        const combinedData = {
            ...enhancedData,
            extracted_text: extractedText,
            document_ai_entities: docAIData.document_ai_entities || [],
            processing_method: "Google Cloud Document AI OCR + Natural Language API"
        };
        
        // Store the enhanced data
        originalDocumentText = extractedText;
        originalDocumentName = file.name;
        
        renderEnhancedDashboard(combinedData);
        updateHeader('dashboard', file.name);
        switchScreen('dashboard');
    } catch (error) {
        alert(`Error: ${error.message}`);
        handleNewDocument();
    }
}

async function handleAnalyze(content, fileName = 'Pasted Text') {
    switchScreen('loading');
    originalDocumentText = content;
    originalDocumentName = fileName;
    
    try {
        const response = await fetch(API_ENDPOINTS.enhancedAnalysis, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: content
            }),
        });
        if (!response.ok) throw new Error(`Server error: ${await response.text()}`);
        const data = await response.json();
        renderEnhancedDashboard(data);
        updateHeader('dashboard', fileName);
        switchScreen('dashboard');
    } catch (error) {
        alert(`Failed to analyze: ${error.message}`);
        handleNewDocument();
    }
}

function handleNewDocument() {
    // Stop any currently playing audio
    if (isPlaying && currentAudio) {
        stopAudio();
    }
    
    switchScreen('landing');
    updateHeader('landing');
    originalDocumentText = '';
    originalDocumentName = '';
    currentSummaryLanguage = 'English'; // Reset to default language
    fileInput.value = ''; // Reset file input
    chatLog.innerHTML = ''; // Reset chat log
}

async function extractTextFromFile(file) {
    if (!pdfjsLib) {
        throw new Error("PDF library not loaded.");
    }
    if (file.type === 'application/pdf') {
        const uri = URL.createObjectURL(file);
        const pdf = await pdfjsLib.getDocument(uri).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            textContent.items.forEach(item => { fullText += item.str + ' '; });
            fullText += '\n\n';
        }
        URL.revokeObjectURL(uri);
        return fullText;
    } else if (file.type === 'text/plain') {
        return file.text();
    } else {
        throw new Error("Unsupported file type. Please upload PDF or TXT.");
    }
}

function renderDashboard(originalText, data) {
    if (!data || data.error) {
        alert("AI failed to analyze the document.");
        return handleNewDocument();
    }
    displayDocumentWithHighlights(originalText, data.highlights);
    renderAINavigator(data.summary, data.highlights);
}

// Enhanced dashboard rendering for Google Cloud AI integration
function renderEnhancedDashboard(data) {
    const textToDisplay = data.extracted_text || originalDocumentText;
    if (!data || data.error) {
        alert("AI failed to analyze the document.");
        return handleNewDocument();
    }
    displayDocumentWithHighlights(textToDisplay, data.highlights);
    renderEnhancedAINavigator(data);
}

function displayDocumentWithHighlights(text, highlights) {
    let processedText = text;
    if (highlights && highlights.length > 0) {
        // Sort highlights by length (longest first) to avoid nested highlighting issues
        highlights.sort((a, b) => b.text.length - a.text.length);
        
        // Performance optimization: Create a Map for quick CSS class lookup
        const categoryClasses = new Map([
            ["High-Risk", "highlight-red"],
            ["Cautionary", "highlight-yellow"],
            ["Standard", "highlight-green"]
        ]);
        
        for (const highlight of highlights) {
            const cssClass = categoryClasses.get(highlight.category);
            if (cssClass) {
                const flexiblePattern = escapeRegExp(highlight.text).replace(/\s+/g, '\\s+');
                const searchRegex = new RegExp(flexiblePattern, 'g');
                processedText = processedText.replace(searchRegex, `<span class="${cssClass}">$&</span>`);
            }
        }
    }
    // Use innerHTML for efficient rendering
    documentContentEl.innerHTML = processedText.replace(/\n/g, '<br>');
}

function renderAINavigator(summary, highlights) {
    const highRiskItems = highlights?.filter(h => h.category === 'High-Risk') || [];
    
    let highRiskHTML = '';
    if (highRiskItems.length > 0) {
        const listItems = highRiskItems.map(item => `
            <li class="text-sm">
                <strong class="text-red-700 block">● ${item.explanation}</strong>
                <p class="text-slate-600 pl-4 border-l-2 border-red-200 ml-1 mt-1">${item.text}</p>
            </li>
        `).join('');
        
        highRiskHTML = `
            <div class="border border-red-200 bg-red-50 rounded-lg p-4">
                <h3 class="font-lexend font-semibold text-red-800 flex items-center justify-between">
                    <span class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Risks & Warnings
                    </span>
                    <span class="bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded-full">${highRiskItems.length} Critical</span>
                </h3>
                <ul class="mt-3 space-y-3">${listItems}</ul>
            </div>`;
    }

    aiNavigatorContentEl.innerHTML = `
        <div class="border border-slate-200 rounded-lg p-4">
            <h3 class="font-lexend font-semibold text-slate-700 flex items-center gap-2">
                 <svg class="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 Summary
            </h3>
            <p class="mt-2 text-sm text-slate-600">${summary || 'No summary available.'}</p>
        </div>
        ${highRiskHTML}
    `;
}

function renderEnhancedAINavigator(data) {
    const highRiskItems = data.highlights?.filter(h => h.category === 'High-Risk') || [];
    
    let highRiskHTML = '';
    if (highRiskItems.length > 0) {
        const listItems = highRiskItems.map(item => `
            <li class="text-sm">
                <strong class="text-red-700 block">● ${item.explanation}</strong>
                <p class="text-slate-600 pl-4 border-l-2 border-red-200 ml-1 mt-1">${item.text}</p>
            </li>
        `).join('');
        
        highRiskHTML = `
            <div class="border border-red-200 bg-red-50 rounded-lg p-4">
                <h3 class="font-lexend font-semibold text-red-800 flex items-center justify-between">
                    <span class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Risks & Warnings
                    </span>
                    <span class="bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded-full">${highRiskItems.length} Critical</span>
                </h3>
                <ul class="mt-3 space-y-3">${listItems}</ul>
            </div>`;
    }

    // Build Google Cloud insights section with enhanced sentiment display
    let googleCloudSection = '';
    if (data.google_cloud_insights && !data.google_cloud_insights.error) {
        const insights = data.google_cloud_insights;
        
        // Enhanced sentiment display with visual indicators
        const sentimentScore = insights.sentiment?.score || 0;
        const sentimentMagnitude = insights.sentiment?.magnitude || 0;
        const sentimentInterpretation = insights.sentiment?.interpretation || 'Neutral';
        
        // Color coding for sentiment
        const sentimentColor = sentimentScore > 0.1 ? 'text-green-600' : 
                              sentimentScore < -0.1 ? 'text-red-600' : 'text-gray-600';
        
        // Readability score display
        const readabilityLevel = insights.readability_score?.level || 'N/A';
        const readabilityScore = insights.readability_score?.score || 0;
        const readabilityColor = readabilityLevel === 'Easy to read' ? 'text-green-600' :
                                readabilityLevel === 'Moderate complexity' ? 'text-yellow-600' : 'text-red-600';
        
        googleCloudSection = `
            <div class="border border-blue-200 bg-blue-50 rounded-lg p-4 mb-4">
                <h3 class="font-lexend font-semibold text-blue-800 flex items-center gap-2 mb-4">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Deeper Dive: Readability & Sentiment Analysis
                </h3>
                
                <!-- Enhanced Sentiment Section -->
                <div class="bg-white rounded-lg border border-blue-100 p-3 mb-3">
                    <h4 class="font-semibold text-blue-700 mb-2 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                        </svg>
                        Document Sentiment
                    </h4>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div class="bg-gray-50 p-2 rounded">
                            <div class="text-gray-600">Overall Tone</div>
                            <div class="font-bold ${sentimentColor}">${sentimentInterpretation}</div>
                        </div>
                        <div class="bg-gray-50 p-2 rounded">
                            <div class="text-gray-600">Score</div>
                            <div class="font-bold ${sentimentColor}">${sentimentScore >= 0 ? '+' : ''}${sentimentScore.toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="mt-2 text-xs text-gray-500">
                        Scale: -1.0 (Very Negative) to +1.0 (Very Positive)
                    </div>
                </div>
                
                <!-- Enhanced Readability Section -->
                <div class="bg-white rounded-lg border border-blue-100 p-3 mb-3">
                    <h4 class="font-semibold text-blue-700 mb-2 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        Readability Analysis
                    </h4>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div class="bg-gray-50 p-2 rounded">
                            <div class="text-gray-600">Complexity</div>
                            <div class="font-bold ${readabilityColor}">${readabilityLevel}</div>
                        </div>
                        <div class="bg-gray-50 p-2 rounded">
                            <div class="text-gray-600">Score</div>
                            <div class="font-bold ${readabilityColor}">${readabilityScore.toFixed(1)}</div>
                        </div>
                    </div>
                    <div class="mt-2 text-xs text-gray-500">
                        Lower scores indicate easier readability
                    </div>
                </div>
                
                <!-- Additional Metrics -->
                <div class="bg-white rounded-lg border border-blue-100 p-3">
                    <h4 class="font-semibold text-blue-700 mb-2">Additional Metrics</h4>
                    <div class="space-y-1 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Entities Detected:</span>
                            <span class="font-medium text-blue-600">${insights.entities?.length || 0}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Processing Method:</span>
                            <span class="font-medium text-blue-600">${data.processing_method || 'Standard'}</span>
                        </div>
                        ${sentimentMagnitude > 0 ? `
                        <div class="flex justify-between">
                            <span class="text-gray-600">Sentiment Strength:</span>
                            <span class="font-medium">${sentimentMagnitude.toFixed(2)}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    // Entity extraction section
    let entitiesSection = '';
    if (data.document_ai_entities && data.document_ai_entities.length > 0) {
        const entityItems = data.document_ai_entities.slice(0, 5).map(entity => `
            <div class="flex justify-between text-sm">
                <span class="text-slate-600">${entity.mention_text}</span>
                <span class="text-green-600 font-medium">${entity.type}</span>
            </div>
        `).join('');
        
        entitiesSection = `
            <div class="border border-green-200 bg-green-50 rounded-lg p-4 mb-4">
                <h3 class="font-lexend font-semibold text-green-800 flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    Document AI Entities
                </h3>
                <div class="mt-3 space-y-2">${entityItems}</div>
            </div>
        `;
    }
    
    aiNavigatorContentEl.innerHTML = `
        ${googleCloudSection || ''}
        ${entitiesSection || ''}
        <div class="border border-slate-200 rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
                <h3 class="font-lexend font-semibold text-slate-700 flex items-center gap-2">
                    <svg class="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Summary
                </h3>
                ${isLanguageSupportedForTTS(currentSummaryLanguage) ? `
                <button id="play-summary-btn" class="bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium py-1 px-3 rounded-lg flex items-center gap-1 transition-colors">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span id="play-btn-text">Play Summary (${currentSummaryLanguage})</span>
                </button>
                ` : ''}
            </div>
            <p class="summary-text mt-2 text-sm text-slate-600">${data.summary || 'No summary available.'}</p>
        </div>
        <div class="border border-slate-200 rounded-lg p-4">
            <h3 class="font-lexend font-semibold text-slate-700 flex items-center gap-2 mb-3">
                <svg class="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                Action Checklist
            </h3>
            <div id="checklist-container" class="text-sm text-slate-600 space-y-2">
                <!-- Checklist will be rendered here -->
            </div>
            <button id="generate-checklist-btn" class="mt-4 w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm">
                Generate Checklist
            </button>
        </div>
        ${highRiskHTML || ''}
    `;
    
    // Add event listeners with cached elements
    const checklistBtn = generateChecklistBtn();
    const playBtn = playSummaryBtn();
    
    if (checklistBtn) {
        checklistBtn.addEventListener('click', handleGenerateChecklist);
    }
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            const summaryText = data.summary || 'No summary available';
            handleTextToSpeech(summaryText);
        });
    }
}

// --- NEW Q&A FEATURE FUNCTIONS ---

/**
 * Appends a message to the chat log UI.
 * @param {string} text The message content.
 * @param {'user' | 'ai'} sender Who sent the message.
 */
function appendChatMessage(text, sender) {
    const messageDiv = document.createElement('div');
    
    if (sender === 'user') {
        messageDiv.className = 'chat-bubble p-2 rounded-lg bg-blue-200 ml-auto';
        messageDiv.innerText = text;
    } else {
        messageDiv.className = 'chat-bubble p-2 rounded-lg bg-slate-200 flex items-start gap-2';
        messageDiv.innerHTML = `
            <svg class="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 001.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <span>${text}</span>
        `;
    }
    
    chatLog.appendChild(messageDiv);
    chatLog.scrollTop = chatLog.scrollHeight; // Auto-scroll to bottom
}

async function handleGenerateChecklist() {
    if (!originalDocumentText) {
        alert("Please analyze a document first.");
        return;
    }

    const btn = generateChecklistBtn();
    const container = checklistContainer();
    if (!btn || !container) return;

    btn.disabled = true;
    btn.textContent = 'Generating...';
    container.innerHTML = '<p>Analyzing document for key actions...</p>';

    try {
        const response = await fetch(API_ENDPOINTS.generateChecklist, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: originalDocumentText })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }

        const data = await response.json();
        renderChecklist(data.checklist);
        btn.style.display = 'none'; // Hide button after successful generation

    } catch (error) {
        console.error("Checklist generation failed:", error);
        container.innerHTML = `<p class="text-red-500">Failed to generate checklist. Please try again.</p>`;
        btn.disabled = false;
        btn.textContent = 'Generate Checklist';
    }
}

function renderChecklist(checklistItems) {
    const container = checklistContainer();
    if (!container || !checklistItems || checklistItems.length === 0) {
        container.innerHTML = '<p>No specific action items were found in the document.</p>';
        return;
    }

    const listHtml = checklistItems.map(item => 
        `<li class="flex items-start">
            <svg class="w-4 h-4 mr-2 mt-1 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
            <span>${item}</span>
        </li>`
    ).join('');

    container.innerHTML = `<ul class="space-y-2">${listHtml}</ul>`;
}

// Function to get TTS language and voice settings for supported languages
function getTTSSettings(language) {
    const supportedTTSLanguages = {
        'English': { language_code: 'en-US', voice_name: 'en-US-Standard-D' },
        'Spanish': { language_code: 'es-ES', voice_name: 'es-ES-Standard-A' },
        'French': { language_code: 'fr-FR', voice_name: 'fr-FR-Standard-C' },
        'German': { language_code: 'de-DE', voice_name: 'de-DE-Standard-A' },
        'Italian': { language_code: 'it-IT', voice_name: 'it-IT-Standard-A' },
        'Portuguese': { language_code: 'pt-PT', voice_name: 'pt-PT-Standard-A' },
        'Chinese': { language_code: 'zh-CN', voice_name: 'zh-CN-Standard-A' },
        'Japanese': { language_code: 'ja-JP', voice_name: 'ja-JP-Standard-A' },
        'Korean': { language_code: 'ko-KR', voice_name: 'ko-KR-Standard-A' },
        'Dutch': { language_code: 'nl-NL', voice_name: 'nl-NL-Standard-A' }
    };
    
    return supportedTTSLanguages[language] || null;
}

// Function to check if a language supports TTS
function isLanguageSupportedForTTS(language) {
    return getTTSSettings(language) !== null;
}

async function handleTextToSpeech(text) {
    
    const btn = playSummaryBtn();
    if (!btn) return;
    
    // If audio is currently playing, stop it
    if (isPlaying && currentAudio) {
        stopAudio();
        return;
    }
    
    try {
        // Update button to show loading state
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Converting...
        `;
        
        // Get TTS settings for current language
        const ttsSettings = getTTSSettings(currentSummaryLanguage);
        if (!ttsSettings) {
            throw new Error(`Text-to-Speech not supported for ${currentSummaryLanguage}`);
        }
        
        const response = await fetch(API_ENDPOINTS.textToSpeech, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: text,
                voice_name: ttsSettings.voice_name,
                language_code: ttsSettings.language_code
            })
        });
        
        if (!response.ok) {
            throw new Error(`Text-to-Speech failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Create audio element
        currentAudio = new Audio();
        currentAudio.src = `data:audio/mp3;base64,${data.audio_base64}`;
        
        // Update button to show stop state
        updateButtonToStopState(btn);
        
        // Set playing state
        isPlaying = true;
        btn.disabled = false;
        
        // Play audio
        await currentAudio.play();
        
        // Add event listeners
        currentAudio.addEventListener('ended', () => {
            resetButtonToPlayState(btn);
        });
        
        currentAudio.addEventListener('error', () => {
            resetButtonToPlayState(btn);
            alert('Failed to play audio. Please try again.');
        });
        
    } catch (error) {
        console.error('Text-to-Speech error:', error);
        resetButtonToPlayState(btn);
        alert(`Text-to-Speech failed: ${error.message}`);
    }
}

function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    
    const btn = playSummaryBtn();
    if (btn) {
        resetButtonToPlayState(btn);
    }
}

function updateButtonToStopState(btn) {
    btn.innerHTML = `
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6h12v12H6z" />
        </svg>
        <span id="play-btn-text">Stop Audio</span>
    `;
}

function resetButtonToPlayState(btn) {
    isPlaying = false;
    currentAudio = null;
    btn.disabled = false;
    btn.innerHTML = `
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span id="play-btn-text">Play Summary (${currentSummaryLanguage})</span>
    `;
}

/**
 * Handles the submission of the Q&A form.
 * @param {Event} event The form submission event.
 */
async function handleAskQuestion(event) {
    event.preventDefault();
    const questionInput = event.target.elements.question;
    const question = questionInput.value.trim();
    if (!question || !originalDocumentText) return;

    appendChatMessage(question, 'user');
    questionInput.value = '';
    chatSendBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_text: originalDocumentText, question }),
        });
        if (!response.ok) throw new Error(`Server error: ${await response.text()}`);
        const data = await response.json();
        appendChatMessage(data.answer, 'ai');
    } catch (error) {
        appendChatMessage(`Sorry, I ran into an error: ${error.message}`, 'ai');
    } finally {
        chatSendBtn.disabled = false;
    }
}


async function handleTranslateSummary() {
    const selectElement = document.getElementById('summary-translation-language-select');
    const targetLanguage = selectElement.value;
    
    if (!targetLanguage) {
        alert('Please select a language to translate to.');
        return;
    }
    
    // Get the current summary text
    const summaryElement = document.querySelector('#ai-navigator-content .summary-text');
    if (!summaryElement) {
        alert('No summary found to translate.');
        return;
    }
    
    const originalSummary = summaryElement.textContent;
    const translateBtn = document.getElementById('translate-summary-btn');
    
    // Show loading state
    const originalText = translateBtn.textContent;
    translateBtn.textContent = 'Translating...';
    translateBtn.disabled = true;
    
    try {
        const response = await fetch(API_ENDPOINTS.translateSummary, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: originalSummary,
                target_language: targetLanguage
            })
        });
        
        if (!response.ok) {
            throw new Error(`Translation failed: ${await response.text()}`);
        }
        
        const data = await response.json();
        
        // Update the summary with translated text
        summaryElement.textContent = data.translated_summary;
        
        // Update the current summary language for TTS
        currentSummaryLanguage = targetLanguage;
        
        // Hide/show play button based on TTS language support
        const playButton = playSummaryBtn();
        if (isLanguageSupportedForTTS(targetLanguage)) {
            // Show play button for supported languages
            if (!playButton) {
                // Re-create the play button if it doesn't exist
                const summaryHeader = document.querySelector('.border.border-slate-200.rounded-lg .flex.items-center.justify-between');
                if (summaryHeader) {
                    const buttonHTML = `
                        <button id="play-summary-btn" class="bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium py-1 px-3 rounded-lg flex items-center gap-1 transition-colors">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span id="play-btn-text">Play Summary (${targetLanguage})</span>
                        </button>
                    `;
                    summaryHeader.insertAdjacentHTML('beforeend', buttonHTML);
                    
                    // Re-attach event listener
                    const newPlayBtn = document.getElementById('play-summary-btn');
                    if (newPlayBtn) {
                        newPlayBtn.addEventListener('click', () => {
                            const summaryText = document.querySelector('.summary-text').textContent;
                            handleTextToSpeech(summaryText);
                        });
                    }
                }
            } else {
                // Update existing button text to show current language
                const playBtnText = document.getElementById('play-btn-text');
                if (playBtnText && !isPlaying) {
                    playBtnText.textContent = `Play Summary (${targetLanguage})`;
                }
            }
        } else {
            // Stop any currently playing audio when switching to unsupported language
            if (isPlaying && currentAudio) {
                stopAudio();
            }
            
            // Hide play button for unsupported languages
            if (playButton) {
                playButton.remove();
            }
        }
        
        // Add a small indicator that this is translated
        let translationIndicator = document.querySelector('.translation-indicator');
        if (!translationIndicator) {
            translationIndicator = document.createElement('div');
            translationIndicator.className = 'translation-indicator text-xs text-blue-600 mt-2 italic';
            summaryElement.parentNode.appendChild(translationIndicator);
        }
        translationIndicator.textContent = `🌐 Translated to ${targetLanguage}`;
        
    } catch (error) {
        alert(`Translation failed: ${error.message}`);
    } finally {
        // Reset button
        translateBtn.textContent = originalText;
        translateBtn.disabled = false;
    }
}

function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// --- EVENT LISTENERS ---
uploadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if (e.target.files[0]) processFile(e.target.files[0]); });
pasteButton.addEventListener('click', () => switchScreen('paste'));
backToLandingBtn.addEventListener('click', handleNewDocument);
analyzePasteBtn.addEventListener('click', () => {
    const text = textInput.value;
    if (text.trim()) {
        handleAnalyze(text);
    }
});
// New event listener for the chat form
chatForm.addEventListener('submit', handleAskQuestion);

// Event listener for the translate summary button
document.addEventListener('DOMContentLoaded', () => {
    // This will be set up when the dashboard is rendered
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'translate-summary-btn') {
            handleTranslateSummary();
        }
    });
});


// --- INITIALIZATION ---
switchScreen('landing');
updateHeader('landing');

