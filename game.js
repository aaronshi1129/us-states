// Web Audio API setup
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let correctBuffer = null;
let wrongBuffer = null;

async function loadSound(url) {
    try {
        if (!audioContext) return null; 
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer;
    } catch (error) {
        console.error(`Error loading sound ${url}:`, error);
        return null;
    }
}

function playSound(buffer) {
    if (!buffer || !audioContext) return;
    // Check if the context is in a suspended state (e.g., on first user interaction)
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            // Audio context is now resumed, can play sound
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
        }).catch(e => console.error("AudioContext resume failed", e));
    } else {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
    }
}

async function initializeAudio() {
    correctBuffer = await loadSound('https://app.aaronshi.cc/word-link/correct.mp3');
    wrongBuffer = await loadSound('https://app.aaronshi.cc/word-link/wrong.mp3');
}
// End Web Audio API setup


// Game state
const CHALLENGE_TIME_LIMIT = 120; 
let gameState = {
    isPracticeMode: true,
    selectedStateItem: null,
    correctStates: [],
    stars: 0,
    timerId: null,
    timeLeft: CHALLENGE_TIME_LIMIT,
    isGameOver: false,
    mapInitialized: false // Track if map is already loaded
};

// DOM elements
const homeView = document.getElementById('home-view');
const gameView = document.getElementById('game-view');
const startPracticeBtn = document.getElementById('start-practice-btn');
const startChallengeBtn = document.getElementById('start-challenge-btn');
const homeBtn = document.getElementById('home-btn');

const usaMapElement = document.getElementById('usa-map');
const statesListElement = document.getElementById('states-list');
const practiceModeBtn = document.getElementById('practice-mode');
const challengeModeBtn = document.getElementById('challenge-mode');
const resetBtn = document.getElementById('reset-btn');
const correctCountElement = document.getElementById('correct-count');
const totalStatesElement = document.getElementById('total-states');
const starsElement = document.getElementById('stars');
const tooltip = document.getElementById('tooltip');
const timerContainerElement = document.getElementById('timer-container');
const timerDisplayElement = document.getElementById('time-display');
const loadingOverlay = document.getElementById('loading-overlay');


// Modal Elements
const challengeStartModal = document.getElementById('challenge-start-modal');
const challengeResultsModal = document.getElementById('challenge-results-modal');
const startChallengeGameBtn = document.getElementById('start-challenge-game-btn');
const modalCloseBtns = document.querySelectorAll('.close-modal-btn'); // For start modal cancel
const playAgainBtn = document.getElementById('play-again-btn');
const goHomeBtn = document.getElementById('go-home-btn');
const resultsMessageElement = document.getElementById('results-message');
const finalCorrectCountElement = document.getElementById('final-correct-count');
const finalStarsElement = document.getElementById('final-stars');
const timeTakenDisplayElement = document.getElementById('time-taken-display');


// View Management
function showView(viewElement) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    viewElement.classList.remove('hidden');
}

function showModal(modalElement) {
    modalElement.classList.remove('hidden');
}

function hideModal(modalElement) {
    modalElement.classList.add('hidden');
}

function navigateToGame(isChallenge) {
    gameState.isPracticeMode = !isChallenge;
    showView(gameView);
    
    // Set active mode button
    if (gameState.isPracticeMode) {
        practiceModeBtn.classList.add('active');
        challengeModeBtn.classList.remove('active');
    } else {
        challengeModeBtn.classList.add('active');
        practiceModeBtn.classList.remove('active');
    }

    // Only initialize map the first time
    if (!gameState.mapInitialized) {
        initMap();
    } else {
         // If map is already initialized, just reset the game state for the new mode
         resetGame();
    }
    // initMap and resetGame handle starting timer/displaying timer based on mode
}

// Event Listeners for View/Modal Switching
startPracticeBtn.addEventListener('click', () => navigateToGame(false));

startChallengeBtn.addEventListener('click', () => {
    showModal(challengeStartModal);
});

startChallengeGameBtn.addEventListener('click', () => {
    hideModal(challengeStartModal);
    navigateToGame(true);
});

