// Game variables
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let newspapers = [];
let wasteCount = 0;
let cartCount = 0;
let correctDrops = 0;
let incorrectDrops = 0;
let gameRunning = false; // Start as false, will be set to true when start screen is clicked
let gamePaused = false;
let showStartScreen = true; // New state for start screen
let collectedStories = []; // Array to store collected real stories
let lastSpawnTime = 0;
let spawnInterval = 7000; // milliseconds (further increased for better newspaper spacing)
let beltOffset = 0; // For animating conveyor belt
let gameSpeed = 2; // Configurable speed for both newspapers and belt animation
let headlineData = []; // Store loaded headline data from JSON
let originalHeadlines = []; // Store original headline data from JSON
let beltPaused = false; // Separate pause state for conveyor belt
let beltPauseEndTime = 0; // When to resume belt animation
let showIncorrectDialog = false; // Flag to show incorrect drop dialog
let showGameOverDialog = false; // Flag to show game over dialog
let showSuccessFlash = false; // Flag to show success flash
let successFlashEndTime = 0; // When to stop showing success flash
let failedNewspaper = null; // Store the newspaper that was incorrectly dropped
let imagesLoaded = false; // Flag to track if all images are loaded
const MAX_FAILS = 3; // Maximum number of fails before game over

// High score system
let highScore = 0; // Current high score from localStorage
let setNewHighScore = false; // Flag to set new high score

const images = {};

// Load high score from localStorage
function loadHighScore() {
    const saved = localStorage.getItem('newspaperGame_highScore');
    if (saved) {
        highScore = parseInt(saved, 10) || 0;
    }
}

// Save high score to localStorage
function saveHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('newspaperGame_highScore', highScore.toString());
        setNewHighScore = true;
    }
}

// Sound effects
const wrongSound = new Audio('assets/sounds/wrong.wav');
const correctBinSound = new Audio('assets/sounds/correct-bin.wav');
const backgroundMusic = new Audio('assets/sounds/background.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.7;
let musicMuted = false;
playBackgroundMusic();

function toggleBackgroundMusic() {
    if (musicMuted) {
        backgroundMusic.play().catch(e => {
            console.log('Background music autoplay failed:', e);
        });
        musicMuted = false;
        console.log('Background music unmuted');
    } else {
        backgroundMusic.pause();
        musicMuted = true;
        console.log('Background music muted');
    }
}

function playBackgroundMusic() {
    if (!musicMuted) {
        backgroundMusic.play().catch(e => setTimeout(playBackgroundMusic, 100));
    }
}

// Newspaper class
class Newspaper {
    constructor(data, x, y) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = 300; // Doubled from 150
        this.height = 400; // Doubled from 150
        this.speed = gameSpeed; // Use configurable game speed
        this.beingDragged = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.dragStartTime = 0; // Track when dragging started
        this.headline = data.headline;
        this.imageLoaded = false;
        this.articleImageLoaded = false;
        this.shouldTriggerBeltPause = true; // Flag to trigger belt pause when fully visible

        // Use preloaded images if available
        this.loadNewspaperImage();
        this.loadArticleImage();
    }

    loadNewspaperImage() {
        // Use preloaded newspaper image if available, otherwise load it
        if (images['assets/images/newspaper.png']) {
            this.image = images['assets/images/newspaper.png'];
            this.imageLoaded = true;
            console.log('Using preloaded newspaper image');
        } else {
            // Fallback: load the newspaper image file
            this.image = new Image();
            this.image.onload = () => {
                this.imageLoaded = true;
                console.log('Newspaper image loaded successfully');
            };
            this.image.onerror = () => {
                console.error('Failed to load newspaper image');
                this.imageLoaded = false; // Fallback to colored rectangles
            };
            this.image.src = 'assets/images/newspaper.png'; // Load the newspaper image file
        }
    }

    loadArticleImage() {
        // Use preloaded article image if available, otherwise load it
        if (this.data.imageUrl && images[this.data.imageUrl]) {
            this.articleImage = images[this.data.imageUrl];
            this.articleImageLoaded = true;
            console.log('Using preloaded article image');
        } else if (this.data.imageUrl) {
            // Fallback: load the article image from data.imageUrl
            this.articleImage = new Image();
            this.articleImage.onload = () => {
                this.articleImageLoaded = true;
                console.log('Article image loaded successfully');
            };
            this.articleImage.onerror = () => {
                console.error('Failed to load article image');
                this.articleImageLoaded = false;
            };
            this.articleImage.src = this.data.imageUrl;
        }
    }

    update() {
        if (!this.beingDragged && !gamePaused && !beltPaused) {
            this.y -= this.speed;

            // Check if newspaper has fallen off the top of the canvas (incorrect condition)
            if (this.y < -this.height) {
                // Newspaper has fallen off - treat as incorrect drop
                handleIncorrectDrop(this);
                // Add to collection if it's a true story (handled in addStoryToCollection)
                addStoryToCollection(this);
                wrongSound.currentTime = 0;
                wrongSound.play().catch(e => console.log('Audio play failed:', e));
                return; // Don't continue updating this newspaper
            }

            // Check if we should trigger belt pause when newspaper is centered on conveyor belt
            // Conveyor belt center is at y = 450, so newspaper center should be at y = 450
            // For 300px tall newspaper, top should be at y = 450 - 150 = 300
            if (this.shouldTriggerBeltPause && this.y <= 200) { // When newspaper top reaches y = 300 (centered position)
                this.shouldTriggerBeltPause = false; // Only trigger once
                beltPaused = true;
                beltPauseEndTime = Date.now() + 4000; // Pause for 2 seconds
                console.log('Triggering belt pause - newspaper is centered');
            }

            // Remove newspaper if it goes off screen
            if (this.y < -this.height) { // Remove when entire newspaper is above visible area
                console.log(`Removing newspaper at y: ${this.y}`); // Debug log
                const index = newspapers.indexOf(this);
                if (index > -1) {
                    newspapers.splice(index, 1);
                }
            }
        }
    }

    draw() {
        ctx.save();

        if (this.imageLoaded && this.image) {
            // Draw newspaper image (when real image assets are available)
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);

            // Overlay headline text on the image with multi-line support
            // Position headline lower on newspaper to match typical newspaper layout
            const maxWidth = this.width - 60; // Leave 20px margin on each side for larger newspaper
            const headlineAreaY = this.y + 25; // Start headlines higher on newspaper
            const maxHeight = this.height - 180; // Leave room for bottom content and proper spacing
            const lineHeight = 18; // Increased spacing for larger font size
            const maxLines = 4; // Allow more lines for larger newspaper

            // Use consistent newspaper-style font sizing
            ctx.font = `20px Old Standard TT`;

            // Function to wrap text into multiple lines
            function wrapText(text, maxWidth) {
                // Set the font for accurate text measurement
                ctx.font = `20px Old Standard TT`;
                const words = text.split(' ');
                const lines = [];
                let currentLine = '';

                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    const testLine = currentLine + (currentLine ? ' ' : '') + word;
                    const metrics = ctx.measureText(testLine);

                    if (metrics.width > maxWidth && currentLine) {
                        // Current line is full, start new line
                        if (lines.length < maxLines - 1) {
                            lines.push(currentLine);
                            currentLine = word;
                        } else {
                            // Too many lines, truncate current line
                            currentLine = currentLine.substring(0, currentLine.length - 3) + '...';
                            break;
                        }
                    } else {
                        currentLine = testLine;
                    }
                }

                // Add the last line if there's space
                if (currentLine && lines.length < maxLines) {
                    lines.push(currentLine);
                }

                return lines;
            }

            // Get wrapped lines
            const headlineLines = wrapText(this.headline, maxWidth);

            // Position headlines in the designated area
            const totalTextHeight = headlineLines.length * lineHeight;
            const startY = headlineAreaY + ((maxHeight - totalTextHeight) / 2); // Center vertically in available space

            // Use newspaper-style text styling (dark text like real newspapers)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; // Dark black text for authentic newspaper look
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // White outline for contrast against dark backgrounds
            ctx.lineWidth = 2;
            ctx.textAlign = 'center';

            // Draw article image if available (positioned between headline and year)
            if (this.articleImageLoaded && this.articleImage) {
                const maxImageHeight = 175;
                const maxImageWidth = 275;
                const sourceImageHeight = this.articleImage.height;
                const sourceImageWidth = this.articleImage.width;

                // Calculate scaling factors
                const widthScale = maxImageWidth / sourceImageWidth;
                const heightScale = maxImageHeight / sourceImageHeight;

                // Use the smaller scaling factor to ensure the image fits within both dimensions
                const scale = Math.min(widthScale, heightScale);

                var imageWidth = Math.round(sourceImageWidth * scale);
                var imageHeight = Math.round(sourceImageHeight * scale);

                // Position image close to headline text
                const imageY = startY + totalTextHeight; // Very close to headline text
                const imageX = this.x + (this.width - imageWidth) / 2; // Center horizontally

                // Draw article image with grayscale filter (using CSS filter for compatibility)
                ctx.save();

                // Apply grayscale filter using CSS filter property
                ctx.filter = 'grayscale(100%)';

                // Draw article image with rounded corners effect
                ctx.beginPath();
                ctx.rect(imageX, imageY, imageWidth, imageHeight);
                ctx.clip();
                ctx.drawImage(this.articleImage, imageX, imageY, imageWidth, imageHeight);

                ctx.restore();

                const borderWidth = 2;
                // Add outline around article image
                ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
                ctx.lineWidth = borderWidth;
                ctx.strokeRect(imageX-borderWidth, imageY-borderWidth, imageWidth+(borderWidth*2), imageHeight+(borderWidth*2));
            }

            ctx.font = `bold 36px Canterbury`;
            ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
            ctx.lineWidth = 2;
            ctx.fillText('The Daily News', this.x + this.width / 2, this.y + 50);

            // Draw each line of the headline
            headlineLines.forEach((line, index) => {
                const lineY = startY + (index * lineHeight);
                // Ensure font is set for drawing (in case wrapText changed it)
                ctx.font = `bold 20px Old Standard TT`;
                ctx.fillText(line, this.x + this.width / 2, lineY);
            });

            // Draw year below image (or headline if no image), centered
            if (this.data.year) {
                ctx.font = 'bold 20px Old Standard TT';
                ctx.textAlign = 'center';

                // Position year at bottom of newspaper, ensuring it's visible
                if (this.data && this.data.year) {
                    // Position year 25px above the bottom edge of the canvas or newspaper (whichever is higher)
                    const newspaperBottom = this.y + this.height;
                    const yearY = newspaperBottom - 20; // 25px above newspaper bottom or canvas bottom

                    ctx.fillText(this.data.year, this.x + this.width / 2, yearY);
                }
            }

        } else {
            // Fallback: Draw newspaper as colored rectangle (current system)
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // Draw newspaper border
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // Draw headline text
            ctx.fillStyle = '#000000';
            ctx.font = '12px Old Standard TT';
            ctx.textAlign = 'center';
            ctx.fillText(this.headline, this.x + this.width / 2, this.y + 20);

            // Draw year (from data if available, otherwise current date)
            ctx.font = '10px Old Standard TT';
            const displayYear = this.data && this.data.year ? this.data.year : new Date().toLocaleDateString();
            ctx.fillText(displayYear, this.x + this.width / 2, this.y + 40);

            // Draw masthead
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 14px Old Standard TT';
            ctx.fillText('DAILY NEWS', this.x + this.width / 2, this.y + 15);
        }

        ctx.restore();
    }

    isMouseOver(mouseX, mouseY) {
        return mouseX >= this.x && mouseX <= this.x + this.width &&
               mouseY >= this.y && mouseY <= this.y + this.height;
    }
}

