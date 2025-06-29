import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by the Canvas environment (or define sensible defaults for local testing)
// If running locally without a Canvas environment, you might need to hardcode these:
// const appId = 'your-firebase-project-id'; // e.g., 'my-project-12345'
// const firebaseConfig = {
//     apiKey: "YOUR_API_KEY",
//     authDomain: "YOUR_AUTH_DOMAIN",
//     projectId: "YOUR_PROJECT_ID",
//     storageBucket: "YOUR_STORAGE_BUCKET",
//     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
//     appId: "YOUR_APP_ID"
// };
// const initialAuthToken = null; // Or a test token if you have one

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


let app;
let db;
let auth;
let userId = 'Loading...'; // Default until authenticated

const userIdDisplay = document.getElementById('userIdDisplay');
const addSurveyForm = document.getElementById('addSurveyForm');
const searchQueryInput = document.getElementById('searchQuery');
const searchResultsDiv = document.getElementById('searchResults');
const messageModal = document.getElementById('messageModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalCloseButton = document.getElementById('modalCloseButton');
const addSurveyToggleButton = document.getElementById('addSurveyToggleButton');
const addSurveySection = document.getElementById('addSurveySection');

// Function to show the custom modal
function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    messageModal.classList.add('show');
}

// Function to hide the custom modal
function hideModal() {
    messageModal.classList.remove('show');
}

// Event listener for closing the modal
modalCloseButton.addEventListener('click', hideModal);
messageModal.addEventListener('click', (e) => {
    if (e.target === messageModal) {
        hideModal(); // Close if clicked outside the content
    }
});

// Toggle "Add Survey" section visibility
addSurveyToggleButton.addEventListener('click', () => {
    addSurveySection.classList.toggle('show');
    // Change the icon from '+' to '-' when open
    const icon = addSurveyToggleButton.querySelector('i');
    if (addSurveySection.classList.contains('show')) {
        icon.classList.remove('fa-plus');
        icon.classList.add('fa-minus');
    } else {
        icon.classList.remove('fa-minus');
        icon.classList.add('fa-plus');
    }
});

let allSurveys = []; // Array to hold all fetched surveys

// Function to render search results based on a query
function renderSearchResults(queryText) {
    searchResultsDiv.innerHTML = ''; // Clear previous results
    const lowerCaseQuery = queryText.toLowerCase();

    const filteredSurveys = allSurveys.filter(survey => {
        // Check if the query matches any relevant field
        return survey.surveyUrl.toLowerCase().includes(lowerCaseQuery) ||
               survey.targetGroup.toLowerCase().includes(lowerCaseQuery) ||
               survey.qualificationTips.toLowerCase().includes(lowerCaseQuery) ||
               (survey.credit && survey.credit.toLowerCase().includes(lowerCaseQuery)); // Check for credit existence before .toLowerCase()
    });

    if (filteredSurveys.length === 0) {
        searchResultsDiv.innerHTML = `
            <p class="no-results">
                <i class="fas fa-hand-point-up"></i>
                <span>${queryText ? 'No surveys found matching your search.' : 'No surveys available yet. Click the <span class="font-bold text-green-600">+ button</span> to share a new one!'}</span>
            </p>
        `;
        return;
    }

    // Sort surveys by timestamp in descending order (most recent first)
    // Ensure timestamp exists and is a Firebase Timestamp object
    filteredSurveys.sort((a, b) => {
        const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
    });

    filteredSurveys.forEach(survey => {
        const surveyCard = document.createElement('div');
        surveyCard.className = 'card';
        surveyCard.innerHTML = `
            <p><strong>Survey URL:</strong> <a href="${survey.surveyUrl}" target="_blank" rel="noopener noreferrer">${survey.surveyUrl}</a></p>
            <p><strong>Target Group:</strong> ${survey.targetGroup}</p>
            <p><strong>Qualification Tips:</strong> ${survey.qualificationTips}</p>
            <p><strong>Credit:</strong> ${survey.credit || 'Anonymous'}</p>
        `;
        searchResultsDiv.appendChild(surveyCard);
    });
}