homeBtn.addEventListener('click', () => {
    stopTimer(); // Stop timer if active
    resetGame(); // Reset game state
    showView(homeView);
});

playAgainBtn.addEventListener('click', () => {
    hideModal(challengeResultsModal);
    resetGame(); // Reset game for the current mode (which is challenge)
});

goHomeBtn.addEventListener('click', () => {
     hideModal(challengeResultsModal);
     stopTimer();
     resetGame(); 
     showView(homeView);
});

modalCloseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        hideModal(challengeStartModal);
         // If cancelling challenge start, ensure mode selector is correct (likely practice default)
         practiceModeBtn.classList.add('active');
         challengeModeBtn.classList.remove('active');
         gameState.isPracticeMode = true; // Revert to practice mode state
         // If user was already in game view and cancelled challenge start, ensure practice mode reset happens visually
         if (!gameView.classList.contains('hidden')) {
             resetGame(); // Ensure practice mode reset state
         }
    });
});


// Set up the mode buttons in game view
practiceModeBtn.addEventListener('click', () => {
    if (!gameState.isPracticeMode) {
        gameState.isPracticeMode = true;
        practiceModeBtn.classList.add('active');
        challengeModeBtn.classList.remove('active');
        resetGame();
    }
});

challengeModeBtn.addEventListener('click', () => {
    if (gameState.isPracticeMode) {
       showModal(challengeStartModal); // Show modal before starting challenge from game view
    }
    // The navigateToGame call after confirming in the modal will handle switching mode internally
});

resetBtn.addEventListener('click', resetGame);

// Timer functions
function updateTimerDisplay() {
    if (gameState.isPracticeMode) {
        timerContainerElement.classList.add('hidden');
    } else {
        timerContainerElement.classList.remove('hidden');
        const minutes = Math.floor(gameState.timeLeft / 60);
        const seconds = gameState.timeLeft % 60;
        timerDisplayElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Add a class for low time warning
        if (gameState.timeLeft <= 10 && gameState.timeLeft > 0) {
            timerDisplayElement.style.color = 'orange';
        } else if (gameState.timeLeft <= 0) {
             timerDisplayElement.style.color = 'red';
        } else {
             timerDisplayElement.style.color = ''; // Reset color
        }
    }
}

function startTimer() {
    stopTimer(); // Clear any existing timer
    
    gameState.timeLeft = CHALLENGE_TIME_LIMIT;
    gameState.isGameOver = false;
    updateTimerDisplay(); 

    gameState.timerId = setInterval(() => {
        gameState.timeLeft--;
        updateTimerDisplay();

        if (gameState.timeLeft <= 0) {
            stopTimer();
            handleTimeUp();
        }
    }, 1000);
}

function stopTimer() {
    if (gameState.timerId) {
        clearInterval(gameState.timerId);
        gameState.timerId = null;
    }
}

function handleTimeUp() {
    gameState.isGameOver = true;
    playSound(wrongBuffer); // Play wrong sound on time up
    showResultsModal(false); // Game over due to time
}

