const fs = require('fs');
const path = require('path');

// A simple 16x16 green square PNG base64
const base64Icon = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjAuMjHxIGmVAAAAMklEQVQ4T2NkwA7+M2wmA/5D2QxQwYgmjT6YIQv4D2UzQAWjmjT6YIQsGA1D6IYh7AwA+x4x66FrUtQAAAAASUVORK5CYII=';

const buffer = Buffer.from(base64Icon, 'base64');
const outputPath = path.join(__dirname, 'public', 'tray.png');

fs.writeFileSync(outputPath, buffer);
console.log('Tray icon created at:', outputPath);