// Mouse interaction variables
let mouseX = 0;
let mouseY = 0;
let isDragging = false;
let draggedNewspaper = null;
let articleLinkX;
let articleLinkY;
let articleLinkWidth;
let articleLinkHeight;

// Event listeners
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);


// Mouse event handlers
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    // Check if clicking on start button when start screen is showing
    if (showStartScreen && imagesLoaded) {
        const buttonWidth = 300;
        const buttonHeight = 100;
        const buttonX = canvas.width / 2 - buttonWidth / 2;
        const buttonY = canvas.height - 375;

        if (mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
            mouseY >= buttonY && mouseY <= buttonY + buttonHeight) {
            // Start the game
            showStartScreen = false;
            gameRunning = true;
            return;
        }
        return; // Don't allow any other interaction while start screen is showing
    }
    
    // Check if clicking on Play Again button in game over dialog
    if (showGameOverDialog) {
        const dialogHeight = 300;
        const dialogY = (canvas.height - dialogHeight) / 2;
        const buttonX = canvas.width / 2 - 100;
        const buttonY = dialogY + dialogHeight - 80;
        const buttonWidth = 200;
        const buttonHeight = 60;

        if (mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
            mouseY >= buttonY && mouseY <= buttonY + buttonHeight) {
            // Reset game and show start screen
            resetGame();
            return;
        }
        return; // Don't allow any other interaction while dialog is showing
    }
    
    // Check if clicking in incorrect dialog or success dialog
    if (showIncorrectDialog) {
        const dialogWidth = 600;
        const dialogHeight = 400;
        const dialogX = (canvas.width - dialogWidth) / 2;
        const dialogY = (canvas.height - dialogHeight) / 2;

        // Check for article link click first (only for true stories)
        if (failedNewspaper && failedNewspaper.data && failedNewspaper.data.isTrue && failedNewspaper.data.article) {
            if (mouseX >= articleLinkX && mouseX <= articleLinkX + articleLinkWidth &&
                mouseY >= articleLinkY && mouseY <= articleLinkY + articleLinkHeight) {
                // Open article URL in new tab
                window.open(failedNewspaper.data.article, '_blank');
                return; // Don't close dialog, just open link
            }
        }

        // Check for general dialog click to close (but not if link was clicked)
        if (mouseX >= dialogX && mouseX <= dialogX + dialogWidth &&
            mouseY >= dialogY && mouseY <= dialogY + dialogHeight) {
            // Close incorrect dialog and resume game
            showIncorrectDialog = false;
            failedNewspaper = null; // Clear the failed newspaper reference
            gamePaused = false;
            return;
        }
        return; // Don't allow any other interaction while dialog is showing
    } else if (showSuccessFlash) {
        // Success dialog is smaller and doesn't block other interactions
        const imgSize = 80;
        const textHeight = 40;
        const padding = 20;
        const dialogWidth = imgSize + (padding * 2);
        const dialogHeight = imgSize + textHeight + (padding * 2);
        const dialogX = (canvas.width - dialogWidth) / 2;
        const dialogY = (canvas.height - dialogHeight) / 2;

        if (mouseX >= dialogX && mouseX <= dialogX + dialogWidth &&
            mouseY >= dialogY && mouseY <= dialogY + dialogHeight) {
            // Close success dialog and resume game
            showSuccessFlash = false;
            gamePaused = false;
            return;
        }
        // Don't return here - allow other interactions when success dialog is showing
    }
    
    // Don't allow dragging when game is paused
    if (gamePaused) {
        return;
    }

    // Check if clicking on a newspaper
    for (let i = newspapers.length - 1; i >= 0; i--) {
        if (newspapers[i].isMouseOver(mouseX, mouseY)) {
            isDragging = true;
            draggedNewspaper = newspapers[i];
            draggedNewspaper.beingDragged = true;
            draggedNewspaper.dragOffsetX = mouseX - draggedNewspaper.x;
            draggedNewspaper.dragOffsetY = mouseY - draggedNewspaper.y;
            draggedNewspaper.dragStartTime = Date.now(); // Record when dragging started
            // Store original position for return if not dropped in valid zone
            draggedNewspaper.originalX = draggedNewspaper.x;
            draggedNewspaper.originalY = draggedNewspaper.y;
            break;
        }
    }
}

