const pngToIco = require('png-to-ico').default || require('png-to-ico');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'public', 'tray.png');
const tempPath = path.join(__dirname, 'public', 'temp-icon.png');
const outputPath = path.join(__dirname, 'public', 'icon.ico');

// First resize to 256x256 square
sharp(inputPath)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(tempPath)
    .then(() => {
        // Then convert to ICO
        return pngToIco(tempPath);
    })
    .then(buf => {
        fs.writeFileSync(outputPath, buf);
        // Clean up temp file
        fs.unlinkSync(tempPath);
        console.log('✓ Successfully converted tray.png to icon.ico');
        console.log(`✓ Icon saved to: ${outputPath}`);
    })
    .catch(err => {
        console.error('Error converting icon:', err);
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        process.exit(1);
    });
