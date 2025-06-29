// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCwkfxyOeOFqlyrgFQKb-lNYUxk0N6KCTI",
    authDomain: "survey-hub-5abc9.firebaseapp.com",
    projectId: "survey-hub-5abc9",
    storageBucket: "survey-hub-5abc9.appspot.com",
    messagingSenderId: "11098088256",
    appId: "1:11098088256:web:619d8924076c3ba3d190a5",
    measurementId: "G-1VKVMXRYJD"
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'survey-hub-5abc9';

let db, auth;
let surveysCache = []; // Local cache for searching/filtering
let currentUserId = null;

// --- DOM ELEMENT REFERENCES ---
const showFindBtn = document.getElementById('show-find-btn');
const showAddBtn = document.getElementById('show-add-btn');
const findSection = document.getElementById('find-survey-section');
const addSection = document.getElementById('add-survey-section');
const addSurveyForm = document.getElementById('add-survey-form');
const surveyList = document.getElementById('survey-list');
const searchInput = document.getElementById('search-input');
const cardTemplate = document.getElementById('survey-card-template');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const userIdDisplay = document.getElementById('user-id-display');

// --- UI LOGIC ---

function toggleSections(show) {
    if (show === 'find') {
        findSection.classList.remove('hidden');
        addSection.classList.add('hidden');
        showFindBtn.classList.add('bg-sky-600', 'hover:bg-sky-500');
        showFindBtn.classList.remove('bg-slate-700', 'hover:bg-slate-600');
        showAddBtn.classList.add('bg-slate-700', 'hover:bg-slate-600');
        showAddBtn.classList.remove('bg-sky-600', 'hover:bg-sky-500');
    } else {
        findSection.classList.add('hidden');
        addSection.classList.remove('hidden');
        showAddBtn.classList.add('bg-sky-600', 'hover:bg-sky-500');
        showAddBtn.classList.remove('bg-slate-700', 'hover:bg-slate-600');
        showFindBtn.classList.add('bg-slate-700', 'hover:bg-slate-600');
        showFindBtn.classList.remove('bg-sky-600', 'hover:bg-sky-500');
    }
}

function showToast(message, isError = false) {
    toastMessage.textContent = message;
    toast.classList.remove('bg-emerald-500', 'bg-red-500', 'translate-y-20', 'opacity-0');
    toast.classList.add(isError ? 'bg-red-500' : 'bg-emerald-500', 'translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// --- DATA RENDERING ---

function renderSurvey(surveyData) {
    const card = cardTemplate.content.cloneNode(true);
    card.querySelector('.survey-url').textContent = surveyData.url;
    card.querySelector('.survey-target').textContent = surveyData.targetGroup;
    card.querySelector('.survey-qualify').textContent = surveyData.qualifyInfo || 'N/A';
    card.querySelector('.survey-credit').textContent = surveyData.credit || 'Anonymous';
    
    card.querySelector('.copy-url-btn').addEventListener('click', () => {
        const textarea = document.createElement('textarea');
        textarea.value = surveyData.url;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast('URL copied to clipboard!');
        } catch (err) {
            showToast('Failed to copy URL.', true);
            console.error('Fallback: Oops, unable to copy', err);
        }
        document.body.removeChild(textarea);
    });

    return card;
}

function displaySurveys(surveys) {
    surveyList.innerHTML = '';
    loadingState.classList.add('hidden');
    if (surveys.length === 0 && searchInput.value === '') {
         emptyState.textContent = 'No surveys have been added yet. Be the first!';
         emptyState.classList.remove('hidden');
    } else if (surveys.length === 0) {
         emptyState.textContent = 'No surveys match your search. Try another keyword.';
         emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        surveys.forEach(survey => {
            const surveyCard = renderSurvey(survey);
            surveyList.appendChild(surveyCard);
        });
    }
}

// --- FIREBASE LOGIC ---
async function initialize() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        // setLogLevel('debug');

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                userIdDisplay.textContent = currentUserId;
                listenForSurveys();
            } else {
                let signedIn = false;
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    try {
                        await signInWithCustomToken(auth, __initial_auth_token);
                        signedIn = true;
                    } catch (error) {
                        console.warn(`Custom token sign-in failed (${error.code}). Falling back to anonymous sign-in.`);
                    }
                }

                if (!signedIn) {
                    try {
                        await signInAnonymously(auth);
                    } catch (error) {
                        console.error("Critical: All sign-in methods failed.", error);
                        loadingState.textContent = 'Could not authenticate. Please refresh.';
                    }
                }
            }
        });

    } catch (error) {
         console.error("Error initializing Firebase:", error);
         loadingState.textContent = 'Error initializing application.';
    }
}

function listenForSurveys() {
    const surveysColPath = `artifacts/${appId}/public/data/surveys`;
    const q = query(collection(db, surveysColPath));

    onSnapshot(q, (snapshot) => {
        surveysCache = [];
        snapshot.forEach((doc) => {
            surveysCache.push({ id: doc.id, ...doc.data() });
        });
        
        surveysCache.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        displaySurveys(surveysCache);
        searchInput.dispatchEvent(new Event('input')); 
    }, (error) => {
        console.error("Error fetching surveys: ", error);
        loadingState.textContent = "Error loading data. Check console for details.";
        loadingState.classList.remove('hidden');
    });
}

async function handleAddSurvey(event) {
    event.preventDefault();
    const url = document.getElementById('survey-url').value.trim();
    const targetGroup = document.getElementById('target-group').value.trim();
    const qualifyInfo = document.getElementById('qualify-details').value.trim();
    const credit = document.getElementById('credit-name').value.trim();

    if (!url || !targetGroup) {
        showToast("Survey URL and Target Group are required.", true);
        return;
    }
    
    const newSurvey = {
        url,
        targetGroup,
        qualifyInfo,
        credit,
        submitterId: currentUserId,
        createdAt: new Date()
    };

    try {
        const surveysColPath = `artifacts/${appId}/public/data/surveys`;
        await addDoc(collection(db, surveysColPath), newSurvey);
        showToast("Survey added successfully!");
        addSurveyForm.reset();
        toggleSections('find');
    } catch (error) {
        console.error("Error adding document: ", error);
        showToast("Failed to add survey. Please try again.", true);
    }
}

// --- EVENT LISTENERS ---
showFindBtn.addEventListener('click', () => toggleSections('find'));
showAddBtn.addEventListener('click', () => toggleSections('add'));
addSurveyForm.addEventListener('submit', handleAddSurvey);

searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (!surveysCache) return;
    
    const filtered = surveysCache.filter(survey => {
        const urlMatch = survey.url.toLowerCase().includes(searchTerm);
        const targetMatch = survey.targetGroup.toLowerCase().includes(searchTerm);
        const qualifyMatch = survey.qualifyInfo?.toLowerCase().includes(searchTerm);
        return urlMatch || targetMatch || qualifyMatch;
    });

    displaySurveys(filtered);
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    toggleSections('find');
    initialize();
});
