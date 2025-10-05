# Newspaper Conveyor Belt Game

A fun interactive web game where you sort newspapers on a conveyor belt!

## How to Play

1. **Objective**: Drag newspaper front pages from the conveyor belt to either the waste basket (left) or shopping cart (right).

2. **Controls**:
   - **Spacebar** to pause/unpause the game
   - **Click and drag** newspaper front pages on the conveyor belt
   - **Drag left** to throw newspapers in the waste basket (trash)
   - **Drag right** to add newspapers to your cart (keep)

3. **Gameplay**:
   - Newspapers continuously move up the conveyor belt
   - New newspapers spawn automatically
   - The game gets faster as you progress
   - Try to sort as many newspapers as possible!

## Features

- ✨ Animated conveyor belt with realistic newspaper movement
- 📰 Stock newspaper images with injectable headlines (now active!)
- 🎨 Colorful newspaper designs with random headlines (fallback system)
- 🎯 Visual feedback for successful drops
- 📊 Score counters for waste basket and cart
- ⏸️ Pause functionality (press SPACE to pause/unpause)
- 🏭 Factory floor environment with detailed equipment
- 📱 Responsive design that works on mobile devices
- ⚡ Increasing difficulty for continuous challenge
- ⚙️ Configurable game speed (adjust `gameSpeed` variable in code)

## Files

- `index.html` - Main game structure
- `styles.css` - Game styling and animations
- `game.js` - Game logic and interactivity

## Running the Game

1. Open a terminal in the project directory
2. Run: `python3 -m http.server 8000`
3. Open your browser and go to: `http://localhost:8000`

Enjoy the game! 🗞️🛒

## Adding Real Newspaper Images

To use actual newspaper stock images instead of colored rectangles:

1. **Add Image Assets**: Place newspaper image files (PNG/JPG) in an `images/` directory
2. **Enable Image Mode**: In `game.js`, modify the `loadNewspaperImage()` method:
   ```javascript
   loadNewspaperImage() {
       this.image = new Image();
       this.image.onload = () => {
           this.imageLoaded = true;
       };
       // Use different images for variety
       const imageFiles = ['newspaper1.png', 'newspaper2.png', 'newspaper3.png'];
       const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
       this.image.src = `images/${randomImage}`;
   }
   ```
3. **Customize Headlines**: The system already supports dynamic headlines overlaid on images
4. **Image Sizing**: Ensure images are approximately 150x100px for best results

The current implementation includes a complete framework for image-based newspapers with fallback to the original colored rectangle system.