// Function to set up the real-time listener for surveys
function setupSurveyListener() {
    if (!db) {
        console.error("Firestore DB is not initialized. Cannot set up survey listener.");
        return;
    }
    const q = query(collection(db, `artifacts/${appId}/public/data/surveys`));

    // Set up real-time listener
    onSnapshot(q, (snapshot) => {
        allSurveys = []; // Clear previous data
        snapshot.forEach((doc) => {
            allSurveys.push({ id: doc.id, ...doc.data() });
        });
        // Re-render search results with updated data immediately
        renderSearchResults(searchQueryInput.value.trim());
        console.log("Surveys updated in real-time.");
    }, (error) => {
        console.error("Error listening to surveys:", error);
        showModal("Data Error", "Failed to load surveys in real-time. Error: " + error.message);
    });
}


// Initialize Firebase and attach main event listeners ONCE the window has loaded
window.onload = async function() {
    try {
        // Initialize Firebase app
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Set up the auth state change listener
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = userId;
                console.log("Authenticated with UID:", userId);
                setupSurveyListener(); // Start listening to surveys once authenticated
            } else {
                // If no user is authenticated, try to sign in
                if (initialAuthToken && initialAuthToken.length > 0) {
                    signInWithCustomToken(auth, initialAuthToken)
                        .then(() => console.log("Signed in with custom token."))
                        .catch(authError => {
                            console.warn("Custom token sign-in failed, attempting anonymous sign-in:", authError);
                            signInAnonymously(auth)
                                .then(() => console.log("Signed in anonymously after custom token failure."))
                                .catch(anonError => {
                                    console.error("Anonymous sign-in failed:", anonError);
                                    showModal("Authentication Error", "Failed to authenticate with Firebase. Please try again later. Error: " + anonError.message);
                                    userIdDisplay.textContent = 'Error';
                                });
                        });
                } else {
                    signInAnonymously(auth)
                        .then(() => console.log("Signed in anonymously (no custom token provided)."))
                        .catch(anonError => {
                            console.error("Anonymous sign-in failed:", anonError);
                            showModal("Authentication Error", "Failed to authenticate with Firebase. Please try again later. Error: " + anonError.message);
                            userIdDisplay.textContent = 'Error';
                        });
                }
            }
        });

        // Add Survey Form Submission Listener
        // This is now inside window.onload, ensuring `db` is ready.
        addSurveyForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent default form submission

            // Basic check to ensure Firebase is initialized and user is authenticated
            if (!db || !userId || userId === 'Loading...') {
                showModal("Authentication Pending", "Please wait for authentication to complete before submitting a survey.");
                return;
            }

            const surveyUrl = document.getElementById('surveyUrl').value.trim();
            const targetGroup = document.getElementById('targetGroup').value.trim();
            const qualificationTips = document.getElementById('qualificationTips').value.trim();
            const credit = document.getElementById('credit').value.trim();

            if (!surveyUrl || !targetGroup || !qualificationTips) {
                showModal("Input Error", "Please fill in all required fields (Survey URL, Target Group, Qualification Tips).");
                return;
            }

            try {
                // Add a new document to the 'surveys' collection
                // Data is stored in a public collection: /artifacts/${appId}/public/data/surveys
                await addDoc(collection(db, `artifacts/${appId}/public/data/surveys`), {
                    surveyUrl: surveyUrl,
                    targetGroup: targetGroup,
                    qualificationTips: qualificationTips,
                    credit: credit || 'Anonymous', // Default to 'Anonymous' if no credit is provided
                    timestamp: serverTimestamp(), // Add a server timestamp
                    submittedBy: userId // Store the user ID who submitted it
                });

                showModal("Success!", "Survey entry added successfully!");
                addSurveyForm.reset(); // Clear the form
                addSurveySection.classList.remove('show'); // Hide the form after submission
                const icon = addSurveyToggleButton.querySelector('i');
                icon.classList.remove('fa-minus');
                icon.classList.add('fa-plus'); // Reset toggle button icon
            } catch (error) {
                console.error("Error adding document: ", error);
                showModal("Submission Error", "Failed to add survey entry. Please try again. Error: " + error.message);
            }
        });

        // Event listener for search input
        // This is also inside window.onload, ensuring `allSurveys` and `renderSearchResults` are ready.
        searchQueryInput.addEventListener('input', (e) => {
            renderSearchResults(e.target.value.trim());
        });

    } catch (error) {
        console.error("Error initializing Firebase:", error);
        showModal("Initialization Error", "Failed to initialize Firebase. Please check your configuration. Error: " + error.message);
        userIdDisplay.textContent = 'Error';
    }
};