// Initialize the USA map using D3.js
function initMap() {
    loadingOverlay.classList.remove('hidden'); // Show loading animation
    const width = usaMapElement.clientWidth;
    const height = usaMapElement.clientHeight;
    
    // Clear any previous SVG if map is re-initialized
    d3.select('#usa-map').select('svg').remove();

    const svg = d3.select('#usa-map')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', '0 0 960 600')
        .attr('preserveAspectRatio', 'xMidYMid meet');
        
    const projection = d3.geoAlbersUsa()
        .scale(1000) 
        .translate([480, 300]); 
        
    const path = d3.geoPath().projection(projection);
    
    d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')
        .then(us => {
            svg.append('g')
                .selectAll('path')
                .data(topojson.feature(us, us.objects.states).features)
                .enter()
                .append('path')
                .attr('class', 'state')
                .attr('id', (d) => {
                    const topoJsonStateName = d.properties.name;
                    const stateMatch = statesData.find(s => s.name === topoJsonStateName);
                    // Use state abbreviation as ID if found, otherwise a fallback
                    return stateMatch ? stateMatch.id : `feature-${d.id || topoJsonStateName.replace(/\s/g, '')}`;
                })
                .attr('d', path)
                .on('click', handleStateClick)
                .on('mouseover', function(event, d) {
                    const topoJsonStateName = d.properties.name;
                    const stateMatch = statesData.find(s => s.name === topoJsonStateName);
                        
                    if (stateMatch && gameState.isPracticeMode) { 
                        tooltip.textContent = stateMatch.name;
                        tooltip.style.left = `${event.pageX + 10}px`;
                        tooltip.style.top = `${event.pageY + 10}px`;
                        tooltip.style.opacity = 1;
                    } else {
                        tooltip.style.opacity = 0; 
                    }
                    
                    if (gameState.isPracticeMode && gameState.selectedStateItem && stateMatch &&
                        !gameState.correctStates.includes(stateMatch.id)) {
                        d3.select(this).classed('highlight', true);
                    }
                })
                .on('mouseout', function(event, d) {
                    tooltip.style.opacity = 0;
                    if (gameState.isPracticeMode) {
                         d3.select(this).classed('highlight', false);
                    }
                });

            gameState.mapInitialized = true; // Mark map as initialized
            loadingOverlay.classList.add('hidden'); // Hide loading animation
            resetGame(); // Start the first game (default mode) after map loads
        })
        .catch(error => {
            console.error("Error loading or processing map data:", error);
            usaMapElement.innerHTML = "<p style='color: red; text-align: center; padding-top: 20px;'>Error loading map data. Please check the console for details and try refreshing the page.</p>";
            loadingOverlay.classList.add('hidden'); // Hide loading animation even on error
        });
}

// Initialize the states list
function initStatesList() {
    const sortedStates = [...statesData].sort((a, b) => 
        a.abbreviation.localeCompare(b.abbreviation));
    
    statesListElement.innerHTML = '';
    
    sortedStates.forEach(state => {
        if (!gameState.correctStates.includes(state.id)) {
            const stateItem = document.createElement('div');
            stateItem.className = 'state-item';
            stateItem.textContent = state.abbreviation;
            stateItem.dataset.id = state.id;
            
            // Tooltip for state list items (always show
            
            stateItem.addEventListener('mouseover', (e) => {
                tooltip.style.opacity = 1;
                tooltip.textContent = state.name;
                tooltip.style.left = `${e.pageX + 10}px`;
                tooltip.style.top = `${e.pageY + 10}px`;
            });
            
            stateItem.addEventListener('mouseout', () => {
                tooltip.style.opacity = 0;
            });
            
            stateItem.addEventListener('click', handleStateItemClick);
            
            statesListElement.appendChild(stateItem);
        }
    });
}

// Handle clicking on a state item in the list
function handleStateItemClick(event) {
    if (gameState.isGameOver) return; 

    const stateItem = event.currentTarget;
    const stateId = stateItem.dataset.id;
    
    if (gameState.selectedStateItem === stateId) {
        stateItem.classList.remove('selected');
        gameState.selectedStateItem = null;
        return;
    }
    
    const selectedItems = document.querySelectorAll('.state-item.selected');
    selectedItems.forEach(item => item.classList.remove('selected'));
    
    stateItem.classList.add('selected');
    gameState.selectedStateItem = stateId;
}