let articleLinkHovered = false;

function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    // Update cursor style for start button hover when start screen is showing
    if (showStartScreen && imagesLoaded) {
        const buttonWidth = 300;
        const buttonHeight = 100;
        const buttonX = canvas.width / 2 - buttonWidth / 2;
        const buttonY = canvas.height - 375;

        if (mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
            mouseY >= buttonY && mouseY <= buttonY + buttonHeight) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
        return;
    }
    
    // Update cursor style for Play Again button hover
    if (showGameOverDialog) {
        const dialogHeight = 300;
        const dialogY = (canvas.height - dialogHeight) / 2;
        const buttonX = canvas.width / 2 - 100;
        const buttonY = dialogY + dialogHeight - 80;
        const buttonWidth = 200;
        const buttonHeight = 60;

        if (mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
            mouseY >= buttonY && mouseY <= buttonY + buttonHeight) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
        return;
    }
    
    // Update cursor style for dialog hover
    if (showIncorrectDialog) {
        const dialogWidth = 600;
        const dialogHeight = 400;
        const dialogX = (canvas.width - dialogWidth) / 2;
        const dialogY = (canvas.height - dialogHeight) / 2;

        // Check for article link hover (only for true stories)
        if (failedNewspaper && failedNewspaper.data && failedNewspaper.data.isTrue && failedNewspaper.data.article) {
            articleLinkHovered = false;
            if (mouseX >= articleLinkX && mouseX <= articleLinkX + articleLinkWidth &&
                mouseY >= articleLinkY && mouseY <= articleLinkY + articleLinkHeight) {
                canvas.style.cursor = 'pointer';
                articleLinkHovered = true;
                return;
            }
        }

        // Check for general dialog hover
        if (mouseX >= dialogX && mouseX <= dialogX + dialogWidth &&
            mouseY >= dialogY && mouseY <= dialogY + dialogHeight) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
        return;
    }

    if (isDragging && draggedNewspaper) {
        draggedNewspaper.x = mouseX - draggedNewspaper.dragOffsetX;
        draggedNewspaper.y = mouseY - draggedNewspaper.dragOffsetY;
    }
}

function handleMouseUp(e) {
    if (isDragging && draggedNewspaper) {
        const rect = canvas.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const dropY = e.clientY - rect.top;

        // Get factory floor drop areas for collision detection (updated for full visibility)
        const wasteArea = { x: 0, y: 0, width: 200, height: canvas.height };
        const cartArea = { x: canvas.width - 200, y: 0, width: 200, height: canvas.height };

        let droppedInValidZone = false;

        // Check if newspaper rectangle overlaps with waste area (left side, full height)
        if (draggedNewspaper.x < wasteArea.x + wasteArea.width &&
            draggedNewspaper.x + draggedNewspaper.width > wasteArea.x &&
            draggedNewspaper.y < wasteArea.y + wasteArea.height &&
            draggedNewspaper.y + draggedNewspaper.height > wasteArea.y) {
            showDropFeedback('waste', draggedNewspaper);
            droppedInValidZone = true;
        }
        // Check if newspaper rectangle overlaps with cart area (right side, full height)
        else if (draggedNewspaper.x < cartArea.x + cartArea.width &&
                 draggedNewspaper.x + draggedNewspaper.width > cartArea.x &&
                 draggedNewspaper.y < cartArea.y + cartArea.height &&
                 draggedNewspaper.y + draggedNewspaper.height > cartArea.y) {
            showDropFeedback('cart', draggedNewspaper);
            droppedInValidZone = true;
        }

        // Only remove the newspaper if it was dropped in a valid zone
        if (droppedInValidZone) {
            const index = newspapers.indexOf(draggedNewspaper);
            if (index > -1) {
                newspapers.splice(index, 1);
            }
            // Reset drag start time for removed newspaper
            draggedNewspaper.dragStartTime = 0;
        } else {
            // Move newspaper to expected conveyor belt location based on current position
            moveNewspaperToConveyorPosition(draggedNewspaper);
        }
    }

    isDragging = false;
    if (draggedNewspaper) {
        draggedNewspaper.beingDragged = false;
        draggedNewspaper.dragStartTime = 0; // Reset drag start time
        draggedNewspaper = null;
    }
}

// Add global score variable
let score = 0;
let fails = 0;

function addStoryToCollection(newspaper) {
    // Only add true stories to the collection
    if (!newspaper.data.isTrue) return;

    // Add story to collected stories if not already collected
    const storyExists = collectedStories.some(story => story.headline === newspaper.data.headline);
    if (!storyExists) {
        const maxImageHeight = 200;
        const maxImageWidth = 200;

        // Use default dimensions if image not loaded yet
        let sourceImageHeight = 100;
        let sourceImageWidth = 150;

        if (newspaper.articleImage && newspaper.articleImageLoaded) {
            sourceImageHeight = newspaper.articleImage.height;
            sourceImageWidth = newspaper.articleImage.width;
        }

        // Calculate scaling factors
        const widthScale = maxImageWidth / sourceImageWidth;
        const heightScale = maxImageHeight / sourceImageHeight;

        // Use the smaller scaling factor to ensure the image fits within both dimensions
        const scale = Math.min(widthScale, heightScale);

        var imageWidth = Math.round(sourceImageWidth * scale);
        var imageHeight = Math.round(sourceImageHeight * scale);

        collectedStories.push({
            headline: newspaper.data.headline,
            link: newspaper.data.article,
            imageHeight: imageHeight,
            imageWidth: imageWidth,
            imageUrl: newspaper.data.imageUrl,
            timestamp: Date.now()
        });
        console.log('Added story to collected list:', newspaper.data.headline);
        updateStoryList(); // Update the HTML list
    }
}

// Visual feedback for successful drops (handled on canvas)
function showDropFeedback(type, newspaper) {
    let isCorrectDrop = false;
    
    if (type === 'waste') {
        // Waste basket = for FALSE stories
        if (!newspaper.data.isTrue) {
            console.log('Correct drop in waste');
            score++;
            correctDrops++;
            isCorrectDrop = true;
            // Play correct bin sound
            correctBinSound.currentTime = 0;
            correctBinSound.play().catch(e => console.log('Audio play failed:', e));
        } else {
            console.log('Incorrect drop in waste');
            fails++;
            incorrectDrops++;
            // Play wrong sound
            wrongSound.currentTime = 0;
            wrongSound.play().catch(e => console.log('Audio play failed:', e));
            addStoryToCollection(newspaper);
        }
    } else if (type === 'cart') {
        // Cart = for TRUE stories
        if (newspaper.data.isTrue) {
            console.log('Correct drop in cart');
            score++;
            correctDrops++;
            isCorrectDrop = true;
            // Play correct bin sound
            correctBinSound.currentTime = 0;
            correctBinSound.play().catch(e => console.log('Audio play failed:', e));

            addStoryToCollection(newspaper);
        } else {
            console.log('Incorrect drop in cart');
            fails++;
            incorrectDrops++;
            // Play wrong sound
            wrongSound.currentTime = 0;
            wrongSound.play().catch(e => console.log('Audio play failed:', e));
        }
    }
    
    // Check for game over condition
    if (fails >= MAX_FAILS) {
        gamePaused = true;
        showGameOverDialog = true;
        failedNewspaper = null; // Clear failed newspaper reference
        saveHighScore(); // Save high score when game ends
        return;
    }
    
    // If correct drop, show success flash and handle belt/conveyor logic
    if (isCorrectDrop) {
        failedNewspaper = null; // Clear any previous failed newspaper
        showSuccessFlash = true;
        successFlashEndTime = Date.now() + 750; // Show for 750ms

        // Restart conveyor belt if it was paused
        if (beltPaused) {
            beltPaused = false;
            console.log('Restarted conveyor belt after successful drop');
        }

        // Instantly spawn new newspaper if belt is empty
        if (newspapers.length === 0 && gameRunning && !gamePaused && !showIncorrectDialog && !showGameOverDialog) {
            // Reset spawn timer to allow immediate spawning
            lastSpawnTime = 0;
            console.log('Triggering instant newspaper spawn after successful drop');
        }
    }

    // If incorrect, pause game and show dialog
    if (!isCorrectDrop) {
        failedNewspaper = newspaper; // Store the newspaper that was incorrectly dropped
        gamePaused = true;
        showIncorrectDialog = true;
    }
}

