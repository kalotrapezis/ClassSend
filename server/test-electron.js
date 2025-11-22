try {
    const electron = require('electron');
    console.log('Electron require result:', electron);
    console.log('Type of electron:', typeof electron);
    console.log('Is app present?', !!electron.app);
    console.log('Process versions:', process.versions);
} catch (e) {
    console.error('Error requiring electron:', e);
}