// Handle clicking on a state on the map
function handleStateClick(event, d) {
    if (gameState.isGameOver) return; 
    if (!gameState.selectedStateItem) return;
    
    const topoJsonStateName = d.properties.name;
    const stateFeatureMatch = statesData.find(s => s.name === topoJsonStateName);

    if (!stateFeatureMatch) {
        console.warn(`Map click on unhandled feature: ${topoJsonStateName || "Unknown Feature"}`);
        playSound(wrongBuffer);

        const clickedElement = d3.select(event.target);
        if (clickedElement.node().tagName === 'path') {
           clickedElement.classed('incorrect', true);
            setTimeout(() => {
                clickedElement.classed('incorrect', false);
            }, 500);
        }
        
        const selectedListItems = document.querySelectorAll('.state-item.selected');
        selectedListItems.forEach(item => item.classList.remove('selected'));
        gameState.selectedStateItem = null;
        return;
    }
    
    const clickedMapStateId = stateFeatureMatch.id;
    const selectedStateListId = gameState.selectedStateItem;
    
    if (gameState.correctStates.includes(clickedMapStateId)) return;
    
    if (clickedMapStateId === selectedStateListId) {
        playSound(correctBuffer);
        
        d3.select(`#${clickedMapStateId}`).classed('correct', true);
        
        gameState.correctStates.push(clickedMapStateId);
        correctCountElement.textContent = gameState.correctStates.length;
        
        const stateItemInList = document.querySelector(`.state-item[data-id='${clickedMapStateId}']`);
        if (stateItemInList) {
             stateItemInList.classList.add('matched');
             setTimeout(() => stateItemInList.remove(), 300);
        }
        
        gameState.selectedStateItem = null;
        
        if (!gameState.isPracticeMode) {
            updateStars();
        }
        
        if (gameState.correctStates.length === statesData.length) {
            if (!gameState.isPracticeMode) {
                stopTimer(); 
            }
            setTimeout(() => {
                alert('Congratulations! You have matched all states correctly!');
                 if (!gameState.isPracticeMode && gameState.timeLeft > 0) {
                    alert(`You finished with ${gameState.timeLeft} seconds remaining!`);
                }
            }, 500);
        }
    } else {
        playSound(wrongBuffer);
        
        const incorrectMapState = d3.select(`#${clickedMapStateId}`);
        incorrectMapState.classed('incorrect', true);
        setTimeout(() => {
            incorrectMapState.classed('incorrect', false);
        }, 500);
        
        const selectedListItems = document.querySelectorAll('.state-item.selected');
        selectedListItems.forEach(item => item.classList.remove('selected'));
        gameState.selectedStateItem = null;
    }
}

// Update stars based on progress
function updateStars() {
    const correctCount = gameState.correctStates.length;
    const newStars = Math.min(5, Math.floor(correctCount / 10));
    
    if (newStars > gameState.stars) {
        gameState.stars = newStars;
        updateStarsDisplay();
        
        if (newStars > 0 && gameState.correctStates.length < statesData.length) {
             setTimeout(() => {
                alert(`Congratulations! You earned ${newStars} star${newStars > 1 ? 's' : ''}!`);
            }, 200);
        }
    }
}

// Update stars display
function updateStarsDisplay() {
    starsElement.innerHTML = '';
    
    for (let i = 0; i < gameState.stars; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.textContent = '★';
        starsElement.appendChild(star);
    }
    
    for (let i = gameState.stars; i < 5; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.textContent = '☆';
        star.style.color = '#ccc';
        starsElement.appendChild(star);
    }
}

// Reset the game state
function resetGame() {
    gameState.selectedStateItem = null;
    gameState.correctStates = [];
    gameState.stars = 0;
    gameState.isGameOver = false; 
    
    correctCountElement.textContent = '0';
    updateStarsDisplay();
    
    d3.selectAll('.state')
        .classed('correct', false)
        .classed('highlight', false)
        .classed('incorrect', false);
    
    initStatesList();
    
    stopTimer(); 
    if (!gameState.isPracticeMode) {
        startTimer(); 
    } else {
        updateTimerDisplay(); 
    }
}

// Function to show results modal with final game information
function showResultsModal(isGameCompleted) {
    const finalCorrectCount = gameState.correctStates.length;
    const finalStars = gameState.stars;
    const timeTaken = isGameCompleted ? CHALLENGE_TIME_LIMIT - gameState.timeLeft : gameState.timeLeft;

    finalCorrectCountElement.textContent = finalCorrectCount;
    finalStarsElement.textContent = finalStars;
    timeTakenDisplayElement.textContent = `Time taken: ${timeTaken} seconds`;

    if (isGameCompleted) {
        resultsMessageElement.textContent = 'Congratulations, you completed the challenge!';
    } else {
        resultsMessageElement.textContent = 'Sorry, time\'s up! Better luck next time.';
    }

    showModal(challengeResultsModal);
}

// Initialize the game
async function initGame() {
    await initializeAudio(); 
    showView(homeView); // Start on home view
}

// Start the game when the page loads
window.addEventListener('load', initGame);