// Toggle pause state
function togglePause() {
    gamePaused = !gamePaused;
}

// Update the HTML story list
function updateStoryList() {
    const storyListElement = document.getElementById('story-list');
    if (!storyListElement) return;

    // Clear existing stories
    storyListElement.innerHTML = '';

    if (collectedStories.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'story-item empty';
        emptyMessage.textContent = 'No stories collected yet';
        storyListElement.appendChild(emptyMessage);
        storyListElement.classList.remove('has-more-content');
        return;
    }

    // Add each story
    collectedStories.forEach((story, index) => {
        const storyItem = document.createElement('div');
        storyItem.className = `story-item ${index % 2 === 0 ? 'even' : 'odd'}`;

        const image = document.createElement('img');
        image.className = 'story-image';
        image.src = story.imageUrl;
        image.height = story.imageHeight;
        image.width = story.imageWidth;

        const headline = document.createElement('div');
        headline.className = 'story-headline';
        headline.textContent = story.headline;

        const link = document.createElement('a');
        link.className = 'story-link';
        link.href = story.link;
        link.target =  "_blank";
        link.textContent = story.link;

        storyItem.appendChild(headline);
        storyItem.appendChild(image);
        storyItem.appendChild(link);
        storyListElement.appendChild(storyItem);
    });

    // Check if content overflows and add visual indicator
    setTimeout(() => {
        const containerHeight = storyListElement.parentElement.clientHeight;
        const contentHeight = storyListElement.scrollHeight;
        const hasOverflow = contentHeight > containerHeight;

        if (hasOverflow) {
            storyListElement.classList.add('has-more-content');
        } else {
            storyListElement.classList.remove('has-more-content');
        }
    }, 100); // Small delay to ensure DOM is updated
}

// Reset game state and show start screen
function resetGame() {
    // Reset all game state
    headlineData = Array.from(originalHeadlines);
    newspapers = [];
    wasteCount = 0;
    cartCount = 0;
    correctDrops = 0;
    incorrectDrops = 0;
    score = 0;
    fails = 0;
    gamePaused = false;
    beltPaused = false;
    beltPauseEndTime = 0;
    showIncorrectDialog = false;
    showGameOverDialog = false;
    showSuccessFlash = false;
    successFlashEndTime = 0;
    failedNewspaper = null;
    isDragging = false;
    draggedNewspaper = null;
    lastSpawnTime = 0;
    beltOffset = 0;
    collectedStories = []; // Reset collected stories
    const storyListElement = document.getElementById('story-list');
    if (storyListElement) {
        storyListElement.classList.remove('has-more-content');
    }
    updateStoryList(); // Update the HTML list

    // Show start screen
    showStartScreen = true;
    gameRunning = false;
}

// Handle incorrect drop when newspaper falls off top of canvas
function handleIncorrectDrop(newspaper) {
    // Remove the newspaper from the array
    const index = newspapers.indexOf(newspaper);
    if (index > -1) {
        newspapers.splice(index, 1);
    }

    // Increment failure count and trigger incorrect dialog
    fails++;
    incorrectDrops++;

    // Check for game over condition
    if (fails >= MAX_FAILS) {
        gamePaused = true;
        showGameOverDialog = true;
        failedNewspaper = null; // Clear failed newspaper reference
        saveHighScore(); // Save high score when game ends
        return;
    }

    // Store the newspaper that was incorrectly dropped and show dialog
    failedNewspaper = newspaper;
    gamePaused = true;
    showIncorrectDialog = true;
}

// Move newspaper to expected conveyor belt position when not dropped in valid zone
function moveNewspaperToConveyorPosition(newspaper) {
    // Calculate how far the newspaper should have moved during dragging
    // Only count time when conveyor belt was actually moving
    const currentTime = Date.now();
    let effectiveDragTime = 0;

    // If drag started while belt was moving, calculate effective time
    if (newspaper.dragStartTime > 0) {
        // Check if belt was paused during any part of the drag
        let beltWasMoving = !gamePaused && !beltPaused && !showGameOverDialog;

        if (beltWasMoving) {
            effectiveDragTime = currentTime - newspaper.dragStartTime;
        } else {
            // Belt was paused, so no effective movement time
            effectiveDragTime = 0;
        }
    }

    const distanceToMove = newspaper.speed * (effectiveDragTime / 16.67); // Assuming 60fps, convert ms to frames

    // Calculate conveyor belt center position
    const leftMargin = 200;
    const rightMargin = 200;
    const centerStartX = leftMargin;
    const centerWidth = canvas.width - leftMargin - rightMargin;

    // Center the newspaper horizontally on the conveyor belt
    const newspaperWidth = 300;
    const availableWidth = centerWidth - newspaperWidth;
    const centerX = centerStartX + (availableWidth / 2) + (Math.random() * 40 - 20); // ±20px variation

    // Calculate expected y position (simulate continued movement during drag)
    const expectedY = newspaper.originalY - distanceToMove;

    // Check for overlap with existing newspapers and adjust if necessary
    let attempts = 0;
    const maxAttempts = 10;
    let validPosition = false;
    let finalX = centerX;
    let finalY = expectedY;

    while (attempts < maxAttempts && !validPosition) {
        validPosition = true;
        finalX = centerX + (Math.random() * 40 - 20); // ±20px variation

        for (let i = 0; i < newspapers.length; i++) {
            const existing = newspapers[i];
            if (existing !== newspaper) { // Don't check against self
                // Check for overlap with existing newspapers
                if (!(finalX + newspaperWidth < existing.x ||
                      finalX > existing.x + existing.width ||
                      finalY + newspaper.height < existing.y ||
                      finalY > existing.y + existing.height)) {
                    validPosition = false;
                    break;
                }
            }
        }
        attempts++;
    }

    // Move newspaper to the calculated position
    newspaper.x = finalX;
    newspaper.y = finalY;

    console.log(`Moved newspaper to expected conveyor position: (${newspaper.x}, ${newspaper.y}), effective drag time: ${effectiveDragTime}ms, distance: ${distanceToMove}px`);
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        // Only allow pause/unpause if no dialogs are showing
        if (!showIncorrectDialog && !showGameOverDialog) {
            togglePause();
        }
    } else if (e.key === 'M' || e.key === 'm') {
        e.preventDefault();
        toggleBackgroundMusic();
    }
});

// Spawn newspapers
function spawnNewspaper() {
    // Use the same calculations as drawConveyorBelt for consistency
    const leftMargin = 200;
    const rightMargin = 200;
    const centerStartX = leftMargin;
    const centerWidth = canvas.width - leftMargin - rightMargin;

    // Center newspapers on the conveyor belt
    const newspaperWidth = 300;
    const newspaperHeight = 300; // Match the actual newspaper height
    const availableWidth = centerWidth - newspaperWidth;

    // Select random headline from loaded data
    if (headlineData.length === 0) {
        console.error('No headline data available');
        return;
    }

    const randomIndex = Math.floor(Math.random() * headlineData.length);
    const selectedHeadlineData = headlineData.splice(randomIndex, 1)[0];

    // Try multiple positions to avoid overlap
    const maxAttempts = 10;
    let attempts = 0;
    let validPosition = false;
    let x;

    while (attempts < maxAttempts && !validPosition) {
        // Generate random position centered on conveyor belt
        x = centerStartX + (availableWidth / 2) + (Math.random() * 40 - 20); // ±20px variation

        // Check if this position overlaps with any existing newspaper
        validPosition = true;
        for (let i = 0; i < newspapers.length; i++) {
            const existing = newspapers[i];
            // Check for overlap with existing newspapers
            if (!(x + newspaperWidth < existing.x ||
                  x > existing.x + existing.width ||
                  canvas.height + newspaperHeight < existing.y ||
                  canvas.height > existing.y + existing.height)) {
                validPosition = false;
                break;
            }
        }
        attempts++;
    }

    // Only spawn if we found a valid position
    if (validPosition) {
        const newspaper = new Newspaper(selectedHeadlineData, x, canvas.height); // Start fully visible
        newspapers.push(newspaper);
        // Belt pause will be triggered automatically when newspaper reaches good viewing position
    }
}

