import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCwkfxyOeOFqlyrgFQKb-lNYUxk0N6KCTI",
    authDomain: "survey-hub-5abc9.firebaseapp.com",
    projectId: "survey-hub-5abc9",
    storageBucket: "survey-hub-5abc9.firebasestorage.app",
    messagingSenderId: "11098088256",
    appId: "1:11098088256:web:619d8924076c3ba3d190a5",
    measurementId: "G-1VKVMXRYJD"
};

// Define appId using the projectId from your config for consistency with collection paths
// This ensures that the Firestore path uses your Firebase project ID.
const appId = firebaseConfig.projectId;

let app;
let db;
let auth;
let userId = 'Loading...'; // Default until authenticated

// Get references to DOM elements
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

/**
 * Displays a custom modal with a given title and message.
 * @param {string} title - The title for the modal.
 * @param {string} message - The message content for the modal.
 */
function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    messageModal.classList.add('show');
}

/**
 * Hides the custom modal.
 */
function hideModal() {
    messageModal.classList.remove('show');
}

// Event listener for closing the modal when the close button is clicked
modalCloseButton.addEventListener('click', hideModal);

// Event listener for closing the modal when clicking outside its content
messageModal.addEventListener('click', (e) => {
    if (e.target === messageModal) {
        hideModal(); // Close if clicked on the modal overlay itself
    }
});

// Toggle "Add Survey" section visibility and change the FAB icon
addSurveyToggleButton.addEventListener('click', () => {
    addSurveySection.classList.toggle('show');
    const icon = addSurveyToggleButton.querySelector('i');
    if (addSurveySection.classList.contains('show')) {
        icon.classList.remove('fa-plus');
        icon.classList.add('fa-minus');
    } else {
        icon.classList.remove('fa-minus');
        icon.classList.add('fa-plus');
    }
});

let allSurveys = []; // Array to hold all fetched surveys from Firestore

/**
 * Renders search results based on a query string.
 * Filters the 'allSurveys' array and displays matching surveys in the UI.
 * @param {string} queryText - The text to filter surveys by.
 */
function renderSearchResults(queryText) {
    searchResultsDiv.innerHTML = ''; // Clear previous results
    const lowerCaseQuery = queryText.toLowerCase();

    const filteredSurveys = allSurveys.filter(survey => {
        // Check if the query matches any relevant field (case-insensitive)
        return survey.surveyUrl.toLowerCase().includes(lowerCaseQuery) ||
               survey.targetGroup.toLowerCase().includes(lowerCaseQuery) ||
               survey.qualificationTips.toLowerCase().includes(lowerCaseQuery) ||
               (survey.credit && survey.credit.toLowerCase().includes(lowerCaseQuery)); // Ensure 'credit' exists before converting to lowercase
    });

    if (filteredSurveys.length === 0) {
        // Display a message if no surveys are found
        searchResultsDiv.innerHTML = `
            <p class="no-results">
                <i class="fas fa-hand-point-up"></i>
                <span>${queryText ? 'No surveys found matching your search.' : 'No surveys available yet. Click the <span class="font-bold text-green-600">+ button</span> to share a new one!'}</span>
            </p>
        `;
        return;
    }

    // Sort surveys by timestamp in descending order (most recent first)
    // Ensure 'timestamp' property exists and convert it to milliseconds for comparison
    filteredSurveys.sort((a, b) => {
        const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
    });

    // Create and append survey cards for each filtered survey
    filteredSurveys.forEach(survey => {
        const surveyCard = document.createElement('div');
        surveyCard.className = 'card'; // Apply existing card styling
        surveyCard.innerHTML = `
            <p><strong>Survey URL:</strong> <a href="${survey.surveyUrl}" target="_blank" rel="noopener noreferrer">${survey.surveyUrl}</a></p>
            <p><strong>Target Group:</strong> ${survey.targetGroup}</p>
            <p><strong>Qualification Tips:</strong> ${survey.qualificationTips}</p>
            <p><strong>Credit:</strong> ${survey.credit || 'Anonymous'}</p>
        `;
        searchResultsDiv.appendChild(surveyCard);
    });
}

/**
 * Sets up a real-time listener for the 'surveys' collection in Firestore.
 * This function will update 'allSurveys' array and re-render results whenever data changes.
 */