// Draw conveyor belt background
function drawConveyorBelt() {
    // Conveyor belt background (center portion only, leaving room for factory floor areas)
    // Ensure full conveyor belt is visible within canvas bounds
    const leftMargin = 200; // Further reduced to ensure conveyor is fully visible
    const rightMargin = 200; // Further reduced to ensure conveyor is fully visible
    const centerStartX = leftMargin;
    const centerWidth = canvas.width - leftMargin - rightMargin;

    // Draw conveyor background image (3-part split animation)
    const conveyorImg = images['assets/images/conveyor.png'] || new Image();
    if (conveyorImg.complete || images['conveyor.png']) {
        const imgWidth = conveyorImg.width;
        const imgHeight = conveyorImg.height;

        // Split conveyor into 3 parts: left rail, center belt, right rail
        const centerSectionWidth = centerWidth; // Center belt width

        // Calculate positions
        const centerSectionX = centerStartX;
        
        // Draw animated center belt
        const repeatCount = Math.ceil(canvas.height / imgHeight) + 1;
        for (let i = 0; i < repeatCount; i++) {
            const y = (i * imgHeight) - (beltOffset % imgHeight);
            ctx.drawImage(conveyorImg, centerSectionX, y, centerSectionWidth, imgHeight);
        }
    } else {
        // Fallback to solid color if image not loaded
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(centerStartX, 0, centerWidth, canvas.height);

        // Conveyor belt tracks
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 4;

        // Left track
        ctx.beginPath();
        ctx.moveTo(centerStartX + 20, 0);
        ctx.lineTo(centerStartX + 20, canvas.height);
        ctx.stroke();

        // Right track
        ctx.beginPath();
        ctx.moveTo(centerStartX + centerWidth - 20, 0);
        ctx.lineTo(centerStartX + centerWidth - 20, canvas.height);
        ctx.stroke();

        // Conveyor belt segments (animated)
        ctx.fillStyle = '#A0522D';
        for (let y = -beltOffset; y < canvas.height; y += 40) {
            ctx.fillRect(centerStartX + 20, y, centerWidth - 40, 30);
        }
    }
}


// Check if newspaper is hovering over drop zones
function checkHoverOverlay() {
    if (isDragging && draggedNewspaper) {
        const wasteArea = { x: 0, y: 0, width: 200, height: canvas.height };
        const cartArea = { x: canvas.width - 200, y: 0, width: 200, height: canvas.height };

        // Check if newspaper overlaps with waste area
        if (draggedNewspaper.x < wasteArea.x + wasteArea.width &&
            draggedNewspaper.x + draggedNewspaper.width > wasteArea.x &&
            draggedNewspaper.y < wasteArea.y + wasteArea.height &&
            draggedNewspaper.y + draggedNewspaper.height > wasteArea.y) {

            // Draw slight black overlay on waste area
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Very transparent black
            ctx.fillRect(wasteArea.x, wasteArea.y, wasteArea.width, wasteArea.height);
        }

        // Check if newspaper overlaps with cart area
        if (draggedNewspaper.x < cartArea.x + cartArea.width &&
            draggedNewspaper.x + draggedNewspaper.width > cartArea.x &&
            draggedNewspaper.y < cartArea.y + cartArea.height &&
            draggedNewspaper.y + draggedNewspaper.height > cartArea.y) {

            // Draw slight black overlay on cart area
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Very transparent black
            ctx.fillRect(cartArea.x, cartArea.y, cartArea.width, cartArea.height);
        }
    }
}

// Draw start screen
function drawStartScreen() {
    // Clear canvas with background
    ctx.fillStyle = '#f0e0be';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw conveyor belt background (but dimmed since it's not active)
    ctx.save();
    ctx.globalAlpha = 0.3;
    drawConveyorBelt();
    ctx.restore();

    // Draw factory floor elements (dimmed)
    ctx.save();
    ctx.globalAlpha = 0.3;
    drawUI();
    ctx.restore();

    // Instructions
    ctx.fillStyle = 'black';
    ctx.font = 'bold 24px Old Standard TT';
    ctx.fillText('How to Play:', canvas.width / 2, 190);

    ctx.font = '18px Old Standard TT';
    ctx.fillText('• Drag newspapers LEFT to trash fake news', canvas.width / 2, 220);
    ctx.fillText('• Drag newspapers RIGHT to save real news', canvas.width / 2, 250);
    ctx.fillText('• Don\'t let newspapers fall off the top!', canvas.width / 2, 280);

    // Controls
    ctx.font = 'bold 20px Old Standard TT';
    ctx.fillText('Controls:', canvas.width / 2, 330);

    ctx.font = '16px Old Standard TT';
    ctx.fillText('SPACE to pause • M to mute music', canvas.width / 2, 360);

    // Start button
    const buttonWidth = 300;
    const buttonHeight = 100;
    const buttonX = canvas.width / 2 - buttonWidth / 2;
    const buttonY = canvas.height - 375;

    // Check if mouse is over button for hover effect
    const isHoveringStart = mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
                           mouseY >= buttonY && mouseY <= buttonY + buttonHeight;

    // Button background
    ctx.beginPath();
    ctx.fillStyle = isHoveringStart ? 'black' : '#f0e0be';
    ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 15);
    ctx.fill();
    ctx.stroke();

    // Button text
    ctx.fillStyle = isHoveringStart ? "#f0e0be" : 'black';
    ctx.font = 'bold 38px Old Standard TT';
    ctx.fillText('START GAME', canvas.width / 2, buttonY + 60);

    // Footer
    ctx.fillStyle = '#000000';
    ctx.font = '14px Old Standard TT';
    ctx.fillText('Created by Josh Yguado and Matthew Fedynyshyn at the WikiGameJam 2025', canvas.width / 2, canvas.height - 30);
}