function setupSurveyListener() {
    // Ensure Firestore DB is initialized before attempting to set up the listener
    if (!db) {
        console.error("Firestore DB is not initialized. Cannot set up survey listener.");
        return;
    }

    // Create a query to the public surveys collection
    // Path: /artifacts/{appId}/public/data/surveys
    const q = query(collection(db, `artifacts/${appId}/public/data/surveys`));

    // Set up the real-time listener using onSnapshot
    onSnapshot(q, (snapshot) => {
        allSurveys = []; // Clear previous data to avoid duplicates
        snapshot.forEach((doc) => {
            // Add each document's data along with its ID to the allSurveys array
            allSurveys.push({ id: doc.id, ...doc.data() });
        });
        // Re-render search results immediately with the newly fetched data
        renderSearchResults(searchQueryInput.value.trim());
        console.log("Surveys updated in real-time.");
    }, (error) => {
        // Handle any errors that occur during the real-time listening process
        console.error("Error listening to surveys:", error);
        showModal("Data Error", "Failed to load surveys in real-time. Error: " + error.message);
    });
}


/**
 * Initializes Firebase and sets up all main event listeners once the window has fully loaded.
 */
window.onload = async function() {
    try {
        // Initialize Firebase app with the provided configuration
        app = initializeApp(firebaseConfig);
        db = getFirestore(app); // Get the Firestore instance
        auth = getAuth(app);     // Get the Auth instance

        // Set up the authentication state change listener.
        // This ensures that Firebase operations (like Firestore data fetching)
        // only happen after the user's authentication state is known.
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // If a user is signed in, set the userId and display it
                userId = user.uid;
                userIdDisplay.textContent = userId;
                console.log("Authenticated with UID:", userId);
                setupSurveyListener(); // Start listening to surveys only after authentication
            } else {
                // If no user is authenticated (e.g., first visit or signed out),
                // sign in anonymously to allow public data access as per security rules.
                signInAnonymously(auth)
                    .then(() => console.log("Signed in anonymously."))
                    .catch(anonError => {
                        console.error("Anonymous sign-in failed:", anonError);
                        showModal("Authentication Error", "Failed to authenticate with Firebase. Please try again later. Error: " + anonError.message);
                        userIdDisplay.textContent = 'Error'; // Display error if anonymous sign-in fails
                    });
            }
        });

        // Add Survey Form Submission Listener
        // This listener is now placed inside window.onload, ensuring that 'db' and 'userId'
        // are properly initialized before any submission attempts.
        addSurveyForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent default form submission to handle it with JavaScript

            // Basic check to ensure Firebase is initialized and user is authenticated
            if (!db || !userId || userId === 'Loading...') {
                showModal("Authentication Pending", "Please wait for authentication to complete before submitting a survey.");
                return;
            }

            // Get form input values, trim whitespace
            const surveyUrl = document.getElementById('surveyUrl').value.trim();
            const targetGroup = document.getElementById('targetGroup').value.trim();
            const qualificationTips = document.getElementById('qualificationTips').value.trim();
            const credit = document.getElementById('credit').value.trim();

            // Validate required fields
            if (!surveyUrl || !targetGroup || !qualificationTips) {
                showModal("Input Error", "Please fill in all required fields (Survey URL, Target Group, Qualification Tips).");
                return;
            }

            try {
                // Add a new document to the 'surveys' collection in Firestore
                // The path is structured for public data within the Canvas environment:
                // /artifacts/{appId}/public/data/surveys
                await addDoc(collection(db, `artifacts/${appId}/public/data/surveys`), {
                    surveyUrl: surveyUrl,
                    targetGroup: targetGroup,
                    qualificationTips: qualificationTips,
                    credit: credit || 'Anonymous', // Default to 'Anonymous' if no credit is provided
                    timestamp: serverTimestamp(), // Add a server timestamp for ordering
                    submittedBy: userId // Store the user ID who submitted this survey
                });

                showModal("Success!", "Survey entry added successfully!");
                addSurveyForm.reset(); // Clear the form fields
                addSurveySection.classList.remove('show'); // Hide the form after successful submission
                const icon = addSurveyToggleButton.querySelector('i');
                icon.classList.remove('fa-minus');
                icon.classList.add('fa-plus'); // Reset the toggle button icon to '+'
            } catch (error) {
                console.error("Error adding document: ", error);
                showModal("Submission Error", "Failed to add survey entry. Please try again. Error: " + error.message);
            }
        });

        // Event listener for the search input field
        // This listener is also inside window.onload, ensuring that 'allSurveys' data
        // is available for filtering and 'renderSearchResults' is ready to be called.
        searchQueryInput.addEventListener('input', (e) => {
            renderSearchResults(e.target.value.trim()); // Trigger search on every input change
        });

    } catch (error) {
        // Catch any errors during the initial Firebase setup
        console.error("Error initializing Firebase:", error);
        showModal("Initialization Error", "Failed to initialize Firebase. Please check your configuration. Error: " + error.message);
        userIdDisplay.textContent = 'Error'; // Display 'Error' for user ID if initialization fails
    }
};