// Game loop
function gameLoop() {
    if (!gameRunning && !showStartScreen) return;

    // Show loading dialog if images are not loaded yet
    if (!imagesLoaded) {
        // Draw loading dialog (matches newspaper style)
        const dialogWidth = 500;
        const dialogHeight = 250;
        const dialogX = (canvas.width - dialogWidth) / 2;
        const dialogY = (canvas.height - dialogHeight) / 2;

        ctx.fillStyle = '#f0e0be';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dialog background (beige/tan like newspaper)
        ctx.fillStyle = '#f0e0be';
        ctx.fillRect(dialogX, dialogY, dialogWidth, dialogHeight);

        // Dialog border (dark like newspaper)
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 6;
        ctx.strokeRect(dialogX, dialogY, dialogWidth, dialogHeight);

        // Inner border
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 2;
        ctx.strokeRect(dialogX + 10, dialogY + 10, dialogWidth - 20, dialogHeight - 20);

        // Loading title
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 36px Old Standard TT';
        ctx.textAlign = 'center';
        ctx.fillText('Loading Assets', canvas.width / 2, dialogY + 60);

        // Loading message
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 20px Old Standard TT';
        ctx.fillText('Please wait while game assets load...', canvas.width / 2, dialogY + 100);

        // Progress indicator (simple animated dots)
        const dotPattern = ['●', '●●', '●●●'];
        const currentTime = Date.now();
        const dotIndex = Math.floor((currentTime / 500) % dotPattern.length);
        ctx.font = 'bold 32px Arial';
        ctx.fillText(dotPattern[dotIndex], canvas.width / 2, dialogY + 150);

        // Instructions
        ctx.fillStyle = '#000000';
        ctx.font = '14px Old Standard TT';
        ctx.fillText('Game will start automatically when ready', canvas.width / 2, dialogY + dialogHeight - 30);

        requestAnimationFrame(gameLoop);
        return;
    }

    // Show start screen if assets are loaded but game hasn't started yet
    if (showStartScreen && imagesLoaded) {
        drawStartScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Check if success flash should be turned off
    if (showSuccessFlash && Date.now() >= successFlashEndTime) {
        showSuccessFlash = false;
    }

    // Check if belt pause has ended
    if (beltPaused && Date.now() >= beltPauseEndTime) {
        beltPaused = false;
    }

    // Animate conveyor belt when game is running and not paused (either game paused or belt paused)
    const isBeltMoving = gameRunning && !gamePaused && !beltPaused && !showGameOverDialog;
    
    if (isBeltMoving) {
        beltOffset += gameSpeed; // Use configurable game speed
        // Reset based on conveyor image height to maintain sync with newspaper movement
        const conveyorImg = images['assets/images/conveyor.png'] || new Image();
        if (conveyorImg.complete || images['conveyor.png']) {
            if (beltOffset >= conveyorImg.height) beltOffset = 0;
        } else {
            // Fallback to fixed reset if image not loaded
            if (beltOffset >= 40) beltOffset = 0;
        }
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw conveyor belt
    drawConveyorBelt();

    // Draw factory floor and equipment first
    drawUI();

    // Check and draw hover overlay for dragged newspapers
    checkHoverOverlay();

    // Draw non-dragged newspapers (appear above floor but below equipment)
    newspapers.forEach(newspaper => {
        if (!newspaper.beingDragged) {
            newspaper.update();
            newspaper.draw();
        }
    });

    // Draw dragged newspaper last (appears above everything)
    newspapers.forEach(newspaper => {
        if (newspaper.beingDragged) {
            newspaper.update();
            newspaper.draw();
        }
    });

    // Draw success dialog (minimal design)
    if (showSuccessFlash && !showIncorrectDialog && !showGameOverDialog) {
        // Small dialog box sized for content
        const imgSize = 80;
        const textHeight = 40; // Approximate height for "SUCCESS!" text
        const padding = 40;
        const dialogWidth = imgSize + (padding * 2);
        const dialogHeight = imgSize + textHeight + (padding * 2);
        const dialogX = (canvas.width - dialogWidth) / 2;
        const dialogY = (canvas.height - dialogHeight) / 2;

        // Dialog background (beige/tan like newspaper)
        ctx.fillStyle = '#f0e0be';
        ctx.fillRect(dialogX, dialogY, dialogWidth, dialogHeight);

        // Dialog border (dark like newspaper)
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 3;
        ctx.strokeRect(dialogX, dialogY, dialogWidth, dialogHeight);

        // Success image
        const successImg = images['assets/images/success.png'] || new Image();
        if (successImg.complete || images['assets/images/success.png']) {
            const imgX = dialogX + (dialogWidth - imgSize) / 2;
            const imgY = dialogY + padding;
            ctx.drawImage(successImg, imgX, imgY, imgSize, imgSize);
        }

        // "Success!" title
        ctx.fillStyle = "#000000";
        ctx.font = 'bold 24px Old Standard TT';
        ctx.textAlign = 'center';
        ctx.fillText('SUCCESS!', canvas.width / 2, dialogY + imgSize + padding + 30);
    }

    // Draw pause screen on top of everything when paused
    if (gamePaused && !showIncorrectDialog) {
        // Full opaque overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Pause menu in center (matches newspaper style)
        const menuWidth = 600;
        const menuHeight = 200;
        const menuX = (canvas.width - menuWidth) / 2;
        const menuY = (canvas.height - menuHeight) / 2;

        // Menu background (beige/tan like newspaper)
        ctx.fillStyle = '#f0e0be';
        ctx.fillRect(menuX, menuY, menuWidth, menuHeight);

        // Menu border (dark like newspaper)
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 6;
        ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

        // Inner border
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 2;
        ctx.strokeRect(menuX + 10, menuY + 10, menuWidth - 20, menuHeight - 20);

        // Pause title
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 32px Old Standard TT';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', menuX + menuWidth / 2, menuY + 50);

        // Instructions
        ctx.font = '18px Old Standard TT';
        ctx.fillText('Press SPACE to resume • M to mute music', menuX + menuWidth / 2, menuY + 90);
        ctx.fillText('SPACE to pause • Drag LEFT for FAKE • Drag RIGHT for FACT', menuX + menuWidth / 2, menuY + 120);
    }
    
    // Draw game over dialog (matches newspaper style)
    if (showGameOverDialog) {
        // Full opaque overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dialog box (matches newspaper style)
        const dialogWidth = 550;
        const dialogHeight = 300;
        const dialogX = (canvas.width - dialogWidth) / 2;
        const dialogY = (canvas.height - dialogHeight) / 2;

        // Dialog background (beige/tan like newspaper)
        ctx.fillStyle = '#f0e0be';
        ctx.fillRect(dialogX, dialogY, dialogWidth, dialogHeight);

        // Dialog border (dark like newspaper)
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 6;
        ctx.strokeRect(dialogX, dialogY, dialogWidth, dialogHeight);

        // Inner border
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 2;
        ctx.strokeRect(dialogX + 10, dialogY + 10, dialogWidth - 20, dialogHeight - 20);

        // Title
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 48px Old Standard TT';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, dialogY + 70);

        // Stats
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 24px Old Standard TT';
        if (setNewHighScore) {
            ctx.fillText(`New High Score!`, canvas.width / 2, dialogY + 120);
        }
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, dialogY + 150);
        ctx.fillText(`High Score: ${highScore}`, canvas.width / 2, dialogY + 180);

        // Play Again Button (matches newspaper style)
        const buttonX = canvas.width / 2 - 100;
        const buttonY = dialogY + dialogHeight - 80;
        const buttonWidth = 200;
        const buttonHeight = 60;

        // Check if mouse is over button for hover effect (using the same calculation as interaction handlers)
        const isHoveringOK = mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
                            mouseY >= buttonY && mouseY <= buttonY + buttonHeight;

        // Button background with rounded edges
        ctx.beginPath();
        ctx.fillStyle = isHoveringOK ? 'black' : '#f0e0be';
        ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 12);
        ctx.fill();

        // Button border
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Button text
        ctx.fillStyle = isHoveringOK ? '#f0e0be' : 'black';
        ctx.font = 'bold 24px Old Standard TT';
        ctx.fillText('PLAY AGAIN', canvas.width / 2, buttonY + 38);
    }
    
    // Draw incorrect drop dialog
    if (showIncorrectDialog && !showGameOverDialog) {
        // Full opaque overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dialog box (matches the newspaper design from the image)
        const dialogWidth = 600;
        const dialogHeight = 400;
        const dialogX = (canvas.width - dialogWidth) / 2;
        const dialogY = (canvas.height - dialogHeight) / 2;

        // Dialog background (beige/tan like newspaper)
        ctx.fillStyle = '#f0e0be'; // Beige background
        ctx.fillRect(dialogX, dialogY, dialogWidth, dialogHeight);

        // Dialog border (dark brown/black like newspaper border)
        ctx.strokeStyle = '#2c3e50'; // Dark blue-gray border
        ctx.lineWidth = 6;
        ctx.strokeRect(dialogX, dialogY, dialogWidth, dialogHeight);

        // Inner border (like newspaper frame)
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 2;
        ctx.strokeRect(dialogX + 10, dialogY + 10, dialogWidth - 20, dialogHeight - 20);

        // Title "INCORRECT!" (matches the image)
        ctx.fillStyle = '#000000'; // Dark color for title
        ctx.font = 'bold 48px Old Standard TT'; // Use old english font like newspaper
        ctx.textAlign = 'center';
        if (failedNewspaper.y < -failedNewspaper.height) {
            ctx.fillText('Not fast enough!', canvas.width / 2, dialogY + 70);
        } else {
            ctx.fillText('INCORRECT!', canvas.width / 2, dialogY + 70);
        }

        // Three fail icons in a row (matches the XXX in the image)
        const failIconSize = 100; // Smaller size to prevent overlap
        const totalFailWidth = (failIconSize * 3) + (8 * 2); // 3 icons + 2 spaces
        const failStartX = (canvas.width - totalFailWidth) / 2;
        const failY = dialogY + 100; // Moved up to prevent text overlap

        for (let i = 0; i < 3; i++) {
            const x = failStartX + (i * (failIconSize + 8));
            if (i < fails) {
                // Draw normal (used) fail icon
                ctx.drawImage(images['assets/images/fail.png'], x, failY, failIconSize, failIconSize);
            } else {
                // Draw grayscaled (remaining) fail icon
                ctx.globalAlpha = 0.3;
                ctx.drawImage(images['assets/images/fail.png'], x, failY, failIconSize, failIconSize);
                ctx.globalAlpha = 1.0;
            }
        }

        // Story type text (matches the image)
        ctx.fillStyle = '#000000'; // Dark color
        ctx.font = 'bold 28px Old Standard TT';
        if (failedNewspaper && failedNewspaper.data) {
            // Check if newspaper fell off the top (y position indicates this)
            const storyType = failedNewspaper.data.isTrue ? 'True story!' : 'Fake story!';
            ctx.fillText(storyType, canvas.width / 2, dialogY + 240);
        } else {
            ctx.fillText('That story was sorted incorrectly.', canvas.width / 2, dialogY + 240);
        }

        // Article link (only for true stories)
        if (failedNewspaper && failedNewspaper.data && failedNewspaper.data.isTrue && failedNewspaper.data.article) {
            ctx.font = '18px Old Standard TT';
            ctx.fillText("Read more about this story on Wikipedia", canvas.width / 2, dialogY + 270);

            // Wikipedia link button
            const linkText = failedNewspaper.data.article;
            const linkTextWidth = ctx.measureText(linkText).width;
            const linkButtonWidth = Math.max(linkTextWidth + 20, 200); // Minimum width
            const linkButtonHeight = 35;
            const linkButtonX = canvas.width / 2 - linkButtonWidth / 2;
            const linkButtonY = dialogY + 285;

            // Store coordinates for click/hover detection
            articleLinkX = linkButtonX;
            articleLinkY = linkButtonY;
            articleLinkWidth = linkButtonWidth;
            articleLinkHeight = linkButtonHeight;

            // Button background with rounded edges
            ctx.beginPath();
            ctx.fillStyle = articleLinkHovered ? 'black' : '#f0e0be';
            ctx.roundRect(linkButtonX, linkButtonY, linkButtonWidth, linkButtonHeight, 8);
            ctx.fill();

            // Button border
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Button text
            ctx.fillStyle = articleLinkHovered ? '#f0e0be' : 'black';
            ctx.font = '16px Old Standard TT';
            ctx.fillText(linkText, canvas.width / 2, linkButtonY + 22);
        }

        // "Click anywhere to continue" instruction
        ctx.fillStyle = '#000000'; // Gray color for instruction
        ctx.font = '14px Old Standard TT';
        ctx.fillText('Click anywhere to continue', canvas.width / 2, dialogY + dialogHeight - 40);

    }

    // Spawn new newspapers (only when game is running, not paused and no dialogs are showing)
    if (gameRunning && !gamePaused && !showIncorrectDialog && !showGameOverDialog) {
        const currentTime = Date.now();

        // Spawn newspaper if enough time has passed OR if belt is empty (for instant spawning)
        const timeSinceLastSpawn = currentTime - lastSpawnTime;
        const shouldSpawnByTime = timeSinceLastSpawn > spawnInterval;
        const shouldSpawnByEmpty = newspapers.length === 0 && timeSinceLastSpawn > 500; // Minimum 500ms delay for instant spawning

        if (shouldSpawnByTime || shouldSpawnByEmpty) {
            spawnNewspaper();
            lastSpawnTime = currentTime;

            // Gradually increase difficulty only for time-based spawns
            if (shouldSpawnByTime && spawnInterval > 1000) {
                spawnInterval -= 50;
            }

            console.log(`Spawned newspaper - Time: ${shouldSpawnByTime}, Empty: ${shouldSpawnByEmpty}, Interval: ${spawnInterval}ms`);
        }
    }

    drawScore();

    requestAnimationFrame(gameLoop);
}

// Draw factory floor and equipment
function drawFactoryFloor() {
    // Draw left drop zone background
    const leftImg = images['assets/images/left.jpg'] || new Image();
    if (leftImg.complete || images['assets/images/left.jpg']) {
        ctx.drawImage(leftImg, 0, 0, 200, canvas.height);
    } else {
        // Fallback tile pattern for left side
        drawFloorTiles(0, 200);
    }

    // Draw right drop zone background
    const rightImg = images['assets/images/right.jpg'] || new Image();
    if (rightImg.complete || images['assets/images/right.jpg']) {
        ctx.drawImage(rightImg, canvas.width - 200, 0, 200, canvas.height);
    } else {
        // Fallback tile pattern for right side
        drawFloorTiles(canvas.width - 200, canvas.width);
    }

    // Draw center area (conveyor belt area) - no background needed as conveyor handles it
}

// Helper function for fallback tile pattern
function drawFloorTiles(startX, endX) {
    const tileSize = 40;
    for (let x = startX; x < endX; x += tileSize) {
        for (let y = 0; y < canvas.height; y += tileSize) {
            // Alternate between two shades of gray for checkerboard pattern
            const isDark = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0;
            ctx.fillStyle = isDark ? '#e8e8e8' : '#f5f5f5';
            ctx.fillRect(x, y, tileSize, tileSize);

            // Draw tile borders
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tileSize, tileSize);
        }
    }
}

// Draw waste basket
function drawWasteBasket() {
    const basketX = 25; // Center in 200px factory floor area ((200-100)/2 = 50)
    const basketY = canvas.height - 250; // Move to bottom center of drop zone
    const basketWidth = 150;
    const basketHeight = 225;

    // Draw trash bin image
    const trashBinImg = new Image();
    trashBinImg.onload = function() {
        ctx.drawImage(trashBinImg, basketX, basketY, basketWidth, basketHeight);
    };
    trashBinImg.src = 'assets/images/trash-bin.png';

    // Fallback if image doesn't load
    if (trashBinImg.complete) {
        ctx.drawImage(trashBinImg, basketX, basketY, basketWidth, basketHeight);
    } else {
        // Fallback drawing (in case image fails to load)
        ctx.fillStyle = '#95a5a6'; // Gray metal
        ctx.fillRect(basketX, basketY, basketWidth, basketHeight);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeRect(basketX, basketY, basketWidth, basketHeight);
    }

    // Draw fake.jpg label in trash drop zone
    const fakeImg = images['assets/images/fake.jpg'] || new Image();
    if (fakeImg.complete || images['assets/images/fake.jpg']) {
        // Maintain aspect ratio - calculate size based on image dimensions
        const maxSize = 160;
        const aspectRatio = fakeImg.width / fakeImg.height;
        let fakeWidth, fakeHeight;

        if (aspectRatio > 1) {
            // Landscape image
            fakeWidth = maxSize;
            fakeHeight = maxSize / aspectRatio;
        } else {
            // Portrait or square image
            fakeHeight = maxSize;
            fakeWidth = maxSize * aspectRatio;
        }

        const fakeX = 20; // Position in left drop zone
        const fakeY = 200;
        ctx.drawImage(fakeImg, fakeX, fakeY, fakeWidth, fakeHeight);
    }
}

// Draw newspaper library cart
function drawNewspaperCart() {
    const cartX = canvas.width - 175; // Center in 200px factory floor area ((200-100)/2 = 50 from right, so canvas.width - 50 - 100/2)
    const cartY = canvas.height - 250; // Move to bottom center of drop zone
    const cartWidth = 150;
    const cartHeight = 225;

    // Draw news bin image
    const newsBinImg = new Image();
    newsBinImg.onload = function() {
        ctx.drawImage(newsBinImg, cartX, cartY, cartWidth, cartHeight);
    };
    newsBinImg.src = 'assets/images/news-bin.png';

    // Fallback if image doesn't load
    if (newsBinImg.complete) {
        ctx.drawImage(newsBinImg, cartX, cartY, cartWidth, cartHeight);
    } else {
        // Fallback drawing (in case image fails to load)
        ctx.strokeStyle = '#8b4513'; // Brown wood/metal
        ctx.lineWidth = 4;
        ctx.strokeRect(cartX, cartY, cartWidth, cartHeight);

        ctx.fillStyle = '#d2b48c';
        ctx.fillRect(cartX, cartY + cartHeight - 20, cartWidth, 20);
    }

    // Draw fact.jpg label in cart drop zone
    const factImg = images['assets/images/fact.jpg'] || new Image();
    if (factImg.complete || images['assets/images/fact.jpg']) {
        // Maintain aspect ratio - calculate size based on image dimensions
        const maxSize = 160;
        const aspectRatio = factImg.width / factImg.height;
        let factWidth, factHeight;

        if (aspectRatio > 1) {
            // Landscape image
            factWidth = maxSize;
            factHeight = maxSize / aspectRatio;
        } else {
            // Portrait or square image
            factHeight = maxSize;
            factWidth = maxSize * aspectRatio;
        }

        const factX = canvas.width - 180; // Position in right drop zone
        const factY = 200; // Upper half of right side
        ctx.drawImage(factImg, factX, factY, factWidth, factHeight);
    }
}


// Draw UI elements
function drawUI() {
    // Draw factory floor background
    drawFactoryFloor();

    // Draw equipment
    drawWasteBasket();
    drawNewspaperCart();
}

function drawScore() {
    // Draw fail counter (top left) - show remaining lives using fail.png images
    const failIconSize = 30;
    const startX = 10;
    const startY = 10;

    for (let i = 0; i < MAX_FAILS; i++) {
        const x = startX + (i * (failIconSize + 5));
        const y = startY;

        if (i < fails) {
            // Draw normal (used) fail icon
            ctx.drawImage(images['assets/images/fail.png'] || new Image(), x, y, failIconSize, failIconSize);
        } else {
            // Draw grayed out (remaining) fail icon
            ctx.globalAlpha = 0.3;
            ctx.drawImage(images['assets/images/fail.png'] || new Image(), x, y, failIconSize, failIconSize);
            ctx.globalAlpha = 1.0;
        }
    }

    // Draw current score (top center)
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.font = 'bold 18px Old Standard TT';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0e0be';
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    ctx.lineWidth = 2;

    // Background box for current score
    const scoreText = `Score: ${score}`;
    const scoreTextWidth = ctx.measureText(scoreText).width;
    const scoreBoxWidth = scoreTextWidth + 20;
    const scoreBoxHeight = 30;
    const scoreBoxX = (canvas.width - scoreBoxWidth) / 2;
    const scoreBoxY = 10;

    ctx.fillRect(scoreBoxX, scoreBoxY, scoreBoxWidth, scoreBoxHeight);
    ctx.strokeRect(scoreBoxX, scoreBoxY, scoreBoxWidth, scoreBoxHeight);
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillText(scoreText, canvas.width / 2, 30);

    // Draw high score (top right)
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.font = 'bold 18px Old Standard TT';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0e0be';
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    ctx.lineWidth = 2;

    // Background box for high score
    const highScoreText = `High Score: ${highScore}`;
    const textWidth = ctx.measureText(highScoreText).width;
    const boxWidth = textWidth + 20;
    const boxHeight = 30;
    const boxX = canvas.width - boxWidth - 25;
    const boxY = 10;

    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillText(highScoreText, boxX + boxWidth / 2, 30);
}

// Preload images for better performance (in batches of 5)
async function preloadImages() {
    const imageUrls = new Set();

    // Collect all unique image URLs from headline data
    if (headlineData && headlineData.length > 0) {
        headlineData.forEach(headline => {
            if (headline.imageUrl) {
                imageUrls.add(headline.imageUrl);
            }
        });
    }

    // Also add the newspaper background image and UI images
    imageUrls.add('assets/images/newspaper.png');
    imageUrls.add('assets/images/fail.png');
    imageUrls.add('assets/images/success.png');
    imageUrls.add('assets/images/fake.jpg');
    imageUrls.add('assets/images/fact.jpg');
    imageUrls.add('assets/images/conveyor.png');
    imageUrls.add('assets/images/left.jpg');
    imageUrls.add('assets/images/right.jpg');

    const urlsArray = Array.from(imageUrls);
    const batchSize = 5;
    const totalBatches = Math.ceil(urlsArray.length / batchSize);

    console.log(`Preloading ${urlsArray.length} images in ${totalBatches} batches of ${batchSize}`);

    // Load images in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, urlsArray.length);
        const currentBatch = urlsArray.slice(startIndex, endIndex);

        console.log(`Loading batch ${batchIndex + 1}/${totalBatches} (${currentBatch.length} images)`);

        const loadPromises = [];

        for (const url of currentBatch) {
            const loadPromise = new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    images[url] = img;
                    console.log(`✓ Loaded: ${url}`);
                    resolve();
                };
                img.onerror = () => {
                    console.error(`✗ Failed: ${url}`);
                    reject();
                };
                img.src = url;
            });
            loadPromises.push(loadPromise);
        }

        try {
            await Promise.all(loadPromises);
            console.log(`✓ Completed batch ${batchIndex + 1}/${totalBatches}`);
        } catch (error) {
            console.error(`✗ Batch ${batchIndex + 1} failed:`, error);
            // Continue with next batch even if some images fail
        }

        // Small delay between batches to prevent overwhelming the browser
        if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    imagesLoaded = true;
    const loadedCount = Object.keys(images).length;
    const totalCount = urlsArray.length;
    console.log(`Preloading complete: ${loadedCount}/${totalCount} images loaded successfully`);
    console.log('All images loaded - starting game');
}

// Load headline data from JSON file
async function loadHeadlineData() {
    try {
        const response = await fetch('assets/data/data3.json');
        const data = await response.json();
        originalHeadlines = shuffleArray(data.headlines);
        headlineData = Array.from(originalHeadlines);
        console.log(`Loaded ${headlineData.length} headlines from data.json`);

        // Preload images after loading data
        await preloadImages();
    } catch (error) {
        console.error('Failed to load headline data:', error);
        // Fallback to hardcoded headlines if JSON fails to load
        headlineData = getFallbackHeadlines();
        // Still try to preload images for fallback data
        await preloadImages();
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      // Generate a random index between 0 and i (inclusive)
      const j = Math.floor(Math.random() * (i + 1));
  
      // Swap elements at index i and j
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

// Fallback headlines in case JSON loading fails
function getFallbackHeadlines() {
    return [
        {
            "isTrue": true,
            "headline": "Breaking: Major Discovery Changes Everything!",
            "year": "2024",
            "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/7/70/BostonMolassesDisaster.jpg",
            "articleUrl": "Scientific Breakthrough"
        },
        {
            "isTrue": true,
            "headline": "Local Hero Saves the Day in Dramatic Rescue",
            "year": "2024",
            "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/7/70/BostonMolassesDisaster.jpg",
            "articleUrl": "Heroic Rescue"
        },
        {
            "isTrue": true,
            "headline": "Stock Market Plummets as Economy Faces Crisis",
            "year": "2024",
            "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/7/70/BostonMolassesDisaster.jpg",
            "articleUrl": "Economic Crisis"
        }
    ];
}

// Initialize game
async function init() {
    // Set canvas size
    canvas.width = 900;
    canvas.height = 800;

    // Load high score from localStorage
    loadHighScore();

    // Start game loop immediately to show loading dialog
    gameLoop();

    // Load headline data and wait for all images to load in background
    await loadHeadlineData();

    // Images are now loaded - game will continue automatically
}

// Start the game when page loads
window.addEventListener('load', init);
